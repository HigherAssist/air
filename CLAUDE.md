# AIR — Project Instructions for Claude

## Meta-Instructions
- Whenever a new convention is established or a permanent instruction is given, update this CLAUDE.md file immediately.
- Before every task, verify the plan against the rules in this CLAUDE.md file.

## Project Overview
AIR is a subscription-based SaaS application with user authentication, billing management, and account administration. Users can sign up, manage subscriptions via Stripe, and administer their account/company profile.

## Tech Stack

### Frontend
- React 18.2 + TypeScript 5.3
- Vite 5.1 (build tool)
- React Router 6.16
- TailwindCSS 3.3 + PostCSS
- Ant Design 5.9 (component library)
- AWS Amplify UI React 6.7 (Cognito auth components)
- React Hook Form 7.47 + Zod 3.22 (form validation)
- Stripe JS (payments)
- Cloudflare Turnstile 1.4 (CAPTCHA — replaced Google reCAPTCHA)
- Zustand 4.4 (state management)
- React Hot Toast 2.4 (notifications)
- Axios 1.6 (HTTP client)

### Backend (AWS Amplify Gen 2)
- AWS Lambda (serverless functions)
- Amazon Cognito (authentication)
- DynamoDB (NoSQL database)
- AppSync GraphQL (data layer)
- API Gateway (custom REST endpoints)
- SES (email)
- AWS CDK (infrastructure as code)

## Project Structure

```
amplify/
  auth/             # Cognito auth config
  data/             # GraphQL schema + DynamoDB models
  storage/          # File storage
  functions/        # Lambda functions (see below)
  backend.ts        # Main CDK backend definition
src/
  pages/            # Route-level page components
  shared/
    types/          # TypeScript interfaces
    enums/          # Plans, subscription status, currency
    components/     # Reusable UI components
    hooks/          # Custom React hooks
    utils/          # Helper functions & API wrappers
    layout/         # Nav, footer, Layout wrapper
  routes/           # Route definitions
  App.tsx
  main.tsx
```

### Path Aliases (Vite + tsconfig)
- `pages/` → `src/pages/`
- `shared/` → `src/shared/`
- `routes/` → `src/routes/`
- `assets/` → `src/assets/`

## Lambda Functions

### Auth Flow
- `pre-signup` — validates registration/invite codes
- `post-confirmation` — creates user in DynamoDB after email confirmation (uses DynamoDB SDK directly, not GraphQL, to avoid circular dependency)
- `create-auth-challenge`, `define-auth-challenge`, `verify-auth-challenge` — custom auth challenge flow

### Stripe Integration
- `stripe-get-plans` — list available subscription plans
- `stripe-create-checkout` — initiate Stripe checkout session
- `stripe-customer-portal` — access billing portal
- `stripe-get-subscriptions` — fetch user subscriptions
- `stripe-webhook` — handle Stripe events (subscription updates, etc.)

### Admin
- `create-cognito-user` — admin user creation
- `get-cognito-user` — admin user lookup
- `delete-admin-user` — admin user deletion

### Other
- `contact-form-trigger` — DynamoDB stream listener → SES email notification
- `send-email-plan-query` — email inquiry endpoint

## Database Schema (AppSync GraphQL)

### User
- firstName, lastName, email, company, phone, role, status
- stripeCustomerId, stripeSubscriptionId
- ATS config fields (apikey, name)
- hasMany UserSubscriptions

### UserSubscription
- subscriptionId, userId, state (active/canceled/trialing)
- planId, planName, planCode
- trialStart/End, billingPeriodStart/End, quantity

### Contact
- name, email, phone, message
- Public API key auth (create/read only)

## Key Architecture Decisions

### REST API Auth
- Use `fetch` directly (not Amplify REST client) to avoid 401 auth issues
- Send Cognito **ID token** (not access token) in Authorization header
- Watch for double-slash path issues in API Gateway URLs

### Circular Dependency Resolution
- Auth stack ↔ data stack circular dependency resolved via SSM parameter bridge
- `post-confirmation` Lambda is assigned to the auth stack and uses DynamoDB SDK directly instead of AppSync/GraphQL

