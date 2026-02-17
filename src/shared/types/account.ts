// Stripe Customer info (simplified from Recurly Account)
export type StripeAccount = {
  id: string;
  email: string;
  name: string;
  metadata?: Record<string, string>;
} | null;
