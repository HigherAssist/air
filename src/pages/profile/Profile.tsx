import { Link } from 'react-router-dom';
import { useAuth } from 'shared/hooks';
import { WithSubscription } from 'shared/components';

const Profile = () => {
  const { dbUser } = useAuth();

  if (!dbUser) return null;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">My Profile</h1>
      <div className="bg-white rounded-lg shadow-sm p-6 border">
        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-500">First Name</label>
            <p className="font-medium">{dbUser.firstName}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Last Name</label>
            <p className="font-medium">{dbUser.lastName}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Email</label>
            <p className="font-medium">{dbUser.email}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Company</label>
            <p className="font-medium">{dbUser.companyName}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Phone Number</label>
            <p className="font-medium">{dbUser.phoneNumber || 'Not set'}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Role</label>
            <p className="font-medium">{dbUser.profileRole}</p>
          </div>
        </div>
        <div className="mt-6">
          <Link
            to="/edit-profile"
            className="bg-BlueLagoon text-white px-4 py-2 rounded-md hover:opacity-90"
          >
            Edit Personal Info
          </Link>
        </div>
      </div>
    </div>
  );
};

export default WithSubscription(Profile);
