# Packaging & signing — Anorha tray

Scaffold is in place: `electron-builder.yml`, `build/entitlements.mac.plist`,
auto-update wiring (`electron-updater`, packaged-only), and `dist:*` scripts.
What's left is **your accounts + creds** — nothing else blocks a signed build.

## Quick local smoke test (no signing)
```
npm run dist:dir
```
Produces an unpacked `.app` / `.exe` in `release/<version>/` you can launch to
confirm the bundle runs. Native modules (nut-js, node-mac-permissions) are
asar-unpacked; if anything's missing at runtime, tune `files` in
`electron-builder.yml`.

## macOS (signed + notarized DMG)

**Need:** Apple Developer Program ($99/yr) → a **Developer ID Application**
certificate (NOT "Apple Distribution"), and an App Store Connect API key.

Set these env vars, then `npm run dist:mac`:
```
# Signing identity — either a .p12 export…
export CSC_LINK=/absolute/path/DeveloperIDApplication.p12
export CSC_KEY_PASSWORD='p12-password'
#   …or have the "Developer ID Application: <Team>" cert in your login keychain.

# Notarization (App Store Connect API key — no 2FA, no expiry):
export APPLE_API_KEY=/absolute/path/AuthKey_XXXXXXXXXX.p8
export APPLE_API_KEY_ID=XXXXXXXXXX
export APPLE_API_ISSUER=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
export APPLE_TEAM_ID=YOURTEAMID
```
`notarize: true` in the config invokes notarytool automatically (no afterSign
hook). Verify the result:
```
spctl -a -vvv -t install "release/<version>/mac-arm64/Anorha.app"   # → source=Notarized Developer ID
xcrun stapler validate "release/<version>/mac-arm64/Anorha.app"
```

**Permissions reality (this app drives the mouse + reads the screen):**
- **Accessibility** (mouse/click) — pure TCC toggle, granted at first use. No
  entitlement, no plist key. App Sandbox is OFF (correct — sandbox breaks it).
- **Screen Recording** — also TCC, but the `NSScreenCaptureUsageDescription`
  string (already in `electron-builder.yml` → `mac.extendInfo`) is required or
  the prompt is malformed. Already handled.
- Keep the **same Developer ID identity + appId (`app.anorha.tray`) forever**, or
  users re-grant both permissions on every update.

## Windows (signed NSIS installer)

**Recommended:** Azure Trusted Signing (~$10/mo, no hardware token, CI-friendly).
Uncomment + fill `win.azureSignOptions` in `electron-builder.yml`
(`publisherName` MUST equal the cert CommonName exactly), set
`AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET`, then `npm run dist:win`.

Alternatives: OV cert (HSM/token key storage) or EV (note: EV no longer grants
instant SmartScreen trust). New apps show a SmartScreen warning until reputation
accrues — sign **every** release with the same identity so it carries over.

## Auto-update

`electron-updater` is wired and runs only in packaged builds. Before relying on
it, set a real `publish` feed in `electron-builder.yml`:
- GitHub Releases: set `owner`/`repo` (currently `REPLACE_ME`), publish with a
  `GH_TOKEN` env on release.
- Or a generic feed: swap to `provider: generic` + `url:` (e.g. R2/S3).
macOS auto-update only works when the new build satisfies the old build's
signature — hence the mandatory `zip` target alongside the DMG.

## Before first ship
- Drop `build/icon.icns` + `build/icon.ico` (see `build/README.md`).
- Set a real `version` in `package.json` (currently `0.1.0`).
- Confirm the hosted `/desktop-callback` page is live (see
  `docs/DESKTOP-CALLBACK-PAGE.md`) — sign-in depends on it.
- Set the tray's runtime env: `CLERK_PUBLISHABLE_KEY`, `PONDER_API_BASE_URL`,
  `VITE_CONVEX_URL` (queue deployment), optionally `PONDER_WEB_BASE_URL`.
