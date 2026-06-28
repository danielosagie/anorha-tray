/**
 * Behavior + stress test for the device-credential job flow (headless, tsx).
 * Run: node_modules/.bin/tsx tests/device-flow.test.ts
 *
 * Exercises the REAL code paths (not just types): device.json roundtrip + perms,
 * config overlay, and the consumer routing device-auth claim* vs legacy fns,
 * success/fail/heartbeat, and the write velocity cap (defer) under load — with a
 * mock Convex client + mock executor so nothing touches the network.
 */
import assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// Isolate ~/.ponder to a temp HOME BEFORE any device.ts call (uv_os_homedir
// checks $HOME first on POSIX).
const TMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "ponder-test-"));
process.env.HOME = TMP_HOME;

import {
  generateDeviceToken,
  saveDeviceCredential,
  loadDeviceCredential,
  clearDeviceCredential,
  deviceFilePath,
} from "../src/agent/browser-jobs/device";
import {
  readBrowserJobsConfig,
  hasDeviceCredential,
  isConfigured,
  type BrowserJobsConfig,
} from "../src/agent/browser-jobs/config";
import { BrowserJobsConsumer } from "../src/agent/browser-jobs/consumer";

let passed = 0;
const checks: string[] = [];
function check(name: string, cond: boolean) {
  checks.push(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (cond) passed++;
  if (!cond) console.error("  ✗ " + name);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred: () => boolean, ms = 3000) {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error("waitFor timeout");
    await sleep(5);
  }
}

function makeMock() {
  const mutations: { name: string; args: any }[] = [];
  let subCb: ((jobs: any[]) => void) | null = null;
  const client = {
    onUpdate: (_n: string, _a: any, cb: (jobs: any[]) => void) => {
      subCb = cb;
      return () => {};
    },
    query: async () => [] as any[],
    mutation: async (name: string, args: any) => {
      mutations.push({ name, args });
    },
    close: () => {},
  };
  return { client, mutations, emit: (jobs: any[]) => subCb?.(jobs) };
}

const baseCfg: BrowserJobsConfig = {
  convexURL: "https://test.convex.cloud",
  userId: "",
  workerId: "worker-1",
  syncBaseURL: "",
  syncToken: "",
  bridgePort: 7900,
  writeMinGapMs: 0,
  writeMaxGapMs: 0,
  writeHourlyCap: 100,
  writeDailyCap: 100,
  frictionBreakConsecutiveFails: 99,
  readJitterMaxMs: 0,
  deferRecheckMs: 0,
};
const job = (id: string, type = "create_listing") => ({
  _id: id,
  type,
  platform: "facebook_marketplace",
  queuedAt: Date.now(),
  attemptCount: 0,
  maxAttempts: 3,
  payload: {},
});
const okExec = { execute: async () => ({ success: true, result: { url: "u" }, artifacts: [] }) };
const failExec = { execute: async () => ({ success: false, error: "boom-fail" }) };

