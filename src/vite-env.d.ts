/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ENV: string;
  readonly VITE_AWS_REGION: string;
  readonly VITE_RECAPTCHA_SITE_KEY: string;
  readonly VITE_STRIPE_PUBLISHABLE_KEY: string;
  readonly VITE_APP_URL: string;
  readonly VITE_CHECKOUT_SUCCESS_URL: string;
  readonly VITE_CHECKOUT_CANCEL_URL: string;
  readonly VITE_BRANCH: string;
  readonly VITE_SERVICES_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
