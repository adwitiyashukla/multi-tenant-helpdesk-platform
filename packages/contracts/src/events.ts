import { z } from 'zod';
import { conversationSchema, messageSchema } from './conversations.js';

export const presenceUserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  viewing: z.uuid().nullable(),
});
export type PresenceUser = z.infer<typeof presenceUserSchema>;

export const serverEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), userId: z.uuid() }),
  z.object({ type: z.literal('presence'), users: z.array(presenceUserSchema) }),
  z.object({
    type: z.literal('typing'),
    conversationId: z.uuid(),
    userId: z.uuid(),
    name: z.string(),
  }),
  z.object({ type: z.literal('conversation.created'), conversation: conversationSchema }),
  z.object({ type: z.literal('conversation.updated'), conversation: conversationSchema }),
  z.object({
    type: z.literal('message.created'),
    conversationId: z.uuid(),
    message: messageSchema,
  }),
  z.object({ type: z.literal('sla.breached'), conversation: conversationSchema }),
]);
export type ServerEvent = z.infer<typeof serverEventSchema>;

export const clientEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('viewing'), conversationId: z.uuid().nullable() }),
  z.object({ type: z.literal('typing'), conversationId: z.uuid() }),
  z.object({ type: z.literal('ping') }),
]);
export type ClientEvent = z.infer<typeof clientEventSchema>;
