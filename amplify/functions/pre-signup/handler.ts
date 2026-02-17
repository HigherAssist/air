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

  // Verify reCAPTCHA
  try {
    const payload = {
      secret: process.env.RECAPTCHA_SECRET_KEY,
      response: event.request.validationData.captcha,
      remoteip: undefined,
    };
    const verifyResponse = await axios({
      method: 'post',
      url: 'https://www.google.com/recaptcha/api/siteverify',
      params: payload,
    });
    console.log('reCAPTCHA verifyResponse:', verifyResponse.data);
    if (!verifyResponse.data.success) {
      throw new Error('reCAPTCHA verification failed');
    }
  } catch (error) {
    console.error('reCAPTCHA error:', error);
    throw error;
  }

  return event;
};
