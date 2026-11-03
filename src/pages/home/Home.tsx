import { Link } from 'react-router-dom';
import { Footer } from 'shared/layout';
import heroImage from 'assets/images/hero-question-marks.jpg';
import whatImage from 'assets/images/solution-candidate-grid.jpg';
import approachImage from 'assets/images/hero-specialist-cards.jpg';

const gradText =
  'bg-gradient-to-r from-BlueLagoon to-BrightTurquoise bg-clip-text text-transparent';
const serif = 'font-serif italic font-normal';
const btnBase =
  'group inline-flex items-center justify-center gap-2.5 rounded-full px-6 py-3.5 text-base font-semibold transition duration-300 w-full sm:w-auto';
const btnPrimary = `${btnBase} bg-gradient-to-r from-BlueLagoon to-BrightTurquoise text-white shadow-lg shadow-BlueLagoon/30 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-BlueLagoon/40`;

const Eyebrow = ({
  children,
  className = 'text-BlueLagoon',
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <span
    className={`inline-flex items-center gap-2.5 text-[13px] font-semibold uppercase tracking-[0.12em] ${className}`}
  >
    <span className="h-0.5 w-7 rounded bg-gradient-to-r from-BlueLagoon to-BrightTurquoise" />
    {children}
  </span>
);

const Arrow = () => (
  <span className="transition-transform duration-300 group-hover:translate-x-1">
    →
  </span>
);

const stages = [
  { title: 'Idea', text: 'A clear business opportunity', kind: 'idle' },
  { title: 'Pilot', text: 'Promising demo results', kind: 'stuck' },
  { title: 'Production', text: 'Reliable, safe, integrated', kind: 'live' },
  { title: 'ROI', text: 'Measurable business value', kind: 'live' },
];

const cards = [
  {
    title: 'Applied AI Skills',
    text: 'Task-specific AI capabilities designed around your workflows — accurate, explainable and ready to plug into the systems your teams already use.',
    icon: <path d="M12 2l2.4 4.9L20 8l-4 3.9.9 5.6L12 15l-4.9 2.5.9-5.6L4 8l5.6-1.1z" />,
  },
  {
    title: 'Data Solutions',
    text: 'The pipelines, structure and quality your AI depends on — turning scattered data into a dependable foundation for decisions.',
    icon: (
      <>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
        <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
      </>
    ),
  },
  {
    title: 'Safe by Design',
    text: 'Guardrails, validation and governance built in from day one, so your AI is trustworthy enough to run where it matters.',
    icon: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </>
    ),
  },
];

const steps = [
  {
    title: 'Focus on the outcome',
    text: 'We start with the business result and work back to the right AI and data approach.',
  },
  {
    title: 'Engineer for the real world',
    text: 'Solutions are built against your actual data, systems and constraints — not idealized demos.',
  },
  {
    title: 'Build in safety and trust',
    text: 'Validation, guardrails and transparency make results dependable and auditable.',
  },
  {
    title: 'Deploy, measure, scale',
    text: 'We take it live, track the ROI, and expand what works across the business.',
  },
];

const industries = [
  'Financial Services',
  'Healthcare',
  'Manufacturing',
  'Retail',
  'Technology',
  'Professional Services',
  'Energy',
  'Logistics',
];

