import { create } from 'zustand';
import { StripeSubscription, StripeCustomer } from 'shared/types/payment';

export interface SubscriptionStore {
  subscriptions: StripeSubscription[];
  setSubscriptions: (subscriptions: StripeSubscription[]) => void;
  setCustomer: (customer: StripeCustomer) => void;
  customer: StripeCustomer;
  error: string;
  setError: (error: string) => void;
}

const useSubscriptions = create<SubscriptionStore>((set) => {
  return {
    subscriptions: [],
    error: '',
    customer: null,
    setError: (error: string) => set({ error }),
    setSubscriptions: (subscriptions: StripeSubscription[]) =>
      set({ subscriptions }),
    setCustomer: (customer: StripeCustomer) => set({ customer }),
  };
});

export default useSubscriptions;
