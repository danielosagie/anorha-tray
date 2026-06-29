import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ClerkProvider } from "@clerk/clerk-react";
import { ReactNode, useEffect, useState } from "react";

/**
 * Wraps the app in ClerkProvider (so LinkGate can sign in with the SAME prod
 * Clerk instance as web/mobile) + ConvexProvider. Both the publishable key and
 * the Convex URL come from the main process via window.agent.getEnv(). The
 * ConvexProvider stays UNAUTHENTICATED — the device registration uses a separate
 * ConvexClient with setAuth (see device.ts); Clerk here is only for sign-in.
 */
export function ConvexShell({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<ConvexReactClient | null>(null);
  const [clerkKey, setClerkKey] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void window.agent.getEnv().then(({ convexUrl, clerkPublishableKey }) => {
      if (convexUrl) setClient(new ConvexReactClient(convexUrl));
      else console.warn("Convex URL missing — history will not persist.");
      setClerkKey(clerkPublishableKey ?? null);
      setReady(true);
    });
  }, []);

  if (!ready) {
    return <div style={{ color: "#888", padding: 16, fontSize: 13 }}>Connecting…</div>;
  }
  if (!clerkKey) {
    return (
      <div style={{ color: "#888", padding: 16, fontSize: 13 }}>
        Sign-in unavailable — CLERK_PUBLISHABLE_KEY is not set.
      </div>
    );
  }

  const tree = client ? <ConvexProvider client={client}>{children}</ConvexProvider> : <>{children}</>;
  return <ClerkProvider publishableKey={clerkKey}>{tree}</ClerkProvider>;
}
