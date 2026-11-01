import type { APIGatewayProxyHandler } from 'aws-lambda';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const sesClient = new SESClient();

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const user = JSON.parse(event.body || '{}');

    await sesClient.send(
      new SendEmailCommand({
        Source: process.env.SES_EMAIL,
        Destination: {
          ToAddresses: [process.env.SES_EMAIL!],
        },
        Message: {
          Subject: {
            Data: `Sales plan inquiry from ${user.email}`,
          },
          Body: {
            Text: {
              Data: `The user ${user.firstName} ${user.lastName} at company, ${user.companyName} has a question about the plans.`,
            },
          },
        },
      })
    );

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
      },
      body: JSON.stringify({ message: 'Email sent successfully!' }),
    };
  } catch (error: any) {
    console.error(error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
      },
      body: JSON.stringify({ error: error.message || 'Something went wrong' }),
    };
  }
};
