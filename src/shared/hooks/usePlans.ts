import { create } from 'zustand';
import { Plan } from 'shared/types/plan';
import { PlansEnum } from 'shared/enums';
import { PaymentService } from 'shared/services';

interface PlanStore {
  plans: Plan[] | [];
  isLoading: boolean;
  error: string | null;
  getPlans: () => void;
  setLoading: (loading: boolean) => void;
}

const allowedPlans = Object.values(PlansEnum).map((plan) => plan.toLowerCase());

const usePlans = create<PlanStore>((set) => ({
  isLoading: true,
  plans: [],
  error: null,
  setLoading: (loading: boolean) => set({ isLoading: loading }),
  getPlans: async () => {
    try {
      let plans = await PaymentService.getPlans();
      if (plans?.length) {
        plans = plans.filter((plan) =>
          allowedPlans.includes(plan.code.toLowerCase())
        );
        plans.sort((a, b) => {
          return (
            allowedPlans.indexOf(a.code.toLowerCase()) -
            allowedPlans.indexOf(b.code.toLowerCase())
          );
        });
        set({ plans, isLoading: false, error: null });
      } else {
        throw new Error('Could not get plans');
      }
    } catch (error: any) {
      set({
        plans: [],
        isLoading: false,
        error: error?.message || 'Could not get plans',
      });
      console.error(error);
    }
  },
}));

export default usePlans;
