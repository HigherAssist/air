import { useState } from 'react';
import { Footer } from 'shared/layout';
import { generateClient } from 'aws-amplify/api';

const createContactMutation = /* GraphQL */ `
  mutation CreateContact($input: CreateContactInput!) {
    createContact(input: $input) {
      id name email phoneNumber message
    }
  }
`;

const Contact = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [validationError, setValidationError] = useState('');
  const [sendMessageSuccess, setSendMessageSuccess] = useState(false);
  const [sendMessageError, setSendMessageError] = useState(false);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');
    setSendMessageError(false);
    setSendMessageSuccess(false);

    if (!name || !email || !message) {
      setValidationError('Please complete all required fields');
      return;
    }
    if (!email.includes('@')) {
      setValidationError('Please enter a valid email address');
      return;
    }

    try {
      const client = generateClient();
      await client.graphql({
        query: createContactMutation,
        variables: {
          input: {
            name,
            email,
            phoneNumber: phone,
            message,
          },
        },
        authMode: 'apiKey',
      });
      setSendMessageSuccess(true);
      setName('');
      setEmail('');
      setMessage('');
      setPhone('');
    } catch (error) {
      setSendMessageError(true);
      console.log(error);
    }
  };

  return (
    <>
      <section className="py-16">
        <div className="container mx-auto px-4 max-w-2xl">
          <h1 className="text-3xl font-bold text-center mb-8">Contact Us</h1>
          {sendMessageSuccess && (
            <div className="bg-green-100 text-green-700 p-4 rounded mb-4">
              Your message has been sent successfully!
            </div>
          )}
          {sendMessageError && (
            <div className="bg-red-100 text-red-700 p-4 rounded mb-4">
              There was an error sending your message. Please try again.
            </div>
          )}
          {validationError && (
            <div className="bg-yellow-100 text-yellow-700 p-4 rounded mb-4">
              {validationError}
            </div>
          )}
          <form onSubmit={handleSendMessage} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-2"
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email *
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-2"
                placeholder="your@email.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-2"
                placeholder="Your phone number"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Message *
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                className="w-full border border-gray-300 rounded-md p-2"
                placeholder="Your message"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-BlueLagoon text-white py-2 rounded-md hover:opacity-90"
            >
              Send Message
            </button>
          </form>
        </div>
      </section>
      <Footer />
    </>
  );
};

export default Contact;
