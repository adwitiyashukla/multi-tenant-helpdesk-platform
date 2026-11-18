import { badRequest } from './errors.js';

export type Cursor = {
  timestamp: string;
  id: string;
};

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.timestamp}|${cursor.id}`, 'utf8').toString('base64url');
}

export function decodeCursor(value: string): Cursor {
  const raw = Buffer.from(value, 'base64url').toString('utf8');
  const separator = raw.lastIndexOf('|');
  if (separator === -1) {
    throw badRequest('invalid cursor');
  }
  const timestamp = raw.slice(0, separator);
  const id = raw.slice(separator + 1);
  if (Number.isNaN(Date.parse(timestamp)) || id.length !== 36) {
    throw badRequest('invalid cursor');
  }
  return { timestamp, id };
}
