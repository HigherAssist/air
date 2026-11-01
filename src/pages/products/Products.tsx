import { Footer } from 'shared/layout';

const Products = () => {
  return (
    <>
      <section className="py-16 bg-gray-50">
        <div className="text-center container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-3xl font-bold mt-4">
              Built by Recruiters For Recruiters
            </h1>
            <p className="mt-4 text-gray-600 text-lg">
              Discover the power of generative AI to assist HR/Recruiters with
              job hires
            </p>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4">
          <h4 className="text-2xl font-bold mb-2">
            An AI that assists you wherever you need
          </h4>
          <h5 className="text-gray-600 mb-8">
            Modular capabilities you can use at any step in your business process
          </h5>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                title: 'Candidate Sourcing',
                desc: 'Search and find candidates smarter and faster.',
              },
              {
                title: 'Candidate Screening',
                desc: 'High quality job and company specific questions.',
              },
              {
                title: 'Answer Evaluation',
                desc: 'Digitally assess candidate answers for the job.',
              },
              {
                title: 'Best Fit Candidates',
                desc: 'Recommend best candidates from your list.',
              },
              {
                title: 'Candidate Summaries',
                desc: 'Write quality summaries you can edit and send to clients.',
              },
              {
                title: 'JD Externalization',
                desc: 'Automatically re-format job descriptions to remove sensitive information.',
              },
            ].map((item, idx) => (
              <div key={idx} className="bg-white p-6 rounded-lg shadow-sm">
                <h5 className="font-bold text-lg mb-2">{item.title}</h5>
                <p className="text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
};

export default Products;
