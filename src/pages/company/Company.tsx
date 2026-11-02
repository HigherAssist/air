import { Footer } from 'shared/layout';
import halPhoto from 'assets/images/Hal_ArmsCrossed_Professional.jpg';
import rosannaPhoto from 'assets/images/ArtizenRosanna6412-015.jpg';
import alanPhoto from 'assets/images/AlanMesser.jpg';

const Company = () => {
  return (
    <>
      <section className="py-16 bg-gray-50">
        <div className="text-center container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-3xl font-bold mt-4">
              We are a domain-expertise team of HR and recruiting executives,
              management consultants, and technologists
            </h1>
            <p className="mt-4 text-gray-600 text-lg">
              Our management team has decades of successful corporate
              operations experience
            </p>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="mb-4">
                <img
                  src={halPhoto}
                  alt="Hal"
                  className="max-w-[300px] mx-auto rounded"
                />
              </div>
              <h5 className="font-bold text-lg">
                Hal Kalechofsky, Ph.D., CEO
              </h5>
              <p className="text-gray-600 text-sm mt-2">
                Hal is a career AI and analytics executive and entrepreneur
                with 25 years experience. Hal&apos;s corporate and tech
                consulting history includes AI Solutions leadership positions
                at Coremetrics (acquired by IBM), eBay, Cisco, E2E Analytics
                (acquired by Accenture), and Genpact. He has deep global
                experience leading digital and process transformation across
                a range of industries including Hi-Tech, Financial Services,
                Semiconductor, Retail, and Cloud-Ecommerce. Hal is also
                active as a Limited Partner in a Silicon Valley VC fund.
              </p>
            </div>
            <div className="text-center">
              <div className="mb-4">
                <img
                  src={rosannaPhoto}
                  alt="Rosanna"
                  className="max-w-[300px] mx-auto rounded"
                />
              </div>
              <h5 className="font-bold text-lg">
                Rosanna Hayden, CFO and CRO
              </h5>
              <p className="text-gray-600 text-sm mt-2">
                With over 30 years of leadership experience, Rosanna Hayden
                brings a wealth of knowledge in human resources, strategic
                growth, and business development, including much of that
                time in a CFO capacity. She has directed HR and Sales
                initiatives as a C-Level executive, guiding companies through
                transformative growth. Rosanna&apos;s dedication to the
                staffing and HR industries is reflected in her longstanding
                Director and Board service with California Staffing
                Professionals and PASCO — the Professional Association of
                Sonoma County—advocating for HR excellence across
                California.
              </p>
            </div>
            <div className="text-center">
              <div className="mb-4">
                <img
                  src={alanPhoto}
                  alt="Alan"
                  className="max-w-[300px] mx-auto rounded"
                />
              </div>
              <h5 className="font-bold text-lg">Alan Messer, Ph.D., CTO</h5>
              <p className="text-gray-600 text-sm mt-2">
                Alan has over 25 years of experience in consulting and
                developing innovative products in consumer electronics,
                automotive, and mobile technology. He played key roles in
                delivering software for Digital TVs at Sony, collaborating
                on cloud computing at HP, and developing connected devices
                at Samsung. He also contributed to Smart TV solutions, led
                the architecture of Robotaxis at General Motors, and
                developed predictive maintenance solutions at Mojio. His
                expertise includes AI, cloud platforms, distributed systems,
                IoT, and digital media, with over 100 patents worldwide.
              </p>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
};

export default Company;
