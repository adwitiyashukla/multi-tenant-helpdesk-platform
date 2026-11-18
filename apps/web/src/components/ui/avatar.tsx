import { cn, initials } from '@/lib/format';

const palette = [
  'bg-sky-600',
  'bg-violet-600',
  'bg-emerald-600',
  'bg-amber-600',
  'bg-rose-600',
  'bg-indigo-600',
];

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const index = name.split('').reduce((total, char) => total + char.charCodeAt(0), 0);
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        palette[index % palette.length],
      )}
    >
      {initials(name)}
    </span>
  );
}
