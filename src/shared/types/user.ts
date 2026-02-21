export type CreateInviteUser = {
  username: string;
  companyName: string;
  subscriptionId: string;
  adminFirstName: string;
  adminLastName: string;
  adminEmail: string;
  atsname: string;
  apikeytype: string;
  apikey1: string;
  apikey2: string;
};

export type User = {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
  companyName: string;
  profileRole: string;
  status: string;
  subscriptionId: string;
  stripeCustomerId?: string;
  inviteToken?: string;
  inviteExpiresAt?: string;
  invitedBy?: string;
  acceptedAt?: string;
  activatedAt?: string;
  atsname: string;
  apikeytype: string;
  apikey1: string;
  apikey2: string;
  createdAt?: string;
  updatedAt?: string;
};
