/**
 * System-browser + loopback sign-in (Clerk's blessed desktop pattern).
 *
 * Why not embed @clerk/clerk-react in the renderer? The renderer loads from
 * file:// (Origin "null"), which a pk_live_ key rejects and which must never be
 * allowlisted. So instead we sign in on a REAL subdomain of the primary domain:
 *
 *   1. main starts a one-shot http://127.0.0.1:<port> listener + a state nonce
 *   2. open <webBaseUrl>/desktop-callback?port=&state= in the SYSTEM browser
 *   3. that hosted page (on app.anorha.app, where Clerk is authenticated) signs
 *      the user in, mints a short-lived session token, and top-level-redirects to
 *      http://127.0.0.1:<port>/callback?token=&state=
 *   4. we capture the token, show a "done" page, close the server
 *
 * Every Clerk-facing origin stays a real subdomain, so pk_live_ never sees the
 * Electron origin. The captured token is short-lived and used once, immediately,
 * to register the long-lived device credential (see device.ts / device:register).
 * Hosted page contents: docs/DESKTOP-CALLBACK-PAGE.md.
 */

import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { shell } from "electron";

const PAGE_CSS =
  "body{font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;background:#F4F3EE;color:#18181B;" +
  "display:flex;align-items:center;justify-content:center;height:100vh;margin:0}" +
  ".card{text-align:center;max-width:320px;padding:0 24px}.h{font-size:20px;font-weight:700;margin:0 0 6px}" +
  ".p{color:#71717A;font-size:14px;line-height:20px;margin:0}";

function page(title: string, body: string): string {
  return (
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>Anorha</title><style>${PAGE_CSS}</style>` +
    `<div class="card"><p class="h">${title}</p><p class="p">${body}</p></div>`
  );
}

const SUCCESS_HTML = page("Computer linked", "You can close this tab and return to Anorha.");
const FAILURE_HTML = page("Link failed", "Something went wrong. Return to Anorha and try again.");

export interface LoopbackLinkResult {
  clerkToken: string;
}

export interface LoopbackLinkOptions {
  /** Web origin that hosts /desktop-callback (a real subdomain of the Clerk primary domain). */
  webBaseUrl: string;
  /** How long to wait for the browser round-trip before giving up. */
  timeoutMs?: number;
}

/**
 * Open the hosted desktop-callback page in the system browser and resolve with
 * the short-lived Clerk session token it hands back over loopback. Rejects on
 * timeout, a state mismatch, or a transport error. Binds to 127.0.0.1 only and
 * accepts exactly one callback before closing.
 */
export function linkViaBrowser(opts: LoopbackLinkOptions): Promise<LoopbackLinkResult> {
  const state = randomBytes(16).toString("hex");
  const timeoutMs = opts.timeoutMs ?? 5 * 60_000;

  return new Promise<LoopbackLinkResult>((resolve, reject) => {
    let done = false;

    const server = createServer((req, res) => {
      let url: URL;
      try {
        url = new URL(req.url || "/", "http://127.0.0.1");
      } catch {
        res.writeHead(400).end();
        return;
      }
      if (url.pathname !== "/callback") {
        res.writeHead(404, { "content-type": "text/html" }).end(page("Not found", ""));
        return;
      }
      const token = url.searchParams.get("token") || "";
      const gotState = url.searchParams.get("state") || "";
      if (!token || gotState !== state) {
        res.writeHead(400, { "content-type": "text/html" }).end(FAILURE_HTML);
        finish(() => reject(new Error("Link failed — please try again.")));
        return;
      }
      res.writeHead(200, { "content-type": "text/html" }).end(SUCCESS_HTML);
      finish(() => resolve({ clerkToken: token }));
    });

    const timer = setTimeout(
      () => finish(() => reject(new Error("Sign-in timed out — please try again."))),
      timeoutMs,
    );

    function finish(settle: () => void) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        server.close();
      } catch {
        /* ignore */
      }
      settle();
    }

    server.on("error", (e) => finish(() => reject(e)));

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = addr && typeof addr === "object" ? addr.port : 0;
      if (!port) {
        finish(() => reject(new Error("Could not open a local sign-in port.")));
        return;
      }
      const base = opts.webBaseUrl.replace(/\/+$/, "");
      const target = `${base}/desktop-callback?port=${port}&state=${state}`;
      void shell.openExternal(target);
    });
  });
}
