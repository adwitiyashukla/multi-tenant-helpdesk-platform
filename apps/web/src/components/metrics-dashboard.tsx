'use client';

import { Avatar } from '@/components/ui/avatar';
import { Spinner } from '@/components/ui/spinner';
import { minutesLabel } from '@/lib/format';
import { useMetrics } from '@/lib/queries';

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function VolumeChart({
  data,
}: {
  data: Array<{ day: string; created: number; resolved: number }>;
}) {
  const peak = Math.max(1, ...data.flatMap((item) => [item.created, item.resolved]));
  const width = 720;
  const height = 180;
  const gap = 6;
  const groupWidth = (width - gap * (data.length - 1)) / data.length;
  const barWidth = (groupWidth - 3) / 2;

  return (
    <svg
      viewBox={`0 0 ${width} ${height + 24}`}
      className="w-full"
      role="img"
      aria-label="Conversations created and resolved per day"
    >
      {data.map((item, index) => {
        const x = index * (groupWidth + gap);
        const createdHeight = (item.created / peak) * height;
        const resolvedHeight = (item.resolved / peak) * height;
        return (
          <g key={item.day}>
            <rect
              x={x}
              y={height - createdHeight}
              width={barWidth}
              height={createdHeight}
              rx={3}
              className="fill-slate-800 dark:fill-slate-300"
            />
            <rect
              x={x + barWidth + 3}
              y={height - resolvedHeight}
              width={barWidth}
              height={resolvedHeight}
              rx={3}
              className="fill-emerald-500"
            />
            <text
              x={x + groupWidth / 2}
              y={height + 16}
              textAnchor="middle"
              className="fill-slate-400 text-[9px]"
            >
              {item.day.slice(5)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function MetricsDashboard() {
  const metrics = useMetrics();

  if (metrics.isLoading || !metrics.data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const data = metrics.data;

  return (
    <div className="space-y-5 overflow-y-auto p-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="Open" value={String(data.open)} />
        <Card label="Pending" value={String(data.pending)} />
        <Card label="Closed today" value={String(data.closedToday)} />
        <Card label="SLA breached" value={String(data.breached)} hint="still waiting on a reply" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card
          label="Median first response"
          value={minutesLabel(data.medianFirstResponseMinutes)}
          hint="customer waiting time before an agent replies"
        />
        <Card
          label="Median time to resolve"
          value={minutesLabel(data.medianResolutionMinutes)}
          hint="open to closed"
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium">Last 14 days</p>
          <div className="flex gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-slate-800 dark:bg-slate-300" /> created
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-emerald-500" /> resolved
            </span>
          </div>
        </div>
        <VolumeChart data={data.volumeByDay} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <p className="border-b border-slate-200 px-4 py-3 text-sm font-medium dark:border-slate-800">
          By agent
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 dark:text-slate-400">
              <th className="px-4 py-2 text-left font-medium">Agent</th>
              <th className="px-4 py-2 text-right font-medium">Open assigned</th>
              <th className="px-4 py-2 text-right font-medium">Resolved</th>
            </tr>
          </thead>
          <tbody>
            {data.byAgent.map((agent) => (
              <tr key={agent.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-2">
                    <Avatar name={agent.name} size={22} />
                    {agent.name}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{agent.assigned}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{agent.resolved}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