const Home = () => {
  return (
    <div className="overflow-x-hidden bg-Alabaster text-gray-800">
      {/* Hero */}
      <section className="relative py-16 lg:py-28">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[720px] w-[720px] rounded-full bg-[radial-gradient(circle,rgba(2,125,149,0.16),transparent_65%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-14 lg:px-8">
          <div>
            <Eyebrow>Applied AI · Data · Results</Eyebrow>
            <h1 className="mb-6 mt-5 text-4xl font-extrabold leading-tight tracking-tight text-DeepSea sm:text-5xl lg:text-6xl">
              Practical, <span className={`${serif} ${gradText}`}>safe</span>{' '}
              AI that solves real-world problems.
            </h1>
            <p className="max-w-xl text-lg text-gray-600 lg:text-xl">
              HireAssist engineers Applied AI skills and data solutions that
              accelerate ROI for client companies across many industries —
              built to work in production, not just in a demo.
            </p>
            <div className="mt-9 flex flex-wrap gap-3.5">
              <Link to="/contact" className={btnPrimary}>
                Start a conversation <Arrow />
              </Link>
              <a
                href="#approach"
                className={`${btnBase} border-[1.5px] border-Iron bg-white text-DeepSea hover:border-BlueLagoon hover:text-BlueLagoon`}
              >
                See how we work
              </a>
            </div>
            <div className="mt-10 flex flex-wrap gap-2.5">
              {['Practical by design', 'Safe & governed', 'ROI-focused'].map(
                (chip) => (
                  <span
                    key={chip}
                    className="inline-flex items-center gap-2 rounded-full border border-Iron bg-white px-3.5 py-2 text-sm font-medium"
                  >
                    <i className="h-2 w-2 rounded-full bg-gradient-to-r from-BlueLagoon to-BrightTurquoise" />
                    {chip}
                  </span>
                )
              )}
            </div>
          </div>

          <div className="relative pb-9">
            <div className="relative aspect-[700/378] overflow-hidden rounded-[22px] bg-DeepSeaLight shadow-[0_40px_90px_-30px_rgba(14,201,201,0.45)]">
              <img
                src={heroImage}
                alt="Hand reaching toward glowing question marks over a city skyline"
                className="absolute inset-0 h-full w-full object-cover"
              />
            </div>
            <div className="absolute bottom-0 right-4 z-10 flex animate-float items-center gap-3.5 rounded-2xl border border-white/70 bg-white/90 px-5 py-4 shadow-xl backdrop-blur-md motion-reduce:animate-none sm:right-6">
              <div className="grid h-[42px] w-[42px] place-items-center rounded-xl bg-gradient-to-r from-BlueLagoon to-BrightTurquoise text-white">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 17l6-6 4 4 8-8" />
                  <path d="M14 7h7v7" />
                </svg>
              </div>
              <div>
                <strong className="block text-[15px] text-DeepSea">
                  From pilot to production
                </strong>
                <span className="text-[13px] text-gray-500">
                  AI that delivers measurable value
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sound familiar? */}
      <section className="relative overflow-hidden bg-DeepSea py-20 text-gray-300 lg:py-32">
        <div className="pointer-events-none absolute -left-40 -top-52 h-[520px] w-[520px] rounded-full bg-BlueLagoon opacity-60 blur-[80px]" />
        <div className="pointer-events-none absolute -bottom-56 -right-36 h-[460px] w-[460px] rounded-full bg-BrightTurquoise opacity-30 blur-[80px]" />
        <div className="relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <Eyebrow className="text-Malibu">Sound familiar?</Eyebrow>
          <h2 className="mx-auto mt-6 max-w-5xl text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl lg:text-6xl">
            Do you have great ideas you want to implement — but your AI keeps
            getting{' '}
            <span className={`${serif} text-BrightTurquoise`}>
              stuck in pilot mode?
            </span>
          </h2>
          <p className="mx-auto mt-7 max-w-2xl text-lg">
            You&apos;re not alone. Promising proofs of concept stall when they
            meet real data, real systems and real governance. That&apos;s
            exactly the gap we close.
          </p>

          <div className="relative mx-auto mt-16 grid max-w-5xl grid-cols-2 gap-y-10 md:grid-cols-4">
            <div className="absolute left-[12.5%] right-[12.5%] top-7 hidden h-0.5 bg-gradient-to-r from-white/15 via-BrightTurquoise to-BlueLagoon md:block" />
            {stages.map((stage, i) => (
              <div key={stage.title} className="relative px-2.5 text-center">
                <div
                  className={`relative z-10 mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full border-2 font-bold ${
                    stage.kind === 'live'
                      ? 'border-transparent bg-gradient-to-r from-BlueLagoon to-BrightTurquoise text-white shadow-[0_0_0_8px_rgba(14,201,201,0.15)]'
                      : stage.kind === 'stuck'
                        ? 'border-YellowSea bg-DeepSeaLight text-YellowSea'
                        : 'border-white/20 bg-DeepSeaLight text-white'
                  }`}
                >
                  {i + 1}
                </div>
                <h4 className="mb-1.5 text-base font-bold text-white">
                  {stage.title}
                </h4>
                <p className="text-sm text-gray-400">{stage.text}</p>
                {stage.kind === 'stuck' && (
                  <span className="mt-2.5 inline-block rounded-full bg-YellowSea/15 px-2.5 py-1 text-xs font-semibold text-YellowSea">
                    Where most stall
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What we do */}
      <section id="services" className="py-20 lg:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-14 grid items-end gap-6 lg:grid-cols-2 lg:gap-14">
            <div>
              <Eyebrow>What we do</Eyebrow>
              <h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-DeepSea sm:text-4xl lg:text-5xl">
                Applied AI, engineered for{' '}
                <span className={`${serif} ${gradText}`}>real outcomes.</span>
              </h2>
            </div>
            <p className="text-lg text-gray-600">
              We combine purpose-built AI skills with the data foundations they
              need, so your ideas move past experimentation and start paying
              back.
            </p>
          </div>

          <div className="grid gap-6">
            <div className="relative aspect-[3/2] overflow-hidden rounded-[22px] bg-Iron shadow-[0_30px_80px_-30px_rgba(6,37,45,0.45)] lg:aspect-[2.2/1]">
              <img
                src={whatImage}
                alt="Hand selecting from a honeycomb of professional profiles"
                className="absolute inset-0 h-full w-full object-cover object-center lg:object-[50%_12%]"
              />
            </div>
            <div className="grid gap-5 lg:grid-cols-3">
              {cards.map((card) => (
                <article
                  key={card.title}
                  className="group relative overflow-hidden rounded-[22px] border border-Iron bg-white p-8 transition duration-300 hover:-translate-y-1 hover:border-transparent hover:shadow-xl"
                >
                  <span className="absolute inset-y-0 left-0 w-1 origin-top scale-y-0 bg-gradient-to-b from-BlueLagoon to-BrightTurquoise transition-transform duration-300 group-hover:scale-y-100" />
                  <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-Iceberg text-BlueLagoon">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      {card.icon}
                    </svg>
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-DeepSea">
                    {card.title}
                  </h3>
                  <p className="text-[15.5px] text-gray-600">{card.text}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Approach */}
      <section
        id="approach"
        className="bg-gradient-to-b from-Alabaster to-Iceberg py-20 lg:py-32"
      >
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
          <div>
            <Eyebrow>How we get you out of pilot mode</Eyebrow>
            <h2 className="my-4 text-3xl font-extrabold leading-tight tracking-tight text-DeepSea sm:text-4xl lg:text-5xl">
              A practical path from{' '}
              <span className={`${serif} ${gradText}`}>idea to impact.</span>
            </h2>
            <p className="mb-9 text-lg text-gray-600">
              Every engagement is built around one question: what will it take
              for this to deliver value in production?
            </p>
            <ol className="border-b border-Iron">
              {steps.map((step, i) => (
                <li
                  key={step.title}
                  className="grid grid-cols-[56px_1fr] gap-4 border-t border-Iron py-5"
                >
                  <span
                    className={`${serif} ${gradText} text-[34px] leading-none`}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h4 className="mb-1 text-lg font-bold text-DeepSea">
                      {step.title}
                    </h4>
                    <p className="text-[15.5px] text-gray-600">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="relative order-first aspect-[1400/787] overflow-hidden rounded-[22px] bg-DeepSeaLight shadow-[0_30px_80px_-30px_rgba(6,37,45,0.45)] lg:order-none lg:aspect-square">
            <img
              src={approachImage}
              alt="Person selecting from rated specialist profile cards at a keyboard"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* Industries */}
      <section
        aria-label="Industries we serve"
        className="overflow-hidden border-y border-Iron bg-white py-16"
      >
        <p className="mb-6 text-center text-sm font-medium text-gray-500">
          Accelerating ROI across many industries
        </p>
        <div
          className="flex w-max animate-marquee motion-reduce:animate-none"
          aria-hidden="true"
        >
          {[...industries, ...industries].map((name, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-8 whitespace-nowrap px-8 text-2xl lg:text-[34px] ${
                i % 2 ? `${serif} text-gray-500` : 'font-bold text-DeepSea'
              }`}
            >
              {name}
              <span className="text-[0.6em] not-italic text-BrightTurquoise">
                ✦
              </span>
            </span>
          ))}
        </div>
      </section>

      {/* Call to action */}
      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-[32px] bg-DeepSea px-6 py-14 text-center text-gray-300 sm:px-14 sm:py-20">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_120%_at_0%_0%,rgba(2,125,149,0.6),transparent_60%),radial-gradient(60%_120%_at_100%_100%,rgba(14,201,201,0.35),transparent_60%)]" />
            <div className="relative">
              <Eyebrow className="text-Malibu">
                Let&apos;s build what&apos;s next
              </Eyebrow>
              <h2 className="mx-auto mb-5 mt-5 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                Ready to move your AI from{' '}
                <span className={`${serif} text-BrightTurquoise`}>
                  pilot to payoff?
                </span>
              </h2>
              <p className="mx-auto mb-9 max-w-xl text-lg">
                Tell us about the idea you want to implement. We&apos;ll show
                you a practical, safe path to getting it into production.
              </p>
              <div className="flex flex-wrap justify-center gap-3.5">
                <Link to="/contact" className={btnPrimary}>
                  Talk to HireAssist <Arrow />
                </Link>
                <a
                  href="#services"
                  className={`${btnBase} border-[1.5px] border-white/30 text-white hover:border-white`}
                >
                  Explore our services
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Home;
