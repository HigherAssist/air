import type { DynamoDBStreamHandler } from 'aws-lambda';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const sesClient = new SESClient();

export const handler: DynamoDBStreamHandler = async (event) => {
  for (const record of event.Records) {
    if (record.eventName === 'INSERT' && record.dynamodb?.NewImage) {
      const name = record.dynamodb.NewImage.name?.S || '';
      const email = record.dynamodb.NewImage.email?.S || '';
      const phoneNumber = record.dynamodb.NewImage.phoneNumber?.S || '';
      const message = record.dynamodb.NewImage.message?.S || '';

      await sesClient.send(
        new SendEmailCommand({
          Source: process.env.SES_EMAIL,
          Destination: {
            ToAddresses: [process.env.SES_EMAIL!],
          },
          Message: {
            Subject: {
              Data: 'AIR - New Contact Us form submission',
            },
            Body: {
              Text: {
                Data: `Name: ${name}\nEmail: ${email}\nPhone Number: ${phoneNumber}\nMessage: ${message}`,
              },
            },
          },
        })
      );
    }
  }
  return { status: 'done' } as any;
};
