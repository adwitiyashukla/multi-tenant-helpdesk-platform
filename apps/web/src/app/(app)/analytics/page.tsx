import { MetricsDashboard } from '@/components/metrics-dashboard';

export default function AnalyticsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-base font-semibold">Analytics</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Response and resolution performance for this workspace
        </p>
      </header>
      <MetricsDashboard />
    </div>
  );
}
