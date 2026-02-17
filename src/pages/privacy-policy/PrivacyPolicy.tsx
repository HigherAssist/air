import { useNavigate } from 'react-router-dom';
import { Footer } from 'shared/layout';

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  const handleContactUsRedirect = () => {
    navigate('/company');
  };

  return (
    <>
      <div className="md:w-2/3 mx-auto p-4">
        <h1 className="text-3xl font-medium mb-2">Who we are</h1>
        <Paragraph>
          We are AIR. Our website address is:{' '}
          <span className="text-blue-500">https://air-app.com</span>.
        </Paragraph>

        <h1 className="text-3xl font-medium mb-2">Privacy Policy</h1>
        <Paragraph>
          Your privacy is important to us. It is AIR's policy to respect your
          privacy regarding any information we may collect from you across our
          website and other sites or applications we own and operate.
        </Paragraph>

        <Paragraph>
          We only ask for personal information when we truly need it to provide a
          service to you. We collect it by fair and lawful means, with your
          knowledge and consent. We also let you know why we're collecting it and
          how it will be used.
        </Paragraph>

        <Paragraph>
          We only retain collected information for as long as necessary to
          provide you with your requested service. What data we store, we'll
          protect within commercially acceptable means to prevent loss and theft,
          as well as unauthorised access, disclosure, copying, use or
          modification.
        </Paragraph>

        <Paragraph>
          We don't share any personally identifying information publicly or with
          third-parties, except when required to by law.
        </Paragraph>

        <Paragraph>
          Our website may link to external sites that are not operated by us.
          Please be aware that we have no control over the content and practices
          of these sites, and cannot accept responsibility or liability for their
          respective privacy policies.
        </Paragraph>

        <Paragraph>
          You are free to refuse our request for your personal information, with
          the understanding that we may be unable to provide you with some of
          your desired services.
        </Paragraph>

        <Paragraph>
          Your continued use of our website will be regarded as acceptance of our
          practices around privacy and personal information. If you have any
          questions about how we handle user data and personal information, feel
          free to{' '}
          <span
            className="text-blue-500 cursor-pointer"
            onClick={handleContactUsRedirect}
          >
            contact us
          </span>
          .
        </Paragraph>

        <Paragraph>This policy is effective as of {new Date().getFullYear()}.</Paragraph>
      </div>
      <Footer />
    </>
  );
};

function Paragraph({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{ fontFamily: 'Arial, sans-serif', lineHeight: 1.6 }}
      className="mb-5"
    >
      {children}
    </p>
  );
}

export default PrivacyPolicy;
