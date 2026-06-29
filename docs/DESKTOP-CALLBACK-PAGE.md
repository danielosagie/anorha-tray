# Hosted desktop-callback page (you deploy this on app.anorha.app)

This is the ONE piece of the desktop sign-in that lives outside this repo. It
must be served from a real subdomain of your Clerk primary domain
(`app.anorha.app`), because that's where the `pk_live_` Clerk instance is valid.

## Flow

1. The tray opens `https://app.anorha.app/desktop-callback?port=<loopbackPort>&state=<nonce>`
   in the system browser (`electron/clerk-link.ts`).
2. This page ensures the user is signed in (Clerk). If not, it sends them to
   Clerk's hosted sign-in and returns here afterward.
3. Once signed in, it shows **which account** is being linked (so a wrong-account
   link is visible), mints a short-lived session token with `getToken()` (no
   template — same as web/mobile), and **POSTs** `{ token, state }` to
   `http://127.0.0.1:<port>/callback`.
4. The tray's one-shot loopback validates the state nonce, captures the token,
   acks, and exchanges it for the long-lived device credential. The token is
   used once, immediately.

Why POST and not a redirect: a top-level redirect would put the token in the
browser's address bar / history. POSTing the body keeps it out entirely. The
loopback sends permissive CORS for this one localhost endpoint, so the
cross-origin `fetch` succeeds. (A GET-with-query fallback also works if your host
can't POST, but prefer POST.)

Clerk refuses a custom-scheme `redirect_url`, so the token comes back over the
`127.0.0.1` loopback, not over `ponder://`. `ponder://` stays the OS-level
"launch/focus the tray" CTA.

## Next.js App Router version (your stack — next-forge)

`apps/app/app/desktop-callback/page.tsx`:

```tsx
'use client';

import { useAuth, useUser } from '@clerk/nextjs';
import { useEffect, useState } from 'react';

export default function DesktopCallback() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [msg, setMsg] = useState('Connecting…');

  useEffect(() => {
    if (!isLoaded) return;
    const params = new URLSearchParams(window.location.search);
    const port = params.get('port');
    const state = params.get('state');

    // Only ever talk to a localhost loopback — never an arbitrary origin.
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
        // POST the token (keeps it out of browser history); the loopback sends CORS.
        const res = await fetch(`http://127.0.0.1:${port}/callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, state }),
        });
        if (!res.ok) throw new Error('callback rejected');
        setMsg('Computer linked. You can close this tab.');
      } catch {
        setMsg('Sign-in failed. Return to Anorha and try again.');
      }
    })();
  }, [isLoaded, isSignedIn, getToken]);

  const email = user?.primaryEmailAddress?.emailAddress;
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', fontFamily: 'system-ui', textAlign: 'center' }}>
      <div>
        {/* Show WHICH account is being linked so a wrong-account link is visible. */}
        {email && <p style={{ fontWeight: 600 }}>Linking as {email}</p>}
        <p style={{ color: '#71717A' }}>{msg}</p>
      </div>
    </main>
  );
}
```

That's the whole page. It reuses the Clerk session already present on
`app.anorha.app`; no new Clerk config is needed. The org lookup + device
registration both happen on the desktop with this same token. Showing the email
addresses the "silent wrong-account link" gap — the user confirms the identity
before the device binds.

## Vanilla fallback (if you host a static page instead of Next)

Load ClerkJS with your publishable key, `await Clerk.load()`, then: if
`Clerk.user` → show `Clerk.user.primaryEmailAddress` → `Clerk.session.getToken()`
→ `fetch(POST http://127.0.0.1:<port>/callback, { token, state })`; else
`Clerk.redirectToSignIn({ redirectUrl: location.href })`. Same logic as above.

## Notes

- Set `PONDER_WEB_BASE_URL` in the tray's env if the page is not at
  `https://app.anorha.app` (defaults to that). Path is always `/desktop-callback`.
- The page validates `port` is digits-only and forwards solely to `127.0.0.1`
  — it never redirects to an attacker-supplied origin.
- The session token rides the loopback URL (localhost only) and is consumed once.
