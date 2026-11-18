import type { Metrics } from '@helpdesk/contracts';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { redis } from '../lib/redis.js';

const cacheTtlSeconds = 30;
const cacheKey = (organizationId: string) => `helpdesk:metrics:${organizationId}`;

type SummaryRow = Record<string, string | number | null>;
type VolumeRow = { day: string; created: string | number; resolved: string | number };
type AgentRow = { id: string; name: string; assigned: string | number; resolved: string | number };

const toNumber = (value: string | number | null | undefined) => Number(value ?? 0);
const toRounded = (value: string | number | null | undefined) =>
  value === null || value === undefined ? null : Math.round(Number(value) * 10) / 10;

async function compute(organizationId: string): Promise<Metrics> {
  const summary = (await db.execute(sql`
    select
      count(*) filter (where status = 'open') as open,
      count(*) filter (where status = 'pending') as pending,
      count(*) filter (where resolved_at >= date_trunc('day', now())) as closed_today,
      count(*) filter (where sla_breached_at is not null and status <> 'closed') as breached,
      percentile_cont(0.5) within group (
        order by extract(epoch from (first_response_at - created_at)) / 60
      ) filter (where first_response_at is not null) as median_first_response,
      percentile_cont(0.5) within group (
        order by extract(epoch from (resolved_at - created_at)) / 60
      ) filter (where resolved_at is not null) as median_resolution
    from conversations
    where organization_id = ${organizationId}
  `)) as unknown as SummaryRow[];

  const volume = (await db.execute(sql`
    select
      to_char(day, 'YYYY-MM-DD') as day,
      coalesce(created.total, 0) as created,
      coalesce(resolved.total, 0) as resolved
    from generate_series(
      date_trunc('day', now()) - interval '13 days',
      date_trunc('day', now()),
      interval '1 day'
    ) as day
    left join (
      select date_trunc('day', created_at) as bucket, count(*) as total
      from conversations
      where organization_id = ${organizationId}
        and created_at >= date_trunc('day', now()) - interval '13 days'
      group by 1
    ) created on created.bucket = day
    left join (
      select date_trunc('day', resolved_at) as bucket, count(*) as total
      from conversations
      where organization_id = ${organizationId}
        and resolved_at >= date_trunc('day', now()) - interval '13 days'
      group by 1
    ) resolved on resolved.bucket = day
    order by day
  `)) as unknown as VolumeRow[];

  const agents = (await db.execute(sql`
    select
      u.id,
      u.name,
      count(c.id) filter (where c.status <> 'closed') as assigned,
      count(c.id) filter (where c.resolved_at is not null) as resolved
    from memberships m
    join users u on u.id = m.user_id
    left join conversations c
      on c.assignee_id = u.id and c.organization_id = ${organizationId}
    where m.organization_id = ${organizationId}
    group by u.id, u.name
    order by u.name
  `)) as unknown as AgentRow[];

  const row = summary[0] ?? {};

  return {
    open: toNumber(row.open),
    pending: toNumber(row.pending),
    closedToday: toNumber(row.closed_today),
    breached: toNumber(row.breached),
    medianFirstResponseMinutes: toRounded(row.median_first_response),
    medianResolutionMinutes: toRounded(row.median_resolution),
    volumeByDay: volume.map((item) => ({
      day: item.day,
      created: toNumber(item.created),
      resolved: toNumber(item.resolved),
    })),
    byAgent: agents.map((item) => ({
      id: item.id,
      name: item.name,
      assigned: toNumber(item.assigned),
      resolved: toNumber(item.resolved),
    })),
  };
}

export async function workspaceMetrics(organizationId: string): Promise<Metrics> {
  const key = cacheKey(organizationId);
  try {
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached) as Metrics;
    }
  } catch {
    return compute(organizationId);
  }

  const metrics = await compute(organizationId);
  await redis.set(key, JSON.stringify(metrics), 'EX', cacheTtlSeconds).catch(() => undefined);
  return metrics;
}

export async function invalidateMetrics(organizationId: string) {
  await redis.del(cacheKey(organizationId)).catch(() => undefined);
}
