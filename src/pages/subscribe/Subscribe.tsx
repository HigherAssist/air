import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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

type UpdateState = {
  isUpdate: true;
  currentPriceId: string;
  subscriptionId: string;
};

const Subscribe = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const updateState = location.state as UpdateState | null;
  const isUpdate = updateState?.isUpdate === true;

  const { dbUser } = useAuth();
  const { plans, isLoading, getPlans } = usePlans();
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [subscriptionChecked, setSubscriptionChecked] = useState(false);

  useEffect(() => {
    getPlans();
  }, [getPlans]);

  useEffect(() => {
    if (!dbUser) return;

    // Update mode: no check needed
    if (isUpdate) {
      setSubscriptionChecked(true);
      return;
    }

    // Admin with a Stripe customer: check for an existing active/trialing subscription
    // and redirect to /account if found, to prevent accidental double subscriptions
    if (dbUser.stripeCustomerId) {
      PaymentService.getUserSubscriptions(dbUser.stripeCustomerId)
        .then(({ subscriptions }) => {
          const hasActive = subscriptions.some(
            (s) => s.status === 'active' || s.status === 'trialing'
          );
          if (hasActive) {
            navigate('/account');
          } else {
            setSubscriptionChecked(true);
          }
        })
        .catch(() => {
          // If the check fails, allow through — the server guard will catch any issues
          setSubscriptionChecked(true);
        });
    } else {
      // Invited user or new admin without stripeCustomerId — allow through
      setSubscriptionChecked(true);
    }
  }, [dbUser, isUpdate, navigate]);

  const handleStartNow = (plan: Plan) => async () => {
    if (isUpdate) {
      try {
        setCheckoutLoading(true);
        await PaymentService.updateSubscription({
          subscriptionId: updateState!.subscriptionId,
          newPriceId: plan.priceId,
        });
        toast.success('Subscription updated successfully!');
        navigate('/account');
      } catch (error) {
        console.error(error);
        toast.error('Failed to update subscription. Please try again.');
        setCheckoutLoading(false);
      }
      return;
    }

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

  const handleHaveQuestions = () => {
    const user = dbUser as User;
    navigate('/contact', {
      state: {
        name: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        phone: user.phoneNumber || '',
        message: 'I have a question about Sales.',
      },
    });
  };

  const handleViewDetails = (plan: Plan) => {
    setSelectedPlan(plan);
    setIsModalOpen(true);
  };

  if (isLoading || !subscriptionChecked) {
    return <Spinner />;
  }

  return (
    <>
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold text-center mb-4">
            {isUpdate ? 'Change Your Plan' : 'Choose Your Plan'}
          </h1>
          {!isUpdate && (
            <p className="text-center text-gray-600 mb-12">
              All plans include a 14-day free trial. Your credit card will not be
              charged until the trial ends.
            </p>
          )}
          {isUpdate && (
            <p className="text-center text-gray-600 mb-12">
              Select a new plan below. The price difference will be prorated immediately.
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {plans.map((plan, planIndex) => {
              const currencySymbol =
                CurrencySymbolsEnum[
                  plan.currency.toUpperCase() as keyof typeof CurrencySymbolsEnum
                ] || '$';
              const price = (plan.unitAmount / 100).toFixed(2);

              const isCurrentPlan = isUpdate && plan.priceId === updateState?.currentPriceId;

              return (
                <div
                  key={plan.id}
                  className={`bg-white rounded-lg shadow-md p-6 border ${
                    isCurrentPlan
                      ? 'border-gray-400 ring-2 ring-gray-400'
                      : planIndex === 1
                      ? 'border-BlueLagoon ring-2 ring-BlueLagoon'
                      : 'border-gray-200'
                  }`}
                >
                  {isCurrentPlan ? (
                    <div className="text-center mb-2">
                      <span className="bg-gray-500 text-white text-xs px-3 py-1 rounded-full">
                        Current Plan
                      </span>
                    </div>
                  ) : planIndex === 1 && !isUpdate ? (
                    <div className="text-center mb-2">
                      <span className="bg-BlueLagoon text-white text-xs px-3 py-1 rounded-full">
                        Most Popular
                      </span>
                    </div>
                  ) : null}
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
                    onClick={isCurrentPlan ? undefined : handleStartNow(plan)}
                    disabled={checkoutLoading || isCurrentPlan}
                    className="w-full bg-BlueLagoon text-white py-2 rounded-md hover:opacity-90 disabled:opacity-50 mb-2"
                  >
                    {checkoutLoading && !isCurrentPlan
                      ? 'Loading...'
                      : isCurrentPlan
                      ? 'Current Plan'
                      : isUpdate
                      ? 'Switch to This Plan'
                      : 'Start Now'}
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
