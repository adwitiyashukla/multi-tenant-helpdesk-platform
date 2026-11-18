import { SettingsPanel } from '@/components/settings-panel';

export default function SettingsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-base font-semibold">Settings</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">Workspace, team and tags</p>
      </header>
      <SettingsPanel />
    </div>
  );
}
