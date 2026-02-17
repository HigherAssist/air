import type { VerifyAuthChallengeResponseTriggerHandler } from 'aws-lambda';
import axios from 'axios';

export const handler: VerifyAuthChallengeResponseTriggerHandler = async (
  event
) => {
  const response = await axios.post(
    `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${event.request.challengeAnswer}`,
    {}
  );

  const challengeSucceeded = response?.data?.success;
  event.response.answerCorrect = !!challengeSucceeded;

  if (!challengeSucceeded) {
    throw new Error('CAPTCHA verification error');
  }

  return event;
};
