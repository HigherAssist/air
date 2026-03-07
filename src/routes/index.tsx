import { Suspense, lazy } from 'react';
import { Routes as Router, Route } from 'react-router-dom';
import { Layout } from 'shared/layout';
import SignInError from '../pages/signIn/SignInError';
import { RequireAuth, Spinner } from 'shared/components';

const SignIn = lazy(() => import('pages/signIn/SignIn'));
const Home = lazy(() => import('pages/home/Home'));
const Company = lazy(() => import('pages/company/Company'));
const Contact = lazy(() => import('pages/contact/Contact'));
const Success = lazy(() => import('pages/success/Success'));
const Products = lazy(() => import('pages/products/Products'));
const PrivacyPolicy = lazy(
  () => import('pages/privacy-policy/PrivacyPolicy')
);
const EditProfile = lazy(() => import('pages/edit-profile/EditProfile'));
const Account = lazy(() => import('pages/account/Account'));
const ChangePassword = lazy(
  () => import('pages/change-password/ChangePassword')
);
const Subscribe = lazy(() => import('pages/subscribe/Subscribe'));
const Services = lazy(() => import('pages/services/Services'));
const Sourcing = lazy(() => import('pages/sourcing/Sourcing'));
const Support = lazy(() => import('pages/support/Support'));
const Profile = lazy(() => import('pages/profile/Profile'));
const TermsCondition = lazy(
  () => import('pages/terms-condition/TermsCondition')
);
const InviteSignUp = lazy(() => import('pages/invite-signup/InviteSignUp'));

export const Routes = () => {
  return (
    <Suspense fallback={<Spinner />}>
      <Router>
        <Route path="/" element={<Layout />}>
          {/* private routes */}
          <Route element={<RequireAuth />}>
            <Route path="/account" element={<Account />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route path="/services" element={<Services />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route path="/sourcing" element={<Sourcing />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route path="/support" element={<Support />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route path="/change-password" element={<ChangePassword />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route path="/edit-profile" element={<EditProfile />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route path="/profile" element={<Profile />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route path="/subscribe" element={<Subscribe />} />
          </Route>

          {/* public routes */}
          <Route index element={<Home />} />
          <Route path="/invite-signup" element={<InviteSignUp />} />
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/success" element={<Success />} />
          <Route path="/sign-in-error" element={<SignInError />} />
          <Route path="/company" element={<Company />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/products" element={<Products />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms-condition" element={<TermsCondition />} />

          {/* catch all */}
          <Route path="*" element={<p>Missing Route</p>} />
        </Route>
      </Router>
    </Suspense>
  );
};
