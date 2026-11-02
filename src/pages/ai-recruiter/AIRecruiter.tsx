import { Footer } from 'shared/layout';
import heroImage from 'assets/images/hero-specialist-cards.jpg';
import sourcingImage from 'assets/images/feature-sourcing.jpg';
import screeningImage from 'assets/images/feature-screening.jpg';
import evaluationImage from 'assets/images/feature-evaluation.jpg';
import bestFitImage from 'assets/images/feature-bestfit.jpg';
import summariesImage from 'assets/images/feature-summaries.jpg';
import jdExternalizationImage from 'assets/images/feature-jdexternalization.jpg';

const features = [
  {
    image: sourcingImage,
    title: 'Candidate Sourcing',
    desc: 'Search and find candidates smarter and faster.',
  },
  {
    image: screeningImage,
    title: 'Candidate Screening',
    desc: 'High quality job and company specific questions.',
  },
  {
    image: evaluationImage,
    title: 'Answer Evaluation',
    desc: 'Digitally assess candidate answers for the job.',
  },
  {
    image: bestFitImage,
    title: 'Best Fit Candidates',
    desc: 'Recommend best candidates from your list.',
  },
  {
    image: summariesImage,
    title: 'Candidate Summaries',
    desc: 'Write quality summaries you can edit and send to clients',
  },
  {
    image: jdExternalizationImage,
    title: 'JD Externalization',
    desc: 'Automatically re-format job descriptions to remove sensitive information.',
  },
];

const AIRecruiter = () => {
  return (
    <>
      <section className="py-20">
        <div className="text-center container mx-auto px-4">
          <div className="row justify-content-center mb-4">
            <div className="max-w-xl mx-auto">
              <img
                src={heroImage}
                alt="AI matching recruiters with specialist candidates"
                className="rounded-lg shadow-lg"
              />
            </div>
          </div>
          <div className="row justify-content-center">
            <div className="max-w-3xl mx-auto">
              <h1 className="text-3xl font-bold mt-4">
                Built by Recruiters For Recruiters
              </h1>
              <p className="mt-4 text-gray-600 text-lg">
                Discover the power of generative AI to assist HR/Recruiters
                with job hires
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="mb-10 text-left">
            <h4 className="text-2xl font-bold mb-2">
              An AI that assists you wherever you need
            </h4>
            <h5 className="text-gray-600">
              Modular capabilities you can use at any step in your business
              process
            </h5>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((item) => (
              <div
                key={item.title}
                className="rounded-lg overflow-hidden shadow-sm"
              >
                <img
                  src={item.image}
                  alt={item.title}
                  className="w-full h-48 object-cover"
                />
                <div className="p-6 bg-white">
                  <h5 className="font-bold text-lg mb-2 text-left">
                    {item.title}
                  </h5>
                  <p className="text-gray-600 text-left">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="aspect-video max-w-4xl mx-auto">
            <iframe
              className="w-full h-full rounded-lg shadow-lg"
              src="https://www.youtube.com/embed/7H7fMiOXr-A"
              title="Embedded youtube"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
};

export default AIRecruiter;
