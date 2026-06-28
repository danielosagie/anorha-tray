/**
 * DEV-ONLY mock of `convex/react` for the standalone renderer preview
 * (vite.preview.config.ts aliases "convex/react" → this file). Lets the tray UI
 * render in a plain browser with canned data — no Convex deployment / IPC.
 * NEVER bundled by electron-vite (that config has no such alias).
 */
import type { ReactNode } from "react";

export class ConvexReactClient {
  constructor(_url?: string) {}
  setAuth() {}
  close() {}
}

export function ConvexProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

const now = 1_000_000_000_000;
const CANNED_SESSIONS = [
  { _id: "s1", prompt: "Vintage Levi's 501 · $48", status: "done", provider: "hcompany", createdAt: now - 120_000 },
  { _id: "s2", prompt: "Mid-century lamp · $65", status: "done", provider: "hcompany", createdAt: now - 3_600_000 },
  { _id: "s3", prompt: "Nike Air Max 90 · $90", status: "error", provider: "hcompany", createdAt: now - 10_800_000 },
  { _id: "s4", prompt: "Coffee table → $99", status: "running", provider: "hcompany", createdAt: now - 30_000 },
];

// Identify the sessions list query by its { limit } arg; everything else returns
// undefined (loading) — fine for the feed/gate/onboarding preview.
export function useQuery(_ref: unknown, args?: unknown): unknown {
  if (args && typeof args === "object" && "limit" in (args as Record<string, unknown>)) {
    return CANNED_SESSIONS;
  }
  return undefined;
}
