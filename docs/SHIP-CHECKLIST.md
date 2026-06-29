# Ponder Tray — ship checklist

Everything buildable without your credentials is **done, tsc-clean, tested, and
committed** on `build/phase1` (ponder-tray) — and additive/uncommitted in
sssync-bknd. What's left needs your accounts/dashboards or a real device test.

## Journey map — node-by-node status

| # | Node | State | Verified by |
|---|------|-------|-------------|
| 1 | First launch → boots silent to tray | DONE | tsc; auto-show removed in main.ts |
| 2 | Open tray → LinkGate (signed-out) | DONE | preview screenshot |
| 3 | Link account (system browser + 127.0.0.1 loopback; no Clerk in renderer) | DONE | preview render; **needs hosted /desktop-callback page (docs/DESKTOP-CALLBACK-PAGE.md)** |
| 4 | Grant Mac control (Accessibility / Screen Recording) | DONE | preview Settings screenshot (granted dots + Re-check) |
| 5 | Sign in to selling channels (FB/eBay/Posh/Mercari/Google) | DONE | preview Settings screenshot |
| 6 | Name + register this computer (`os.hostname()` default) | DONE | device.ts registerDevice; tests |
| 7 | Linked → Run view, silent | DONE | tsc; preview |
| 8 | Receive command → claim (any-available device) | DONE | device-flow tests (claim/route) |
| 9 | Execute over browser+mouse → result back | DONE | tests (claimComplete/Fail); mobile `useFacebookJobStatus` renders it |
| 10a | Live activity feed (running/done/failed) | DONE | preview TrayFeed screenshot |
| 10b | Offline / recovery tray state | DONE | preview screenshot ("Offline · Queued commands run when you reconnect") |
| 10c | `ponder://` deep link + single-instance focus | DONE | tsc (main-process; not preview-testable) |
| 11a | Multi-computer dispatch — **any available** (the core) | DONE | backend `claimJobs`; tests |
| 11b | Unlink this computer (offboarding) | DONE | preview Settings "This computer" → Unlink; backend `revokeByDevice` |
| 11c | Optional **pin to a specific computer** (enhancement) | BUILT (deploy-gated) | tsc-clean both repos; picker + full targetWorkerId path; needs deploy + 2nd device to behavior-test |
| 12 | Mobile: linked-computers list + online/offline | DONE | ConnectionsScreen "Computers" section (pre-existing) |

Everything testable without a deploy or a 2nd physical device is **built and
verified**. The only open feature is the optional pin-picker (11c), which is
deploy-gated by design (below).

## Done (verified)
- Fork `ponder-tray` (clean signed-tray target; original holo3-agent untouched).
- **Backend secure auth** (sssync-bknd/convex, UNCOMMITTED, UNDEPLOYED): `devices`
  table, `verifyDevice`, `registerDevice`/`revokeDevice`/`revokeByDevice`/`listForUser`,
  device-scoped `claimJobs`/`claim*`/`deviceHeartbeat`, `targetWorkerId` column +
  `claimJobs` filter, `BROWSER_JOBS_REQUIRE_DEVICE` cutover flag on the legacy fns.
- **Desktop**: device-credential consumer (claim*/heartbeat, legacy fallback),
  consumer-on-launch, `device:status/register/unlink` IPC (unlink → backend
  `revokeByDevice` then clears local cred), `ponder://` deep link + single-instance
  focus, Clerk-key passthrough.
- **Renderer (Version B)**: Clerk email→code OTP LinkGate (matches mobile `useSignIn`,
  no template), Activity Feed wired to LIVE dispatched-job events (`onJob` →
  `activity:recent`/`onActivity` → TrayFeed), offline/recovery strip, Settings
  "This computer" → Unlink. Stripped: hero composer, chat overlay, provider/engine
  chooser, narrator, auto-show (boots silent to tray).
- **Phase 2 targeting (producer side)**: `enqueuePonderJob` forwards `targetWorkerId`
  (from `opts` or `payload`); `claimJobs` filters on it.
- **Tests**: `node_modules/.bin/tsx tests/device-flow.test.ts` → 23/23 (device cred,
  config overlay, device-vs-legacy routing, success/fail, heartbeat, velocity-cap
  stress, onJob ordering). Renderer visually verified via the preview harness.

## You must do (true blockers — only you can)
1. **Deploy the backend** to the queue's Convex deployment:
   `cd sssync-bknd && npx convex deploy` (targets merry-buffalo-800; your `.env.local`
   CLI default is a local backend). Review the uncommitted convex diff first, then
   commit. Linking/claiming fails at runtime until this is live.
2. **Host the desktop-callback page** on `app.anorha.app` (sign-in is now
   system-browser + 127.0.0.1 loopback — NO Clerk in the renderer, so no dashboard
   origin/email-code changes needed). Drop in the ~30-line page from
   `docs/DESKTOP-CALLBACK-PAGE.md` (Next.js App Router version provided). Sign-in
   fails until this is live.
3. **Packaging + signing** — SCAFFOLDED (`electron-builder.yml`,
   `build/entitlements.mac.plist`, `electron-updater` wired, `dist:*` scripts; an
   unsigned `npm run dist:dir` builds). Just add creds (see `docs/PACKAGING.md`):
   Apple Developer ID + App Store Connect API key for mac notarize; Azure Trusted
   Signing for Windows; drop `build/icon.icns`+`icon.ico`; set a real `version` +
   the `publish` feed. `appId app.anorha.tray` — keep it stable forever.
4. **Flip the cutover** after the tray ships: set `BROWSER_JOBS_REQUIRE_DEVICE=true`
   in the Convex env to close the legacy bare-`userId` queue path.

## Built but deploy-gated (verify after the steps above)
- **Optional pin-picker (node 11c)** — BUILT, tsc-clean both repos, UNCOMMITTED for review:
  - sssync-bknd: `PublishProductDto.targetWorkerId` (optional); `publishFacebook` passes
    `dto.targetWorkerId` → `adapter.createProduct(..., { targetWorkerId })` → FB adapter
    `createProduct` opts → `enqueuePonderJob(..., opts)` → `browserJobs:create.targetWorkerId`.
  - sssync_mobile_test: `PublishConfirmationModal` shows a "Post from" chip row (Any /
    Computer N + online dot) **only when FB is selected and 2+ computers are linked**;
    the choice rides `onConfirm({ targetWorkerId })` → `confirmAndPublish` → publish body.
  - Picker uses the existing public `computers` (workerPresence, no Clerk-authed query);
    `computers[].workerId === deviceId === claimJobs targetWorkerId match` (verified).
  - Default stays "any available." **Behavior-test needs the backend deployed + a real
    2nd linked computer** (the picker only appears with 2+ live presences). ProductDetail's
    direct re-publish path stays any-available (no picker there yet).
- Trivial: drop the dead `createOverlayWindow` from electron/windows.ts.

## Verify locally
- Renderer UI: `cd ponder-tray && npx vite --config vite.preview.config.ts` → http://localhost:5199 (`?gate=link` LinkGate, `?gate=onboard` onboarding).
- Real app: `npm run dev` (Electron).
- Tests: `node_modules/.bin/tsx tests/device-flow.test.ts`.
