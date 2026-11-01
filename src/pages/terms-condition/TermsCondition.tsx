import { Footer } from 'shared/layout';

const TermsCondition = () => {
  return (
    <>
      <div className="md:w-2/3 mx-auto p-4">
        <h1 className="text-3xl font-medium mb-2">Terms of Use</h1>
        <Paragraph>
          THESE TERMS AND CONDITIONS OF USE ("Terms of Use") ARE LEGALLY BINDING
          BETWEEN YOU AND AIR ("we", "us", "our") THAT YOU FORM BY ACCESSING ANY
          AREA OF OUR WEBSITE OR ANY AREAS OF SITES THAT LINK TO THESE TERMS OF
          USE ("Website"). YOUR CONTINUED ACCESS OR USE OF THE WEBSITE FOLLOWING
          CHANGES TO THESE TERMS OF USE WILL CONSTITUTE YOUR ACCEPTANCE OF ANY
          CHANGES TO OUR TERMS OF USE.
        </Paragraph>
        <Paragraph>
          THE WEBSITE IS NOT INTENDED FOR CONSUMER OR PRIVATE OR HOUSEHOLD
          PURPOSES, ONLY FOR BUSINESSES.
        </Paragraph>
        <Paragraph>
          BY ACCESSING THE WEBSITE, YOU WARRANT THAT YOU ARE AT LEAST 18 YEARS
          OLD.
        </Paragraph>

        <Heading2>WHO WE ARE AND HOW TO CONTACT US</Heading2>
        <Paragraph>
          To contact us, please email{' '}
          <a className="text-blue-500" href="mailto:operations@air-app.com">
            operations@air-app.com
          </a>
          .
        </Paragraph>

        <Heading2>
          WE MAY MAKE CHANGES TO, SUSPEND OR WITHDRAW OUR WEBSITE
        </Heading2>
        <Paragraph>
          We do not guarantee that our Website, or any content on it, will always
          be available or be uninterrupted. We may suspend, withdraw or restrict
          the availability of all or any part of our Website for business and
          operational reasons.
        </Paragraph>

        <Heading2>PROHIBITED USES</Heading2>
        <Paragraph>
          You may not use our Website to commit any violation of federal, state,
          local, or international laws, regulations, or other governmental
          requirements. We reserve the right to report any activity that may
          violate any law or regulation to appropriate law enforcement officials,
          regulators, or other third parties.
        </Paragraph>

        <Heading2>CONTENT</Heading2>
        <Paragraph>
          We are the owner or the licensee of all intellectual property rights in
          our Website, and in the material published on it. Those works are
          protected by copyright laws and treaties around the world. All such
          rights are reserved.
        </Paragraph>

        <Heading2>LIMITATION OF LIABILITY</Heading2>
        <Paragraph>
          WE WILL NOT BE LIABLE TO YOU FOR ANY LOSS OR DAMAGE, WHETHER IN
          CONTRACT, TORT (INCLUDING NEGLIGENCE), BREACH OF STATUTORY DUTY, OR
          OTHERWISE, EVEN IF FORESEEABLE, ARISING UNDER OR IN CONNECTION WITH USE
          OF, OR INABILITY TO USE, OUR SITE.
        </Paragraph>

        <Heading2>DISCLAIMER</Heading2>
        <Paragraph>
          THE WEBSITE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS. WE
          MAKE NO REPRESENTATIONS OR WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED,
          AS TO THE OPERATION OF THIS WEBSITE OR THE INFORMATION INCLUDED ON THIS
          WEBSITE.
        </Paragraph>

        <Heading2>APPLICABLE LAW</Heading2>
        <Paragraph>
          These Terms of Use shall be governed by, and construed in accordance
          with, the laws of the State of Nevada. Any dispute arising from these
          Terms of Use shall be resolved exclusively in the state and federal
          courts in Nevada.
        </Paragraph>

        <Paragraph>Effective Date: {new Date().getFullYear()}</Paragraph>
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

function Heading2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl font-medium mb-2">{children}</h2>;
}

export default TermsCondition;
