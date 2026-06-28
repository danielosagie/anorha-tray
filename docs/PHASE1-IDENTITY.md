# Phase 1 — Identity + secure job claim

Goal: a linked computer is bound to a real account and only it can drain/complete
that account's jobs. Close the hole where any `userId` arg drains the queue
(`sssync-bknd/convex/browserJobs.ts` getRetryable/start/complete/fail are public,
userId-as-arg, no `ctx.auth`).

## Decision: device-credential capability (NOT live Clerk JWT on desktop)

A background tray can't cleanly keep a ~60s Convex/Clerk JWT fresh. So Clerk is
used **once at link time**; ongoing queue auth is a long-lived per-device secret.

Flow:
1. Desktop sign-in via Clerk (renderer `@clerk/clerk-js`, OAuth in system browser) →
   short-lived Clerk session token.
2. Desktop calls `registerDevice` **authenticated by the Clerk token** → backend
   resolves `userId` from `ctx.auth.getUserIdentity()`, creates a `devices` row,
   returns `{ deviceId, deviceSecret }` (secret shown once; store **hash** only).
3. Desktop persists `deviceId` + `deviceSecret` (e.g. `~/.ponder/device.json`,
   chmod 600). All later queue ops send `{ deviceId, deviceSecret }`; backend
   verifies (constant-time) + resolves userId + checks `job.userId === device.userId`.
   No further Clerk token needed → survives restarts/offline.

## Backend (sssync-bknd/convex) — additive, non-breaking

- New `devices` table: `userId, orgId, deviceId (unique), secretHash, name,
  platform, createdAt, lastSeenAt, revokedAt?`; index `by_deviceId`, `by_user`.
- `registerDevice` (mutation, Clerk-auth): mint deviceId + secret, store
  `secretHash` (sha256), return secret once. Re-link reuses/rotates.
- `revokeDevice` (mutation, Clerk-auth OR device-auth): set `revokedAt` (offboarding).
- `verifyDevice(ctx, deviceId, deviceSecret)` helper → returns `{userId, orgId}` or throws.
- Device-scoped queue fns the FORK uses: `claimJobs({deviceId, deviceSecret, targetWorkerId?})`
  (replaces getRetryable for desktop; scopes to device.userId + optional targetWorkerId),
  and `startJob/completeJob/failJob/heartbeat` gain `{deviceId, deviceSecret}` and
  verify cred + `job.userId === device.userId`.
- Migration: keep legacy getRetryable/start/complete/fail for now (mobile create /
  getForUser untouched). Gate hard-cutover behind env `BROWSER_JOBS_REQUIRE_DEVICE`
  (default off → non-breaking; flip on after the fork ships, then delete legacy).
- `targetWorkerId` column on browserJobs (Phase 2 routing) — add to schema now,
  filter in `claimJobs`.

## Desktop (ponder-tray) — next

- Renderer: Clerk sign-in screen (onboarding step 1) → token → IPC to main.
- Main: `registerDevice` call → persist device.json; consumer/config.ts uses
  device cred instead of `PONDER_BROWSER_JOBS_SYNC_TOKEN` + bare userId.
- `consumer.ts`: subscribe `claimJobs` (was `getRetryable`); send cred on
  start/complete/fail + heartbeat. `workerId` stays = device name for targeting.

## Do NOT

- Don't hard-remove legacy queue fns until the fork is deployed + flag flipped.
- Don't store the raw deviceSecret server-side (hash only).
- Don't deploy convex from here — implement + tsc-clean, leave deploy to the user.
