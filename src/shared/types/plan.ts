export type Plan = {
  id: string;
  priceId: string;
  name: string;
  code: string;
  description: string;
  unitAmount: number;
  currency: string;
  interval: string;
  trialDays: number;
  state: string;
};
