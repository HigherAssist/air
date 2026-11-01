import type { VerifyAuthChallengeResponseTriggerHandler } from 'aws-lambda';
import axios from 'axios';

export const handler: VerifyAuthChallengeResponseTriggerHandler = async (
  event
) => {
  const response = await axios.post(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    new URLSearchParams({
      secret: process.env.TURNSTILE_SECRET_KEY || '',
      response: event.request.challengeAnswer || '',
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const challengeSucceeded = response?.data?.success;
  event.response.answerCorrect = !!challengeSucceeded;

  if (!challengeSucceeded) {
    throw new Error('Turnstile verification error');
  }

  return event;
};
