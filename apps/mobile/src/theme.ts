export const theme = {
  background: '#f8fafc',
  surface: '#ffffff',
  border: '#e2e8f0',
  text: '#0f172a',
  muted: '#64748b',
  accent: '#0f172a',
  danger: '#e11d48',
  warn: '#d97706',
  ok: '#059669',
};

export const statusTone: Record<string, string> = {
  open: theme.ok,
  pending: theme.warn,
  snoozed: theme.muted,
  closed: theme.muted,
};
