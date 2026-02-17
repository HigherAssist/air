import { useEffect, useState } from 'react';
import { useAuth, usePlans } from 'shared/hooks';
import { PaymentService } from 'shared/services';
import { Spinner } from 'shared/components';
import { Footer } from 'shared/layout';
import { CurrencySymbolsEnum } from 'shared/enums';
import {
  pricingPlanCheckListItems,
  pricingPlanCheckListItemsDescription,
  pricingPlansCheckList,
} from 'shared/utils/constants';
import { Plan } from 'shared/types/plan';
import { User } from 'shared/types/user';
import toast from 'react-hot-toast';
import { Modal } from 'antd';
import { AiOutlineCheck, AiOutlineClose, AiOutlineInfoCircle } from 'react-icons/ai';

const Subscribe = () => {
  const { dbUser } = useAuth();
  const { plans, isLoading, getPlans } = usePlans();
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  useEffect(() => {
    getPlans();
  }, [getPlans]);

  const handleStartNow = (plan: Plan) => async () => {
    try {
      setCheckoutLoading(true);
      const user = dbUser as User;
      const { url } = await PaymentService.createCheckoutSession({
        priceId: plan.priceId,
        userId: user.id,
        email: user.email,
        companyName: user.companyName,
        firstName: user.firstName,
        lastName: user.lastName,
      });
      // Redirect to Stripe Checkout
      window.location.href = url;
    } catch (error) {
      console.error(error);
      toast.error('Failed to create checkout session. Please try again.');
      setCheckoutLoading(false);
    }
  };

  const handleHaveQuestions = async () => {
    try {
      const user = dbUser as User;
      await PaymentService.sendPlanInquiry({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        companyName: user.companyName,
      });
      toast.success(
        'Your inquiry has been sent. Our team will reach out to you shortly.'
      );
    } catch (error) {
      console.error(error);
      toast.error('Failed to send inquiry. Please try again.');
    }
  };

  const handleViewDetails = (plan: Plan) => {
    setSelectedPlan(plan);
    setIsModalOpen(true);
  };

  if (isLoading) {
    return <Spinner />;
  }

  return (
    <>
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold text-center mb-4">
            Choose Your Plan
          </h1>
          <p className="text-center text-gray-600 mb-12">
            All plans include a 14-day free trial. No credit card required to
            start.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {plans.map((plan, planIndex) => {
              const currencySymbol =
                CurrencySymbolsEnum[
                  plan.currency.toUpperCase() as keyof typeof CurrencySymbolsEnum
                ] || '$';
              const price = (plan.unitAmount / 100).toFixed(2);

              return (
                <div
                  key={plan.id}
                  className={`bg-white rounded-lg shadow-md p-6 border ${
                    planIndex === 1
                      ? 'border-BlueLagoon ring-2 ring-BlueLagoon'
                      : 'border-gray-200'
                  }`}
                >
                  {planIndex === 1 && (
                    <div className="text-center mb-2">
                      <span className="bg-BlueLagoon text-white text-xs px-3 py-1 rounded-full">
                        Most Popular
                      </span>
                    </div>
                  )}
                  <h3 className="text-xl font-bold text-center mb-2">
                    {plan.name}
                  </h3>
                  <div className="text-center mb-4">
                    <span className="text-3xl font-bold">
                      {currencySymbol}
                      {price}
                    </span>
                    <span className="text-gray-500">/{plan.interval}</span>
                  </div>

                  <ul className="space-y-2 mb-6">
                    {pricingPlansCheckList[planIndex]?.map(
                      (item: any, idx: number) => {
                        if (item === '#') {
                          return (
                            <li
                              key={idx}
                              className="flex items-center text-gray-400"
                            >
                              <AiOutlineClose className="mr-2 text-red-400" />
                              <span className="text-sm line-through">
                                {pricingPlanCheckListItems[idx]}
                              </span>
                            </li>
                          );
                        }
                        if (item === 'repeat') {
                          return (
                            <li
                              key={idx}
                              className="flex items-center text-gray-500"
                            >
                              <AiOutlineCheck className="mr-2 text-green-500" />
                              <span className="text-sm">
                                {pricingPlanCheckListItems[idx]}
                              </span>
                            </li>
                          );
                        }
                        return (
                          <li key={idx} className="flex items-center">
                            <AiOutlineCheck className="mr-2 text-green-500" />
                            <span className="text-sm">{item}</span>
                          </li>
                        );
                      }
                    )}
                  </ul>

                  <button
                    onClick={handleStartNow(plan)}
                    disabled={checkoutLoading}
                    className="w-full bg-BlueLagoon text-white py-2 rounded-md hover:opacity-90 disabled:opacity-50 mb-2"
                  >
                    {checkoutLoading ? 'Loading...' : 'Start Now'}
                  </button>
                  <button
                    onClick={() => handleViewDetails(plan)}
                    className="w-full text-BlueLagoon py-2 rounded-md border border-BlueLagoon hover:bg-gray-50 text-sm"
                  >
                    <AiOutlineInfoCircle className="inline mr-1" />
                    View Details
                  </button>
                </div>
              );
            })}
          </div>

          <div className="text-center mt-8">
            <button
              onClick={handleHaveQuestions}
              className="text-BlueLagoon underline hover:opacity-80"
            >
              Have Questions? Contact our sales team
            </button>
          </div>
        </div>
      </section>

      <Modal
        title={selectedPlan?.name || 'Plan Details'}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        width={600}
      >
        {selectedPlan && (
          <div>
            <p className="text-gray-600 mb-4">{selectedPlan.description}</p>
            <h4 className="font-bold mb-2">Features included:</h4>
            <ul className="space-y-2">
              {pricingPlanCheckListItems.map((item, idx) => (
                <li key={idx} className="text-sm">
                  <strong>{item}:</strong>{' '}
                  {pricingPlanCheckListItemsDescription[idx]}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>

      <Footer />
    </>
  );
};

export default Subscribe;
