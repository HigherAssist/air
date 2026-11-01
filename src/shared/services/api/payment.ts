import { fetchAuthSession } from 'aws-amplify/auth';
import { Amplify } from 'aws-amplify';
import { Plan } from 'shared/types/plan';
import { StripeSubscription, StripeCustomer } from 'shared/types/payment';

function getApiUrl(): string {
  const config = Amplify.getConfig() as any;
  return config.API?.REST?.AirRestApi?.endpoint || '';
}

async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  const url = `${getApiUrl()}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response;
}

export class PaymentService {
  public static async getPlans(): Promise<Plan[]> {
    const response = await authFetch('subscription/plans');
    return response.json();
  }

  public static async createCheckoutSession(payload: {
    priceId: string;
    userId: string;
    email: string;
    companyName: string;
    firstName: string;
    lastName: string;
  }): Promise<{ sessionId: string; url: string }> {
    const response = await authFetch('subscription/checkout', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return response.json();
  }

  public static async createPortalSession(payload: {
    stripeCustomerId: string;
    returnUrl: string;
  }): Promise<{ url: string }> {
    const response = await authFetch('subscription/portal', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return response.json();
  }

  public static async getUserSubscriptions(stripeCustomerId: string): Promise<{
    subscriptions: StripeSubscription[];
    customer: StripeCustomer;
  }> {
    const response = await authFetch(`user/subscriptions/${stripeCustomerId}`);
    return response.json();
  }

  public static async updateSubscription(payload: {
    subscriptionId: string;
    newPriceId: string;
  }): Promise<{ subscriptionId: string; status: string }> {
    const response = await authFetch('subscription/update', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return response.json();
  }

  public static async sendPlanInquiry(payload: {
    email: string;
    firstName: string;
    lastName: string;
    companyName: string;
  }): Promise<any> {
    const response = await authFetch('plan/query', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return response.json();
  }
}
