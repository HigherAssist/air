import { useNavigate } from 'react-router-dom';

const SignInError = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <h2 className="text-2xl font-bold text-red-600 mb-4">
        Invalid Registration Code
      </h2>
      <p className="text-gray-600 mb-6">
        The registration code you provided is not valid. Please try again with a
        valid code.
      </p>
      <button
        onClick={() => navigate('/sign-in')}
        className="bg-BlueLagoon text-white px-6 py-2 rounded-md hover:opacity-90"
      >
        Try Again
      </button>
    </div>
  );
};

export default SignInError;
