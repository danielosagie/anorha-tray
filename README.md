# Anorha Tray

> A signed desktop menu-bar app that links your computer to your Anorha account, receives commands from your phone, runs them on your **real Chrome + real mouse**, and hands the result back.

Anorha Tray is the desktop runner for **Anorha**. It sits in your menu bar, links to your account, and quietly executes browser + desktop tasks dispatched from the phone — listing to a marketplace that has no API, editing a price, pulling a table off a page — on the machine you're already logged into.

It's built on **Ponder**, the browser+desktop automation engine it embeds (also in this repo). Forked from `holo3-agent` and stripped down to a clean, signed, auto-updating background tray app.

```
package: ponder-tray @ 1.0.3   ·   productName: Anorha   ·   appId: app.anorha.tray   ·   Apache-2.0
```

---

## Two layers in one repo

| Layer | Lives in | What it is |
|-------|----------|------------|
| **Anorha tray** | `electron/`, `src/renderer/`, `src/agent/browser-jobs/` | The Electron menu-bar app: Clerk account linking, the cloud job-queue consumer, account-safety pacing, packaging / signing / auto-update. |
| **Ponder engine** | `src/agent/`, `src/mcp/`, `src/cli/`, `src/bridge/` | The automation core: an MCP server, a TypeScript SDK, a `ponder` CLI, a localhost HTTP bridge, and a record-once / replay-forever recipe system. Usable on its own by any AI agent or Node program. |

The tray is the product; Ponder is the engine underneath it. You can run Ponder without the tray (as an MCP server / SDK / CLI), but the tray is what turns it into "my phone tells my laptop to do something."

---

## How it works

```
  Phone / Anorha app
        │  enqueue job
        ▼
  Convex · browserJobs queue           (hosted in anorha-bknd)
        │  subscribe + claim  (deviceId + deviceSecret)
        ▼
  Anorha Tray ── consumer ──▶ executor
        │                        ├─ replay a saved recipe   (deterministic, no LLM, fast)
        │                        └─ or  agent_do  over the Ponder bridge (:7900)
        │                               observe → decide (Holo 3.1) → act on real Chrome / mouse
        ▼  write result back + reconcile
  Convex · browserJobs  ──▶  phone sees success / error
```

- **Account linking** — `electron/clerk-link.ts` opens the browser to Clerk sign-in → `/desktop-callback` on `app.anorha.app`. On success it registers a device (high-entropy `deviceSecret`) via a Convex mutation and persists `~/.ponder/device.json` (mode `0600`).
- **The consumer** (`src/agent/browser-jobs/`) subscribes to the Convex `browserJobs` queue for this user + device, claims jobs, runs them through the **executor**, and writes results back. The queue lives in the same backend the phone writes to.
- **Account safety** — writes are paced (hourly + rolling-24h caps) and guarded by a circuit breaker + friction-phrase detection; reads are exempt. Tuned for marketplaces that punish bot-like behavior.

---

## Quick start (development)

