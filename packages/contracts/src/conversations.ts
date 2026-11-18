import { z } from 'zod';
import { conversationStatusSchema, messageKindSchema, prioritySchema } from './common.js';

export const customerSchema = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  email: z.email(),
});
export type Customer = z.infer<typeof customerSchema>;

export const agentRefSchema = z.object({
  id: z.uuid(),
  name: z.string(),
});
export type AgentRef = z.infer<typeof agentRefSchema>;

export const attachmentSchema = z.object({
  id: z.uuid(),
  filename: z.string(),
  contentType: z.string(),
  size: z.number().int(),
  url: z.string(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const messageSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  kind: messageKindSchema,
  body: z.string(),
  author: agentRefSchema.nullable(),
  customer: customerSchema.nullable(),
  attachments: z.array(attachmentSchema),
  createdAt: z.iso.datetime(),
});
export type Message = z.infer<typeof messageSchema>;

export const conversationSchema = z.object({
  id: z.uuid(),
  reference: z.number().int(),
  subject: z.string(),
  status: conversationStatusSchema,
  priority: prioritySchema,
  customer: customerSchema,
  assignee: agentRefSchema.nullable(),
  tags: z.array(z.string()),
  messageCount: z.number().int(),
  snippet: z.string(),
  createdAt: z.iso.datetime(),
  lastMessageAt: z.iso.datetime(),
  firstResponseAt: z.iso.datetime().nullable(),
  resolvedAt: z.iso.datetime().nullable(),
  slaDueAt: z.iso.datetime().nullable(),
  slaBreachedAt: z.iso.datetime().nullable(),
  snoozedUntil: z.iso.datetime().nullable(),
});
export type Conversation = z.infer<typeof conversationSchema>;

export const conversationPageSchema = z.object({
  items: z.array(conversationSchema),
  nextCursor: z.string().nullable(),
});
export type ConversationPage = z.infer<typeof conversationPageSchema>;

export const conversationQuerySchema = z.object({
  status: conversationStatusSchema.optional(),
  priority: prioritySchema.optional(),
  assignee: z.union([z.uuid(), z.literal('me'), z.literal('none')]).optional(),
  tag: z.string().min(1).max(40).optional(),
  q: z.string().min(2).max(120).optional(),
  breached: z.coerce.boolean().optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type ConversationQuery = z.infer<typeof conversationQuerySchema>;

export const createConversationSchema = z.object({
  subject: z.string().min(1).max(200),
  customerEmail: z.email(),
  customerName: z.string().min(1).max(80).optional(),
  body: z.string().min(1).max(20000),
  priority: prioritySchema.default('normal'),
});
export type CreateConversationInput = z.infer<typeof createConversationSchema>;

export const updateConversationSchema = z
  .object({
    status: conversationStatusSchema,
    priority: prioritySchema,
    assigneeId: z.uuid().nullable(),
    snoozedUntil: z.iso.datetime().nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one field is required',
  });
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;

export const createMessageSchema = z.object({
  body: z.string().min(1).max(20000),
  kind: messageKindSchema.exclude(['inbound']).default('reply'),
  attachmentIds: z.array(z.uuid()).max(10).default([]),
});
export type CreateMessageInput = z.infer<typeof createMessageSchema>;

export const tagInputSchema = z.object({
  name: z.string().min(1).max(40),
});
export type TagInput = z.infer<typeof tagInputSchema>;

export const inboundEmailSchema = z.object({
  to: z.email(),
  from: z.email(),
  fromName: z.string().max(80).optional(),
  subject: z.string().min(1).max(200),
  text: z.string().min(1).max(20000),
  externalId: z.string().max(200).optional(),
});
export type InboundEmail = z.infer<typeof inboundEmailSchema>;

export const cannedReplySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  body: z.string(),
});
export type CannedReply = z.infer<typeof cannedReplySchema>;

export const createCannedReplySchema = z.object({
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(4000),
});
export type CreateCannedReplyInput = z.infer<typeof createCannedReplySchema>;

export const metricsSchema = z.object({
  open: z.number().int(),
  pending: z.number().int(),
  closedToday: z.number().int(),
  breached: z.number().int(),
  medianFirstResponseMinutes: z.number().nullable(),
  medianResolutionMinutes: z.number().nullable(),
  volumeByDay: z.array(
    z.object({ day: z.string(), created: z.number().int(), resolved: z.number().int() }),
  ),
  byAgent: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      assigned: z.number().int(),
      resolved: z.number().int(),
    }),
  ),
});
export type Metrics = z.infer<typeof metricsSchema>;
