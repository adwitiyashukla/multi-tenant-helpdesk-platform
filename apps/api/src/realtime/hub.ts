import type { PresenceUser, ServerEvent } from '@helpdesk/contracts';
import type { Redis } from 'ioredis';
import type { WebSocket } from 'ws';
import { logger } from '../lib/logger.js';
import { createRedis, redis } from '../lib/redis.js';

export type Client = {
  id: string;
  socket: WebSocket;
  organizationId: string;
  userId: string;
  name: string;
  viewing: string | null;
};

const eventChannel = (organizationId: string) => `helpdesk:events:${organizationId}`;
const presenceKey = (organizationId: string) => `helpdesk:presence:${organizationId}`;
const presenceTtlMs = 60 * 1000;

export async function publishEvent(organizationId: string, event: ServerEvent) {
  await redis.publish(eventChannel(organizationId), JSON.stringify(event));
}

class Hub {
  private readonly clients = new Map<string, Set<Client>>();
  private subscriber: Redis | null = null;

  async start() {
    if (this.subscriber) {
      return;
    }
    const subscriber = createRedis();
    await subscriber.psubscribe('helpdesk:events:*');
    subscriber.on('pmessage', (_pattern, channel, payload) => {
      const organizationId = channel.slice('helpdesk:events:'.length);
      this.deliver(organizationId, payload);
    });
    this.subscriber = subscriber;
  }

  async stop() {
    await this.subscriber?.quit();
    this.subscriber = null;
  }

  private deliver(organizationId: string, payload: string) {
    const clients = this.clients.get(organizationId);
    if (!clients) {
      return;
    }
    for (const client of clients) {
      if (client.socket.readyState === client.socket.OPEN) {
        client.socket.send(payload);
      }
    }
  }

  async add(client: Client) {
    const set = this.clients.get(client.organizationId) ?? new Set<Client>();
    set.add(client);
    this.clients.set(client.organizationId, set);
    await this.touchPresence(client);
    await this.broadcastPresence(client.organizationId);
  }

  async remove(client: Client) {
    const set = this.clients.get(client.organizationId);
    set?.delete(client);
    if (set && set.size === 0) {
      this.clients.delete(client.organizationId);
    }
    const stillConnected = [...(set ?? [])].some((item) => item.userId === client.userId);
    if (!stillConnected) {
      await redis.hdel(presenceKey(client.organizationId), client.userId);
    }
    await this.broadcastPresence(client.organizationId);
  }

  async touchPresence(client: Client) {
    await redis.hset(
      presenceKey(client.organizationId),
      client.userId,
      JSON.stringify({ name: client.name, viewing: client.viewing, at: Date.now() }),
    );
    await redis.pexpire(presenceKey(client.organizationId), presenceTtlMs * 10);
  }

  async presence(organizationId: string): Promise<PresenceUser[]> {
    const entries = await redis.hgetall(presenceKey(organizationId));
    const now = Date.now();
    const users: PresenceUser[] = [];
    const stale: string[] = [];

    for (const [userId, raw] of Object.entries(entries)) {
      try {
        const parsed = JSON.parse(raw) as { name: string; viewing: string | null; at: number };
        if (now - parsed.at > presenceTtlMs) {
          stale.push(userId);
          continue;
        }
        users.push({ id: userId, name: parsed.name, viewing: parsed.viewing });
      } catch {
        stale.push(userId);
      }
    }

    if (stale.length > 0) {
      await redis.hdel(presenceKey(organizationId), ...stale);
    }
    return users.sort((a, b) => a.name.localeCompare(b.name));
  }

  async broadcastPresence(organizationId: string) {
    try {
      const users = await this.presence(organizationId);
      await publishEvent(organizationId, { type: 'presence', users });
    } catch (error) {
      logger.warn({ err: error }, 'presence broadcast failed');
    }
  }

  localCount(organizationId: string) {
    return this.clients.get(organizationId)?.size ?? 0;
  }
}

export const hub = new Hub();