### Prerequisites
- **Node 20+**, **Chrome** installed, macOS or Windows
- At least one **brain provider** configured (see below)
- [Playwriter](https://github.com/danielosagie) on PATH for in-page Chrome control (the `postinstall` step probes for it; set `PONDER_SKIP_POSTINSTALL=1` to skip)

```bash
npm install
cp .env.example .env        # fill in at least one provider
npm run dev                 # electron-vite dev — launches the tray app with HMR
```

`npm run dev` boots the Electron main process (`electron/main.ts`), which starts the tray, the localhost bridge on **:7900**, and — once linked — the browser-jobs consumer.

---

## Configure a brain

The engine needs a vision model to ground "click the blue Publish button" into a real coordinate. Pick **one** path in `.env` (the tray menu can also switch at runtime). See [`.env.example`](.env.example) for the full annotated list.

| Path | Env | Notes |
|------|-----|-------|
| **H Company hosted** (recommended) | `HAI_API_KEY`, `HCOMPANY_MODEL` | No GPU infra; full-quality Holo 3.1 (`holo3-1-35b-a3b`), pay-per-token. |
| **Modal** (self-hosted GGUF) | `MODAL_BASE_URL`, `MODAL_BEARER_TOKEN` | Cheapest 24GB GPU; scales to zero. Deploy with `npm run modal:deploy`. |
| **Local** (Ollama, offline) | `OLLAMA_HOST`, `OLLAMA_MODEL` | Fully offline; run `bash scripts/setup-local.sh` once to import the GGUF. |

**Composite planner ("Surfer-2" split, recommended).** Set `GEMINI_API_KEY` (or `PLANNER_API_BASE` + `PLANNER_API_KEY`) and a cheap frontier-class model handles *planning* while Holo 3.1 only does *grounding* (description → coordinate). Every observed planning failure — loops, hallucinated UI, never emitting `DONE` — came from small models trying to plan. Disable with `PONDER_PLANNER=off`.

Provider selection is resolved in `src/agent/factory.ts`; your tray-menu choice is persisted to `~/.holo3-agent/preferences.json` and wins over env vars.

---

## The Ponder engine

The engine is consumable three ways: an MCP server, the `ponder` CLI, and a TypeScript SDK / HTTP bridge.

### As an MCP server

Install it into Claude Code / Claude Desktop:

```bash
npm run mcp:setup       # guided setup (probes Playwriter, walks the sign-in)
npm run mcp:install     # write the MCP entry into your Claude config
npm run mcp:doctor      # green checks across the board?
```

It exposes ~30 tools across a few families (single source of truth: `src/mcp/tools.ts`):

- **High-level** — `agent_do` (autonomous OS task loop), `agp_do` (server-side Holo 3.1 fast path), `long_task` (decompose → replay/coarse/agent → checkpoint).
- **In-page Chrome** (Playwriter, accessibility refs) — `ponder_browser_ensure`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_navigate`, `browser_scroll`, `browser_read`, `browser_set_input_files`, tab tools.
- **OS-level vision** — `agent_click`, `agent_click_sequence`, `agent_drag`, `agent_observe`.
- **OS keyboard / scroll** — `screen_type`, `screen_hotkey`, `screen_scroll_os`, `screen_screenshot`, `screen_wait`.
- **Structured read / export** — `extract` (page → table in one vision pass), `copy_table`, `write_csv`.
- **Sessions & recipes** — `ponder_recipe_start/buffer/save/list/show/replay`, `ponder_session_*`.

`ponder_browser_ensure` handles every cold-start state in one call (Chrome not running, extension missing, wrong tab/URL — vision auto-attaches). An HTTP MCP transport is also available for web connectors: `npm run mcp:http` (serves on **:7831**, same tool surface, `GET /health` reports the running commit).

### Record once, replay forever

Every `browser_*` / `screen_*` / `agent_do` call lands in a process-wide trace buffer. Snapshot it into a hand-editable `.recipe.ts` (raw Playwright — `page.getByRole(...)`, no framework wrappers), then replay deterministically with **no LLM in the loop**:

```bash
npm run ponder -- list            # newest first
npm run ponder -- run <id>        # deterministic replay (self-heals minor drift via reground)
npm run ponder -- open <id>       # hand-edit the recipe when something breaks
```

```ts
import { loadRecipe, replayRecipe } from "ponder-tray";
const recipe = await loadRecipe("2026-05-12_18-30-00-search-marketplace");
await replayRecipe(recipe!, { reground: true });
```

Recipe replay is the performance moat: the agentic record pass is slow, but replays are fast and cheap.

### Drive it over the bridge

Any process that speaks HTTP can drive the same surface on **:7900** (`PONDER_BRIDGE_PORT`), with Stripe-style per-consumer auth:

```bash
npm run ponder -- grant my-app --scopes browser:*,recipe:*
# pndr_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx   ← shown once
```

```ts
import { createPonderClient } from "ponder-tray";
const client = createPonderClient({ token: process.env.PONDER_KEY });
await client.ensureAttached({ url: "https://example.com" });
const snap = await client.browser.snapshot();
```

See [`docs/sdk.md`](docs/sdk.md), [`docs/bridge.md`](docs/bridge.md), [`docs/recipes.md`](docs/recipes.md), and the runnable [`examples/`](examples/).

---

## Build & ship

electron-vite bundles to `out/`; electron-builder packages and signs from there (config: [`electron-builder.yml`](electron-builder.yml)).

```bash
npm run build       # bundle main/preload/renderer → out/
npm run dist:dir    # unsigned local smoke test (unpacked .app / .exe)
npm run dist:mac    # macOS  → DMG + zip, arm64 + x64
npm run dist:win    # Windows → NSIS (per-user install)
npm run release     # signed + notarized, --publish always → GitHub Releases
```

- **macOS** — `hardenedRuntime` + `notarize: true` (notarytool; Apple creds via `APPLE_*` env). Ships as a menu-bar agent (`LSUIElement`, no Dock icon). Accessibility (mouse) and Screen Recording are runtime **TCC** grants — `NSScreenCaptureUsageDescription` is set and the App Sandbox stays **off** (otherwise `AXIsProcessTrusted()` is always false).
- **Windows** — NSIS per-user (no UAC). Azure Trusted Signing is templated in the config (uncomment + fill when ready).
- **Auto-update** — `electron-updater` reads the GitHub Releases feed (`publish: github · danielosagie/anorha-tray`); the macOS `zip` target is required for the update feed.
- **`appId: app.anorha.tray` must never change** — macOS TCC grants and the auto-update identity both key off it.

Signing/notarization is wired for CI (`.github/workflows/release.yml`: unsigned smoke build on PRs, full signed release on `v*` tags). Full details, including the Apple secret list, are in [`docs/PACKAGING.md`](docs/PACKAGING.md).

---

## Scripts

| Script | What it does |
|--------|--------------|
| `dev` / `build` / `start` | electron-vite dev (HMR) · bundle to `out/` · preview a build |
| `dist` · `dist:mac` · `dist:win` · `dist:dir` | package (all · mac · win · unsigned local) |
| `release` | signed + notarized build, published to GitHub Releases |
| `ponder` / `ponder:list` | run the `ponder` CLI from the repo |
| `mcp` · `mcp:http` | MCP server — stdio (Claude Desktop) · HTTP :7831 (web) |
| `mcp:install` · `mcp:setup` · `mcp:doctor` · `mcp:status` | install into Claude config · guided setup · health checks |
| `convex:dev` · `convex:deploy` | local session store (`convex/`: `sessions`, `steps`) |
| `modal:deploy` | deploy self-hosted Holo3 (`modal_app.py`) |
| `bench:decisions` · `bench:integration` · `bench:menu` | planner-routing + end-to-end harnesses (`bench/`) |
| `typecheck` | `tsc --noEmit` (must be clean before merge) |

---

## Repo layout

```
electron/                 # Electron main process, preload, tray, windows, Clerk link
  main.ts                 #   boots tray + bridge (:7900) + browser-jobs consumer
  clerk-link.ts           #   account linking → /desktop-callback
  public-config.ts        #   public Convex URL / API host
src/
  agent/                  # the automation core
    loop.ts  brain.ts  eyes.ts  recorder.ts
    browser/playwriter.ts #   real Chrome via Playwriter (CDP)
    providers/            #   hcompany · planner · remote (Modal) · local (Ollama)
    browser-jobs/         #   config · device · consumer · ponder-executor (cloud queue)
    agp/                  #   H Company hosted-brain thin driver
  mcp/                    # MCP server (stdio + http) + install/doctor/setup/status + tools.ts
  cli/                    # `ponder` CLI + public SDK (sdk.ts)
  bridge/                 # localhost HTTP bridge auth (Stripe-style keys)
  renderer/               # React UI — app/ (tray panel) + buddy/ (cursor overlay)
convex/                   # local session/step tables + functions
modal_app*.py             # optional self-hosted Holo3 (Modal)
bench/  tests/            # benchmarks + device-flow test
build/  assets/           # icons, entitlements, tray assets (packaging resources)
docs/  examples/  skills/ # guides, runnable examples, Claude Code skill
```

---

## Configuration reference

Env vars (names only — see [`.env.example`](.env.example), whose account-linking values are public/publishable and safe to commit):

- **Brain** — `HAI_API_KEY`, `HCOMPANY_MODEL` · `MODAL_BASE_URL`, `MODAL_BEARER_TOKEN` · `OLLAMA_HOST`, `OLLAMA_MODEL` · `GEMINI_API_KEY` / `PLANNER_MODEL` / `PLANNER_API_BASE` / `PLANNER_API_KEY` / `PLANNER_VISION` / `PONDER_PLANNER`
- **Account linking** — `VITE_CONVEX_URL` (the `browserJobs` deployment), `CLERK_PUBLISHABLE_KEY` (prod Clerk instance), `PONDER_API_BASE_URL` (resolves the account's active org)
- **Runtime** — `PONDER_BRIDGE_PORT` (default 7900), `MCP_PORT` (default 7831), `PONDER_SKIP_POSTINSTALL`

State on disk: `~/.ponder/device.json` (linked-device credential, `0600`), `~/.ponder/recipes/` & `~/.ponder/sessions/`, `~/.holo3-agent/preferences.json` (provider/engine/auto-replay).

> **MCP hot-reload gotcha** (see [`CLAUDE.md`](CLAUDE.md)): the MCP server is a long-lived child process and does **not** reload on commit. After changing `src/mcp/**` or `src/agent/**`, call the `holo3_version` tool and compare to `git rev-parse --short HEAD`; if they differ, run `bash scripts/kill-stale-mcp.sh` and restart your client.

---

## Docs

- [`docs/TRAY-PRODUCTIONIZATION-PLAN.md`](docs/TRAY-PRODUCTIONIZATION-PLAN.md) — the full tray build roadmap (task lifecycle, keep-vs-strip, the hard gaps).
- [`docs/PACKAGING.md`](docs/PACKAGING.md) — signing, notarization, CI, auto-update.
- [`docs/PHONE-DISPATCH-SETUP.md`](docs/PHONE-DISPATCH-SETUP.md) · [`docs/DESKTOP-CALLBACK-PAGE.md`](docs/DESKTOP-CALLBACK-PAGE.md) — phone → desktop job dispatch + the Clerk callback.
- [`docs/LONG-TASK-SETUP.md`](docs/LONG-TASK-SETUP.md) · [`docs/PONDER-MARKETPLACE-CRUD.md`](docs/PONDER-MARKETPLACE-CRUD.md) — big-task decomposition + marketplace CRUD patterns.
- [`docs/sdk.md`](docs/sdk.md) · [`docs/bridge.md`](docs/bridge.md) · [`docs/recipes.md`](docs/recipes.md) — engine API surfaces.

---

## Lineage & related repos

Forked from **`holo3-agent`** (the "Ponder" automation platform) and reshaped into a signed background tray daemon for Anorha.

- **[anorha-bknd](https://github.com/danielosagie/anorha-bknd)** — hosts the Convex `browserJobs` queue this tray consumes, and the API it links against.
- **[anorha-expo](https://github.com/danielosagie/anorha-expo)** — the mobile app that enqueues jobs from your phone.
- **[anorha-web](https://github.com/danielosagie/anorha-web)** — marketing site + internal ops dashboard.

---

## License

Apache-2.0 — see [`LICENSE`](LICENSE). Typecheck (`npm run typecheck`) must be clean before merge; see [`CONTRIBUTING.md`](CONTRIBUTING.md).
