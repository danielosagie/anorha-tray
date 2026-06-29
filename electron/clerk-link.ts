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
 *      the user in, mints a short-lived session token, and POSTs it to
 *      http://127.0.0.1:<port>/callback as { token, state }
 *   4. we validate the state nonce, capture the token, ack, and close the server
 *
 * Every Clerk-facing origin stays a real subdomain, so pk_live_ never sees the
 * Electron origin. The captured token is short-lived and used once, immediately,
 * to register the long-lived device credential (see device.ts / device:register).
 *
 * Hardening (post-review):
 *  - token comes back in a POST BODY, not the URL query, so it never lands in
 *    browser history (a GET-with-query path is kept only as a fallback);
 *  - a wrong/stray /callback (bad or missing state) is IGNORED, not fatal — only
 *    the timeout or an explicit cancel ends a pending link, so a duplicate tab or
 *    a localhost probe can't abort a real sign-in;
 *  - the in-flight link is cancellable (device:linkCancel → cancelActiveLink).
 *
 * Hosted page contents: docs/DESKTOP-CALLBACK-PAGE.md.
 */

import { createServer, type ServerResponse } from "node:http";
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

// The hosted page is cross-origin to the loopback, so its POST needs CORS. Safe
// here: the listener is 127.0.0.1-only, single-use, and gated on the state nonce.
const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};

export interface LoopbackLinkResult {
  clerkToken: string;
}

export interface LoopbackLinkOptions {
  /** Web origin that hosts /desktop-callback (a real subdomain of the Clerk primary domain). */
  webBaseUrl: string;
  /** How long to wait for the browser round-trip before giving up. */
  timeoutMs?: number;
}

// One link at a time; device:linkCancel tears down the in-flight attempt.
let activeCancel: ((reason: "cancelled") => void) | null = null;

/** Abort the in-flight system-browser link, if any (no-op when idle). */
export function cancelActiveLink(): void {
  activeCancel?.("cancelled");
}

/**
 * Open the hosted desktop-callback page in the system browser and resolve with
 * the short-lived Clerk session token it hands back over loopback. Rejects on
 * timeout, explicit cancel, or a transport error. Binds to 127.0.0.1 only and
 * accepts exactly one VALID (state-matching) callback before closing; stray or
 * wrong-state requests are answered 400 and ignored.
 */
export function linkViaBrowser(opts: LoopbackLinkOptions): Promise<LoopbackLinkResult> {
  const state = randomBytes(16).toString("hex");
  const timeoutMs = opts.timeoutMs ?? 5 * 60_000;

  return new Promise<LoopbackLinkResult>((resolve, reject) => {
    let done = false;

    function finish(settle: () => void) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      activeCancel = null;
      try {
        server.close();
      } catch {
        /* ignore */
      }
      settle();
    }
    const settleOk = (token: string) => finish(() => resolve({ clerkToken: token }));
    const settleErr = (e: Error) => finish(() => reject(e));

    // Settle ONLY on a valid token+state. A mismatch is answered 400 but left
    // pending so a stray/hostile request can't abort a legitimate sign-in.
    function handle(token: string, gotState: string, res: ServerResponse): void {
      if (token && gotState === state) {
        res.writeHead(200, { "content-type": "text/html", ...CORS }).end(SUCCESS_HTML);
        settleOk(token);
      } else {
        res.writeHead(400, { "content-type": "text/html", ...CORS }).end(FAILURE_HTML);
      }
    }

    const server = createServer((req, res) => {
      let url: URL;
      try {
        url = new URL(req.url || "/", "http://127.0.0.1");
      } catch {
        res.writeHead(400).end();
        return;
      }
      if (req.method === "OPTIONS") {
        res.writeHead(204, CORS).end();
        return;
      }
      if (url.pathname !== "/callback") {
        res.writeHead(404, { "content-type": "text/html", ...CORS }).end(page("Not found", ""));
        return;
      }
      if (req.method === "POST") {
        // Preferred path: token in the body, never the URL (keeps it out of history).
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
          if (body.length > 1_000_000) req.destroy();
        });
        req.on("end", () => {
          let token = "";
          let gotState = "";
          try {
            const j = JSON.parse(body || "{}") as { token?: unknown; state?: unknown };
            token = String(j.token ?? "");
            gotState = String(j.state ?? "");
          } catch {
            /* malformed → handled as a mismatch below */
          }
          handle(token, gotState, res);
        });
        return;
      }
      // GET fallback (token in query) — only if a host can't POST; prefer POST.
      handle(url.searchParams.get("token") || "", url.searchParams.get("state") || "", res);
    });

    const timer = setTimeout(
      () => settleErr(new Error("Sign-in timed out — please try again.")),
      timeoutMs,
    );
    activeCancel = () => settleErr(new Error("Sign-in cancelled."));
    server.on("error", (e) => settleErr(e instanceof Error ? e : new Error(String(e))));

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = addr && typeof addr === "object" ? addr.port : 0;
      if (!port) {
        settleErr(new Error("Could not open a local sign-in port."));
        return;
      }
      const base = opts.webBaseUrl.replace(/\/+$/, "");
      void shell.openExternal(`${base}/desktop-callback?port=${port}&state=${state}`);
    });
  });
}
