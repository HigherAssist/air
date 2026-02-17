import { Footer } from 'shared/layout';

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
              Our management team has decades of successful corporate operations
              experience
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
                  src="assets/images/Hal_ArmsCrossed_Professional.jpg"
                  alt="CEO"
                  className="max-w-[300px] mx-auto rounded"
                />
              </div>
              <h5 className="font-bold text-lg">CEO</h5>
              <p className="text-gray-600 text-sm mt-2">
                A career AI and analytics executive and entrepreneur with 25
                years experience in digital and process transformation across
                Hi-Tech, Financial Services, Semiconductor, Retail, and
                Cloud-Ecommerce.
              </p>
            </div>
            <div className="text-center">
              <div className="mb-4">
                <img
                  src="assets/images/ArtizenRosanna6412-015.jpg"
                  alt="CFO and CRO"
                  className="max-w-[300px] mx-auto rounded"
                />
              </div>
              <h5 className="font-bold text-lg">CFO and CRO</h5>
              <p className="text-gray-600 text-sm mt-2">
                Over 30 years of leadership experience in human resources,
                strategic growth, and business development, including extensive
                CFO experience guiding companies through transformative growth.
              </p>
            </div>
            <div className="text-center">
              <div className="mb-4">
                <img
                  src="assets/images/AlanMesser.jpg"
                  alt="CTO"
                  className="max-w-[300px] mx-auto rounded"
                />
              </div>
              <h5 className="font-bold text-lg">CTO</h5>
              <p className="text-gray-600 text-sm mt-2">
                Over 25 years of experience in consulting and developing
                innovative products including AI, cloud platforms, distributed
                systems, IoT, and digital media, with over 100 patents
                worldwide.
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
