import type { DynamoDBStreamHandler } from 'aws-lambda';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const sesClient = new SESClient({});

export const handler: DynamoDBStreamHandler = async (event) => {
  for (const record of event.Records) {
    if (record.eventName !== 'INSERT' || !record.dynamodb?.NewImage) continue;

    const image = record.dynamodb.NewImage;
    const name = image.name?.S || '';
    const email = image.email?.S || '';
    const phoneNumber = image.phoneNumber?.S || '';
    const message = image.message?.S || '';

    const sesEmail = process.env.SES_EMAIL;
    if (!sesEmail) {
      console.error('SES_EMAIL environment variable is not set');
      continue;
    }

    try {
      await sesClient.send(
        new SendEmailCommand({
          Source: sesEmail,
          Destination: { ToAddresses: [sesEmail] },
          Message: {
            Subject: {
              Data: 'AIR: New message from Contact Us form',
            },
            Body: {
              Text: {
                Data: `Name: ${name}\nEmail: ${email}\nPhone: ${phoneNumber}\nMessage:\n${message}`,
              },
            },
          },
        })
      );
      console.log(`Contact form email sent for ${email}`);
    } catch (error) {
      console.error('Failed to send contact form email:', error);
    }
  }

  return { batchItemFailures: [] };
};
