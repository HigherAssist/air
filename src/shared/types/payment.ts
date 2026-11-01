export type StripeSubscription = {
  id: string;
  status: string;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  trialStart: number | null;
  trialEnd: number | null;
  canceledAt: number | null;
  plan: {
    id: string;
    name: string;
    code: string;
  };
  quantity: number;
  cardExpMonth: number | null;
  cardExpYear: number | null;
};

export type StripeCustomer = {
  id: string;
  email: string;
  name: string;
  metadata?: Record<string, string>;
} | null;

export type SubscriptionFilter = {
  limit?: number;
  order?: 'asc' | 'desc';
  sort?: 'created_at' | 'updated_at';
  state?: string;
};
