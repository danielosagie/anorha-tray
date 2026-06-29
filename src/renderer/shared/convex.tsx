import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, useEffect, useState } from "react";

/**
 * Wraps the app in ConvexProvider so the History tab can read the agent's local
 * session log. The Convex URL comes from the main process via
 * window.agent.getEnv(). No Clerk here: sign-in happens in the system browser
 * (device:linkViaBrowser) because the renderer's file:// origin can't talk to a
 * pk_live_ Clerk instance. The ConvexProvider stays UNAUTHENTICATED — device
 * registration uses a separate ConvexClient with setAuth (see device.ts).
 */
export function ConvexShell({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<ConvexReactClient | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void window.agent.getEnv().then(({ convexUrl }) => {
      if (convexUrl) setClient(new ConvexReactClient(convexUrl));
      else console.warn("Convex URL missing — history will not persist.");
      setReady(true);
    });
  }, []);

  if (!ready) {
    return <div style={{ color: "#888", padding: 16, fontSize: 13 }}>Connecting…</div>;
  }

  return client ? <ConvexProvider client={client}>{children}</ConvexProvider> : <>{children}</>;
}
