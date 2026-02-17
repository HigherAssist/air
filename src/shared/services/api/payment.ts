import { get, post } from 'aws-amplify/api';
import { fetchAuthSession } from 'aws-amplify/auth';
import { Plan } from 'shared/types/plan';
import { StripeSubscription, StripeCustomer } from 'shared/types/payment';

// The REST API name from amplify_outputs.json custom output
const REST_API_NAME = 'AirRestApi';

async function authHeaders(): Promise<Record<string, string>> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  return token ? { Authorization: token } : {};
}

export class PaymentService {
  public static async getPlans(): Promise<Plan[]> {
    const response = await get({
      apiName: REST_API_NAME,
      path: 'subscription/plans',
      options: { headers: await authHeaders() },
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
      path: 'subscription/checkout',
      options: { body: payload as any, headers: await authHeaders() },
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
      path: 'subscription/portal',
      options: { body: payload as any, headers: await authHeaders() },
    }).response;
    return (await response.body.json()) as unknown as { url: string };
  }

  public static async getUserSubscriptions(stripeCustomerId: string): Promise<{
    subscriptions: StripeSubscription[];
    customer: StripeCustomer;
  }> {
    const response = await get({
      apiName: REST_API_NAME,
      path: `user/subscriptions/${stripeCustomerId}`,
      options: { headers: await authHeaders() },
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
      path: 'plan/query',
      options: { body: payload as any, headers: await authHeaders() },
    }).response;
    return response.body.json();
  }
}
