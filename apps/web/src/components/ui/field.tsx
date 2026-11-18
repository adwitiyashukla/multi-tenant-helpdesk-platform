'use client';

import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/format';

const base =
  'w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-slate-800';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(base, 'h-10', className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(base, 'py-2 leading-relaxed', className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(base, 'h-9 pr-8', className)} {...props} />;
}

export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400"
    >
      {children}
    </label>
  );
}
