# Web download + auto-update wiring

The CI `release` job (`.github/workflows/release.yml`) publishes to GitHub
Releases on `danielosagie/anorha-tray` and marks it **latest**, then adds
version-less stable copies. So these URLs never change across releases:

- Apple Silicon: `https://github.com/danielosagie/anorha-tray/releases/latest/download/Anorha-arm64.dmg`
- Intel:         `https://github.com/danielosagie/anorha-tray/releases/latest/download/Anorha-x64.dmg`

## ⚠️ One decision: repo visibility (gates both download + auto-update)

GitHub release assets + the electron-updater feed are only fetchable WITHOUT a
token if the repo is **public**. Two clean paths:

- **Public repo** (simplest): the URLs above just work; `electron-updater`
  auto-updates with no token. The code is already Apache-2.0 and
  `public-config.ts` holds only client-visible values (no secrets), so this is
  safe. Recommended unless you specifically want the source private.
- **Private repo → host the feed yourself** (you already use R2/S3 for snip):
  switch `publish` in `electron-builder.yml` to
  `provider: generic, url: https://updates.anorha.app/tray/`, have CI upload
  `release/*.dmg`, `release/*.zip`, and `latest-mac.yml` to that bucket, and
  point the web buttons at your own URLs. Keeps the repo private; a bit more setup.

## Web "Download" button (your next-forge app)

Two buttons (browsers can't reliably tell Apple Silicon from Intel):

```tsx
<a href="https://github.com/danielosagie/anorha-tray/releases/latest/download/Anorha-arm64.dmg" download>
  Download for Mac
</a>
<a href="https://github.com/danielosagie/anorha-tray/releases/latest/download/Anorha-x64.dmg" className="muted">
  Intel Mac
</a>
```

### Clean URL (optional) — mirror snip's redirect

Point a tidy path on your domain at the release, so links read
`app.anorha.app/download/mac`. In the web app's `next.config.*`:

```js
async redirects() {
  return [
    { source: '/download/mac',
      destination: 'https://github.com/danielosagie/anorha-tray/releases/latest/download/Anorha-arm64.dmg',
      permanent: false },
    { source: '/download/mac-intel',
      destination: 'https://github.com/danielosagie/anorha-tray/releases/latest/download/Anorha-x64.dmg',
      permanent: false },
  ];
}
```
(Or a `vercel.json` `redirects` entry — same as snip's `/downloads/snip-desktop.dmg`.)

## Auto-update (already wired)

`electron-updater` is in `main.ts` (`maybeCheckForUpdates`, packaged-only) and
reads the `publish` feed in `electron-builder.yml` (`releases/latest`). Once the
repo is public (or the generic feed is live), shipping a new `v*` tag is the
whole update: installed apps pick up `latest-mac.yml`, download in the
background, and install on quit. macOS only applies **signed** updates — which is
exactly what the CI release produces.
