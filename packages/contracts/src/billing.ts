import { z } from 'zod';
import { planTierSchema } from './common.js';

export const subscriptionSchema = z.object({
  plan: planTierSchema,
  status: z.enum(['none', 'active', 'past_due', 'canceled']),
  seatLimit: z.number().int(),
  seatsUsed: z.number().int(),
  currentPeriodEnd: z.iso.datetime().nullable(),
});
export type Subscription = z.infer<typeof subscriptionSchema>;

export const checkoutSchema = z.object({
  successUrl: z.url(),
  cancelUrl: z.url(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;
