import { type ClassValue, clsx } from 'clsx';
import { formatDistanceToNowStrict } from 'date-fns';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function relativeTime(value: string) {
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
}

export function clockTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function minutesLabel(minutes: number | null) {
  if (minutes === null) {
    return 'no data';
  }
  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  }
  if (minutes < 60 * 24) {
    return `${(minutes / 60).toFixed(1)}h`;
  }
  return `${(minutes / (60 * 24)).toFixed(1)}d`;
}

export function countdown(target: string | null, breachedAt: string | null) {
  if (breachedAt) {
    return { label: 'breached', tone: 'danger' as const };
  }
  if (!target) {
    return { label: 'answered', tone: 'ok' as const };
  }
  const diff = new Date(target).getTime() - Date.now();
  if (diff <= 0) {
    return { label: 'due now', tone: 'danger' as const };
  }
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) {
    return { label: `${minutes}m left`, tone: minutes < 15 ? ('warn' as const) : ('ok' as const) };
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return { label: `${hours}h left`, tone: 'ok' as const };
  }
  return { label: `${Math.round(hours / 24)}d left`, tone: 'ok' as const };
}

export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
