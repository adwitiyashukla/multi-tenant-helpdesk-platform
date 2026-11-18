'use client';

import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/format';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary:
    'bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-400 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white',
  secondary:
    'border border-slate-300 bg-white text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800',
  ghost: 'text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800',
  danger: 'bg-rose-600 text-white hover:bg-rose-500',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({ variant = 'primary', size = 'md', className, ...props }: Props) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
        'focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
