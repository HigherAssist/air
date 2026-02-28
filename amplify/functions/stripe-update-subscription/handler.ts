import type { APIGatewayProxyHandler } from 'aws-lambda';
import Stripe from 'stripe';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const sesClient = new SESClient();

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { subscriptionId, newPriceId } = body;

    if (!subscriptionId || !newPriceId) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing subscriptionId or newPriceId' }),
      };
    }

    // Extract admin info from Cognito JWT claims (injected by API Gateway authorizer)
    const claims = (event.requestContext.authorizer as any)?.claims || {};
    const firstName = claims.given_name || '';
    const lastName = claims.family_name || '';
    const adminEmail = claims.email || '';

    // Retrieve the current subscription to get the subscription item ID and quantity
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price'],
    });

    const subscriptionItem = subscription.items.data[0];
    if (!subscriptionItem) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'No subscription item found' }),
      };
    }

    // Preserve current seat count when switching plans
    const currentQty = subscriptionItem.quantity || 1;
    console.log(`Plan update: sub=${subscriptionId} item=${subscriptionItem.id} price=${newPriceId} qty=${currentQty}`);

    // Fetch new plan name before performing the update
    const newPrice = await stripe.prices.retrieve(newPriceId, { expand: ['product'] });
    const planName = (newPrice.product as Stripe.Product).name;

    // Update the subscription with the new price, preserving quantity and prorating the difference
    const updated = await stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: subscriptionItem.id,
          price: newPriceId,
          quantity: currentQty,
        },
      ],
      proration_behavior: 'create_prorations',
    });

    console.log(`Plan update success: status=${updated.status} qty=${updated.items.data[0]?.quantity}`);

    // Send notification email to admin and operations
    const appOrigin = process.env.AMPLIFY_APP_ORIGIN || '';
    const sesEmail = process.env.SES_EMAIL || '';

    const toAddresses: string[] = [];
    if (adminEmail) toAddresses.push(adminEmail);
    if (sesEmail && sesEmail !== adminEmail) toAddresses.push(sesEmail);

    if (toAddresses.length > 0) {
      const htmlBody = `
<p>Hello,</p>
<p>
  ${firstName} ${lastName} has updated their subscription to the HireAssist AIR team account.<br>
  The updated subscription plan is <strong>${planName}</strong> and the subscription ID is ${updated.id}.<br>
  Thank you for your continued business and we look forward to serving you in the future.<br>
  Here is your AIR application sign-in link: <a href="${appOrigin}">${appOrigin}</a>
</p>
<p>Best regards,<br>The HireAssist team</p>
`.trim();

      const textBody = `Hello,

${firstName} ${lastName} has updated their subscription to the HireAssist AIR team account.
The updated subscription plan is ${planName} and the subscription ID is ${updated.id}.
Thank you for your continued business and we look forward to serving you in the future.
Here is your AIR application sign-in link: ${appOrigin}

Best regards,
The HireAssist team`;

      try {
        await sesClient.send(
          new SendEmailCommand({
            Source: sesEmail,
            Destination: { ToAddresses: toAddresses },
            Message: {
              Subject: { Data: 'You have updated your subscription to HireAssist AIR' },
              Body: {
                Html: { Data: htmlBody },
                Text: { Data: textBody },
              },
            },
          })
        );
        console.log(`Subscription update email sent to: ${toAddresses.join(', ')}`);
      } catch (emailError: any) {
        console.error('Failed to send subscription update email:', emailError.message);
      }
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        subscriptionId: updated.id,
        status: updated.status,
      }),
    };
  } catch (error: any) {
    console.error('Stripe update subscription error:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
