import type { CreateAuthChallengeTriggerHandler } from 'aws-lambda';

export const handler: CreateAuthChallengeTriggerHandler = async (event) => {
  if (
    event.request.session.length === 2 &&
    event.request.challengeName === 'CUSTOM_CHALLENGE'
  ) {
    event.response.publicChallengeParameters = { trigger: 'true' };
    event.response.privateChallengeParameters = { answer: '' };
    event.response.challengeMetadata = 'CAPTCHA_CHALLENGE';
  }
  return event;
};
