import { useEffect, useState } from 'react';
import { useAuth, useSubscriptions } from 'shared/hooks';
import { PaymentService, UserService } from 'shared/services';
import { WithSubscription } from 'shared/components';
import { User } from 'shared/types/user';
import { StripeSubscription } from 'shared/types/payment';
import { Modal, Table, Button, Input } from 'antd';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  inviteUserSchema,
  InviteUserType,
} from 'shared/validation-schemas/invite-user';
import {
  editATSSchema,
  EditATSType,
} from 'shared/validation-schemas/edit-ats';
import { ErrorMessage } from 'shared/components';
import { isError, isErrorMessage } from 'shared/utils';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

const Account = () => {
  const { dbUser, refreshUser } = useAuth();
  const { subscriptions, customer, setSubscriptions, setCustomer } = useSubscriptions();
  const [users, setUsers] = useState<User[]>([]);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isATSModalOpen, setIsATSModalOpen] = useState(false);

  const inviteForm = useForm<InviteUserType>({
    resolver: zodResolver(inviteUserSchema),
    mode: 'all',
  });

  const atsForm = useForm<EditATSType>({
    resolver: zodResolver(editATSSchema),
    mode: 'all',
    defaultValues: {
      atsname: dbUser?.atsname || '',
      apikeytype: dbUser?.apikeytype || '',
      apikey1: dbUser?.apikey1 || '',
      apikey2: dbUser?.apikey2 || '',
    },
  });

  useEffect(() => {
    const fetchUsers = async () => {
      if (dbUser?.subscriptionId) {
        try {
          const usersList = await UserService.getDbUserBySubscriptionId(
            dbUser.subscriptionId
          );
          setUsers(usersList);
        } catch (error) {
          console.error(error);
        }
      }
    };
    fetchUsers();
  }, [dbUser]);

  const handleManageBilling = async () => {
    try {
      if (!dbUser?.stripeCustomerId) {
        toast.error('No billing account found. Please subscribe first.');
        return;
      }
      const { url } = await PaymentService.createPortalSession({
        stripeCustomerId: dbUser.stripeCustomerId,
        returnUrl: window.location.href,
      });
      window.location.href = url;
    } catch (error) {
      console.error(error);
      toast.error('Failed to open billing portal.');
    }
  };

  const handleInviteUser = async (values: InviteUserType) => {
    try {
      const user = dbUser as User;
      await UserService.createInvitedUser({
        username: values.email,
        companyName: user.companyName,
        subscriptionId: user.subscriptionId,
        adminFirstName: user.firstName,
        adminLastName: user.lastName,
        adminEmail: user.email,
        atsname: user.atsname,
        apikeytype: user.apikeytype,
        apikey1: user.apikey1,
        apikey2: user.apikey2,
      });
      toast.success('User invited successfully!');
      setIsInviteModalOpen(false);
      inviteForm.reset();
      // Refresh users list and subscription seat count
      const [usersList, { subscriptions: updatedSubs, customer: updatedCustomer }] = await Promise.all([
        UserService.getDbUserBySubscriptionId(user.subscriptionId),
        PaymentService.getUserSubscriptions(user.stripeCustomerId),
      ]);
      setUsers(usersList);
      setSubscriptions(updatedSubs);
      setCustomer(updatedCustomer);
    } catch (error) {
      console.error(error);
      toast.error('Failed to invite user.');
    }
  };

  const handleRemoveUser = async (username: string) => {
    try {
      await UserService.deleteInvitedUser(username);
      toast.success('User removed successfully!');
      if (dbUser?.subscriptionId && dbUser?.stripeCustomerId) {
        const [usersList, { subscriptions: updatedSubs, customer: updatedCustomer }] = await Promise.all([
          UserService.getDbUserBySubscriptionId(dbUser.subscriptionId),
          PaymentService.getUserSubscriptions(dbUser.stripeCustomerId),
        ]);
        setUsers(usersList);
        setSubscriptions(updatedSubs);
        setCustomer(updatedCustomer);
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to remove user.');
    }
  };

  const handleUpdateATS = async (values: EditATSType) => {
    try {
      await UserService.updateDbUser({
        id: dbUser!.id,
        ...values,
      });
      await refreshUser();
      toast.success('ATS configuration updated!');
      setIsATSModalOpen(false);
    } catch (error) {
      console.error(error);
      toast.error('Failed to update ATS configuration.');
    }
  };

  const isAdmin = dbUser?.profileRole === 'Admin';
  const activeSubscription = subscriptions.find(
    (s: StripeSubscription) =>
      s.status === 'active' || s.status === 'trialing'
  );

  const userColumns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (_: any, record: User) => {
        const name = `${record.firstName || ''} ${record.lastName || ''}`.trim();
        return name || 'Unknown';
      },
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      render: (val: string) => val || 'Unknown',
    },
    {
      title: 'Company',
      dataIndex: 'companyName',
      key: 'companyName',
      render: (val: string) => val || 'Unknown',
    },
    {
      title: 'Role',
      dataIndex: 'profileRole',
      key: 'profileRole',
      render: (val: string) => val || 'Unknown',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (val: string) => val || 'Unknown',
    },
    ...(isAdmin
      ? [
          {
            title: 'Action',
            key: 'action',
            render: (_: any, record: User) =>
              record.profileRole !== 'Admin' ? (
                <Button
                  danger
                  size="small"
                  onClick={() => handleRemoveUser(record.email)}
                >
                  Remove
                </Button>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Account</h1>

      {/* Subscription Info */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border">
        <h2 className="text-lg font-semibold mb-4">Subscription</h2>
        {activeSubscription ? (
          <div className="space-y-2">
            <p>
              <strong>Plan:</strong> {activeSubscription.plan.name}
            </p>
            <p>
              <strong>Status:</strong>{' '}
              <span
                className={
                  activeSubscription.status === 'active'
                    ? 'text-green-600'
                    : activeSubscription.status === 'trialing'
                    ? 'text-blue-600'
                    : 'text-red-600'
                }
              >
                {activeSubscription.status}
              </span>
            </p>
            <p>
              <strong>Current Period:</strong>{' '}
              {dayjs.unix(activeSubscription.currentPeriodStart).format('MMM D, YYYY')} -{' '}
              {dayjs.unix(activeSubscription.currentPeriodEnd).format('MMM D, YYYY')}
            </p>
            {activeSubscription.trialEnd && (
              <p>
                <strong>Trial Ends:</strong>{' '}
                {dayjs.unix(activeSubscription.trialEnd).format('MMM D, YYYY')}
              </p>
            )}
            <p>
              <strong>Seats:</strong> {activeSubscription.quantity}
            </p>
            <p>
              <strong>Subscription ID:</strong>{' '}
              <span className="font-mono text-sm text-gray-600">{activeSubscription.id}</span>
            </p>
          </div>
        ) : (
          <p className="text-gray-500">No active subscription found.</p>
        )}

        {isAdmin && (
          <div className="mt-4 space-x-4">
            <Button type="primary" onClick={handleManageBilling}>
              Manage Billing
            </Button>
          </div>
        )}
      </div>

      {/* Team Members — visible to all, actions admin-only */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Team Members</h2>
          {isAdmin && (
            <Button type="primary" onClick={() => setIsInviteModalOpen(true)}>
              Invite User
            </Button>
          )}
        </div>
        <Table
          dataSource={users}
          columns={userColumns}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </div>

      {/* ATS Configuration — visible to all, editable by admin only */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-semibold">ATS Configuration</h2>
              <p className="text-sm text-amber-600">(Must configure ATS in order to access services)</p>
            </div>
            {isAdmin && (
              <Button onClick={() => setIsATSModalOpen(true)}>
                Edit ATS Settings
              </Button>
            )}
          </div>
          <div className="space-y-1 text-sm">
            <p><strong>ATS Name:</strong> {dbUser?.atsname || 'Not configured'}</p>
            <p><strong>API Key Type:</strong> {dbUser?.apikeytype || 'Not configured'}</p>
          </div>
        </div>

      {/* Invite User Modal */}
      <Modal
        title="Invite User"
        open={isInviteModalOpen}
        onCancel={() => setIsInviteModalOpen(false)}
        footer={null}
      >
        <form
          onSubmit={inviteForm.handleSubmit(handleInviteUser)}
          className="space-y-4"
        >
          <div>
            <label>Email</label>
            <Controller
              control={inviteForm.control}
              name="email"
              render={({ field }) => (
                <Input {...field} placeholder="user@example.com" />
              )}
            />
            <ErrorMessage
              message={isErrorMessage('email', inviteForm.formState.errors)}
            />
          </div>
          <div>
            <label>Confirm Email</label>
            <Controller
              control={inviteForm.control}
              name="confirmEmail"
              render={({ field }) => (
                <Input {...field} placeholder="Confirm email" />
              )}
            />
            <ErrorMessage
              message={isErrorMessage(
                'confirmEmail',
                inviteForm.formState.errors
              )}
            />
          </div>
          <Button
            type="primary"
            htmlType="submit"
            loading={inviteForm.formState.isSubmitting}
            block
          >
            Send Invitation
          </Button>
        </form>
      </Modal>

      {/* ATS Modal */}
      <Modal
        title="Edit ATS Configuration"
        open={isATSModalOpen}
        onCancel={() => setIsATSModalOpen(false)}
        footer={null}
      >
        <form
          onSubmit={atsForm.handleSubmit(handleUpdateATS)}
          className="space-y-4"
        >
          <div>
            <label>ATS Name</label>
            <Controller
              control={atsForm.control}
              name="atsname"
              render={({ field }) => (
                <Input {...field} placeholder="ATS Name" />
              )}
            />
            <ErrorMessage
              message={isErrorMessage('atsname', atsForm.formState.errors)}
            />
          </div>
          <div>
            <label>API Key Type</label>
            <Controller
              control={atsForm.control}
              name="apikeytype"
              render={({ field }) => (
                <Input {...field} placeholder="API Key Type" />
              )}
            />
            <ErrorMessage
              message={isErrorMessage('apikeytype', atsForm.formState.errors)}
            />
          </div>
          <div>
            <label>API Key 1</label>
            <Controller
              control={atsForm.control}
              name="apikey1"
              render={({ field }) => (
                <Input.Password {...field} placeholder="API Key 1" />
              )}
            />
            <ErrorMessage
              message={isErrorMessage('apikey1', atsForm.formState.errors)}
            />
          </div>
          <div>
            <label>API Key 2</label>
            <Controller
              control={atsForm.control}
              name="apikey2"
              render={({ field }) => (
                <Input.Password {...field} placeholder="API Key 2" />
              )}
            />
            <ErrorMessage
              message={isErrorMessage('apikey2', atsForm.formState.errors)}
            />
          </div>
          <Button
            type="primary"
            htmlType="submit"
            loading={atsForm.formState.isSubmitting}
            block
          >
            Save ATS Configuration
          </Button>
        </form>
      </Modal>
    </div>
  );
};

export default WithSubscription(Account);
