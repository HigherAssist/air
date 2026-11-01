import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="bg-gray-100 py-8 mt-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap justify-center space-x-6 mb-4">
          <Link to="/" className="text-gray-600 hover:text-BlueLagoon text-sm">
            Home
          </Link>
          <Link
            to="/products"
            className="text-gray-600 hover:text-BlueLagoon text-sm"
          >
            Products
          </Link>
          <Link
            to="/company"
            className="text-gray-600 hover:text-BlueLagoon text-sm"
          >
            Company
          </Link>
          <Link
            to="/privacy-policy"
            className="text-gray-600 hover:text-BlueLagoon text-sm"
          >
            Privacy Policy
          </Link>
          <Link
            to="/terms-condition"
            className="text-gray-600 hover:text-BlueLagoon text-sm"
          >
            Terms and Conditions
          </Link>
        </div>
        <p className="text-center text-gray-500 text-sm">
          &copy; {new Date().getFullYear()} AIR. All rights reserved.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
