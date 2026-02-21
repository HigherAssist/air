import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  User: a
    .model({
      firstName: a.string().required(),
      lastName: a.string().required(),
      phoneNumber: a.string().required(),
      email: a.string().required(),
      companyName: a.string().required(),
      profileRole: a.string().required(),
      status: a.string().required(),
      subscriptionId: a.string().required(),
      stripeCustomerId: a.string(),
      inviteToken: a.string(),
      inviteExpiresAt: a.string(),
      invitedBy: a.string(),
      acceptedAt: a.string(),
      activatedAt: a.string(),
      atsname: a.string().required(),
      apikeytype: a.string().required(),
      apikey1: a.string().required(),
      apikey2: a.string().required(),
      subscriptions: a.hasMany('UserSubscription', 'userId'),
    })
    .secondaryIndexes((index) => [
      index('email').sortKeys(['companyName']).queryField('getUserByEmail'),
    ])
    .authorization((allow) => [allow.publicApiKey()]),

  Contact: a
    .model({
      name: a.string().required(),
      email: a.string(),
      phoneNumber: a.string(),
      message: a.string().required(),
    })
    .authorization((allow) => [allow.publicApiKey().to(['create', 'read'])]),

  UserSubscription: a
    .model({
      subscriptionId: a.string().required(),
      userId: a.id().required(),
      user: a.belongsTo('User', 'userId'),
      email: a.string(),
      company: a.string(),
      state: a.string().required(),
      planId: a.string(),
      planName: a.string(),
      planCode: a.string(),
      currentPeriodStart: a.timestamp(),
      currentPeriodEnd: a.timestamp(),
      trialStart: a.timestamp(),
      trialEnd: a.timestamp(),
      canceledAt: a.timestamp(),
      quantity: a.integer().required(),
    })
    .secondaryIndexes((index) => [
      index('subscriptionId')
        .sortKeys(['state'])
        .queryField('getUserSubscriptionBySubscriptionId'),
      index('userId').queryField('userSubscriptionsByUserId'),
    ])
    .authorization((allow) => [allow.publicApiKey()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'apiKey',
    apiKeyAuthorizationMode: {
      expiresInDays: 365,
    },
  },
});
