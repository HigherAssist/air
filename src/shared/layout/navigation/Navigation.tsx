import { Fragment } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, Transition } from '@headlessui/react';
import { signOut } from 'aws-amplify/auth';
import { useAuth } from 'shared/hooks';
import { HiMenu } from 'react-icons/hi';

const Navigation = () => {
  const navigate = useNavigate();
  const { isAuthenticated, dbUser, clearUser } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
      clearUser();
      navigate('/');
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center">
              <span className="text-xl font-bold text-BlueLagoon">AIR</span>
            </Link>
            <div className="hidden md:flex ml-10 space-x-8">
              <Link
                to="/"
                className="text-gray-700 hover:text-BlueLagoon px-3 py-2 text-sm font-medium"
              >
                Home
              </Link>
              <Link
                to="/products"
                className="text-gray-700 hover:text-BlueLagoon px-3 py-2 text-sm font-medium"
              >
                Products
              </Link>
              <Link
                to="/company"
                className="text-gray-700 hover:text-BlueLagoon px-3 py-2 text-sm font-medium"
              >
                Company
              </Link>
              <Link
                to="/contact"
                className="text-gray-700 hover:text-BlueLagoon px-3 py-2 text-sm font-medium"
              >
                Contact
              </Link>
            </div>
          </div>

          <div className="flex items-center">
            {!isAuthenticated ? (
              <Link
                to="/sign-in"
                className="bg-BlueLagoon text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90"
              >
                Sign In
              </Link>
            ) : (
              <Menu as="div" className="relative">
                <Menu.Button className="flex items-center text-gray-700 hover:text-BlueLagoon">
                  <HiMenu className="h-6 w-6" />
                  {dbUser && (
                    <span className="ml-2 text-sm hidden md:inline">
                      {dbUser.firstName} {dbUser.lastName}
                    </span>
                  )}
                </Menu.Button>
                <Transition
                  as={Fragment}
                  enter="transition ease-out duration-100"
                  enterFrom="transform opacity-0 scale-95"
                  enterTo="transform opacity-100 scale-100"
                  leave="transition ease-in duration-75"
                  leaveFrom="transform opacity-100 scale-100"
                  leaveTo="transform opacity-0 scale-95"
                >
                  <Menu.Items className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-50">
                    <div className="py-1">
                      <Menu.Item>
                        {({ active }) => (
                          <Link
                            to="/account"
                            className={`${
                              active ? 'bg-gray-100' : ''
                            } block px-4 py-2 text-sm text-gray-700`}
                          >
                            Account
                          </Link>
                        )}
                      </Menu.Item>
                      <Menu.Item>
                        {({ active }) => (
                          <Link
                            to="/profile"
                            className={`${
                              active ? 'bg-gray-100' : ''
                            } block px-4 py-2 text-sm text-gray-700`}
                          >
                            Profile
                          </Link>
                        )}
                      </Menu.Item>
                      <Menu.Item>
                        {({ active }) => (
                          <Link
                            to="/services"
                            className={`${
                              active ? 'bg-gray-100' : ''
                            } block px-4 py-2 text-sm text-gray-700`}
                          >
                            Services
                          </Link>
                        )}
                      </Menu.Item>
                      <Menu.Item>
                        {({ active }) => (
                          <Link
                            to="/support"
                            className={`${
                              active ? 'bg-gray-100' : ''
                            } block px-4 py-2 text-sm text-gray-700`}
                          >
                            Support
                          </Link>
                        )}
                      </Menu.Item>
                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={handleSignOut}
                            className={`${
                              active ? 'bg-gray-100' : ''
                            } block w-full text-left px-4 py-2 text-sm text-gray-700`}
                          >
                            Sign Out
                          </button>
                        )}
                      </Menu.Item>
                    </div>
                  </Menu.Items>
                </Transition>
              </Menu>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
