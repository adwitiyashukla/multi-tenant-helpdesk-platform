import { cn } from '@/lib/format';

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block size-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700 dark:border-slate-700 dark:border-t-slate-200',
        className,
      )}
    />
  );
}
