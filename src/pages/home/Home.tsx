import { Footer } from 'shared/layout';
import heroImage from 'assets/images/hero-specialist-cards.jpg';
import problemImage from 'assets/images/problem-burnout.jpg';
import solutionImage from 'assets/images/solution-candidate-grid.jpg';

const Home = () => {
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
              <h1 className="text-4xl font-bold mt-4">
                Intelligence is what you use when you don&apos;t know what to
                do.
              </h1>
              <p className="mt-6 text-4xl font-bold opacity-90">
                HireAssist powers the AI economy with human+digital
                intelligence
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-bold">
              Applied AI skills and data solutions to accelerate ROI
            </h3>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="rounded-lg overflow-hidden shadow-sm">
              <img
                src={problemImage}
                alt="Recruiter overwhelmed by manual work"
                className="w-full h-56 object-cover"
              />
              <div className="p-6 bg-white">
                <h5 className="text-xl font-bold mb-3 text-left">
                  The Problem
                </h5>
                <p className="text-gray-600 text-left">
                  Finding a job is hard and time-consuming, both for the
                  job-seeker as well as for the recruiting and staffing
                  industry and HR departments.
                </p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-6">
              <h5 className="text-xl font-bold mb-3 text-left">
                Some Numbers
              </h5>
              <p className="text-gray-600 text-left">
                It takes an average of 44 days to fill an open position at US
                companies, with costs ranging from $4-5K per hire.
                <br />
                <br />
                The job order fill rate in the recruiting industry averages
                24 - 39%.
                <br />
                <br />
                Typical staffing companies spend about 56% of their gross
                profit on payroll
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-6">
              <h5 className="text-xl font-bold mb-3 text-left">
                Industry CareAbouts
              </h5>
              <p className="text-gray-600 text-left">
                Reduce time-to-hire from receipt to submittal (placement)
                <br />
                <br />
                Increase personnel productivity
                <br />
                <br />
                Increase job order fill rates and placements quality
                <br />
                <br />
                Improve staff readiness and satisfaction
              </p>
            </div>

            <div className="rounded-lg overflow-hidden shadow-sm">
              <img
                src={solutionImage}
                alt="AI matching the right candidates"
                className="w-full h-56 object-cover"
              />
              <div className="p-6 bg-white">
                <h5 className="text-xl font-bold mb-3 text-left">
                  Solution: Improve the Hiring Process with AI
                </h5>
                <p className="text-gray-600 text-left">
                  Through purpose-built application of AI, the recruiting and
                  staffing industry can improve bottom-line financials and
                  overall productivity as well as candidate and staff
                  experiences
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
};

export default Home;
