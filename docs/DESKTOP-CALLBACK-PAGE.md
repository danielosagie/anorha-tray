# Hosted desktop-callback page (you deploy this on app.anorha.app)

This is the ONE piece of the desktop sign-in that lives outside this repo. It
must be served from a real subdomain of your Clerk primary domain
(`app.anorha.app`), because that's where the `pk_live_` Clerk instance is valid.

## Flow

1. The tray opens `https://app.anorha.app/desktop-callback?port=<loopbackPort>&state=<nonce>`
   in the system browser (`electron/clerk-link.ts`).
2. This page ensures the user is signed in (Clerk). If not, it sends them to
   Clerk's hosted sign-in and returns here afterward.
3. Once signed in, it mints a short-lived session token with `getToken()` (no
   template — same as web/mobile) and **top-level-redirects** to
   `http://127.0.0.1:<port>/callback?token=<jwt>&state=<nonce>`.
4. The tray's one-shot loopback captures the token, shows a "done" page, and
   exchanges it for the long-lived device credential. The token is used once,
   immediately.

Clerk refuses a custom-scheme `redirect_url`, so the token must come back over
the `127.0.0.1` loopback (a normal top-level navigation from a normal web page),
not over `ponder://`. `ponder://` stays the OS-level "launch/focus the tray" CTA.

## Next.js App Router version (your stack — next-forge)

`apps/app/app/desktop-callback/page.tsx`:

```tsx
'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState } from 'react';

export default function DesktopCallback() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [msg, setMsg] = useState('Connecting…');

  useEffect(() => {
    if (!isLoaded) return;
    const params = new URLSearchParams(window.location.search);
    const port = params.get('port');
    const state = params.get('state');

    // Only ever forward to a localhost loopback — never an arbitrary origin.
    if (!port || !/^\d+$/.test(port) || !state) {
      setMsg('Invalid sign-in link. Return to Anorha and try again.');
      return;
    }

    if (!isSignedIn) {
      // Bounce through Clerk hosted sign-in, then come right back here.
      const here = `/desktop-callback?port=${port}&state=${encodeURIComponent(state)}`;
      window.location.href = `/sign-in?redirect_url=${encodeURIComponent(here)}`;
      return;
    }

    (async () => {
      try {
        const token = await getToken(); // no template — plain session JWT
        if (!token) throw new Error('no token');
        const url = `http://127.0.0.1:${port}/callback?token=${encodeURIComponent(token)}&state=${encodeURIComponent(state)}`;
        setMsg('Linking your computer…');
        window.location.href = url;
      } catch {
        setMsg('Sign-in failed. Return to Anorha and try again.');
      }
    })();
  }, [isLoaded, isSignedIn, getToken]);

  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', fontFamily: 'system-ui' }}>
      <p style={{ color: '#71717A' }}>{msg}</p>
    </main>
  );
}
```

That's the whole page. It reuses the Clerk session already present on
`app.anorha.app`; no new Clerk config is needed. The org lookup + device
registration both happen on the desktop with this same token.

## Vanilla fallback (if you host a static page instead of Next)

Load ClerkJS with your publishable key, `await Clerk.load()`, then: if
`Clerk.user` → `Clerk.session.getToken()` → redirect to the loopback; else
`Clerk.redirectToSignIn({ redirectUrl: location.href })`. Same logic as above.

## Notes

- Set `PONDER_WEB_BASE_URL` in the tray's env if the page is not at
  `https://app.anorha.app` (defaults to that). Path is always `/desktop-callback`.
- The page validates `port` is digits-only and forwards solely to `127.0.0.1`
  — it never redirects to an attacker-supplied origin.
- The session token rides the loopback URL (localhost only) and is consumed once.