async function main() {
  // ── 1. device credential roundtrip + perms ──
  const t1 = generateDeviceToken();
  check("token is 64 hex chars", /^[0-9a-f]{64}$/.test(t1));
  check("tokens are unique", t1 !== generateDeviceToken());
  saveDeviceCredential({ deviceId: "d1", deviceSecret: "s1", convexURL: "https://c1" });
  const loaded = loadDeviceCredential();
  check("cred loads back", loaded?.deviceId === "d1" && loaded?.deviceSecret === "s1");
  const mode = fs.statSync(deviceFilePath()).mode & 0o777;
  check("device.json is chmod 600", mode === 0o600);
  clearDeviceCredential();
  check("cleared cred → null", loadDeviceCredential() === null);

  // ── 2. config overlay ──
  saveDeviceCredential({ deviceId: "d2", deviceSecret: "s2", convexURL: "https://q2" });
  const cfg = readBrowserJobsConfig();
  check("config picks up deviceId/secret", cfg.deviceId === "d2" && cfg.deviceSecret === "s2");
  check("config takes convexURL from device.json", cfg.convexURL === "https://q2");
  check("hasDeviceCredential true", hasDeviceCredential(cfg));
  check("isConfigured true (device path)", isConfigured(cfg));
  clearDeviceCredential();
  const cfg2 = readBrowserJobsConfig();
  check("no cred → device fields undefined", !cfg2.deviceId && !cfg2.deviceSecret);

  // ── 3. consumer DEVICE mode: claim* + heartbeat ──
  {
    const m = makeMock();
    const c = new BrowserJobsConsumer(
      { ...baseCfg, deviceId: "dev1", deviceSecret: "sec1" },
      okExec,
      { log: () => {} },
      { createClient: () => m.client },
    );
    c.start();
    m.emit([job("j1")]);
    await waitFor(() => m.mutations.some((x) => x.name === "browserJobs:claimComplete"));
    const start = m.mutations.find((x) => x.name === "browserJobs:claimStart");
    check("device: claimStart with deviceArgs", !!start && start.args.deviceId === "dev1" && start.args.deviceSecret === "sec1");
    const comp = m.mutations.find((x) => x.name === "browserJobs:claimComplete");
    check("device: claimComplete with deviceArgs", !!comp && comp.args.deviceId === "dev1");
    check("device: NO legacy startJob", !m.mutations.some((x) => x.name === "browserJobs:startJob"));
    check("device: heartbeat sent", m.mutations.some((x) => x.name === "workerPresence:deviceHeartbeat"));
    c.stop();
  }

  // ── 4. consumer DEVICE mode failure → claimFail ──
  {
    const m = makeMock();
    const c = new BrowserJobsConsumer(
      { ...baseCfg, deviceId: "dev1", deviceSecret: "sec1" },
      failExec,
      { log: () => {} },
      { createClient: () => m.client },
    );
    c.start();
    m.emit([job("jf")]);
    await waitFor(() => m.mutations.some((x) => x.name === "browserJobs:claimFail"));
    const f = m.mutations.find((x) => x.name === "browserJobs:claimFail");
    check("device: claimFail carries error + deviceArgs", !!f && String(f.args.errorMessage).includes("boom-fail") && f.args.deviceId === "dev1");
    check("device: no claimComplete on failure", !m.mutations.some((x) => x.name === "browserJobs:claimComplete"));
    c.stop();
  }

  // ── 5. consumer LEGACY mode (no device cred) → startJob/completeJob ──
  {
    const m = makeMock();
    const c = new BrowserJobsConsumer(
      { ...baseCfg, userId: "u1" },
      okExec,
      { log: () => {} },
      { createClient: () => m.client },
    );
    c.start();
    m.emit([job("jl")]);
    await waitFor(() => m.mutations.some((x) => x.name === "browserJobs:completeJob"));
    const start = m.mutations.find((x) => x.name === "browserJobs:startJob");
    check("legacy: startJob with workerId, no deviceArgs", !!start && start.args.workerId === "worker-1" && start.args.deviceId === undefined);
    check("legacy: NO claimStart", !m.mutations.some((x) => x.name === "browserJobs:claimStart"));
    check("legacy: NO heartbeat (no orgId)", !m.mutations.some((x) => x.name === "workerPresence:deviceHeartbeat"));
    c.stop();
  }

  // ── 6. STRESS: write velocity cap defers excess writes ──
  {
    const m = makeMock();
    const c = new BrowserJobsConsumer(
      { ...baseCfg, deviceId: "dv", deviceSecret: "sv", writeHourlyCap: 2 },
      okExec,
      { log: () => {} },
      { createClient: () => m.client },
    );
    c.start();
    m.emit([job("a"), job("b"), job("c"), job("d")]);
    await waitFor(() => m.mutations.filter((x) => x.name === "browserJobs:claimComplete").length === 2);
    await sleep(50); // let any extra (incorrectly) started jobs surface
    const starts = m.mutations.filter((x) => x.name === "browserJobs:claimStart").length;
    check("stress: hourly cap=2 → only 2 writes started (2 deferred)", starts === 2);
    c.stop();
  }

  // ── 7. onJob structured events: claimed → running → done (+ url/title) ──
  {
    const m = makeMock();
    const ev: any[] = [];
    const c = new BrowserJobsConsumer(
      { ...baseCfg, deviceId: "dev1", deviceSecret: "sec1" },
      okExec,
      { log: () => {}, onJob: (e) => ev.push(e) },
      { createClient: () => m.client },
    );
    c.start();
    m.emit([job("jo")]);
    await waitFor(() => ev.some((e) => e.status === "done"));
    const statuses = ev.filter((e) => e.id === "jo").map((e) => e.status);
    check("onJob order claimed→running→done", JSON.stringify(statuses) === JSON.stringify(["claimed", "running", "done"]));
    const done = ev.find((e) => e.status === "done");
    check("onJob done carries url + title + platform", !!done && done.url === "u" && !!done.title && done.platform === "facebook_marketplace");
    c.stop();
  }

  // ── 8. onJob failure: claimed → running → failed ──
  {
    const m = makeMock();
    const ev: any[] = [];
    const c = new BrowserJobsConsumer(
      { ...baseCfg, deviceId: "dev1", deviceSecret: "sec1" },
      failExec,
      { log: () => {}, onJob: (e) => ev.push(e) },
      { createClient: () => m.client },
    );
    c.start();
    m.emit([job("jx")]);
    await waitFor(() => ev.some((e) => e.status === "failed"));
    const statuses = ev.filter((e) => e.id === "jx").map((e) => e.status);
    check("onJob order claimed→running→failed", JSON.stringify(statuses) === JSON.stringify(["claimed", "running", "failed"]));
    c.stop();
  }

  console.log("\n" + checks.join("\n"));
  console.log(`\n${passed}/${checks.length} checks passed`);
  if (passed !== checks.length) process.exit(1);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("HARNESS ERROR:", e);
  process.exit(1);
});
