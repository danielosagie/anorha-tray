/**
 * Standalone renderer preview entry (DEV-only, never shipped by electron-vite).
 * Installs a mock window.agent/window.buddy so the real <App/> renders in a plain
 * browser, then mounts it. URL flags:
 *   ?gate=link     → show the unlinked LinkGate (sign-in) screen
 *   ?gate=onboard  → show first-run onboarding
 *   (default)      → linked tray feed
 */
import { createRoot } from "react-dom/client";
import { ConvexShell } from "../../shared/convex";
import { App } from "../App";

const params = new URLSearchParams(location.search);
const gate = params.get("gate");
const linked = gate !== "link";
if (gate === "onboard") localStorage.removeItem("anorha_onboarded");
else localStorage.setItem("anorha_onboarded", "1");

const sub = (_cb?: unknown) => () => {};

(window as unknown as { agent: unknown }).agent = {
  getEnv: async () => ({ convexUrl: "https://preview.convex.cloud", provider: "hcompany", backgroundMode: false, clerkPublishableKey: "pk_live_Y2xlcmsuYXBwLmFub3JoYS5hcHAk", apiBaseUrl: "https://api.sssync.app" }),
  getDeviceStatus: async () => ({ linked, deviceId: "dev_preview", name: "This Mac", orgId: "org_preview" }),
  getState: async () => ({ warmup: "ready", provider: "hcompany", activeSessionId: null }),
  onState: sub,
  reprobePermissions: async () => ({ platform: "darwin", accessibility: "granted", screenRecording: "granted", inputMonitoring: "granted" }),
  listRecipes: async () => [],
  registerDevice: async () => ({ ok: true, deviceId: "dev_preview" }),
  unlinkDevice: async () => ({ ok: true }),
  getRecentActivity: async () => ([
    { id: "j1", title: "Vintage Levi's 501 · $48", platform: "facebook_marketplace", status: "done", url: "https://example.com/l", ts: Date.now() - 120_000 },
    { id: "j2", title: "Nike Air Max 90 · $90", platform: "facebook_marketplace", status: "failed", ts: Date.now() - 30_000 },
    { id: "j3", title: "Coffee table → $99", platform: "ebay", status: "running", ts: Date.now() - 5_000 },
  ]),
  onActivity: (_cb: unknown) => () => {},
  runTask: async () => ({ ok: true }),
  cancel: async () => ({ ok: true }),
  warm: async () => ({ ok: true }),
  replayRecipe: async () => ({ ok: true }),
  saveLastAsRecipe: async () => ({ ok: true }),
  saveSessionAsRecipe: async () => ({ ok: true }),
  getRecipe: async () => null,
  recipePaths: async () => ({ jsonPath: "", recipePath: "" }),
  revealRecipe: async () => ({ ok: true }),
  openChannel: async () => ({ ok: true }),
  openSystemSettings: async () => {},
  revealBinary: async () => ({ ok: true }),
  openAppWindow: async () => ({ ok: true }),
  dismissInputMode: async () => ({ ok: true }),
};
(window as unknown as { buddy: unknown }).buddy = {
  onCursor: sub, onMode: sub, onSay: sub, onInputMode: sub, onWelcome: sub, onAgentCursor: sub,
};

createRoot(document.getElementById("root")!).render(
  <ConvexShell>
    <App />
  </ConvexShell>,
);
