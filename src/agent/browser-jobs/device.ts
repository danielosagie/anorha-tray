/**
 * Device credential — the desktop tray's long-lived identity.
 *
 * After a one-time Clerk sign-in the desktop generates a high-entropy token,
 * registers it (devices:registerDevice, Clerk-authed) and persists
 * { deviceId, deviceSecret, convexURL } to ~/.ponder/device.json (chmod 600).
 * From then on the consumer authenticates every queue op with this capability
 * (browserJobs:claimJobs / claim* / workerPresence:deviceHeartbeat) — no further
 * Clerk token needed, so it survives restarts and offline gaps. See
 * docs/PHASE1-IDENTITY.md.
 */

import { ConvexClient } from "convex/browser";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface DeviceCredential {
  /** devices doc _id from registerDevice — the public worker/device id. */
  deviceId: string;
  /** The high-entropy token this device generated + registered (the secret). */
  deviceSecret: string;
  /** Convex deployment the device is linked to. */
  convexURL: string;
  orgId?: string;
  name?: string;
  platform?: string;
}

function ponderDir(): string {
  return path.join(os.homedir(), ".ponder");
}

export function deviceFilePath(): string {
  return path.join(ponderDir(), "device.json");
}

/** crypto.randomBytes(32) → 64 hex chars. Generated BEFORE registration. */
export function generateDeviceToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Load the persisted credential, or null if this computer isn't linked yet. */
export function loadDeviceCredential(): DeviceCredential | null {
  try {
    const raw = fs.readFileSync(deviceFilePath(), "utf8");
    const j = JSON.parse(raw) as Partial<DeviceCredential>;
    if (j && j.deviceId && j.deviceSecret && j.convexURL) {
      return {
        deviceId: String(j.deviceId),
        deviceSecret: String(j.deviceSecret),
        convexURL: String(j.convexURL),
        orgId: j.orgId ? String(j.orgId) : undefined,
        name: j.name ? String(j.name) : undefined,
        platform: j.platform ? String(j.platform) : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Persist the credential with owner-only perms (0600). */
export function saveDeviceCredential(cred: DeviceCredential): void {
  const dir = ponderDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = deviceFilePath();
  fs.writeFileSync(file, JSON.stringify(cred, null, 2), { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* best-effort on platforms without POSIX perms */
  }
}

/** Remove the credential (offboarding / unlink). */
export function clearDeviceCredential(): void {
  try {
    fs.rmSync(deviceFilePath(), { force: true });
  } catch {
    /* ignore */
  }
}

export interface RegisterDeviceInput {
  convexURL: string;
  /** A valid Clerk session token for the signed-in user. */
  clerkToken: string;
  orgId: string;
  name: string;
  platform?: string;
}

/**
 * Register THIS computer to the signed-in account and persist the credential.
 * Generates the token locally, calls the Clerk-authed devices:registerDevice
 * mutation, then writes device.json. Returns the saved credential.
 */
export async function registerDevice(input: RegisterDeviceInput): Promise<DeviceCredential> {
  const deviceSecret = generateDeviceToken();
  // Loosely typed: we address the deployed function by string (the queue lives
  // in another repo's Convex deployment), same as the consumer client.
  const client: any = new ConvexClient(input.convexURL);
  try {
    client.setAuth(async () => input.clerkToken);
    const res = (await client.mutation("devices:registerDevice", {
      orgId: input.orgId,
      name: input.name,
      platform: input.platform ?? process.platform,
      token: deviceSecret,
    })) as { deviceId: string };
    if (!res || !res.deviceId) throw new Error("registerDevice returned no deviceId");
    const cred: DeviceCredential = {
      deviceId: String(res.deviceId),
      deviceSecret,
      convexURL: input.convexURL,
      orgId: input.orgId,
      name: input.name,
      platform: input.platform ?? process.platform,
    };
    saveDeviceCredential(cred);
    return cred;
  } finally {
    try {
      client.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Best-effort backend revoke for offboarding. The desktop holds only its device
 * credential (no live Clerk session), so it revokes with (deviceId, deviceSecret)
 * via devices:revokeByDevice. Call this BEFORE clearDeviceCredential on unlink.
 */
export async function revokeDeviceRemote(cred: DeviceCredential): Promise<void> {
  const client: any = new ConvexClient(cred.convexURL);
  try {
    await client.mutation("devices:revokeByDevice", {
      deviceId: cred.deviceId,
      deviceSecret: cred.deviceSecret,
    });
  } finally {
    try {
      client.close();
    } catch {
      /* ignore */
    }
  }
}
