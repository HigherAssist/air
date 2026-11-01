import toast, { Toast } from 'react-hot-toast';
import { AiOutlineCheckCircle, AiOutlineCloseCircle } from 'react-icons/ai';
import { IoMdClose } from 'react-icons/io';

interface CustomToastProps {
  t: Toast;
  message: string;
  type: 'success' | 'error';
}

const CustomToast = ({ t, message, type }: CustomToastProps) => {
  const Icon =
    type === 'success' ? AiOutlineCheckCircle : AiOutlineCloseCircle;
  const color = type === 'success' ? 'text-green-500' : 'text-red-500';

  return (
    <div
      className={`${
        t.visible ? 'animate-enter' : 'animate-leave'
      } max-w-md w-full bg-white shadow-lg rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5`}
    >
      <div className="flex-1 w-0 p-4">
        <div className="flex items-start">
          <Icon className={`${color} text-xl`} />
          <div className="ml-3 flex-1">
            <p className="text-sm text-gray-900">{message}</p>
          </div>
        </div>
      </div>
      <div className="flex border-l border-gray-200">
        <button
          onClick={() => toast.dismiss(t.id)}
          className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          <IoMdClose />
        </button>
      </div>
    </div>
  );
};

export default CustomToast;
