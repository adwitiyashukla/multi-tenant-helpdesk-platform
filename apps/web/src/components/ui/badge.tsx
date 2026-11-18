import type { ReactNode } from 'react';
import { cn } from '@/lib/format';

type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info';

const tones: Record<Tone, string> = {
  neutral: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  ok: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  warn: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  danger: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  info: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
