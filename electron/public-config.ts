/**
 * Public production config, baked into the build.
 *
 * The packaged app launched from Finder has NO project .env on its cwd, so the
 * cwd-based dotenv in main.ts only covers `npm run dev`. Without these defaults a
 * Finder-launched build boots with null Convex/API/Clerk config and device
 * linking + the queue consumer silently die. Every value here is PUBLIC
 * (client-visible: the Convex queue URL, the Clerk publishable key, the public
 * API + web base) — NO secrets. An env var of the same name still wins, so dev
 * and staging override freely.
 */
export const PUBLIC_CONFIG = {
  /** sssync-bknd queue deployment (devices/browserJobs/claim*). */
  convexUrl: "https://merry-buffalo-800.convex.cloud",
  /** Prod Clerk instance (clerk.app.anorha.app). */
  clerkPublishableKey: "pk_live_Y2xlcmsuYXBwLmFub3JoYS5hcHAk",
  /** Backend REST (org lookup, reconcile). */
  apiBaseUrl: "https://api.sssync.app",
  /** Web app that hosts /desktop-callback (a real Clerk subdomain). */
  webBaseUrl: "https://app.anorha.app",
} as const;
