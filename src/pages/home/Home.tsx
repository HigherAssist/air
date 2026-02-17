import { Footer } from 'shared/layout';

const Home = () => {
  return (
    <>
      <section className="bg-BlueLagoon text-white py-20">
        <div className="text-center container mx-auto px-4">
          <div className="row justify-content-center">
            <div className="max-w-3xl mx-auto">
              <h1 className="text-4xl font-bold mt-4">
                AI-Powered Recruiting Assistant
              </h1>
              <p className="mt-6 text-lg opacity-90">
                Discover the power of generative AI to assist HR/Recruiters with
                job hires. Built by recruiters, for recruiters.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-6">The Problem</h2>
            <p className="text-gray-600 text-lg mb-4">
              Recruiting firms spend enormous resources on manual processes that
              are time-consuming and error-prone. From sourcing candidates to
              screening resumes to evaluating interviews, every step requires
              significant human effort.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-6">The Solution</h2>
            <p className="text-gray-600 text-lg mb-4">
              AIR uses cutting-edge AI to automate and enhance every stage of the
              recruiting workflow. From generating search terms for candidate
              sourcing to writing candidate summaries, AIR helps recruiters work
              smarter and faster.
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
};

export default Home;
