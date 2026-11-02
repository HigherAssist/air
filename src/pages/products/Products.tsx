import { Footer } from 'shared/layout';

const products = [
  {
    bold: 'The AI Recruiting Assistant AIR that helps your recruiters source and place more qualified candidates',
    text: 'Discover the power of generative AI to assist HR/Recruiters with job hires',
  },
  {
    bold: 'AI Quality Control and Governance Implementation',
    text: 'A package for observability, telemetry, and an AI quality control pipeline to maximize compliance and governance',
  },
  {
    bold: 'Data Monetization Managed Service',
    text: 'Create a new revenue stream from the workflow data your business already generates',
  },
  {
    bold: 'AI Assisted Automated Help Page Generator',
    text: 'Analyzes your internal application UI and automatically builds Job Aids and Help Documentation',
  },
];

const Products = () => {
  return (
    <>
      <section className="py-16 bg-gray-50">
        <div className="text-center container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-3xl font-bold mt-4">
              With extensive business domain expertise, we build applied AI
              products for specialized applications
            </h1>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {products.map((item) => (
              <div
                key={item.bold}
                className="border border-gray-200 rounded-lg p-8 text-left"
              >
                <p className="mb-3">
                  <span className="font-bold">{item.bold}</span>
                </p>
                <p className="text-gray-600">{item.text}</p>
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
