import { get, post } from 'aws-amplify/api';
import { Plan } from 'shared/types/plan';
import { StripeSubscription, StripeCustomer } from 'shared/types/payment';

// The REST API name from amplify_outputs.json custom output
const REST_API_NAME = 'AirRestApi';

export class PaymentService {
  public static async getPlans(): Promise<Plan[]> {
    const response = await get({
      apiName: REST_API_NAME,
      path: '/subscription/plans',
    }).response;
    const plans = (await response.body.json()) as unknown as Plan[];
    return plans;
  }

  public static async createCheckoutSession(payload: {
    priceId: string;
    userId: string;
    email: string;
    companyName: string;
    firstName: string;
    lastName: string;
  }): Promise<{ sessionId: string; url: string }> {
    const response = await post({
      apiName: REST_API_NAME,
      path: '/subscription/checkout',
      options: { body: payload as any },
    }).response;
    return (await response.body.json()) as unknown as {
      sessionId: string;
      url: string;
    };
  }

  public static async createPortalSession(payload: {
    stripeCustomerId: string;
    returnUrl: string;
  }): Promise<{ url: string }> {
    const response = await post({
      apiName: REST_API_NAME,
      path: '/subscription/portal',
      options: { body: payload as any },
    }).response;
    return (await response.body.json()) as unknown as { url: string };
  }

  public static async getUserSubscriptions(stripeCustomerId: string): Promise<{
    subscriptions: StripeSubscription[];
    customer: StripeCustomer;
  }> {
    const response = await get({
      apiName: REST_API_NAME,
      path: `/user/subscriptions/${stripeCustomerId}`,
    }).response;
    return (await response.body.json()) as unknown as {
      subscriptions: StripeSubscription[];
      customer: StripeCustomer;
    };
  }

  public static async sendPlanInquiry(payload: {
    email: string;
    firstName: string;
    lastName: string;
    companyName: string;
  }): Promise<any> {
    const response = await post({
      apiName: REST_API_NAME,
      path: '/plan/query',
      options: { body: payload as any },
    }).response;
    return response.body.json();
  }
}
