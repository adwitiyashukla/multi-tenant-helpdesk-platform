import { z } from 'zod';
import { planTierSchema, roleSchema } from './common.js';

export const signupSchema = z.object({
  organizationName: z.string().min(2).max(80),
  name: z.string().min(2).max(80),
  email: z.email(),
  password: z.string().min(10).max(200),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const inviteSchema = z.object({
  email: z.email(),
  role: roleSchema.exclude(['owner']),
});
export type InviteInput = z.infer<typeof inviteSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().min(16).max(200),
  name: z.string().min(2).max(80),
  password: z.string().min(10).max(200),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const updateMemberSchema = z.object({
  role: roleSchema.exclude(['owner']),
});
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

export const memberSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  name: z.string(),
  email: z.email(),
  role: roleSchema,
  createdAt: z.iso.datetime(),
});
export type Member = z.infer<typeof memberSchema>;

export const organizationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  plan: planTierSchema,
  seatsUsed: z.number().int(),
  seatLimit: z.number().int(),
  inboundAddress: z.email(),
});
export type Organization = z.infer<typeof organizationSchema>;

export const sessionSchema = z.object({
  user: z.object({
    id: z.uuid(),
    name: z.string(),
    email: z.email(),
    role: roleSchema,
  }),
  organization: organizationSchema,
});
export type Session = z.infer<typeof sessionSchema>;