### CAPTCHA
- Cloudflare Turnstile (replaced Google reCAPTCHA)

## Environment Variables
```
VITE_APP_ENV=dev|stage|prod
VITE_AWS_REGION=us-east-1
VITE_TURNSTILE_SITE_KEY=
VITE_STRIPE_PUBLISHABLE_KEY=
VITE_APP_URL=http://localhost:5173
VITE_CHECKOUT_SUCCESS_URL=
VITE_BRANCH=dev
```
Secrets are set via: `npx ampx sandbox secret set KEY_NAME`

## Common Commands
```bash
npm run dev          # Start local dev server (Vite)
npm run build        # Production build → dist/
npx ampx sandbox     # Start Amplify sandbox (local backend)
npx ampx pipeline-deploy  # CI/CD backend deployment
```

## Deployment
- Hosted on AWS Amplify
- CI/CD configured via `amplify.yml`
- Backend deploys with `npx ampx pipeline-deploy`
- Frontend builds to `dist/` with `npm run build`
- Current branch: `dev` | Main branch: `main`

---

## Product/Sourcing — Candidate Sourcing Chatbot

See `memory/sourcing-chatbot.md` for full infrastructure details. Key learnings below.

### Loxo API Response Field Gotchas

These are bugs that have bitten us — always verify against this list before writing new sync code.

**Person status — query param vs response field are different names:**
- Query param for filtering: `?person_global_status_id=30199` ✓ correct
- Response field in both summary (`GET /people`) and full profile (`GET /people/{id}`): `person_global_status` — an **object** `{"id": 30199, "key": "contacted", "name": "Contacted", ...}`
- `person_data.get("person_global_status_id")` always returns `None` — that field does not exist in any response
- Correct extraction: `(person_data.get("person_global_status") or {}).get("id")`

**Job pipeline candidate ID — entry ID vs person ID:**
- `GET /jobs/{id}/candidates` returns a list of pipeline-entry objects
- `entry["id"]` — the pipeline **entry** ID (a Loxo-internal join table ID, NOT a person)
- `entry["person"]["id"]` — the actual **person** ID to use for lookups and DB storage
- Using `entry["id"]` as a person ID will 404 on every `/people/{id}` fetch

**Loxo HTTP retries — never retry 4xx:**
- 4xx errors (especially 404) are deterministic — retrying wastes time
- Only retry on 5xx server errors and network/timeout failures
- See `data_sync/loxo/client.py` `_get()` for the implementation

### Data Sync Architecture

- All candidates synced via `sync_all_candidates()` regardless of status — only `do_not_contact` (30205) and `bad_data` (30206) are excluded
- Candidates with `person_global_status = null` in Loxo are valid and should be synced (they have no status set yet, not excluded)
- `job_pipeline` table stores person IDs (not pipeline entry IDs); no FK on `candidate_id` because pipeline candidates may not exist in our `candidates` table yet
- ECS task definition env vars override `config.py` defaults — check task definition `CANDIDATE_STATUS_IDS` when debugging missing candidates

### ECS / Deploy Pattern
```bash
# Build + push
docker build --platform linux/amd64 -t sourcing-backend:latest -f backend/Dockerfile backend/
aws ecr get-login-password --profile admin --region us-east-2 | docker login --username AWS --password-stdin 457582147377.dkr.ecr.us-east-2.amazonaws.com
docker tag sourcing-backend:latest 457582147377.dkr.ecr.us-east-2.amazonaws.com/sourcing-backend:latest
docker push 457582147377.dkr.ecr.us-east-2.amazonaws.com/sourcing-backend:latest
aws ecs update-service --profile admin --region us-east-2 --cluster sourcing-cluster --service sourcing-backend --force-new-deployment

# One-off script task
aws ecs run-task --profile admin --region us-east-2 \
  --cluster sourcing-cluster --task-definition sourcing-backend --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-06a452ef97af5cab9,subnet-0b23795244b24c43b],securityGroups=[sg-07fe7627aa3c57818],assignPublicIp=ENABLED}" \
  --overrides '{"containerOverrides":[{"name":"sourcing-backend","command":["sh","-c","cd /app && PYTHONPATH=/app python scripts/SCRIPT.py"]}]}'
```
