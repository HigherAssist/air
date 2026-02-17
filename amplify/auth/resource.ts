import { defineAuth } from '@aws-amplify/backend';
import { preSignup } from '../functions/pre-signup/resource';
import { createAuthChallenge } from '../functions/create-auth-challenge/resource';
import { defineAuthChallenge } from '../functions/define-auth-challenge/resource';
import { verifyAuthChallenge } from '../functions/verify-auth-challenge/resource';

export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  userAttributes: {
    'custom:company_name': {
      dataType: 'String',
      mutable: true,
    },
    'custom:first_name': {
      dataType: 'String',
      mutable: true,
    },
    'custom:last_name': {
      dataType: 'String',
      mutable: true,
    },
    'custom:registration_code': {
      dataType: 'String',
      mutable: true,
    },
    phoneNumber: {
      required: false,
    },
  },
  triggers: {
    preSignUp: preSignup,
    createAuthChallenge,
    defineAuthChallenge,
    verifyAuthChallengeResponse: verifyAuthChallenge,
  },
});
