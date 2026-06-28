# Ponder Tray — ship checklist

Everything buildable without your credentials is **done, tsc-clean, tested, and
committed** on `build/phase1` (ponder-tray) — and additive/uncommitted in
sssync-bknd. What's left needs your accounts/dashboards or a real device test.

## Done (verified)
- Fork `ponder-tray` (clean signed-tray target; original holo3-agent untouched).
- **Backend secure auth** (sssync-bknd/convex, UNCOMMITTED, UNDEPLOYED): `devices`
  table, `verifyDevice`, `registerDevice`/`revokeDevice`/`listForUser`, device-scoped
  `claimJobs`/`claim*`/`deviceHeartbeat`, `targetWorkerId` column + `claimJobs`
  filter, `BROWSER_JOBS_REQUIRE_DEVICE` cutover flag on the legacy fns.
- **Desktop**: device-credential consumer (claim*/heartbeat, legacy fallback),
  consumer-on-launch, `device:status/register/unlink` IPC, Clerk-key passthrough.
- **Renderer (Version B)**: Activity Feed wired to LIVE dispatched-job events
  (`onJob` → `activity:recent`/`onActivity` → TrayFeed), device-link gate, LinkGate
  placeholder. Stripped: hero composer, chat overlay, provider/engine chooser,
  narrator, auto-show (boots silent to tray).
- **Phase 2 targeting (producer side)**: `enqueuePonderJob` forwards `targetWorkerId`.
- **Tests**: `node_modules/.bin/tsx tests/device-flow.test.ts` → 23/23 (device cred,
  config overlay, device-vs-legacy routing, success/fail, heartbeat, velocity-cap
  stress, onJob ordering). Renderer visually verified via the preview harness.

## You must do (true blockers)
1. **Deploy the backend** to the queue's Convex deployment:
   `cd sssync-bknd && npx convex deploy` (targets merry-buffalo-800; your `.env.local`
   CLI default is a local backend). Review the uncommitted convex diff first, then
   commit. Linking/claiming fails at runtime until this is live.
2. **Clerk OAuth** for the desktop LinkGate (currently a placeholder "Sign in"):
   in the Clerk dashboard (prod instance clerk.app.anorha.app) add the desktop
   redirect/allowed-origin for the system-browser OAuth flow, then implement the
   button → `getToken()` (no template) → `window.agent.registerDevice({clerkToken,name})`.
   Needs a live round-trip to verify — best done together.
3. **Packaging + signing**: add electron-builder (appId, icon, hardened-runtime
   entitlements + Accessibility/Screen-Recording usage strings), Developer-ID sign +
   notarize (your Apple acct), Windows native input layer + cert, then DMG/installer
   + auto-update.
4. **Flip the cutover** after the tray ships: set `BROWSER_JOBS_REQUIRE_DEVICE=true`
   in the Convex env to close the legacy bare-`userId` queue path.

## Next (autonomous-able once backend is deployed)
- Mobile device-picker UI (sssync_mobile_test): list `devices:listForUser`, pass the
  chosen deviceId as `targetWorkerId` on publish (backend producer already forwards it).
- Trivial: drop the dead `createOverlayWindow` from electron/windows.ts.

## Verify locally
- Renderer UI: `cd ponder-tray && npx vite --config vite.preview.config.ts` → http://localhost:5199 (`?gate=link` LinkGate, `?gate=onboard` onboarding).
- Real app: `npm run dev` (Electron).
- Tests: `node_modules/.bin/tsx tests/device-flow.test.ts`.
