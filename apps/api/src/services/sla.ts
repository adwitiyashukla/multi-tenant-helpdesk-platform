import { type Priority, slaTargets } from '@helpdesk/contracts';

export function firstResponseDueAt(priority: Priority, from: Date): Date {
  return new Date(from.getTime() + slaTargets[priority] * 60 * 1000);
}

export function isBreached(dueAt: Date | null, firstResponseAt: Date | null, now = new Date()) {
  if (!dueAt || firstResponseAt) {
    return false;
  }
  return now.getTime() > dueAt.getTime();
}
