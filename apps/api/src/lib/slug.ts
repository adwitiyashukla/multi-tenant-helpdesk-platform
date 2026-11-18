import { randomBytes } from 'node:crypto';

export function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return base.length >= 3 ? base : 'team';
}

export function uniqueSlug(value: string): string {
  return `${slugify(value)}-${randomBytes(3).toString('hex')}`;
}
