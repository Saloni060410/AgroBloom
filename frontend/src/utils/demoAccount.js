// The public demo farmer. The backend creates it with `npm run db:seed:demo`; override the
// credentials per deployment with VITE_DEMO_EMAIL / VITE_DEMO_PASSWORD. These are sample-data
// credentials that ship in the client bundle by design, so never point them at a real account.
export const DEMO_ACCOUNT = {
  email: import.meta.env.VITE_DEMO_EMAIL || 'kisan@khetgpt.in',
  password: import.meta.env.VITE_DEMO_PASSWORD || 'password123',
}
