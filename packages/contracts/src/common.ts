import { z } from 'zod';

export const roles = ['owner', 'admin', 'agent'] as const;
export const roleSchema = z.enum(roles);
export type Role = z.infer<typeof roleSchema>;

export const conversationStatuses = ['open', 'pending', 'snoozed', 'closed'] as const;
export const conversationStatusSchema = z.enum(conversationStatuses);
export type ConversationStatus = z.infer<typeof conversationStatusSchema>;

export const priorities = ['low', 'normal', 'high', 'urgent'] as const;
export const prioritySchema = z.enum(priorities);
export type Priority = z.infer<typeof prioritySchema>;

export const messageKinds = ['inbound', 'reply', 'note'] as const;
export const messageKindSchema = z.enum(messageKinds);
export type MessageKind = z.infer<typeof messageKindSchema>;

export const planTiers = ['free', 'pro'] as const;
export const planTierSchema = z.enum(planTiers);
export type PlanTier = z.infer<typeof planTierSchema>;

export const planLimits: Record<PlanTier, { seats: number; conversationsPerMonth: number }> = {
  free: { seats: 3, conversationsPerMonth: 500 },
  pro: { seats: 25, conversationsPerMonth: 100000 },
};

export const slaTargets: Record<Priority, number> = {
  urgent: 30,
  high: 120,
  normal: 480,
  low: 1440,
};

export const idSchema = z.uuid();

export const paginationSchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type ApiError = {
  error: string;
  message: string;
  details?: unknown;
};
