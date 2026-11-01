import type { PreSignUpTriggerHandler } from 'aws-lambda';
import axios from 'axios';

export const handler: PreSignUpTriggerHandler = async (event) => {
  console.log('PreSignUp event:', JSON.stringify(event));

  // Skip validation for admin-created users (invited users)
  if (event.triggerSource === 'PreSignUp_AdminCreateUser') {
    return event;
  }

  if (!event.request.validationData) {
    throw new Error('Missing validation data');
  }

  // Verify Cloudflare Turnstile
  try {
    const verifyResponse = await axios({
      method: 'post',
      url: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET_KEY || '',
        response: event.request.validationData.turnstileToken || '',
      }).toString(),
    });
    console.log('Turnstile verifyResponse:', verifyResponse.data);
    if (!verifyResponse.data.success) {
      throw new Error('Turnstile verification failed');
    }
  } catch (error) {
    console.error('Turnstile error:', error);
    throw error;
  }

  return event;
};
