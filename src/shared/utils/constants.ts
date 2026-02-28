// REST API name — this will be replaced with the actual API Gateway name from amplify_outputs.json
// In Gen 2, you can use the custom output or a hardcoded reference
export const API_NAME = 'AirRestApi';

// Registration codes are now managed via environment secrets (Lambda-side)
// These are kept here only for frontend display/reference if needed
export const registrationCodes = [
  'Beta_Customer_R1',
  'Beta_Customer_R2',
  'Beta_Customer_R3',
];

export const pricingPlanCheckListItems = [
  'Sourcing search term generation',
  'External JD formatting',
  'Client preferred JD must-haves',
  'Automated screening questions',
  'Candidate interview answer evaluation',
  'Candidate best fit recommendation',
  'Candidate summary documentation',
  'Candidate placement prediction',
  'Read-only integration with ATS data',
];

export const pricingPlanCheckListItemsDescription = [
  'Reads in job description (JD) and company information to automatically generate search terms usable in candidate sourcing tools such as LinkedIn Recruiter, Indeed, Dice, etc.',
  'Re-format internal job description to an acceptable external format without sensitive information',
  'Ability to understand and make use of preferred client must-haves from job description',
  'Generates good automated screening questions from JD + resume + Company info which makes it faster and better quality for recruiters and hiring managers',
  'Read-only integration with your ATS for job, candidate, resume, and client company data to help with better more fine-tuned recruiter assistance',
  'Evaluating the candidate answers to interview questions',
  'Recommends "best fit" candidates from a list of potential applicants which provides good guidance to the recruiter.',
  'Writes the candidate summary for the recruiter that is sent to the client when a candidate is proposed',
  'Ability to use past placement as training on which candidates are likely to be successful for given types of jobs',
];

const startPlanCheckListItems = [
  ...pricingPlanCheckListItems.slice(0, 5),
  ...Array(3).fill('#'),
  ...pricingPlanCheckListItems.slice(8, 9),
];
const professionalPlanCheckListItems = [
  ...Array(5).fill('repeat'),
  ...pricingPlanCheckListItems.slice(5, 6),
  ...Array(2).fill('#'),
  ...pricingPlanCheckListItems.slice(8, 9),
];
const enterprisePlanCheckListItems = [
  ...Array(6).fill('repeat'),
  ...pricingPlanCheckListItems.slice(6, 9),
];
export const pricingPlansCheckList = [
  startPlanCheckListItems,
  professionalPlanCheckListItems,
  enterprisePlanCheckListItems,
];
