"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const electron = require("electron");
const node_http = require("node:http");
const node_child_process = require("node:child_process");
const path = require("node:path");
const os = require("node:os");
const dotenv = require("dotenv");
const browser = require("convex/browser");
const server = require("convex/server");
const crypto = require("node:crypto");
const fsp = require("node:fs/promises");
const ollama = require("ollama");
const nutJs = require("@nut-tree-fork/nut-js");
const node_util = require("node:util");
const node_zlib = require("node:zlib");
const fs = require("node:fs");
const electronUpdater = require("electron-updater");
const node_events = require("node:events");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const path__namespace = /* @__PURE__ */ _interopNamespaceDefault(path);
const os__namespace = /* @__PURE__ */ _interopNamespaceDefault(os);
const crypto__namespace = /* @__PURE__ */ _interopNamespaceDefault(crypto);
const fsp__namespace = /* @__PURE__ */ _interopNamespaceDefault(fsp);
const fs__namespace = /* @__PURE__ */ _interopNamespaceDefault(fs);
const api = server.anyApi;
server.componentsGeneric();
const SNAPSHOT_LIMIT$1 = 8e3;
const SNAPSHOT_LIMIT_COMPOSITE = 24e3;
async function think(provider, args) {
  let task = args.task;
  const TASK_PRIORITY_PREAMBLE = `[TASK PRIORITY]
1. Task text > screen state. Do task steps in the order written. If step 1 names an app that isn't visible, open it (open app "Name" — or cmd+space → type → enter as fallback) BEFORE anything else; ignore unrelated tabs/dialogs.
2. If a described element produced no screen change in your last action, it's not there — change the description (or strategy), don't re-emit.
3. Only if the task is truly impossible — a permission-denied / read-only / error dialog or a system message blocks it (NOT merely a hard or fiddly step) — reply exactly: INFEASIBLE: <one-line reason>. Never use this to give up on a hard-but-doable task.

[TASK TEXT]
`;
  task = TASK_PRIORITY_PREAMBLE + task;
  if (args.currentUrl && !args.browserSnapshot) {
    const urlForHints = (args.currentUrl.url || "").toLowerCase();
    const titleForHints = (args.currentUrl.title || "").toLowerCase();
    const onFacebookMarketplace = urlForHints.includes("facebook.com/marketplace") || titleForHints.includes("marketplace");
    let constructableHint = "";
    if (onFacebookMarketplace) {
      constructableHint = `

[FAST PATH AVAILABLE — keyboard nav to constructed URL]
You're on Facebook Marketplace. SEARCH TASKS can be done
in 2 actions WITHOUT clicking a search bar:

  Step A: press cmd+l
          (this focuses the URL bar)
  Step B: type the EXACT TEXT below (it is a complete URL):
          https://www.facebook.com/marketplace/search?query=YOUR_QUERY_HERE
          and press enter

For step B, REPLACE 'YOUR_QUERY_HERE' with the search term
from the user's task (URL-encode spaces as +). For example,
to search for "bulbasaur", type the COMPLETE string:
  https://www.facebook.com/marketplace/search?query=bulbasaur

DO NOT type just the search term alone — that goes to Google.
Type the FULL URL beginning with "https://".

This is faster than the click-the-sidebar approach AND
immune to vision grounding misses (no coords needed).

KNOWN MARKETPLACE URLS (use the one matching the task):
  • search listings:   https://www.facebook.com/marketplace/search?query=...
  • the USER'S OWN listings ("my listings", "products I'm
    selling", editing your own items):
    https://www.facebook.com/marketplace/you/selling
Do NOT search the public marketplace for the user's own items —
their listings live under /you/selling.
`;
    }
    task = `[Browser state — for state-awareness only, do NOT emit actions about this:]
  URL:   ${args.currentUrl.url}
  Title: ${args.currentUrl.title}
Use this to decide if your prior action LANDED — if the URL changed to a results / detail / success page, emit DONE. If the URL didn't change after a click/type/key action, the action didn't fire — pick a different target.${constructableHint}

` + task;
  }
  if (args.browserSnapshot) {
    const ax = args.browserSnapshot.ax;
    const snapshotLimit = provider.name === "composite" ? SNAPSHOT_LIMIT_COMPOSITE : SNAPSHOT_LIMIT$1;
    const trimmed = ax.length > snapshotLimit ? ax.slice(0, snapshotLimit) + "\n…(truncated)" : ax;
    task = `${task}

[CHROME ACTIVE — you may use browser.* actions]
Page: ${args.browserSnapshot.title} (${args.browserSnapshot.url})
Interactive elements (refs in [eN]):
${trimmed}
[end snapshot]

Available browser.* verbs (PREFERRED for web tasks):
  browser.navigate <url>         (open a URL — use this when the current tab is the Playwriter welcome page or any page that doesn't expose what you need)
  browser.click <ref>            (e.g. browser.click e12)
  browser.type <ref> "text"      (optionally "and press enter")
  browser.scroll page down       (use for full-page scrolls — sidesteps cursor bugs)
  browser.scroll page up
  browser.scroll <ref> down      (scroll a specific element/sidebar)
  browser.read [<ref>]           (read element or whole page text)
Use browser.scroll page down for whole-page scrolls — it scrolls the
document viewport instead of whatever's under the cursor. BUT if it
changes nothing (many app-like pages keep their lists in a NESTED
scroll container that window scrolling can't reach), switch to the
grounded form: scroll down at <description of the list/pane>.
If the snapshot URL is chrome-extension://…/welcome.html, your FIRST step
should be browser.navigate <url> — the welcome tab is just a launchpad.
` + (/facebook\.com/i.test(args.browserSnapshot.url) ? `
FACEBOOK URL MAP: the user's OWN listings ("my listings", items
they are selling, editing their own items) live at
https://www.facebook.com/marketplace/you/selling — go there
directly; do NOT search the public marketplace for them.
` : ``) + `
CLI BIAS — default to keyboard/CLI verbs (~70% of actions):
browser.navigate, browser.type, hotkey, press. Reserve browser.click for
the ~30% of steps where you must pick a SPECIFIC item from a list (a
search-result card, a dropdown suggestion, a listing tile). If the
user's task specifies a different ratio (e.g. "use cli 90% of the time"),
HONOR THAT verbatim — they know their workflow.

SCOPE CHECK — when typing a search query, identify which textbox first:
  • Address bar (browser-level): named "Address and search bar" /
    "Search Google or type a URL", or pre-filled with the page URL.
    USE THIS only to navigate to a different site — and prefer
    browser.navigate <url> directly when the destination is known.
  • Page search (site-level): named "Search Marketplace", "Search
    products", "Search YouTube", "Search messages", etc. USE THIS to
    search INSIDE the current site (this is what you usually want).
A page may have multiple search bars; pick the one whose name matches
the goal. For Marketplace listings, use "Search Marketplace", not the
generic top-of-page Facebook search.

SEARCH / LOCATION FORM — TYPE → CLICK SUGGESTION → CLICK APPLY.
A "(disabled)" ref is UNCLICKABLE — clicking wastes 5s on a Playwright timeout.
When you typed into a search/location/combobox field and the submit button
(Apply / Search / Confirm) is disabled, your NEXT action MUST be
browser.click on a "(suggestion)" ref (or any role: option / menuitem /
listitem / link in the dropdown), NOT the disabled button, NOT pressing enter.

  Snapshot:
    [e86] textbox "Location"
    [e91] option "Marietta, GA, United States" (suggestion)
    [e90] button "Apply" (disabled)
  Last action: browser.type e86 "Marietta, GA"
    Wrong: browser.click e90       ← it's disabled, this hangs for 5s
    Wrong: press enter             ← submit is via the button, not enter
    Right: browser.click e91       ← Apply un-disables on the next snapshot

When the goal mentions a location/search/category filter, expect this
TYPE → CLICK SUGGESTION → CLICK APPLY three-step pattern.`;
  }
  if (args.routerHint) {
    task += `

[CLI ROUTER ESCALATED — reason: ${args.routerHint}]
The fast local agent could not proceed from the snapshot alone. Use the screenshot to find what the router missed.`;
  }
  const combinedEnabled = (process.env.PONDER_COMBINED_STEP ?? "on").toLowerCase() !== "off";
  if (combinedEnabled && typeof provider.step === "function") {
    console.log(
      `[brain] → ${provider.name}.step history=${args.history.length} screen=${args.screen[0]}x${args.screen[1]}` + (args.browserSnapshot ? ` snapshot=${args.browserSnapshot.ax.length}b` : "") + (args.routerHint ? ` routerHint="${args.routerHint.slice(0, 60)}"` : "")
    );
    try {
      const s = await provider.step({
        task,
        history: args.history,
        screenshotB64: args.screenshotB64,
        screen: args.screen,
        signal: args.signal
      });
      const bare = /^(click|double(?:\s+click)?|right\s+click|triple\s+click|press|hotkey|type|drag|scroll|wait)$/i.test(
        s.action.trim()
      );
      if (!bare) {
        console.log(
          `[brain] ← action="${s.action}" coords=${s.x !== null && s.y !== null ? `(${s.x},${s.y})` : "null"}${s.usage ? ` usage=${JSON.stringify(s.usage)}` : ""}`
        );
        return {
          action: s.action,
          coords: s.x !== null && s.y !== null ? { x: s.x, y: s.y } : null
        };
      }
      console.log(
        `[brain] combined step returned bare verb "${s.action}" — falling back to split plan for this step`
      );
    } catch (e) {
      console.log(
        `[brain] combined step failed (${e instanceof Error ? e.message.split("\n")[0] : String(e)}) — falling back to split plan`
      );
    }
  }
  console.log(
    `[brain] → ${provider.name}.plan history=${args.history.length} screen=${args.screen[0]}x${args.screen[1]}` + (args.browserSnapshot ? ` snapshot=${args.browserSnapshot.ax.length}b` : "") + (args.routerHint ? ` routerHint="${args.routerHint.slice(0, 60)}"` : "")
  );
  const { action, usage } = await provider.plan({
    task,
    history: args.history,
    screenshotB64: args.screenshotB64,
    screen: args.screen,
    signal: args.signal
  });
  console.log(
    `[brain] ← action="${action}"${usage ? ` usage=${JSON.stringify(usage)}` : ""}`
  );
  return { action, coords: null };
}
const KEYBOARD_ONLY = /^(type\s+|press\s+|hotkey\s+|scroll\s+|wait\s+|done|note\s+|open\s+app\s+|browser\.)/i;
function needsCoordinates(action) {
  const a = action.trim();
  if (/^scroll\s+(up|down)\s+(at|in|on)\b/i.test(a)) return true;
  return !KEYBOARD_ONLY.test(a);
}
const VALID_ACTION_VERB = /^(?:click\b|double\s+click\b|triple\s+click\b|right\s+click\b|(?:cmd|command|shift|alt|option|ctrl|control)[\s_-]*click\b|hover\b|type\b|press\b|hotkey\b|drag\b|scroll\b|wait\b|note\b|open\s+app\b|done\b|infeasible\b|browser\.)/i;
function isValidAction(action) {
  return VALID_ACTION_VERB.test(action.trim());
}
function isDone(action) {
  return /^DONE\b/i.test(action.trim());
}
function isInfeasible(action) {
  return /^INFEASIBLE\b/i.test(action.trim());
}
function infeasibleReason(action) {
  const m = action.trim().match(/^INFEASIBLE\s*[:\-]?\s*(.+)$/is);
  const reason = m?.[1]?.trim();
  return reason && reason.length > 0 ? reason : "no reason given";
}
function parseDragAction(action) {
  const m = action.trim().match(/^drag(?:\s+and\s+drop)?\s+(?:from\s+)?(.+?)\s+(?:to|onto|into)\s+(.+?)\.?$/i);
  if (!m) return null;
  const from = m[1]?.trim();
  const to = m[2]?.trim();
  if (!from || !to) return null;
  return { from, to };
}
const VALID_REF = /^e\d+$/i;
function parseBrowserAction(action) {
  const a = action.trim();
  if (!/^browser\./i.test(a)) return null;
  let m;
  m = a.match(/^browser\.navigate\s+(.+)$/i);
  if (m) {
    let url = m[1].trim().replace(/^[<"'`]+|[>"'`.,;]+$/g, "");
    if (!/^[a-z]+:\/\//i.test(url) && !url.startsWith("about:")) {
      url = `https://${url}`;
    }
    return { kind: "navigate", url };
  }
  m = a.match(/^browser\.click\s+(\S+)/i);
  if (m) {
    if (!VALID_REF.test(m[1])) return null;
    return { kind: "click", ref: m[1] };
  }
  m = a.match(
    /^browser\.type\s+(\S+)\s+["“'](?<text>[^"”']*)["”']\s*(?:(?:and|then)\s+press\s+(?<key>\w+))?/i
  );
  if (m?.groups) {
    if (!VALID_REF.test(m[1])) return null;
    return {
      kind: "type",
      ref: m[1],
      text: m.groups.text,
      submit: /^enter$/i.test(m.groups.key ?? "")
    };
  }
  m = a.match(/^browser\.scroll\s+page\s+(up|down)(?:\s+(\d+))?/i);
  if (m) {
    return {
      kind: "scroll_page",
      dir: m[1].toLowerCase(),
      amount: m[2] ? parseInt(m[2], 10) : void 0
    };
  }
  m = a.match(/^browser\.scroll\s+(\S+)\s+(up|down)(?:\s+(\d+))?/i);
  if (m) {
    if (!VALID_REF.test(m[1])) return null;
    return {
      kind: "scroll_element",
      ref: m[1],
      dir: m[2].toLowerCase(),
      amount: m[3] ? parseInt(m[3], 10) : void 0
    };
  }
  m = a.match(/^browser\.read(?:\s+(\S+))?/i);
  if (m) return { kind: "read", ref: m[1] };
  return null;
}
const MAX_PLAN_STEPS = Number(process.env.PONDER_DECOMPOSE_MAX_STEPS ?? 12);
function decomposeEnabled() {
  const v = (process.env.PONDER_DECOMPOSE ?? "").toLowerCase();
  return v === "1" || v === "on" || v === "true";
}
const DECOMPOSE_PROMPT_HEADER = `PLANNING REQUEST — do not click anything.
Break the task below into a SHORT ordered list of atomic UI steps.
Rules:
- Plan the TASK, not the current screen. The screenshot may show an
  UNRELATED app — including the agent's OWN control window (an Electron
  app with provider buttons like "Modal" / "H Company" / "Local" and
  "Sessions" / "Automations" tabs). NEVER plan steps that interact with
  that window: it is the agent's UI, not the task's target. If the
  task's app/site is not on screen yet, the FIRST step must reach it
  (browser.navigate <url> for websites, or open app "Name" for a
  native macOS app).
- Each step = ONE physical action (a single click, one typed string, one
  hotkey) that a verifier can confirm is done from a screenshot.
- Each step carries an "expect": what the SCREEN should visibly show
  once that step succeeded ("the calculator display shows 47", "the
  listing's edit form is open"). Describe OUTCOMES, never brand names
  of system UI ("an app launcher overlay with a search field is open",
  NOT "Spotlight is open" — some machines run Raycast/Alfred instead).
- Use the screenshot to skip steps that are ALREADY satisfied (app
  already open, field already filled).
- If the task is already a single atomic action, return it as the only
  element.
- Reply with ONLY a JSON array of objects, each
  {"step": "<action>", "expect": "<visible result>"}.
  No prose, no numbering, no markdown fence.
`;
function browserStateBlock(ctx) {
  if (ctx?.connected) {
    return `
BROWSER STATE: a controlled Chrome tab is ALREADY CONNECTED` + (ctx.url ? ` (current URL: ${ctx.url})` : "") + `.
- Every step that happens on a website MUST be a browser.* action:
  browser.navigate <url> / browser.click e<N> / browser.type e<N> "text" / browser.read.
- Navigate to the MOST SPECIFIC URL for the goal, not a homepage
  (e.g. the user's own listings live at
  facebook.com/marketplace/you/selling — going to /marketplace and
  clicking through menus wastes steps).
- NEVER plan launcher or app-opening steps (hotkey cmd+space,
  "open Chrome", Spotlight, Raycast) for anything reachable in the
  browser — the tab is already controllable without them.
- LOOKUP vs ACTION — decide which this is:
  • PURE LOOKUP (the ONLY goal is to retrieve/answer info — find,
    check, what is, who won, how much): do NOT break it up. Return
    the task as the SINGLE element; the step loop solves it directly
    (navigate → browser.read → answer).
  • MULTI-ITEM ACTION (do something to EACH / ALL of a set — "change
    the description on each listing", "message every seller"): also
    return the task as a SINGLE element. The step loop iterates item
    by item using its working memory; a fixed step list would run
    ONCE and stop after a single item. Do NOT enumerate items.
  • SINGLE-TARGET ACTION (modify ONE specific thing — "change the
    price of the Honda listing to $2000"): decompose into real
    steps — (1) reach the page, (2) open the target, (3) make the
    change, (4) save. A bare "navigate" step is NOT enough.
`;
  }
  return `
BROWSER STATE: no controlled browser tab is connected.
- To open a macOS app, plan ONE step: open app "Name" (launches
  directly — no launcher involved).
- Only fall back to hotkey cmd+space if open app failed. cmd+space
  opens the system launcher — Spotlight on some machines, Raycast on
  others; both launch apps the same way (type the name, press enter).
`;
}
function parsePlanArray(text) {
  const opens = [];
  for (let i = 0; i < text.length && opens.length < 16; i++) {
    if (text[i] === "[") opens.push(i);
  }
  for (const start of opens) {
    let end = text.length - 1;
    while (end > start) {
      end = text.lastIndexOf("]", end);
      if (end <= start) break;
      try {
        const parsed = JSON.parse(text.slice(start, end + 1));
        if (Array.isArray(parsed)) {
          const steps = [];
          const expects = [];
          let valid = true;
          for (const item of parsed) {
            if (typeof item === "string" && item.trim().length > 0) {
              steps.push(item.trim());
              expects.push(null);
            } else if (item !== null && typeof item === "object" && typeof item.step === "string" && item.step.trim().length > 0) {
              const o = item;
              steps.push(o.step.trim());
              expects.push(
                typeof o.expect === "string" && o.expect.trim().length > 0 ? o.expect.trim() : null
              );
            } else {
              valid = false;
              break;
            }
          }
          return valid && steps.length === parsed.length ? { steps, expects } : null;
        }
      } catch {
      }
      end -= 1;
    }
  }
  return null;
}
async function decompose(task, firstScreenshotB64, screen, provider, signal, browserCtx) {
  const fallback = {
    steps: [task],
    expects: [null],
    oneShot: true
  };
  let raw;
  try {
    const t0 = Date.now();
    const result = await provider.plan({
      task: DECOMPOSE_PROMPT_HEADER + browserStateBlock(browserCtx) + "\nTask: " + task,
      history: [],
      screenshotB64: firstScreenshotB64,
      screen,
      signal
    });
    raw = result.action ?? "";
    console.log(
      `[decompose] plan call ${Date.now() - t0}ms → ${raw.slice(0, 200)}`
    );
  } catch (e) {
    console.log(
      `[decompose] provider.plan failed (${e instanceof Error ? e.message : String(e)}) — falling back to flat`
    );
    return fallback;
  }
  const parsed = parsePlanArray(raw);
  if (!parsed || parsed.steps.length <= 1) {
    console.log(
      `[decompose] ${parsed ? `single-step plan` : `unparseable output`} — running flat`
    );
    return fallback;
  }
  if (parsed.steps.length > MAX_PLAN_STEPS) {
    console.log(
      `[decompose] plan has ${parsed.steps.length} steps (> cap ${MAX_PLAN_STEPS}) — over-decomposition symptom, running flat`
    );
    return fallback;
  }
  return { steps: parsed.steps, expects: parsed.expects, oneShot: false };
}
function pngDimensions$1(buf) {
  if (buf.length < 24) return null;
  if (buf.readUInt32BE(0) !== 2303741511) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
function execFileP(cmd, argv) {
  return new Promise((resolve, reject) => {
    node_child_process.execFile(
      cmd,
      argv,
      { timeout: 15e3 },
      (err) => err ? reject(err) : resolve()
    );
  });
}
async function cropAndScalePng(png, rect, scale) {
  const dims = pngDimensions$1(png);
  if (!dims) throw new Error("cropAndScalePng: not a PNG buffer");
  const x = Math.max(0, Math.min(Math.round(rect.x), dims.width - 1));
  const y = Math.max(0, Math.min(Math.round(rect.y), dims.height - 1));
  const w = Math.max(1, Math.min(Math.round(rect.w), dims.width - x));
  const h = Math.max(1, Math.min(Math.round(rect.h), dims.height - y));
  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));
  const tag = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpIn = path__namespace.join(os__namespace.tmpdir(), `ponder-imgops-in-${tag}.png`);
  const tmpOut = path__namespace.join(os__namespace.tmpdir(), `ponder-imgops-out-${tag}.png`);
  await fsp.writeFile(tmpIn, png);
  try {
    await execFileP("/usr/bin/sips", [
      "--cropToHeightWidth",
      String(h),
      String(w),
      "--cropOffset",
      String(y),
      String(x),
      tmpIn,
      "--out",
      tmpOut
    ]);
    if (outW !== w || outH !== h) {
      await execFileP("/usr/bin/sips", [
        "--resampleHeightWidth",
        String(outH),
        String(outW),
        tmpOut
      ]);
    }
    return await fsp.readFile(tmpOut);
  } finally {
    await fsp.unlink(tmpIn).catch(() => {
    });
    await fsp.unlink(tmpOut).catch(() => {
    });
  }
}
function refineEnabled() {
  const v = (process.env.PONDER_GROUND_REFINE ?? "").toLowerCase();
  return v === "1" || v === "on" || v === "true";
}
const REFINE_BOX_LOGICAL = Number(process.env.PONDER_GROUND_REFINE_BOX ?? 320);
const REFINE_SCALE = Number(process.env.PONDER_GROUND_REFINE_SCALE ?? 2);
async function findCoordinates(provider, args, opts) {
  console.log(`[eyes] → ${provider.name}.ground "${args.instruction}"`);
  const r = await provider.ground(args);
  if (r.error) {
    console.warn(`[eyes] ← error: ${r.error}`);
    return null;
  }
  const [w, h] = args.screen;
  if (r.x < 0 || r.y < 0 || r.x >= w || r.y >= h) {
    console.warn(`[eyes] ← out-of-bounds (${r.x}, ${r.y}) for ${w}x${h}`);
    return null;
  }
  const coarse = { x: r.x, y: r.y };
  console.log(
    `[eyes] ← (${coarse.x}, ${coarse.y})${r.raw ? ` raw=${JSON.stringify(r.raw)}` : ""}`
  );
  if (!(opts?.refine === true || refineEnabled())) return coarse;
  try {
    const refined = await refine(provider, args, coarse, [w, h]);
    if (refined) {
      console.log(
        `[eyes] ⊕ refined (${coarse.x},${coarse.y}) → (${refined.x},${refined.y})`
      );
      return refined;
    }
  } catch (e) {
    console.warn(
      `[eyes] refine failed (${e instanceof Error ? e.message : String(e)}) — using coarse`
    );
  }
  return coarse;
}
async function refine(provider, args, coarse, [w, h]) {
  if (Math.min(w, h) < REFINE_BOX_LOGICAL * 1.5) {
    console.log(
      `[eyes] refine skipped: source ${w}x${h} is already a zoomed view (box=${REFINE_BOX_LOGICAL}) — keeping coarse`
    );
    return null;
  }
  const png = Buffer.from(args.screenshotB64, "base64");
  const dims = pngDimensions$1(png);
  if (!dims) return null;
  const scaleX = dims.width / w;
  const scaleY = dims.height / h;
  const half = REFINE_BOX_LOGICAL / 2;
  const bx = Math.max(0, Math.min(coarse.x - half, w - REFINE_BOX_LOGICAL));
  const by = Math.max(0, Math.min(coarse.y - half, h - REFINE_BOX_LOGICAL));
  const boxW = Math.min(REFINE_BOX_LOGICAL, w);
  const boxH = Math.min(REFINE_BOX_LOGICAL, h);
  const cropped = await cropAndScalePng(
    png,
    {
      x: bx * scaleX,
      y: by * scaleY,
      w: boxW * scaleX,
      h: boxH * scaleY
    },
    REFINE_SCALE
  );
  const f = await provider.ground({
    instruction: args.instruction,
    screenshotB64: cropped.toString("base64"),
    screen: [boxW, boxH],
    signal: args.signal
  });
  if (f.error) return null;
  if (f.x < 0 || f.y < 0 || f.x >= boxW || f.y >= boxH) return null;
  const fx = bx + f.x;
  const fy = by + f.y;
  if (fx < 0 || fy < 0 || fx >= w || fy >= h) return null;
  return { x: Math.round(fx), y: Math.round(fy) };
}
const SYSTEM_PROMPT$2 = `You are a task planner for an autonomous computer-use agent that operates a real desktop.

The agent can click, type, scroll, and read the screen. A separate vision model handles every pixel-level action — your job is to give it a SHORT numbered plan of focused subtasks.

Rules:
- 3 to 6 subtasks. Never more.
- Each subtask is ONE focused phase of work: "Open Chrome", "Search Google for 'X'", "Open the most relevant non-ad result and skim the page".
- Phrase as imperative actions in present tense.
- DO NOT decompose into individual clicks, key presses, or coordinates — the lower-level vision model handles those.
- Plan in SCOPES, from outermost to innermost — this prevents the lower-level model from confusing the OS launcher, the browser address bar, and an in-page search bar (a common failure that wastes 10+ steps):
   1. OS scope — open or focus the right APP (Chrome, Slack, Finder, etc.).
   2. App scope — navigate to the right WINDOW / TAB / URL inside that app.
   3. Page scope — use the page's OWN controls (its search bar, its filter buttons, its result cards) to do the specific thing. NOT the OS search. NOT the browser address bar.
- The first subtask usually opens an app or focuses the right window.
- The last subtask reports the answer / confirms completion.
- If the task names specific criteria ("for a Dell SE2719HR", "rotating monitors", "in Marietta GA"), preserve those words in the relevant subtask so the lower-level model has them too.
- DEFAULT TOOL PREFERENCE: the lower-level executor leans ~70% keyboard / CLI-style verbs (browser.navigate, browser.type, hotkey, press) and ~30% mouse (browser.click, click) — that's already wired into its system prompt, you don't need to repeat it. Only override when the user explicitly states a different ratio in the task ("use cli 90% of the time", "no keyboard shortcuts", etc.) — in that case, preserve the user's wording verbatim in the relevant subtask. If the user says nothing about tool preference, say nothing.

Worked example — "find a 1997 Toyota Camry on Facebook Marketplace in Marietta GA under $3k":
  1. Open or switch to Chrome
  2. Navigate to facebook.com/marketplace
  3. Use the Marketplace search bar to search for "1997 Toyota Camry"
  4. Set the location filter to Marietta, GA and the price filter to under $3000
  5. Open the top matching listings and report their details
  DONE

Output format — exactly this, no preamble, no commentary:
1. <subtask>
2. <subtask>
3. <subtask>
DONE`;
function parsePlan(raw) {
  let body = raw.replace(/<think>[\s\S]*?<\/think>/g, "");
  const tIdx = body.indexOf("<think>");
  if (tIdx !== -1) body = body.slice(0, tIdx);
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const subtasks = [];
  for (const line of lines) {
    if (/^DONE\b/i.test(line)) break;
    const m = line.match(/^(?:\d+[.)]|[-*•])\s+(.+?)\s*$/);
    if (m) {
      const text = m[1].trim();
      if (text.length >= 4 && text.length <= 200) subtasks.push(text);
    }
  }
  return subtasks;
}
function createOllamaPlanner(cfg = {}) {
  const ollama$1 = new ollama.Ollama({
    host: cfg.host ?? process.env.PLANNER_HOST ?? process.env.NARRATOR_HOST ?? process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434"
  });
  const model = cfg.model ?? process.env.PLANNER_MODEL ?? process.env.NARRATOR_MODEL ?? "qwen3.5:0.8b";
  const timeoutMs = cfg.timeoutMs ?? Number(process.env.PLANNER_TIMEOUT_MS ?? 8e3);
  return {
    async plan(task, context) {
      const t0 = Date.now();
      const stateBits = [];
      if (context?.frontmostApp) {
        stateBits.push(`Frontmost app: ${context.frontmostApp}`);
      }
      if (context?.browserUrl) {
        stateBits.push(`Active Chrome URL: ${context.browserUrl}`);
      }
      if (context?.browserTitle) {
        stateBits.push(`Active Chrome title: ${context.browserTitle}`);
      }
      const stateBlock = stateBits.length > 0 ? `

Current state:
${stateBits.join("\n")}

IMPORTANT: skip any setup subtask that's already satisfied by the current state above. If Chrome is already on the right URL, do NOT decompose "Open Chrome" or "Navigate to URL" as subtasks — start from the next thing to do.` : "";
      try {
        const result = await Promise.race([
          ollama$1.chat({
            model,
            messages: [
              { role: "system", content: SYSTEM_PROMPT$2 },
              { role: "user", content: `Task: ${task}${stateBlock}` }
            ],
            // think: false — disable Qwen3 reasoning at the API level.
            // Without this, qwen3.5:0.8b emits a 5-9s <think> block on
            // every prompt, which is why the planner kept hitting
            // "planner timeout" → "running flat" in every trace. With
            // reasoning off the same call returns in ~300-800ms and the
            // 8s timeout becomes generous headroom rather than a
            // permanent ceiling. Same fix the router and extractor got.
            think: false,
            // temperature: low so the plan is deterministic; we don't want
            // creativity here, we want the SHORTEST sensible decomposition.
            // num_predict: 256 is plenty for 6 subtasks at ~30 tokens each.
            options: { temperature: 0.3, num_predict: 256 }
          }),
          new Promise(
            (_, rej) => setTimeout(() => rej(new Error("planner timeout")), timeoutMs)
          )
        ]);
        const raw = result.message.content;
        const subtasks = parsePlan(raw);
        const capped = subtasks.slice(0, 6);
        if (capped.length === 0) {
          return {
            subtasks: [task],
            decomposed: false,
            note: `planner returned an unparseable plan (${Date.now() - t0}ms) — running flat`
          };
        }
        if (capped.length === 1) {
          return {
            subtasks: capped,
            decomposed: false,
            note: `planner returned 1 subtask (${Date.now() - t0}ms) — running flat`
          };
        }
        return {
          subtasks: capped,
          decomposed: true,
          note: `planner produced ${capped.length} subtasks (${Date.now() - t0}ms)`
        };
      } catch (e) {
        return {
          subtasks: [task],
          decomposed: false,
          note: `planner unavailable (${e instanceof Error ? e.message : String(e)}) — running flat`
        };
      }
    },
    async available() {
      try {
        const list = await ollama$1.list();
        return list.models.some(
          (m) => m.name === model || m.name === `${model}:latest`
        );
      } catch {
        return false;
      }
    }
  };
}
const SYSTEM_PROMPT$1 = `You are the FAST-PATH router for a computer-use agent. The user's Chrome browser is connected via a snapshot of the active tab's accessibility tree. Each interactive element is tagged [eN]. Your job: pick the SINGLE next action OR escalate to the vision agent.

Respond with EXACTLY ONE LINE in one of these shapes:

  browser.navigate <url>         (open a URL in the active tab — use this when the page can't help with the goal yet, e.g. you're on the Playwriter welcome page or a search-engine landing page and need to jump to facebook.com / amazon.com / google.com / etc.)
  browser.click <ref>            (e.g. browser.click e12)
  browser.type <ref> "text"      (with optional "and press enter")
  browser.scroll page down       (whole-viewport scroll — use for "I need to see more")
  browser.scroll page up
  browser.scroll <ref> down      (scroll a specific element / sidebar)
  browser.read                   (read whole page text — when the user asked an informational question and you need to extract the content)
  browser.read <ref>             (read a specific region's text)
  DONE                           (the user's goal is visibly achieved on this snapshot)
  VISION_NEEDED <one-sentence reason>   (CLI cannot proceed — the vision agent will take over this step)

LAUNCHPAD RULE — when the active URL is chrome-extension://*/src/welcome.html (the Playwriter auto-created tab), the snapshot will be near-empty. Your FIRST action MUST be browser.navigate to a URL that helps the goal. Pick a sensible site from the user's task ("facebook marketplace" → https://www.facebook.com/marketplace, "amazon" → https://www.amazon.com, "search X" → https://www.google.com/search?q=X). Do NOT escalate from the welcome page — vision can't help here either; just navigate.

SCOPE CHECK — when typing a search query, FIRST identify which textbox you're targeting:
  • Address bar (browser-level): named like "Address and search bar", "Search Google or type a URL", or has the active page URL pre-filled. ONLY use this when the goal is to navigate to a different site — for that, prefer browser.navigate <url> directly.
  • Page search (site-level): named like "Search Marketplace", "Search products", "Search messages", "Search YouTube". USE THIS when searching INSIDE the current site.
A page may have multiple search bars (header search, sidebar/filter search, modal search). Pick the one whose name matches the goal — if the user wants Marketplace listings, use "Search Marketplace", not the generic top-of-page Facebook search.

REDIRECT DETECTION — if your previous action was \`browser.navigate X\` and the current snapshot URL is NOT X (the site rewrote your URL), the destination URL is invalid for that site. DO NOT re-emit the same navigate — you'll loop. Common cases:
  • Facebook Marketplace doesn't accept arbitrary city slugs in /marketplace/<city>/search — it normalizes to /marketplace/category/search/.
  • Some sites strip query params, redirect HTTP→HTTPS, or send / to /home.
  Fix: either accept the redirected URL and proceed from THERE (use the page's own filters/search bar to refine), or VISION_NEEDED to let the vision agent see the redirected page. Never re-emit the failed URL.

SUBTASK COMPLETION — if the USER GOAL is "navigate to X" / "open X" / "go to X" and the snapshot URL canonical-matches X (you're already there from a prior navigate), emit DONE. Do NOT emit \`browser.navigate X\` when you're at X — that's a no-op (the runtime will auto-DONE it anyway, but recognizing it saves a step). The same rule applies to "click X" / "focus X" / "open X" when X is already focused in the snapshot.

SEARCH / LOCATION FORM — TYPE → CLICK SUGGESTION → CLICK APPLY.
A "(disabled)" ref is UNCLICKABLE — clicking wastes 5s on a Playwright timeout.
When you typed into a search/location/combobox field and the submit button
(Apply / Search / Confirm) is disabled, your NEXT action MUST be
browser.click on a "(suggestion)" ref (or any role: option / menuitem /
listitem / link in the dropdown), NOT the disabled button, NOT pressing enter.

  Snapshot:
    [e86] textbox "Location"
    [e91] option "Marietta, GA, United States" (suggestion)
    [e90] button "Apply" (disabled)
  Last action: browser.type e86 "Marietta, GA"
    Wrong: browser.click e90       ← it's disabled, this hangs for 5s
    Wrong: press enter             ← submit is via the button, not enter
    Right: browser.click e91       ← Apply un-disables on the next snapshot

When in doubt about which option matches the typed text, escalate via VISION_NEEDED.

ESCALATE TO VISION when ANY of these:
  • The snapshot doesn't name the element you'd need (canvas-rendered apps, custom controls).
  • The user's intent involves visual judgment (colors, layout, "does this look right").
  • Your last action ran but the snapshot is unchanged — something silent failed (but if you're still on the welcome page, navigate instead).
  • You'd be guessing about which [eN] to pick. Better to escalate than to click randomly.

When in doubt, escalate. The vision agent is slower but more reliable, and the team can swap back to you on the next step once it unsticks.

FORMAT RULES:
  • One line. No prose, no markdown, no JSON, no quotes around the whole line.
  • DO NOT emit <think>...</think> reasoning blocks — reply with the action ONLY. Reasoning blocks burn the response budget before any visible content emerges, leaving the router with an empty response and forcing fall-through to the slow vision path.
  • Use the simple verb form: \`browser.type e7 "search"\` — NOT \`browser.type({"ref":"e7","text":"search"})\`.
  • Do not chain actions. ONE action per step. Press-enter chaining is fine within type.

Examples (good):
  browser.navigate https://www.facebook.com/marketplace/category/search?query=1997%20toyota%20camry
  browser.click e12
  browser.type e7 "dell se2719hr" and press enter
  browser.scroll page down
  browser.read
  DONE
  VISION_NEEDED no listings element in the snapshot, page may still be loading

Note: Marketplace's "city slug" URL form (/marketplace/<city>/search) is REWRITTEN by the site to /marketplace/category/search/. Don't try the city-slug form — it always redirects. Use /marketplace/category/search and apply the city via the on-page Location filter (a textbox that opens an autocomplete you click into).

Examples (BAD — never emit these):
  Click on e12.                          ← prose
  browser.click({"ref":"e12"})           ← JSON-style
  browser.click e12 then browser.read    ← chained
  VISION_NEEDED I'm on the welcome page  ← navigate instead`;
const SNAPSHOT_LIMIT = 14e3;
function canonicalizeUrl(raw) {
  try {
    const u = new URL(raw);
    const params = [...u.searchParams.entries()].sort(
      ([a], [b]) => a.localeCompare(b)
    );
    const search = params.length ? "?" + params.map(([k, v]) => `${k}=${v}`).join("&") : "";
    const path2 = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.host.toLowerCase()}${path2}${search}`;
  } catch {
    return null;
  }
}
function createOllamaRouter(cfg = {}) {
  const ollama$1 = new ollama.Ollama({
    host: cfg.host ?? process.env.ROUTER_HOST ?? process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434"
  });
  const model = cfg.model ?? process.env.ROUTER_MODEL ?? "qwen3.5:0.8b";
  const timeoutMs = cfg.timeoutMs ?? Number(process.env.ROUTER_TIMEOUT_MS ?? 4e3);
  function parseDecision(raw) {
    let text = raw.replace(/<think>[\s\S]*?<\/think>/g, "");
    const openIdx = text.indexOf("<think>");
    if (openIdx !== -1) text = text.slice(0, openIdx);
    text = text.trim();
    const firstLine = (text.split("\n").find((l) => l.trim()) ?? "").trim();
    if (!firstLine) {
      return { kind: "skip", reason: "router emitted empty response" };
    }
    if (/^DONE\b/i.test(firstLine)) return { kind: "done" };
    if (/^VISION_NEEDED\b/i.test(firstLine)) {
      const reason = firstLine.replace(/^VISION_NEEDED\s*/i, "").trim() || "no reason given";
      return { kind: "vision_needed", reason };
    }
    if (/^browser\./i.test(firstLine)) {
      return { kind: "action", action: firstLine };
    }
    return {
      kind: "vision_needed",
      reason: `router emitted unrecognized line: ${firstLine.slice(0, 100)}`
    };
  }
  return {
    async decide({ task, history, snapshot, snapshotUnchanged, signal }) {
      if (signal?.aborted) {
        return { kind: "skip", reason: "cancelled before router call" };
      }
      const recent = history.slice(-6);
      const historyBlock = recent.length === 0 ? "(none — this is step 1)" : recent.map((h, i) => `${i + 1}. ${h}`).join("\n");
      const ax = snapshot.ax;
      const trimmed = ax.length > SNAPSHOT_LIMIT ? ax.slice(0, SNAPSHOT_LIMIT) + "\n…(truncated — escalate to vision if you need the rest)" : ax;
      const stuckHint = snapshotUnchanged ? "\nIMPORTANT: your previous action did NOT change the page. Either return DONE if the goal is met, or escalate via VISION_NEEDED. Repeating the same action will be blocked." : "";
      let redirectHint = "";
      const lastAction = recent.at(-1) ?? "";
      const navMatch = lastAction.match(/^browser\.navigate\s+(\S+)/i);
      if (navMatch) {
        const requested = canonicalizeUrl(navMatch[1]);
        const actual = canonicalizeUrl(snapshot.url);
        if (requested && actual && requested !== actual) {
          redirectHint = `
IMPORTANT: your previous browser.navigate to "${navMatch[1]}" was REDIRECTED — the site rewrote it to "${snapshot.url}". DO NOT re-emit the same navigate, you will loop. Either work with this redirected page (use its on-page search/filters), or VISION_NEEDED. Never retry the URL the site already rejected.`;
        }
      }
      const userMsg = `USER GOAL: ${task}

Active tab: ${snapshot.title} (${snapshot.url})
Snapshot (interactive elements with [eN] refs):
${trimmed}

Recent action history:
${historyBlock}${stuckHint}${redirectHint}

Decide the SINGLE next action now.`;
      try {
        const ctrl = new AbortController();
        const onExternal = () => ctrl.abort();
        signal?.addEventListener("abort", onExternal, { once: true });
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        let result;
        try {
          result = await ollama$1.chat({
            model,
            messages: [
              { role: "system", content: SYSTEM_PROMPT$1 },
              { role: "user", content: userMsg }
            ],
            // think: false — disable Qwen3 reasoning at the API level.
            // qwen3.5:0.8b emits a 5-9s <think> block on every prompt by
            // default, which was the entire reason the router kept
            // returning "empty response" (the think tokens consumed both
            // the time budget AND the response budget before any visible
            // action emerged). Asking nicely in the system prompt didn't
            // work — the model thinks anyway. Setting think:false at the
            // request level disables it cleanly. Same mechanism Holo3
            // uses via chat_template_kwargs.enable_thinking:false.
            // With reasoning off, the same call returns in ~300-800ms and
            // num_predict:96 is plenty for one short browser.* line.
            think: false,
            // Low temperature: we want decisive verb-picking, not creativity.
            options: { temperature: 0.1, num_predict: 96 }
          });
        } finally {
          clearTimeout(timer);
          signal?.removeEventListener("abort", onExternal);
        }
        return parseDecision(result.message.content ?? "");
      } catch (e) {
        if (signal?.aborted) {
          return { kind: "skip", reason: "router cancelled" };
        }
        return {
          kind: "skip",
          reason: `router error: ${e instanceof Error ? e.message : String(e)}`
        };
      }
    },
    async available() {
      try {
        const list = await ollama$1.list();
        return list.models.some(
          (m) => m.name === model || m.name === `${model}:latest`
        );
      } catch {
        return false;
      }
    }
  };
}
const VERIFIER_SNAPSHOT_LIMIT = 8e3;
const VERIFIER_SNAPSHOT_LIMIT_COMPOSITE = 2e4;
function snapshotLimitFor(provider) {
  return provider.name === "composite" ? VERIFIER_SNAPSHOT_LIMIT_COMPOSITE : VERIFIER_SNAPSHOT_LIMIT;
}
async function verify(provider, args) {
  const snapshotBlock = args.browserSnapshot ? `

Chrome accessibility snapshot (informational):
URL: ${args.browserSnapshot.url}
` + (args.browserSnapshot.ax.length > snapshotLimitFor(provider) ? args.browserSnapshot.ax.slice(0, snapshotLimitFor(provider)) + "\n…(truncated for verifier)" : args.browserSnapshot.ax) : "";
  const urlBlock = args.currentUrl ? `

Current browser URL: ${args.currentUrl.url}
Current browser title: ${args.currentUrl.title}
` : "";
  const withholdScreenshot = args.tabHidden === true && provider.name === "composite";
  const verificationTask = `VERIFICATION CHECK — DO NOT EMIT AN ACTION VERB.

Original goal: ${args.task}
` + (withholdScreenshot ? `
NOTE: no screenshot is attached — the agent's controlled browser tab is not currently visible on the physical screen (an unrelated window covers it), so pixels would be misleading. Judge ENTIRELY from the URL and accessibility snapshot below; they are live and accurate for the controlled tab.
` : args.tabHidden ? `
IMPORTANT: the SCREENSHOT shows a DIFFERENT Chrome tab than the one the agent controls. Judge browser state ONLY from the URL and the accessibility snapshot below — the screenshot pixels are unrelated to the controlled tab and must not count against verification.
` : ``) + `${urlBlock}${snapshotBlock}

The agent has just claimed this goal is achieved. Default answer is RETRY.
Only respond VERIFIED if you can identify a CONCRETE, SPECIFIC signal in the screenshot or browser state that the goal LITERALLY landed. Examples:
  • Goal "search for X" → URL must contain "search" or the page must show a results-list / results-header / "Search results for X" text. URL ending in the home page or "/you" or a category page is NOT verified.
  • Goal "open the listing for Y" → page must show the listing's title, price, or description. A search results page or category index is NOT verified.
  • Goal "compute X" → the calculator's display must show the exact numeric answer. Showing a partial expression or wrong number is NOT verified.
  • Goal "send a message" → the conversation/post must show the sent message appearing as a new entry. Just having the compose box focused is NOT verified.

EQUIVALENCE RULE — system launchers are interchangeable: if the goal
or expected result names one launcher (Spotlight, Raycast, Alfred) and
the screen shows a DIFFERENT one, judge the FUNCTION, not the brand —
any launcher overlay with a search field counts as "the launcher is
open". Same for typed-ahead app names: the app name visible in ANY
launcher's field/results satisfies "typed into Spotlight".

Be SKEPTICAL. If the action LIKELY landed but you can't confirm it from
the screenshot or URL, RETRY is the safer answer — the orchestrator will
re-check; verifying a wrong state is worse than retrying a correct one.

Reply with EXACTLY ONE LINE:
  VERIFIED                       (concrete proof of completion present)
  RETRY: <one-sentence reason>   (no concrete proof, or contradiction)

No other output. No verbs. No prose. Just one of those two shapes.`;
  const t0 = Date.now();
  console.log(
    `[verifier] → ${provider.name}.plan task="${args.task.slice(0, 60)}${args.task.length > 60 ? "..." : ""}"`
  );
  let raw;
  try {
    const out = await provider.plan({
      task: verificationTask,
      history: [],
      // verifier sees no prior actions — it's a fresh judgement
      screenshotB64: withholdScreenshot ? "" : args.screenshotB64,
      screen: args.screen,
      signal: args.signal
    });
    raw = out.action.trim();
  } catch (e) {
    const fallback = args.errorDefault ?? true;
    console.warn(
      `[verifier] ← error (${Date.now() - t0}ms): ${e instanceof Error ? e.message : String(e)} — ${fallback ? "accepting DONE conservatively" : "treating as NOT verified (probe fail-closed)"}`
    );
    return fallback ? { verified: true } : { verified: false, reason: "verifier call errored — no proof of completion" };
  }
  console.log(
    `[verifier] ← (${Date.now() - t0}ms) "${raw.slice(0, 120)}${raw.length > 120 ? "..." : ""}"`
  );
  const trimmed = raw.trim();
  if (/^VERIFIED\b/i.test(trimmed)) {
    return { verified: true };
  }
  const retryMatch = trimmed.match(/^\s*RETRY\s*[:\-]\s*(.+?)\s*$/im);
  if (retryMatch && retryMatch[1]) {
    return { verified: false, reason: retryMatch[1].trim() };
  }
  const ambiguousFallback = args.errorDefault ?? true;
  console.warn(
    `[verifier] ambiguous response, treating as ${ambiguousFallback ? "VERIFIED" : "NOT verified (probe fail-closed)"}: "${trimmed.slice(0, 80)}"`
  );
  return ambiguousFallback ? { verified: true } : { verified: false, reason: "verifier reply was ambiguous — no proof" };
}
function verifierEnabled() {
  return process.env.PONDER_VERIFIER !== "off";
}
async function verifyInfeasible(provider, args) {
  const urlBlock = args.currentUrl ? `

Current browser URL: ${args.currentUrl.url}
Current browser title: ${args.currentUrl.title}
` : "";
  const snapshotBlock = args.browserSnapshot ? `

Chrome accessibility snapshot (informational):
URL: ${args.browserSnapshot.url}
` + (args.browserSnapshot.ax.length > snapshotLimitFor(provider) ? args.browserSnapshot.ax.slice(0, snapshotLimitFor(provider)) + "\n…(truncated for verifier)" : args.browserSnapshot.ax) : "";
  const checkTask = `INFEASIBILITY CHECK — DO NOT EMIT AN ACTION VERB.

Original goal: ${args.task}
The agent claims this is IMPOSSIBLE, reason: "${args.claimedReason}"
${urlBlock}${snapshotBlock}

Default answer is CONTINUE. Only respond IMPOSSIBLE if the screenshot
or browser state shows a CONCRETE, immovable blocker:
  • a permission-denied / "operation not permitted" / read-only or
    locked-file error dialog,
  • an explicit system message that the action cannot be done,
  • a login / paywall the agent has no way past,
  • a missing prerequisite the agent cannot create.

These are NOT impossible (respond CONTINUE):
  • "I can't find the button/element" — that's a grounding miss.
  • the task is long, fiddly, or multi-step.
  • a dialog is in the way that could just be dismissed.
  • the agent simply hasn't tried a working approach yet.

Reply with EXACTLY ONE LINE:
  IMPOSSIBLE: <one-sentence concrete blocker visible now>
  CONTINUE: <one-sentence reason it is still worth trying>

No other output. No verbs. No prose.`;
  const t0 = Date.now();
  console.log(
    `[infeasible-check] → ${provider.name}.plan reason="${args.claimedReason.slice(0, 60)}"`
  );
  let raw;
  try {
    const out = await provider.plan({
      task: checkTask,
      history: [],
      screenshotB64: args.screenshotB64,
      screen: args.screen,
      signal: args.signal
    });
    raw = out.action.trim();
  } catch (e) {
    console.warn(
      `[infeasible-check] ← error (${Date.now() - t0}ms): ${e instanceof Error ? e.message : String(e)} — NOT confirming (keep working)`
    );
    return { confirmed: false };
  }
  console.log(
    `[infeasible-check] ← (${Date.now() - t0}ms) "${raw.slice(0, 120)}${raw.length > 120 ? "..." : ""}"`
  );
  const m = raw.match(/^\s*IMPOSSIBLE\s*[:\-]\s*(.+?)\s*$/im);
  if (m && m[1]) {
    return { confirmed: true, reason: m[1].trim() };
  }
  return { confirmed: false };
}
const execFileAsync = node_util.promisify(node_child_process.execFile);
nutJs.mouse.config.mouseSpeed = 600;
nutJs.mouse.config.autoDelayMs = 50;
const POST_MOVE_HOVER_MS = 180;
let cliclickPath = null;
try {
  const found = node_child_process.execFileSync("/usr/bin/which", ["cliclick"], {
    encoding: "utf-8"
  }).trim();
  if (found) cliclickPath = found;
} catch {
  cliclickPath = null;
}
const BACKGROUND_MODE = cliclickPath !== null;
if (cliclickPath) {
  console.error(
    `[screen] cliclick detected at ${cliclickPath} — BACKGROUND MODE: agent clicks fire at coordinates without moving your cursor.`
  );
} else if (process.platform === "darwin") {
  console.error(
    "[screen] cliclick not found. Agent will move your cursor on each click (foreground mode). Run `brew install cliclick` to switch to background mode where your mouse stays put."
  );
}
async function cliclickRun(...args) {
  if (!cliclickPath) throw new Error("cliclick path not resolved");
  await execFileAsync(cliclickPath, args);
}
async function size() {
  const w = await nutJs.screen.width();
  const h = await nutJs.screen.height();
  return { width: w, height: h };
}
async function getBrowserUrl(processName) {
  if (process.platform !== "darwin") return null;
  if (/["\\\n\r]/.test(processName)) return null;
  const bridgePort = Number(process.env.PONDER_BRIDGE_PORT ?? 7900);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    try {
      const res = await fetch(
        `http://127.0.0.1:${bridgePort}/browser/url`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ processName }),
          signal: ctrl.signal
        }
      );
      if (res.ok) {
        const j = await res.json();
        if ("error" in j) return null;
        const hasUrl = typeof j.url === "string" && j.url.length > 0;
        const hasTitle = typeof j.title === "string" && j.title.length > 0;
        if (hasUrl || hasTitle) {
          return { url: j.url ?? "", title: j.title ?? "" };
        }
      }
    } finally {
      clearTimeout(t);
    }
  } catch {
  }
  return null;
}
async function raiseMacApp(processName) {
  if (process.platform !== "darwin") return false;
  if (/["\\\n\r]/.test(processName)) return false;
  const bridgePort = Number(process.env.PONDER_BRIDGE_PORT ?? 7900);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    try {
      const res = await fetch(
        `http://127.0.0.1:${bridgePort}/window/raise`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ processName }),
          signal: ctrl.signal
        }
      );
      if (res.ok) {
        const j = await res.json();
        return j.ok === true;
      }
    } finally {
      clearTimeout(t);
    }
  } catch {
  }
  try {
    await execFileAsync(
      "/usr/bin/osascript",
      ["-e", `tell application "${processName}" to activate`],
      { timeout: 1500 }
    );
    return true;
  } catch {
    return false;
  }
}
async function getMacWindowBounds(processName) {
  if (process.platform !== "darwin") return null;
  if (/["\\\n\r]/.test(processName)) return null;
  const bridgePort = Number(process.env.PONDER_BRIDGE_PORT ?? 7900);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    try {
      const res = await fetch(
        `http://127.0.0.1:${bridgePort}/window/bounds`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ processName }),
          signal: ctrl.signal
        }
      );
      if (res.ok) {
        const j = await res.json();
        if ("error" in j) {
          if (j.error === "parse_failed" && typeof j.detail === "string") {
            const nums = (j.detail.match(/-?\d+/g) ?? []).map(Number);
            if (nums.length >= 4 && nums.every((n) => Number.isFinite(n)) && nums[2] > 0 && nums[3] > 0) {
              return {
                x: nums[0],
                y: nums[1],
                width: nums[2],
                height: nums[3]
              };
            }
          }
          return null;
        }
        if (typeof j.x === "number" && typeof j.y === "number" && j.width > 0 && j.height > 0) {
          return { x: j.x, y: j.y, width: j.width, height: j.height };
        }
        return null;
      }
    } finally {
      clearTimeout(t);
    }
  } catch {
  }
  const script = `tell application "System Events"
  if not (exists process "${processName}") then return "missing"
  tell process "${processName}"
    if (count of windows) is 0 then return "nowindow"
    set p to position of front window
    set s to size of front window
    return (item 1 of p as integer) & "," & (item 2 of p as integer) & "," & (item 1 of s as integer) & "," & (item 2 of s as integer)
  end tell
end tell`;
  try {
    const { stdout } = await execFileAsync(
      "/usr/bin/osascript",
      ["-e", script],
      { timeout: 2e3 }
    );
    const out = stdout.trim();
    if (out === "missing" || out === "nowindow") return null;
    const nums = (out.match(/-?\d+/g) ?? []).map(Number);
    if (nums.length < 4 || nums.some((n) => !Number.isFinite(n))) {
      return null;
    }
    const [x, y, w, h] = nums;
    if (w <= 0 || h <= 0) return null;
    return { x, y, width: w, height: h };
  } catch {
    return null;
  }
}
let cachedElectron;
function getElectron() {
  if (cachedElectron !== void 0) return cachedElectron;
  try {
    cachedElectron = require("electron");
  } catch {
    cachedElectron = null;
  }
  return cachedElectron;
}
function findDisplayForRect(rect) {
  const e = getElectron();
  if (!e?.screen) return null;
  try {
    const screen = e.screen;
    const match = screen.getDisplayMatching?.(rect);
    return match ?? null;
  } catch {
    return null;
  }
}
let _frontWinCache = null;
const FRONT_WIN_TTL_MS = 1e3;
function getFrontmostWindowDisplay() {
  if (process.platform !== "darwin") return null;
  const e = getElectron();
  if (!e?.screen) return null;
  if (_frontWinCache && Date.now() - _frontWinCache.at < FRONT_WIN_TTL_MS) {
    return _frontWinCache.display;
  }
  try {
    const { execFileSync: execFileSync2 } = require("node:child_process");
    const script = `tell application "System Events"
  set frontApp to name of first application process whose frontmost is true
  tell process frontApp
    if (count of windows) is 0 then return "0,0,0,0"
    set p to position of front window
    set s to size of front window
    return (item 1 of p as integer) & "," & (item 2 of p as integer) & "," & (item 1 of s as integer) & "," & (item 2 of s as integer)
  end tell
end tell`;
    const out = execFileSync2("/usr/bin/osascript", ["-e", script], {
      timeout: 200,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const nums = (out.match(/-?\d+/g) ?? []).map(Number);
    if (nums.length < 4 || nums.some((n) => !Number.isFinite(n))) {
      _frontWinCache = { display: null, at: Date.now() };
      return null;
    }
    const [x, y, width, height] = nums;
    if (width <= 0 || height <= 0) {
      _frontWinCache = { display: null, at: Date.now() };
      return null;
    }
    const display = findDisplayForRect({ x, y, width, height });
    _frontWinCache = { display, at: Date.now() };
    return display;
  } catch {
    _frontWinCache = { display: null, at: Date.now() };
    return null;
  }
}
function getFocusedDisplay() {
  const e = getElectron();
  if (!e?.screen) return null;
  const front = getFrontmostWindowDisplay();
  if (front) return front;
  try {
    const pt = e.screen.getCursorScreenPoint();
    return e.screen.getDisplayNearestPoint(pt);
  } catch {
    return null;
  }
}
async function captureViaDesktopCapturer(d) {
  const e = getElectron();
  if (!e?.desktopCapturer) return null;
  try {
    const sources = await e.desktopCapturer.getSources({
      types: ["screen"],
      // Logical pixels — desktopCapturer scales the native-resolution
      // capture down to this size. Avoids us having to deal with Retina
      // scaleFactor in the click-coord math (cliclick uses logical pixels
      // matching what we display to the LLM).
      thumbnailSize: { width: d.bounds.width, height: d.bounds.height }
    });
    const matching = sources.find(
      (s) => Number(s.display_id) === d.id
    );
    if (!matching) return null;
    const png = matching.thumbnail.toPNG();
    const pngWidth = png.readUInt32BE(16);
    const pngHeight = png.readUInt32BE(20);
    const scaleX = pngWidth / d.bounds.width;
    const scaleY = pngHeight / d.bounds.height;
    const scaleFactor = (scaleX + scaleY) / 2;
    return {
      png,
      width: d.bounds.width,
      height: d.bounds.height,
      offsetX: d.bounds.x,
      offsetY: d.bounds.y,
      scaleFactor
    };
  } catch (e2) {
    console.warn(
      `[screen] desktopCapturer failed (${e2 instanceof Error ? e2.message : String(e2)}) — falling back to nut-js primary`
    );
    return null;
  }
}
let _mainDisplayLogical = null;
async function mainDisplayLogicalSize(pngW, pngH) {
  if (_mainDisplayLogical && Date.now() - _mainDisplayLogical.at < 1e4) {
    return { w: _mainDisplayLogical.w, h: _mainDisplayLogical.h };
  }
  try {
    const snap = await winlistSnapshot();
    const main = snap?.displays.find((d) => d.x === 0 && d.y === 0);
    if (main && main.width > 0 && main.height > 0) {
      _mainDisplayLogical = { w: main.width, h: main.height, at: Date.now() };
      return { w: main.width, h: main.height };
    }
  } catch {
  }
  try {
    const { width, height } = await size();
    _mainDisplayLogical = { w: width, h: height, at: Date.now() };
    return { w: width, h: height };
  } catch {
    return { w: Math.round(pngW / 2), h: Math.round(pngH / 2) };
  }
}
async function screenshot() {
  const focused = getFocusedDisplay();
  if (focused && (focused.bounds.x !== 0 || focused.bounds.y !== 0)) {
    const shot = await captureViaDesktopCapturer(focused);
    if (shot) {
      return shot;
    }
  }
  if (process.platform === "darwin") {
    try {
      const os2 = await import("node:os");
      const path2 = await import("node:path");
      const fsp2 = await import("node:fs/promises");
      const tmp = path2.join(
        os2.tmpdir(),
        `ponder-frame-${process.pid}-${Date.now()}.png`
      );
      try {
        await execFileAsync("/usr/sbin/screencapture", ["-x", tmp], {
          timeout: 1e4
        });
        const png2 = await fsp2.readFile(tmp);
        if (png2.length >= 24 && png2.readUInt32BE(0) === 2303741511) {
          const pngW = png2.readUInt32BE(16);
          const pngH = png2.readUInt32BE(20);
          const { w, h } = await mainDisplayLogicalSize(pngW, pngH);
          const scaleFactor2 = (pngW / w + pngH / h) / 2;
          return {
            png: png2,
            width: w,
            height: h,
            offsetX: 0,
            offsetY: 0,
            scaleFactor: scaleFactor2
          };
        }
      } finally {
        await fsp2.unlink(tmp).catch(() => {
        });
      }
    } catch (e) {
      console.error(
        `[screen] screencapture-first failed (${e instanceof Error ? e.message.split("\n")[0] : String(e)}) — falling back to nut-js capture (in-process, crash-prone).`
      );
    }
  }
  const { width, height } = await size();
  const region = new nutJs.Region(0, 0, width, height);
  const img = await nutJs.screen.grabRegion(region);
  const png = await imageToPng(img);
  let scaleFactor = 1;
  if (png.length >= 24 && png.readUInt32BE(0) === 2303741511) {
    const pngWidth = png.readUInt32BE(16);
    const pngHeight = png.readUInt32BE(20);
    scaleFactor = (pngWidth / width + pngHeight / height) / 2;
  }
  return { png, width, height, offsetX: 0, offsetY: 0, scaleFactor };
}
async function imageToPng(img) {
  const src = img;
  let rgbImg;
  try {
    rgbImg = src.toRGB ? await src.toRGB() : src;
  } catch {
    rgbImg = src;
  }
  const buf = Buffer.isBuffer(rgbImg.data) ? rgbImg.data : Buffer.from(rgbImg.data);
  const usedToRGB = src.toRGB != null && rgbImg !== src;
  const rgb = usedToRGB ? ensureRgb24(buf, rgbImg.width, rgbImg.height, rgbImg.channels) : bgrToRgb(buf, rgbImg.width, rgbImg.height, rgbImg.channels);
  return encodePng(rgbImg.width, rgbImg.height, rgb);
}
function ensureRgb24(buf, w, h, channels) {
  const stride = channels ?? (buf.length === w * h * 4 ? 4 : 3);
  if (stride === 3 && buf.length === w * h * 3) return buf;
  const out = Buffer.alloc(w * h * 3);
  for (let i = 0, o = 0; i < buf.length && o < out.length; i += stride, o += 3) {
    out[o] = buf[i];
    out[o + 1] = buf[i + 1];
    out[o + 2] = buf[i + 2];
  }
  return out;
}
function bgrToRgb(buf, w, h, channels) {
  const stride = channels ?? (buf.length === w * h * 4 ? 4 : 3);
  const out = Buffer.alloc(w * h * 3);
  for (let i = 0, o = 0; i < buf.length && o < out.length; i += stride, o += 3) {
    out[o] = buf[i + 2];
    out[o + 1] = buf[i + 1];
    out[o + 2] = buf[i];
  }
  return out;
}
function encodePng(width, height, rgb) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = width * 3;
  const filtered = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    filtered[y * (stride + 1)] = 0;
    filtered.set(rgb.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }
  const idatData = node_zlib.deflateSync(filtered);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idatData),
    chunk("IEND", Buffer.alloc(0))
  ]);
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const c = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(c, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 4294967295;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ c >>> 8;
  return (c ^ 4294967295) >>> 0;
}
async function hover(x, y) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (cliclickPath) {
    await cliclickRun(`m:${ix},${iy}`);
    return;
  }
  await nutJs.mouse.move(nutJs.straightTo(new nutJs.Point(ix, iy)));
}
async function click(x, y, opts = {}) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (cliclickPath) {
    const dwell = Math.max(
      0,
      Number(process.env.PONDER_CLICK_DWELL_MS ?? 200)
    );
    const pre = dwell > 0 ? [`m:${ix},${iy}`, `w:${dwell}`] : [];
    if (opts.modifiers && opts.modifiers.length > 0) {
      const mods = opts.modifiers.join(",");
      const cmd2 = opts.button === "right" ? "rc" : opts.double ? "dc" : "c";
      await cliclickRun(...pre, `kd:${mods}`, `${cmd2}:${ix},${iy}`, `ku:${mods}`);
      return;
    }
    if (opts.triple) {
      await cliclickRun(
        ...pre,
        `c:${ix},${iy}`,
        `c:${ix},${iy}`,
        `c:${ix},${iy}`
      );
      return;
    }
    const cmd = opts.button === "right" ? "rc" : opts.double ? "dc" : "c";
    await cliclickRun(...pre, `${cmd}:${ix},${iy}`);
    return;
  }
  await nutJs.mouse.move(nutJs.straightTo(new nutJs.Point(ix, iy)));
  await sleep$4(POST_MOVE_HOVER_MS);
  const NUT_MOD = {
    cmd: nutJs.Key.LeftCmd,
    shift: nutJs.Key.LeftShift,
    alt: nutJs.Key.LeftAlt,
    ctrl: nutJs.Key.LeftControl
  };
  const heldMods = (opts.modifiers ?? []).map((m) => NUT_MOD[m]).filter((k) => k !== void 0);
  for (const k of heldMods) await nutJs.keyboard.pressKey(k);
  try {
    if (heldMods.length > 0) {
      if (opts.button === "right") await nutJs.mouse.rightClick();
      else if (opts.double) await nutJs.mouse.doubleClick(nutJs.Button.LEFT);
      else await nutJs.mouse.leftClick();
      return;
    }
  } finally {
    for (const k of heldMods.reverse()) await nutJs.keyboard.releaseKey(k);
  }
  if (opts.triple) {
    await nutJs.mouse.leftClick();
    await sleep$4(40);
    await nutJs.mouse.leftClick();
    await sleep$4(40);
    await nutJs.mouse.leftClick();
    return;
  }
  const btn = opts.button === "right" ? nutJs.Button.RIGHT : nutJs.Button.LEFT;
  if (opts.double) await nutJs.mouse.doubleClick(btn);
  else await nutJs.mouse.leftClick();
}
async function drag(srcX, srcY, dstX, dstY) {
  const sx = Math.round(srcX);
  const sy = Math.round(srcY);
  const dx = Math.round(dstX);
  const dy = Math.round(dstY);
  if (cliclickPath) {
    await cliclickRun(`dd:${sx},${sy}`, `m:${dx},${dy}`, `du:${dx},${dy}`);
    return;
  }
  await nutJs.mouse.drag([new nutJs.Point(sx, sy), new nutJs.Point(dx, dy)]);
}
function sleep$4(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function typeText(text) {
  await nutJs.keyboard.type(text);
}
async function pressCombo(combo) {
  const parts = combo.toLowerCase().split(/\s*\+\s*/).map(mapKey$1).filter((k) => k !== null);
  if (parts.length === 0) return;
  if (parts.length === 1) {
    await nutJs.keyboard.type(parts[0]);
    return;
  }
  await nutJs.keyboard.pressKey(...parts);
  await nutJs.keyboard.releaseKey(...parts);
}
async function scroll(amount, opts = {}) {
  if (amount === 0) return;
  if (opts.recenter !== false) {
    try {
      const { width, height } = await size();
      const tx = Math.round(width * 0.66);
      const ty = Math.round(height * 0.5);
      if (cliclickPath) {
        await cliclickRun(`m:${tx},${ty}`);
      } else {
        await nutJs.mouse.move(nutJs.straightTo(new nutJs.Point(tx, ty)));
      }
    } catch (e) {
      console.warn(
        `[screen] scroll recenter failed (${e instanceof Error ? e.message : String(e)}) — scrolling at current cursor`
      );
    }
  }
  if (amount > 0) await nutJs.mouse.scrollUp(amount);
  else await nutJs.mouse.scrollDown(-amount);
}
function mapKey$1(name) {
  const n = name.trim();
  const direct = {
    cmd: nutJs.Key.LeftSuper,
    command: nutJs.Key.LeftSuper,
    win: nutJs.Key.LeftSuper,
    super: nutJs.Key.LeftSuper,
    ctrl: nutJs.Key.LeftControl,
    control: nutJs.Key.LeftControl,
    alt: nutJs.Key.LeftAlt,
    option: nutJs.Key.LeftAlt,
    shift: nutJs.Key.LeftShift,
    enter: nutJs.Key.Enter,
    return: nutJs.Key.Return,
    tab: nutJs.Key.Tab,
    space: nutJs.Key.Space,
    esc: nutJs.Key.Escape,
    escape: nutJs.Key.Escape,
    backspace: nutJs.Key.Backspace,
    delete: nutJs.Key.Delete,
    up: nutJs.Key.Up,
    down: nutJs.Key.Down,
    left: nutJs.Key.Left,
    right: nutJs.Key.Right,
    home: nutJs.Key.Home,
    end: nutJs.Key.End
  };
  if (direct[n]) return direct[n];
  if (n.length === 1) {
    const upper = n.toUpperCase();
    const k = nutJs.Key[upper];
    if (k != null) return k;
  }
  return null;
}
const WINLIST_SWIFT = `import CoreGraphics
import Foundation
var windows: [[String: Any]] = []
let opts: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
if let list = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] {
  for w in list {
    guard let b = w[kCGWindowBounds as String] as? [String: Any] else { continue }
    windows.append([
      "id": w[kCGWindowNumber as String] as? Int ?? 0,
      "owner": w[kCGWindowOwnerName as String] as? String ?? "",
      "name": w[kCGWindowName as String] as? String ?? "",
      "layer": w[kCGWindowLayer as String] as? Int ?? -1,
      "x": b["X"] as? Double ?? 0,
      "y": b["Y"] as? Double ?? 0,
      "w": b["Width"] as? Double ?? 0,
      "h": b["Height"] as? Double ?? 0,
    ])
  }
}
// Display bounds — lets the caller refuse partially off-screen windows
// (screencapture -l happily returns the full backing store, including
// pixels the user cannot see or click).
var displays: [[String: Any]] = []
var ids = [CGDirectDisplayID](repeating: 0, count: 16)
var count: UInt32 = 0
if CGGetActiveDisplayList(16, &ids, &count) == .success {
  for i in 0..<Int(count) {
    let b = CGDisplayBounds(ids[i])
    displays.append([
      "x": b.origin.x, "y": b.origin.y,
      "w": b.size.width, "h": b.size.height,
    ])
  }
}
let data = try JSONSerialization.data(withJSONObject: ["windows": windows, "displays": displays])
print(String(data: data, encoding: .utf8)!)
`;
let winlistBinPromise;
async function ensureWinlistBinary() {
  if (winlistBinPromise) return winlistBinPromise;
  winlistBinPromise = (async () => {
    const os2 = await import("node:os");
    const path2 = await import("node:path");
    const fsp2 = await import("node:fs/promises");
    const { createHash } = await import("node:crypto");
    try {
      const dir = path2.join(os2.homedir(), ".ponder", "bin");
      await fsp2.mkdir(dir, { recursive: true });
      const bin = path2.join(dir, "ponder-winlist");
      const hash = createHash("sha256").update(WINLIST_SWIFT).digest("hex").slice(0, 12);
      const stamp = path2.join(dir, `.ponder-winlist.${hash}`);
      const haveStamp = await fsp2.access(stamp).then(() => true).catch(() => false);
      const haveBin = await fsp2.access(bin).then(() => true).catch(() => false);
      if (!haveStamp || !haveBin) {
        const src = path2.join(dir, "ponder-winlist.swift");
        await fsp2.writeFile(src, WINLIST_SWIFT);
        console.error(
          "[screen] compiling window-list helper (one-time, ~5-15s): swiftc → ~/.ponder/bin/ponder-winlist"
        );
        await execFileAsync("/usr/bin/swiftc", ["-O", src, "-o", bin], {
          timeout: 12e4
        });
        for (const f of await fsp2.readdir(dir)) {
          if (f.startsWith(".ponder-winlist.") && f !== path2.basename(stamp)) {
            await fsp2.unlink(path2.join(dir, f)).catch(() => {
            });
          }
        }
        await fsp2.writeFile(stamp, "");
      }
      return bin;
    } catch (e) {
      console.error(
        `[screen] window-list helper unavailable (${e instanceof Error ? e.message.split("\n")[0] : String(e)}) — direct window capture disabled, falling back to screen-crop.`
      );
      return null;
    }
  })();
  return winlistBinPromise;
}
async function winlistSnapshot() {
  if (process.platform !== "darwin") return null;
  const bin = await ensureWinlistBinary();
  if (!bin) return null;
  try {
    const { stdout } = await execFileAsync(bin, [], { timeout: 3e3 });
    const parsed = JSON.parse(stdout);
    return {
      windows: (parsed.windows ?? []).map((w) => ({
        id: Number(w.id ?? 0),
        owner: String(w.owner ?? ""),
        name: String(w.name ?? ""),
        layer: Number(w.layer ?? -1),
        x: Number(w.x ?? 0),
        y: Number(w.y ?? 0),
        width: Number(w.w ?? 0),
        height: Number(w.h ?? 0)
      })),
      displays: (parsed.displays ?? []).map((d) => ({
        x: Number(d.x ?? 0),
        y: Number(d.y ?? 0),
        width: Number(d.w ?? 0),
        height: Number(d.h ?? 0)
      }))
    };
  } catch (e) {
    console.error(
      `[screen] winlistSnapshot failed (${e instanceof Error ? e.message.split("\n")[0] : String(e)})`
    );
    return null;
  }
}
async function listMacWindows() {
  const snap = await winlistSnapshot();
  return snap ? snap.windows : null;
}
async function captureWindowDirect(targetApp) {
  if (process.platform !== "darwin") return null;
  const snap = await winlistSnapshot();
  if (!snap) return null;
  const wins = snap.windows;
  const target = wins.find(
    (w) => w.layer === 0 && w.owner === targetApp && w.width >= 40 && w.height >= 40
  );
  if (!target) return null;
  if (snap.displays.length > 0) {
    const onSomeDisplay = (px, py) => snap.displays.some(
      (d) => px >= d.x - 2 && px <= d.x + d.width + 2 && py >= d.y - 2 && py <= d.y + d.height + 2
    );
    const fullyOnScreen = onSomeDisplay(target.x, target.y) && onSomeDisplay(target.x + target.width, target.y) && onSomeDisplay(target.x, target.y + target.height) && onSomeDisplay(target.x + target.width, target.y + target.height);
    if (!fullyOnScreen) {
      console.error(
        `[screen] captureWindowDirect("${targetApp}") skipped: window ${Math.round(target.width)}×${Math.round(target.height)}@(${Math.round(target.x)},${Math.round(target.y)}) is partially off-screen — falling back to screen-crop.`
      );
      return null;
    }
  }
  const idx = wins.indexOf(target);
  const area = target.width * target.height;
  const occluders = wins.slice(0, idx).filter((w) => {
    if (w.owner === targetApp || w.layer >= 20) return false;
    const ix = Math.max(
      0,
      Math.min(w.x + w.width, target.x + target.width) - Math.max(w.x, target.x)
    );
    const iy = Math.max(
      0,
      Math.min(w.y + w.height, target.y + target.height) - Math.max(w.y, target.y)
    );
    return ix * iy >= area * 0.04;
  }).map(
    (w) => `${w.owner}${w.name ? ` "${w.name}"` : ""} (layer ${w.layer}, ${Math.round(w.width)}×${Math.round(w.height)})`
  );
  const os2 = await import("node:os");
  const path2 = await import("node:path");
  const fsp2 = await import("node:fs/promises");
  const tmp = path2.join(
    os2.tmpdir(),
    `ponder-windowshot-${process.pid}-${Date.now()}.png`
  );
  try {
    await execFileAsync(
      "/usr/sbin/screencapture",
      ["-x", "-o", "-l", String(target.id), tmp],
      { timeout: 1e4 }
    );
    const png = await fsp2.readFile(tmp);
    if (png.length < 24 || png.readUInt32BE(0) !== 2303741511) return null;
    const pngW = png.readUInt32BE(16);
    const pngH = png.readUInt32BE(20);
    const scaleFactor = (pngW / target.width + pngH / target.height) / 2;
    return {
      png,
      width: Math.round(target.width),
      height: Math.round(target.height),
      offsetX: Math.round(target.x),
      offsetY: Math.round(target.y),
      scaleFactor,
      windowId: target.id,
      occluders
    };
  } catch (e) {
    console.error(
      `[screen] captureWindowDirect("${targetApp}") failed (${e instanceof Error ? e.message.split("\n")[0] : String(e)})`
    );
    return null;
  } finally {
    await (await import("node:fs/promises")).unlink(tmp).catch(() => {
    });
  }
}
async function clickObstruction(targetApp, x, y) {
  const wins = await listMacWindows();
  if (!wins) return null;
  let coveredBy = null;
  for (const w of wins) {
    if (w.layer >= 20) continue;
    if (x >= w.x && x <= w.x + w.width && y >= w.y && y <= w.y + w.height) {
      coveredBy = w.owner === targetApp ? null : w.owner;
      break;
    }
  }
  const front = wins.find((w) => w.layer === 0);
  return { coveredBy, activeApp: front ? front.owner : null };
}
const MAX_STEPS_PER_SUBTASK = Number(
  process.env.HOLO3_MAX_STEPS_SUBTASK ?? 20
);
const MAX_STEPS_TOTAL = Number(process.env.HOLO3_MAX_STEPS_TOTAL ?? 90);
const MAX_STEPS = Number(process.env.HOLO3_MAX_STEPS ?? 50);
const STEP_PAUSE_MS_DEFAULT = Number(
  process.env.PONDER_STEP_PAUSE_MS ?? 400
);
const STEP_PAUSE_MS_HCOMPANY = 6500;
const PREFETCH_SETTLE_MS = 250;
const POST_TYPE_SETTLE_MS = 1400;
const SPOTLIGHT_LAUNCH_SETTLE_MS = Number(
  process.env.HOLO3_SPOTLIGHT_LAUNCH_SETTLE_MS ?? 2500
);
const COMPLETION_PROBE_ENABLED = process.env.PONDER_COMPLETION_PROBE !== "off";
const COMPLETION_PROBE_EVERY = Math.max(
  2,
  Number(process.env.PONDER_COMPLETION_PROBE_EVERY ?? 4)
);
const COMPLETION_PROBE_MIN_STEP = Math.max(
  2,
  Number(process.env.PONDER_COMPLETION_PROBE_MIN ?? 4)
);
function hashScreen(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
}
async function maybeCropToTargetApp(shot, targetApp) {
  if (!targetApp || process.platform !== "darwin") return shot;
  const tRaise = Date.now();
  const raised = await raiseMacApp(targetApp);
  if (raised) {
    await sleep$4(60);
  }
  try {
    const tDirect = Date.now();
    const direct = await captureWindowDirect(targetApp);
    const directEnvFloor = Number(process.env.PONDER_MIN_CROP_DIM_PX);
    const directFloor = Number.isFinite(directEnvFloor) && directEnvFloor > 0 ? directEnvFloor : direct && direct.scaleFactor > 1 ? 80 : 300;
    if (direct && Math.min(direct.width, direct.height) < directFloor) {
      console.log(
        `[loop] 🪟 window-direct capture skipped: ${targetApp} window ${direct.width}×${direct.height} below ${directFloor}px min-dim — falling back.`
      );
    } else if (direct) {
      if (direct.occluders.length > 0) {
        console.log(
          `[loop] ⚠️ ${targetApp}'s window is OVERLAPPED by: ${direct.occluders.join("; ")}. Grounding uses the window's own pixels (correct), but clicks land on whatever is on top — if clicks misfire, move/close the overlapping window.`
        );
      }
      console.log(
        `[loop] 🪟 window-direct capture of ${targetApp} (${direct.width}×${direct.height} logical @ ${direct.offsetX},${direct.offsetY}; scaleFactor=${direct.scaleFactor}, native ${Math.round(direct.width * direct.scaleFactor)}×${Math.round(direct.height * direct.scaleFactor)}px, windowId=${direct.windowId}): raise=${tDirect - tRaise}ms, capture=${Date.now() - tDirect}ms, ${direct.png.length} bytes` + (direct.occluders.length > 0 ? ` — ⚠️ occluded` : "")
      );
      return direct;
    }
  } catch (e) {
    console.log(
      `[loop] 🪟 window-direct capture failed (${e instanceof Error ? e.message : String(e)}) — falling back to screen-crop path.`
    );
  }
  if (raised) {
    try {
      shot = await screenshot();
      console.log(
        `[loop] 🪟 raised ${targetApp} to front and re-captured ${shot.width}×${shot.height} in ${Date.now() - tRaise}ms (overrides the pre-raise shot which would have cropped the occluder's pixels at the target's coords).`
      );
    } catch (e) {
      console.log(
        `[loop] 🪟 raise OK but recapture failed (${e instanceof Error ? e.message : String(e)}) — proceeding with original (possibly occluded) shot.`
      );
    }
  } else {
    console.log(
      `[loop] 🪟 raise failed for "${targetApp}" — proceeding without Z-order swap (target may still be occluded; crop may capture wrong pixels).`
    );
  }
  const tBounds = Date.now();
  const bounds = await getMacWindowBounds(targetApp);
  if (!bounds) {
    console.log(
      `[loop] 🪟 crop skipped: getMacWindowBounds("${targetApp}") returned null in ${Date.now() - tBounds}ms — running uncropped this step.`
    );
    return shot;
  }
  let sf = shot.scaleFactor || 1;
  const envFloor = Number(process.env.PONDER_MIN_CROP_DIM_PX);
  const MIN_CROP_DIM_PX = Number.isFinite(envFloor) && envFloor > 0 ? envFloor : sf > 1 ? 80 : 300;
  if (Math.min(bounds.width, bounds.height) < MIN_CROP_DIM_PX) {
    console.log(
      `[loop] 🪟 crop skipped: ${targetApp} window ${bounds.width}×${bounds.height} below ${MIN_CROP_DIM_PX}px min-dim (scaleFactor=${sf}) — running uncropped.`
    );
    return shot;
  }
  let cropX = bounds.x - shot.offsetX;
  let cropY = bounds.y - shot.offsetY;
  const fitsInCurrentShot = cropX >= 0 && cropY >= 0 && cropX + bounds.width <= shot.width && cropY + bounds.height <= shot.height;
  if (!fitsInCurrentShot) {
    const tRecapture = Date.now();
    const targetDisplay = findDisplayForRect({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    });
    if (targetDisplay && (targetDisplay.bounds.x !== shot.offsetX || targetDisplay.bounds.y !== shot.offsetY)) {
      const newShot = await captureViaDesktopCapturer(targetDisplay);
      if (newShot) {
        console.log(
          `[loop] 🪟 multi-monitor recapture: target on display @(${targetDisplay.bounds.x},${targetDisplay.bounds.y}) ${targetDisplay.bounds.width}×${targetDisplay.bounds.height}, captured frame was @(${shot.offsetX},${shot.offsetY}) ${shot.width}×${shot.height} — re-captured in ${Date.now() - tRecapture}ms.`
        );
        shot = newShot;
        sf = shot.scaleFactor || 1;
        cropX = bounds.x - shot.offsetX;
        cropY = bounds.y - shot.offsetY;
      } else {
        console.log(
          `[loop] 🪟 crop skipped: multi-monitor recapture failed (desktopCapturer returned null) — running uncropped this step.`
        );
        return shot;
      }
    } else {
      console.log(
        `[loop] 🪟 crop skipped: window rect ${bounds.width}×${bounds.height}@(${cropX},${cropY}) doesn't fit inside captured frame ${shot.width}×${shot.height} (window may be partially off-screen, or the target display isn't capturable).`
      );
      return shot;
    }
  }
  if (cropX < 0 || cropY < 0 || cropX + bounds.width > shot.width || cropY + bounds.height > shot.height) {
    console.log(
      `[loop] 🪟 crop skipped after recapture: window rect ${bounds.width}×${bounds.height}@(${cropX},${cropY}) still doesn't fit ${shot.width}×${shot.height}.`
    );
    return shot;
  }
  const tCrop = Date.now();
  try {
    const croppedPng = await cropAndScalePng(
      shot.png,
      {
        x: cropX * sf,
        y: cropY * sf,
        w: bounds.width * sf,
        h: bounds.height * sf
      },
      1
    );
    console.log(
      `[loop] 🪟 cropped to ${targetApp} (${bounds.width}×${bounds.height} logical @ ${cropX},${cropY}; scaleFactor=${sf}, native ${Math.round(bounds.width * sf)}×${Math.round(bounds.height * sf)}px): bounds=${Date.now() - tBounds}ms, crop=${Date.now() - tCrop}ms, ${shot.png.length}→${croppedPng.length} bytes (~${Math.round(shot.width * shot.height / (bounds.width * bounds.height) * 10) / 10}× fewer pixels)`
    );
    return {
      png: croppedPng,
      width: bounds.width,
      height: bounds.height,
      // Add the crop offset to the existing display offset so the
      // click-translation site (`r.x + shot.offsetX`) still resolves
      // into screen-space coords. Caller doesn't have to know about
      // cropping — it's transparent to the rest of the loop.
      offsetX: shot.offsetX + cropX,
      offsetY: shot.offsetY + cropY,
      // Cropped PNG keeps the original scale factor — its physical
      // dimensions are bounds.width*sf × bounds.height*sf.
      scaleFactor: sf
    };
  } catch (e) {
    console.log(
      `[loop] 🪟 crop failed: ${e instanceof Error ? e.message : String(e)} — using uncropped`
    );
    return shot;
  }
}
function normalizeAction(a) {
  return a.trim().toLowerCase().replace(/[.?!]+$/, "").replace(/\s+/g, " ");
}
const NATIVE_APP_PATTERNS = [
  // Calculator: the failing example. Anchor on the word so "calculate"
  // (the verb) doesn't false-positive — only matches "calculator".
  { name: "Calculator", re: /\bcalculator\b/i },
  // Finder: very strong signal. "in Finder", "the Finder window".
  { name: "Finder", re: /\bfinder\b/i },
  // Calendar.app — the macOS native one. "calendar app", "in Calendar"
  // (capitalized), or "macOS Calendar".
  { name: "Calendar", re: /\bcalendar app\b|\bin Calendar\b|\bmacos calendar\b/i },
  // Native apps with disambiguating words.
  { name: "Notes", re: /\bnotes app\b|\bin Notes\b/i },
  { name: "Preview", re: /\bpreview app\b|\bin Preview\b/i },
  { name: "Reminders", re: /\breminders app\b|\bin Reminders\b/i },
  // Settings UIs (macOS calls it "System Settings" since Ventura).
  {
    name: "System Settings",
    re: /\bsystem settings\b|\bsystem preferences\b/i
  },
  { name: "Terminal", re: /\bterminal app\b|\bin Terminal\b/i },
  // Browsers: matches when the task explicitly names the app. We
  // require the word "Chrome" / "Safari" / "Firefox" as a noun (so
  // generic verbs like "browse" don't false-positive). Validated
  // on the May-11 FB Marketplace bench: cropping Chrome's 1053×893
  // window vs the full 1512×982 screen dropped per-step latency
  // from 32s → 6s (~5×) AND removed adjacent-window distractors
  // (Cursor IDE chat to the right of Chrome) that had been pulling
  // the model's grounding off-target.
  { name: "Google Chrome", re: /\bchrome\b|\bgoogle chrome\b/i },
  { name: "Safari", re: /\bsafari\b/i },
  { name: "Firefox", re: /\bfirefox\b/i }
];
function inferTargetApp(task) {
  for (const { name, re } of NATIVE_APP_PATTERNS) {
    if (re.test(task)) return name;
  }
  return null;
}
async function runTask(opts) {
  const { events } = opts;
  let task = opts.task;
  if (opts.provider.name === "composite" && (opts.router || !opts.flat)) {
    const wasHierarchical = !opts.flat;
    console.log(
      `[loop] 🧠 composite mode: hosted planner active — bypassing local router and hierarchical planner${wasHierarchical ? " (decompose enabled for this multi-step task)" : ""}`
    );
    opts = {
      ...opts,
      router: null,
      flat: true,
      decompose: opts.decompose ?? wasHierarchical
    };
  }
  const inferredApp = opts.targetApp === void 0 || opts.targetApp === null ? inferTargetApp(task) : null;
  if (inferredApp) {
    console.log(
      `[loop] 🪟 inferred targetApp="${inferredApp}" from task text → enabling crop${opts.flat ? "" : " and forcing flat mode (skips the hierarchical planner that would otherwise decompose into wrong subtasks)"}`
    );
    const framedTask = `[You are looking at a cropped screenshot showing ONLY ${inferredApp}.app's window — the app is open and frontmost. The image you see IS the app's UI. Click the labeled buttons you see in the image. DO NOT click any 'app icon' — there are no icons in this view, just the app's own buttons/controls.]

` + task;
    opts = {
      ...opts,
      task: framedTask,
      targetApp: inferredApp,
      flat: true
    };
    task = framedTask;
  }
  if (opts.flat) {
    const flatBudget = opts.maxSteps ?? MAX_STEPS;
    const decomposeAllowed = decomposeEnabled() || opts.provider.name === "composite" && (process.env.PONDER_DECOMPOSE ?? "").toLowerCase() !== "off";
    if (opts.decompose && decomposeAllowed) {
      let firstShot = null;
      try {
        firstShot = await maybeCropToTargetApp(
          await screenshot(),
          opts.targetApp
        );
      } catch (e) {
        console.log(
          `[loop] 📋 decompose: first screenshot failed (${e instanceof Error ? e.message : String(e)}) — running flat`
        );
      }
      if (firstShot) {
        const probeBrowserCtx = async () => {
          if (!opts.browser) return { connected: false, url: null };
          try {
            if (!await opts.browser.available())
              return { connected: false, url: null };
            const snap = await opts.browser.snapshot();
            return { connected: true, url: snap.url };
          } catch {
            return { connected: false, url: null };
          }
        };
        const browserCtx = await probeBrowserCtx();
        const decomposeCtrl = new AbortController();
        const cancelPoll = opts.shouldCancel ? setInterval(() => {
          if (opts.shouldCancel()) decomposeCtrl.abort();
        }, 150) : null;
        let plan2;
        try {
          plan2 = await decompose(
            task,
            firstShot.png.toString("base64"),
            [firstShot.width, firstShot.height],
            opts.provider,
            decomposeCtrl.signal,
            browserCtx
          );
        } finally {
          if (cancelPoll) clearInterval(cancelPoll);
        }
        if (opts.shouldCancel?.()) return "cancelled";
        if (!plan2.oneShot) {
          console.log(
            `[loop] 📋 decomposed into ${plan2.steps.length} steps:
` + plan2.steps.map((s, i) => `   ${i + 1}. ${s}`).join("\n")
          );
          await events.onStatus(
            `Plan: ${plan2.steps.map((s, i) => `${i + 1}) ${s}`).join("  ")}`
          );
          const perStepBudget = Math.max(
            2,
            Number(process.env.PONDER_DECOMPOSE_STEP_MAXSTEPS ?? 8)
          );
          let totalSteps2 = 0;
          let planRevised = false;
          const failureEvidence = [];
          for (let i = 0; i < plan2.steps.length; i++) {
            if (opts.shouldCancel?.()) return "cancelled";
            if (totalSteps2 >= MAX_STEPS_TOTAL) {
              console.log(
                `[loop] 📋 decompose: total step budget ${MAX_STEPS_TOTAL} exhausted at item ${i + 1}/${plan2.steps.length}`
              );
              return "exhausted";
            }
            await events.onStatus(
              `Step ${i + 1}/${plan2.steps.length}: ${plan2.steps[i]}`
            );
            let outcome = "exhausted";
            for (let attempt = 0; attempt < 2; attempt++) {
              outcome = await runOneSubtask({
                ...opts,
                // Make the assigned step UNMISSABLE. Live failure mode:
                // with task = the bare step text + "(this is part of:
                // <goal>)", the brain chased the overall goal and
                // free-ran the whole sequence inside step 1's budget.
                // The brain must do exactly ONE thing here — the
                // verify-to-advance gate handles sequencing.
                task: `CURRENT STEP (${i + 1} of ${plan2.steps.length}): ${plan2.steps[i]}
` + (plan2.expects[i] ? `EXPECTED RESULT when this step is done: ${plan2.expects[i]}
` : "") + `Do ONLY this single step, then emit DONE. Do NOT continue to later steps — each step is verified before advancing` + (plan2.expects[i] ? ` against the EXPECTED RESULT above. If the screen contradicts it (a wrong value, a stray entry), FIX that first (e.g. clear and re-enter) before re-attempting the step.` : `.`),
                // Atomic steps finish in 1-2 actions — probe early and
                // often so a completed step advances instead of burning
                // its whole budget re-doing itself.
                completionProbe: { minStep: 2, every: 2 },
                overallGoal: opts.overallGoal ?? opts.task,
                // Clamp to the remaining global budget so the LAST item
                // can't blow past MAX_STEPS_TOTAL mid-subtask.
                maxSteps: Math.max(
                  1,
                  Math.min(perStepBudget, MAX_STEPS_TOTAL - totalSteps2)
                ),
                onStep: () => {
                  totalSteps2++;
                },
                onHistory: (line) => {
                  if (/\[note: (failed|BANNED|skipped)/i.test(line)) {
                    failureEvidence.push(line.slice(0, 200));
                    if (failureEvidence.length > 6) failureEvidence.shift();
                  }
                  opts.onHistory?.(line);
                }
              });
              if (outcome !== "exhausted") break;
              console.log(
                `[loop] 📋 decompose: step ${i + 1} exhausted (attempt ${attempt + 1}/2)`
              );
            }
            if (outcome === "goal_done") {
              console.log(
                `[loop] 📋 overall goal verified during step ${i + 1} — finishing (skipping ${plan2.steps.length - i - 1} remaining steps)`
              );
              return "done";
            }
            if (outcome === "cancelled") return outcome;
            if (outcome === "infeasible" || outcome === "exhausted") {
              if (!planRevised) {
                planRevised = true;
                console.log(
                  `[loop] 📋 step ${i + 1} ${outcome} — revising the plan from the live screen (one-shot)`
                );
                await events.onStatus(
                  "Plan isn't working — revising from the current screen…"
                );
                try {
                  const freshShot = await maybeCropToTargetApp(
                    await screenshot(),
                    opts.targetApp
                  );
                  const evidenceBlock = failureEvidence.length ? `
Evidence from the failed attempts:
${failureEvidence.map((l) => `  - ${l}`).join("\n")}` : "";
                  const revised = await decompose(
                    `${task}
[PLAN REVISION: the previous plan failed at step "${plan2.steps[i]}" (${outcome}).${evidenceBlock}
Your new plan must take a STRUCTURALLY DIFFERENT route — do NOT include the failed step or near-variants of it. Plan ONLY from what is actually on the CURRENT screenshot. If the screen shows an unrelated app or window, the first step must REACH the task's target (browser.navigate <url> for websites, open app "Name" for native apps) — never interact with unrelated windows.]`,
                    freshShot.png.toString("base64"),
                    [freshShot.width, freshShot.height],
                    opts.provider,
                    void 0,
                    await probeBrowserCtx()
                  );
                  if (opts.shouldCancel?.()) return "cancelled";
                  if (!revised.oneShot) {
                    plan2 = revised;
                    console.log(
                      `[loop] 📋 revised plan (${plan2.steps.length} steps):
` + plan2.steps.map((s, n) => `   ${n + 1}. ${s}`).join("\n")
                    );
                    await events.onStatus(
                      `Revised plan: ${plan2.steps.map((s, n) => `${n + 1}) ${s}`).join("  ")}`
                    );
                    i = -1;
                    continue;
                  }
                  console.log(
                    "[loop] 📋 revision came back single-step — keeping the failure outcome"
                  );
                } catch (e) {
                  console.log(
                    `[loop] 📋 plan revision failed (${e instanceof Error ? e.message : String(e)})`
                  );
                }
              }
              if (outcome === "infeasible") return "infeasible";
              console.log(
                `[loop] 📋 decompose: step ${i + 1}/${plan2.steps.length} exhausted twice — aborting remaining steps`
              );
              return "exhausted";
            }
          }
          return "done";
        }
      }
    }
    console.log(
      `[loop] 📋 flat mode (agent_do): skipping planner (maxSteps=${flatBudget}` + (opts.overallGoal ? `, goal="${opts.overallGoal.slice(0, 60)}"` : "") + `)`
    );
    const result = await runOneSubtask({
      ...opts,
      task,
      overallGoal: opts.overallGoal,
      maxSteps: flatBudget,
      onStep: () => {
      }
    });
    return result === "cancelled" || result === "exhausted" || result === "infeasible" ? result : "done";
  }
  const planner = createOllamaPlanner();
  const t0 = Date.now();
  let plannerContext = {};
  if (opts.browser) {
    try {
      if (await opts.browser.available().catch(() => false)) {
        const snap = await opts.browser.snapshot();
        plannerContext = { browserUrl: snap.url, browserTitle: snap.title };
      }
    } catch {
    }
  }
  const plan = await planner.plan(task, plannerContext);
  console.log(
    `[loop] 📋 plan (${Date.now() - t0}ms): ${plan.note}
` + plan.subtasks.map((s, i) => `   ${i + 1}. ${s}`).join("\n")
  );
  if (plan.decomposed) {
    await events.onStatus(
      `Plan: ${plan.subtasks.map((s, i) => `${i + 1}) ${s}`).join("  ")}`
    );
  }
  let totalSteps = 0;
  for (let i = 0; i < plan.subtasks.length; i++) {
    if (opts.shouldCancel?.()) return "cancelled";
    const subtask = plan.subtasks[i];
    const remaining = MAX_STEPS_TOTAL - totalSteps;
    const subBudget = plan.decomposed ? Math.min(remaining, MAX_STEPS_PER_SUBTASK) : MAX_STEPS;
    if (subBudget <= 0) {
      console.warn("[loop] 🛑 step budget exhausted across subtasks");
      await events.onError("Step budget exhausted before all subtasks finished.");
      return "exhausted";
    }
    if (plan.decomposed) {
      await events.onStatus(`Subtask ${i + 1}/${plan.subtasks.length}: ${subtask}`);
      console.log(
        `
[loop] ── subtask ${i + 1}/${plan.subtasks.length} (budget=${subBudget}) — ${subtask} ──`
      );
    }
    const result = await runOneSubtask({
      ...opts,
      task: subtask,
      overallGoal: plan.decomposed ? task : void 0,
      maxSteps: subBudget,
      onStep: () => {
        totalSteps++;
      }
    });
    if (result === "goal_done") {
      console.log(
        `[loop] ✅ overall goal verified during subtask ${i + 1} — finishing early`
      );
      return "done";
    }
    if (result === "cancelled") return "cancelled";
    if (result === "infeasible") {
      console.warn(
        `[loop] 🚫 subtask ${i + 1} infeasible — aborting remaining ${plan.subtasks.length - i - 1} subtasks`
      );
      return "infeasible";
    }
    if (result === "exhausted") {
      console.warn(
        `[loop] 🛑 subtask ${i + 1} exhausted — aborting remaining ${plan.subtasks.length - i - 1} subtasks`
      );
      return "exhausted";
    }
  }
  console.log(
    `[loop] 🏁 all ${plan.subtasks.length} subtask(s) completed (${totalSteps} steps total)`
  );
  return "done";
}
async function runOneSubtask(opts) {
  const { task, provider, events, overallGoal, maxSteps, onStep } = opts;
  const browser2 = opts.browser ?? null;
  const router2 = opts.router ?? null;
  let prevSnapshotHash;
  let prevScreenHash;
  let pendingRouterHint;
  if (opts.surface && opts.surface !== "chrome-page" && opts.surface.length > 0) {
    pendingRouterHint = `Caller declared OS surface "${opts.surface}" — an OS overlay (file picker / Finder / native dialog / etc.) is in front of Chrome. The Chrome accessibility tree this step is the page UNDERNEATH; treat it as informational only. Emit a vision-grounded mouse action (click / double click / drag / etc.) targeting the OS surface. browser.* refs are NOT applicable until the OS overlay is dismissed.`;
  }
  const history = [];
  const actionScreenHashes = [];
  const recentClickGrounds = [];
  const SCATTER_THRESHOLD_PX = 250;
  const SCATTER_WINDOW = 6;
  let verificationAttempted = false;
  let infeasibilityAttempted = false;
  let hardRetryAttempted = false;
  let consecutiveProviderErrors = 0;
  let tabHiddenNoted = false;
  let tabRaiseAttempted = false;
  let scrollNoEffectStreak = 0;
  let scrollBanned = false;
  let lastReadContent = null;
  let lastTypedUrl = null;
  let editActions = 0;
  let fabricatedDoneRejected = false;
  let saveBeforeTypeBlocks = 0;
  const typedTextScreens = /* @__PURE__ */ new Map();
  const disabledRejectCount = /* @__PURE__ */ new Map();
  const rejectedNavigateUrls = /* @__PURE__ */ new Set();
  const verifyGatedNavUrls = /* @__PURE__ */ new Set();
  const redundantNavCounts = /* @__PURE__ */ new Map();
  const swappedClickRefs = /* @__PURE__ */ new Set();
  const noEffectClickRefs = /* @__PURE__ */ new Map();
  let consecutiveBans = 0;
  let prefetched = null;
  let prevExecuted = null;
  const stepPause = opts.stepPause ?? (provider.name === "hcompany" ? STEP_PAUSE_MS_HCOMPANY : STEP_PAUSE_MS_DEFAULT);
  const ctrl = new AbortController();
  const cancelled = () => {
    if (opts.shouldCancel?.() && !ctrl.signal.aborted) {
      ctrl.abort();
      return true;
    }
    return ctrl.signal.aborted;
  };
  console.log(
    `
[loop] ▶ task="${task}"${overallGoal ? ` goal="${overallGoal}"` : ""} provider=${provider.name} maxSteps=${maxSteps} stepPause=${stepPause}ms`
  );
  const taskForPlanner = overallGoal && overallGoal !== task ? `${task}
(this is part of: ${overallGoal})` : task;
  for (let step = 0; step < maxSteps; step++) {
    if (cancelled()) {
      console.log("[loop] ⏹  cancelled by user");
      return "cancelled";
    }
    console.log(`
[loop] ── step ${step + 1}/${maxSteps} ──`);
    const t0 = Date.now();
    let shot;
    let prefetchUsed = false;
    if (prefetched) {
      try {
        shot = await prefetched;
        prefetchUsed = true;
      } catch (e) {
        console.warn(
          `[loop] prefetch failed (${e instanceof Error ? e.message : String(e)}) — falling back to fresh screenshot`
        );
        shot = await screenshot();
      }
      prefetched = null;
    } else {
      shot = await screenshot();
    }
    shot = await maybeCropToTargetApp(shot, opts.targetApp);
    if ((process.env.PONDER_FULLFRAME_DOWNSCALE ?? "on").toLowerCase() !== "off" && (shot.scaleFactor || 1) > 1 && shot.width >= 1024) {
      try {
        const tDown = Date.now();
        const dims = pngDimensions$1(shot.png);
        if (dims && dims.width > shot.width) {
          const down = await cropAndScalePng(
            shot.png,
            { x: 0, y: 0, w: dims.width, h: dims.height },
            shot.width / dims.width
          );
          console.log(
            `[loop] 📉 full-frame downscale ${dims.width}×${dims.height}→${shot.width}×${shot.height} (${shot.png.length}→${down.length} bytes, ${Date.now() - tDown}ms)`
          );
          shot = { ...shot, png: down, scaleFactor: 1 };
        }
      } catch (e) {
        console.log(
          `[loop] 📉 downscale failed (${e instanceof Error ? e.message.split("\n")[0] : String(e)}) — sending native`
        );
      }
    }
    const occluders = shot.occluders;
    if (occluders && occluders.length > 0) {
      const note = `[note: ${opts.targetApp}'s window is partially covered by ${occluders.join(" and ")} — clicks in the covered area will hit that window instead. If clicks have no effect, the overlapping window must be moved or closed first.]`;
      if (history[history.length - 1] !== note && !history.includes(note)) {
        history.push(note);
        opts.onHistory?.(note);
      }
    }
    let currentUrl;
    if (opts.targetApp && /^(Google Chrome|Safari)$/i.test(opts.targetApp)) {
      currentUrl = await getBrowserUrl(opts.targetApp) ?? void 0;
      if (currentUrl) {
        console.log(
          `[loop] 🌐 browser url (${opts.targetApp}): ${currentUrl.url} — "${currentUrl.title.slice(0, 60)}${currentUrl.title.length > 60 ? "..." : ""}"`
        );
      }
    }
    let screenHash = hashScreen(shot.png);
    console.log(
      `[loop] 📸 screenshot ${shot.width}x${shot.height} (${shot.png.length} bytes, ${Date.now() - t0}ms${prefetchUsed ? " prefetched" : ""}) hash=${screenHash}`
    );
    if (prevExecuted && /^(click|double_click|triple_click|right_click)$/i.test(
      prevExecuted.type
    ) && screenHash === prevScreenHash) {
      const note = "[note: the previous click changed NOTHING on screen — it likely never reached the target (another window may have intercepted it). Re-emit the action for the same target.]";
      if (history[history.length - 1] !== note) {
        history.push(note);
        opts.onHistory?.(note);
        console.log(
          `[loop] ⚠ previous ${prevExecuted.type} produced no screen change — flagged to the brain`
        );
      }
    }
    await events.onScreenshot(shot.png);
    opts.onScreenshotBuffer?.(shot.png);
    if (cancelled()) return "cancelled";
    const screenSize = [shot.width, shot.height];
    let browserSnapshot;
    if (browser2) {
      try {
        if (await browser2.available()) {
          const tSnap = Date.now();
          browserSnapshot = await browser2.snapshot();
          console.log(
            `[loop] 🌐 snapshot (${Date.now() - tSnap}ms): ${browserSnapshot.url} (${browserSnapshot.ax.length}b)`
          );
          opts.onBrowserSnapshot?.(browserSnapshot);
        }
      } catch (e) {
        console.warn(
          `[loop] snapshot failed (${e instanceof Error ? e.message : String(e)}) — vision-only this step`
        );
      }
    }
    let controlledTabHidden = false;
    if (browserSnapshot && browser2?.isActive) {
      const norm = (s) => (s || "").toLowerCase().replace(
        /\s*[-–—|]\s*(google chrome|chromium|brave|microsoft edge|arc)\s*$/i,
        ""
      ).replace(/\s+/g, " ").trim();
      const titlesAgree = (winTitle, tabTitle) => {
        const w = norm(winTitle);
        const t = norm(tabTitle);
        if (!w || !t) return false;
        if (w === t) return true;
        const shorter = w.length <= t.length ? w : t;
        const longer = w.length <= t.length ? t : w;
        return shorter.length >= 10 && longer.startsWith(shorter.slice(0, 30));
      };
      controlledTabHidden = !await browser2.isActive().catch(() => false);
      let coveringApp = null;
      let frontIsForeignTab = false;
      try {
        const wins = await listMacWindows();
        const front = wins?.find(
          (w) => w.layer === 0 && w.width > 200 && w.height > 200
        );
        if (front) {
          const frontIsBrowser = /chrome|chromium|arc|brave|edge/i.test(
            front.owner
          );
          if (!frontIsBrowser) {
            controlledTabHidden = true;
            coveringApp = wins?.find(
              (w) => /chrome|chromium|arc|brave|edge/i.test(w.owner)
            )?.owner ?? null;
          } else if (!titlesAgree(front.name, browserSnapshot.title)) {
            controlledTabHidden = true;
            frontIsForeignTab = true;
          } else {
            controlledTabHidden = false;
          }
        }
      } catch {
      }
      if (controlledTabHidden && !tabRaiseAttempted) {
        tabRaiseAttempted = true;
        console.log(
          `[loop] 🪟 controlled tab hidden (${frontIsForeignTab ? "a different Chrome tab/window is in front" : `covered by ${coveringApp ?? "another app"}`}) — switching to it`
        );
        try {
          if (browser2.bringToFront) await browser2.bringToFront();
          if (coveringApp) await raiseMacApp(coveringApp);
          await sleep$4(300);
          shot = await maybeCropToTargetApp(
            await screenshot(),
            opts.targetApp
          );
          screenHash = hashScreen(shot.png);
          const winsAfter = await listMacWindows();
          const frontAfter = winsAfter?.find(
            (w) => w.layer === 0 && w.width > 200 && w.height > 200
          );
          if (frontAfter && /chrome|chromium|arc|brave|edge/i.test(frontAfter.owner) && titlesAgree(frontAfter.name, browserSnapshot.title)) {
            controlledTabHidden = false;
            console.log(
              `[loop] 🪟 recovery succeeded — controlled tab is now frontmost`
            );
          } else {
            console.log(
              `[loop] 🪟 recovery did not surface the controlled tab — staying browser.*-only this episode`
            );
          }
        } catch {
        }
      }
      if (controlledTabHidden && !tabHiddenNoted) {
        tabHiddenNoted = true;
        const note = `[note: IGNORE THE SCREENSHOT — it shows a DIFFERENT tab/app, NOT the page you control. You ARE on ${browserSnapshot.url} (the snapshot + browser.read are the TRUTH). Do NOT navigate there again (you're already there), and do NOT trust the screenshot's apparent page. Work ENTIRELY via browser.* (which act on the controlled tab regardless of what's visible): browser.read to see it; OPEN an item by browser.navigate to its edit URL, or browser.click its [eN] ref, or browser.click its "More options" ref then the "Edit listing" menuitem; browser.type to change it. NO vision clicks/scrolls until the page is actually visible.]`;
        history.push(note);
        opts.onHistory?.(note);
        console.log(
          `[loop] ⚠ controlled tab still hidden after recovery — strong note to planner`
        );
      }
      if (!controlledTabHidden) {
        tabHiddenNoted = false;
        tabRaiseAttempted = false;
      }
    }
    let pendingProbe = null;
    const probeMinStep = Math.max(
      1,
      opts.completionProbe?.minStep ?? COMPLETION_PROBE_MIN_STEP
    );
    const probeEvery = Math.max(
      1,
      opts.completionProbe?.every ?? COMPLETION_PROBE_EVERY
    );
    const probeGoal = overallGoal && overallGoal.trim() !== task.trim() ? overallGoal : null;
    if (COMPLETION_PROBE_ENABLED && verifierEnabled() && step >= probeMinStep && step % probeEvery === 0) {
      const stepTier = probeGoal !== null && provider.name !== "hcompany";
      console.log(
        `[loop] 🔎 completion probe (step ${step + 1}) — checking ${probeGoal ? stepTier ? "OVERALL GOAL + CURRENT STEP" : "the OVERALL GOAL" : "the goal"}…`
      );
      const mkVerify = (vtask) => verify(provider, {
        task: vtask,
        screenshotB64: shot.png.toString("base64"),
        screen: screenSize,
        browserSnapshot,
        currentUrl,
        tabHidden: controlledTabHidden,
        signal: ctrl.signal,
        // Fail-closed: nobody claimed DONE here — a provider error or
        // ambiguous reply must not terminate the run (under decompose
        // it would falsely advance the plan).
        errorDefault: false
      });
      pendingProbe = (async () => {
        try {
          const [goal, step_] = await Promise.all([
            mkVerify(probeGoal ?? taskForPlanner),
            stepTier ? mkVerify(taskForPlanner) : Promise.resolve(null)
          ]);
          return { ok: true, goal, step: step_ };
        } catch (err) {
          return { ok: false, err };
        }
      })();
      if (provider.name === "hcompany") {
        const settled = await pendingProbe;
        pendingProbe = null;
        if (cancelled()) return "cancelled";
        if (!settled.ok) throw settled.err;
        if (settled.goal.verified) {
          console.log(
            "[loop] ✅ completion probe: goal already achieved — the brain didn't recognize completion; terminating as DONE"
          );
          await events.onStatus("Goal already met — finishing.");
          return probeGoal ? "goal_done" : "done";
        }
        console.log(
          `[loop] 🔁 completion probe: not done yet (${settled.goal.reason ?? "no proof"}) — continuing`
        );
        if (cancelled()) return "cancelled";
      }
    }
    if (browserSnapshot && history.length > 0) {
      const prev = history[history.length - 1];
      const m = prev.match(/^browser\.navigate\s+(\S+)/i);
      if (m && !/→ redirected to/.test(prev)) {
        const requested = canonicalizeUrl(m[1]);
        const actual = canonicalizeUrl(browserSnapshot.url);
        if (requested && actual && requested !== actual) {
          rejectedNavigateUrls.add(requested);
          const annotated = `${prev}  → redirected to ${browserSnapshot.url}`;
          history[history.length - 1] = annotated;
          console.warn(
            `[loop] 🔁 navigate redirected: ${m[1]} → ${browserSnapshot.url} (added to rejected set)`
          );
        }
      }
    }
    if (step === 0 && browser2 && browserSnapshot && (process.env.PONDER_WEB_KICKSTART ?? "on").toLowerCase() !== "off" && /^(about:blank|chrome:\/\/newtab\/?|chrome:\/\/new-tab-page\/?)?$/i.test(
      browserSnapshot.url.trim()
    ) && (!opts.targetApp || /chrome|safari|firefox/i.test(opts.targetApp))) {
      const rawQuery = (opts.overallGoal ?? opts.task).replace(/\[[^\]]*\]/g, " ").replace(/^CURRENT STEP[^:]*:\s*/i, "").replace(/\s+/g, " ").trim().slice(0, 200);
      const urlInTask = rawQuery.match(
        /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/i
      );
      const kickUrl = urlInTask ? urlInTask[0].startsWith("http") ? urlInTask[0] : `https://${urlInTask[0]}` : `https://www.google.com/search?q=${encodeURIComponent(rawQuery)}`;
      try {
        console.log(
          `[loop] 🚀 web kickstart: blank tab + web task → browser.navigate ${kickUrl}`
        );
        await browser2.navigate(kickUrl);
        const entry = `browser.navigate ${kickUrl}  [deterministic kickstart: blank tab]`;
        history.push(entry);
        opts.onHistory?.(entry);
        await events.onAction({
          type: "browser_navigate",
          payload: { url: kickUrl }
        });
        await events.onStatus(`Opened ${kickUrl}`);
        prevExecuted = { type: "browser_navigate", payload: { url: kickUrl } };
        prevScreenHash = screenHash;
        prevSnapshotHash = browserSnapshot ? hashScreen(Buffer.from(browserSnapshot.ax)) : prevSnapshotHash;
        if (await interruptiblePause(stepPause, cancelled)) return "cancelled";
        continue;
      } catch (e) {
        console.log(
          `[loop] 🚀 web kickstart failed (${e instanceof Error ? e.message.split("\n")[0] : String(e)}) — falling through to the normal loop`
        );
      }
    }
    let routerAction;
    let usedRouter = false;
    const snapHash = browserSnapshot ? hashScreen(Buffer.from(browserSnapshot.ax)) : void 0;
    const snapshotUnchanged = prevSnapshotHash !== void 0 && snapHash === prevSnapshotHash;
    const screenChanged = prevScreenHash !== void 0 && prevScreenHash !== screenHash;
    const prevType = prevExecuted?.type ?? "";
    const prevWasClickLike = /^(browser_click|click|double_click|triple_click|right_click)$/.test(
      prevType
    );
    const browserStalled = snapshotUnchanged && screenChanged && prevWasClickLike;
    if (browserSnapshot && prevType === "browser_click") {
      const prevRef = String(prevExecuted?.payload?.ref ?? "");
      if (/^e\d+$/i.test(prevRef)) {
        if (snapshotUnchanged) {
          noEffectClickRefs.set(
            prevRef,
            (noEffectClickRefs.get(prevRef) ?? 0) + 1
          );
        } else {
          noEffectClickRefs.delete(prevRef);
        }
      }
    }
    const prevWasScroll = /^(browser_scroll_page|scroll|browser_scroll_element)$/.test(
      prevType
    );
    if (browserSnapshot && prevWasScroll) {
      const scrollMovedSomething = !snapshotUnchanged || screenChanged;
      if (scrollMovedSomething) {
        scrollNoEffectStreak = 0;
      } else {
        scrollNoEffectStreak += 1;
        if (scrollNoEffectStreak >= 2 && !scrollBanned) {
          scrollBanned = true;
          const ban = "[note: SCROLLING IS DISABLED for this page — it moved nothing twice (the list is a nested container window-scroll can't reach, and/or the screenshot shows a different tab). STOP scrolling. Use browser.read to get the FULL page text in one shot (it returns ALL items, even off-screen ones), then ACT on a specific item — open it with browser.click <its ref> or browser.navigate to its edit URL.]";
          if (history[history.length - 1] !== ban) {
            history.push(ban);
            opts.onHistory?.(ban);
          }
          console.log(
            `[loop] ⛔ scroll banned for this subtask (${scrollNoEffectStreak} no-effect scrolls)`
          );
        }
      }
    }
    if (browserSnapshot && snapshotUnchanged && prevExecuted) {
      let effectNote = null;
      if (/^(browser_scroll_page|scroll)$/.test(prevType)) {
        effectNote = scrollBanned ? null : "[note: that scroll changed NOTHING in the page DOM. The list may be a nested scroll container (try: scroll down at <description of the list>) — but if the content is already loaded, STOP scrolling: use browser.read to capture the whole page, then ACT on a specific item.]";
      } else if (prevType === "browser_click" && !browserStalled) {
        effectNote = "[note: that browser.click changed nothing in the page DOM — the ref may be non-interactive or not the element you meant. Pick a DIFFERENT element, or use a vision click on what you can SEE in the screenshot.]";
      }
      if (effectNote && history[history.length - 1] !== effectNote) {
        history.push(effectNote);
        opts.onHistory?.(effectNote);
        console.log(`[loop] ⚠ no-effect feedback → planner (${prevType})`);
      }
    }
    if (browserStalled) {
      console.log(
        "[loop] 🪟 browser-stall: DOM unchanged but screen pixels moved — OS overlay likely (file picker / native dialog). Skipping router this step, going vision."
      );
      pendingRouterHint = "The previous click changed screen pixels but NOT the page DOM. Two possibilities — check the SCREENSHOT to tell them apart: (a) a native OS dialog opened on top of Chrome (file picker / save dialog / system prompt) — if you SEE one, drive it with vision-grounded clicks ('click the Open button'), browser.* can't reach it; (b) no dialog visible — the click simply had no effect (the pixel change was animation/lazy-loading); do something DIFFERENT: a different element, a more specific URL, or check whether the step is already satisfied and emit DONE.";
    }
    const osSurfaceFirstStep = step === 0 && opts.surface !== void 0 && opts.surface !== "chrome-page" && opts.surface.length > 0;
    if (router2 && browserSnapshot && !browserStalled && !osSurfaceFirstStep) {
      const tRouter = Date.now();
      try {
        const decision = await router2.decide({
          task: taskForPlanner,
          history,
          snapshot: browserSnapshot,
          snapshotUnchanged,
          signal: ctrl.signal
        });
        const dt = Date.now() - tRouter;
        switch (decision.kind) {
          case "action": {
            console.log(`[router] (${dt}ms) → ${decision.action}`);
            const normalized = normalizeAction(decision.action);
            let priorFailures = 0;
            let lastFailure = "";
            for (const entry of history) {
              if (!entry.includes("[note: failed")) continue;
              const entryAction = entry.split("  [note:")[0] ?? "";
              if (normalizeAction(entryAction) === normalized) {
                priorFailures += 1;
                lastFailure = entry.slice(entry.indexOf("[note:"));
              }
            }
            if (priorFailures >= 2) {
              console.log(
                `[router] ⛔ vetoed — "${decision.action}" already failed ${priorFailures}× (${lastFailure.slice(0, 80)}). Forcing the brain this step.`
              );
              pendingRouterHint = `The router keeps suggesting "${decision.action}" but it has FAILED ${priorFailures} times already (${lastFailure.slice(0, 140)}). Do something DIFFERENT: pick another element, navigate to a more specific URL, or use a keyboard path.`;
              break;
            }
            routerAction = decision.action;
            usedRouter = true;
            break;
          }
          case "done":
            console.log(`[router] (${dt}ms) → DONE`);
            await events.onThought("DONE (router)");
            if (!verificationAttempted && verifierEnabled()) {
              verificationAttempted = true;
              console.log("[loop] 🔍 verifying router DONE...");
              await events.onStatus("Verifying that the goal landed…");
              const verifyResult = await verify(provider, {
                task: taskForPlanner,
                screenshotB64: shot.png.toString("base64"),
                screen: screenSize,
                browserSnapshot,
                currentUrl,
                tabHidden: controlledTabHidden,
                signal: ctrl.signal
              });
              if (cancelled()) return "cancelled";
              if (verifyResult.verified) {
                console.log("[loop] ✅ DONE (router, verified)");
                return "done";
              }
              const reason = verifyResult.reason ?? "no reason given";
              console.log(`[loop] ❌ verifier said retry — ${reason}`);
              const note = `[note: verifier said router DONE was wrong — ${reason}; reconsider state and continue]`;
              history.push(note);
              actionScreenHashes.push(screenHash);
              opts.onHistory?.(note);
              await events.onError(
                `Verifier rejected router DONE — ${reason}. Retrying once.`
              );
              if (await interruptiblePause(stepPause, cancelled))
                return "cancelled";
              prevSnapshotHash = snapHash;
              prevScreenHash = screenHash;
              continue;
            }
            return "done";
          case "vision_needed":
            console.log(`[router] (${dt}ms) → VISION_NEEDED: ${decision.reason}`);
            pendingRouterHint = decision.reason;
            break;
          case "skip":
            console.log(`[router] (${dt}ms) → skip: ${decision.reason}`);
            break;
        }
      } catch (e) {
        console.warn(
          `[loop] router error (${e instanceof Error ? e.message : String(e)}) — falling through to vision`
        );
      }
    }
    prevSnapshotHash = snapHash;
    prevScreenHash = screenHash;
    let action;
    let preGroundedCoords = null;
    if (routerAction) {
      action = routerAction;
      await events.onThought(`(router) ${action}`);
      if (cancelled()) return "cancelled";
    } else {
      const tPlan = Date.now();
      try {
        const thought = await think(provider, {
          task: taskForPlanner,
          history,
          screenshotB64: shot.png.toString("base64"),
          screen: screenSize,
          signal: ctrl.signal,
          browserSnapshot,
          routerHint: pendingRouterHint,
          currentUrl
        });
        action = thought.action;
        preGroundedCoords = thought.coords;
        consecutiveProviderErrors = 0;
      } catch (e) {
        if (cancelled()) return "cancelled";
        consecutiveProviderErrors += 1;
        if (consecutiveProviderErrors >= 3) throw e;
        const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
        console.warn(
          `[loop] ⚠ plan call failed (${msg}) — transient ${consecutiveProviderErrors}/3, retrying next step`
        );
        const note = `[note: the planning call failed with a transient error (${msg}) — nothing was executed; continue from the current screen state]`;
        history.push(note);
        opts.onHistory?.(note);
        if (await interruptiblePause(Math.max(stepPause, 1e3), cancelled))
          return "cancelled";
        continue;
      }
      pendingRouterHint = void 0;
      console.log(`[loop] 🧠 plan (${Date.now() - tPlan}ms): ${action}`);
      await events.onThought(action);
      if (cancelled()) return "cancelled";
    }
    if (pendingProbe) {
      const settled = await pendingProbe;
      pendingProbe = null;
      if (cancelled()) return "cancelled";
      if (!settled.ok) throw settled.err;
      if (settled.goal.verified) {
        console.log(
          "[loop] ✅ completion probe: goal already achieved — the brain didn't recognize completion; terminating as DONE (discarding this step's planned action)"
        );
        await events.onStatus("Goal already met — finishing.");
        return probeGoal ? "goal_done" : "done";
      }
      if (settled.step?.verified) {
        console.log(
          "[loop] ✅ step probe: the CURRENT STEP's expected result is already on screen — advancing (discarding this step's planned action)"
        );
        await events.onStatus("Step already landed — advancing.");
        return "done";
      }
      console.log(
        `[loop] 🔁 completion probe: not done yet (${settled.goal.reason ?? "no proof"}) — continuing`
      );
    }
    if (scrollBanned && /^(scroll\b|browser\.scroll\b)/i.test(action.trim())) {
      const ban = "[note: scrolling is DISABLED for this page (it moved nothing twice). Do NOT scroll. Use browser.read to capture the full page text, then ACT on a specific item (browser.click its ref, or browser.navigate to its edit URL).]";
      console.log(`[loop] ⛔ blocked banned scroll: ${action.slice(0, 50)}`);
      if (history[history.length - 1] !== ban) {
        history.push(ban);
        opts.onHistory?.(ban);
      }
      if (await interruptiblePause(stepPause, cancelled)) return "cancelled";
      continue;
    }
    if (/^browser\.read\b/i.test(action.trim()) && lastReadContent) {
      const nudge = `[note: you ALREADY read this page — its full text is in your history above (it lists every item, including ones off-screen). Re-reading returns the same bytes. ACT on it now: pick a specific item and open it (browser.click its ref, or browser.navigate to its edit URL).]`;
      console.log(`[loop] ⚠ duplicate browser.read suppressed`);
      if (history[history.length - 1] !== nudge) {
        history.push(nudge);
        opts.onHistory?.(nudge);
      }
      if (await interruptiblePause(stepPause, cancelled)) return "cancelled";
      continue;
    }
    if (/^note\s/i.test(action.trim())) {
      const noteText = action.trim().replace(/^note\s+["“']?/i, "").replace(/["”']\s*$/, "").toLowerCase();
      const probe2 = noteText.slice(0, 60);
      const echoed = probe2.length >= 20 && history.slice(-8).some(
        (h) => h.startsWith("[note:") && h.toLowerCase().includes(probe2)
      );
      if (echoed) {
        const nudge = lastReadContent ? "[note: you ECHOED a system note back — never repeat [note: …] history entries. You already read this page; do NOT read again. Your NEXT action MUST open a specific item: browser.click <eN> from the snapshot, or browser.navigate to an item's edit URL.]" : "[note: you ECHOED a system note back — [note: …] entries in history are observations addressed to YOU, never text to repeat. Take a SCREEN ACTION now (browser.read to see the page, then act), or emit DONE if the state already satisfies the step.]";
        console.log(`[loop] ⚠ echoed system note suppressed`);
        if (history[history.length - 1] !== nudge) {
          history.push(nudge);
          opts.onHistory?.(nudge);
        }
        if (await interruptiblePause(stepPause, cancelled)) return "cancelled";
        continue;
      }
      const normalizedNote = normalizeAction(action);
      const recentDup = history.slice(-6).some((h) => normalizeAction(h.split("  [note:")[0] ?? "") === normalizedNote);
      if (recentDup) {
        const nudge = "[note: duplicate note suppressed — you already recorded exactly this. A note is NOT progress. Take a SCREEN ACTION now: click/open the next item, or if you are stuck, do the FIRST concrete sub-action of your own note.]";
        console.log(`[loop] ⚠ duplicate note suppressed`);
        if (history[history.length - 1] !== nudge) {
          history.push(nudge);
          opts.onHistory?.(nudge);
        }
        if (await interruptiblePause(stepPause, cancelled)) return "cancelled";
        continue;
      }
      const prevWasPlannerNote = /^note\s/i.test(
        (history[history.length - 1] ?? "").trim()
      );
      const recordsProgress = /\b(done|edited|saved|completed|finished|updated|\d+\s*(of|\/)\s*\d+)\b/i.test(
        normalizedNote
      );
      if (prevWasPlannerNote && !recordsProgress) {
        const nudge = lastReadContent ? "[note: TWO notes in a row with no action — you are narrating, not working. You already read this page; do NOT read again and do NOT note. This turn MUST open the next item: browser.click <eN> from the snapshot, or browser.navigate to its edit URL — or emit DONE if every item is handled.]" : "[note: TWO notes in a row with no action — you are narrating, not working. STOP. This turn MUST be a concrete action (browser.read to see the page, then act on a specific item).]";
        console.log(`[loop] ⚠ consecutive narration-note suppressed`);
        if (history[history.length - 1] !== nudge) {
          history.push(nudge);
          opts.onHistory?.(nudge);
        }
        if (await interruptiblePause(stepPause, cancelled)) return "cancelled";
        continue;
      }
    }
    if (isDone(action)) {
      const goalText = opts.overallGoal ?? opts.task ?? "";
      const multiItemGoal = /\b(each|every|all)\b/i.test(goalText);
      const editGoal = /\b(change|edit|update|modify|set|replace|rename|rewrite|adjust|fix|add|remove|delete|append|reword|revise)\b/i.test(
        goalText
      );
      if (multiItemGoal && editGoal && editActions === 0 && !fabricatedDoneRejected) {
        fabricatedDoneRejected = true;
        const note = `[note: you claimed DONE but have made ZERO actual changes — you have not typed into a single item's form yet (a progress note is not an edit). The task is to change EACH item. OPEN the first item (browser.navigate to its edit URL, or browser.click its ref / its More-options→"Edit listing"), browser.type the change, and save. Do NOT emit DONE again until you have actually edited items.]`;
        console.warn(
          `[loop] ⛔ fabricated DONE rejected — 0 edits committed on an each/all task`
        );
        history.push(note);
        actionScreenHashes.push(screenHash);
        opts.onHistory?.(note);
        if (await interruptiblePause(stepPause, cancelled)) return "cancelled";
        continue;
      }
      if (!verificationAttempted && verifierEnabled()) {
        verificationAttempted = true;
        console.log("[loop] 🔍 verifying claimed DONE...");
        await events.onStatus("Verifying that the goal landed…");
        const verifyResult = await verify(provider, {
          task: taskForPlanner,
          screenshotB64: shot.png.toString("base64"),
          screen: screenSize,
          browserSnapshot,
          currentUrl,
          tabHidden: controlledTabHidden,
          signal: ctrl.signal
        });
        if (cancelled()) return "cancelled";
        if (verifyResult.verified) {
          console.log("[loop] ✅ DONE (verified)");
          return "done";
        }
        const reason = verifyResult.reason ?? "no reason given";
        console.log(`[loop] ❌ verifier said retry — ${reason}`);
        const note = `[note: verifier said the goal is NOT yet achieved — ${reason}; reconsider state and continue]`;
        history.push(note);
        actionScreenHashes.push(screenHash);
        opts.onHistory?.(note);
        await events.onError(
          `Verifier rejected the claimed DONE — ${reason}. Retrying once.`
        );
        if (await interruptiblePause(stepPause, cancelled)) return "cancelled";
        continue;
      }
      console.log("[loop] ✅ DONE");
      return "done";
    }
    if (isInfeasible(action)) {
      const claimed = infeasibleReason(action);
      if (!infeasibilityAttempted && verifierEnabled()) {
        infeasibilityAttempted = true;
        console.log(`[loop] 🚫 brain claims INFEASIBLE — verifying: ${claimed}`);
        await events.onStatus("Double-checking the task is truly impossible…");
        const check = await verifyInfeasible(provider, {
          task: taskForPlanner,
          claimedReason: claimed,
          screenshotB64: shot.png.toString("base64"),
          screen: screenSize,
          browserSnapshot,
          currentUrl,
          signal: ctrl.signal
        });
        if (cancelled()) return "cancelled";
        if (check.confirmed) {
          const why = check.reason ?? claimed;
          console.log(`[loop] 🚫 INFEASIBLE confirmed — ${why}`);
          await events.onError(`INFEASIBLE: ${why}`);
          return "infeasible";
        }
        const note = `[note: that is NOT impossible — no concrete blocker is visible on screen; do NOT give up, try a different approach]`;
        console.log(`[loop] ↩ infeasible rejected — ${note}`);
        history.push(note);
        actionScreenHashes.push(screenHash);
        opts.onHistory?.(note);
        await events.onError(
          "Claimed the task is impossible but no concrete blocker is visible — continuing."
        );
        if (await interruptiblePause(stepPause, cancelled)) return "cancelled";
        continue;
      }
      console.log(`[loop] 🚫 INFEASIBLE — ${claimed}`);
      await events.onError(`INFEASIBLE: ${claimed}`);
      return "infeasible";
    }
    if (!action.trim()) {
      console.warn("[loop] ⚠ empty plan — skipping step (provider returned no action)");
      await events.onError(
        "Provider returned an empty action. " + (provider.name === "hcompany" ? "The model may have been mid-reasoning when truncated; check chat_template_kwargs.enable_thinking and max_tokens." : "Check the provider response.")
      );
      history.push("[note: empty action emitted]");
      actionScreenHashes.push(screenHash);
      if (history.length >= 2 && history.at(-2) === "[note: empty action emitted]") {
        console.warn("[loop] 🛑 two consecutive empty plans — stopping");
        await events.onError("Model returned empty actions twice in a row — stopping.");
        return "exhausted";
      }
      if (await interruptiblePause(stepPause, cancelled)) return "cancelled";
      continue;
    }
    if (!isValidAction(action)) {
      console.warn(
        `[loop] ⚠ invalid brain output: ${action.slice(0, 100)}`
      );
      await events.onError(
        `Brain emitted unparseable action: "${action.slice(0, 100)}". Treating as no-op and re-prompting.`
      );
      const note = `[note: brain emitted unparseable action — ${action.slice(0, 80)}]`;
      history.push(note);
      actionScreenHashes.push(screenHash);
      opts.onHistory?.(note);
      const prev = history.at(-2);
      if (prev?.startsWith("[note: brain emitted unparseable action")) {
        console.warn(
          "[loop] 🛑 two consecutive invalid brain outputs — stopping"
        );
        await events.onError(
          "Brain returned unparseable output twice in a row — stopping."
        );
        return "exhausted";
      }
      if (await interruptiblePause(stepPause, cancelled)) return "cancelled";
      continue;
    }
    {
      const normalizedAct = normalizeAction(action);
      const trySwapBannedClick = () => {
        const ref = action.match(/^browser\.click\s+(e\d+)\s*$/i)?.[1];
        if (!ref || !browserSnapshot || swappedClickRefs.has(ref))
          return false;
        const line = browserSnapshot.ax.split("\n").find((l) => l.trimStart().startsWith(`[${ref}]`));
        const desc = line?.replace(/^\s*\[e\d+\]\s*/, "").replace(/\s+/g, " ").trim();
        if (!desc) return false;
        swappedClickRefs.add(ref);
        const swap = `[note: browser.click ${ref} keeps having no effect — switching modality: VISION click on ${desc.slice(0, 120)}]`;
        if (history[history.length - 1] !== swap) {
          history.push(swap);
          opts.onHistory?.(swap);
        }
        console.log(
          `[loop] 🔁 modality swap: banned browser.click ${ref} → click ${desc.slice(0, 80)}`
        );
        action = `click ${desc.slice(0, 120)}`;
        return true;
      };
      let failCount = 0;
      let lastFail = "";
      for (const entry of history) {
        if (!entry.includes("[note: failed")) continue;
        if (normalizeAction(entry.split("  [note:")[0] ?? "") === normalizedAct) {
          failCount += 1;
          lastFail = entry.slice(entry.indexOf("[note:")).slice(0, 160);
        }
      }
      const banRef = action.match(/^browser\.click\s+(e\d+)\s*$/i)?.[1];
      const noFxCount = banRef ? noEffectClickRefs.get(banRef) ?? 0 : 0;
      if ((failCount >= 2 || noFxCount >= 2) && !trySwapBannedClick()) {
        const why = lastFail || `clicking it changed NOTHING in the page DOM ${noFxCount} times`;
        const ban = `[note: BANNED — "${action.slice(0, 80)}" has now failed ${Math.max(failCount, noFxCount)} times (${why}). It will not be executed again. Do something STRUCTURALLY different: a different element ref from the snapshot, a vision click on what you SEE, a keyboard path, or a more specific URL.]`;
        console.warn(
          `[loop] ⛔ banned repeatedly-failing action: ${action.slice(0, 80)} (${failCount} exec failures, ${noFxCount} no-effect clicks)`
        );
        if (history[history.length - 1] !== ban) {
          history.push(ban);
          opts.onHistory?.(ban);
        }
        if (++consecutiveBans >= 3) {
          console.warn(
            `[loop] 🛑 ${consecutiveBans} consecutive banned actions — the planner has no viable move for this step. Bailing early so the plan layer can retry/revise.`
          );
          return "exhausted";
        }
        if (await interruptiblePause(stepPause, cancelled)) return "cancelled";
        continue;
      }
      if (!needsCoordinates(action)) {
        const repeats = history.slice(-8).filter(
          (h) => normalizeAction(h.split("  [note:")[0] ?? "") === normalizedAct
        ).length;
        if (repeats >= 4 && !trySwapBannedClick()) {
          const ban = `[note: BANNED — "${action.slice(0, 60)}" has been executed ${repeats} times recently with no progress; it is likely TOGGLING something open and closed. Do something STRUCTURALLY different (a click, a navigate, or simply DONE if the goal is already met).]`;
          console.warn(
            `[loop] ⛔ banned futile keyboard repeat: ${action.slice(0, 60)} (${repeats}× recently)`
          );
          if (history[history.length - 1] !== ban) {
            history.push(ban);
            opts.onHistory?.(ban);
          }
          if (++consecutiveBans >= 3) {
            console.warn(
              `[loop] 🛑 ${consecutiveBans} consecutive banned actions — the planner has no viable move for this step. Bailing early so the plan layer can retry/revise.`
            );
            return "exhausted";
          }
          if (await interruptiblePause(stepPause, cancelled))
            return "cancelled";
          continue;
        }
      }
    }
    const browserAct = parseBrowserAction(action);
    if (browserAct?.kind === "click" && browserSnapshot && saveBeforeTypeBlocks < 2) {
      const url = browserSnapshot.url.toLowerCase();
      const title = (browserSnapshot.title ?? "").toLowerCase();
      const onEditForm = /\/edit\b|[?&]edit=/.test(url) || /^edit\b/.test(title);
      const refLine = browserSnapshot.ax.split("\n").find((l) => l.trimStart().startsWith(`[${browserAct.ref}]`));
      const isSaveButton = refLine !== void 0 && /\bbutton\b/i.test(refLine) && /\b(save|publish)\b|\bpost\s+changes\b/i.test(refLine);
      const typedHere = lastTypedUrl !== null && lastTypedUrl === browserSnapshot.url;
      if (onEditForm && isSaveButton && !typedHere) {
        saveBeforeTypeBlocks += 1;
        const note = `[note: do NOT click Save yet — you have not typed the change into THIS edit form. Saving an unchanged form does nothing. FIRST: browser.type <the description/text field's eN> "your new value" and press enter (that often saves on its own); only click Save if pressing enter did not.]`;
        console.warn(
          `[loop] ⛔ save-before-type blocked: ${action.slice(0, 50)} (edit form, no type on ${browserSnapshot.url})`
        );
        if (history[history.length - 1] !== note) {
          history.push(note);
          opts.onHistory?.(note);
        }
        if (await interruptiblePause(stepPause, cancelled)) return "cancelled";
        continue;
      }
    }
    if (browserAct?.kind === "navigate" && browserSnapshot) {
      const target = canonicalizeUrl(browserAct.url);
      const current = canonicalizeUrl(browserSnapshot.url);
      if (target && current && target === current) {
        if (provider.name === "composite") {
          if (verifierEnabled() && !verifyGatedNavUrls.has(target)) {
            verifyGatedNavUrls.add(target);
            console.log(
              `[loop] ↪ already at ${browserAct.url} — treating the redundant navigate as a DONE claim, verifying…`
            );
            const verifyResult = await verify(provider, {
              task: taskForPlanner,
              screenshotB64: shot.png.toString("base64"),
              screen: screenSize,
              browserSnapshot,
              currentUrl,
              tabHidden: controlledTabHidden,
              signal: ctrl.signal
            });
            if (cancelled()) return "cancelled";
            if (verifyResult.verified) {
              console.log(
                `[loop] ✅ already at ${browserAct.url} — verified DONE`
              );
              await events.onStatus(`Already at ${browserAct.url}.`);
              return "done";
            }
            console.log(
              `[loop] ↪ verifier kept the run going — ${verifyResult.reason ?? "no reason"}`
            );
          }
          const navCount = (redundantNavCounts.get(target) ?? 0) + 1;
          redundantNavCounts.set(target, navCount);
          const haveRead = lastReadContent !== null;
          const note = navCount >= 2 ? haveRead ? `[note: you are ALREADY on ${browserAct.url} — navigated here ${navCount} times, it does NOTHING, and you have already read it. STOP navigating and STOP noting. Your NEXT action MUST be a single browser.click <eN> on an item's ref from the snapshot (or browser.navigate to an item's OWN edit URL from the page text). Re-navigating to THIS url is forbidden.]` : `[note: you are ALREADY on ${browserAct.url} — navigated here ${navCount} times, it does NOTHING. STOP navigating and STOP noting. Your NEXT action MUST be exactly: browser.read — that returns the item list so you can act on it. Re-navigating to THIS url is forbidden.]` : `[note: already at ${browserAct.url} — the navigate was skipped as a no-op. If your CURRENT STEP was exactly this navigate, it is ALREADY SATISFIED: emit DONE. Otherwise inspect the page (browser.read once) then OPEN a specific item.]`;
          console.log(
            `[loop] ↪ already at ${browserAct.url} — skipping redundant navigate #${navCount} (composite mode: no blind auto-DONE)`
          );
          history.push(note);
          actionScreenHashes.push(screenHash);
          opts.onHistory?.(note);
          prevSnapshotHash = snapHash;
          prevScreenHash = screenHash;
          if (await interruptiblePause(stepPause, cancelled))
            return "cancelled";
          continue;
        }
        console.log(
          `[loop] ✅ already at ${browserAct.url} — auto-DONE for subtask`
        );
        await events.onStatus(`Already at ${browserAct.url}.`);
        return "done";
      }
    }
    if (browserAct?.kind === "navigate") {
      const target = canonicalizeUrl(browserAct.url);
      if (target && rejectedNavigateUrls.has(target)) {
        console.warn(
          `[loop] 🚫 navigate rejected: ${browserAct.url} was redirected on a previous attempt`
        );
        await events.onError(
          `Skipping navigate to ${browserAct.url} — the site redirected this URL once already. Working from the current page instead.`
        );
        const synthetic = `[note: skipped re-navigate to ${browserAct.url} — site redirected this URL on a prior attempt]`;
        history.push(synthetic);
        actionScreenHashes.push(screenHash);
        opts.onHistory?.(synthetic);
        onStep?.();
        await sleep$4(400);
        if (cancelled()) return "cancelled";
        continue;
      }
    }
    if (browserAct?.kind === "click" && browserSnapshot) {
      const ref = browserAct.ref;
      const disabledRe = new RegExp(
        `^\\[${ref}\\][^\\n]*\\(disabled\\)\\s*$`,
        "m"
      );
      if (disabledRe.test(browserSnapshot.ax)) {
        const strike = (disabledRejectCount.get(ref) ?? 0) + 1;
        disabledRejectCount.set(ref, strike);
        console.warn(
          `[loop] 🚫 disabled-ref rejected: ${ref} (strike ${strike}/2)`
        );
        if (strike >= 2) {
          await events.onError(
            `Tried to click disabled ${ref} twice. A prerequisite step (likely picking an autocomplete suggestion from the dropdown) was missed. Stopping.`
          );
          return "exhausted";
        }
        await events.onError(
          `Skipping click on disabled ${ref}. Pick a suggestion from the dropdown first — the Apply/Submit button un-disables once a valid option is selected.`
        );
        const synthetic = `[note: skipped click on disabled ${ref} — pick a suggestion ref first]`;
        history.push(synthetic);
        actionScreenHashes.push(screenHash);
        opts.onHistory?.(synthetic);
        onStep?.();
        await sleep$4(800);
        if (cancelled()) return "cancelled";
        continue;
      }
    }
    const normNow = normalizeAction(action);
    const NO_OP_ISH = /^(wait\b|press\s+(enter|escape|esc)\b|key\s+\{?\s*"?combo"?\s*:?\s*"?(enter|escape|esc)\b)/i;
    const isNoOpAction = NO_OP_ISH.test(normNow);
    if (isNoOpAction && history.length >= 2) {
      const prev1 = normalizeAction(history[history.length - 1]);
      const prev2 = normalizeAction(history[history.length - 2]);
      if (NO_OP_ISH.test(prev1) && NO_OP_ISH.test(prev2)) {
        console.warn(
          `[loop] 🛑 anti-loop (no-op-spam): 3 consecutive no-op-like actions (wait / press enter / press escape). The brain has stalled or doesn't realize the goal already landed. Bailing instead of paying more dead time.`
        );
        await events.onError(
          `Brain emitted no-op-like actions (wait / press enter / press escape) 3 times in a row — either it's stalled, OR the goal already landed and it didn't notice. Look at the current screenshot AND the URL — has the page navigated? Has a result/dialog appeared? If yes, emit DONE. If no, the prior action didn't fire — pick a different verb (click on a specific labeled element instead of blindly pressing keys).`
        );
        return "exhausted";
      }
    }
    const last4 = history.slice(-3).map(normalizeAction).concat(normNow);
    const same = last4.filter((h) => h === normNow).length;
    if (last4.length === 4 && same >= 3) {
      const recentHashes = actionScreenHashes.slice(-3);
      const screensIdentical = recentHashes.length === 3 && recentHashes.every((h) => h === screenHash);
      if (screensIdentical) {
        if (!hardRetryAttempted) {
          hardRetryAttempted = true;
          console.warn(
            `[loop] ⚠ anti-loop wants to bail (action "${action}" repeated ${same}/4 + screen unchanged) — trying ONE hierarchical recovery first`
          );
          await events.onStatus(
            "Stuck — re-observing state and asking the brain to change approach…"
          );
          prefetched = null;
          const note = `[note: STUCK — same action "${action}" was emitted ${same} of the last 4 steps with no visible screen change. The current target is NOT working. DO NOT repeat this action. Try a DIFFERENT approach: switch verbs (mouse↔keyboard), pick a different target ref, scroll to reveal what's hidden, press esc to dismiss any blocker, or emit DONE if the goal is already satisfied.]`;
          history.push(note);
          actionScreenHashes.push(screenHash);
          opts.onHistory?.(note);
          prevSnapshotHash = snapHash;
          prevScreenHash = screenHash;
          await sleep$4(400);
          if (cancelled()) return "cancelled";
          continue;
        }
        console.warn(
          `[loop] 🛑 anti-loop: action "${action}" repeated ${same}/4 times AND screen unchanged AFTER recovery attempt — stopping`
        );
        await events.onError(
          `Stuck in a loop after one recovery attempt: "${action}" was emitted ${same} of the last 4 steps with no screen change. The brain didn't switch strategy when prompted. Bailing.`
        );
        return "exhausted";
      }
      const sameActionGrounds = recentClickGrounds.filter(
        (g) => g.action === normNow
      );
      if (sameActionGrounds.length >= 3) {
        let maxDist = 0;
        for (let i = 0; i < sameActionGrounds.length; i++) {
          for (let j = i + 1; j < sameActionGrounds.length; j++) {
            const dx = sameActionGrounds[i].x - sameActionGrounds[j].x;
            const dy = sameActionGrounds[i].y - sameActionGrounds[j].y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d > maxDist) maxDist = d;
          }
        }
        if (maxDist > SCATTER_THRESHOLD_PX) {
          console.warn(
            `[loop] 🛑 anti-loop (coord-scatter): action "${action}" grounded ${sameActionGrounds.length} times with max pairwise distance ${Math.round(maxDist)}px (threshold ${SCATTER_THRESHOLD_PX}). Vision model is hallucinating coords — the target is NOT on this screen. Bailing despite pixel changes.`
          );
          const coordList = sameActionGrounds.map((g) => `(${g.x},${g.y})`).join(" → ");
          await events.onError(
            `Stuck: the brain emitted "${action}" ${sameActionGrounds.length} times but the grounder pointed to wildly different spots each time (${coordList}). That means the target isn't actually on the screen — the vision model is guessing. Try a different approach: re-observe with screen_screenshot, switch to a different verb (keyboard input?), or check whether the right app / page is even foregrounded.`
          );
          return "exhausted";
        }
      }
      console.log(
        `[loop] ⚠ action "${action}" repeated ${same}/4 times but screen IS changing — not bailing (progress likely happening, coord-scatter check passed: ${sameActionGrounds.length} grounds within ${SCATTER_THRESHOLD_PX}px)`
      );
    }
    const TYPE_REPEAT_GAP = 3;
    const typedText = extractTypedText(action);
    let typeBailReason = null;
    if (typedText) {
      const norm = typedText.trim().toLowerCase();
      const seen = typedTextScreens.get(norm);
      if (seen?.has(screenHash)) {
        typeBailReason = `screen hash matches a prior attempt (${screenHash})`;
      } else if (seen && seen.size > 0) {
        const firstSeenAt = history.findIndex(
          (h) => {
            const t = extractTypedText(h);
            return t && t.trim().toLowerCase() === norm;
          }
        );
        if (firstSeenAt !== -1 && history.length - firstSeenAt >= TYPE_REPEAT_GAP) {
          typeBailReason = `same text typed ${history.length - firstSeenAt} steps ago and we're back to retry`;
        }
      }
      if (typeBailReason) {
        console.warn(
          `[loop] 🛑 type-loop: "${typedText}" — ${typeBailReason}`
        );
        await events.onError(
          `Already attempted "${typedText}" earlier — ${typeBailReason}. The field may not be accepting input — try clicking a different field first, or use 'click on the X' (vision) instead of browser.type if the ref keeps failing.`
        );
        return "exhausted";
      }
    }
    let coords = null;
    let dragTo = null;
    const drag2 = parseDragAction(action);
    if (drag2) {
      const tGround = Date.now();
      const shotB64 = shot.png.toString("base64");
      let fromTo;
      try {
        fromTo = await Promise.all([
          findCoordinates(provider, {
            instruction: drag2.from,
            screenshotB64: shotB64,
            screen: screenSize,
            signal: ctrl.signal
          }),
          findCoordinates(provider, {
            instruction: drag2.to,
            screenshotB64: shotB64,
            screen: screenSize,
            signal: ctrl.signal
          })
        ]);
      } catch (e) {
        if (cancelled()) return "cancelled";
        consecutiveProviderErrors += 1;
        if (consecutiveProviderErrors >= 3) throw e;
        const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
        console.warn(
          `[loop] ⚠ drag ground failed (${msg}) — transient ${consecutiveProviderErrors}/3, retrying next step`
        );
        const note = `[note: locating the drag endpoints failed with a transient error (${msg}) — nothing was executed; re-emit the action]`;
        history.push(note);
        opts.onHistory?.(note);
        if (await interruptiblePause(Math.max(stepPause, 1e3), cancelled))
          return "cancelled";
        continue;
      }
      consecutiveProviderErrors = 0;
      [coords, dragTo] = fromTo;
      console.log(
        `[loop] 🎯 ground/from+to concurrent (${Date.now() - tGround}ms): ${coords ? `(${coords.x}, ${coords.y})` : "FAILED"} — "${drag2.from}" → ${dragTo ? `(${dragTo.x}, ${dragTo.y})` : "FAILED"} — "${drag2.to}"`
      );
      if (coords) await events.onGround(coords);
      if (dragTo) await events.onGround(dragTo);
      if (cancelled()) return "cancelled";
    } else if (/^drag\b/i.test(action.trim())) {
      console.warn(
        `[loop] ⚠ malformed drag (no "to <target>"): ${action} — skipping grounding`
      );
    } else if (needsCoordinates(action)) {
      let lastAction = "";
      for (let h = history.length - 1; h >= 0; h--) {
        const entry = history[h];
        if (entry.startsWith("[note:")) continue;
        lastAction = entry.split("  [note:")[0] ?? "";
        break;
      }
      const isRetryOfLast = lastAction.length > 0 && normalizeAction(lastAction) === normalizeAction(action);
      if (preGroundedCoords && !isRetryOfLast) {
        coords = preGroundedCoords;
        console.log(
          `[loop] 🎯 ground skipped — combined step pre-grounded (${coords.x}, ${coords.y})`
        );
      } else {
        const tGround = Date.now();
        try {
          coords = await findCoordinates(
            provider,
            {
              instruction: action,
              screenshotB64: shot.png.toString("base64"),
              screen: screenSize,
              signal: ctrl.signal
            },
            {
              // Refine (~1px) when retrying a suspected misclick OR when
              // the planner explicitly asked for precision on a tiny
              // target ("click precisely the …").
              refine: isRetryOfLast || /^click\s+precisely\b/i.test(action)
            }
          );
          consecutiveProviderErrors = 0;
        } catch (e) {
          if (cancelled()) return "cancelled";
          consecutiveProviderErrors += 1;
          if (consecutiveProviderErrors >= 3) throw e;
          const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
          console.warn(
            `[loop] ⚠ ground call failed (${msg}) — transient ${consecutiveProviderErrors}/3, retrying next step`
          );
          const note = `[note: locating "${action.slice(0, 80)}" failed with a transient error (${msg}) — nothing was executed; re-emit the action]`;
          history.push(note);
          opts.onHistory?.(note);
          if (await interruptiblePause(Math.max(stepPause, 1e3), cancelled))
            return "cancelled";
          continue;
        }
        console.log(
          `[loop] 🎯 ground (${Date.now() - tGround}ms): ${coords ? `(${coords.x}, ${coords.y})` : "FAILED"}${isRetryOfLast ? " — refine retry (same action re-emitted)" : ""}`
        );
      }
      if (coords) {
        await events.onGround(coords);
        recentClickGrounds.push({
          action: normalizeAction(action),
          x: coords.x,
          y: coords.y
        });
        if (recentClickGrounds.length > SCATTER_WINDOW) {
          recentClickGrounds.shift();
        }
      }
      if (cancelled()) return "cancelled";
    }
    if ((shot.offsetX || shot.offsetY) && coords) {
      coords = { x: coords.x + shot.offsetX, y: coords.y + shot.offsetY };
    }
    if ((shot.offsetX || shot.offsetY) && dragTo) {
      dragTo = { x: dragTo.x + shot.offsetX, y: dragTo.y + shot.offsetY };
    }
    if (opts.targetApp && coords && process.platform === "darwin") {
      const bounds = await getMacWindowBounds(opts.targetApp);
      if (bounds) {
        const insideX = coords.x >= bounds.x && coords.x <= bounds.x + bounds.width;
        const insideY = coords.y >= bounds.y && coords.y <= bounds.y + bounds.height;
        if (!insideX || !insideY) {
          console.warn(
            `[loop] 🪟 click out of bounds: (${coords.x},${coords.y}) outside ${opts.targetApp}'s window @(${bounds.x},${bounds.y}) ${bounds.width}×${bounds.height} — refusing this click. Brain will be told to re-ground.`
          );
          const note = `[note: your last grounded click landed at (${coords.x},${coords.y}) which is OUTSIDE ${opts.targetApp}'s window @(${bounds.x},${bounds.y}) ${bounds.width}×${bounds.height}. The click was REFUSED — no action was taken. Look at the screenshot again; the button you described isn't where you thought it was. Either pick a different button OR describe its position more precisely (e.g. "the orange = button in the bottom-right corner of the keypad, in the rightmost column"). Do NOT click outside the ${opts.targetApp} window.]`;
          history.push(note);
          actionScreenHashes.push(screenHash);
          opts.onHistory?.(note);
          await events.onError(
            `Click at (${coords.x},${coords.y}) was outside ${opts.targetApp}'s window — refused. Re-grounding next step.`
          );
          prevSnapshotHash = snapHash;
          prevScreenHash = screenHash;
          if (await interruptiblePause(stepPause, cancelled)) return "cancelled";
          continue;
        }
      }
    }
    if (coords && opts.targetApp) {
      try {
        const clickX = coords.x + (shot.offsetX || 0);
        const clickY = coords.y + (shot.offsetY || 0);
        let ob = await clickObstruction(
          opts.targetApp,
          clickX,
          clickY
        );
        if (ob && (ob.coveredBy || ob.activeApp !== opts.targetApp)) {
          console.log(
            `[loop] 🪟 pre-click: ${ob.coveredBy ? `point covered by ${ob.coveredBy}` : `${opts.targetApp} not the active app (active: ${ob.activeApp})`} — re-raising before dispatch`
          );
          await raiseMacApp(opts.targetApp);
          await sleep$4(150);
          ob = await clickObstruction(opts.targetApp, clickX, clickY);
          if (ob && ob.coveredBy) {
            console.log(
              `[loop] ⚠ click point still covered by ${ob.coveredBy} after re-raise — the click may land on it`
            );
          }
        }
      } catch {
      }
    }
    const tExec = Date.now();
    let executed = null;
    let execError = null;
    consecutiveBans = 0;
    try {
      executed = await executeAction(action, coords, dragTo, browser2);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      execError = raw.split("\n")[0].slice(0, 160);
    }
    if (executed) {
      console.log(
        `[loop] ⚡ exec (${Date.now() - tExec}ms): ${executed.type} ${JSON.stringify(executed.payload)}`
      );
      await events.onAction(executed);
    } else if (execError) {
      console.warn(
        `[loop] ⚠ exec failed (${Date.now() - tExec}ms): ${execError}`
      );
      await events.onError(`Action failed: ${action} — ${execError}`);
    } else {
      console.warn(
        `[loop] ⚠ no executor matched action="${action}" coords=${coords ? `(${coords.x},${coords.y})` : "null"}`
      );
      await events.onStatus(`Skipped (no executor): ${action}`);
      if (/^browser\.(click|type|scroll)\b/i.test(action.trim())) {
        execError = "invalid ref — browser.click/type/scroll take ONLY an e<N> ref from the snapshot (e.g. browser.click e12), never a name. Find the element's [eN] in the snapshot, or use a vision click: click <visual description>";
      }
    }
    const readContent = executed?.type === "browser_read" && typeof executed.payload.text === "string" ? executed.payload.text : null;
    if (readContent !== null) {
      lastReadContent = readContent;
    } else if (executed && executed.type !== "note") {
      lastReadContent = null;
    }
    if (executed?.type === "browser_type" && browserSnapshot) {
      lastTypedUrl = browserSnapshot.url;
    }
    if (executed?.type === "browser_type" || executed?.type === "type") {
      editActions += 1;
    }
    const historyEntry = execError ? `${action}  [note: failed — ${execError}]` : readContent !== null ? `${action}  [page content: ${readContent.slice(0, 3e3).replace(/\s+/g, " ").trim()}${readContent.length > 3e3 ? " …(truncated)" : ""}]` : action;
    history.push(historyEntry);
    actionScreenHashes.push(screenHash);
    opts.onHistory?.(historyEntry);
    onStep?.();
    if (typedText && executed) {
      const norm = typedText.trim().toLowerCase();
      const set = typedTextScreens.get(norm) ?? /* @__PURE__ */ new Set();
      set.add(screenHash);
      typedTextScreens.set(norm, set);
    }
    const wasType = executed?.type === "type" || executed?.type === "browser_type";
    const prevWasSpotlight = prevExecuted?.type === "key" && /cmd\+space/i.test(JSON.stringify(prevExecuted.payload ?? {}));
    const isSpotlightLaunch = prevWasSpotlight && wasType && /thenpress["\s:]+["']?enter/i.test(
      JSON.stringify(executed?.payload ?? {})
    );
    const isAppLaunch = isSpotlightLaunch || executed?.type === "open_app";
    const settleMs = isAppLaunch ? SPOTLIGHT_LAUNCH_SETTLE_MS : wasType ? POST_TYPE_SETTLE_MS : PREFETCH_SETTLE_MS;
    if (isAppLaunch) {
      console.log(
        `[loop] 🚀 app launch detected (${executed?.type === "open_app" ? "open app" : "cmd+space → type+enter"}); settling ${SPOTLIGHT_LAUNCH_SETTLE_MS}ms before next snapshot`
      );
    }
    if (executed) {
      prevExecuted = executed;
    }
    const effectivePause = usedRouter ? settleMs : Math.max(stepPause, settleMs);
    if (cancelled()) return "cancelled";
    if (effectivePause > settleMs) {
      await sleep$4(settleMs);
      if (cancelled()) return "cancelled";
      prefetched = screenshot();
      prefetched.catch(() => {
      });
      const remaining = effectivePause - settleMs;
      if (await interruptiblePause(remaining, cancelled)) return "cancelled";
    } else {
      await sleep$4(settleMs);
      if (cancelled()) return "cancelled";
      prefetched = screenshot();
      prefetched.catch(() => {
      });
    }
  }
  console.log(`[loop] 🛑 exhausted ${maxSteps} steps without DONE`);
  return "exhausted";
}
async function interruptiblePause(ms, cancelled) {
  const tick = 100;
  let elapsed = 0;
  while (elapsed < ms) {
    if (cancelled()) return true;
    const wait = Math.min(tick, ms - elapsed);
    await new Promise((r) => setTimeout(r, wait));
    elapsed += wait;
  }
  return cancelled();
}
async function executeAction(action, coords, dragTo = null, browser2 = null) {
  const a = action.trim();
  if (/^browser\./i.test(a)) {
    if (!browser2) return null;
    const parsed = parseBrowserAction(a);
    if (!parsed) return null;
    switch (parsed.kind) {
      case "navigate":
        await browser2.navigate(parsed.url);
        return { type: "browser_navigate", payload: { url: parsed.url } };
      case "click":
        await browser2.click(parsed.ref);
        return { type: "browser_click", payload: { ref: parsed.ref } };
      case "type":
        await browser2.type(parsed.ref, parsed.text, { submit: parsed.submit });
        return {
          type: "browser_type",
          payload: parsed.submit ? { ref: parsed.ref, text: parsed.text, submit: true } : { ref: parsed.ref, text: parsed.text }
        };
      case "scroll_page":
        await browser2.scrollPage(parsed.dir, parsed.amount);
        return {
          type: "browser_scroll_page",
          payload: { dir: parsed.dir, amount: parsed.amount ?? 800 }
        };
      case "scroll_element":
        await browser2.scrollElement(parsed.ref, parsed.dir, parsed.amount);
        return {
          type: "browser_scroll_element",
          payload: { ref: parsed.ref, dir: parsed.dir, amount: parsed.amount ?? 600 }
        };
      case "read": {
        const text = await browser2.readText(parsed.ref);
        return {
          type: "browser_read",
          payload: parsed.ref ? { ref: parsed.ref, text } : { text }
        };
      }
    }
  }
  if (/^drag\b/i.test(a)) {
    const parsed = parseDragAction(a);
    if (!parsed || !coords || !dragTo) {
      return null;
    }
    await drag(coords.x, coords.y, dragTo.x, dragTo.y);
    return {
      type: "drag",
      payload: { from: { x: coords.x, y: coords.y }, to: { x: dragTo.x, y: dragTo.y } }
    };
  }
  const openApp = a.match(/^open\s+app\s+["“']?([^"”']+?)["”']?\s*$/i);
  if (openApp) {
    const appName = openApp[1].trim();
    const ok = await raiseMacApp(appName);
    if (!ok) throw new Error(`could not launch/activate "${appName}"`);
    return { type: "open_app", payload: { app: appName } };
  }
  const waitMatch = a.match(/^wait(?:\s+(\d+(?:\.\d+)?)\s*(ms|s)?)?/i);
  if (waitMatch) {
    const n = waitMatch[1] ? parseFloat(waitMatch[1]) : 1;
    const unit = (waitMatch[2] ?? "s").toLowerCase();
    const ms = unit === "ms" ? n : n * 1e3;
    await sleep$4(ms);
    return { type: "wait", payload: { ms } };
  }
  const typed = parseTypeAction(a);
  if (typed) {
    if (!typed.thenPress && /^https?:\/\//i.test(typed.text)) {
      typed.thenPress = "enter";
      console.log(
        `[loop] ⌨️  auto-composed thenPress:"enter" — typed text starts with http(s):// (URL navigation pattern; brain often forgets to submit)`
      );
    }
    const segments = expandTypeEscapes(typed.text);
    if (segments.length > 1) {
      console.log(
        `[loop] ⌨️  type-with-escapes: expanded ${segments.length} segments from "${typed.text.length > 80 ? typed.text.slice(0, 77) + "..." : typed.text}"`
      );
    }
    for (const seg of segments) {
      if (seg.kind === "text") {
        await typeText(seg.value);
      } else {
        await sleep$4(80);
        await pressCombo(seg.value);
      }
    }
    if (typed.thenPress) {
      await sleep$4(120);
      await pressCombo(typed.thenPress);
    }
    return {
      type: "type",
      payload: typed.thenPress ? { text: typed.text, thenPress: typed.thenPress } : { text: typed.text }
    };
  }
  const pressMatch = a.match(/^(?:press|hotkey)\s+(.+?)(?:\s*[\.\)\}]?)?$/i);
  const noteMatch = a.match(/^note\s+["'“](.+?)["'”]\s*$/is) ?? a.match(/^note\s+(.+)$/is);
  if (noteMatch) {
    return { type: "note", payload: { text: noteMatch[1].trim() } };
  }
  const pressRepeatMatch = a.match(
    /^press\s+(.+?)\s+(\d{1,2})\s+times?\s*$/i
  );
  if (pressRepeatMatch) {
    const combo = pressRepeatMatch[1].trim().replace(/^["'`]|["'`]$/g, "");
    const count = Math.min(20, Math.max(1, parseInt(pressRepeatMatch[2], 10)));
    for (let i = 0; i < count; i++) {
      await pressCombo(combo);
      await sleep$4(120);
    }
    return { type: "key", payload: { combo, times: count } };
  }
  if (pressMatch) {
    const combo = pressMatch[1].trim().replace(/^["'`]|["'`]$/g, "");
    await pressCombo(combo);
    return { type: "key", payload: { combo } };
  }
  const SCROLL_FLOOR = 50;
  const scrollAtMatch = a.match(
    /^scroll\s+(up|down)(?:\s+(\d+))?\s+(?:at|in|on)\s+/i
  );
  if (scrollAtMatch && coords) {
    const dir = scrollAtMatch[1].toLowerCase() === "up" ? 1 : -1;
    const amount = Math.max(
      SCROLL_FLOOR,
      scrollAtMatch[2] ? parseInt(scrollAtMatch[2], 10) : SCROLL_FLOOR
    );
    await hover(coords.x, coords.y);
    await sleep$4(120);
    await scroll(dir * amount);
    return {
      type: "scroll",
      payload: { direction: scrollAtMatch[1], amount, at: { ...coords } }
    };
  }
  const scrollMatch = a.match(/^scroll\s+(up|down)(?:\s+(\d+))?/i);
  if (scrollMatch) {
    const dirWord = scrollMatch[1].toLowerCase();
    const dir = dirWord === "up" ? 1 : -1;
    const requested = scrollMatch[2] ? parseInt(scrollMatch[2], 10) : SCROLL_FLOOR;
    const amount = requested === 0 ? 0 : Math.max(SCROLL_FLOOR, requested);
    if (browser2 && await browser2.available().catch(() => false)) {
      try {
        await browser2.scrollPage(dirWord);
        return {
          type: "browser_scroll_page",
          payload: { dir: dirWord, amount: 800, via: "scroll" }
        };
      } catch (e) {
        console.warn(
          `[loop] browser.scrollPage failed (${e instanceof Error ? e.message : String(e)}) — falling back to nut-js`
        );
      }
    }
    await scroll(dir * amount);
    return { type: "scroll", payload: { direction: scrollMatch[1], amount } };
  }
  if (/^hover\b/i.test(a) && coords) {
    await hover(coords.x, coords.y);
    return { type: "hover", payload: { ...coords } };
  }
  const modClickMatch = a.match(
    /^(cmd|command|shift|alt|option|ctrl|control)[\s_-]*click\b/i
  );
  if (modClickMatch && coords) {
    const raw = modClickMatch[1].toLowerCase();
    const mod = raw === "command" ? "cmd" : raw === "option" ? "alt" : raw === "control" ? "ctrl" : raw;
    await click(coords.x, coords.y, { modifiers: [mod] });
    return { type: "click", payload: { ...coords, modifier: mod } };
  }
  if (/^double[\s_-]*click/i.test(a) && coords) {
    await click(coords.x, coords.y, { double: true });
    return { type: "double_click", payload: { ...coords } };
  }
  if (/^triple[\s_-]*click/i.test(a) && coords) {
    await click(coords.x, coords.y, { triple: true });
    return { type: "triple_click", payload: { ...coords } };
  }
  if (/^(?:right[\s_-]*click|secondary[\s_-]*click)/i.test(a) && coords) {
    await click(coords.x, coords.y, { button: "right" });
    return { type: "right_click", payload: { ...coords } };
  }
  if (coords) {
    const promoteForFocus = process.env.HOLO3_FIELD_DOUBLE_CLICK !== "false" && looksLikeFieldTarget(a);
    if (promoteForFocus) {
      console.log(`[loop] 🎯 promoting click→dbl-click for focus: "${a}"`);
      await click(coords.x, coords.y, { double: true });
      return {
        type: "click",
        payload: { ...coords, doubleForFocus: true }
      };
    }
    await click(coords.x, coords.y);
    return { type: "click", payload: { ...coords } };
  }
  return null;
}
function looksLikeFieldTarget(action) {
  const a = action.toLowerCase();
  if (/\b(?:title|menu|tool|tab|scroll|status|task|side|nav)\s*bar\b/.test(a)) {
    return false;
  }
  return /\b(?:search\s+(?:bar|box|field)|address\s+bar|url\s+bar|location\s+bar|omnibox|textarea|textbox|textfield|text\s+(?:area|box|field)|input\s+(?:field|box)|(?:email|password|username|chat|message|comment|reply)\s+(?:field|input|box)|form\s+(?:field|input)|(?:title|name|first\s+name|last\s+name|subject)\s+(?:field|input))\b/.test(
    a
  );
}
function expandTypeEscapes(text) {
  const out = [];
  let buf = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\" && i + 1 < text.length) {
      const next = text[i + 1];
      if (next === "t" || next === "n") {
        if (buf) {
          out.push({ kind: "text", value: buf });
          buf = "";
        }
        out.push({ kind: "key", value: next === "t" ? "tab" : "enter" });
        i++;
        continue;
      }
    }
    buf += text[i];
  }
  if (buf) out.push({ kind: "text", value: buf });
  if (out.length === 0) out.push({ kind: "text", value: "" });
  return out;
}
function parseTypeAction(raw) {
  if (!/^type\b/i.test(raw)) return null;
  const jsonStyle = raw.match(
    /^type\s*\(?\s*\{\s*["']?text["']?\s*:\s*["'](?<text>[^"']*)["']\s*\}\s*\)?\s*(?:\s*,?\s*(?:and|then)\s+press\s+(?<key>[\w+\.\-]+))?/i
  );
  if (jsonStyle?.groups?.text !== void 0) {
    return {
      text: jsonStyle.groups.text,
      thenPress: jsonStyle.groups.key
    };
  }
  const quoted = raw.match(
    /^type\s+["“'](?<text>[^"”']*)["”']\s*(?:(?:and|then)\s+press\s+(?<key>[\w+\.\-]+))?/i
  );
  if (quoted?.groups?.text !== void 0) {
    return {
      text: quoted.groups.text,
      thenPress: quoted.groups.key
    };
  }
  const bare = raw.match(
    /^type\s+(?<text>.+?)(?:\s+(?:and|then)\s+press\s+(?<key>[\w+\.\-]+))?\s*$/i
  );
  if (bare?.groups?.text) {
    let text = bare.groups.text.trim();
    text = text.replace(/^[\(\[\{]+|[\)\]\}]+$/g, "").trim();
    text = text.replace(/^["'“”]+|["'“”]+$/g, "").trim();
    if (!text) return null;
    return { text, thenPress: bare.groups.key };
  }
  return null;
}
function extractTypedText(action) {
  const t = parseTypeAction(action);
  if (t) return t.text;
  const b = parseBrowserAction(action);
  if (b?.kind === "type") return b.text;
  return null;
}
const SYSTEM_PROMPT = `You are the closing voice of a computer-use agent. The agent just FINISHED a task — your job is the POST-MORTEM, not a re-statement of the request.

HARD RULE — NEVER restate, paraphrase, or re-plan the original request. The user already typed it; they don't need to hear it back. Skip phrases like "I will…", "Let me…", "I'm going to…", "First I'll…", or any forward-looking plan. Your reply describes what HAPPENED, in past tense, and what was FOUND.

Three cases — pick exactly one and write the reply for it:

A. INFORMATIONAL request was answered (the user asked for items / prices / facts and the page text contains them):
   • Lead with the answer. First sentence is the headline ("Found 3 listings under $3000:").
   • Then a hyphen-bulleted list pulled from the PAGE TEXT — title, price, location, link if you have one. Up to 12 items.
   • If you have fewer items than asked, say so in the headline ("Found 2 of the 3 you wanted because…").

B. PROCEDURAL task succeeded (the user asked you to navigate / configure / click and the action history confirms it):
   • One short past-tense sentence: "Opened Marketplace and applied the Marietta + $2.5k–$3k filters."
   • No list needed unless the user asked you to verify multiple things.

C. RUN STOPPED early (outcome is exhausted / cancelled / error, OR the page text doesn't contain the answer):
   • Lead with what blocked you in past tense: "Got stuck on the location filter — Apply stayed disabled because the dropdown suggestion didn't render in time."
   • Then describe what's visibly on the page right now (1 sentence).
   • Then ONE concrete suggestion the user can try: "Try the same prompt again — Marketplace's autocomplete is sometimes laggy on first load." Don't suggest more than one.
   • If the failure-annotated history shows clicked-disabled / overlay-intercepted / ref-vanished events, mention them — they're the diagnostic.

Format:
- Plain text. No markdown headers, no asterisks, no code blocks, no emojis, no outer quotes.
- Hyphen bullets for lists.
- Speak as the agent in first person past tense ("I found…", "I tried…"). Never "the agent…".
- Procedural confirmations: 1–2 sentences. Informational answers: headline + up to 12 bullets. Failure post-mortems: 2–4 sentences total.
- Source the bullets from PAGE TEXT (the actual copy on the page), not from the action history. The action history is for diagnosing failure, not for listing results.

If you catch yourself starting with "I will" / "Let me" / "First, I'll" — STOP. Rewrite in past tense.`;
function templatedFallback(args) {
  const recent = args.history.filter((h) => h !== "(empty)").slice(-5);
  const lastAction = recent.at(-1);
  if (args.outcome === "exhausted") {
    return `I got stuck before finishing "${args.task}". Last thing I tried was: ${lastAction ?? "(no actions)"}. Try again with a more specific prompt.`;
  }
  if (args.outcome === "cancelled") {
    return `Stopped "${args.task}" mid-run.`;
  }
  if (args.outcome === "error") {
    return `Hit an error working on "${args.task}". The action history was: ${recent.join(" → ") || "(none)"}.`;
  }
  return `Done — ${recent.join(" → ") || "no actions recorded"}.`;
}
function buildUserMessage(args, cfg) {
  const recent = args.history.slice(-cfg.historyLimit);
  const historyBlock = recent.length === 0 ? "(no actions recorded)" : recent.map((h, i) => `${i + 1}. ${h}`).join("\n");
  let pageTextBlock = "";
  if (args.pageText && args.pageText.trim()) {
    const text = args.pageText.trim();
    const cap = Math.max(cfg.snapshotLimit, 3e4);
    const trimmed = text.length > cap ? text.slice(0, cap) + "\n…(truncated)" : text;
    pageTextBlock = `
PAGE TEXT (final, this is your source for listings/prices/facts):
${trimmed}
`;
  }
  let snapshotBlock = "";
  if (args.browserSnapshot) {
    const ax = args.browserSnapshot.ax;
    const trimmed = ax.length > cfg.snapshotLimit ? ax.slice(0, cfg.snapshotLimit) + "\n…(truncated)" : ax;
    snapshotBlock = `
Final page: ${args.browserSnapshot.title} (${args.browserSnapshot.url})
Interactive elements still on screen:
${trimmed}
`;
  }
  const outcomeLabel = args.outcome === "done" ? "OUTCOME: done — the run completed normally." : args.outcome === "cancelled" ? "OUTCOME: cancelled — the user stopped the run mid-flight. Describe the partial state." : args.outcome === "exhausted" ? "OUTCOME: exhausted — the run hit the step budget before finishing. Diagnose what blocked it from the failure-annotated history (look for `(failed: ...)` and `(rejected: ...)` entries)." : "OUTCOME: error — something threw during the run. Best-effort summary, mention the error if visible in history.";
  return `${outcomeLabel}
` + pageTextBlock + snapshotBlock + `
What the agent actually did (most recent ${recent.length} of ${args.history.length} actions; entries with "(failed: …)" / "(rejected: …)" are diagnostic):
${historyBlock}

--- context only, do NOT restate ---
Original task the user typed: ${args.task}

Write the post-mortem reply now. Past tense. No plan, no "I will". If informational, lead with the answer; if procedural, confirm what was done; if stuck, diagnose + one suggestion.`;
}
function stripThink$1(text) {
  let out = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const open = out.indexOf("<think>");
  if (open !== -1) out = out.slice(0, open);
  return out.replace(/^\s*<\/think>\s*/i, "").trim().replace(/^["'“]+|["'”]+$/g, "").trim();
}
function createExtractor(provider, cfg = {}) {
  const historyLimit = cfg.historyLimit ?? 30;
  const snapshotLimit = cfg.snapshotLimit ?? 3e4;
  const ollama$1 = new ollama.Ollama({
    host: cfg.ollamaHost ?? process.env.EXTRACTOR_HOST ?? process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434"
  });
  const ollamaModel = cfg.ollamaModel ?? process.env.EXTRACTOR_MODEL ?? process.env.NARRATOR_MODEL ?? "qwen3.5:0.8b";
  const ollamaTimeoutMs = cfg.ollamaTimeoutMs ?? Number(process.env.EXTRACTOR_TIMEOUT_MS ?? 3e4);
  async function tryOllama(args) {
    const userMsg = buildUserMessage(args, { historyLimit, snapshotLimit });
    try {
      const result = await Promise.race([
        ollama$1.chat({
          model: ollamaModel,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMsg }
          ],
          // think: false — disable Qwen3 reasoning at the API level. The
          // closer was producing empty / cut-off replies because the
          // <think> block burned the full num_predict budget before any
          // visible content emerged (same root cause as the router
          // empty-response bug, fixed there in the previous patch). With
          // reasoning off, the post-mortem text comes out cleanly and we
          // can keep num_predict at 512 for proper list-style answers.
          think: false,
          // Higher temperature than the router because we want a
          // conversational tone, not a one-line decision.
          options: { temperature: 0.5, num_predict: 512 }
        }),
        new Promise(
          (_, rej) => setTimeout(
            () => rej(new Error("extractor (ollama) timeout")),
            ollamaTimeoutMs
          )
        )
      ]);
      const raw = result.message.content;
      const cleaned = stripThink$1(raw);
      console.log(
        `[extract] ollama (${ollamaModel}) → ${cleaned.length}b`
      );
      return cleaned || null;
    } catch (e) {
      console.warn(
        `[extract] ollama failed (${e instanceof Error ? e.message : String(e)}) — trying fallback`
      );
      return null;
    }
  }
  async function tryProvider(args) {
    if (!provider) return null;
    const userMsg = buildUserMessage(args, { historyLimit, snapshotLimit });
    try {
      const result = await provider.plan({
        task: SYSTEM_PROMPT + "\n\n---\n\n" + userMsg,
        history: [],
        screenshotB64: args.lastScreenshotB64,
        screen: [0, 0],
        signal: args.signal
      });
      const text = result.action.trim();
      console.log(`[extract] provider(${provider.name}) → ${text.length}b`);
      return text || null;
    } catch (e) {
      console.warn(
        `[extract] provider failed (${e instanceof Error ? e.message : String(e)})`
      );
      return null;
    }
  }
  return {
    async extract(args) {
      const order = provider?.name === "composite" ? [tryProvider, tryOllama] : [tryOllama, tryProvider];
      for (const transport of order) {
        const answer = await transport(args);
        if (answer) return answer;
      }
      console.warn("[extract] both LLM paths failed — using templated fallback");
      return templatedFallback(args);
    }
  };
}
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const GEMINI_OPENAI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
function plannerConfigFromEnv() {
  if ((process.env.PONDER_PLANNER ?? "").toLowerCase() === "off") return null;
  const orKey = process.env.OPENROUTER_API_KEY;
  const gemKey = process.env.GEMINI_API_KEY;
  const genericKey = process.env.PLANNER_API_KEY;
  const genericBase = process.env.PLANNER_API_BASE;
  const generic = genericKey && genericBase ? {
    apiKey: genericKey,
    apiBase: genericBase.replace(/\/+$/, ""),
    model: process.env.PLANNER_MODEL ?? "deepseek/deepseek-chat"
  } : null;
  let vision = orKey ? { apiKey: orKey, apiBase: OPENROUTER_BASE, model: process.env.PLANNER_VISION_MODEL ?? "google/gemini-2.5-flash" } : gemKey ? { apiKey: gemKey, apiBase: GEMINI_OPENAI_BASE, model: process.env.PLANNER_VISION_MODEL ?? "gemini-2.5-flash" } : null;
  let text = orKey ? { apiKey: orKey, apiBase: OPENROUTER_BASE, model: process.env.PLANNER_TEXT_MODEL ?? "deepseek/deepseek-v4-flash" } : null;
  text ??= generic;
  vision ??= generic;
  text ??= vision;
  vision ??= text;
  if (!text || !vision) return null;
  if (!orKey && !generic) {
    console.warn(
      `[planner] OPENROUTER_API_KEY not set — text + vision both fall back to ${vision.model}. Set OPENROUTER_API_KEY to use DeepSeek for text-only steps.`
    );
  }
  return {
    text,
    vision,
    visionDisabled: (process.env.PLANNER_VISION ?? "on").toLowerCase() === "off"
  };
}
const PLANNER_SYSTEM = `You are the planner of a computer-use agent driving a real macOS desktop and a real Chrome browser, one step at a time. Each turn you get the task, recent action history, and the current state (screenshot and/or a Chrome accessibility snapshot with [eN] element refs).

Reply with EXACTLY ONE action line — no prose, no markdown, no quotes around the whole line, no numbering. Allowed actions:
  click <visual description of the target>
  click precisely <description>   (tiny/dense targets — slower, sub-pixel grounding)
  double click <description>
  right click <description>
  cmd click <description>    (open-in-new-tab / add item to a multi-selection)
  shift click <description>  (range select)
  hover <description>        (move pointer WITHOUT clicking — hover menus, tooltips, reveal-on-hover buttons)
  type "text"            (types into whatever has keyboard focus — the ONLY way to type into OS UI: launchers, native dialogs, menus; append: and press enter)
  press KEY              (enter, esc, tab, …)
  press KEY N times      (e.g. press tab 3 times — form navigation in one step)
  hotkey KEY+KEY         (cmd+l, cmd+tab, … — note: cmd+space opens the system launcher, which is Spotlight on some Macs and Raycast on others; both launch apps the same way, but PREFER open app below)
  open app "Name"        (launch or foreground a macOS app directly — use this instead of cmd+space)
  drag <source description> to <target description>
  scroll up | scroll down
  scroll down at <description>   (aim the wheel at a SPECIFIC pane/sidebar/list; also: scroll up at …)
  wait Ns
  note "text"            (record COMPLETED progress only — "done 2 of 5: …". NOT for restating the task or narrating a plan; if you would write "the task is…/I need to…/I will…", do the action instead)
  browser.navigate <url>
  browser.click e<N>
  browser.type e<N> "text"      (optionally: and press enter — the e<N> ref is REQUIRED; browser.type with no ref is REJECTED. For OS-level typing use plain: type "text")
  browser.read
  browser.scroll page down | browser.scroll page up
  browser.scroll e<N> down | browser.scroll e<N> up   (scroll a SPECIFIC element's container — nested lists/sidebars where page scroll has no effect)
  DONE                   (the task's goal is VISIBLY achieved in the current state)
  INFEASIBLE: <reason>   (a concrete blocker makes the task impossible)

Long tasks (multiple items or phases): your action history is your only memory and it is long and lossy. Use note "…" to record durable state at every milestone — which items are DONE, which item you are ON, what remains, and facts you extracted (note "edited 2 of 5 listings: Blue Lamp, Red Chair done; next: Desk Fan"). Write a note after finishing EACH item, before starting the next. When unsure where you are, trust your latest note over re-deriving from the screen.

WORKING THROUGH A LIST ("do X to each / all of …"): you drive the iteration yourself — there is no outer loop doing it for you. FIRST check your history:
- Is there ALREADY a [page content: …] entry? Then step 1 is DONE — SKIP straight to step 2 and OPEN an item. Do NOT browser.read again.
- No [page content: …] yet? Do step 1 once.
The pattern:
1. browser.read the list page ONCE. The [page content: …] it produces is a FULL scrape — EVERY item (even off-screen), each with its attributes (status, date, view/click counts, price) and OFTEN a direct URL (".../edit/?listing_id=123" or a "Continue" link). That scrape is your worklist; act from it, don't click around to re-discover what it already shows. If the task filters by a CRITERION (slow-moving, unsold, older than X, low engagement), pick which items qualify by READING those attributes (e.g. still-listed + low clicks ⇒ slow-moving) and act on those; if it says each/all with no filter, every item qualifies. If nothing matches perfectly, act on the closest editable candidates rather than giving up.
2. Pick the FIRST unprocessed item from the worklist and OPEN it THIS step. Choose the open method in this order:
   a. If the read text shows a DIRECT edit/detail URL for it (e.g. ".../edit/?listing_id=123" or a "Continue" link) → browser.navigate to that URL. This is the most reliable — always prefer it.
   b. Else browser.click the item's own [eN] (its title link).
   c. Else if it only has a "More options" / "…" button → browser.click that ref ONCE. A MENU then appears in the NEXT snapshot (e.g. [eN] menuitem "Edit listing"); your next action is browser.click that "Edit listing" menuitem — do NOT click the "More options" button again (that just CLOSES the menu), and do NOT open "View listing" / the public item page (".../marketplace/item/…") — that is a DEAD END you cannot edit from.
   Always use browser.click <eN> with the ref from the snapshot — NOT a vision "click <description>" (vision is the slow fallback for when no ref exists). "read again" / "navigate to the list page again" / "scroll" are NOT opening an item — never choose those when a [page content: …] is already in history.
3. On the item's edit page, make the change AND submit in ONE action: browser.type <field eN> "new value" and press enter. Typing is REQUIRED before saving — NEVER click a Save button before you have typed THIS item's change (clicking Save on an unchanged form does nothing). If pressing enter does not save, THEN browser.click the Save ref. You start fresh on every item: the fact that you typed/saved a PREVIOUS item does not mean this one is done.
4. note "done N of M: <item name>; next: <item>" — then go back and OPEN the next item.
5. Repeat until every item is processed. Emit DONE only when your notes show all M items handled — and M is the FULL count from step 1, not just the easy ones. Before DONE, check: did you process the harder items (Sold / menu-only) too? If any remain, go do them via their More-options menu.

MODALITY ARBITRATION — you have two senses (the SCREENSHOT pixels and the page SNAPSHOT text) and two hands (browser.* DOM actions and vision actions). Use them to cover for each other:
- To EXTRACT information from a web page, use browser.read — the page's text will appear in your history as [page content: …]; read it there and act on it (often the task is DONE right after).
- browser.* works even when the controlled tab is NOT the visible tab; vision actions work on anything actually visible (native apps, dialogs, canvas, other windows).
- If a browser.* action fails or changes nothing twice → do the SAME thing with vision: click <description of what you SEE>.
- If a vision action misses or changes nothing twice → find the target's [eN] in the snapshot, or navigate directly by URL.
- If the screenshot and the snapshot disagree (they show different pages), the snapshot is the truth about the CONTROLLED tab; the screenshot is the truth about what is physically on screen (OS dialogs, overlays, other windows). Pick the hand that matches the surface you need to touch.

Anti-stall discipline:
- A note is NOT progress and NOT thinking-out-loud. NEVER narrate your plan or restate the task in a note ("the task is…", "I need to…", "I will…", "the page shows…"). If you can describe what you're about to do, just DO it this turn. A note is allowed ONLY to record a COMPLETED milestone ("done 2 of 5: Blue Lamp saved").
- When a [page content: …] entry is already in your history, the page is read — your action this turn MUST be a concrete browser.* / click action (open an item, type, save), never a note and never another read.
- [note: …] entries in the history are SYSTEM observations addressed to YOU — never repeat, quote, or paraphrase one as your action.
- If a scroll changes nothing twice in a row, STOP scrolling: either the content is fully loaded (act on what's visible) or the list is a nested scroll container (use: scroll down at <description of the list>).
- Prefer ACTING on currently-visible items over exhaustively revealing all items first — process visible items, then scroll for more.
- If the history says an action failed or changed nothing, do something DIFFERENT — a different element, a more specific URL, a keyboard path, or a vision click on what you can see.
- DON'T RE-GATHER WHAT YOU HAVE. Two hard rules:
  • If your history already contains a [page content: …] entry, you have ALREADY read this page — do NOT browser.read again. Your next action MUST act on what you read: OPEN the first unprocessed item (browser.navigate to its edit/detail URL if the page text shows one — e.g. ".../edit/?listing_id=…" — otherwise browser.click the item's [eN] ref or its "More options"/"Edit" control).
  • If the snapshot URL already matches where you were about to browser.navigate, you are ALREADY there — do NOT navigate to it. Move to the next sub-goal: read the page ONCE if you haven't, otherwise open a specific item.

Rules:
- NEVER interact with the agent's OWN control window — an Electron app showing provider buttons ("Modal", "H Company", "Local") and "Sessions"/"Automations" tabs. That is YOUR user interface, not the task's target. If it is what's on screen, your first move is to reach the task's real target (browser.navigate for websites, open app "Name" for native apps).
- When a [CHROME ACTIVE] snapshot is present, the browser is ALREADY connected and controllable: web goals NEVER need cmd+space, launching Chrome, or any app switching — go straight to browser.navigate <url>. Launch apps only for goals that genuinely live OUTSIDE the browser.
- When a [CHROME ACTIVE] snapshot is present, PREFER browser.* actions — they are precise and fast. Use the [eN] refs from the snapshot, never invented ones. browser.click/type/scroll take ONLY an e<N> ref — NEVER a name or label; if you don't know the ref, use a vision click (click <description>) instead.
- TO FILL A FORM FIELD (textbox / textarea / input shown in the snapshot), use browser.type <its eN> "text" DIRECTLY — it focuses and types in one step. Do NOT click the field first, and do NOT vision-click it. To submit, add "and press enter" or browser.click the Save/Submit ref.
- For navigation, construct the most specific URL you can instead of clicking through menus.
- Vision "click <description>" actions are grounded by a separate vision model: describe the target the way it LOOKS on screen ("the orange = button in the bottom-right of the keypad"), specific enough to be unambiguous.
- Check the history: if your previous action failed or changed nothing, do something DIFFERENT — a different element, a more specific URL, or a keyboard path.
- Emit DONE only when the CURRENT state shows the goal is met. Emit it promptly when it is — do not keep acting after success.
- One physical action per reply. Never chain.`;
function createCompositeProvider(executor, cfg) {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  const HISTORY_CAP = 30;
  async function plan(args) {
    const isMeta = args.task.includes("VERIFICATION CHECK") || args.task.startsWith("PLANNING REQUEST") || args.task.startsWith("You are the closing voice");
    const systemPrompt = isMeta ? "You are a precise component inside a computer-use agent. Follow the output contract stated in the user message EXACTLY — no extra prose, no markdown." : PLANNER_SYSTEM;
    const tail = args.history.slice(-HISTORY_CAP);
    const historyBlock = tail.length > 0 ? (args.history.length > HISTORY_CAP ? `(${args.history.length - HISTORY_CAP} earlier actions omitted)
` : "") + tail.map((h) => `- ${h}`).join("\n") : "(none)";
    const userText = `${args.task}

Screen: ${args.screen[0]}x${args.screen[1]}
Action history (oldest first, most recent last):
${historyBlock}

What is the single next action?`;
    const hasImage = args.screenshotB64.length > 0 && !cfg.visionDisabled;
    const domContext = /\bCHROME ACTIVE\b/.test(args.task) || /\[page content/.test(args.task);
    const attachImage = hasImage && (isMeta ? true : !domContext);
    const endpoint = attachImage ? cfg.vision : cfg.text;
    const url = `${endpoint.apiBase}/chat/completions`;
    const content = attachImage ? [
      { type: "text", text: userText },
      {
        type: "image_url",
        image_url: { url: `data:image/png;base64,${args.screenshotB64}` }
      }
    ] : userText;
    const t0 = Date.now();
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${endpoint.apiKey}`,
        // OpenRouter likes these attribution headers (harmless elsewhere).
        ...endpoint.apiBase.includes("openrouter.ai") ? { "HTTP-Referer": "https://holo.company", "X-Title": "holo3-agent" } : {}
      },
      body: JSON.stringify({
        model: endpoint.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content }
        ],
        temperature: 0.2,
        // Meta prompts (decompose) can legitimately return a multi-line
        // JSON array; action prompts never need more than one line.
        max_tokens: isMeta ? 800 : 300
      }),
      signal: args.signal
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `planner ${endpoint.model} ${res.status}: ${body.slice(0, 300)}`
      );
    }
    const out = await res.json();
    let raw = out.choices?.[0]?.message?.content ?? "";
    raw = raw.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^[\s\S]*<\/think>/, "");
    let action = isMeta ? raw.trim() : raw.split("\n").map(
      (l) => l.trim().replace(/^[`*">-]+\s*/, "").replace(/`+$/, "")
    ).find((l) => l.length > 0) ?? "";
    if (!isMeta) {
      const noteWrap = action.match(/^\[note:\s*([\s\S]+?)\]?\s*$/i);
      if (noteWrap) {
        action = `note "${noteWrap[1].trim().replace(/"/g, "'").slice(0, 300)}"`;
      }
    }
    console.log(
      `[planner] ${endpoint.model} ${attachImage ? "[vision]" : "[text]"} (${Date.now() - t0}ms) → ${action.slice(0, 120)}`
    );
    if (!action) {
      throw new Error(`planner ${endpoint.model} returned an empty action`);
    }
    return { action, usage: out.usage };
  }
  const composite = {
    name: "composite",
    warm: () => executor.warm(),
    // Self-healing: a planner failure (rate limit, network, empty
    // reply) hands the step to the executor's own plan() — exactly the
    // pre-composite behavior — instead of erroring the loop.
    plan: async (args) => {
      try {
        return await plan(args);
      } catch (e) {
        if (args.signal?.aborted) throw e;
        console.warn(
          `[planner] ${cfg.text.model}/${cfg.vision.model} failed (${e instanceof Error ? e.message.split("\n")[0] : String(e)}) — falling back to ${executor.name}.plan for this step`
        );
        return executor.plan(args);
      }
    },
    ground: (args) => executor.ground(args)
    // step intentionally omitted — composite wants the split path.
  };
  if (typeof executor.groundBatch === "function") {
    composite.groundBatch = executor.groundBatch.bind(executor);
  }
  return composite;
}
const SYSTEM = `You extract structured tabular data from web page text.
Return ONLY a JSON object of the form {"headers": string[], "rows": string[][]}.
Rules:
- Each row is one record from the page (a listing, product, search result, comment, etc.).
- Use ONLY values actually present in the page text. NEVER invent, guess, or estimate.
- If a value is missing for a row, use an empty string "".
- Every row array length MUST equal headers length.
- Output the JSON object only — no prose, no markdown, no code fences.`;
function buildUser(input) {
  const cols = input.columns && input.columns.length ? `Extract these columns, in this exact order: ${input.columns.join(", ")}.` : "Infer a sensible set of columns from the data.";
  const extra = input.instructions ? `
Extra instructions: ${input.instructions}` : "";
  const max = input.maxChars ?? 14e3;
  const text = input.pageText.length > max ? input.pageText.slice(0, max) + "\n…(truncated)" : input.pageText;
  return `${cols}${extra}

PAGE TEXT:
${text}`;
}
function parseResult(raw) {
  let s = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  const sliced = start >= 0 && end > start ? s.slice(start, end + 1) : s;
  try {
    const obj = JSON.parse(sliced);
    const headers = Array.isArray(obj.headers) ? obj.headers.map((h) => String(h)) : [];
    const rows = Array.isArray(obj.rows) ? obj.rows.map(
      (r) => Array.isArray(r) ? r.map((c) => c == null ? "" : String(c)) : [String(r)]
    ) : [];
    return { headers, rows };
  } catch {
    return salvageResult(s);
  }
}
function scanArray(s, from) {
  const i = s.indexOf("[", from);
  if (i < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return { text: s.slice(i, j + 1), end: j + 1 };
    }
  }
  return null;
}
function salvageResult(s) {
  let headers = [];
  const hIdx = s.indexOf('"headers"');
  if (hIdx >= 0) {
    const arr = scanArray(s, hIdx);
    if (arr) {
      try {
        headers = JSON.parse(arr.text).map((h) => String(h));
      } catch {
      }
    }
  }
  const rows = [];
  const rIdx = s.indexOf('"rows"');
  if (rIdx >= 0) {
    let i = s.indexOf("[", rIdx);
    if (i >= 0) {
      i += 1;
      while (i < s.length) {
        while (i < s.length && /[\s,]/.test(s[i])) i++;
        if (i >= s.length || s[i] !== "[") break;
        const arr = scanArray(s, i);
        if (!arr) break;
        try {
          const a = JSON.parse(arr.text);
          rows.push(a.map((c) => c == null ? "" : String(c)));
        } catch {
          break;
        }
        i = arr.end;
      }
    }
  }
  return { headers, rows };
}
async function extractOnce(input) {
  const cfg = plannerConfigFromEnv();
  if (!cfg) {
    throw new Error(
      "Extraction needs a text model. Set OPENROUTER_API_KEY (and ensure PONDER_PLANNER is not 'off')."
    );
  }
  const overrideModel = process.env.EXTRACT_MODEL?.trim();
  const ep = overrideModel ? { ...cfg.text, model: overrideModel } : cfg.vision ?? cfg.text;
  const url = `${ep.apiBase}/chat/completions`;
  const res = await (cfg.fetchImpl ?? fetch)(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ep.apiKey}`,
      ...ep.apiBase.includes("openrouter.ai") ? { "HTTP-Referer": "https://holo.company", "X-Title": "holo3-agent" } : {}
    },
    body: JSON.stringify({
      model: ep.model,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: buildUser(input) }
      ],
      temperature: 0,
      // Long lists overflow a small cap and truncate the JSON. 8000 covers the
      // common page; parseResult salvages complete rows if it still truncates.
      max_tokens: 8e3,
      response_format: { type: "json_object" }
    }),
    signal: input.signal
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`extract model ${ep.model} ${res.status}: ${body.slice(0, 300)}`);
  }
  const out = await res.json();
  const raw = out.choices?.[0]?.message?.content ?? "";
  if (!raw.trim()) throw new Error("extract model returned empty content.");
  const result = parseResult(raw);
  if (!result.headers.length && result.rows.length) {
    const n = Math.max(...result.rows.map((r) => r.length));
    result.headers = Array.from({ length: n }, (_, i) => `col${i + 1}`);
  }
  return result;
}
function chunkByLines(text, max) {
  const lines = text.split("\n");
  const chunks = [];
  let cur = "";
  for (const line of lines) {
    if (cur && cur.length + line.length + 1 > max) {
      chunks.push(cur);
      cur = "";
    }
    cur += (cur ? "\n" : "") + line;
  }
  if (cur) chunks.push(cur);
  return chunks;
}
function mergeResults(parts) {
  const headers = parts.find((p) => p.headers.length)?.headers ?? [];
  const seen = /* @__PURE__ */ new Set();
  const rows = [];
  for (const p of parts) {
    for (const r of p.rows) {
      const key = r.join("").toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        rows.push(r);
      }
    }
  }
  return { headers, rows };
}
async function extractRows(input) {
  const max = input.maxChars ?? 14e3;
  if (input.pageText.length <= max) return extractOnce(input);
  const chunks = chunkByLines(input.pageText, max);
  const CONCURRENCY = 4;
  const parts = [];
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(
      batch.map(
        (c) => extractOnce({ ...input, pageText: c, maxChars: max }).catch(
          () => ({ headers: [], rows: [] })
        )
      )
    );
    parts.push(...settled);
  }
  return mergeResults(parts);
}
const sleep$3 = (ms) => new Promise((r) => setTimeout(r, ms));
async function scrollToLoadAll(browser2, opts = {}) {
  const maxScrolls = opts.maxScrolls ?? 15;
  const settle = opts.settleMs ?? 900;
  const stableRounds = opts.stableRounds ?? 2;
  let prevLen = 0;
  let stable = 0;
  for (let i = 0; i < maxScrolls; i++) {
    await browser2.scrollPage("down", 3e3).catch(() => {
    });
    await sleep$3(settle);
    const len = (await browser2.readText().catch(() => "")).length;
    if (len <= prevLen) {
      if (++stable >= stableRounds) break;
    } else {
      stable = 0;
    }
    prevLen = Math.max(prevLen, len);
  }
  return prevLen;
}
function ponderDir() {
  return path__namespace.join(os__namespace.homedir(), ".ponder");
}
function deviceFilePath() {
  return path__namespace.join(ponderDir(), "device.json");
}
function generateDeviceToken() {
  return crypto__namespace.randomBytes(32).toString("hex");
}
function loadDeviceCredential() {
  try {
    const raw = fs__namespace.readFileSync(deviceFilePath(), "utf8");
    const j = JSON.parse(raw);
    if (j && j.deviceId && j.deviceSecret && j.convexURL) {
      return {
        deviceId: String(j.deviceId),
        deviceSecret: String(j.deviceSecret),
        convexURL: String(j.convexURL),
        orgId: j.orgId ? String(j.orgId) : void 0,
        name: j.name ? String(j.name) : void 0,
        platform: j.platform ? String(j.platform) : void 0
      };
    }
    return null;
  } catch {
    return null;
  }
}
function saveDeviceCredential(cred) {
  const dir = ponderDir();
  fs__namespace.mkdirSync(dir, { recursive: true });
  const file = deviceFilePath();
  fs__namespace.writeFileSync(file, JSON.stringify(cred, null, 2), { mode: 384 });
  try {
    fs__namespace.chmodSync(file, 384);
  } catch {
  }
}
function clearDeviceCredential() {
  try {
    fs__namespace.rmSync(deviceFilePath(), { force: true });
  } catch {
  }
}
async function registerDevice(input) {
  const deviceSecret = generateDeviceToken();
  const client = new browser.ConvexClient(input.convexURL);
  try {
    client.setAuth(async () => input.clerkToken);
    const res = await client.mutation("devices:registerDevice", {
      orgId: input.orgId,
      name: input.name,
      platform: input.platform ?? process.platform,
      token: deviceSecret
    });
    if (!res || !res.deviceId) throw new Error("registerDevice returned no deviceId");
    const cred = {
      deviceId: String(res.deviceId),
      deviceSecret,
      convexURL: input.convexURL,
      orgId: input.orgId,
      name: input.name,
      platform: input.platform ?? process.platform
    };
    saveDeviceCredential(cred);
    return cred;
  } finally {
    try {
      client.close();
    } catch {
    }
  }
}
async function revokeDeviceRemote(cred) {
  const client = new browser.ConvexClient(cred.convexURL);
  try {
    await client.mutation("devices:revokeByDevice", {
      deviceId: cred.deviceId,
      deviceSecret: cred.deviceSecret
    });
  } finally {
    try {
      client.close();
    } catch {
    }
  }
}
function envStr(...keys) {
  for (const key of keys) {
    const value = String(process.env[key] || "").trim();
    if (value) return value;
  }
  return "";
}
function envNum(key, def, { min = 0, max = Number.POSITIVE_INFINITY } = {}) {
  const raw = process.env[key];
  if (raw == null || String(raw).trim() === "") return clamp(def, min, max);
  const n = Number(raw);
  if (!Number.isFinite(n)) return clamp(def, min, max);
  return clamp(n, min, max);
}
function clamp(n, min, max) {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
function defaultWorkerId() {
  const host = (() => {
    try {
      return os__namespace.hostname();
    } catch {
      return "desktop";
    }
  })();
  return `holo3-ponder-${host}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
}
function readBrowserJobsConfig() {
  const config = {
    convexURL: envStr("PONDER_BROWSER_JOBS_CONVEX_URL", "CONVEX_URL"),
    userId: envStr("PONDER_BROWSER_JOBS_USER_ID"),
    workerId: envStr("PONDER_BROWSER_JOBS_WORKER_ID") || defaultWorkerId(),
    syncBaseURL: envStr(
      "PONDER_BROWSER_JOBS_SYNC_BASE_URL",
      "SSSYNC_API_URL",
      "ANORHA_BACKEND_URL"
    ),
    syncToken: envStr("PONDER_BROWSER_JOBS_SYNC_TOKEN"),
    bridgePort: envNum("PONDER_BRIDGE_PORT", 7900, { min: 1, max: 65535 }),
    // ── FB account-safety (writes only) ─────────────────────────────────
    // All parsed via envNum: a BLANK or non-numeric value falls back to the
    // documented default and is clamped to a sane range — never 0 / NaN. To
    // disable a cap, set a LARGE number (e.g. 1000000), not a blank value.
    ...(() => {
      const writeMinGapMs = envNum("PONDER_WRITE_MIN_GAP_MS", 5e3);
      const writeMaxGapMs = envNum("PONDER_WRITE_MAX_GAP_MS", 2e4, {
        min: writeMinGapMs
      });
      return { writeMinGapMs, writeMaxGapMs };
    })(),
    // Caps: clamp to a minimum of 1 so a blank/garbage value can never brick
    // writes by deferring every one (a 0 cap would).
    writeHourlyCap: envNum("PONDER_WRITE_HOURLY_CAP", 8, { min: 1 }),
    writeDailyCap: envNum("PONDER_WRITE_DAILY_CAP", 25, { min: 1 }),
    // Breaker fail-streak: clamp to a minimum of 1 so a blank/garbage value
    // can never trip the breaker on the very first failure (a 0 would).
    frictionBreakConsecutiveFails: envNum(
      "PONDER_FRICTION_BREAK_CONSECUTIVE_FAILS",
      3,
      { min: 1 }
    ),
    readJitterMaxMs: envNum("PONDER_READ_JITTER_MAX_MS", 0),
    // Cap-defer re-check tick: 60s default; 0 disables. Clamped non-negative.
    deferRecheckMs: envNum("PONDER_DEFER_RECHECK_MS", 6e4)
  };
  const dev = loadDeviceCredential();
  if (dev) {
    config.deviceId = dev.deviceId;
    config.deviceSecret = dev.deviceSecret;
    if (!config.convexURL) config.convexURL = dev.convexURL;
  }
  return config;
}
function hasDeviceCredential(config) {
  return Boolean(config.deviceId && config.deviceSecret);
}
function isConfigured(config) {
  return Boolean(config.convexURL && (config.userId || hasDeviceCredential(config)));
}
async function bootstrapConfig(config) {
  if (isConfigured(config)) return config;
  if (!config.syncBaseURL || !config.syncToken) return config;
  try {
    const res = await fetch(
      `${config.syncBaseURL.replace(/\/+$/, "")}/api/agent/browser-jobs/bootstrap`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${config.syncToken}` }
      }
    );
    if (!res.ok) return config;
    const json2 = await res.json();
    const b = json2?.bootstrap || {};
    return {
      ...config,
      convexURL: config.convexURL || String(b.convexURL || "").trim(),
      userId: config.userId || String(b.userId || "").trim(),
      syncBaseURL: config.syncBaseURL || String(b.syncBaseURL || "").trim()
    };
  } catch {
    return config;
  }
}
const FB = "facebook_marketplace";
function str(payload, key) {
  return String(payload?.[key] ?? "").trim();
}
function listingRef(job) {
  const p = job.payload || {};
  return str(p, "url") || str(p, "listingId") || str(p, "platformListingId") || str(p, "title") || "the listing";
}
const FRICTION_PHRASES = [
  // Security / checkpoint / identity (unambiguous account flags).
  // NOTE (GAP A, adversarial re-review): the haystack for the agent_do/vision
  // path embeds the bridge transcript, which echoes BOTH on-page FB text AND
  // the NL goal (built from the user's own title/description/message). Bare
  // single tokens like "suspicious" / "security check" / "checkpoint" /
  // "captcha" therefore matched BENIGN content — an item titled "Captcha
  // Solver" or "Security Check Camera", or FB's benign "Don't share suspicious
  // links" inbox banner — and HARD-perma-tripped the breaker. Two defenses:
  //   (1) frictionForWriteResult() ATTRIBUTES each detected phrase (round-3):
  //       it suppresses the phrase only when the WHOLE phrase is present in the
  //       user's own goal/payload, so user-supplied strings don't trip — WITHOUT
  //       mutating the haystack (so it can never fail open the way the old
  //       substring scrub did), and
  //   (2) the on-page-overlap phrases below are NARROWED to FB-account-specific
  //       multiword forms so a benign on-page banner can't match (and so a
  //       one-word user title can never suppress a multi-word ban phrase).
  // Keep every phrase UNAMBIGUOUS FB account friction — a match is a manual-
  // reset perma-block on all writes.
  "security checkpoint",
  "complete the checkpoint",
  "enter the captcha",
  "temporarily blocked",
  "confirm it's you",
  "confirm its you",
  "unusual activity",
  "verify your identity",
  "account has been restricted",
  "account has been disabled",
  "account is restricted",
  "account is disabled",
  "temporarily restricted",
  "suspicious activity",
  "suspicious login",
  "suspicious attempt",
  "you're temporarily restricted",
  "you are temporarily restricted",
  "you're temporarily restricted from",
  "we limit how often",
  "we've limited",
  "weve limited",
  "go to facebook to confirm",
  "complete a security check",
  "security check required",
  "please re-enter your password",
  // FB rate-limit / "too fast" friction (specific wording, not generic flakiness).
  "posting too fast",
  "posting too quickly",
  "doing that too often",
  "doing that too much",
  "you're going too fast",
  "you are going too fast"
];
const BENIGN_REVIEW_SPANS = [
  "in review",
  "is being reviewed",
  "being reviewed",
  "under review"
];
function detectFrictionPhrase(text) {
  if (!text) return null;
  let hay = String(text).toLowerCase();
  for (const span of BENIGN_REVIEW_SPANS) {
    hay = hay.split(span).join(" ");
  }
  for (const phrase of FRICTION_PHRASES) {
    if (hay.includes(phrase)) return phrase;
  }
  return null;
}
function frictionForWriteResult(outcome, job) {
  const haystackParts = [];
  collectStringLeaves(outcome.result, haystackParts);
  if (outcome.error) haystackParts.push(outcome.error);
  const haystack = haystackParts.join(" ");
  const phrase = detectFrictionPhrase(haystack);
  if (!phrase) return null;
  const userParts = [];
  try {
    const goal = goalForJob(job);
    if (goal) userParts.push(goal);
  } catch {
  }
  collectStringLeaves(job.payload, userParts);
  if (userParts.some((s) => s.toLowerCase().includes(phrase))) return null;
  return phrase;
}
function collectStringLeaves(value, out, depth = 0) {
  if (depth > 12 || value == null) return;
  if (typeof value === "string") {
    if (value) out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStringLeaves(item, out, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value)) {
      collectStringLeaves(v, out, depth + 1);
    }
  }
}
const BRIDGE_NOT_REACHABLE_MARKER = "Ponder bridge not reachable";
function goalForJob(job) {
  const p = job.payload || {};
  const onFb = job.platform === FB;
  const place = onFb ? "Facebook Marketplace" : job.platform || "the marketplace";
  switch (job.type) {
    case "create_listing": {
      const parts = [
        `On ${place}, create a new listing.`,
        str(p, "title") && `Title: ${str(p, "title")}.`,
        str(p, "price") && `Price: ${str(p, "price")}.`,
        str(p, "category") && `Category: ${str(p, "category")}.`,
        str(p, "condition") && `Condition: ${str(p, "condition")}.`,
        str(p, "description") && `Description: ${str(p, "description")}.`,
        str(p, "location") && `Location: ${str(p, "location")}.`,
        Array.isArray(p.photoPaths) && p.photoPaths.length ? `Upload these photos: ${p.photoPaths.join(", ")}.` : "",
        str(p, "sku") && `Expand the "More details" section, then enter the SKU into the native private "SKU" field (labeled "SKU", "Optional. Only visible to you"): ${str(p, "sku")}. The SKU is private inventory data — NEVER put it in the public Description.`,
        "Then publish the listing and confirm it posted."
      ].filter(Boolean);
      return parts.join(" ");
    }
    case "update_listing": {
      const changes = [
        str(p, "price") && `price to ${str(p, "price")}`,
        str(p, "title") && `title to "${str(p, "title")}"`,
        str(p, "description") && `description to "${str(p, "description")}"`,
        str(p, "category") && `category to ${str(p, "category")}`
      ].filter(Boolean);
      const change = changes.length ? `Update ${changes.join(", ")}.` : "Apply the requested changes.";
      const skuLine = str(p, "sku") ? ` Expand "More details" and set the native private "SKU" field to ${str(p, "sku")} — never put the SKU in the public Description.` : "";
      return `On ${place}, open my listing ${listingRef(job)} and edit it. ${change}${skuLine} Save the changes and confirm.`;
    }
    case "delete_listing":
      return `On ${place}, find my listing ${listingRef(job)}, then delete it (or mark it sold if delete is unavailable). Confirm it was removed.`;
    case "scrape_inventory":
      return `On ${place}, open "Your listings"/"Selling". Scroll to load every active listing, then extract them as a table with columns: Title, Price, Status, Views. Skip sold and draft items. Return the table.`;
    case "check_messages":
      return `On ${place}, open the inbox. List the recent message threads, each with the buyer name and the latest message. Return them as a list.`;
    case "send_message": {
      const msg = str(p, "message") || str(p, "text");
      const who = str(p, "buyer") || str(p, "thread") || "the buyer";
      return `On ${place}, open the conversation with ${who} and send this message: "${msg}". Confirm it sent.`;
    }
    case "propose_slots": {
      const who = str(p, "buyer") || str(p, "thread") || "the buyer";
      const slots = (Array.isArray(p.slots) && p.slots.length ? p.slots.map((s) => String(s)).join(", ") : "") || str(p, "times") || str(p, "availability");
      const item = listingRef(job);
      const slotLine = slots ? `Offer these appointment time slots: ${slots}.` : "Offer the available appointment time slots from the details provided.";
      const msg = str(p, "message") || str(p, "text");
      return `On ${place}, open the inbox conversation with ${who} about ${item}. ${slotLine}${msg ? ` Include this note: "${msg}".` : ""} Send the proposed time slots in the conversation and confirm they were sent.`;
    }
    case "confirm_appointment": {
      const who = str(p, "buyer") || str(p, "thread") || "the buyer";
      const when = str(p, "slot") || str(p, "time") || str(p, "datetime") || str(p, "when");
      const item = listingRef(job);
      const whenLine = when ? ` for ${when}` : "";
      const msg = str(p, "message") || str(p, "text");
      return `On ${place}, open the inbox conversation with ${who} about ${item} and confirm the appointment${whenLine}.${msg ? ` Include this note: "${msg}".` : ""} Send the confirmation message and confirm it was sent.`;
    }
    case "sync_listing_state":
      return `On ${place}, open my listing ${listingRef(job)} and read its current state: title, price, status (active/sold/pending), and view count. Return those fields.`;
    default: {
      const goal = str(p, "goal") || str(p, "task") || job.workflowKey || "";
      return goal ? `On ${place}: ${goal}` : `On ${place}, perform a ${job.operation || job.type} operation using the provided details: ${JSON.stringify(p)}`;
    }
  }
}
const DEFAULT_RECIPE_IDS = {
  create_listing: "fb-create-listing-full"
};
function mappedRecipeId(job) {
  const type = String(job.type || "");
  const key = `PONDER_BROWSER_JOBS_RECIPE_${type.toUpperCase()}`;
  const fromEnv = String(process.env[key] || "").trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_RECIPE_IDS[type] || "";
}
function normalizeFbCategory(raw) {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return "Miscellaneous";
  if (/[>/|,]/.test(v)) return "Miscellaneous";
  if (v.length > 40) return "Miscellaneous";
  return v;
}
function recipeParamsForJob(job) {
  const p = job.payload || {};
  if (job.type === "create_listing") {
    return { ...p, sku: p.sku ?? "", category: normalizeFbCategory(p.category) };
  }
  if (job.type === "update_listing") {
    return { ...p, sku: p.sku ?? "" };
  }
  return { ...p };
}
const READ_TYPES = /* @__PURE__ */ new Set(["scrape_inventory", "check_messages", "sync_listing_state"]);
const WRITE_TYPES = /* @__PURE__ */ new Set([
  "create_listing",
  "update_listing",
  "delete_listing",
  "send_message",
  "propose_slots",
  "confirm_appointment"
]);
function isWriteJob(job) {
  return WRITE_TYPES.has(String(job.type));
}
function urlLike(s) {
  return /^https?:\/\//i.test(s);
}
function fbEditUrl(id) {
  return `https://www.facebook.com/marketplace/edit/?listing_id=${encodeURIComponent(id)}`;
}
function fbListingId(p) {
  const direct = str(p, "listingId") || str(p, "platformListingId");
  if (direct) return direct;
  const url = str(p, "url") || str(p, "listingUrl") || str(p, "listingRef");
  const m = url.match(/(?:listing_id=|\/item\/)(\d+)/);
  return m ? m[1] : "";
}
function extractSpecForJob(job) {
  if (!READ_TYPES.has(job.type)) return null;
  if (job.platform !== FB) return null;
  const p = job.payload || {};
  switch (job.type) {
    case "scrape_inventory":
      return {
        url: "https://www.facebook.com/marketplace/you/selling",
        columns: ["Title", "Price", "Status", "Views", "Listed"],
        instructions: "Extract my Facebook Marketplace listings (one row per listing). Include active, sold and pending items; put the state in the Status column. Skip navigation, ads, and non-listing UI.",
        scroll: true
      };
    case "check_messages":
      return {
        url: "https://www.facebook.com/marketplace/inbox",
        columns: ["Buyer", "LastMessage", "Time", "Unread"],
        instructions: "List recent Marketplace message threads: buyer name, latest message, approximate time, and whether the thread is unread.",
        scroll: true
      };
    case "sync_listing_state": {
      const id = fbListingId(p);
      if (id) {
        return {
          url: fbEditUrl(id),
          columns: ["Title", "Price", "Category", "Condition", "Description", "Color", "Location", "Photos", "Availability"],
          instructions: "This is the EDIT form for ONE Facebook Marketplace listing. Extract every field with its CURRENT value: Title, Price, Category, Condition, Description, Color, Location, Photos (count), Availability. Pull Title/Price/Location from the FORM FIELD VALUES section; pull Category/Condition/Description from the body text. For Description use the FULL body text (not the truncated field label).",
          scroll: false,
          deep: true
        };
      }
      const ref = str(p, "url") || str(p, "listingUrl");
      if (!ref || !urlLike(ref)) return null;
      return {
        url: ref,
        columns: ["Title", "Price", "Status", "Views"],
        instructions: "Read this listing's current state: title, price, status, view count.",
        scroll: false
      };
    }
    default:
      return null;
  }
}
class PonderExecutor {
  base;
  timeoutMs;
  constructor(opts) {
    this.base = `http://127.0.0.1:${opts.bridgePort}`;
    this.timeoutMs = opts.timeoutMs ?? 6e5;
  }
  /** The Ponder Electron bridge must be running for jobs to execute. */
  async bridgeAvailable() {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2e3);
      const res = await fetch(`${this.base}/health`, { signal: ctrl.signal });
      clearTimeout(t);
      return res.ok;
    } catch {
      return false;
    }
  }
  async execute(job) {
    if (!await this.bridgeAvailable()) {
      return {
        success: false,
        requiresHuman: true,
        error: `${BRIDGE_NOT_REACHABLE_MARKER} at ${this.base}. Open the Ponder desktop app so jobs can execute.`
      };
    }
    const recipeId = mappedRecipeId(job);
    if (recipeId) {
      const viaRecipe = await this.post(
        "/recipe/run",
        { id: recipeId, reground: false, params: recipeParamsForJob(job) },
        job
      );
      const recipeMissing = !viaRecipe.success && /(^|\D)404(\D|$)|RECIPE_NOT_FOUND/i.test(String(viaRecipe.error || ""));
      if (!recipeMissing) return viaRecipe;
    }
    const spec = extractSpecForJob(job);
    if (spec) {
      return this.postExtract(spec, job);
    }
    return this.post("/agent_do", { task: goalForJob(job), decompose: true }, job);
  }
  /** POST /extract and shape the rows into a job result + a table artifact. */
  async postExtract(spec, job) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.base}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(spec),
        signal: ctrl.signal
      });
      const text = await res.text().catch(() => "");
      if (!res.ok) {
        return { success: false, error: `Ponder bridge ${res.status}: ${text.slice(0, 400)}` };
      }
      let payload = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = {};
      }
      const headers = Array.isArray(payload?.headers) ? payload.headers : [];
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
      return {
        success: true,
        result: {
          status: "success",
          via: "extract",
          jobType: job.type,
          platform: job.platform,
          operation: job.operation || "read",
          outcome: "done",
          count: rows.length,
          headers,
          rows,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        },
        artifacts: [{ kind: "table", headers, rows }]
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: /abort/i.test(message) ? `Ponder extract timed out after ${this.timeoutMs}ms` : message
      };
    } finally {
      clearTimeout(timer);
    }
  }
  async post(path2, body, job) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.base}${path2}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
      const text = await res.text().catch(() => "");
      if (!res.ok) {
        return { success: false, error: `Ponder bridge ${res.status}: ${text.slice(0, 400)}` };
      }
      let payload = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = { raw: text };
      }
      const isError = payload?.isError === true || payload?.ok === false;
      if (isError) {
        return {
          success: false,
          error: String(payload?.error || payload?.message || "Ponder run failed"),
          result: payload
        };
      }
      return {
        success: true,
        result: {
          status: "success",
          via: path2 === "/recipe/run" ? "recipe" : "agent",
          jobType: job.type,
          platform: job.platform,
          operation: job.operation,
          outcome: payload?.outcome ?? payload?.status ?? "done",
          payload,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const aborted = /abort/i.test(message);
      return {
        success: false,
        error: aborted ? `Ponder run timed out after ${this.timeoutMs}ms` : message
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
const HOUR_MS = 60 * 60 * 1e3;
const DAY_MS = 24 * HOUR_MS;
const sleep$2 = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
class BrowserJobsConsumer {
  config;
  executor;
  workerType = "holo3_ponder";
  log;
  events;
  // Loosely typed: Convex's typed API expects FunctionReference objects, but
  // we address deployed functions by string name (the queue lives in another
  // repo's Convex deployment). The anorha-local consumer does the same.
  client = null;
  unsubscribe = null;
  running = false;
  pendingCount = 0;
  lastError = null;
  processingQueue = Promise.resolve();
  inFlight = /* @__PURE__ */ new Set();
  scheduled = /* @__PURE__ */ new Set();
  // ── FB account-safety state (in-memory; v1 — clears on restart) ────────
  // Rolling write timestamps (ms), pruned to the 24h window on each access;
  // 1h and 24h counts are derived by filtering. consecutiveWriteFails drives
  // the breaker alongside friction-phrase detection. breakerTripped pauses
  // ALL future writes (reads continue) until an explicit reset. The *Alerted
  // flags throttle the loud one-time logs so we don't spam every deferral.
  writeTimestamps = [];
  consecutiveWriteFails = 0;
  breakerTripped = false;
  breakerReason = null;
  cappedAlerted = false;
  breakerAlerted = false;
  // ── Cap-defer liveness (GAP 3) ─────────────────────────────────────────
  // A cap-deferred write leaves the job UNTOUCHED in Convex 'pending'. The
  // getRetryable subscription only re-fires on a result-set CHANGE, so a job
  // that was deferred is NOT re-pulled when the rolling window later clears.
  // To make deferred writes actually resume, we arm a lightweight periodic
  // tick (config.deferRecheckMs; 0 disables) the FIRST time we cap-defer; the
  // tick re-polls getRetryable and re-runs handleJobs over the current pending
  // set. cappedDeferPending tracks whether any write is currently parked on a
  // cap so the tick can self-disarm once nothing is waiting. The tick NEVER
  // runs while the breaker is tripped (those defers are intentional perma-
  // blocks until an explicit reset — see processJob's breaker gate).
  cappedDeferPending = false;
  deferRecheckTimer = null;
  heartbeatTimer = null;
  // Injectable Convex client factory (tests pass a mock; prod uses ConvexClient).
  createClient;
  constructor(config, executor, events, deps) {
    this.config = config;
    this.executor = executor;
    this.log = events?.log ?? ((msg) => console.log(`[browser-jobs] ${msg}`));
    this.events = events;
    this.createClient = deps?.createClient ?? ((url) => new browser.ConvexClient(url));
  }
  /** True once this computer is LINKED (has a device credential) — use the
   *  secure browserJobs:claimJobs/claim* + deviceHeartbeat path. */
  get useDevice() {
    return Boolean(this.config.deviceId && this.config.deviceSecret);
  }
  deviceArgs() {
    return {
      deviceId: this.config.deviceId,
      deviceSecret: this.config.deviceSecret
    };
  }
  /** Emit a structured job-lifecycle event for the tray Activity Feed. */
  emitJob(job, status, url) {
    if (!this.events?.onJob) return;
    const p = job.payload ?? {};
    const title = String(p.title || p.name || p.productId || job.type || "Job");
    this.events.onJob({
      id: job._id,
      title,
      platform: String(job.platform || ""),
      status,
      url,
      ts: Date.now()
    });
  }
  start() {
    if (!this.config.convexURL || !(this.config.userId || this.useDevice)) {
      throw new Error(
        "browser-jobs consumer not configured: need convexURL + (device credential or userId)."
      );
    }
    if (this.unsubscribe) return;
    if (String(process.env.PONDER_FRICTION_BREAKER_RESET || "").trim() === "1") {
      this.resetBreaker();
    }
    this.client = this.createClient(this.config.convexURL);
    this.running = true;
    const idLabel = this.useDevice ? `device=${this.config.deviceId}` : `user=${this.config.userId} worker=${this.config.workerId}`;
    this.log(
      `subscribed to browserJobs (${this.useDevice ? "device-auth" : "legacy"}) ${idLabel} via ${this.config.convexURL}`
    );
    this.unsubscribe = this.client.onUpdate(
      this.useDevice ? "browserJobs:claimJobs" : "browserJobs:getRetryable",
      this.useDevice ? this.deviceArgs() : { userId: this.config.userId },
      (jobs) => {
        void this.handleJobs(Array.isArray(jobs) ? jobs : []);
      },
      (err) => {
        this.lastError = err instanceof Error ? err.message : String(err);
        this.log(`subscription error: ${this.lastError}`);
      }
    );
    this.startHeartbeat();
  }
  stop() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.stopHeartbeat();
    this.stopDeferRecheck();
    try {
      this.client?.close?.();
    } catch {
    }
    this.client = null;
    this.running = false;
  }
  status() {
    const now = Date.now();
    const recent = this.writeTimestamps.filter((t) => now - t < DAY_MS);
    const writesLastHour = recent.filter((t) => now - t < HOUR_MS).length;
    const writesLastDay = recent.length;
    return {
      running: this.running,
      convexURL: this.config.convexURL,
      userId: this.config.userId,
      workerId: this.config.workerId,
      deviceId: this.config.deviceId,
      authMode: this.useDevice ? "device" : "legacy",
      pendingCount: this.pendingCount,
      inFlight: this.inFlight.size,
      backendSyncConfigured: Boolean(this.config.syncBaseURL && this.config.syncToken),
      lastError: this.lastError,
      // FB account-safety surfacing (CLI / Electron).
      breakerTripped: this.breakerTripped,
      breakerReason: this.breakerReason,
      writesLastHour,
      writesLastDay,
      hourlyCap: this.config.writeHourlyCap,
      dailyCap: this.config.writeDailyCap
    };
  }
  /**
   * Feature D — explicit breaker reset. Clears the tripped breaker, its reason,
   * the consecutive-fail counter, and the one-time alert throttles. Wire to a
   * CLI subcommand / Electron control. (Restarting the consumer also clears
   * this in-memory state — see the field comment.)
   */
  resetBreaker() {
    this.breakerTripped = false;
    this.breakerReason = null;
    this.consecutiveWriteFails = 0;
    this.cappedAlerted = false;
    this.breakerAlerted = false;
    this.log("[safety] breaker reset — write jobs will resume");
    if (this.cappedDeferPending) this.startDeferRecheck();
  }
  // ── Cap-defer liveness (GAP 3) ──────────────────────────────────────────
  /** Arm the periodic re-check tick (idempotent). Called the first time a write
   *  is cap-deferred. No-op when disabled (deferRecheckMs<=0) or already armed.
   *  The tick re-polls getRetryable and re-runs handleJobs so deferred writes
   *  resume once back under the rolling cap. It self-disarms when nothing is
   *  parked on a cap, and skips entirely while the breaker is tripped. */
  startDeferRecheck() {
    if (this.deferRecheckTimer) return;
    const interval = this.config.deferRecheckMs;
    if (!Number.isFinite(interval) || interval <= 0) return;
    this.deferRecheckTimer = setInterval(() => {
      void this.recheckDeferred();
    }, interval);
    this.deferRecheckTimer?.unref?.();
  }
  /** Disarm the re-check tick (idempotent). Called from stop() and when there's
   *  nothing left parked on a cap. */
  stopDeferRecheck() {
    if (this.deferRecheckTimer) {
      clearInterval(this.deferRecheckTimer);
      this.deferRecheckTimer = null;
    }
  }
  /** One tick: if a cap-deferred write is waiting and we're not breaker-tripped,
   *  re-poll getRetryable once and re-run the handler over the current pending
   *  set so under-cap writes resume. Disarms when there's nothing to resume
   *  (no parked write) or the breaker is now tripped (intentional perma-block).
   *  Best-effort and non-busy: a single one-shot query per tick, never a loop. */
  async recheckDeferred() {
    if (!this.cappedDeferPending || this.breakerTripped || !this.running || !this.client) {
      this.stopDeferRecheck();
      return;
    }
    const { hour, day } = this.writeCounts();
    if (hour < this.config.writeHourlyCap && day < this.config.writeDailyCap) {
      this.cappedDeferPending = false;
    }
    try {
      const jobs = await this.client.query(
        this.useDevice ? "browserJobs:claimJobs" : "browserJobs:getRetryable",
        this.useDevice ? this.deviceArgs() : { userId: this.config.userId }
      );
      await this.handleJobs(Array.isArray(jobs) ? jobs : []);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.log(`[safety] defer re-check error: ${this.lastError}`);
    }
  }
  /** Prune the rolling write log to the 24h window and return {hour, day}. */
  writeCounts(now = Date.now()) {
    this.writeTimestamps = this.writeTimestamps.filter((t) => now - t < DAY_MS);
    const hour = this.writeTimestamps.filter((t) => now - t < HOUR_MS).length;
    return { hour, day: this.writeTimestamps.length };
  }
  /** Trip the circuit breaker once, with a LOUD one-time alert. Reads continue;
   *  future writes are blocked at the defer gate until an explicit reset. */
  tripBreaker(reason) {
    if (!this.breakerTripped) {
      this.breakerTripped = true;
      this.breakerReason = reason;
    }
    if (!this.breakerAlerted) {
      this.breakerAlerted = true;
      this.log(
        `[safety] ⚠ CIRCUIT BREAKER TRIPPED — ${reason}. PAUSING all Facebook write jobs (reads still run). Open Facebook and check your account manually, then reset (restart the consumer, run the reset, or set PONDER_FRICTION_BREAKER_RESET=1).`
      );
    }
  }
  // ── workerPresence heartbeat (device mode only) ──────────────────────────
  // Writes a presence doc every ~25s so the phone + tray derive "computer
  // online". Device-auth only (legacy has no orgId to write presence with).
  startHeartbeat() {
    if (!this.useDevice || this.heartbeatTimer) return;
    const tick = () => {
      if (!this.client) return;
      void this.client.mutation("workerPresence:deviceHeartbeat", {
        ...this.deviceArgs(),
        lastSeenAt: Date.now()
      }).catch((e) => {
        this.lastError = e instanceof Error ? e.message : String(e);
      });
    };
    tick();
    this.heartbeatTimer = setInterval(tick, 25e3);
    this.heartbeatTimer?.unref?.();
  }
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
  // ── claim vs legacy queue writes ─────────────────────────────────────────
  // Device mode → secure claim* (verifies the device secret + job ownership).
  // Legacy mode → the old userId/workerId-arg fns (gated server-side by
  // BROWSER_JOBS_REQUIRE_DEVICE so they can be turned off post-cutover).
  async markStart(jobId) {
    if (this.useDevice) {
      await this.client.mutation("browserJobs:claimStart", {
        jobId,
        ...this.deviceArgs(),
        workerType: this.workerType
      });
    } else {
      await this.client.mutation("browserJobs:startJob", {
        jobId,
        workerId: this.config.workerId,
        workerType: this.workerType
      });
    }
  }
  async markComplete(jobId, outcome) {
    if (this.useDevice) {
      await this.client.mutation("browserJobs:claimComplete", {
        jobId,
        ...this.deviceArgs(),
        result: outcome.result || {},
        artifacts: outcome.artifacts || [],
        requiresHuman: outcome.requiresHuman === true
      });
    } else {
      await this.client.mutation("browserJobs:completeJob", {
        jobId,
        result: outcome.result || {},
        artifacts: outcome.artifacts || [],
        requiresHuman: outcome.requiresHuman === true,
        workerId: this.config.workerId
      });
    }
  }
  async markFail(jobId, errorMessage, requiresHuman, artifacts) {
    if (this.useDevice) {
      await this.client.mutation("browserJobs:claimFail", {
        jobId,
        ...this.deviceArgs(),
        errorMessage,
        requiresHuman,
        artifacts
      });
    } else {
      await this.client.mutation("browserJobs:failJob", {
        jobId,
        errorMessage,
        requiresHuman,
        artifacts,
        workerId: this.config.workerId
      });
    }
  }
  async handleJobs(jobs) {
    this.pendingCount = jobs.length;
    const sorted = [...jobs].sort(
      (a, b) => Number(a?.queuedAt || 0) - Number(b?.queuedAt || 0)
    );
    for (const job of sorted) {
      if (!job?._id || this.inFlight.has(job._id) || this.scheduled.has(job._id)) continue;
      this.scheduled.add(job._id);
      this.processingQueue = this.processingQueue.catch(() => void 0).then(async () => {
        this.inFlight.add(job._id);
        try {
          await this.processJob(job);
        } finally {
          this.inFlight.delete(job._id);
          this.scheduled.delete(job._id);
        }
      });
    }
  }
  async processJob(job) {
    const isWrite = isWriteJob(job);
    if (isWrite) {
      if (this.breakerTripped) {
        this.log(
          `[safety] defer ${job._id} (${job.type}) — breaker tripped${this.breakerReason ? `: ${this.breakerReason}` : ""}. Left pending.`
        );
        return;
      }
      const { hour, day } = this.writeCounts();
      const overHour = hour >= this.config.writeHourlyCap;
      const overDay = day >= this.config.writeDailyCap;
      if (overHour || overDay) {
        if (!this.cappedAlerted) {
          this.cappedAlerted = true;
          const which = overHour ? `hourly cap (${hour}/${this.config.writeHourlyCap} in 1h)` : `daily cap (${day}/${this.config.writeDailyCap} in 24h)`;
          this.log(
            `[safety] ⚠ write velocity ${which} reached — DEFERRING further Facebook write jobs (left pending). The getRetryable subscription only re-fires on a result-set change, so deferred writes are resumed by a periodic re-check tick once the rolling window clears. Reads are unaffected.`
          );
        }
        this.log(`[safety] defer ${job._id} (${job.type}) — over write cap. Left pending.`);
        this.cappedDeferPending = true;
        this.startDeferRecheck();
        return;
      }
      this.cappedAlerted = false;
      this.cappedDeferPending = false;
    }
    if (isWrite) {
      const lo = Math.max(0, this.config.writeMinGapMs);
      const hi = Math.max(lo, this.config.writeMaxGapMs);
      const delay = lo + Math.floor(Math.random() * (hi - lo + 1));
      if (delay > 0) {
        this.log(`[safety] pacing ${job._id} (${job.type}) — pausing ${delay}ms before write`);
        await sleep$2(delay);
      }
    } else if (this.config.readJitterMaxMs > 0) {
      await sleep$2(Math.floor(Math.random() * (this.config.readJitterMaxMs + 1)));
    }
    this.log(`claim ${job._id} type=${job.type} platform=${job.platform}`);
    this.emitJob(job, "claimed");
    let didAttemptExecute = false;
    try {
      await this.markStart(job._id);
      this.emitJob(job, "running");
      didAttemptExecute = true;
      const outcome = await this.executor.execute(job);
      const bridgeDown = !outcome.success && (outcome.error || "").includes(BRIDGE_NOT_REACHABLE_MARKER);
      if (isWrite && !bridgeDown) this.writeTimestamps.push(Date.now());
      if (!outcome.success) {
        throw Object.assign(new Error(outcome.error || "Browser job failed"), {
          requiresHuman: outcome.requiresHuman === true,
          artifacts: outcome.artifacts || [],
          result: outcome.result
        });
      }
      await this.markComplete(job._id, outcome);
      this.emitJob(job, "done", outcome.result?.url);
      this.log(`done ${job._id}`);
      if (isWrite) {
        const friction = frictionForWriteResult(outcome, job);
        if (friction) {
          this.tripBreaker(`Facebook friction signal on a successful write: "${friction}"`);
        } else {
          this.consecutiveWriteFails = 0;
        }
      }
      await this.reconcileWithBackend(job);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const requiresHuman = error?.requiresHuman === true || /consent|required|captcha|login|pair|approval|human/i.test(message);
      const artifacts = Array.isArray(error?.artifacts) ? error.artifacts : [];
      if (isWrite) {
        const isBridgeDown = message.includes(BRIDGE_NOT_REACHABLE_MARKER);
        if (!isBridgeDown) {
          const friction = frictionForWriteResult(
            {
              error: message,
              result: error?.result
            },
            job
          );
          if (friction) {
            this.tripBreaker(`Facebook friction signal on a failed write: "${friction}"`);
          }
          this.consecutiveWriteFails += 1;
          if (this.consecutiveWriteFails >= this.config.frictionBreakConsecutiveFails) {
            this.tripBreaker(
              `${this.consecutiveWriteFails} consecutive Facebook write failures`
            );
          }
        }
      }
      this.lastError = message;
      this.log(`fail ${job._id}: ${message}${requiresHuman ? " (requires human)" : ""}`);
      await this.markFail(job._id, message, requiresHuman, artifacts);
      this.emitJob(job, "failed");
      await this.reconcileWithBackend(job);
    }
  }
  async reconcileWithBackend(job) {
    if (!this.config.syncBaseURL || !this.config.syncToken || !job.agentSessionId) return;
    try {
      const res = await fetch(
        `${this.config.syncBaseURL.replace(/\/+$/, "")}/api/agent/sessions/${encodeURIComponent(
          job.agentSessionId
        )}/browser-jobs/${encodeURIComponent(job._id)}/reconcile`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.syncToken}`,
            "Content-Type": "application/json"
          }
        }
      );
      if (!res.ok) {
        this.log(`reconcile ${job._id} failed (${res.status})`);
      }
    } catch (error) {
      this.log(
        `reconcile ${job._id} error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
async function startBrowserJobsConsumer(opts = {}) {
  let config = opts.config ?? readBrowserJobsConfig();
  if (!isConfigured(config)) {
    config = await bootstrapConfig(config);
  }
  if (!isConfigured(config)) {
    throw new Error(
      "browser-jobs consumer not configured. Set PONDER_BROWSER_JOBS_CONVEX_URL + PONDER_BROWSER_JOBS_USER_ID, or PONDER_BROWSER_JOBS_SYNC_BASE_URL + PONDER_BROWSER_JOBS_SYNC_TOKEN so it can bootstrap from the backend."
    );
  }
  const executor = new PonderExecutor({ bridgePort: config.bridgePort });
  const consumer = new BrowserJobsConsumer(config, executor, opts.events);
  consumer.start();
  return consumer;
}
const PAGE_CSS = "body{font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;background:#F4F3EE;color:#18181B;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.card{text-align:center;max-width:320px;padding:0 24px}.h{font-size:20px;font-weight:700;margin:0 0 6px}.p{color:#71717A;font-size:14px;line-height:20px;margin:0}";
function page(title, body) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Anorha</title><style>${PAGE_CSS}</style><div class="card"><p class="h">${title}</p><p class="p">${body}</p></div>`;
}
const SUCCESS_HTML = page("Computer linked", "You can close this tab and return to Anorha.");
const FAILURE_HTML = page("Link failed", "Something went wrong. Return to Anorha and try again.");
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-allow-headers": "content-type"
};
let activeCancel = null;
function cancelActiveLink() {
  activeCancel?.("cancelled");
}
function linkViaBrowser(opts) {
  const state = crypto.randomBytes(16).toString("hex");
  const timeoutMs = opts.timeoutMs;
  return new Promise((resolve, reject) => {
    let done = false;
    function finish(settle) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      activeCancel = null;
      try {
        server2.close();
      } catch {
      }
      settle();
    }
    const settleOk = (token) => finish(() => resolve({ clerkToken: token }));
    const settleErr = (e) => finish(() => reject(e));
    function handle(token, gotState, res) {
      if (token && gotState === state) {
        res.writeHead(200, { "content-type": "text/html", ...CORS }).end(SUCCESS_HTML);
        settleOk(token);
      } else {
        res.writeHead(400, { "content-type": "text/html", ...CORS }).end(FAILURE_HTML);
      }
    }
    const server2 = node_http.createServer((req, res) => {
      let url;
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
        let body = "";
        req.on("data", (chunk2) => {
          body += chunk2;
          if (body.length > 1e6) req.destroy();
        });
        req.on("end", () => {
          let token = "";
          let gotState = "";
          try {
            const j = JSON.parse(body || "{}");
            token = String(j.token ?? "");
            gotState = String(j.state ?? "");
          } catch {
          }
          handle(token, gotState, res);
        });
        return;
      }
      handle(url.searchParams.get("token") || "", url.searchParams.get("state") || "", res);
    });
    const timer = setTimeout(
      () => settleErr(new Error("Sign-in timed out — please try again.")),
      timeoutMs
    );
    activeCancel = () => settleErr(new Error("Sign-in cancelled."));
    server2.on("error", (e) => settleErr(e instanceof Error ? e : new Error(String(e))));
    server2.listen(0, "127.0.0.1", () => {
      const addr = server2.address();
      const port = addr && typeof addr === "object" ? addr.port : 0;
      if (!port) {
        settleErr(new Error("Could not open a local sign-in port."));
        return;
      }
      const base = opts.webBaseUrl.replace(/\/+$/, "");
      void electron.shell.openExternal(`${base}/desktop-callback?port=${port}&state=${state}`);
    });
  });
}
const PUBLIC_CONFIG = {
  /** sssync-bknd queue deployment (devices/browserJobs/claim*). */
  convexUrl: "https://merry-buffalo-800.convex.cloud",
  /** Prod Clerk instance (clerk.app.anorha.app). */
  clerkPublishableKey: "pk_live_Y2xlcmsuYXBwLmFub3JoYS5hcHAk",
  /** Backend REST (org lookup, reconcile). */
  apiBaseUrl: "https://api.sssync.app",
  /** Web app that hosts /desktop-callback (a real Clerk subdomain). */
  webBaseUrl: "https://app.anorha.app"
};
if (!process.env.PLAYWRITER_AUTO_ENABLE) {
  process.env.PLAYWRITER_AUTO_ENABLE = "1";
}
async function fetchRelayExtensions() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    try {
      const res = await fetch("http://127.0.0.1:19988/extensions/status", {
        signal: ctrl.signal
      });
      if (!res.ok) return null;
      const body = await res.json();
      return Array.isArray(body.extensions) ? body.extensions : null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}
function pickBestExtension(exts) {
  if (exts.length === 0) return null;
  const withTargets = exts.filter((e) => (e.activeTargets ?? 0) > 0);
  const pool = withTargets.length > 0 ? withTargets : exts;
  return pool[0] ?? null;
}
function isWelcomeTab(p) {
  return /^chrome-extension:\/\/[a-z]+\/src\/welcome\.html(?:[?#]|$)/i.test(
    p.url()
  );
}
async function resolveFilePathTolerant(p) {
  try {
    await fsp__namespace.access(p);
    return { resolved: p, viaFuzz: false };
  } catch {
    const dir = path__namespace.dirname(p);
    const base = path__namespace.basename(p);
    let entries;
    try {
      entries = await fsp__namespace.readdir(dir);
    } catch {
      return { resolved: p, viaFuzz: false };
    }
    const norm = (s) => s.normalize("NFC").replace(/\s+/g, " ").toLowerCase();
    const target = norm(base);
    for (const entry of entries) {
      if (norm(entry) === target) {
        return { resolved: path__namespace.join(dir, entry), viaFuzz: true };
      }
    }
    return { resolved: p, viaFuzz: false };
  }
}
async function tryLoadModules() {
  try {
    const dynamicImport = new Function("m", "return import(m)");
    const pwMod = await dynamicImport("playwriter");
    const coreMod = await dynamicImport("playwright-core");
    const pwBag = pwMod.default ?? pwMod;
    const coreBag = coreMod.default ?? coreMod;
    const pw = {
      startPlayWriterCDPRelayServer: pwBag.startPlayWriterCDPRelayServer ?? pwMod.startPlayWriterCDPRelayServer,
      getCdpUrl: pwBag.getCdpUrl ?? pwMod.getCdpUrl
    };
    const core = {
      chromium: coreBag.chromium ?? coreMod.chromium
    };
    if (typeof pw.startPlayWriterCDPRelayServer !== "function" || typeof pw.getCdpUrl !== "function" || !core?.chromium?.connectOverCDP) {
      console.warn(
        "[browser] modules loaded but missing expected exports — disabling"
      );
      return null;
    }
    return { pw, core };
  } catch (e) {
    console.log(
      `[browser] modules not loadable (${e instanceof Error ? e.message : String(e)}) — vision-only`
    );
    return null;
  }
}
const SNAPSHOT_SCRIPT = /* @__PURE__ */ (() => {
  return `(() => {
    const interactiveSel = [
      'a[href]', 'button', 'input:not([type=hidden])', 'select', 'textarea',
      '[role="button"]', '[role="link"]', '[role="textbox"]',
      '[role="searchbox"]', '[role="checkbox"]', '[role="radio"]',
      '[role="menuitem"]', '[role="tab"]', '[role="combobox"]',
      '[role="option"]', '[role="switch"]', '[contenteditable="true"]',
    ].join(',');

    function nameOf(el) {
      const aria = el.getAttribute('aria-label');
      if (aria) return aria;
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const lbl = document.getElementById(labelledBy);
        if (lbl && lbl.textContent) return lbl.textContent;
      }
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        return el.placeholder || el.value || el.name || el.type || '';
      }
      const t = (el.innerText || el.textContent || '').trim();
      return t.slice(0, 80);
    }
    function roleOf(el) {
      const explicit = el.getAttribute('role');
      if (explicit) return explicit;
      const tag = el.tagName.toLowerCase();
      if (tag === 'a') return 'link';
      if (tag === 'button') return 'button';
      if (tag === 'input') {
        const t = (el.type || 'text').toLowerCase();
        // file-input gets its own role so it stands out in the snapshot
        // and the orchestrator knows to use browser_set_input_files
        // instead of trying to click it (the native file picker is the
        // wrong tool for an upload-from-disk).
        if (t === 'file') return 'file-input';
        if (t === 'submit' || t === 'button') return 'button';
        if (t === 'checkbox') return 'checkbox';
        if (t === 'radio') return 'radio';
        return 'textbox';
      }
      if (tag === 'select') return 'combobox';
      if (tag === 'textarea') return 'textbox';
      return tag;
    }
    function isFileInput(el) {
      return el.tagName === 'INPUT' && (el.type || '').toLowerCase() === 'file';
    }
    function visible(el) {
      // File inputs are commonly hidden via CSS while a styled label /
      // button forwards user clicks (Facebook, Twitter, Instagram all
      // do this). The element is fully functional even when invisible
      // — Playwright's setInputFiles writes straight to the input — so
      // we surface it in the snapshot anyway. Without this, the
      // orchestrator can't see the [eN] ref to target.
      if (isFileInput(el)) return true;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none';
    }
    // Disabled detection: native disabled attr, aria-disabled, or
    // pointer-events:none. Marking these in the AX text is critical —
    // without it the planner sees a perfectly-named "Apply" button and
    // tries to click it, then Playwright sits on the locator for 5s
    // waiting for it to become enabled and times out (Facebook's
    // Marketplace location filter does this: Apply stays aria-disabled
    // until you pick a suggestion from the autocomplete dropdown).
    function disabled(el) {
      if (el.disabled) return true;
      const aria = el.getAttribute('aria-disabled');
      if (aria === 'true') return true;
      const cs = getComputedStyle(el);
      if (cs.pointerEvents === 'none') return true;
      return false;
    }
    // Suggestion detection: an option/menuitem/listitem inside a listbox/
    // menu/combobox container is an autocomplete dropdown entry. Mirroring
    // the (disabled) flag with a (suggestion) flag gives the planner a
    // stable keyword to anchor on regardless of how clean the accessible-
    // name extraction is. Critical for the SEARCH/LOCATION FORM pattern
    // where the planner needs to pick an option to un-disable Apply.
    function suggestion(el, role) {
      if (role !== 'option' && role !== 'menuitem' && role !== 'listitem') {
        return false;
      }
      let p = el.parentElement;
      // Walk up a bounded number of ancestors — autocomplete containers
      // are typically 1-3 levels above the option. Don't traverse the
      // whole tree (every page has a body element).
      for (let i = 0; i < 6 && p; i++) {
        const r = p.getAttribute('role');
        if (r === 'listbox' || r === 'menu' || r === 'combobox') return true;
        p = p.parentElement;
      }
      return false;
    }

    // Reset previous refs so we don't accumulate stale tags across snapshots.
    document.querySelectorAll('[data-holo-ref]').forEach(e => e.removeAttribute('data-holo-ref'));

    const elements = Array.from(document.querySelectorAll(interactiveSel))
      .filter(visible);

    let counter = 1;
    const lines = [];
    for (const el of elements) {
      const ref = 'e' + counter;
      el.setAttribute('data-holo-ref', ref);
      const role = roleOf(el);
      const name = nameOf(el).trim().replace(/\\s+/g, ' ').slice(0, 80);
      const isDisabled = disabled(el);
      let flags = '';
      if (isDisabled) {
        flags = ' (disabled)';
      } else if (suggestion(el, role)) {
        flags = ' (suggestion)';
      } else if (role === 'file-input') {
        // Discoverability cue: tells the orchestrator to use
        // browser_set_input_files for this ref, NOT browser_click
        // (which would open the native picker we're trying to skip)
        // and NOT agent_do (vision-grounded file dialogs are the
        // single biggest source of upload failures). Surface accept=
        // and the multi-file flag so the orchestrator knows what
        // file(s) to pass.
        const accept = el.getAttribute('accept') || '';
        const multi = el.multiple ? ' multi-file' : '';
        flags = ' (use browser_set_input_files' +
          (accept ? ', accepts=' + accept : '') +
          multi + ')';
      }
      lines.push('[' + ref + '] ' + role + (name ? ' "' + name + '"' : '') + flags);
      counter++;
    }
    return {
      url: location.href,
      title: document.title || '',
      ax: lines.join('\\n') || '(no interactive elements visible)',
    };
  })()`;
})();
const PROBE_TIMEOUT_MS = 1500;
async function createPlaywriterClient(cfg = {}) {
  const state = {
    modules: null,
    relayStarted: false,
    browser: null,
    page: null,
    refSet: /* @__PURE__ */ new Set(),
    lastStatusKey: "",
    bootPromise: null
  };
  function emitStatus(key, text) {
    if (state.lastStatusKey === key) return;
    state.lastStatusKey = key;
    cfg.onStatus?.(text);
    console.log(`[browser] ${text}`);
  }
  async function startRelay() {
    if (!state.modules) state.modules = await tryLoadModules();
    if (!state.modules) {
      emitStatus(
        "no-modules",
        "Browser control unavailable — playwriter / playwright-core not installed."
      );
      return false;
    }
    if (state.relayStarted) return true;
    const existing = await fetchRelayExtensions();
    if (existing !== null) {
      state.relayStarted = true;
      console.log(
        `[browser] reusing existing Playwriter relay on :19988 (${existing.length} extension connection${existing.length === 1 ? "" : "s"})`
      );
      return true;
    }
    try {
      if (!process.env.PLAYWRITER_AUTO_ENABLE) {
        process.env.PLAYWRITER_AUTO_ENABLE = "1";
      }
      const started = await Promise.race([
        state.modules.pw.startPlayWriterCDPRelayServer().then(() => true).catch(() => "error"),
        new Promise(
          (resolve) => setTimeout(() => resolve("timeout"), 3e3)
        )
      ]);
      if (started === true) {
        state.relayStarted = true;
        console.log(
          `[browser] Playwriter relay started (PLAYWRITER_AUTO_ENABLE=${process.env.PLAYWRITER_AUTO_ENABLE})`
        );
        return true;
      }
      emitStatus(
        "relay-failed",
        started === "timeout" ? "Browser relay failed to start (timed out after 3s — is :19988 owned by another process?)" : "Browser relay failed to start."
      );
      return false;
    } catch (e) {
      emitStatus(
        "relay-failed",
        `Browser relay failed to start: ${e instanceof Error ? e.message : String(e)}`
      );
      return false;
    }
  }
  async function connectIfPossible() {
    if (!state.modules) return false;
    if (state.browser && state.page && !state.page.isClosed()) {
      return true;
    }
    if (cfg.cdpUrl) {
      try {
        const browser2 = await state.modules.core.chromium.connectOverCDP(
          cfg.cdpUrl
        );
        const ctx = browser2.contexts()[0];
        if (!ctx) {
          await browser2.close().catch(() => {
          });
          emitStatus("no-tab", "CDP endpoint has no browser context yet.");
          return false;
        }
        const pages = ctx.pages();
        const real = pages.filter((p) => !isWelcomeTab(p) && !p.isClosed());
        const page2 = real[0] ?? pages[0] ?? await ctx.newPage();
        state.browser = browser2;
        state.page = page2;
        emitStatus("connected", `Connected (no-ext) — ${page2.url() || "ready"}.`);
        return true;
      } catch (e) {
        emitStatus(
          "connect-failed",
          `Direct CDP connect failed: ${e instanceof Error ? e.message : String(e)}`
        );
        state.browser = null;
        state.page = null;
        return false;
      }
    }
    try {
      const extensions = await fetchRelayExtensions();
      const chosen = extensions ? pickBestExtension(extensions) : null;
      if (extensions && extensions.length === 0) {
        emitStatus(
          "no-extension",
          "Open Chrome and install the Playwriter extension, then click its icon on the tab you want me to control."
        );
        return false;
      }
      const cdpUrl = chosen ? state.modules.pw.getCdpUrl({ extensionId: chosen.extensionId }) : state.modules.pw.getCdpUrl();
      const browser2 = await state.modules.core.chromium.connectOverCDP(
        cdpUrl
      );
      const ctx = browser2.contexts()[0];
      if (!ctx) {
        await browser2.close().catch(() => {
        });
        emitStatus(
          "no-tab",
          "Click the Playwriter extension icon on the Chrome tab you want me to control (it turns green)."
        );
        return false;
      }
      const pages = ctx.pages();
      const realPages = pages.filter(
        (p) => !isWelcomeTab(p) && !p.isClosed()
      );
      let page2;
      if (realPages.length > 0) {
        page2 = realPages[0];
      } else if (pages.length > 0) {
        page2 = pages[0];
      } else {
        page2 = await ctx.newPage();
      }
      state.browser = browser2;
      state.page = page2;
      emitStatus(
        "connected",
        `Connected to Chrome — ${page2.url() || "ready"}.`
      );
      return true;
    } catch (e) {
      emitStatus(
        "connect-failed",
        `Connecting to Chrome failed: ${e instanceof Error ? e.message : String(e)}`
      );
      state.browser = null;
      state.page = null;
      return false;
    }
  }
  async function ensureChrome() {
    if (cfg.cdpUrl) {
      if (!state.modules) state.modules = await tryLoadModules();
      if (!state.modules) return false;
      return await connectIfPossible();
    }
    if (!await startRelay()) return false;
    return await connectIfPossible();
  }
  async function withTimeout2(p, ms, fallback) {
    return await Promise.race([
      p,
      new Promise((resolve) => setTimeout(() => resolve(fallback), ms))
    ]);
  }
  function refToSelector(ref) {
    return `[data-holo-ref="${ref}"]`;
  }
  async function highlightRef(page2, ref, label) {
    const sel = refToSelector(ref);
    try {
      await page2.evaluate(
        (rawArg) => {
          const args = rawArg;
          const findVisible = (start) => {
            let cur = start;
            for (let i = 0; cur && i < 6; i++) {
              const r = cur.getBoundingClientRect();
              if (r.width > 4 && r.height > 4) return cur;
              cur = cur.parentElement;
            }
            return start;
          };
          try {
            const raw = document.querySelector(args.sel);
            const el = findVisible(raw);
            if (!el) return;
            el.scrollIntoView({
              block: "center",
              inline: "center",
              behavior: "instant"
            });
            const r = el.getBoundingClientRect();
            const overlay = document.createElement("div");
            overlay.setAttribute("data-holo-highlight", "1");
            Object.assign(overlay.style, {
              position: "fixed",
              left: `${Math.max(0, r.left - 4)}px`,
              top: `${Math.max(0, r.top - 4)}px`,
              width: `${Math.max(8, r.width + 8)}px`,
              height: `${Math.max(8, r.height + 8)}px`,
              pointerEvents: "none",
              border: "3px solid #00e676",
              borderRadius: "6px",
              boxShadow: "0 0 0 2px rgba(0, 230, 118, 0.35), 0 0 14px rgba(0, 230, 118, 0.55)",
              zIndex: "2147483647",
              transition: "opacity 200ms ease-out",
              opacity: "0",
              background: "rgba(0, 230, 118, 0.08)"
            });
            document.documentElement.appendChild(overlay);
            requestAnimationFrame(() => {
              overlay.style.opacity = "1";
            });
            if (args.label) {
              const cap = document.createElement("div");
              Object.assign(cap.style, {
                position: "absolute",
                left: "0px",
                top: r.top < 28 ? `${r.height + 6}px` : "-22px",
                background: "#00c853",
                color: "white",
                font: "12px/1 -apple-system, BlinkMacSystemFont, sans-serif",
                padding: "4px 6px",
                borderRadius: "4px",
                whiteSpace: "nowrap",
                maxWidth: "320px",
                overflow: "hidden",
                textOverflow: "ellipsis"
              });
              cap.textContent = args.label.slice(0, 80);
              overlay.appendChild(cap);
            }
            window.setTimeout(() => {
              overlay.style.opacity = "0";
              window.setTimeout(() => overlay.remove(), 220);
            }, 550);
          } catch {
          }
        },
        { sel, label: label ?? null }
      );
      await new Promise((resolve) => setTimeout(resolve, 180));
    } catch {
    }
  }
  async function activePage() {
    if (!await ensureChrome()) return null;
    return state.page;
  }
  async function syncToVisibleTab(page2) {
    const isVisible = async (p) => {
      try {
        return await p.evaluate("document.visibilityState") === "visible";
      } catch {
        return false;
      }
    };
    try {
      if (await isVisible(page2)) return page2;
      const ctx = state.browser?.contexts()[0];
      const siblings = ctx ? ctx.pages().filter((p) => !p.isClosed() && !isWelcomeTab(p)) : [];
      for (const p of siblings) {
        if (p === page2) continue;
        if (await isVisible(p)) {
          emitStatus(
            "tab-follow",
            `Following the visible Chrome tab: ${p.url()}`
          );
          state.page = p;
          return p;
        }
      }
      await page2.bringToFront();
    } catch {
    }
    return page2;
  }
  return {
    async available() {
      if (!state.bootPromise) {
        state.bootPromise = withTimeout2(ensureChrome(), PROBE_TIMEOUT_MS, false);
      }
      const ok = await state.bootPromise;
      state.bootPromise = null;
      return ok;
    },
    async snapshot() {
      let page2 = await activePage();
      if (!page2) throw new Error("[browser] no active Chrome tab");
      page2 = await syncToVisibleTab(page2);
      const result = await page2.evaluate(SNAPSHOT_SCRIPT);
      state.refSet.clear();
      for (const m of result.ax.matchAll(/^\[(e\d+)\]/gm)) {
        state.refSet.add(m[1]);
      }
      return result;
    },
    async isActive() {
      const page2 = await activePage();
      if (!page2) return false;
      try {
        return await page2.evaluate("document.visibilityState") === "visible";
      } catch {
        return false;
      }
    },
    // Bring the CONTROLLED tab's window+tab to the foreground. Used when
    // the screenshot shows a DIFFERENT tab than browser_* controls (the
    // controlled tab is a background tab, often in another Chrome window).
    // page.bringToFront() activates the tab AND raises its window, so
    // vision actions then hit the real page. Best-effort.
    async bringToFront() {
      const page2 = await activePage();
      if (!page2) return;
      try {
        await page2.bringToFront();
      } catch {
      }
    },
    async geometry() {
      const page2 = await activePage();
      if (!page2) return null;
      try {
        const g = await page2.evaluate(
          `({ sx: window.screenX, sy: window.screenY, ow: window.outerWidth,
              oh: window.outerHeight, iw: window.innerWidth,
              ih: window.innerHeight, dpr: window.devicePixelRatio })`
        );
        const borderX = Math.max(0, (g.ow - g.iw) / 2);
        return {
          window: { x: g.sx, y: g.sy, width: g.ow, height: g.oh },
          viewport: {
            x: g.sx + borderX,
            y: g.sy + (g.oh - g.ih) - borderX,
            width: g.iw,
            height: g.ih
          },
          devicePixelRatio: g.dpr
        };
      } catch {
        return null;
      }
    },
    async screenshot() {
      const page2 = await activePage();
      if (!page2) return null;
      try {
        const buf = await page2.screenshot({ type: "png", fullPage: false });
        const dims = pngDimensions$1(buf);
        return {
          pngB64: buf.toString("base64"),
          // DEVICE-pixel dims (Retina = 2× CSS). The caller scales by
          // imgW / window.innerWidth to recover CSS px for elementFromPoint.
          width: dims?.width ?? 0,
          height: dims?.height ?? 0
        };
      } catch {
        return null;
      }
    },
    async click(ref) {
      const page2 = await activePage();
      if (!page2) throw new Error("[browser] no active Chrome tab");
      await highlightRef(page2, ref, `click ${ref}`);
      await page2.locator(refToSelector(ref)).click({ timeout: 2e3 });
    },
    async type(ref, text, opts) {
      const page2 = await activePage();
      if (!page2) throw new Error("[browser] no active Chrome tab");
      const labelText = text.length > 24 ? text.slice(0, 24) + "…" : text;
      await highlightRef(page2, ref, `type "${labelText}" → ${ref}`);
      const loc = page2.locator(refToSelector(ref));
      await loc.click({ timeout: 2e3 });
      await loc.fill(text);
      if (opts?.submit) await loc.press("Enter");
    },
    async setInputFiles(ref, paths) {
      const page2 = await activePage();
      if (!page2) throw new Error("[browser] no active Chrome tab");
      const resolved = [];
      for (const p of paths) {
        const r = await resolveFilePathTolerant(p);
        if (r.viaFuzz) {
          console.log(
            `[browser] setInputFiles: literal path "${p}" not found; fuzz-matched to "${r.resolved}"`
          );
        }
        resolved.push(r.resolved);
      }
      const fileLabel = resolved.length === 1 ? `upload ${path__namespace.basename(resolved[0])} → ${ref}` : `upload ${resolved.length} files → ${ref}`;
      await highlightRef(page2, ref, fileLabel);
      await page2.locator(refToSelector(ref)).setInputFiles(resolved);
    },
    async scrollElement(ref, dir, amount) {
      const page2 = await activePage();
      if (!page2) throw new Error("[browser] no active Chrome tab");
      const sel = refToSelector(ref);
      const px = (amount ?? 600) * (dir === "down" ? 1 : -1);
      await page2.evaluate(
        (args) => {
          const a = args;
          const el = document.querySelector(a.sel);
          if (el && "scrollBy" in el) {
            el.scrollBy(0, a.px);
          } else if (el) {
            el.scrollTop += a.px;
          }
        },
        { sel, px }
      );
    },
    async scrollPage(dir, amount) {
      const page2 = await activePage();
      if (!page2) throw new Error("[browser] no active Chrome tab");
      const px = (amount ?? 800) * (dir === "down" ? 1 : -1);
      await page2.evaluate(
        (arg) => {
          const a = arg;
          window.scrollBy({ top: a.px, behavior: "instant" });
        },
        { px }
      );
    },
    async evaluate(expression) {
      const page2 = await activePage();
      if (!page2) throw new Error("[browser] no active Chrome tab");
      return await page2.evaluate(expression);
    },
    async readText(ref) {
      const page2 = await activePage();
      if (!page2) throw new Error("[browser] no active Chrome tab");
      if (ref) return await page2.locator(refToSelector(ref)).innerText();
      const text = await page2.evaluate(`
        (() => {
          const SKIP_SEL =
            'nav,header,footer,aside,' +
            '[role="navigation"],[role="banner"],[role="contentinfo"],' +
            '[role="complementary"],[role="search"],[role="dialog"],' +
            '[aria-hidden="true"],' +
            'script,style,noscript,svg,iframe,template,link[rel],meta';
          const BLOCK = new Set([
            'DIV','P','SECTION','ARTICLE','LI','TR','TD','TH','BR','HR',
            'H1','H2','H3','H4','H5','H6','UL','OL','BLOCKQUOTE','PRE',
            'MAIN','FIGURE','FORM','LABEL','FIELDSET',
          ]);
          const out = [];
          function walk(node) {
            if (!node) return;
            if (node.nodeType === 3) {
              const v = node.nodeValue;
              if (v && v.trim()) out.push(v);
              return;
            }
            if (node.nodeType !== 1) return;
            // Skip chrome (nav/header/footer/etc.) AND visibility-hidden
            // (CSS display:none / visibility:hidden) elements that the
            // user can't see but innerText would still miss anyway.
            if (node.matches && node.matches(SKIP_SEL)) return;
            // We don't call getComputedStyle (would be 1000s of calls
            // on a long page); rely on the SKIP_SEL list to catch the
            // big offenders.
            const tag = node.tagName;
            const isBlock = BLOCK.has(tag);
            if (isBlock) out.push('\\n');
            for (const child of node.childNodes) walk(child);
            // Annotate links inline: "Title (https://...)".
            if (tag === 'A') {
              const href = node.getAttribute('href');
              if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
                let abs = href;
                try { abs = new URL(href, location.href).href; } catch (_) {}
                out.push(' (' + abs + ')');
              }
            }
            if (isBlock) out.push('\\n');
          }
          const root =
            document.querySelector('main') ||
            document.querySelector('[role="main"]') ||
            document.querySelector('[role="feed"]') ||
            document.body;
          if (!root) return '';
          walk(root);
          // Collapse runs of whitespace/newlines so we don't burn LLM
          // tokens on the formatting. Keep paragraph breaks.
          return out
            .join('')
            .replace(/[ \\t]+/g, ' ')
            .replace(/ *\\n */g, '\\n')
            .replace(/\\n{3,}/g, '\\n\\n')
            .trim();
        })()
      `);
      return text.length > 5e4 ? text.slice(0, 5e4) + "\n…(truncated)" : text;
    },
    async navigate(url) {
      const page2 = await activePage();
      if (!page2) throw new Error("[browser] no active Chrome tab");
      await page2.goto(url);
    },
    async newTab(url) {
      const ensured = await activePage();
      if (!ensured || !state.browser) throw new Error("[browser] not connected to Chrome");
      const ctx = state.browser.contexts()[0];
      if (!ctx) throw new Error("[browser] no active Chrome context");
      const page2 = await ctx.newPage();
      state.page = page2;
      if (url) await page2.goto(url);
    },
    async listTabs() {
      const ensured = await activePage();
      if (!ensured || !state.browser) return [];
      const ctx = state.browser.contexts()[0];
      if (!ctx) return [];
      const allPages = ctx.pages();
      const titles = await Promise.all(
        allPages.map(
          (p) => p.isClosed() ? Promise.resolve("") : p.title().catch(() => "")
        )
      );
      const tabs = [];
      for (let i = 0; i < allPages.length; i++) {
        const p = allPages[i];
        if (p.isClosed()) continue;
        if (isWelcomeTab(p)) continue;
        tabs.push({
          index: i,
          url: p.url(),
          title: titles[i] ?? "",
          isCurrent: p === state.page
        });
      }
      return tabs;
    },
    async switchTab(opts) {
      const ensured = await activePage();
      if (!ensured || !state.browser) {
        throw new Error("[browser] not connected to Chrome");
      }
      const ctx = state.browser.contexts()[0];
      if (!ctx) throw new Error("[browser] no active Chrome context");
      const allPages = ctx.pages();
      let target = null;
      let targetIndex = -1;
      let matchReason = "";
      if (typeof opts.index === "number") {
        if (opts.index < 0 || opts.index >= allPages.length) {
          throw new Error(
            `[browser] no tab at index ${opts.index} (have ${allPages.length} tabs total)`
          );
        }
        const p = allPages[opts.index];
        if (p.isClosed()) {
          throw new Error(
            `[browser] tab at index ${opts.index} is closed`
          );
        }
        if (isWelcomeTab(p)) {
          throw new Error(
            `[browser] tab at index ${opts.index} is a welcome tab; pick a real tab`
          );
        }
        target = p;
        targetIndex = opts.index;
        matchReason = `index ${opts.index}`;
      } else if (opts.urlIncludes) {
        const needle = opts.urlIncludes.toLowerCase();
        for (let i = 0; i < allPages.length; i++) {
          const p = allPages[i];
          if (p.isClosed() || isWelcomeTab(p)) continue;
          if (p.url().toLowerCase().includes(needle)) {
            target = p;
            targetIndex = i;
            matchReason = `urlIncludes "${opts.urlIncludes}"`;
            break;
          }
        }
      } else if (opts.pattern) {
        let regex;
        try {
          regex = new RegExp(opts.pattern, "i");
        } catch (e) {
          throw new Error(
            `[browser] invalid regex pattern: ${e instanceof Error ? e.message : String(e)}`
          );
        }
        for (let i = 0; i < allPages.length; i++) {
          const p = allPages[i];
          if (p.isClosed() || isWelcomeTab(p)) continue;
          if (regex.test(p.url())) {
            target = p;
            targetIndex = i;
            matchReason = `pattern /${opts.pattern}/i`;
            break;
          }
        }
      } else {
        throw new Error(
          "[browser] switchTab requires one of: index, urlIncludes, pattern"
        );
      }
      if (!target) {
        const attached = allPages.map(
          (p, i) => p.isClosed() || isWelcomeTab(p) ? null : `  [${i}] ${p.url()}`
        ).filter(Boolean).join("\n");
        throw new Error(
          `[browser] no attached tab matched (criterion: ${matchReason || JSON.stringify(opts)}).
Currently attached:
${attached || "  (none)"}`
        );
      }
      state.page = target;
      try {
        await target.bringToFront();
      } catch {
      }
      let title = "";
      try {
        title = await target.title();
      } catch {
      }
      console.log(
        `[browser] switched to tab ${targetIndex} (${matchReason}): ${target.url()}`
      );
      return {
        index: targetIndex,
        url: target.url(),
        title,
        isCurrent: true
      };
    },
    // AGP thin-driver hooks. Return the LIVE Playwright objects (full API,
    // not the minimal PWPage/PWBrowser shape-types) so the AGP CommandExecutor
    // can drive mouse/keyboard/screenshot/locators directly. ensureChrome()
    // reuses all the relay + connection + extension-disambiguation logic.
    async rawPage() {
      return await activePage();
    },
    async rawContext() {
      if (!await ensureChrome()) return null;
      return state.browser?.contexts()[0] ?? null;
    },
    async close() {
      if (state.browser) {
        try {
          await state.browser.close();
        } catch {
        }
      }
      state.browser = null;
      state.page = null;
      state.bootPromise = null;
      state.refSet.clear();
    }
  };
}
const PREF_DIR = path__namespace.join(os__namespace.homedir(), ".holo3-agent");
const PREF_FILE = path__namespace.join(PREF_DIR, "preferences.json");
function readAll() {
  try {
    const raw = fs__namespace.readFileSync(PREF_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
  }
  return {};
}
function writeAll(prefs) {
  try {
    fs__namespace.mkdirSync(PREF_DIR, { recursive: true });
    fs__namespace.writeFileSync(PREF_FILE, JSON.stringify(prefs, null, 2));
  } catch {
  }
}
function getProviderPreference() {
  const prefs = readAll();
  const v = prefs.provider;
  if (v === "hcompany" || v === "remote" || v === "local") return v;
  return null;
}
function setProviderPreference(name) {
  const prefs = readAll();
  prefs.provider = name;
  writeAll(prefs);
}
function getEnginePreference() {
  const prefs = readAll();
  return prefs.engine === "agp" ? "agp" : "composite";
}
function getAutoReplayPreference() {
  return readAll().autoReplay !== false;
}
function stripThink(text) {
  let out = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const openIdx = out.indexOf("<think>");
  if (openIdx !== -1) out = out.slice(0, openIdx);
  out = out.replace(/^\s*<\/think>\s*/i, "");
  return out.trim();
}
const CLICK_COORDINATES_SCHEMA = {
  type: "object",
  properties: {
    x: { type: "integer", description: "The x coordinate (0-1000)." },
    y: { type: "integer", description: "The y coordinate (0-1000)." }
  },
  required: ["x", "y"],
  additionalProperties: false
};
function createHCompanyProvider(cfg) {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  const baseUrl = cfg.baseUrl ?? "https://api.hcompany.ai/v1";
  const model = cfg.model ?? "holo3-1-35b-a3b";
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg.apiKey}`
  };
  async function chatCompletion(body, timeoutMs = 6e4, externalSignal) {
    if (!cfg.apiKey || !cfg.apiKey.trim()) {
      throw new Error(
        "HAI_API_KEY not set. Get one at https://hub.hcompany.ai (Portal-H), add `HAI_API_KEY=hai_...` to your .env, then restart the app."
      );
    }
    let attempt = 0;
    const maxAttempts = 3;
    while (true) {
      if (externalSignal?.aborted) {
        throw new Error("hcompany cancelled");
      }
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const onExternalAbort = () => ctrl.abort();
      externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
      let res;
      try {
        res = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify({ model, ...body }),
          signal: ctrl.signal
        });
      } catch (e) {
        if (externalSignal?.aborted) {
          throw new Error("hcompany cancelled");
        }
        const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "fetch failed";
        throw new Error(`hcompany network: ${msg}`);
      } finally {
        clearTimeout(t);
        externalSignal?.removeEventListener("abort", onExternalAbort);
      }
      if (res.ok) return await res.json();
      const text = await res.text().catch(() => "");
      if (res.status === 401) {
        throw new Error(
          `hcompany 401 unauthorized — check HAI_API_KEY. body: ${text.slice(0, 200)}`
        );
      }
      if (res.status === 404) {
        throw new Error(
          `hcompany 404 — model "${model}" not found at ${baseUrl}. body: ${text.slice(0, 200)}`
        );
      }
      if (res.status === 429 && attempt < maxAttempts) {
        const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
        const wait = retryAfter ?? Math.min(15e3, 2e3 * 2 ** attempt);
        console.warn(
          `[hcompany] 429 rate limit — backing off ${wait}ms (attempt ${attempt + 1}/${maxAttempts})`
        );
        await new Promise((r) => setTimeout(r, wait));
        attempt++;
        continue;
      }
      throw new Error(`hcompany ${res.status}: ${text.slice(0, 400)}`);
    }
  }
  function parseRetryAfter(header) {
    if (!header) return null;
    const n = Number(header);
    if (Number.isFinite(n)) return Math.max(0, Math.round(n * 1e3));
    const date = Date.parse(header);
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
    return null;
  }
  function imageContent(screenshotB64) {
    if (!screenshotB64) return [];
    return [
      {
        type: "image_url",
        image_url: { url: `data:image/png;base64,${screenshotB64}` }
      }
    ];
  }
  return {
    name: "hcompany",
    async warm() {
      const t0 = Date.now();
      await chatCompletion(
        {
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 4,
          temperature: 0
        },
        15e3
      );
      return { ready: true, warmSeconds: (Date.now() - t0) / 1e3 };
    },
    async plan(args) {
      const items = args.history;
      const historyBlock = items.length === 0 ? "(none — this is step 1)" : items.map((h, i) => i === items.length - 1 ? `${h}  ← last` : h).join("\n");
      const dupWarning = args.history.length >= 2 && args.history.at(-1) === args.history.at(-2) ? "\nCRITICAL WARNING: your last action was repeated. If the screen did not change, switch strategy or return DONE." : "";
      const system = `You are the Brain of a computer-use agent. Look at the screenshot and decide the SINGLE next action.

Allowed actions — emit EXACTLY one of these on its own line:
  - click <thing>            (single left click)
  - double click <thing>
  - type "text"              (text in straight double-quotes)
  - press KEY                (e.g. press enter, press esc)
  - hotkey KEY+KEY           (e.g. hotkey cmd+space)
  - drag <source> to <target>  (drag-and-drop one element onto another)
  - scroll up | scroll down  (optionally with N steps)
  - wait Ns                  (when waiting for an app to load)
  - DONE                     (when the user's goal is visibly achieved)

TOOL CHOICE — DEFAULT to keyboard / CLI-style verbs (~70% of actions);
use mouse / browser.click for the ~30% of steps where it's strictly
necessary. CLI-style verbs are: hotkey, press, type, browser.navigate,
browser.type. Mouse verbs are: click, double click, browser.click.
If the user's task names a different ratio (e.g. 'use cli 90% of the
time'), HONOR THAT — they know their workflow. Do not override the
user's stated preference with a mouse click when a keyboard path
exists.

KEYBOARD / CLI wins for (the 70%):
  • App switching: hotkey cmd+tab (cycle), hotkey cmd+\`  (windows)
  • App launching: hotkey cmd+space → type name → press enter
  • Window/tab management: hotkey cmd+w, cmd+q, cmd+t
  • Browser address bar focus: hotkey cmd+l → type URL → press enter
    (or just emit browser.navigate <url> directly — even more CLI-ish)
  • In-page find: hotkey cmd+f → type query → press enter
  • Field navigation: press tab / shift+tab between inputs
  • Dismissing popovers / modals: press esc
  • Filling text fields: type or browser.type — never click-then-click
    when the field is already focused.
  • Submitting a form THAT IS keyboard-bindable (one focused field,
    standard 'Enter to submit' pattern). NOT for forms gated on a
    suggestion pick — see SEARCH/LOCATION FORM below.

MOUSE / browser.click wins for (the 30%):
  • Picking a SPECIFIC item from a list (search-result card, dropdown
    suggestion, listing tile, sidebar entry) — these need an exact
    target, not a key.
  • Toggling a custom button, link, switch, or non-keyboard-bindable
    control where 'press enter' would be ambiguous.
  • Anywhere multiple fields could compete for keyboard focus and
    typing into the wrong one would be silent.
  • The third leg of TYPE → CLICK SUGGESTION → CLICK APPLY (see below).

When in doubt: pick the KEYBOARD/CLI option. The keyboard path is
faster, doesn't fight the OS cursor, and reads like a CLI command —
which matches how the user thinks about most tasks.

BROWSER TOOLS — when a Chrome page snapshot is attached to the user
message, you have a SECOND set of verbs targeting page elements by
accessibility ref. Use these for IN-PAGE web actions; use the OS-level
hotkey/press only for OS switching (Spotlight, cmd+tab, cmd+space).
  - browser.navigate <url>      open a URL in the active tab
  - browser.click <eN>          click an element by ref (e.g. browser.click e12)
  - browser.type <eN> "text"    type into a field by ref
  - browser.scroll page down    scroll the viewport (use this, not OS scroll)
  - browser.read [<eN>]         read page or element text
PREFER browser.* over click/type when a snapshot is available — refs are
exact (no grounding error) and disabled refs are flagged in the snapshot.

SEARCH SCOPES — there are THREE different 'search' surfaces and they
serve DIFFERENT purposes. Picking the wrong one is a common failure
(typing 'facebook marketplace toyota camry' into Spotlight just opens
a local file search). Always identify the scope FIRST.

1. OS / SYSTEM SEARCH — the OS-level launcher.
   • macOS: Spotlight (top of screen). Trigger: hotkey cmd+space.
   • Windows: Start search (bottom). Trigger: press win.
   • USE FOR: launching an app that isn't running ('open Chrome',
     'open Calculator'), or finding a local file by name.
   • DO NOT USE FOR: web search or in-site search.

2. BROWSER ADDRESS BAR — the URL field at the top of the active tab.
   • Trigger: hotkey cmd+l → type URL → press enter,
     OR: browser.navigate <url> when a snapshot is attached.
   • USE FOR: jumping to a known URL (facebook.com/marketplace,
     amazon.com), or a generic Google search via the omnibox when no
     specific site applies.
   • DO NOT USE FOR: searching INSIDE a site that has its own search
     UI — you'd get Google results, not Marketplace listings.

3. PAGE / SITE SEARCH — a search bar/box rendered by the website.
   • Trigger: browser.click <search-input-ref> → browser.type → pick a
     suggestion ref → click submit/apply (see SEARCH/LOCATION FORM).
   • USE FOR: searching Facebook Marketplace listings, Amazon products,
     YouTube videos, Gmail messages — anywhere the site has its own
     search UI with site-specific filters and results.
   • The page may have MULTIPLE site-search bars (top header search,
     left-rail filter search, modal search). Pick the one whose name
     matches the goal: 'Search Marketplace' for Marketplace, not the
     generic top-of-page Facebook search.

TYPICAL FLOW for 'find X on site Y':
  a. Foreground Chrome — hotkey cmd+tab if it's already running, else
     hotkey cmd+space → 'chrome' → press enter.
  b. Land on site Y — browser.navigate https://y.com OR hotkey cmd+l
     → type URL → press enter.
  c. Use Y's OWN search bar — browser.click on the page search input,
     browser.type the query, pick a suggestion, then submit/apply.

SEARCH / LOCATION FORM — TYPE → CLICK SUGGESTION → CLICK APPLY.
A "(disabled)" ref is UNCLICKABLE — clicking wastes 5s on a Playwright timeout.
When you typed into a search/location/combobox field and the submit button
(Apply / Search / Confirm) is disabled, your NEXT action MUST be
browser.click on a "(suggestion)" ref (or any role: option / menuitem /
listitem / link in the dropdown), NOT the disabled button, NOT pressing enter.

  Snapshot:
    [e86] textbox "Location"
    [e91] option "Marietta, GA, United States" (suggestion)
    [e90] button "Apply" (disabled)
  Last action: browser.type e86 "Marietta, GA"
    Wrong: browser.click e90       ← it's disabled, this hangs for 5s
    Wrong: press enter             ← submit is via the button, not enter
    Right: browser.click e91       ← Apply un-disables on the next snapshot

LIST TASKS — when the user asked for N items ('find 3 listings', 'list
the top 5 products', 'show me 4 jobs'), do NOT stop at the search-results
page. The search-results page only shows TITLES + PRICES; the user wants
DETAILS (description, location, posting date, seller, full price). For
each of the N items:
  1. browser.click the listing card to open its detail page.
  2. browser.read once the detail page loads — this captures the full
     copy that the closer will use to summarize.
  3. Either press the browser back button or click the next listing in
     the results — keep going until you've opened all N.
Only emit DONE after the Nth detail page has been read. Stopping at the
search-results page is a partial-credit failure — the closer will say
'I found N listings but couldn't open them' and the user has to redo it.

STUCK RECOVERY — when an action keeps failing, SWITCH MODES instead of
retrying the same verb. Look at the most recent history line: if it
ends with \`(failed: ...)\` or \`(rejected: ...)\`, your last attempt did
not work and re-emitting the same verb won't either.
  • browser.click <ref> failed twice in a row (overlay intercepts,
    locator timeout, ref vanished) → switch to vision: emit
    'click on the <description>' so the grounder picks pixel coords
    from the screenshot. The mouse path uses cliclick / nut-js and
    bypasses the overlay/ref problem entirely.
  • browser.navigate <url> redirected → DO NOT re-emit the same URL
    (the runtime guard rejects it anyway). Either accept the redirected
    URL and use the page's on-page filters, or VISION_NEEDED.
  • browser.type into a focused field did nothing → the field may not
    actually be focused. Try \`click on the <field name>\` first, then
    type on the next step.
  • Same action repeated 2+ times in history → STOP and try a DIFFERENT
    verb (mouse instead of keyboard, vision instead of refs, scroll
    instead of click). The 70/30 keyboard/mouse default is a default,
    NOT a constraint when stuck.

DRAG AND DROP — use when an element needs to MOVE, not be clicked:
  drag the file icon to the trash
  drag the slider handle to the right end
  drag the email to the archive folder
  drag the rectangle to the canvas
Both endpoints (source and destination) must be visible on screen.
If the destination is off-screen, scroll first.

FORMAT RULES — these are non-negotiable:
  • Use the simple verb form: type "search" — NOT type({"text":"search"})
  • Do NOT chain actions. NEVER write \`type X and press enter\`. If you
    need to press a key after typing, that's the NEXT step.
  • Do NOT wrap actions in JSON, code blocks, or function-call syntax.
  • One short imperative sentence. No prose, no quotes around the
    whole sentence, no markdown.
  • Your output MUST start with one of the allowed verbs above (click,
    double click, type, press, hotkey, drag, scroll, wait, DONE, or a
    browser.* verb). Anything else — explanation, meta-reasoning,
    repetition of the prompt, 'The last step was incorrect…' — is
    invalid and the runtime will reject the step.

HISTORY NOTATION — lines in Action history that start with \`[note: …]\`
are SYSTEM OBSERVATIONS about your prior steps (rejected clicks,
redirects, invalid output, failed executions). They are NOT prior
actions you emitted; do not quote them and do not echo them as your
next action. Read them as feedback, then emit a fresh action verb.

STOP CRITERIA — return DONE when ANY of these are true:
  • The user's goal is already visible on screen.
  • The requested app/window is now in the foreground.
  • Further actions would not bring you closer to the goal.
  • The CURRENT subtask is 'navigate to X' / 'open X' / 'go to X' AND
    the page on screen IS X (its URL canonical-matches). The previous
    navigate succeeded; emit DONE so the next subtask can run.
  • The CURRENT subtask is 'click X' / 'open X' / 'focus X' and X is
    now focused/open in the snapshot. Don't re-click what you already
    clicked.
If you are unsure whether the task is complete, prefer DONE over guessing more actions.

DO NOT REPEAT YOUR LAST ACTION when the page reflects that it already
succeeded. If you just emitted browser.navigate URL_X and the snapshot
now shows you're AT URL_X, the next action MUST be DONE (not the same
navigate again). The runtime will short-circuit a no-op navigate as
DONE anyway, so saving you the round-trip if you recognize it first.

Examples (good):
  hotkey cmd+tab
  click on the address bar
  type "figma stock"
  press enter
  drag the document.pdf icon to the trash
  DONE

Examples (BAD — never emit these):
  type({"text":"figma"}) and press enter   ← chained + JSON
  "click on the icon"                      ← outer quotes
  Click the search box, then type figma    ← multi-step prose
`;
      const userText = `USER GOAL: ${args.task}
Screen: ${args.screen[0]}x${args.screen[1]}
Action history (most recent last; \`[note: …]\` lines are system observations, not your prior actions):
${historyBlock}${dupWarning}

Compare the screenshot to the goal, then emit ONE action verb:
  • If the goal is already visible / achieved → emit DONE on its own.
  • If your last action did not change the screen → switch strategy or DONE.
  • Otherwise emit the SINGLE next action verb that moves toward the goal.
Your reply must START with one of: click | double click | type | press | hotkey | drag | scroll | wait | DONE | browser.* — nothing else.`;
      const out = await chatCompletion(
        {
          messages: [
            { role: "system", content: system },
            {
              role: "user",
              content: [
                ...imageContent(args.screenshotB64),
                { type: "text", text: userText }
              ]
            }
          ],
          temperature: 0.2,
          // Bumped from 128 → 256 so a slightly verbose model never gets cut
          // off mid-sentence. The completion is a single short action sentence;
          // 256 is more than enough but cheap.
          max_tokens: 256,
          // Holo3 has reasoning always on by default. Disable via the H Company
          // / vLLM convention: `chat_template_kwargs.enable_thinking: false`.
          // (We previously sent `thinking: false`, which the server silently
          // ignored — the model burned all 128 max-tokens inside an unclosed
          // <think> block and returned an empty string. See
          // https://hub.hcompany.ai → Quickstart for the canonical shape.)
          chat_template_kwargs: { enable_thinking: false }
        },
        6e4,
        args.signal
      );
      const text = out.choices[0]?.message.content?.trim() ?? "";
      const cleaned = stripThink(text);
      return { action: cleaned, usage: out.usage ?? {} };
    },
    async ground(args) {
      const out = await chatCompletion(
        {
          messages: [
            {
              role: "user",
              content: [
                ...imageContent(args.screenshotB64),
                {
                  type: "text",
                  text: `Click target: ${args.instruction}
Return the exact click coordinates as JSON {"x": <int 0-1000>, "y": <int 0-1000>} normalized to a 1000x1000 grid over the screenshot.`
                }
              ]
            }
          ],
          temperature: 0,
          // Same reasoning: bump max_tokens so a JSON object always fits.
          max_tokens: 256,
          // Disable reasoning via the canonical H Company field. Without this
          // the model wraps its answer in a <think> block that eats the budget
          // before any coordinates are emitted. (Was `thinking: false`, ignored.)
          chat_template_kwargs: { enable_thinking: false },
          // H Company's structured-output mode — guarantees parseable JSON
          // matching the schema. Replaces llama.cpp's GBNF grammar.
          structured_outputs: { json: CLICK_COORDINATES_SCHEMA }
        },
        6e4,
        args.signal
      );
      const raw = out.choices[0]?.message.content?.trim() ?? "";
      const cleaned = stripThink(raw);
      let rx = 0;
      let ry = 0;
      try {
        const parsed = JSON.parse(cleaned);
        rx = Math.round(Number(parsed.x));
        ry = Math.round(Number(parsed.y));
      } catch {
        const nums = cleaned.match(/\d+/g);
        if (!nums || nums.length < 2) {
          return { x: 0, y: 0, error: `could not parse coordinates: ${cleaned.slice(0, 120)}` };
        }
        rx = parseInt(nums[0], 10);
        ry = parseInt(nums[1], 10);
      }
      const x = rx <= 1e3 ? Math.round(rx / 1e3 * args.screen[0]) : rx;
      const y = ry <= 1e3 ? Math.round(ry / 1e3 * args.screen[1]) : ry;
      return {
        x: Math.max(0, Math.min(args.screen[0] - 1, x)),
        y: Math.max(0, Math.min(args.screen[1] - 1, y)),
        raw: [rx, ry]
      };
    }
  };
}
const PLAN_SYSTEM = `You are the Brain of a computer-use agent. Look at the screenshot and decide the SINGLE next action.

Allowed actions:
  - click <thing>            (single left click)
  - double click <thing>
  - type "text"
  - press KEY                (e.g. press enter, press esc, press cmd+space)
  - hotkey KEY+KEY           (e.g. hotkey cmd+tab to switch apps)
  - drag <source> to <target>  (drag-and-drop one element onto another)
  - scroll up | scroll down  (optionally with N steps)
  - wait Ns                  (when waiting for an app to load)
  - DONE                     (when the user's goal is visibly achieved)

PREFER KEYBOARD SHORTCUTS when they're faster or more reliable than clicking.
Useful ones on macOS:
  • hotkey cmd+tab     switch to another open app
  • hotkey cmd+space   open Spotlight, then type the app name + press enter
  • hotkey cmd+\`       cycle windows within the current app
  • hotkey cmd+w       close window
  • hotkey cmd+t       new tab (browsers)
  • press tab          move to next form field
  • press enter        submit the focused field
  • press esc          close popovers / cancel modals

DRAG when an element needs to MOVE, not just be clicked:
  drag the file icon to the trash
  drag the slider handle to the right end
  drag the email to the archive folder
Both endpoints must be visible on screen; if not, scroll first.

STOP CRITERIA — return DONE when ANY of these are true:
  • The user's goal is already visible on screen.
  • The requested app/window is now in the foreground.
  • Further actions would not bring you closer to the goal.
If unsure whether the task is complete, prefer DONE over guessing more actions.

Return ONLY one action sentence (or the literal word DONE). No commentary, no explanations, no lists.`;
const GROUND_SYSTEM = `You return (x,y) coordinates to click as JSON: {"x": <int 0-1000>, "y": <int 0-1000>}
where coordinates are normalized to a 1000x1000 grid over the screenshot.
Return ONLY the JSON object.`;
function createLocalProvider(cfg = {}) {
  const ollama$1 = new ollama.Ollama({
    host: cfg.host ?? process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434"
  });
  const model = cfg.model ?? process.env.OLLAMA_MODEL ?? "holo3";
  async function ensurePresent() {
    const list = await ollama$1.list();
    const present = list.models.some(
      (m) => m.name === model || m.name === `${model}:latest`
    );
    if (present) return;
    if (model === "holo3") {
      throw new Error(
        "Local model `holo3` not found in Ollama. Run `bash scripts/setup-local.sh` (downloads Holo3 GGUF + imports into Ollama)."
      );
    }
    const stream = await ollama$1.pull({ model, stream: true });
    for await (const _ of stream) {
    }
  }
  return {
    name: "local",
    async warm() {
      const t0 = Date.now();
      await ensurePresent();
      await ollama$1.generate({ model, prompt: "warmup", options: { num_predict: 1 } });
      return { ready: true, warmSeconds: (Date.now() - t0) / 1e3 };
    },
    async plan(args) {
      const history = args.history.slice(-3).map((h) => `- ${h}`).join("\n") || "(none)";
      const dup = args.history.length >= 2 && args.history.at(-1) === args.history.at(-2) ? "\nCRITICAL WARNING: last action repeated. If screen did not change, switch strategy." : "";
      const userText = `Task: ${args.task}
Screen: ${args.screen[0]}x${args.screen[1]}
Recent history:
${history}${dup}
What is the next single action?`;
      const res = await ollama$1.chat({
        model,
        messages: [
          { role: "system", content: PLAN_SYSTEM },
          { role: "user", content: userText, images: [args.screenshotB64] }
        ],
        options: { temperature: 0.2, num_predict: 256 }
      });
      const text = res.message.content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      return { action: text };
    },
    async ground(args) {
      const res = await ollama$1.chat({
        model,
        format: "json",
        messages: [
          { role: "system", content: GROUND_SYSTEM },
          {
            role: "user",
            content: `Click target: ${args.instruction}`,
            images: [args.screenshotB64]
          }
        ],
        options: { temperature: 0, num_predict: 128 }
      });
      const raw = res.message.content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      const xy = parseXY(raw);
      if (!xy) return { x: 0, y: 0, error: `parse: ${raw.slice(0, 100)}` };
      const [w, h] = args.screen;
      const x = xy.x <= 1e3 ? Math.round(xy.x / 1e3 * w) : Math.round(xy.x);
      const y = xy.y <= 1e3 ? Math.round(xy.y / 1e3 * h) : Math.round(xy.y);
      return {
        x: Math.max(0, Math.min(w - 1, x)),
        y: Math.max(0, Math.min(h - 1, y)),
        raw: [xy.x, xy.y]
      };
    }
  };
}
function parseXY(text) {
  try {
    const obj = JSON.parse(text);
    if (typeof obj.x === "number" && typeof obj.y === "number") return obj;
  } catch {
  }
  const nums = text.match(/\d+/g);
  if (nums && nums.length >= 2) return { x: parseInt(nums[0], 10), y: parseInt(nums[1], 10) };
  return null;
}
const PATH_TO_FUNC = {
  "/warm": "warm",
  "/plan": "plan-endpoint",
  "/step": "step-endpoint",
  "/ground": "ground-endpoint",
  "/ground/batch": "ground-batch-endpoint",
  "/health": "health"
};
function resolveUrl(baseUrl, path2) {
  const func = PATH_TO_FUNC[path2] ?? path2.replace(/^\//, "");
  const prefix = baseUrl.replace(/\/+$/, "").replace(
    /-(?:warm|plan-endpoint|step-endpoint|ground-endpoint|ground-batch-endpoint|health)\.modal\.run$/,
    ""
  ).replace(/\.modal\.run$/, "");
  return `${prefix}-${func}.modal.run`;
}
function createRemoteProvider(cfg) {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg.token}`
  };
  async function post(path2, body, timeoutMs = 6e4, externalSignal) {
    if (externalSignal?.aborted) {
      throw new Error("remote cancelled");
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const onExternalAbort = () => ctrl.abort();
    externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
    try {
      const res = await fetchImpl(resolveUrl(cfg.baseUrl, path2), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`remote ${path2} ${res.status}: ${text.slice(0, 200)}`);
      }
      return await res.json();
    } catch (e) {
      if (externalSignal?.aborted) {
        throw new Error("remote cancelled");
      }
      throw e;
    } finally {
      clearTimeout(t);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    }
  }
  return {
    name: "remote",
    async warm() {
      const r = await post(
        "/warm",
        {},
        3e5
      );
      return { ready: r.ready, warmSeconds: r.warm_seconds };
    },
    async plan(args) {
      return post(
        "/plan",
        {
          task: args.task,
          history: args.history,
          screenshot_b64: args.screenshotB64,
          screen: args.screen
        },
        6e4,
        args.signal
      );
    },
    async ground(args) {
      return post(
        "/ground",
        {
          instruction: args.instruction,
          screenshot_b64: args.screenshotB64,
          screen: args.screen
        },
        6e4,
        args.signal
      );
    },
    async step(args) {
      return post(
        "/step",
        {
          task: args.task,
          history: args.history,
          screenshot_b64: args.screenshotB64,
          screen: args.screen
        },
        6e4,
        args.signal
      );
    },
    async groundBatch(args) {
      const n = args.instructions.length;
      const timeoutMs = Math.min(18e4, 6e4 + Math.max(0, n - 1) * 1e4);
      const body = {
        instructions: args.instructions,
        screenshot_b64: args.screenshotB64,
        screen: args.screen
      };
      if (args.crop) {
        body.crop = {
          x: args.crop.x,
          y: args.crop.y,
          w: args.crop.w,
          h: args.crop.h
        };
      }
      const r = await post(
        "/ground/batch",
        body,
        timeoutMs,
        args.signal
      );
      if (r.error || !r.results) {
        throw new Error(`groundBatch: ${r.error ?? "no results returned"}`);
      }
      if (r.results.length !== n) {
        throw new Error(
          `groundBatch: expected ${n} results, got ${r.results.length}`
        );
      }
      return r.results;
    }
  };
}
function computeDefaultProvider() {
  const hasApi = !!(process.env.HAI_API_KEY ?? process.env.HCOMPANY_API_KEY);
  const pref = getProviderPreference();
  if (pref && pref !== "remote" && isProviderConfigured(pref)) return pref;
  if (pref === "remote" && !hasApi && isProviderConfigured("remote")) return "remote";
  if (hasApi) return "hcompany";
  if (process.env.MODAL_BASE_URL && process.env.MODAL_BEARER_TOKEN) return "remote";
  return "local";
}
function executorNameFor(name) {
  return name === "composite" ? computeDefaultProvider() : name;
}
function makeProvider(name) {
  return maybeWrapWithPlanner(makeExecutorProvider(name));
}
let plannerAnnounced = false;
function maybeWrapWithPlanner(executor) {
  const cfg = plannerConfigFromEnv();
  if (!cfg) return executor;
  if (!plannerAnnounced) {
    plannerAnnounced = true;
    console.error(
      `[boot] planner configured: ${cfg.text.model} (text) / ${cfg.vision.model} (vision) plan, ${executor.name} grounds (composite mode — local router/planner bypassed)`
    );
  }
  return createCompositeProvider(executor, cfg);
}
function makeExecutorProvider(name) {
  if (name === "local") return createLocalProvider();
  if (name === "hcompany") {
    const apiKey = process.env.HAI_API_KEY ?? process.env.HCOMPANY_API_KEY ?? "";
    return createHCompanyProvider({
      apiKey,
      // holo3-35b-a3b is deprecated 2026-06-15 — holo3-1-35b-a3b is the
      // drop-in successor. See createHCompanyProvider.
      model: process.env.HCOMPANY_MODEL ?? "holo3-1-35b-a3b"
    });
  }
  const baseUrl = process.env.MODAL_BASE_URL;
  const token = process.env.MODAL_BEARER_TOKEN;
  if (!baseUrl || !token) {
    return createRemoteProvider({
      baseUrl: "http://invalid",
      token: "missing"
    });
  }
  return createRemoteProvider({ baseUrl, token });
}
function isProviderConfigured(name) {
  if (name === "local") return true;
  if (name === "hcompany") {
    return !!(process.env.HAI_API_KEY ?? process.env.HCOMPANY_API_KEY);
  }
  return !!(process.env.MODAL_BASE_URL && process.env.MODAL_BEARER_TOKEN);
}
function makeRouter() {
  if (process.env.HOLO3_ROUTER === "off") return null;
  return createOllamaRouter();
}
function humanProviderLabel(name) {
  if (name === "hcompany") return "H Company API";
  if (name === "remote") return "Modal · Holo3";
  if (name === "composite") {
    const cfg = plannerConfigFromEnv();
    const shortText = cfg?.text.model.split("/").pop() ?? "planner";
    return `${shortText} + Holo3`;
  }
  return "Local (Ollama)";
}
const AGP_API_BASE_URLS = {
  production: "https://agp.hcompany.ai/api/v1",
  eu: "https://agp.eu.hcompany.ai/api/v1"
};
const AGP_LONG_POLL_SECONDS = 20;
const AGP_DEFAULT_TIMEOUT_MS = 3e4;
const AGP_TRAJECTORY_IDLE_TIMEOUT_S = 1800;
const AGP_5XX_MAX_RETRIES = 2;
const AGP_5XX_BACKOFF_MS = 1500;
const AGP_RATE_LIMIT_MAX_RETRIES = 2;
const AGP_RATE_LIMIT_BACKOFF_MS = 2e3;
const AGP_POLLER_RATE_LIMIT_BACKOFF_MS = 5e3;
const AGP_TERMINAL_STATUSES = [
  "completed",
  "failed",
  "timed_out",
  "interrupted"
];
const DRIVER_LONG_POLL_SECONDS = 20;
const DRIVER_POLL_INTERVAL_MS = 300;
const DRIVER_FETCH_TIMEOUT_MS = 3e4;
const DRIVER_POST_RESULT_RETRIES = 2;
const DRIVER_POST_RESULT_BACKOFF_MS = 500;
const DRIVER_POST_RESULT_TIMEOUT_MS = 1e4;
const DOM_STABLE_QUIESCE_MS = 80;
const DOM_STABLE_TIMEOUT_MS = 1e3;
const NEW_TAB_SETTLE_MS = 2e3;
const NAVIGATION_TIMEOUT_MS = 15e3;
const A11Y_SNAPSHOT_MAX_CHARS = 12e3;
const CALLER_ID_USER = "user";
const AGP_CLIENT_HEADER = { "X-From-htab": "true" };
const MAX_RUN_STEPS = 120;
class AgpApiError extends Error {
  status;
  detail;
  isAuthError;
  constructor(status, detail) {
    super(detail);
    this.name = "AgpApiError";
    this.status = status;
    this.detail = detail;
    this.isAuthError = status === 401 || status === 403;
  }
}
function resolveBaseUrl() {
  const override = process.env.AGP_BACKEND_URL?.trim();
  if (override) return override;
  const env = process.env.AGP_ENVIRONMENT || "eu";
  return AGP_API_BASE_URLS[env] ?? AGP_API_BASE_URLS.eu;
}
function withTimeout(ms, extra) {
  const signals = [AbortSignal.timeout(ms)];
  if (extra) signals.push(extra);
  return AbortSignal.any(signals);
}
const sleep$1 = (ms) => new Promise((r) => setTimeout(r, ms));
class AgpClient {
  baseUrl;
  /** Root with the trailing /api/v1 stripped — driver queue base. */
  commandRoot;
  apiKey;
  timeoutMs;
  constructor(opts = {}) {
    this.baseUrl = (opts.baseUrl ?? resolveBaseUrl()).replace(/\/$/, "");
    this.commandRoot = this.baseUrl.replace(/\/api\/v1$/, "").replace(/\/$/, "");
    this.apiKey = opts.apiKey ?? process.env.HAI_API_KEY ?? process.env.HCOMPANY_API_KEY ?? null;
    this.timeoutMs = opts.timeoutMs ?? AGP_DEFAULT_TIMEOUT_MS;
  }
  get configured() {
    return !!this.apiKey;
  }
  headers() {
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      ...AGP_CLIENT_HEADER
    };
  }
  /**
   * Core request helper with the extension's retry policy: 429 → bounded
   * backoff, 5xx on GET → bounded backoff, everything else throws an
   * AgpApiError carrying the server `detail`.
   */
  async request(path2, init = {}, rateRetry = 0, serverRetry = 0) {
    if (!this.apiKey) {
      throw new AgpApiError(0, "No AGP API key configured (set HAI_API_KEY).");
    }
    const url = `${this.baseUrl}${path2}`;
    const { requestTimeout, signal, ...rest } = init;
    const res = await fetch(url, {
      ...rest,
      headers: { ...this.headers(), ...rest.headers },
      signal: withTimeout(requestTimeout ?? this.timeoutMs, signal ?? void 0)
    });
    if (!res.ok) {
      const detail = await this.extractDetail(res);
      if (res.status === 401 || res.status === 403) {
        throw new AgpApiError(
          res.status,
          detail || "AGP auth failed. Check HAI_API_KEY / Portal-H access."
        );
      }
      if (res.status === 404) {
        throw new AgpApiError(
          404,
          detail || "Resource not found (agent or trajectory may be gone)."
        );
      }
      if (res.status === 429) {
        if (rateRetry < AGP_RATE_LIMIT_MAX_RETRIES) {
          await sleep$1((1 + rateRetry) * AGP_RATE_LIMIT_BACKOFF_MS + Math.random() * 1e3);
          return this.request(path2, init, rateRetry + 1, serverRetry);
        }
        throw new AgpApiError(429, detail || "AGP rate limited.");
      }
      const method = (init.method || "GET").toUpperCase();
      if (method === "GET" && (res.status === 502 || res.status === 503 || res.status === 504) && serverRetry < AGP_5XX_MAX_RETRIES) {
        await sleep$1((1 + serverRetry) * AGP_5XX_BACKOFF_MS + Math.random() * 500);
        return this.request(path2, init, rateRetry, serverRetry + 1);
      }
      throw new AgpApiError(res.status, detail || `AGP request failed (${res.status}).`);
    }
    if (res.status === 204) return null;
    const body = await res.text();
    if (!body) return null;
    try {
      return JSON.parse(body);
    } catch {
      throw new AgpApiError(res.status, `Invalid JSON in AGP response: ${body.slice(0, 200)}`);
    }
  }
  async extractDetail(res) {
    try {
      const j = await res.json();
      const d = j.detail;
      if (typeof d === "string") return d;
      if (Array.isArray(d)) {
        return d.map((x) => x.msg || x.message || JSON.stringify(x)).join("; ");
      }
      if (d && typeof d === "object") {
        const o = d;
        return o.msg || o.message || JSON.stringify(d);
      }
    } catch {
    }
    return "";
  }
  // ---- Account ------------------------------------------------------------
  getQuota() {
    return this.request("/trajectories/quota", { method: "GET" });
  }
  listAgents(page2 = 1, size2 = 50, search) {
    const q = new URLSearchParams({ page: String(page2), size: String(size2), owner: "organization" });
    if (search) q.set("search", search);
    return this.request(`/agents?${q}`, { method: "GET" });
  }
  // ---- Trajectory lifecycle ----------------------------------------------
  createTrajectory(agentId, startUrl, metadata, opts = {}) {
    const task = {
      type: "interactive",
      idle_timeout_s: opts.idleTimeoutS ?? AGP_TRAJECTORY_IDLE_TIMEOUT_S
    };
    if (startUrl) task.start_url = startUrl;
    if (opts.extra && Object.keys(opts.extra).length > 0) task.extra = opts.extra;
    const body = { task, launch: true, store_calltrace: true };
    if (metadata) body.metadata = metadata;
    if (opts.configOverride) body.config_override = opts.configOverride;
    if (opts.deleteAfterMin != null) body.delete_after_min = opts.deleteAfterMin;
    const path2 = agentId ? `/agents/${encodeURIComponent(agentId)}/trajectories` : "/trajectories/";
    return this.request(path2, { method: "POST", body: JSON.stringify(body) });
  }
  getTrajectory(id) {
    return this.request(`/trajectories/${id}`, { method: "GET" });
  }
  deleteTrajectory(id) {
    return this.request(`/trajectories/${id}`, { method: "DELETE" });
  }
  /**
   * Long-poll the event stream. The server holds the request open up to
   * `waitForSeconds` and returns the moment new events exist. `fromIndex`
   * is the cursor — each reply carries only events after it.
   */
  getTrajectoryChanges(id, fromIndex, opts = {}) {
    let path2 = `/trajectories/${id}/changes?from_index=${fromIndex}`;
    if (opts.waitForSeconds != null) path2 += `&wait_for_seconds=${opts.waitForSeconds}`;
    const requestTimeout = opts.waitForSeconds != null ? Math.max(this.timeoutMs, opts.waitForSeconds * 1e3 + 5e3) : void 0;
    return this.request(path2, { method: "GET", signal: opts.signal, requestTimeout });
  }
  // ---- Interaction --------------------------------------------------------
  sendInteraction(id, interaction) {
    return this.request(`/trajectories/${id}/interaction`, {
      method: "POST",
      body: JSON.stringify(interaction)
    });
  }
  sendMessage(id, message, opts = {}) {
    return this.sendInteraction(id, {
      type: "user_message",
      message,
      images: opts.images || [],
      caller_id: opts.callerId || CALLER_ID_USER
    });
  }
  sendBatchInteraction(id, events) {
    return this.sendInteraction(id, { type: "batch", events });
  }
  sendFlowControl(id, flow, origin) {
    return this.sendInteraction(id, { type: "flow_control", flow, ...origin && { origin } });
  }
  // ---- Driver command queue ----------------------------------------------
  /**
   * Long-poll the driver queue for commands the brain wants executed.
   * Returns an array of commands, or null on a 204 (no commands ready).
   */
  async getDriverCommands(trajectoryId, waitForSeconds, signal) {
    const url = `${this.commandRoot}/api/v1/commands/${trajectoryId}/commands?wait_for_seconds=${waitForSeconds}`;
    const res = await fetch(url, {
      method: "GET",
      headers: this.headers(),
      signal: withTimeout(DRIVER_FETCH_TIMEOUT_MS, signal)
    });
    if (res.status === 204) return null;
    if (res.status === 401 || res.status === 403) {
      throw new AgpApiError(res.status, `AGP driver auth error (${res.status}).`);
    }
    if (!res.ok) throw new AgpApiError(res.status, `AGP driver queue returned ${res.status}`);
    return await res.json();
  }
  /** Deliver a command result, with the extension's retry/backoff. */
  async postDriverResult(commandId, commandUid, result, signal) {
    const url = `${this.commandRoot}/api/v1/commands/${commandId}/result`;
    const body = JSON.stringify({ ...result, command_uid: commandUid });
    for (let attempt = 0; attempt <= DRIVER_POST_RESULT_RETRIES; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: this.headers(),
          body,
          signal: withTimeout(DRIVER_POST_RESULT_TIMEOUT_MS, signal)
        });
        if (res.ok) return;
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError" && signal?.aborted) throw e;
      }
      if (attempt < DRIVER_POST_RESULT_RETRIES) {
        await sleep$1(DRIVER_POST_RESULT_BACKOFF_MS * (attempt + 1));
      }
    }
    throw new Error(
      `Failed to deliver result for command ${commandId} after ${DRIVER_POST_RESULT_RETRIES + 1} attempts`
    );
  }
}
const IS_MAC = process.platform === "darwin";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEY_ALIASES = {
  universal_command: IS_MAC ? "Meta" : "Control",
  command: "Meta",
  cmd: "Meta",
  win: "Meta",
  option: "Alt",
  opt: "Alt",
  ctrl: "Control",
  control: "Control",
  shift: "Shift",
  alt: "Alt",
  meta: "Meta",
  del: "Delete",
  esc: "Escape",
  return: "Enter",
  enter: "Enter",
  tab: "Tab",
  space: "Space",
  backspace: "Backspace",
  pgup: "PageUp",
  pgdn: "PageDown",
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  home: "Home",
  end: "End"
};
function mapKey(k) {
  if (!k) return k;
  const lower = k.toLowerCase();
  if (KEY_ALIASES[lower]) return KEY_ALIASES[lower];
  return k.length === 1 ? k : k[0].toUpperCase() + k.slice(1);
}
function mapChord(keys) {
  return keys.map(mapKey).join("+");
}
function pngDimensions(buf) {
  if (buf.length < 24) return null;
  if (buf[0] !== 137 || buf[1] !== 80) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
const STABLE_SCRIPT = `(() => new Promise((resolve) => {
  const QUIESCE = ${DOM_STABLE_QUIESCE_MS}, CAP = ${DOM_STABLE_TIMEOUT_MS};
  let timer = null;
  const done = () => { try { obs.disconnect(); } catch(e){} resolve(true); };
  const bump = () => { if (timer) clearTimeout(timer); timer = setTimeout(done, QUIESCE); };
  const obs = new MutationObserver(bump);
  try { obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true }); } catch(e) { resolve(true); return; }
  bump();
  setTimeout(done, CAP);
}))()`;
const META_SCRIPT = `(() => [
  document.body ? document.body.scrollWidth : 0,
  document.body ? document.body.scrollHeight : 0,
  window.pageXOffset, window.pageYOffset,
  window.innerWidth, window.innerHeight, window.devicePixelRatio || 1,
])()`;
const AX_SNAPSHOT_SCRIPT = `(() => {
  const MAX_CHARS = ${A11Y_SNAPSHOT_MAX_CHARS};
  const interactiveSel = [
    'a[href]','button','input:not([type=hidden])','select','textarea',
    '[role="button"]','[role="link"]','[role="textbox"]','[role="searchbox"]',
    '[role="checkbox"]','[role="radio"]','[role="menuitem"]','[role="tab"]',
    '[role="combobox"]','[role="option"]','[role="switch"]','[contenteditable="true"]',
    'h1','h2','h3',
  ].join(',');
  function nameOf(el) {
    const aria = el.getAttribute && el.getAttribute('aria-label');
    if (aria) return aria;
    const lb = el.getAttribute && el.getAttribute('aria-labelledby');
    if (lb) { const n = document.getElementById(lb); if (n && n.textContent) return n.textContent; }
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
      return el.placeholder || el.value || el.name || el.type || '';
    return ((el.innerText || el.textContent || '')).trim().slice(0, 100);
  }
  function roleOf(el) {
    const r = el.getAttribute && el.getAttribute('role');
    if (r) return r;
    const tag = el.tagName.toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'button') return 'button';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'input') {
      const t = (el.type || 'text').toLowerCase();
      if (t === 'submit' || t === 'button') return 'button';
      if (t === 'checkbox') return 'checkbox';
      if (t === 'radio') return 'radio';
      return 'textbox';
    }
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    return tag;
  }
  function visible(el) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }
  function disabled(el) {
    if (el.disabled) return true;
    if (el.getAttribute && el.getAttribute('aria-disabled') === 'true') return true;
    return getComputedStyle(el).pointerEvents === 'none';
  }
  document.querySelectorAll('[data-holo-ref]').forEach(e => e.removeAttribute('data-holo-ref'));
  const els = Array.from(document.querySelectorAll(interactiveSel)).filter(visible);
  const lines = [];
  let counter = 0, chars = 0;
  for (const el of els) {
    if (chars >= MAX_CHARS) { lines.push('... (truncated)'); break; }
    const role = roleOf(el);
    const name = nameOf(el).replace(/\\s+/g, ' ').trim().slice(0, 100);
    let line;
    if (role === 'heading') {
      const lvl = el.tagName && /^H([1-6])$/.exec(el.tagName);
      line = '- heading' + (lvl ? ' (h' + lvl[1] + ')' : '') + (name ? ' "' + name + '"' : '');
    } else {
      const ref = 'e' + counter++;
      el.setAttribute('data-holo-ref', ref);
      let flags = '';
      if (disabled(el)) flags += ' [disabled]';
      if (el.getAttribute && el.getAttribute('aria-checked') === 'true') flags += ' [checked]';
      let opts = '';
      if (el.tagName === 'SELECT') {
        const o = Array.from(el.options || []).slice(0, 15).map(o => (o.text || o.value || '').trim()).filter(Boolean);
        if (o.length) opts = ' options=[' + o.join(', ') + ']';
      }
      const val = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.value ? ': "' + String(el.value).slice(0, 80) + '"' : '';
      line = '- ' + role + (name ? ' "' + name + '"' : '') + ' [ref=' + ref + ']' + flags + val + opts;
    }
    lines.push(line);
    chars += line.length + 1;
  }
  return {
    url: location.href,
    title: document.title || '',
    text: lines.join('\\n') || '(no interactive elements visible)',
  };
})()`;
class CommandExecutor {
  client;
  browser;
  trajectoryId;
  opts;
  running = false;
  abort = null;
  executed = 0;
  attachedPages = /* @__PURE__ */ new WeakSet();
  memory = /* @__PURE__ */ new Map();
  s = {
    page: null,
    scale: 1,
    imgW: 0,
    imgH: 0,
    mouse: { x: 0, y: 0 },
    lastAxLines: null,
    consoleLogs: []
  };
  constructor(client, browser2, trajectoryId, opts = {}) {
    this.client = client;
    this.browser = browser2;
    this.trajectoryId = trajectoryId;
    this.opts = opts;
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.abort = new AbortController();
    void this.pumpLoop();
  }
  stop() {
    this.running = false;
    this.abort?.abort();
  }
  get commandCount() {
    return this.executed;
  }
  // ---- the long-poll command pump ----------------------------------------
  async pumpLoop() {
    while (this.running) {
      let cmds = null;
      const t0 = Date.now();
      try {
        cmds = await this.client.getDriverCommands(
          this.trajectoryId,
          DRIVER_LONG_POLL_SECONDS,
          this.abort?.signal
        );
      } catch (e) {
        if (!this.running || this.abort?.signal.aborted) break;
        const msg = e.message || "";
        if (msg.includes("auth error")) break;
        console.warn("[agp-driver] poll error:", msg);
        await sleep(DRIVER_POLL_INTERVAL_MS * 2);
        continue;
      }
      if (!cmds || cmds.length === 0) {
        const elapsed = Date.now() - t0;
        if (elapsed < 100) await sleep(100 - elapsed);
        continue;
      }
      for (const cmd of cmds) {
        if (!this.running) break;
        const result = await this.runOne(cmd);
        try {
          await this.client.postDriverResult(
            cmd.id,
            cmd.command_uid,
            result,
            this.abort?.signal
          );
        } catch (e) {
          if (this.abort?.signal.aborted) break;
          console.warn(`[agp-driver] failed to deliver result for ${cmd.name}:`, e.message);
        }
        if (cmd.name === "destroy") {
          this.stop();
          break;
        }
        if (this.opts.maxCommands && this.executed >= this.opts.maxCommands) {
          console.warn(`[agp-driver] hit maxCommands=${this.opts.maxCommands}, stopping`);
          this.stop();
          break;
        }
      }
    }
  }
  async runOne(cmd) {
    this.executed++;
    const args = cmd.args || {};
    this.opts.onCommand?.(cmd.name, args);
    try {
      const result = await this.dispatch(cmd.name, args) ?? null;
      return { result, error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[agp-driver] command "${cmd.name}" failed:`, msg);
      return { result: null, error: msg };
    }
  }
  // ---- page access + helpers ----------------------------------------------
  async page() {
    if (this.s.page && !this.s.page.isClosed()) return this.s.page;
    const raw = await this.browser.rawPage?.();
    if (!raw) throw new Error("No active Chrome tab. Click the Playwriter extension on a tab.");
    this.s.page = raw;
    this.attachConsole(raw);
    return raw;
  }
  async ctx() {
    return await this.browser.rawContext?.() ?? null;
  }
  attachConsole(page2) {
    if (this.attachedPages.has(page2)) return;
    this.attachedPages.add(page2);
    try {
      page2.on("console", (msg) => {
        try {
          const m = msg;
          const line = `[${m.type?.() ?? "log"}] ${m.text?.() ?? ""}`;
          this.s.consoleLogs.push(line);
          if (this.s.consoleLogs.length > 200) this.s.consoleLogs.shift();
        } catch {
        }
      });
    } catch {
    }
  }
  resetRefs() {
    this.s.lastAxLines = null;
  }
  async waitStable(page2) {
    try {
      await page2.evaluate(STABLE_SCRIPT);
    } catch {
    }
  }
  /** Convert screenshot-pixel coords from the brain to CSS px for Playwright. */
  toCss(v) {
    return Number(v) / (this.s.scale || 1);
  }
  async capture(page2) {
    await this.waitStable(page2);
    const buf = await page2.screenshot({ type: "png", fullPage: false });
    const dims = pngDimensions(buf);
    if (dims) {
      this.s.imgW = dims.width;
      this.s.imgH = dims.height;
      try {
        const innerW = await page2.evaluate("window.innerWidth") || dims.width;
        this.s.scale = innerW > 0 ? dims.width / innerW : 1;
      } catch {
        this.s.scale = 1;
      }
    }
    return buf.toString("base64");
  }
  async metadata(page2) {
    const [scrollW, scrollH, scrollX, scrollY, innerW, innerH, dpr] = await page2.evaluate(META_SCRIPT) ?? [0, 0, 0, 0, 0, 0, 1];
    const scale = this.s.scale || dpr || 1;
    const tabs = await this.tabIds();
    let title = "";
    try {
      title = await page2.title();
    } catch {
    }
    return {
      mouse_position: [this.s.mouse.x, this.s.mouse.y],
      screen_size: [this.s.imgW || Math.round(innerW * scale), this.s.imgH || Math.round(innerH * scale)],
      tabs,
      active_tab: tabs[0] ?? "1",
      url: page2.url(),
      title,
      page_size: [Math.round(scrollW * scale), Math.round(scrollH * scale)],
      scroll_position: [Math.round(scrollX * scale), Math.round(scrollY * scale)]
    };
  }
  async tabIds() {
    const ctx = await this.ctx();
    if (!ctx) return ["1"];
    return ctx.pages().filter((p) => !p.isClosed()).map((_, i) => String(i + 1));
  }
  async axSnapshot(page2) {
    return await page2.evaluate(AX_SNAPSHOT_SCRIPT);
  }
  /** Incremental diff vs the previous snapshot (port of computeSnapshotDiff). */
  diffSnapshot(text) {
    const lines = text.split("\n");
    const prev = this.s.lastAxLines;
    this.s.lastAxLines = lines;
    if (!prev) return { out: text, isDiff: false };
    if (prev.length === lines.length && prev.every((l, i) => l === lines[i])) {
      return { out: "[No changes since last snapshot]", isDiff: true };
    }
    const diff = [];
    let unchanged = 0;
    for (let i = 0; i < Math.max(prev.length, lines.length); i++) {
      const a = prev[i];
      const b = lines[i];
      if (a === b) {
        unchanged++;
        continue;
      }
      if (unchanged > 0) {
        diff.push(`[${unchanged} unchanged lines]`);
        unchanged = 0;
      }
      if (a != null && b != null) diff.push(`~ ${b}`);
      else if (b != null) diff.push(`+ ${b}`);
      else diff.push(`- ${a}`);
    }
    if (unchanged > 0) diff.push(`[${unchanged} unchanged lines]`);
    if (diff.length > lines.length * 0.6) return { out: text, isDiff: false };
    return { out: diff.join("\n"), isDiff: true };
  }
  locFor(args, refKey = "ref", selKey = "selector") {
    const ref = args[refKey];
    const sel = args[selKey];
    if (typeof ref === "string" && ref) return this.s.page.locator(`[data-holo-ref="${ref}"]`);
    if (typeof sel === "string" && sel) return this.s.page.locator(sel);
    return null;
  }
  // ---- the command switch -------------------------------------------------
  async dispatch(name, a) {
    const page2 = await this.page();
    switch (name) {
      case "goto": {
        if (!a.url) throw new Error("Missing required argument: url");
        await page2.goto(String(a.url), { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
        await this.waitStable(page2);
        this.resetRefs();
        return null;
      }
      case "current_url":
        return page2.url();
      case "back":
        await page2.goBack({ timeout: NAVIGATION_TIMEOUT_MS }).catch(() => {
        });
        await this.waitStable(page2);
        this.resetRefs();
        return null;
      case "forward":
        await page2.goForward({ timeout: NAVIGATION_TIMEOUT_MS }).catch(() => {
        });
        await this.waitStable(page2);
        this.resetRefs();
        return null;
      case "refresh":
        await page2.reload({ timeout: NAVIGATION_TIMEOUT_MS }).catch(() => {
        });
        await this.waitStable(page2);
        this.resetRefs();
        return null;
      case "screenshot_png_bytes":
        return await this.capture(page2);
      case "screenshot_and_metadata": {
        const b64 = await this.capture(page2);
        return { screenshot_b64: b64, metadata: await this.metadata(page2) };
      }
      case "webpage_metadata":
        if (!this.s.imgW || !this.s.imgH) await this.capture(page2);
        return await this.metadata(page2);
      case "get_screen_size":
        if (this.s.imgW && this.s.imgH) return [this.s.imgW, this.s.imgH];
        await this.capture(page2);
        return [this.s.imgW, this.s.imgH];
      case "get_mouse_position":
        return [this.s.mouse.x, this.s.mouse.y];
      case "observe":
      case "observe_with_tabs": {
        const snap = await this.axSnapshot(page2);
        const { out, isDiff } = a.incremental === false ? { out: snap.text, isDiff: false } : this.diffSnapshot(snap.text);
        const [scrollW, scrollH, scrollX, scrollY, innerW, innerH] = await page2.evaluate(META_SCRIPT) ?? [0, 0, 0, 0, 0, 0, 1];
        const observe = {
          snapshot: out,
          is_diff: isDiff,
          meta: {
            url: snap.url,
            title: snap.title,
            viewport: [innerW, innerH],
            scroll: [scrollX, scrollY],
            page_height: scrollH,
            page_width: scrollW
          },
          has_visual_content: false
        };
        if (name === "observe_with_tabs") {
          const tabs = await this.tabIds();
          return { observe, tabs, active_tab: tabs[0] ?? "1" };
        }
        return observe;
      }
      case "get_a11y_snapshot":
      case "get_html":
      case "get_viewport_html": {
        const snap = await this.axSnapshot(page2);
        this.s.lastAxLines = snap.text.split("\n");
        return snap.text;
      }
      case "get_element_text": {
        const loc = this.locFor(a);
        if (!loc) throw new Error("Missing target: provide a ref or selector.");
        return await loc.innerText({ timeout: 3e3 });
      }
      case "reader_mode":
      case "extract_markdown":
        return await this.readerText(page2);
      case "extract_table":
        return await this.extractTable(page2, typeof a.selector === "string" ? a.selector : "table");
      case "get_logs":
        return this.s.consoleLogs.slice(-(Number(a.max_entries) || 20));
      case "find_in_page": {
        const q = JSON.stringify(String(a.query || ""));
        return await page2.evaluate(`window.find(${q}, false, false, true, false, true, false)`) ?? false;
      }
      case "click_at": {
        const x = this.toCss(a.x);
        const y = this.toCss(a.y);
        await page2.mouse.click(x, y);
        this.s.mouse = { x: Number(a.x), y: Number(a.y) };
        return null;
      }
      case "double_click":
        await page2.mouse.click(this.toCss(this.s.mouse.x), this.toCss(this.s.mouse.y), { clickCount: 2 });
        return null;
      case "mouse_move_to":
        await page2.mouse.move(this.toCss(a.x), this.toCss(a.y));
        this.s.mouse = { x: Number(a.x), y: Number(a.y) };
        return null;
      case "mouse_press":
        await page2.mouse.down({ button: a.button || "left" });
        return null;
      case "mouse_release":
        await page2.mouse.up({ button: a.button || "left" });
        return null;
      case "write_at": {
        await page2.mouse.click(this.toCss(a.x), this.toCss(a.y));
        this.s.mouse = { x: Number(a.x), y: Number(a.y) };
        if (a.overwrite !== false) await this.selectAll(page2);
        await page2.keyboard.type(String(a.text || ""));
        if (a.enter) await page2.keyboard.press("Enter");
        return null;
      }
      case "input_text":
        if (a.text == null) throw new Error("Missing required argument: text");
        await page2.keyboard.type(String(a.text));
        return null;
      case "press_key":
        if (!a.key) throw new Error("Missing required argument: key");
        await page2.keyboard.press(mapKey(String(a.key)));
        return null;
      case "release_key":
        if (!a.key) throw new Error("Missing required argument: key");
        await page2.keyboard.up(mapKey(String(a.key)));
        return null;
      case "press_keys":
      case "press_and_release_keys": {
        const keys = a.keys || [];
        if (keys.length) await page2.keyboard.press(mapChord(keys));
        return null;
      }
      case "scroll": {
        const dx = Number(a.dx) || 0;
        const dy = Number(a.dy) || 0;
        if (dx || dy) await page2.mouse.wheel(dx, dy);
        return null;
      }
      case "scroll_at": {
        await page2.mouse.move(this.toCss(a.x), this.toCss(a.y));
        this.s.mouse = { x: Number(a.x), y: Number(a.y) };
        const dx = Number(a.dx) || 0;
        const dy = Number(a.dy) || 0;
        if (dx || dy) await page2.mouse.wheel(dx, dy);
        return null;
      }
      case "scroll_page": {
        const dx = Number(a.dx) || 0;
        const dy = Number(a.dy) || 0;
        await page2.evaluate(`window.scrollBy(${dx}, ${dy})`);
        return true;
      }
      case "drag_and_drop": {
        const ox = this.toCss(a.origin_x);
        const oy = this.toCss(a.origin_y);
        const tx = this.toCss(a.target_x);
        const ty = this.toCss(a.target_y);
        const button = a.button || "left";
        await page2.mouse.move(ox, oy);
        await page2.mouse.down({ button });
        const steps = 10;
        for (let i = 1; i <= steps; i++) {
          await page2.mouse.move(ox + (tx - ox) * i / steps, oy + (ty - oy) * i / steps);
        }
        await page2.mouse.up({ button });
        this.s.mouse = { x: Number(a.target_x), y: Number(a.target_y) };
        return null;
      }
      case "click_element": {
        const loc = this.locFor(a);
        if (!loc) throw new Error("Missing target: provide a ref from the latest observation, or a CSS selector.");
        await loc.click({ timeout: 4e3 });
        return null;
      }
      case "type_element": {
        const loc = this.locFor(a);
        if (!loc) throw new Error("Missing target: provide a ref from the latest observation, or a CSS selector.");
        await loc.click({ timeout: 4e3 });
        if (a.clear !== false) await loc.fill("");
        await loc.fill(String(a.text || ""));
        if (a.submit) await loc.press("Enter");
        return null;
      }
      case "hover_element": {
        const loc = this.locFor(a);
        if (!loc) throw new Error("Missing target: provide a ref or selector.");
        await loc.hover({ timeout: 4e3 });
        return null;
      }
      case "select_element": {
        const loc = this.locFor(a);
        if (!loc) throw new Error("Missing target: provide a ref or selector.");
        const value = a.value ?? a.text;
        const picked = await loc.selectOption(
          typeof value === "string" ? { label: value } : value,
          { timeout: 4e3 }
        ).catch(async () => await loc.selectOption(String(value), { timeout: 4e3 }));
        return Array.isArray(picked) ? picked.join(", ") : picked;
      }
      case "fill_form": {
        const fields = a.fields || [];
        if (!fields.length) throw new Error("No fields provided.");
        let filled = 0;
        const skipped = [];
        for (const f of fields) {
          const loc = this.locFor(f);
          if (!loc) {
            skipped.push(String(f.label || f.ref || f.selector || "(no target)"));
            continue;
          }
          try {
            await loc.click({ timeout: 4e3 });
            if (f.clear !== false) await loc.fill("");
            await loc.fill(String(f.text || ""));
            filled++;
            if (f.tab) await page2.keyboard.press("Tab");
          } catch (e) {
            skipped.push(`${f.label || f.ref || f.selector}: ${e.message}`);
          }
        }
        return skipped.length ? { filled, total: fields.length, skipped } : { filled, total: fields.length };
      }
      case "drag_element": {
        const start = this.locFor(a, "start_ref", "start_selector");
        const end = this.locFor(a, "end_ref", "end_selector");
        if (!start || !end) throw new Error("drag_element needs start and end ref/selector.");
        await start.dragTo(end, { timeout: 5e3 });
        return null;
      }
      case "screenshot_element": {
        const loc = this.locFor(a);
        if (!loc) throw new Error("Missing target: provide a ref or selector.");
        const buf = await loc.screenshot({ type: "png" });
        return buf.toString("base64");
      }
      case "set_input_files": {
        const loc = this.locFor(a);
        if (!loc) throw new Error("Missing target: provide a ref or selector.");
        const paths = a.paths || (a.path ? [String(a.path)] : []);
        await loc.setInputFiles(paths);
        return null;
      }
      case "wait_for":
        return await this.waitFor(page2, a);
      case "get_active_tab": {
        const tabs = await this.tabIds();
        return tabs[0] ?? "1";
      }
      case "get_tabs":
        return await this.tabIds();
      case "get_tab_title":
        return await page2.title();
      case "new_tab":
      case "open_new_tab": {
        const ctx = await this.ctx();
        if (!ctx) throw new Error("No browser context for new_tab.");
        const np = await ctx.newPage();
        if (a.url) await np.goto(String(a.url), { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS }).catch(() => {
        });
        await sleep(NEW_TAB_SETTLE_MS);
        this.s.page = np;
        this.attachConsole(np);
        this.resetRefs();
        const tabs = await this.tabIds();
        return name === "open_new_tab" ? { tab_id: tabs[tabs.length - 1] ?? "1", title: await np.title().catch(() => "") } : tabs[tabs.length - 1] ?? "1";
      }
      case "switch_tab_by_id": {
        const ctx = await this.ctx();
        if (!ctx) throw new Error("No browser context.");
        const idx = Number(a.tab_id) - 1;
        const pages = ctx.pages().filter((p) => !p.isClosed());
        const target = pages[idx];
        if (!target) throw new Error(`No tab ${a.tab_id} (have ${pages.length}).`);
        await target.bringToFront().catch(() => {
        });
        this.s.page = target;
        this.attachConsole(target);
        this.resetRefs();
        return null;
      }
      case "close_active_tab":
      case "close_tab": {
        const ctx = await this.ctx();
        if (!ctx) throw new Error("No browser context.");
        const pages = ctx.pages().filter((p) => !p.isClosed());
        if (pages.length <= 1) throw new Error("Cannot close the only tab. Open a new tab first.");
        const target = name === "close_tab" && a.tab_id != null ? pages[Number(a.tab_id) - 1] : this.s.page;
        if (!target) throw new Error("Target tab not found.");
        const closable = target;
        await closable.close?.();
        this.s.page = pages.find((p) => p !== target && !p.isClosed()) ?? null;
        this.resetRefs();
        return null;
      }
      case "execute_script": {
        const script = String(a.script || "");
        const fnArgs = a.args || [];
        return await page2.evaluate(
          (payload) => {
            const { script: s, args: ar } = payload;
            const fn = new Function(...["__a"], `return (function(...args){ ${s} }).apply(null, __a)`);
            return fn(ar);
          },
          { script, args: fnArgs }
        );
      }
      case "memory_put":
        if (typeof a.key === "string") this.memory.set(a.key, a.entry);
        return null;
      case "memory_get":
        return typeof a.key === "string" ? this.memory.get(a.key) ?? null : null;
      case "memory_delete":
        return typeof a.key === "string" ? this.memory.delete(a.key) : false;
      case "memory_list": {
        const prefix = typeof a.prefix === "string" ? a.prefix : "";
        const out = {};
        for (const [k, v] of this.memory) if (k.startsWith(prefix)) out[k] = v;
        return out;
      }
      case "destroy":
        return null;
      default:
        console.warn(`[agp-driver] unknown command: ${name}`);
        throw new Error(`Unknown command: ${name}`);
    }
  }
  // ---- helpers used by the switch -----------------------------------------
  async selectAll(page2) {
    await page2.evaluate(`(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return;
      if (typeof el.select === 'function' && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) el.select();
      else if (el.isContentEditable) document.execCommand('selectAll', false, null);
    })()`).catch(() => {
    });
  }
  async readerText(page2) {
    return await page2.evaluate(`(() => {
      const root = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
      return root ? (root.innerText || '').trim().slice(0, 50000) : '';
    })()`);
  }
  async extractTable(page2, selector) {
    return await page2.evaluate(
      (sel) => {
        const table = document.querySelector(sel);
        if (!table) return { error: "No table found" };
        const headers = Array.from(table.querySelectorAll("thead th, thead td, tr:first-child th")).map(
          (h) => h.innerText.trim()
        );
        const rows = [];
        for (const tr of Array.from(table.querySelectorAll("tbody tr, tr"))) {
          const cells = Array.from(tr.querySelectorAll("td, th")).map((c) => c.innerText.trim());
          if (cells.length && cells.some((c) => c)) rows.push(cells);
        }
        if (headers.length && rows.length && rows[0].every((c, i) => c === headers[i])) rows.shift();
        return { headers, rows, total_rows: rows.length };
      },
      selector
    );
  }
  async waitFor(page2, a) {
    const budget = (Number(a.time) || 10) * 1e3;
    const deadline = Date.now() + budget;
    const text = a.text;
    const textGone = a.text_gone;
    const selector = a.selector;
    const selectorGone = a.selector_gone;
    if (!text && !textGone && !selector && !selectorGone) {
      await sleep(budget);
      return { waited: true, elapsed: budget };
    }
    const start = Date.now();
    for (; ; ) {
      if (text || textGone) {
        const body = await page2.evaluate("document.body ? document.body.innerText : ''").catch(() => "") || "";
        if (text && body.includes(text)) return { found: true, elapsed: Date.now() - start };
        if (textGone && !body.includes(textGone)) return { gone: true, elapsed: Date.now() - start };
      }
      if (selector) {
        const present = await page2.evaluate(`!!document.querySelector(${JSON.stringify(selector)})`).catch(() => false);
        if (present) return { found: true, elapsed: Date.now() - start };
      }
      if (selectorGone) {
        const gone = await page2.evaluate(`!document.querySelector(${JSON.stringify(selectorGone)})`).catch(() => false);
        if (gone) return { gone: true, elapsed: Date.now() - start };
      }
      if (Date.now() >= deadline) break;
      await sleep(200);
    }
    return { timeout: true, elapsed: Date.now() - start };
  }
}
function getInner(e) {
  if (!e || typeof e !== "object") return {};
  const o = e;
  if (typeof o.kind === "string") return o;
  const data = o.data;
  if (data?.event) {
    const ev = data.event;
    if (ev.event && typeof ev.event.kind === "string") {
      return ev.event;
    }
    if (typeof ev.kind === "string") return ev;
  }
  if (o.event) {
    const ev = o.event;
    if (typeof ev.kind === "string") return ev;
  }
  return o;
}
function asText(v) {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string").join("\n");
  return "";
}
function normalize$1(raw) {
  const outer = raw;
  const inner = getInner(raw);
  const kind = inner.kind || outer?.type || "";
  if (!inner.kind) {
    const type = outer?.type || "";
    if (type === "ActiveStateChangeEvent") {
      const state = outer?.data?.state || "";
      return { kind: "lifecycle", state, raw };
    }
    if (type) return { kind: "lifecycle", text: type, raw };
    return null;
  }
  switch (inner.kind) {
    case "policy_event": {
      const msg = inner.message;
      const content = asText(msg?.content ?? inner.content);
      const toolReqs = Array.isArray(inner.tool_reqs) ? inner.tool_reqs : [];
      return {
        kind: "policy_event",
        text: content,
        tools: toolReqs.map((t) => String(t.tool_name || "action")),
        raw
      };
    }
    case "message_event":
      return { kind: "message_event", text: asText(inner.content), raw };
    case "observation_event":
      return { kind: "observation_event", text: asText(inner.text), raw };
    case "tool_result":
      return { kind: "tool_result", text: typeof inner.result === "string" ? inner.result : "", raw };
    case "answer_event": {
      const ans = inner.answer;
      return { kind: "answer_event", answer: typeof ans === "string" ? ans : JSON.stringify(ans), raw };
    }
    case "error_event":
      return { kind: "error_event", error: String(inner.error || "Agent error"), raw };
    case "flow_event":
      return { kind: "flow_event", text: String(inner.flow || ""), raw };
    default:
      return { kind, raw };
  }
}
class TrajectoryPoller {
  client;
  trajectoryId;
  opts;
  running = false;
  abort = null;
  cursor = 0;
  donePromise;
  resolveDone = () => {
  };
  idlePromise;
  resolveIdle = null;
  /** Final answer text, if the brain emitted one. */
  answer = null;
  /** Terminal status, once reached. */
  terminalStatus = null;
  /** Last error surfaced by the brain. */
  lastError = null;
  constructor(client, trajectoryId, opts = {}) {
    this.client = client;
    this.trajectoryId = trajectoryId;
    this.opts = opts;
    this.donePromise = new Promise((r) => this.resolveDone = r);
    this.idlePromise = new Promise((r) => this.resolveIdle = r);
  }
  start(fromIndex = 0) {
    if (this.running) return;
    this.running = true;
    this.cursor = fromIndex;
    this.abort = new AbortController();
    void this.loop();
  }
  stop() {
    this.running = false;
    this.abort?.abort();
    this.resolveIdle?.();
    this.resolveIdle = null;
    this.resolveDone();
  }
  waitUntilDone() {
    return this.donePromise;
  }
  /** Resolves on the first idle/running transition or after `timeoutMs`. */
  waitForInitialIdle(timeoutMs = 6e4) {
    let timer;
    const guard = new Promise((r) => {
      timer = setTimeout(r, timeoutMs);
    });
    return Promise.race([this.idlePromise, guard]).finally(() => clearTimeout(timer));
  }
  async loop() {
    let backoff = 1e3;
    while (this.running) {
      const t0 = Date.now();
      try {
        const changes = await this.client.getTrajectoryChanges(this.trajectoryId, this.cursor, {
          signal: this.abort?.signal,
          waitForSeconds: AGP_LONG_POLL_SECONDS
        });
        backoff = 1e3;
        const elapsed = Date.now() - t0;
        if (elapsed < 100) await new Promise((r) => setTimeout(r, 100 - elapsed));
        if (!changes) continue;
        const events = changes.new_events ?? [];
        for (const e of events) {
          const norm = normalize$1(e);
          if (norm) {
            if (norm.kind === "lifecycle" && (norm.state === "idle" || norm.state === "running")) {
              this.resolveIdle?.();
              this.resolveIdle = null;
            }
            if (norm.kind === "answer_event" && norm.answer) this.answer = norm.answer;
            if (norm.kind === "error_event") this.lastError = norm.error ?? null;
            this.opts.onEvent?.(norm);
          }
          this.cursor++;
          this.opts.onCursor?.(this.cursor);
        }
        if (this.answer) {
          this.terminalStatus ??= "completed";
          this.stop();
          break;
        }
        if (changes.status && AGP_TERMINAL_STATUSES.includes(changes.status)) {
          this.terminalStatus = changes.status;
          if (changes.status === "failed" || changes.status === "timed_out") {
            this.lastError = changes.error || `Trajectory ${changes.status}.`;
          }
          this.stop();
          break;
        }
      } catch (e) {
        if (!this.running || this.abort?.signal.aborted) break;
        if (e instanceof AgpApiError && e.isAuthError) {
          this.lastError = "AGP auth error. Check HAI_API_KEY.";
          this.stop();
          break;
        }
        if (e instanceof AgpApiError && e.status === 429) {
          await new Promise((r) => setTimeout(r, AGP_POLLER_RATE_LIMIT_BACKOFF_MS));
          continue;
        }
        backoff = Math.min(backoff * 2, 3e4);
        console.warn(`[agp-poller] error (backoff ${backoff}ms):`, e.message);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
}
const DEFAULT_AGENT = process.env.AGP_AGENT || "holo-tab-holo3-1-flash-visual-20260601-1612";
async function runAgpTask(opts) {
  const client = opts.client ?? new AgpClient();
  if (!client.configured) {
    return { trajectoryId: null, status: "error", answer: null, error: "No AGP API key (set HAI_API_KEY).", commandCount: 0 };
  }
  const agentId = opts.agentId ?? DEFAULT_AGENT;
  const timeoutMs = opts.timeoutMs ?? 10 * 6e4;
  let trajectoryId;
  try {
    const traj = await client.createTrajectory(
      agentId,
      opts.startUrl ?? null,
      { source: "holo3-agent" },
      { idleTimeoutS: AGP_TRAJECTORY_IDLE_TIMEOUT_S }
    );
    if (!traj?.id) throw new Error("createTrajectory returned no id");
    trajectoryId = traj.id;
  } catch (e) {
    return { trajectoryId: null, status: "error", answer: null, error: `createTrajectory failed: ${e.message}`, commandCount: 0 };
  }
  const poller = new TrajectoryPoller(client, trajectoryId, { onEvent: opts.onEvent });
  const executor = new CommandExecutor(client, opts.browser, trajectoryId, {
    onCommand: opts.onCommand,
    maxCommands: opts.maxCommands ?? MAX_RUN_STEPS
  });
  const onAbort = () => {
    poller.stop();
    executor.stop();
  };
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  let timedOut = false;
  const watchdog = setTimeout(() => {
    timedOut = true;
    poller.stop();
    executor.stop();
  }, timeoutMs);
  try {
    poller.start(0);
    executor.start();
    await client.sendBatchInteraction(trajectoryId, [
      { type: "user_message", message: opts.task, caller_id: "user" }
    ]);
    await poller.waitUntilDone();
  } catch (e) {
    poller.lastError ??= e.message;
  } finally {
    clearTimeout(watchdog);
    executor.stop();
    poller.stop();
    opts.signal?.removeEventListener("abort", onAbort);
  }
  try {
    await client.sendFlowControl(trajectoryId, "stop", "loop_cleanup");
  } catch {
  }
  if (opts.cleanup !== false) {
    try {
      await client.deleteTrajectory(trajectoryId);
    } catch {
    }
  }
  const status = timedOut ? "timed_out" : opts.signal?.aborted ? "interrupted" : poller.terminalStatus === "failed" ? "failed" : poller.answer ? "answered" : poller.terminalStatus === "completed" ? "completed" : poller.lastError ? "error" : "completed";
  return {
    trajectoryId,
    status,
    answer: poller.answer,
    error: poller.lastError,
    commandCount: executor.commandCount
  };
}
class WarmupQueue {
  constructor(provider) {
    this.provider = provider;
  }
  state = "cold";
  warmingPromise = null;
  waiters = [];
  errorMessage = null;
  listeners = /* @__PURE__ */ new Set();
  getProvider() {
    return this.provider;
  }
  setProvider(p) {
    if (p === this.provider) return;
    this.provider = p;
    this.state = "cold";
    this.warmingPromise = null;
    this.errorMessage = null;
    this.emit();
  }
  getState() {
    return this.state;
  }
  onChange(fn) {
    this.listeners.add(fn);
    fn(this.state, this.errorMessage ?? void 0);
    return () => this.listeners.delete(fn);
  }
  warmInBackground() {
    if (this.state === "ready" || this.state === "warming") return;
    this.warm().catch(() => {
    });
  }
  async warm() {
    if (this.state === "ready") return;
    if (this.warmingPromise) return this.warmingPromise;
    this.state = "warming";
    this.errorMessage = null;
    this.emit();
    this.warmingPromise = (async () => {
      try {
        await this.provider.warm();
        this.state = "ready";
        this.emit();
        const w = this.waiters.splice(0);
        w.forEach((fn) => fn());
      } catch (e) {
        this.state = "error";
        this.errorMessage = e instanceof Error ? e.message : String(e);
        this.emit();
        throw e;
      } finally {
        this.warmingPromise = null;
      }
    })();
    return this.warmingPromise;
  }
  async waitReady() {
    if (this.state === "ready") return;
    if (this.state === "cold") this.warmInBackground();
    await new Promise((resolve) => this.waiters.push(resolve));
  }
  emit() {
    for (const fn of this.listeners) fn(this.state, this.errorMessage ?? void 0);
  }
}
async function probe() {
  if (process.platform !== "darwin") {
    return {
      platform: process.platform,
      accessibility: "granted",
      screenRecording: "granted",
      inputMonitoring: "granted"
    };
  }
  const accessibilityGranted = electron.systemPreferences.isTrustedAccessibilityClient(false);
  const screenRaw = electron.systemPreferences.getMediaAccessStatus("screen");
  return {
    platform: "darwin",
    accessibility: accessibilityGranted ? "granted" : "denied",
    screenRecording: normalize(screenRaw),
    inputMonitoring: "granted"
  };
}
async function requestAccessibility() {
  if (process.platform !== "darwin") return;
  electron.systemPreferences.isTrustedAccessibilityClient(true);
}
async function requestScreenRecording() {
  if (process.platform !== "darwin") return;
  electron.systemPreferences.getMediaAccessStatus("screen");
}
function normalize(s) {
  switch (s) {
    case "granted":
    case "authorized":
      return "granted";
    case "denied":
      return "denied";
    case "restricted":
      return "restricted";
    case "not-determined":
    case "not determined":
      return "not-determined";
    case "unknown":
      return "unknown";
    default:
      return "unknown";
  }
}
const PONDER_DIR = path__namespace.join(os__namespace.homedir(), ".ponder");
const KEYS_PATH = path__namespace.join(PONDER_DIR, "keys.json");
const AUDIT_LOG_PATH = path__namespace.join(PONDER_DIR, "audit.log");
function readKeysSync() {
  try {
    const raw = fs__namespace.readFileSync(KEYS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.keys)) return parsed.keys;
    return [];
  } catch {
    return [];
  }
}
function touchKeySync(name) {
  try {
    const keys = readKeysSync();
    const idx = keys.findIndex((k) => k.name === name);
    if (idx < 0) return;
    keys[idx].lastUsedAt = (/* @__PURE__ */ new Date()).toISOString();
    fs__namespace.mkdirSync(PONDER_DIR, { recursive: true });
    fs__namespace.writeFileSync(
      KEYS_PATH,
      JSON.stringify({ version: 1, keys }, null, 2),
      { encoding: "utf-8", mode: 384 }
    );
  } catch {
  }
}
function verifyToken(authorization) {
  if (!authorization || !authorization.startsWith("Bearer ")) {
    return {
      ok: false,
      code: "MISSING_AUTH",
      message: "Missing Authorization: Bearer <key> header. Issue a key with `ponder grant <name>`."
    };
  }
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    return { ok: false, code: "MISSING_AUTH", message: "Empty bearer token." };
  }
  const keys = readKeysSync();
  const match = keys.find((k) => k.key === token);
  if (!match) {
    return {
      ok: false,
      code: "INVALID_KEY",
      message: "Key not recognized. Issue a new key with `ponder grant <name>`."
    };
  }
  return { ok: true, consumer: match.name, record: match };
}
function audit(row) {
  try {
    fs__namespace.mkdirSync(PONDER_DIR, { recursive: true });
    const line = JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), ...row }) + "\n";
    fs__namespace.appendFileSync(AUDIT_LOG_PATH, line, { encoding: "utf-8", mode: 384 });
  } catch {
  }
}
function isMagicMode() {
  return process.env.PONDER_AUTO === "1" || process.env.PONDER_MAGIC === "1";
}
const TRACE_SOFT_CAP = 1e4;
const traceBuffer = [];
let traceStartedAt = Date.now();
let traceTask = "ponder-trace";
let traceProvider;
let traceSurface;
const traceEvents = new node_events.EventEmitter();
traceEvents.setMaxListeners(50);
function recordAction(entry) {
  const step = {
    t: Math.max(0, (entry.atEpochMs ?? Date.now()) - traceStartedAt),
    executed: {
      type: entry.type,
      payload: { ...entry.payload }
    }
  };
  if (entry.intent) step.intent = entry.intent;
  if (entry.refLabel) step.refLabel = entry.refLabel;
  if (entry.url) step.url = entry.url;
  if (entry.consumer) step.consumer = entry.consumer;
  traceBuffer.push(step);
  if (traceBuffer.length > TRACE_SOFT_CAP) {
    traceBuffer.splice(0, traceBuffer.length - TRACE_SOFT_CAP);
  }
  try {
    traceEvents.emit("step", step);
  } catch {
  }
  return step;
}
function snapshotTrace(fromIndex) {
  const start = Math.max(0, fromIndex ?? 0);
  return traceBuffer.slice(start).map((s) => ({
    ...s,
    executed: { ...s.executed, payload: { ...s.executed.payload } }
  }));
}
function traceLength() {
  return traceBuffer.length;
}
function startNewTrace(opts = {}) {
  traceBuffer.length = 0;
  traceStartedAt = Date.now();
  traceTask = opts.task ?? "ponder-trace";
  if (opts.provider !== void 0) traceProvider = opts.provider;
  if (opts.surface !== void 0) traceSurface = opts.surface;
}
function getTraceMeta() {
  return {
    task: traceTask,
    startedAt: new Date(traceStartedAt).toISOString(),
    ...traceProvider ? { provider: traceProvider } : {},
    ...traceSurface ? { surface: traceSurface } : {},
    length: traceBuffer.length
  };
}
function onTraceStep(listener) {
  traceEvents.on("step", listener);
  return () => traceEvents.off("step", listener);
}
function buildRecipeFromTrace(opts) {
  const steps = snapshotTrace(opts.fromIndex);
  const startTs = steps.length > 0 ? new Date(traceStartedAt + steps[0].t).toISOString() : new Date(traceStartedAt).toISOString();
  return {
    task: opts.task ?? traceTask,
    startedAt: startTs,
    durationMs: steps.length > 0 ? steps[steps.length - 1].t - (steps[0]?.t ?? 0) : 0,
    steps,
    ...opts.outcome ? { outcome: opts.outcome } : {},
    ...opts.error ? { error: opts.error } : {},
    ...opts.provider ?? traceProvider ? { provider: opts.provider ?? traceProvider } : {},
    ...opts.surface ?? traceSurface ? { surface: opts.surface ?? traceSurface } : {}
  };
}
function createRecipeRecorder(init) {
  const startedAtMs = Date.now();
  const recipe = {
    task: init.task,
    startedAt: new Date(startedAtMs).toISOString(),
    steps: [],
    ...init.provider ? { provider: init.provider } : {},
    ...init.surface ? { surface: init.surface } : {}
  };
  let pendingIntent;
  let lastSnapshot;
  let refIndex = /* @__PURE__ */ new Map();
  return {
    onHistory(actionText) {
      pendingIntent = actionText;
    },
    onBrowserSnapshot(snap) {
      lastSnapshot = snap;
      refIndex = parseAxRefs(snap.ax);
    },
    onAction(action) {
      const ref = typeof action.payload?.ref === "string" ? action.payload.ref : void 0;
      const refLabel = ref ? refIndex.get(ref) : void 0;
      const step = {
        t: Date.now() - startedAtMs,
        executed: { type: action.type, payload: { ...action.payload } }
      };
      if (pendingIntent) step.intent = pendingIntent;
      if (lastSnapshot?.url) step.url = lastSnapshot.url;
      if (refLabel) step.refLabel = refLabel;
      recipe.steps.push(step);
      recordAction({
        type: action.type,
        payload: action.payload,
        ...pendingIntent ? { intent: pendingIntent } : {},
        ...refLabel ? { refLabel } : {},
        ...lastSnapshot?.url ? { url: lastSnapshot.url } : {}
      });
      pendingIntent = void 0;
    },
    setOutcome(outcome, error) {
      recipe.outcome = outcome;
      recipe.durationMs = Date.now() - startedAtMs;
      if (error) recipe.error = error;
    },
    getRecipe() {
      return recipe;
    },
    toRecipeScript() {
      return renderRecipeScript(recipe);
    },
    getSession() {
      return recipe;
    },
    toSessionScript() {
      return renderRecipeScript(recipe);
    }
  };
}
const createSessionRecorder = createRecipeRecorder;
function recordFromBridgeTranscript(task, transcript, opts = {}) {
  const recipe = {
    task,
    startedAt: (/* @__PURE__ */ new Date()).toISOString(),
    steps: [],
    ...opts.provider ? { provider: opts.provider } : {},
    ...opts.surface ? { surface: opts.surface } : {}
  };
  let pendingIntent;
  let pendingUrl = opts.finalUrl;
  for (const line of transcript) {
    const m = line.match(/^\[t=(\d+(?:\.\d+)?)s\]\s+(\w+):\s*(.*)$/);
    if (!m) continue;
    const t = Math.round(parseFloat(m[1]) * 1e3);
    const kind = m[2];
    const rest = m[3];
    if (kind === "thought") {
      pendingIntent = rest;
      continue;
    }
    if (kind !== "action") continue;
    const am = rest.match(/^(\w+)\s*(\{.*)?$/);
    if (!am) continue;
    const type = am[1];
    let payload = {};
    if (am[2]) {
      try {
        payload = JSON.parse(am[2]);
      } catch {
        payload = { _truncated: true };
      }
    }
    const step = { t, executed: { type, payload } };
    if (pendingIntent) {
      step.intent = pendingIntent;
      pendingIntent = void 0;
    }
    if (pendingUrl) step.url = pendingUrl;
    if (type === "browser_navigate" && typeof payload.url === "string") {
      pendingUrl = payload.url;
    }
    recipe.steps.push(step);
  }
  if (opts.outcome) recipe.outcome = opts.outcome;
  if (opts.durationMs !== void 0) recipe.durationMs = opts.durationMs;
  if (opts.error) recipe.error = opts.error;
  return recipe;
}
function recipeFromConvexSteps(task, steps, opts = {}) {
  const recipe = {
    task,
    startedAt: (/* @__PURE__ */ new Date()).toISOString(),
    steps: [],
    ...opts.provider ? { provider: opts.provider } : {}
  };
  const t0 = steps.length && steps[0]?.createdAt ? steps[0].createdAt : 0;
  let pendingIntent;
  let pendingUrl;
  for (const s of steps) {
    if (s.kind === "thought") {
      if (s.text) pendingIntent = s.text;
      continue;
    }
    if (s.kind !== "action" || !s.action) continue;
    const type = s.action.type;
    const payload = s.action.payload ?? {};
    const t = s.createdAt && t0 ? Math.max(0, s.createdAt - t0) : 0;
    const step = { t, executed: { type, payload } };
    if (pendingIntent) {
      step.intent = pendingIntent;
      pendingIntent = void 0;
    }
    if (pendingUrl) step.url = pendingUrl;
    if (type === "browser_navigate" && typeof payload.url === "string") {
      pendingUrl = payload.url;
    }
    recipe.steps.push(step);
  }
  if (opts.outcome) recipe.outcome = opts.outcome;
  if (opts.durationMs !== void 0) recipe.durationMs = opts.durationMs;
  return recipe;
}
function renderRecipeScript(recipe) {
  const header = renderHeader(recipe);
  const body = recipe.steps.map((step) => renderStep(step)).join("\n");
  const usesScreen = recipe.steps.some(
    (s) => /^(click|double_click|triple_click|right_click|drag|wait|type|key|scroll)$/.test(
      s.executed.type
    )
  );
  const runArgs = usesScreen ? "{ page, screen }" : "{ page }";
  return `${header}
//
// Edit this file freely — it's the one place to refine the recording.
// The .json sibling is regenerated from these steps on \`ponder build\`.
//
//   ponder run     ${makeRecipeId(recipe)}    # replay this recipe
//   ponder open    ${makeRecipeId(recipe)}    # edit in $EDITOR
//   npx tsx        <this-file>                # run directly (no CLI)
//
// Chrome bridge: Playwriter (https://playwriter.dev). The Ponder SDK
// connects to your REAL Chrome — same cookies, same logins, same
// extensions — so recorded selectors keep working.

import { defineRecipe } from "ponder";

export default defineRecipe({
  task: ${json(oneLine(recipe.task))},
  async run(${runArgs}) {
${indent(body, 4)}
  },
});
`;
}
const renderSessionScript = renderRecipeScript;
function renderHeader(recipe) {
  const lines = [];
  lines.push("/**");
  lines.push(" * Ponder recipe — generated by recording.");
  lines.push(" *");
  lines.push(` * Task:     ${oneLine(recipe.task)}`);
  lines.push(` * Started:  ${recipe.startedAt}`);
  if (recipe.outcome) {
    lines.push(
      ` * Outcome:  ${recipe.outcome}${recipe.error ? ` — ${oneLine(recipe.error)}` : ""}`
    );
  }
  if (recipe.durationMs !== void 0) {
    lines.push(` * Duration: ${(recipe.durationMs / 1e3).toFixed(1)}s`);
  }
  if (recipe.provider) lines.push(` * Provider: ${recipe.provider}`);
  if (recipe.surface) lines.push(` * Surface:  ${recipe.surface}`);
  lines.push(` * Steps:    ${recipe.steps.length}`);
  lines.push(" *");
  lines.push(" * The body of run() is raw Playwright — copy any of it");
  lines.push(" * straight into a Playwright project or test suite.");
  lines.push(" *   • In-page actions use page.getByRole({ role, name })");
  lines.push(" *     when the snapshot resolved the element.");
  lines.push(" *   • OS-level actions call screen.* helpers — they");
  lines.push(" *     re-ground via the vision model against a fresh");
  lines.push(" *     screenshot, so they survive across runs.");
  lines.push(" */");
  return lines.join("\n");
}
function renderStep(step) {
  const { executed } = step;
  const p = executed.payload;
  const intentComment = step.intent ? `// ${oneLine(step.intent)}` : `// ${executed.type}`;
  const tComment = `  // (+${(step.t / 1e3).toFixed(1)}s)`;
  const lead = intentComment + tComment;
  switch (executed.type) {
    case "browser_navigate":
      return `${lead}
await page.goto(${json(p.url)});`;
    case "browser_click":
      return `${lead}
${renderRefAction(step, "click")}`;
    case "browser_type": {
      const lines = [lead];
      lines.push(renderRefAction(step, "fill", String(p.text ?? "")));
      if (p.submit) {
        lines.push(renderRefAction(step, "press", "Enter"));
      }
      return lines.join("\n");
    }
    case "browser_set_input_files":
      return `${lead}
${renderRefAction(step, "setInputFiles", p.paths)}`;
    case "browser_scroll_page": {
      const dir = String(p.dir ?? "down");
      const amount = typeof p.amount === "number" ? p.amount : 800;
      const dy = dir === "up" ? -amount : amount;
      return `${lead}
await page.mouse.wheel(0, ${dy});`;
    }
    case "browser_scroll_element": {
      const dir = String(p.dir ?? "down");
      const amount = typeof p.amount === "number" ? p.amount : 600;
      const dy = dir === "up" ? -amount : amount;
      const sel = refSelector(step);
      return `${lead}
await page.locator(${json(sel)}).hover();
await page.mouse.wheel(0, ${dy});`;
    }
    case "browser_read": {
      const target = step.executed.payload.ref ? `await page.locator(${json(refSelector(step))}).innerText()` : `await page.locator("body").innerText()`;
      return `${lead}
const _read_${step.t} = ${target};`;
    }
    case "scroll": {
      const dir = String(p.direction ?? "down");
      const amount = typeof p.amount === "number" ? p.amount : 50;
      return `${lead}
await screen.scroll(${json(dir)}, ${amount});`;
    }
    case "wait":
      return `${lead}
await page.waitForTimeout(${Number(p.ms ?? 1e3)});`;
    case "open_app":
      return `${lead}
await screen.openApp(${json(p.app)});`;
    case "note":
      return `${lead}
// note: ${oneLine(String(p.text ?? ""))}`;
    case "hover":
      return `${lead}
await screen.hover(${Number(p.x ?? 0)}, ${Number(p.y ?? 0)});`;
    case "type":
      return `${lead}
await screen.type(${json(p.text)}${p.thenPress ? `, { thenPress: ${json(p.thenPress)} }` : ""});`;
    case "key":
      return `${lead}
await screen.key(${json(p.combo)});`;
    case "click":
    case "double_click":
    case "triple_click":
    case "right_click": {
      const mode = executed.type === "double_click" ? "double" : executed.type === "triple_click" ? "triple" : executed.type === "right_click" ? "right" : "single";
      const target = step.intent ? json(oneLine(step.intent)) : "undefined";
      const fallback = typeof p.x === "number" && typeof p.y === "number" ? `, { fallback: { x: ${p.x}, y: ${p.y} } }` : "";
      const modeArg = mode === "single" ? "" : `, { mode: ${json(mode)} }`;
      const opts = modeArg && fallback ? `, { mode: ${json(mode)}, fallback: { x: ${p.x}, y: ${p.y} } }` : modeArg || fallback;
      return `${lead}
await screen.click(${target}${opts});`;
    }
    case "drag": {
      const from = p.from ?? null;
      const to = p.to ?? null;
      return `${lead}
await screen.drag({ from: { x: ${from?.x ?? 0}, y: ${from?.y ?? 0} }, to: { x: ${to?.x ?? 0}, y: ${to?.y ?? 0} } });`;
    }
    default:
      return `${lead}
// Unsupported action type for codegen: ${executed.type}
// Payload: ${json(p)}`;
  }
}
function renderRefAction(step, method, arg) {
  const refLabel = step.refLabel;
  const ref = step.executed.payload.ref;
  const argLiteral = arg === void 0 ? "" : json(arg);
  if (refLabel) {
    const role = mapAxRoleToPlaywright(refLabel.role);
    const name = refLabel.name.trim();
    if (role && name) {
      return `await page.getByRole(${json(role)}, { name: ${json(truncateName(name))} }).${method}(${argLiteral});`;
    }
    if (name) {
      return `await page.getByText(${json(truncateName(name))}).${method}(${argLiteral});`;
    }
  }
  const sel = ref ? `[data-holo-ref="${ref}"]` : "/* ref missing */";
  return `await page.locator(${json(sel)}).${method}(${argLiteral});  // FALLBACK: ${ref ?? "?"} (no role+name captured — selector only resolves while Holo3 has just snapshotted)`;
}
function refSelector(step) {
  if (step.refLabel) {
    const role = mapAxRoleToPlaywright(step.refLabel.role);
    const name = step.refLabel.name.trim();
    if (role && name) {
      return `role=${role}[name=${JSON.stringify(truncateName(name))}]`;
    }
  }
  const ref = step.executed.payload.ref;
  return ref ? `[data-holo-ref="${ref}"]` : "body";
}
function mapAxRoleToPlaywright(role) {
  switch (role) {
    case "button":
    case "link":
    case "checkbox":
    case "radio":
    case "menuitem":
    case "tab":
    case "combobox":
    case "option":
    case "switch":
    case "searchbox":
    case "textbox":
      return role;
    case "file-input":
      return "button";
    case "a":
      return "link";
    case "img":
      return "img";
    default:
      return null;
  }
}
function parseAxRefs(ax) {
  const out = /* @__PURE__ */ new Map();
  for (const line of ax.split("\n")) {
    const m = line.match(/^\[(e\d+)\]\s+(\S+)(?:\s+"([^"]*)")?/);
    if (!m) continue;
    out.set(m[1], { role: m[2], name: m[3] ?? "" });
  }
  return out;
}
function json(v) {
  return JSON.stringify(v);
}
function oneLine(s) {
  return s.replace(/\s+/g, " ").trim();
}
function indent(s, spaces) {
  const pad = " ".repeat(spaces);
  return s.split("\n").map((line) => line ? pad + line : line).join("\n");
}
function truncateName(name) {
  if (name.length <= 80) return name;
  return name.slice(0, 80);
}
const RECIPES_DIR = path__namespace.join(os__namespace.homedir(), ".ponder", "recipes");
const LEGACY_SESSIONS_PONDER = path__namespace.join(
  os__namespace.homedir(),
  ".ponder",
  "sessions"
);
const LEGACY_SESSIONS_HOLO3 = path__namespace.join(
  os__namespace.homedir(),
  ".holo3-agent",
  "sessions"
);
const SESSIONS_DIR = RECIPES_DIR;
let _migrated = false;
function migrateLegacyDir() {
  if (_migrated) return;
  _migrated = true;
  try {
    const entries = fs__namespace.readdirSync(RECIPES_DIR);
    if (entries.length > 0) return;
  } catch {
  }
  for (const legacy of [LEGACY_SESSIONS_PONDER, LEGACY_SESSIONS_HOLO3]) {
    try {
      const stat = fs__namespace.statSync(legacy);
      if (!stat.isDirectory()) continue;
      fs__namespace.mkdirSync(path__namespace.dirname(RECIPES_DIR), { recursive: true });
      fs__namespace.renameSync(legacy, RECIPES_DIR);
      try {
        process.stderr.write(
          `[ponder] migrated recordings: ${legacy} → ${RECIPES_DIR}
`
        );
      } catch {
      }
      return;
    } catch {
    }
  }
}
async function saveRecipe(source) {
  const recipe = "getRecipe" in source ? source.getRecipe() : source;
  migrateLegacyDir();
  try {
    await fsp__namespace.mkdir(RECIPES_DIR, { recursive: true });
    const id = makeRecipeId(recipe);
    const jsonPath = path__namespace.join(RECIPES_DIR, `${id}.json`);
    const recipePath = path__namespace.join(RECIPES_DIR, `${id}.recipe.ts`);
    await fsp__namespace.writeFile(jsonPath, JSON.stringify(recipe, null, 2), "utf-8");
    await fsp__namespace.writeFile(recipePath, renderRecipeScript(recipe), "utf-8");
    return { id, jsonPath, recipePath, sessionPath: recipePath };
  } catch {
    return null;
  }
}
const saveSession = saveRecipe;
function makeRecipeId(recipe) {
  const iso = recipe.startedAt.replace(/[:.]/g, "-").replace("T", "_").slice(
    0,
    19
  );
  const slug = recipe.task.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "task";
  return `${iso}-${slug}`;
}
async function listRecipes() {
  migrateLegacyDir();
  let files;
  try {
    files = await fsp__namespace.readdir(RECIPES_DIR);
  } catch {
    return [];
  }
  const entries = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const id = f.slice(0, -".json".length);
    const jsonPath = path__namespace.join(RECIPES_DIR, f);
    const recipePath = path__namespace.join(RECIPES_DIR, `${id}.recipe.ts`);
    try {
      const raw = await fsp__namespace.readFile(jsonPath, "utf-8");
      const recipe = JSON.parse(raw);
      entries.push({
        id,
        jsonPath,
        recipePath,
        sessionPath: recipePath,
        task: recipe.task,
        startedAt: recipe.startedAt,
        ...recipe.outcome ? { outcome: recipe.outcome } : {},
        steps: recipe.steps.length,
        ...recipe.durationMs !== void 0 ? { durationMs: recipe.durationMs } : {}
      });
    } catch {
    }
  }
  entries.sort((a, b) => a.startedAt < b.startedAt ? 1 : -1);
  return entries;
}
const listSessions = listRecipes;
async function loadRecipe(id) {
  migrateLegacyDir();
  const jsonPath = path__namespace.join(RECIPES_DIR, `${id}.json`);
  try {
    const raw = await fsp__namespace.readFile(jsonPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
const loadSession = loadRecipe;
async function findRecipeByTask(task) {
  const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const want = norm(task);
  if (!want) return null;
  const entries = await listRecipes();
  for (const e of entries) {
    if (e.steps <= 0 || e.outcome === "error") continue;
    if (norm(e.task) !== want) continue;
    const recipe = await loadRecipe(e.id);
    if (recipe && recipe.steps.length > 0) return { id: e.id, recipe };
  }
  return null;
}
async function resolveRecipeId(query) {
  const all = await listRecipes();
  if (all.length === 0) return null;
  const exact = all.find((e) => e.id === query);
  if (exact) return { id: exact.id, ambiguous: false };
  const lower = query.toLowerCase();
  const idMatches = all.filter((e) => e.id.toLowerCase().includes(lower));
  if (idMatches.length === 1) return { id: idMatches[0].id, ambiguous: false };
  if (idMatches.length > 1) return { ids: idMatches.map((e) => e.id), ambiguous: true };
  const taskMatches = all.filter((e) => e.task.toLowerCase().includes(lower));
  if (taskMatches.length === 1) return { id: taskMatches[0].id, ambiguous: false };
  if (taskMatches.length > 1) return { ids: taskMatches.map((e) => e.id), ambiguous: true };
  return null;
}
const resolveSessionId = resolveRecipeId;
async function latestRecipeId() {
  const all = await listRecipes();
  return all[0]?.id ?? null;
}
const latestSessionId = latestRecipeId;
function pathsFor(id) {
  const recipePath = path__namespace.join(RECIPES_DIR, `${id}.recipe.ts`);
  return {
    jsonPath: path__namespace.join(RECIPES_DIR, `${id}.json`),
    recipePath,
    sessionPath: recipePath
  };
}
const recorder = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  RECIPES_DIR,
  SESSIONS_DIR,
  buildRecipeFromTrace,
  createRecipeRecorder,
  createSessionRecorder,
  findRecipeByTask,
  getTraceMeta,
  latestRecipeId,
  latestSessionId,
  listRecipes,
  listSessions,
  loadRecipe,
  loadSession,
  onTraceStep,
  parseAxRefs,
  pathsFor,
  recipeFromConvexSteps,
  recordAction,
  recordFromBridgeTranscript,
  renderRecipeScript,
  renderSessionScript,
  resolveRecipeId,
  resolveSessionId,
  saveRecipe,
  saveSession,
  snapshotTrace,
  startNewTrace,
  traceLength
}, Symbol.toStringTag, { value: "Module" }));
const isDev = !electron.app.isPackaged;
const RENDERER_URL = process.env.ELECTRON_RENDERER_URL;
function rendererPath(name) {
  if (isDev && RENDERER_URL) return `${RENDERER_URL}/${name}/index.html`;
  return `file://${path.join(__dirname, `../renderer/${name}/index.html`)}`;
}
let buddyCursorTimer = null;
function createBuddyWindow() {
  const display = electron.screen.getPrimaryDisplay();
  const bounds = display.bounds;
  const win = new electron.BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    // Must be focusable from the start so that win.focus() during input mode
    // actually grants keyboard focus on macOS. Toggling focusable post-creation
    // is unreliable for transparent click-through windows.
    focusable: true,
    show: false,
    // type:"panel" makes this an NSPanel — non-activating, behaves like
    // Clicky's CompanionPanelView. Available on Electron 25+.
    type: "panel",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false
    }
  });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  void win.loadURL(rendererPath("buddy"));
  win.once("ready-to-show", () => win.show());
  return win;
}
function startBuddyCursorBroadcast(win) {
  stopBuddyCursorBroadcast();
  buddyCursorTimer = setInterval(() => {
    if (win.isDestroyed()) {
      stopBuddyCursorBroadcast();
      return;
    }
    if (win.webContents.isLoading()) return;
    const screenPoint = electron.screen.getCursorScreenPoint();
    const winBounds = win.getBounds();
    win.webContents.send("buddy:cursor", {
      x: screenPoint.x - winBounds.x,
      y: screenPoint.y - winBounds.y
    });
  }, 16);
}
function stopBuddyCursorBroadcast() {
  if (buddyCursorTimer) {
    clearInterval(buddyCursorTimer);
    buddyCursorTimer = null;
  }
}
function createAppWindow() {
  const win = new electron.BrowserWindow({
    width: 1100,
    height: 760,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: false
    }
  });
  void win.loadURL(rendererPath("app"));
  win.once("ready-to-show", () => win.show());
  if (isDev && process.env.HOLO3_DEVTOOLS === "1") {
    win.webContents.openDevTools({ mode: "detach" });
  }
  return win;
}
dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: false });
process.on("uncaughtException", (err) => {
  if (err?.code === "EADDRINUSE" && /19988/.test(err.message ?? "")) {
    console.warn("[browser] :19988 already in use — reusing the existing Playwriter relay");
    return;
  }
  throw err;
});
function readJsonBodyEarly(req, res, cb) {
  let body = "";
  req.on("data", (chunk2) => {
    body += chunk2.toString();
    if (body.length > 64e3) {
      res.writeHead(413);
      res.end(JSON.stringify({ error: "body too large" }));
      req.destroy();
    }
  });
  req.on("end", () => {
    try {
      cb(body.length > 0 ? JSON.parse(body) : null);
    } catch (e) {
      res.writeHead(400);
      res.end(
        JSON.stringify({
          code: "INTERNAL_ERROR",
          message: `Bad JSON: ${e instanceof Error ? e.message : String(e)}`
        })
      );
    }
  });
}
let tray = null;
let appWin = null;
let buddyWin = null;
let providerName = computeDefaultProvider();
let cancelFlag = false;
let agpAbort = null;
let activeSessionId = null;
function ensureBuddy() {
  if (!buddyWin || buddyWin.isDestroyed()) {
    buddyWin = createBuddyWindow();
    startBuddyCursorBroadcast(buddyWin);
    const fireWelcome = () => buddyWin?.webContents.send("buddy:welcome");
    if (buddyWin.webContents.isLoading()) {
      buddyWin.webContents.once(
        "did-finish-load",
        () => setTimeout(fireWelcome, 400)
      );
    } else {
      setTimeout(fireWelcome, 400);
    }
  }
  return buddyWin;
}
function setBuddyMode(mode) {
  if (!buddyWin || buddyWin.isDestroyed()) return;
  buddyWin.webContents.send("buddy:mode", mode);
}
function buddySay(kind, text) {
  if (!buddyWin || buddyWin.isDestroyed()) return;
  if (!text || !text.trim()) return;
  buddyWin.webContents.send("buddy:say", { kind, text: text.trim() });
}
function buddyAgentCursor(coords) {
  if (!buddyWin || buddyWin.isDestroyed()) return;
  buddyWin.webContents.send("buddy:agentCursor", coords);
}
let inputPillVisible = false;
function showInputPill() {
  const win = ensureBuddy();
  const screenPoint = electron.screen.getCursorScreenPoint();
  const winBounds = win.getBounds();
  const x = screenPoint.x - winBounds.x;
  const y = screenPoint.y - winBounds.y;
  win.setIgnoreMouseEvents(false);
  const focusChain = () => {
    if (win.isDestroyed()) return;
    if (process.platform === "darwin") electron.app.focus({ steal: true });
    if (!win.isVisible()) win.show();
    win.moveTop();
    win.focus();
    win.webContents.focus();
  };
  focusChain();
  setTimeout(focusChain, 50);
  win.webContents.send("buddy:inputMode", { visible: true, x, y });
  inputPillVisible = true;
}
function dismissInputPill() {
  if (!buddyWin || buddyWin.isDestroyed()) {
    inputPillVisible = false;
    return;
  }
  buddyWin.webContents.send("buddy:inputMode", { visible: false, x: 0, y: 0 });
  buddyWin.setIgnoreMouseEvents(true, { forward: true });
  inputPillVisible = false;
}
const convexUrl = process.env.VITE_CONVEX_URL ?? process.env.CONVEX_URL ?? PUBLIC_CONFIG.convexUrl;
const convex = convexUrl ? new browser.ConvexHttpClient(convexUrl) : null;
let browserClient = null;
let lastRunRecorder = null;
void (async () => {
  try {
    browserClient = await createPlaywriterClient({
      onStatus: (text) => {
        buddySay("status", text);
      }
    });
    console.log("[browser] client instantiated (Playwriter relay)");
  } catch (e) {
    console.warn(
      `[browser] client init failed (${e instanceof Error ? e.message : String(e)}) — vision-only mode`
    );
  }
})();
electron.app.on("before-quit", () => {
  if (browserClient) {
    void browserClient.close().catch(() => {
    });
  }
});
const router = makeRouter();
if (router) {
  void (async () => {
    const ok = await router.available();
    console.log(
      `[router] ${ok ? "ready" : "not ready"} (model=${process.env.ROUTER_MODEL ?? "qwen3.5:0.8b"}). ${ok ? "" : "Pull the model with: ollama pull " + (process.env.ROUTER_MODEL ?? "qwen3.5:0.8b")}`
    );
  })();
} else {
  console.log("[router] disabled (HOLO3_ROUTER=off)");
}
let warmup = new WarmupQueue(makeProvider(providerName));
warmup.onChange((state, detail) => {
  broadcastState({ warmup: state, errorMessage: detail });
  if (state === "ready") {
    new electron.Notification({
      title: "Anorha ready",
      body: `${humanProviderLabel(providerName)} ready.`
    }).show();
  }
});
function broadcastState(extra = {}) {
  const msg = {
    warmup: warmup.getState(),
    provider: executorNameFor(providerName),
    activeSessionId,
    ...extra
  };
  for (const w of electron.BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send("agent:state", msg);
  }
}
async function buildEvents(sessionId) {
  if (!convex || !sessionId) {
    return {
      onThought: (t) => buddySay("thought", t),
      onGround: (c) => {
        buddySay("status", `Targeting at (${c.x}, ${c.y})`);
        buddyAgentCursor({ x: c.x, y: c.y, kind: "click" });
      },
      onAction: (a) => buddySay(
        "action",
        `${a.type}${a.payload ? ` ${JSON.stringify(a.payload).slice(0, 60)}` : ""}`
      ),
      onScreenshot: () => buddySay("status", "Reading the screen…"),
      onError: (m) => buddySay("error", m),
      onStatus: (t) => buddySay("status", t)
    };
  }
  return {
    onThought: async (text) => {
      buddySay("thought", text);
      await convex.mutation(api.steps.append, {
        sessionId,
        kind: "thought",
        text
      });
    },
    onGround: async (coords) => {
      buddySay("status", `Targeting at (${coords.x}, ${coords.y})`);
      buddyAgentCursor({ x: coords.x, y: coords.y, kind: "click" });
      await convex.mutation(api.steps.append, {
        sessionId,
        kind: "ground",
        coords
      });
    },
    onAction: async (action) => {
      const summary = `${action.type}${action.payload ? ` ${JSON.stringify(action.payload).slice(0, 60)}` : ""}`;
      buddySay("action", summary);
      await convex.mutation(api.steps.append, {
        sessionId,
        kind: "action",
        action
      });
    },
    onScreenshot: async (png) => {
      buddySay("status", "Reading the screen…");
      try {
        const url = await convex.mutation(api.steps.generateUploadUrl, {});
        const upload = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "image/png" },
          body: new Uint8Array(png)
        });
        const { storageId } = await upload.json();
        await convex.mutation(api.steps.append, {
          sessionId,
          kind: "screenshot",
          screenshotId: storageId
        });
      } catch (e) {
        console.warn("screenshot upload skipped:", e);
      }
    },
    onError: async (message) => {
      buddySay("error", message);
      await convex.mutation(api.steps.append, {
        sessionId,
        kind: "error",
        text: message
      });
    },
    onStatus: async (text) => {
      buddySay("status", text);
      await convex.mutation(api.steps.append, {
        sessionId,
        kind: "status",
        text
      });
    }
  };
}
async function checkActionPermissions() {
  if (process.platform !== "darwin") return { ok: true };
  const perms = await probe();
  const missing = [];
  if (perms.accessibility !== "granted") missing.push("Accessibility");
  if (perms.screenRecording !== "granted") missing.push("Screen Recording");
  if (missing.length === 0) return { ok: true };
  return {
    ok: false,
    message: `${missing.join(" + ")} permission required for the agent to control the cursor. Open System Settings → Privacy & Security → ` + missing.join(" + ") + ", enable this app, then restart it."
  };
}
let _bridgeChain = Promise.resolve();
function chainBridge(fn) {
  const next = _bridgeChain.catch(() => null).then(fn);
  _bridgeChain = next;
  return next;
}
async function runAgentTaskForBridge(opts) {
  const { prompt, targetApp, maxSteps, decompose: decompose2 } = typeof opts === "string" ? {
    prompt: opts,
    targetApp: void 0,
    maxSteps: void 0,
    decompose: void 0
  } : opts;
  const permsCheck = await checkActionPermissions();
  if (!permsCheck.ok) {
    return {
      outcome: "error",
      sessionId: null,
      steps: 0,
      errorMessage: permsCheck.message ?? "Missing permissions",
      transcript: []
    };
  }
  cancelFlag = false;
  dismissInputPill();
  setBuddyMode("active");
  buddySay("status", "Got it (via MCP)…");
  let sessionId = null;
  if (convex) {
    try {
      sessionId = await convex.mutation(api.sessions.create, {
        prompt,
        provider: executorNameFor(providerName)
      });
      activeSessionId = sessionId;
      broadcastState();
    } catch (e) {
      console.warn(
        `[bridge] convex session create failed (${e instanceof Error ? e.message : String(e)})`
      );
    }
  }
  void warmup.warmInBackground();
  if (warmup.getState() !== "ready") {
    buddySay("status", `Warming up ${humanProviderLabel(providerName)}…`);
    try {
      await warmup.waitReady();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      buddySay("error", `Warmup failed: ${message}`);
      if (sessionId && convex) {
        await convex.mutation(api.sessions.setStatus, {
          sessionId,
          status: "error",
          error: message
        });
      }
      activeSessionId = null;
      broadcastState();
      setBuddyMode("hidden");
      return {
        outcome: "error",
        sessionId,
        steps: 0,
        errorMessage: message,
        transcript: []
      };
    }
  }
  if (sessionId && convex) {
    await convex.mutation(api.sessions.setStatus, {
      sessionId,
      status: "running"
    });
  }
  const t0 = Date.now();
  const elapsed = () => `[t=${((Date.now() - t0) / 1e3).toFixed(1)}s]`;
  const transcript = [];
  let stepCount = 0;
  let lastSnapshot;
  let lastPng;
  const baseEvents = await (sessionId ? buildEvents(sessionId) : buildEvents(""));
  const events = {
    onStatus: async (text) => {
      transcript.push(`${elapsed()} status: ${text}`);
      await baseEvents.onStatus(text);
    },
    onThought: async (text) => {
      transcript.push(`${elapsed()} thought: ${text}`);
      await baseEvents.onThought(text);
    },
    onGround: async (coords) => {
      await baseEvents.onGround(coords);
    },
    onAction: async (action) => {
      stepCount += 1;
      const payload = action.payload && Object.keys(action.payload).length > 0 ? ` ${JSON.stringify(action.payload).slice(0, 2e3)}` : "";
      transcript.push(`${elapsed()} action: ${action.type}${payload}`);
      await baseEvents.onAction(action);
    },
    onScreenshot: async (png) => {
      lastPng = png;
      await baseEvents.onScreenshot(png);
    },
    onError: async (message) => {
      transcript.push(`${elapsed()} error: ${message}`);
      await baseEvents.onError(message);
    },
    // onResult is optional on AgentEvents; baseEvents doesn't define
    // one, so we just collect into the transcript.
    onResult: async (text) => {
      transcript.push(`${elapsed()} result: ${text}`);
    }
  };
  let outcome = "exhausted";
  let errorMessage;
  try {
    outcome = await runTask({
      task: prompt,
      provider: warmup.getProvider(),
      events,
      shouldCancel: () => cancelFlag,
      // VISION-ONLY for MCP-forwarded calls: the orchestrator handles
      // browser_* directly, and the inner loop's router would otherwise
      // bias the agent toward Chrome navigation when the actual task
      // (file picker, native dialog) is OS-level.
      browser: null,
      router: null,
      // FLAT: agent_do is "ONE atomic OS-level mouse step" by contract.
      // The Ollama hierarchical planner over-decomposes one-step inputs
      // into wrong subtasks ("Open Chrome" when Chrome is already open,
      // "Marietta GA $3000" verbatim from its own few-shot example),
      // which produced the dock-icon spin loops in the wild. Skip the
      // planner entirely. See loop.ts RunOptions.flat.
      flat: true,
      // Optional macOS window crop. When set, every screenshot the loop
      // takes is cropped to the front window of `targetApp` before
      // being sent to plan/ground — empirically ~6× wall-time
      // reduction on /ground/batch and a comparable reduction on
      // /plan because image-patch tokens scale with pixel count. See
      // src/agent/loop.ts maybeCropToTargetApp.
      targetApp,
      // Per-call action budget override. Defaults to MAX_STEPS (50)
      // when not set. Long-horizon multi-app cases (e.g. the
      // honda-crv-spreadsheet-research T4) need ~40-60 steps; short
      // cases can keep the default. The bench harness reads this from
      // each case's frontmatter `max_steps:` field and passes it
      // through the /agent_do POST body.
      ...typeof maxSteps === "number" && maxSteps > 0 ? { maxSteps } : {},
      // Declared-multi-step decomposition (NEXT-WORK Item 2). Only
      // takes effect when PONDER_DECOMPOSE is also on — see
      // loop.ts RunOptions.decompose.
      ...decompose2 === true ? { decompose: true } : {},
      onBrowserSnapshot: (snap) => {
        lastSnapshot = snap;
      }
    });
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e);
    buddySay("error", errorMessage);
  }
  const advisory = errorMessage ? null : outcome === "exhausted" ? "\nNOTE: 'exhausted' is NOT the same as failure. The goal may already be partially or fully achieved — the inner brain sometimes emits useless actions after success because it can't always recognize completion from the screen alone. Before retrying or reporting failure, call browser_snapshot AND screen_screenshot, then check whether the goal is already done." : outcome === "cancelled" ? "\nNOTE: 'cancelled' means the run stopped mid-flight (timeout or user stop). The final state is unknown until observed — call browser_snapshot AND screen_screenshot before deciding the next move." : outcome === "infeasible" ? "\nNOTE: 'infeasible' is a DELIBERATE verdict — the inner agent checked and a concrete blocker (permission denied, read-only, login wall, system 'can't do that') makes this task impossible. This is the CORRECT answer for a trap/impossible task; do NOT just retry agent_do. Report the blocker to the user (it's in the transcript as 'INFEASIBLE: …') and ask how they want to proceed." : null;
  const finalText = errorMessage ? `Bridge run failed: ${errorMessage}` : `Outcome: ${outcome}
Steps: ${stepCount}${advisory ?? ""}${lastSnapshot ? `
Final URL: ${lastSnapshot.url}` : ""}`;
  if (sessionId && convex) {
    try {
      await convex.mutation(api.steps.append, {
        sessionId,
        kind: "result",
        text: finalText
      });
      await convex.mutation(api.sessions.setStatus, {
        sessionId,
        // Convex's status enum has no "infeasible"; it's a terminal
        // NON-error correct answer, so map it to "done" here (the
        // verbatim "Outcome: infeasible" + reason is preserved in the
        // result step text above and in BridgeResult.outcome, which is
        // what bench/run.ts actually scores on).
        status: errorMessage ? "error" : outcome === "done" || outcome === "infeasible" ? "done" : outcome === "cancelled" ? "cancelled" : "error",
        error: errorMessage
      });
    } catch (e) {
      console.warn(
        `[bridge] convex finalize failed (${e instanceof Error ? e.message : String(e)})`
      );
    }
  }
  activeSessionId = null;
  broadcastState();
  setBuddyMode("hidden");
  const finalScreenshotBase64 = lastPng && !errorMessage ? lastPng.toString("base64") : void 0;
  return {
    outcome: errorMessage ? "error" : outcome,
    sessionId,
    steps: stepCount,
    finalUrl: lastSnapshot?.url,
    errorMessage,
    transcript,
    finalScreenshotBase64
  };
}
const BRIDGE_PORT = Number(process.env.PONDER_BRIDGE_PORT ?? 7900);
let _bridgeServerStarted = false;
function startBridgeServer() {
  if (_bridgeServerStarted) return;
  const server2 = node_http.createServer((req, res) => {
    const url = req.url ?? "";
    const method = req.method ?? "GET";
    res.setHeader("Content-Type", "application/json");
    if (method === "GET" && url === "/version") {
      void (async () => {
        try {
          const { BUILD_INFO } = await Promise.resolve().then(() => require("./chunks/build-info-BKg3p8Mf.js"));
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(BUILD_INFO));
        } catch (e) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              commit: "unknown",
              commitShort: "unknown",
              dirty: false,
              builtAt: (/* @__PURE__ */ new Date(0)).toISOString(),
              error: e instanceof Error ? e.message : String(e)
            })
          );
        }
      })();
      return;
    }
    if (method === "GET" && url === "/health") {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          ok: true,
          provider: executorNameFor(providerName),
          warmup: warmup.getState(),
          activeSessionId,
          magicMode: isMagicMode()
        })
      );
      return;
    }
    const REQUIRES_AUTH = /^\/(browser\/(?:attach|snapshot|click|type|navigate|set_input_files|scroll|read)|recipe\/(?:save|list))/;
    let authState = null;
    if (REQUIRES_AUTH.test(url)) {
      const keyCount = readKeysSync().length;
      if (keyCount === 0) {
        res.writeHead(401);
        res.end(
          JSON.stringify({
            code: "MISSING_AUTH",
            message: "No Ponder API keys have been issued yet. Run `ponder grant <name>` to mint one.",
            hint: "Then re-send the request with Authorization: Bearer <key>.",
            docs_url: process.env.PONDER_DOCS_BASE_URL ?? "https://ponder.dev/docs/bridge#auth"
          })
        );
        return;
      }
      authState = verifyToken(req.headers["authorization"]);
      if (!authState.ok) {
        res.writeHead(401);
        res.end(
          JSON.stringify({
            code: authState.code,
            message: authState.message,
            hint: authState.code === "MISSING_AUTH" ? "Issue a key with `ponder grant <name>` and re-send with Authorization: Bearer <key>." : "Re-issue this consumer's key with `ponder grant <name>` and update the client.",
            docs_url: process.env.PONDER_DOCS_BASE_URL ?? "https://ponder.dev/docs/bridge#auth"
          })
        );
        return;
      }
      const consumerName = authState.consumer;
      const startedAt = Date.now();
      res.on("close", () => {
        touchKeySync(consumerName);
        audit({
          consumer: consumerName,
          method,
          path: url,
          status: res.statusCode || 0,
          durationMs: Date.now() - startedAt
        });
      });
    }
    if (method === "POST" && url === "/browser/attach") {
      readJsonBodyEarly(req, res, (parsed) => {
        const p = parsed ?? {};
        void (async () => {
          try {
            const wantUrl = typeof p.url === "string" ? p.url : void 0;
            if (!browserClient || !await browserClient.available()) {
              res.writeHead(503);
              res.end(
                JSON.stringify({
                  code: "BROWSER_NOT_ATTACHED",
                  message: "Playwriter relay is not ready. The Electron app cannot vision-attach a tab on behalf of an HTTP consumer.",
                  hint: "From the Holo3 app, attach a tab manually OR call ponder_browser_ensure via the MCP for the cold-start vision flow.",
                  docs_url: process.env.PONDER_DOCS_BASE_URL ?? "https://ponder.dev/docs/errors/browser_not_attached"
                })
              );
              return;
            }
            let snap = await browserClient.snapshot();
            if (wantUrl && !snap.url.startsWith(wantUrl)) {
              await browserClient.navigate(wantUrl);
              await new Promise((r) => setTimeout(r, 600));
              snap = await browserClient.snapshot();
            }
            res.writeHead(200);
            res.end(JSON.stringify({ url: snap.url, title: snap.title }));
          } catch (e) {
            res.writeHead(500);
            res.end(
              JSON.stringify({
                code: "INTERNAL_ERROR",
                message: e instanceof Error ? e.message : String(e)
              })
            );
          }
        })();
      });
      return;
    }
    if (method === "POST" && url === "/browser/snapshot") {
      void (async () => {
        try {
          if (!browserClient || !await browserClient.available()) {
            res.writeHead(503);
            res.end(
              JSON.stringify({
                code: "BROWSER_NOT_ATTACHED",
                message: "Chrome not attached to Playwriter.",
                hint: "Click the green Playwriter icon on a Chrome tab."
              })
            );
            return;
          }
          const snap = await browserClient.snapshot();
          res.writeHead(200);
          res.end(JSON.stringify(snap));
        } catch (e) {
          res.writeHead(500);
          res.end(
            JSON.stringify({
              code: "INTERNAL_ERROR",
              message: e instanceof Error ? e.message : String(e)
            })
          );
        }
      })();
      return;
    }
    if (method === "POST" && url === "/browser/navigate") {
      readJsonBodyEarly(req, res, (parsed) => {
        const p = parsed ?? {};
        if (typeof p.url !== "string" || !p.url.trim()) {
          res.writeHead(400);
          res.end(
            JSON.stringify({
              code: "INTERNAL_ERROR",
              message: "url required (string)."
            })
          );
          return;
        }
        void (async () => {
          try {
            if (!browserClient) throw new Error("browser client missing");
            await browserClient.navigate(p.url);
            await new Promise((r) => setTimeout(r, 700));
            const snap = await browserClient.snapshot();
            recordAction({
              type: "browser_navigate",
              payload: { url: p.url },
              url: snap.url,
              consumer: authState?.ok ? authState.consumer : void 0
            });
            res.writeHead(200);
            res.end(JSON.stringify({ url: snap.url, title: snap.title }));
          } catch (e) {
            res.writeHead(500);
            res.end(
              JSON.stringify({
                code: "INTERNAL_ERROR",
                message: e instanceof Error ? e.message : String(e)
              })
            );
          }
        })();
      });
      return;
    }
    if (method === "POST" && url === "/browser/click") {
      readJsonBodyEarly(req, res, (parsed) => {
        const p = parsed ?? {};
        if (typeof p.ref !== "string" || !p.ref) {
          res.writeHead(400);
          res.end(
            JSON.stringify({
              code: "INTERNAL_ERROR",
              message: "ref required (string)."
            })
          );
          return;
        }
        void (async () => {
          try {
            if (!browserClient) throw new Error("browser client missing");
            await browserClient.click(p.ref);
            recordAction({
              type: "browser_click",
              payload: { ref: p.ref },
              consumer: authState?.ok ? authState.consumer : void 0
            });
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.writeHead(500);
            res.end(
              JSON.stringify({
                code: "REF_NOT_FOUND",
                message: e instanceof Error ? e.message : String(e),
                hint: "Call /browser/snapshot to get fresh refs."
              })
            );
          }
        })();
      });
      return;
    }
    if (method === "POST" && url === "/browser/type") {
      readJsonBodyEarly(req, res, (parsed) => {
        const p = parsed ?? {};
        if (typeof p.ref !== "string" || typeof p.text !== "string") {
          res.writeHead(400);
          res.end(
            JSON.stringify({
              code: "INTERNAL_ERROR",
              message: "ref + text required."
            })
          );
          return;
        }
        const submit = p.submit === true;
        void (async () => {
          try {
            if (!browserClient) throw new Error("browser client missing");
            await browserClient.type(p.ref, p.text, {
              submit
            });
            recordAction({
              type: "browser_type",
              payload: {
                ref: p.ref,
                text: p.text,
                ...submit ? { submit: true } : {}
              },
              consumer: authState?.ok ? authState.consumer : void 0
            });
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.writeHead(500);
            res.end(
              JSON.stringify({
                code: "INTERNAL_ERROR",
                message: e instanceof Error ? e.message : String(e)
              })
            );
          }
        })();
      });
      return;
    }
    if (method === "POST" && url === "/browser/set_input_files") {
      readJsonBodyEarly(req, res, (parsed) => {
        const p = parsed ?? {};
        if (typeof p.ref !== "string" || !Array.isArray(p.paths)) {
          res.writeHead(400);
          res.end(
            JSON.stringify({
              code: "INTERNAL_ERROR",
              message: "ref + paths[] required."
            })
          );
          return;
        }
        void (async () => {
          try {
            if (!browserClient) throw new Error("browser client missing");
            const paths = p.paths.map(String);
            await browserClient.setInputFiles(p.ref, paths);
            recordAction({
              type: "browser_set_input_files",
              payload: { ref: p.ref, paths },
              consumer: authState?.ok ? authState.consumer : void 0
            });
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.writeHead(500);
            res.end(
              JSON.stringify({
                code: "INTERNAL_ERROR",
                message: e instanceof Error ? e.message : String(e)
              })
            );
          }
        })();
      });
      return;
    }
    if (method === "POST" && url === "/browser/scroll") {
      readJsonBodyEarly(req, res, (parsed) => {
        const p = parsed ?? {};
        if (p.direction !== "up" && p.direction !== "down") {
          res.writeHead(400);
          res.end(
            JSON.stringify({
              code: "INTERNAL_ERROR",
              message: "direction must be 'up' or 'down'."
            })
          );
          return;
        }
        const amount = typeof p.amount === "number" ? p.amount : void 0;
        void (async () => {
          try {
            if (!browserClient) throw new Error("browser client missing");
            if (typeof p.ref === "string" && p.ref) {
              await browserClient.scrollElement(
                p.ref,
                p.direction,
                amount
              );
              recordAction({
                type: "browser_scroll_element",
                payload: {
                  ref: p.ref,
                  dir: p.direction,
                  ...amount !== void 0 ? { amount } : {}
                },
                consumer: authState?.ok ? authState.consumer : void 0
              });
            } else {
              await browserClient.scrollPage(
                p.direction,
                amount
              );
              recordAction({
                type: "browser_scroll_page",
                payload: {
                  dir: p.direction,
                  ...amount !== void 0 ? { amount } : {}
                },
                consumer: authState?.ok ? authState.consumer : void 0
              });
            }
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.writeHead(500);
            res.end(
              JSON.stringify({
                code: "INTERNAL_ERROR",
                message: e instanceof Error ? e.message : String(e)
              })
            );
          }
        })();
      });
      return;
    }
    if (method === "POST" && url === "/browser/read") {
      readJsonBodyEarly(req, res, (parsed) => {
        const p = parsed ?? {};
        void (async () => {
          try {
            if (!browserClient) throw new Error("browser client missing");
            const text = await browserClient.readText(
              typeof p.ref === "string" ? p.ref : void 0
            );
            res.writeHead(200);
            res.end(JSON.stringify({ text }));
          } catch (e) {
            res.writeHead(500);
            res.end(
              JSON.stringify({
                code: "INTERNAL_ERROR",
                message: e instanceof Error ? e.message : String(e)
              })
            );
          }
        })();
      });
      return;
    }
    if (method === "POST" && url === "/extract") {
      readJsonBodyEarly(req, res, (parsed) => {
        const p = parsed ?? {};
        void (async () => {
          const T0 = Date.now();
          const timings = {};
          const ac = new AbortController();
          const killT = setTimeout(() => ac.abort(), 6e4);
          const withTimeout2 = (pr, ms, what) => Promise.race([
            pr,
            new Promise(
              (_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms}ms`)), ms)
            )
          ]);
          try {
            if (!browserClient) throw new Error("browser client missing");
            if (typeof p.url === "string" && p.url.trim()) {
              const t2 = Date.now();
              await browserClient.navigate(p.url).catch(
                (err) => console.warn("[extract] navigate failed:", err instanceof Error ? err.message : err)
              );
              await new Promise((r) => setTimeout(r, 300));
              timings.navigate = Date.now() - t2;
              recordAction({
                type: "browser_navigate",
                payload: { url: p.url },
                consumer: authState?.ok ? authState.consumer : void 0
              });
            }
            if (p.scroll !== false) {
              const t2 = Date.now();
              await scrollToLoadAll(browserClient, {
                maxScrolls: 18,
                settleMs: 800,
                stableRounds: 3
              }).catch(() => {
              });
              timings.scroll = Date.now() - t2;
            }
            let t = Date.now();
            let pageText = await withTimeout2(
              browserClient.readText(typeof p.ref === "string" ? p.ref : void 0),
              3e4,
              "readText"
            );
            if (p.deep === true) {
              const snap = await browserClient.snapshot().catch(() => null);
              if (snap?.ax) {
                const controls = snap.ax.split("\n").filter(
                  (l) => /\b(textbox|combobox|switch|checkbox|spinbutton|radio|slider|listbox|searchbox)\b/i.test(l)
                ).join("\n");
                if (controls) pageText += "\n\n=== FORM FIELD VALUES (control: current value) ===\n" + controls;
              }
            }
            timings.read = Date.now() - t;
            timings.textLen = pageText.length;
            if (!pageText || !pageText.trim()) {
              res.writeHead(200);
              res.end(JSON.stringify({ ok: true, headers: [], rows: [], count: 0, timings }));
              return;
            }
            const columns = Array.isArray(p.columns) ? p.columns.filter((c) => typeof c === "string") : void 0;
            const instructions = typeof p.instructions === "string" ? p.instructions : void 0;
            t = Date.now();
            const { headers, rows } = await extractRows({
              pageText,
              signal: ac.signal,
              ...columns && columns.length ? { columns } : {},
              ...instructions ? { instructions } : {}
            });
            timings.extract = Date.now() - t;
            timings.total = Date.now() - T0;
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true, headers, rows, count: rows.length, timings }));
          } catch (e) {
            res.writeHead(500);
            res.end(
              JSON.stringify({
                code: "INTERNAL_ERROR",
                message: e instanceof Error ? e.message : String(e)
              })
            );
          } finally {
            clearTimeout(killT);
          }
        })();
      });
      return;
    }
    if (method === "POST" && url === "/recipe/save") {
      readJsonBodyEarly(req, res, (parsed) => {
        const p = parsed ?? {};
        void (async () => {
          try {
            const recipe = buildRecipeFromTrace({
              ...typeof p.task === "string" ? { task: p.task } : {},
              ...typeof p.fromIndex === "number" ? { fromIndex: p.fromIndex } : {}
            });
            if (recipe.steps.length === 0) {
              res.writeHead(400);
              res.end(
                JSON.stringify({
                  code: "RECIPE_EMPTY",
                  message: "No actions in the trace buffer — nothing to save.",
                  hint: "Drive some browser_* / screen_* tools first."
                })
              );
              return;
            }
            const saved = await saveRecipe(recipe);
            if (!saved) {
              res.writeHead(500);
              res.end(
                JSON.stringify({
                  code: "RECIPE_SAVE_FAILED",
                  message: "Disk write failed."
                })
              );
              return;
            }
            res.writeHead(200);
            res.end(
              JSON.stringify({
                id: saved.id,
                recipePath: saved.recipePath,
                jsonPath: saved.jsonPath,
                steps: recipe.steps.length
              })
            );
          } catch (e) {
            res.writeHead(500);
            res.end(
              JSON.stringify({
                code: "INTERNAL_ERROR",
                message: e instanceof Error ? e.message : String(e)
              })
            );
          }
        })();
      });
      return;
    }
    if (method === "GET" && url === "/recipe/list") {
      void (async () => {
        try {
          const entries = await listRecipes();
          res.writeHead(200);
          res.end(
            JSON.stringify({
              recipes: entries.map((e) => ({
                id: e.id,
                task: e.task,
                steps: e.steps,
                recipePath: e.recipePath,
                jsonPath: e.jsonPath,
                ...e.outcome ? { outcome: e.outcome } : {}
              }))
            })
          );
        } catch (e) {
          res.writeHead(500);
          res.end(
            JSON.stringify({
              code: "INTERNAL_ERROR",
              message: e instanceof Error ? e.message : String(e)
            })
          );
        }
      })();
      return;
    }
    const recipeMatch = url.match(/^\/recipe\/([A-Za-z0-9._:-]+)$/);
    if (method === "GET" && recipeMatch) {
      void (async () => {
        try {
          const recipe = await loadRecipe(recipeMatch[1]);
          if (!recipe) {
            res.writeHead(404);
            res.end(
              JSON.stringify({
                code: "RECIPE_NOT_FOUND",
                message: `Recipe "${recipeMatch[1]}" not found.`
              })
            );
            return;
          }
          res.writeHead(200);
          res.end(JSON.stringify(recipe));
        } catch (e) {
          res.writeHead(500);
          res.end(
            JSON.stringify({
              code: "INTERNAL_ERROR",
              message: e instanceof Error ? e.message : String(e)
            })
          );
        }
      })();
      return;
    }
    if (method === "POST" && url === "/recipe/run") {
      readJsonBodyEarly(req, res, (parsed) => {
        const p = parsed ?? {};
        if (typeof p.id !== "string") {
          res.writeHead(400);
          res.end(
            JSON.stringify({
              code: "INTERNAL_ERROR",
              message: "id required (string)."
            })
          );
          return;
        }
        const runParams = p.params && typeof p.params === "object" && !Array.isArray(p.params) ? p.params : void 0;
        void (async () => {
          try {
            const recipe = await loadRecipe(p.id);
            if (!recipe) {
              res.writeHead(404);
              res.end(
                JSON.stringify({
                  code: "RECIPE_NOT_FOUND",
                  message: `Recipe "${p.id}" not found.`
                })
              );
              return;
            }
            const { replayRecipe } = await Promise.resolve().then(() => require("./chunks/sdk-CS9epbch.js"));
            const result = await replayRecipe(recipe, {
              reground: p.reground === true,
              browser: browserClient ?? null,
              // Inject the warmed provider so the per-step vision SELF-HEAL
              // tier can fire on a deterministic miss (not just on reground).
              provider: warmup.getProvider(),
              // Per-run data for {{token}} substitution (browser-job payload):
              // turns one recorded create/update flow into a data-driven recipe.
              ...runParams ? { params: runParams } : {},
              // Self-heal write-back: if a step's refLabel drifted (a renamed
              // element) OR a step was vision-healed, persist the corrected
              // recipe (same id is re-derived) so the next run is deterministic.
              persist: (r) => saveRecipe(r)
            });
            res.writeHead(200);
            res.end(JSON.stringify(result));
          } catch (e) {
            res.writeHead(500);
            res.end(
              JSON.stringify({
                code: "INTERNAL_ERROR",
                message: e instanceof Error ? e.message : String(e)
              })
            );
          }
        })();
      });
      return;
    }
    if (method === "POST" && url === "/agent_do") {
      let body = "";
      req.on("data", (chunk2) => {
        body += chunk2.toString();
        if (body.length > 64e3) {
          res.writeHead(413);
          res.end(JSON.stringify({ error: "task too large (>64k)" }));
          req.destroy();
        }
      });
      req.on("end", () => {
        void (async () => {
          try {
            const parsed = JSON.parse(body);
            const task = typeof parsed.task === "string" ? parsed.task : "";
            const targetApp = typeof parsed.targetApp === "string" ? parsed.targetApp.trim() : void 0;
            const maxSteps = typeof parsed.maxSteps === "number" && Number.isFinite(parsed.maxSteps) && parsed.maxSteps >= 5 && parsed.maxSteps <= 200 ? Math.floor(parsed.maxSteps) : void 0;
            if (!task.trim()) {
              res.writeHead(400);
              res.end(JSON.stringify({ error: "empty task" }));
              return;
            }
            const decompose2 = parsed.decompose === true;
            const result = await chainBridge(
              () => runAgentTaskForBridge({
                prompt: task,
                targetApp,
                maxSteps,
                decompose: decompose2
              })
            );
            res.writeHead(200);
            res.end(JSON.stringify(result));
          } catch (e) {
            res.writeHead(500);
            res.end(
              JSON.stringify({
                error: e instanceof Error ? e.message : String(e)
              })
            );
          }
        })();
      });
      return;
    }
    const readJsonBody = (cb) => {
      let body = "";
      req.on("data", (chunk2) => {
        body += chunk2.toString();
        if (body.length > 64e3) {
          res.writeHead(413);
          res.end(JSON.stringify({ error: "body too large" }));
          req.destroy();
        }
      });
      req.on("end", () => {
        try {
          cb(body.length > 0 ? JSON.parse(body) : {});
        } catch (e) {
          cb(null, e instanceof Error ? e.message : String(e));
        }
      });
    };
    if (method === "POST" && url === "/screen/screenshot") {
      void (async () => {
        try {
          const shot = await screenshot();
          res.writeHead(200);
          res.end(
            JSON.stringify({
              pngBase64: shot.png.toString("base64"),
              width: shot.width,
              height: shot.height,
              offsetX: shot.offsetX,
              offsetY: shot.offsetY,
              // Surface the PNG-to-logical pixel ratio so MCP-side
              // consumers (agent_click_sequence's crop path, the
              // vision-precision bench, anorha, etc.) can scale crop
              // coords from logical → physical before slicing the
              // PNG. On non-Retina or nut-js this is 1; on Retina
              // via desktopCapturer it's 2 (or 3 on some 5K monitors).
              scaleFactor: shot.scaleFactor
            })
          );
        } catch (e) {
          res.writeHead(500);
          res.end(
            JSON.stringify({
              error: e instanceof Error ? e.message : String(e)
            })
          );
        }
      })();
      return;
    }
    if (method === "POST" && url === "/screen/type") {
      readJsonBody((parsed, err) => {
        if (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: `bad JSON: ${err}` }));
          return;
        }
        const { text, thenPress } = parsed ?? {};
        if (typeof text !== "string") {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "text must be a string" }));
          return;
        }
        void (async () => {
          try {
            await typeText(text);
            if (typeof thenPress === "string" && thenPress) {
              await new Promise((r) => setTimeout(r, 120));
              await pressCombo(thenPress);
            }
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.writeHead(500);
            res.end(
              JSON.stringify({
                error: e instanceof Error ? e.message : String(e)
              })
            );
          }
        })();
      });
      return;
    }
    if (method === "POST" && url === "/screen/hotkey") {
      readJsonBody((parsed, err) => {
        if (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: `bad JSON: ${err}` }));
          return;
        }
        const { combo } = parsed ?? {};
        if (typeof combo !== "string" || !combo) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "combo must be a non-empty string" }));
          return;
        }
        void (async () => {
          try {
            await pressCombo(combo);
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.writeHead(500);
            res.end(
              JSON.stringify({
                error: e instanceof Error ? e.message : String(e)
              })
            );
          }
        })();
      });
      return;
    }
    if (method === "POST" && url === "/screen/click") {
      readJsonBody((parsed, err) => {
        if (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: `bad JSON: ${err}` }));
          return;
        }
        const p = parsed ?? {};
        if (typeof p.x !== "number" || typeof p.y !== "number") {
          res.writeHead(400);
          res.end(
            JSON.stringify({ error: "x and y must be numbers" })
          );
          return;
        }
        const mode = p.mode === "double" || p.mode === "right" || p.mode === "triple" ? p.mode : "single";
        void (async () => {
          try {
            await click(p.x, p.y, {
              double: mode === "double",
              triple: mode === "triple",
              button: mode === "right" ? "right" : "left"
            });
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true, x: p.x, y: p.y, mode }));
          } catch (e) {
            res.writeHead(500);
            res.end(
              JSON.stringify({
                error: e instanceof Error ? e.message : String(e)
              })
            );
          }
        })();
      });
      return;
    }
    if (method === "POST" && url === "/screen/drag") {
      readJsonBody((parsed, err) => {
        if (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: `bad JSON: ${err}` }));
          return;
        }
        const p = parsed ?? {};
        if (typeof p.fromX !== "number" || typeof p.fromY !== "number" || typeof p.toX !== "number" || typeof p.toY !== "number") {
          res.writeHead(400);
          res.end(
            JSON.stringify({
              error: "fromX, fromY, toX, toY must all be numbers"
            })
          );
          return;
        }
        void (async () => {
          try {
            await drag(
              p.fromX,
              p.fromY,
              p.toX,
              p.toY
            );
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.writeHead(500);
            res.end(
              JSON.stringify({
                error: e instanceof Error ? e.message : String(e)
              })
            );
          }
        })();
      });
      return;
    }
    if (method === "POST" && url === "/browser/url") {
      readJsonBody((parsed, err) => {
        if (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: `bad JSON: ${err}` }));
          return;
        }
        const { processName } = parsed ?? {};
        if (typeof processName !== "string" || processName.trim().length === 0) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "processName required" }));
          return;
        }
        if (/["\\\n\r]/.test(processName)) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "processName contains invalid characters" }));
          return;
        }
        if (process.platform !== "darwin") {
          res.writeHead(200);
          res.end(JSON.stringify({ error: "non-darwin platform" }));
          return;
        }
        const lower = processName.toLowerCase();
        let appScript = null;
        if (lower === "google chrome" || lower === "chrome") {
          appScript = `tell application "Google Chrome"
return (URL of active tab of front window) & "\\t" & (title of active tab of front window)
end tell`;
        } else if (lower === "safari") {
          appScript = `tell application "Safari"
return (URL of current tab of front window) & "\\t" & (name of current tab of front window)
end tell`;
        }
        const fallbackScript = `tell application "System Events"
tell process "${processName}"
return name of front window
end tell
end tell`;
        const runAndParse = (script, isFallback, done) => {
          node_child_process.execFile(
            "/usr/bin/osascript",
            ["-e", script],
            { timeout: 1500, encoding: "utf-8" },
            (e, stdout, stderr) => {
              if (e) {
                done({
                  ok: false,
                  detail: stderr && String(stderr).trim() || (e instanceof Error ? e.message : String(e))
                });
                return;
              }
              const out = String(stdout).trim();
              if (isFallback) {
                done({ ok: true, url: "", title: out });
              } else {
                const sep = out.indexOf("	");
                done({
                  ok: true,
                  url: sep >= 0 ? out.slice(0, sep) : out,
                  title: sep >= 0 ? out.slice(sep + 1) : ""
                });
              }
            }
          );
        };
        const tryAppScript = appScript;
        if (tryAppScript) {
          runAndParse(tryAppScript, false, (first) => {
            const r = first;
            if (r.ok && r.url) {
              res.writeHead(200);
              res.end(JSON.stringify({ url: r.url, title: r.title ?? "" }));
              return;
            }
            runAndParse(fallbackScript, true, (second) => {
              const r2 = second;
              if (r2.ok && r2.title) {
                res.writeHead(200);
                res.end(
                  JSON.stringify({
                    url: "",
                    title: r2.title,
                    fallback: "title-only (Automation perm denied; granting Electron → Google Chrome in System Settings → Privacy → Automation unlocks full URL)"
                  })
                );
                return;
              }
              res.writeHead(200);
              res.end(
                JSON.stringify({
                  error: "osascript_failed",
                  detail: r.detail ?? r2.detail ?? "both AppleScript paths failed"
                })
              );
            });
          });
        } else {
          runAndParse(fallbackScript, true, (resp) => {
            const r = resp;
            if (r.ok && r.title) {
              res.writeHead(200);
              res.end(
                JSON.stringify({ url: "", title: r.title, fallback: "title-only (unsupported browser)" })
              );
              return;
            }
            res.writeHead(200);
            res.end(
              JSON.stringify({ error: "osascript_failed", detail: r.detail ?? "title fallback failed" })
            );
          });
        }
      });
      return;
    }
    if (method === "POST" && url === "/window/raise") {
      readJsonBody((parsed, err) => {
        if (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: `bad JSON: ${err}` }));
          return;
        }
        const { processName } = parsed ?? {};
        if (typeof processName !== "string" || processName.trim().length === 0) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "processName required (string)" }));
          return;
        }
        if (/["\\\n\r]/.test(processName)) {
          res.writeHead(400);
          res.end(
            JSON.stringify({ error: "processName contains invalid characters" })
          );
          return;
        }
        if (process.platform !== "darwin") {
          res.writeHead(200);
          res.end(JSON.stringify({ ok: false, error: "non-darwin platform" }));
          return;
        }
        const script = `tell application "${processName}" to activate`;
        node_child_process.execFile(
          "/usr/bin/osascript",
          ["-e", script],
          { timeout: 1500, encoding: "utf-8" },
          (e, _stdout, stderr) => {
            if (e) {
              res.writeHead(200);
              res.end(
                JSON.stringify({
                  ok: false,
                  error: "osascript_failed",
                  detail: stderr && String(stderr).trim() || (e instanceof Error ? e.message : String(e))
                })
              );
              return;
            }
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true }));
          }
        );
      });
      return;
    }
    if (method === "POST" && url === "/window/bounds") {
      readJsonBody((parsed, err) => {
        if (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: `bad JSON: ${err}` }));
          return;
        }
        const { processName } = parsed ?? {};
        if (typeof processName !== "string" || processName.trim().length === 0) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "processName required (string)" }));
          return;
        }
        if (/["\\\n\r]/.test(processName)) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "processName contains invalid characters" }));
          return;
        }
        if (process.platform !== "darwin") {
          res.writeHead(200);
          res.end(JSON.stringify({ error: "non-darwin platform" }));
          return;
        }
        const script = `tell application "System Events"
  if not (exists process "${processName}") then return "missing"
  tell process "${processName}"
    if (count of windows) is 0 then return "nowindow"
    set p to position of front window
    set s to size of front window
    return (item 1 of p as integer) & "," & (item 2 of p as integer) & "," & (item 1 of s as integer) & "," & (item 2 of s as integer)
  end tell
end tell`;
        node_child_process.execFile(
          "/usr/bin/osascript",
          ["-e", script],
          { timeout: 1500, encoding: "utf-8" },
          (e, stdout, stderr) => {
            if (e) {
              res.writeHead(200);
              res.end(
                JSON.stringify({
                  error: "osascript_failed",
                  detail: stderr && String(stderr).trim() || (e instanceof Error ? e.message : String(e))
                })
              );
              return;
            }
            const out = String(stdout).trim();
            if (out === "missing" || out === "nowindow") {
              res.writeHead(200);
              res.end(JSON.stringify({ error: out }));
              return;
            }
            const nums = (out.match(/-?\d+/g) ?? []).map(Number);
            if (nums.length < 4 || nums.some((n) => !Number.isFinite(n))) {
              res.writeHead(200);
              res.end(
                JSON.stringify({ error: "parse_failed", detail: out })
              );
              return;
            }
            const [x, y, w, h] = nums;
            if (w <= 0 || h <= 0) {
              res.writeHead(200);
              res.end(JSON.stringify({ error: "zero_size" }));
              return;
            }
            res.writeHead(200);
            res.end(JSON.stringify({ x, y, width: w, height: h }));
          }
        );
      });
      return;
    }
    if (method === "POST" && url === "/screen/scroll") {
      readJsonBody((parsed, err) => {
        if (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: `bad JSON: ${err}` }));
          return;
        }
        const { direction, amount } = parsed ?? {};
        if (direction !== "up" && direction !== "down") {
          res.writeHead(400);
          res.end(
            JSON.stringify({ error: "direction must be 'up' or 'down'" })
          );
          return;
        }
        const SCROLL_FLOOR = 50;
        const ticks = Math.max(
          SCROLL_FLOOR,
          typeof amount === "number" ? amount : SCROLL_FLOOR
        );
        const signed = direction === "up" ? ticks : -ticks;
        void (async () => {
          try {
            await scroll(signed);
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true, ticks }));
          } catch (e) {
            res.writeHead(500);
            res.end(
              JSON.stringify({
                error: e instanceof Error ? e.message : String(e)
              })
            );
          }
        })();
      });
      return;
    }
    res.writeHead(404);
    res.end(JSON.stringify({ error: "not found" }));
  });
  server2.on("error", (e) => {
    if (e.code === "EADDRINUSE") {
      console.warn(
        `[bridge] port ${BRIDGE_PORT} already in use — another Holo3 instance? MCP forwarding will fail; close the other instance and restart.`
      );
    } else {
      console.warn(
        `[bridge] http server error: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  });
  server2.requestTimeout = 0;
  server2.headersTimeout = 0;
  server2.listen(BRIDGE_PORT, "127.0.0.1", () => {
    _bridgeServerStarted = true;
    console.log(
      `[bridge] listening on http://127.0.0.1:${BRIDGE_PORT} — MCP can now forward agent_do here (requestTimeout=0)`
    );
  });
}
async function runAgpAppTask(prompt) {
  const client = new AgpClient();
  if (!client.configured) {
    const msg = "The server brain (AGP) needs HAI_API_KEY set. Switch to the Local engine in Settings, or add the key, then try again.";
    buddySay("error", msg);
    return { ok: false, error: msg };
  }
  if (!browserClient) {
    const msg = "Browser engine not ready yet — give it a second and try again.";
    buddySay("error", msg);
    return { ok: false, error: msg };
  }
  let page2 = await browserClient.rawPage?.().catch(() => null);
  if (!page2) {
    buddySay("status", "Connecting to Chrome…");
    try {
      const { autoAttachPlaywriter } = await Promise.resolve().then(() => require("./chunks/auto-attach-CXUAXFo2.js"));
      await autoAttachPlaywriter(browserClient);
    } catch {
    }
    page2 = await browserClient.rawPage?.().catch(() => null);
  }
  if (!page2) {
    const msg = "Couldn't attach to Chrome automatically — make sure Chrome is open, then try again.";
    buddySay("error", msg);
    return { ok: false, error: msg };
  }
  cancelFlag = false;
  dismissInputPill();
  setBuddyMode("active");
  buddySay("status", "Got it…");
  let sessionId = null;
  if (convex) {
    try {
      sessionId = await convex.mutation(api.sessions.create, {
        prompt,
        // AGP runs are H-company's server-side brain — label them "hcompany"
        // in History until the Convex sessions schema gains a distinct "agp".
        provider: "hcompany"
      });
      activeSessionId = sessionId;
      broadcastState();
      await convex.mutation(api.sessions.setStatus, {
        sessionId,
        status: "running"
      });
    } catch (e) {
      console.warn(`[agp:run] convex session create failed (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  const events = await buildEvents(sessionId ?? "");
  buddySay("status", "Thinking on the server brain…");
  const ac = new AbortController();
  agpAbort = ac;
  try {
    const result = await runAgpTask({
      task: prompt,
      client,
      browser: browserClient,
      signal: ac.signal,
      onEvent: (ev) => {
        if (ev.kind === "policy_event" && ev.text) void events.onThought?.(ev.text);
        else if (ev.kind === "error_event" && ev.error) void events.onError?.(ev.error);
        else if (ev.kind === "observation_event") void events.onStatus?.("Reading the page…");
      },
      onCommand: (name, args) => {
        void events.onAction?.({ type: name, payload: args });
      }
    });
    const failed = result.status === "failed" || result.status === "error" || result.status === "timed_out";
    const answer = result.answer?.trim() || (failed ? `Couldn't finish: ${result.error ?? result.status}.` : `Done (${result.commandCount} steps).`);
    buddySay("answer", answer);
    if (sessionId && convex) {
      try {
        await convex.mutation(api.steps.append, {
          sessionId,
          kind: "result",
          text: answer
        });
      } catch (e) {
        console.warn(`[agp:run] convex result persist failed (${e instanceof Error ? e.message : String(e)})`);
      }
      await convex.mutation(api.sessions.setStatus, {
        sessionId,
        status: failed ? "error" : result.status === "interrupted" ? "cancelled" : "done",
        ...result.error ? { error: result.error } : {}
      }).catch(() => {
      });
    }
    return failed ? { ok: false, error: result.error ?? "AGP run failed" } : { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    buddySay("error", message);
    console.error("[agp:run]", message);
    if (sessionId && convex) {
      await convex.mutation(api.sessions.setStatus, {
        sessionId,
        status: "error",
        error: message
      }).catch(() => {
      });
    }
    return { ok: false, error: message };
  } finally {
    agpAbort = null;
    activeSessionId = null;
    broadcastState();
    setBuddyMode("hidden");
    buddyAgentCursor(null);
  }
}
async function maybeAutoReplay(prompt) {
  if (!getAutoReplayPreference()) return null;
  if (!browserClient) return null;
  const match = await findRecipeByTask(prompt).catch(() => null);
  if (!match || match.recipe.steps.length === 0) return null;
  if (!await browserClient.available().catch(() => false)) {
    try {
      const { autoAttachPlaywriter } = await Promise.resolve().then(() => require("./chunks/auto-attach-CXUAXFo2.js"));
      await autoAttachPlaywriter(browserClient);
    } catch {
    }
  }
  cancelFlag = false;
  dismissInputPill();
  setBuddyMode("active");
  buddySay(
    "status",
    `Replaying saved automation "${match.recipe.task}" — type "fresh ${prompt}" to run from scratch.`
  );
  try {
    const { replayRecipe } = await Promise.resolve().then(() => require("./chunks/sdk-CS9epbch.js"));
    const res = await replayRecipe(match.recipe, {
      reground: true,
      browser: browserClient,
      provider: warmup.getProvider(),
      // Self-heal write-back: persist any drift (renamed elements) under the same id.
      persist: (r) => saveRecipe(r),
      shouldCancel: () => cancelFlag,
      onStep: ({ index, step, status, error }) => buddySay(
        status === "error" ? "error" : "action",
        `${index + 1}. ${step.executed?.type ?? "step"}${error ? ` — ${error}` : ""}`
      )
    });
    if (res.failed > 0) {
      buddySay("status", "Saved automation hit a snag — running it fresh instead…");
      return null;
    }
    const healedNote = res.healed ? ` · adapted ${res.healed} changed step(s)` : "";
    buddySay("answer", `Done — replayed saved automation (${res.ok} step(s)${healedNote}).`);
    setBuddyMode("hidden");
    return { ok: true };
  } catch (e) {
    buddySay("status", "Saved automation couldn't run — running fresh…");
    console.warn(`[auto-replay] ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
function setupIpc() {
  electron.ipcMain.handle("agent:run", async (_e, rawPrompt) => {
    if (!rawPrompt?.trim()) return { ok: false, error: "empty prompt" };
    const freshMatch = /^\s*(?:fresh|redo)\b[:\s]+/i.exec(rawPrompt);
    const prompt = (freshMatch ? rawPrompt.slice(freshMatch[0].length) : rawPrompt).trim();
    if (!prompt) return { ok: false, error: "empty prompt" };
    if (!freshMatch) {
      const replayed = await maybeAutoReplay(prompt);
      if (replayed) return replayed;
    }
    if (getEnginePreference() === "agp") {
      return runAgpAppTask(prompt);
    }
    const permsCheck = await checkActionPermissions();
    if (!permsCheck.ok) {
      const msg = permsCheck.message ?? "Missing permissions";
      console.error(`[agent:run] blocked by perms: ${msg}`);
      buddySay("error", msg);
      void requestAccessibility();
      void requestScreenRecording();
      return { ok: false, error: msg };
    }
    cancelFlag = false;
    dismissInputPill();
    setBuddyMode("active");
    buddySay("status", "Got it…");
    let sessionId = null;
    if (convex) {
      sessionId = await convex.mutation(api.sessions.create, {
        prompt,
        provider: executorNameFor(providerName)
      });
      activeSessionId = sessionId;
      broadcastState();
    }
    void warmup.warmInBackground();
    if (warmup.getState() !== "ready") {
      const warmupLabel = providerName === "remote" ? "Modal" : providerName === "hcompany" ? "H Company API" : "local model";
      buddySay("status", `Warming up ${warmupLabel}…`);
      if (sessionId && convex) {
        await convex.mutation(api.steps.append, {
          sessionId,
          kind: "status",
          text: `Waiting for ${warmupLabel} to warm up…`
        });
      }
      try {
        await warmup.waitReady();
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        buddySay("error", `Warmup failed: ${message}`);
        if (sessionId && convex) {
          await convex.mutation(api.sessions.setStatus, {
            sessionId,
            status: "error",
            error: message
          });
        }
        return { ok: false, error: message };
      }
    }
    if (sessionId && convex) {
      await convex.mutation(api.sessions.setStatus, {
        sessionId,
        status: "running"
      });
    }
    buddySay("status", "Reading the screen…");
    const baseEvents = sessionId ? await buildEvents(sessionId) : await buildEvents("");
    const recorder2 = createRecipeRecorder({ task: prompt, provider: String(providerName) });
    lastRunRecorder = null;
    const events = {
      ...baseEvents,
      onAction: async (a) => {
        try {
          recorder2.onAction(a);
        } catch {
        }
        await baseEvents.onAction?.(a);
      }
    };
    const runHistory = [];
    let lastShot;
    let lastSnapshot;
    try {
      const result = await runTask({
        task: prompt,
        provider: warmup.getProvider(),
        events,
        shouldCancel: () => cancelFlag,
        browser: browserClient,
        router,
        onBrowserSnapshot: (snap) => {
          lastSnapshot = snap;
        },
        onHistory: (action) => {
          runHistory.push(action);
          try {
            recorder2.onHistory(action);
          } catch {
          }
        },
        onScreenshotBuffer: (png) => {
          lastShot = png;
        }
      });
      const summaryOutcome = result === "done" ? "done" : result === "cancelled" ? "cancelled" : "exhausted";
      try {
        recorder2.setOutcome(summaryOutcome);
        lastRunRecorder = recorder2.getRecipe().steps.length > 0 ? recorder2 : null;
      } catch {
        lastRunRecorder = null;
      }
      if (result !== "cancelled") {
        buddySay("status", "Reading the result…");
        let pageText;
        if (browserClient && await browserClient.available().catch(() => false)) {
          try {
            lastSnapshot = await browserClient.snapshot();
          } catch (e) {
            console.warn(
              `[extract] re-snapshot failed (${e instanceof Error ? e.message : String(e)}) — using previous`
            );
          }
          try {
            pageText = await browserClient.readText();
            console.log(
              `[extract] page text scraped (${pageText.length}b) — feeding to closer`
            );
          } catch (e) {
            console.warn(
              `[extract] readText failed (${e instanceof Error ? e.message : String(e)}) — closer will work from snapshot+history only`
            );
          }
        }
        const extractor = createExtractor(warmup.getProvider());
        const ctrl = new AbortController();
        const cancelTick = setInterval(() => {
          if (cancelFlag) ctrl.abort();
        }, 100);
        let answer;
        try {
          answer = await extractor.extract({
            task: prompt,
            history: runHistory,
            lastScreenshotB64: lastShot?.toString("base64") ?? "",
            browserSnapshot: lastSnapshot,
            pageText,
            outcome: summaryOutcome,
            signal: ctrl.signal
          });
        } catch (e) {
          console.warn(
            `[extract] threw unexpectedly (${e instanceof Error ? e.message : String(e)}) — synthesizing fallback`
          );
          answer = summaryOutcome === "exhausted" ? `Got stuck before finishing "${prompt}". Try a more specific prompt.` : `Done — ${runHistory.slice(-3).join(" → ") || "no actions recorded"}.`;
        } finally {
          clearInterval(cancelTick);
        }
        if (answer && answer.trim()) {
          buddySay("answer", answer);
          if (sessionId && convex) {
            try {
              await convex.mutation(api.steps.append, {
                sessionId,
                kind: "result",
                text: answer
              });
            } catch (e) {
              console.warn(
                `[extract] convex persist failed (${e instanceof Error ? e.message : String(e)}) — answer is in the buddy bubble but won't appear in History until you redeploy convex schema (run \`npx convex dev\`)`
              );
            }
          }
        }
      }
      if (sessionId && convex) {
        await convex.mutation(api.sessions.setStatus, {
          sessionId,
          status: result === "done" ? "done" : result === "cancelled" ? "cancelled" : "done"
        });
      }
      return { ok: true, result };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      buddySay("error", message);
      console.error("[agent:run]", message);
      if (sessionId && convex) {
        await convex.mutation(api.sessions.setStatus, {
          sessionId,
          status: "error",
          error: message
        });
      }
      return { ok: false, error: message };
    } finally {
      activeSessionId = null;
      broadcastState();
      setBuddyMode("hidden");
      buddyAgentCursor(null);
    }
  });
  electron.ipcMain.handle("agent:cancel", () => {
    cancelFlag = true;
    agpAbort?.abort();
    return { ok: true };
  });
  electron.ipcMain.handle("agent:warm", async () => {
    try {
      await warmup.warm();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
  electron.ipcMain.handle("agent:state", () => ({
    warmup: warmup.getState(),
    provider: executorNameFor(providerName),
    activeSessionId
  }));
  electron.ipcMain.handle("buddy:dismissInput", () => {
    dismissInputPill();
    return { ok: true };
  });
  electron.ipcMain.handle("app:show", () => {
    if (!appWin || appWin.isDestroyed()) appWin = createAppWindowWired();
    appWin.show();
    appWin.focus();
    return { ok: true };
  });
  electron.ipcMain.handle("perms:probe", async () => probe());
  electron.ipcMain.handle("perms:revealBinary", () => {
    const exe = electron.app.getPath("exe");
    const bundle = exe.replace(/\/Contents\/MacOS\/.+$/, "");
    electron.shell.showItemInFolder(bundle);
    return { ok: true, path: bundle };
  });
  electron.ipcMain.handle("perms:open", (_e, pane) => {
    if (process.platform !== "darwin") return;
    const urls = {
      accessibility: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
      screen: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
      input: "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent"
    };
    void electron.shell.openExternal(urls[pane]);
  });
  electron.ipcMain.handle("env:public", () => ({
    convexUrl: convexUrl ?? null,
    provider: executorNameFor(providerName),
    backgroundMode: BACKGROUND_MODE,
    // Surfaced for diagnostics + org lookup. Sign-in itself happens in the
    // system browser (device:linkViaBrowser), not in the renderer. Public
    // production defaults baked in so a Finder-launched build (no cwd .env) works.
    clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY ?? PUBLIC_CONFIG.clerkPublishableKey,
    apiBaseUrl: process.env.PONDER_API_BASE_URL ?? PUBLIC_CONFIG.apiBaseUrl,
    webBaseUrl: process.env.PONDER_WEB_BASE_URL ?? PUBLIC_CONFIG.webBaseUrl
  }));
  electron.ipcMain.handle("device:status", () => {
    const c = loadDeviceCredential();
    return {
      linked: Boolean(c),
      deviceId: c?.deviceId,
      name: c?.name,
      orgId: c?.orgId
    };
  });
  electron.ipcMain.handle("activity:recent", () => recentActivity);
  const registerWithClerkToken = async (args) => {
    try {
      const convexURL = process.env.VITE_CONVEX_URL || convexUrl || PUBLIC_CONFIG.convexUrl;
      if (!convexURL) ;
      const apiBase = (process.env.PONDER_API_BASE_URL || PUBLIC_CONFIG.apiBaseUrl).replace(/\/+$/, "");
      if (!apiBase) return { ok: false, error: "no API base configured" };
      const orgRes = await fetch(`${apiBase}/api/organizations/me/active`, {
        headers: { Authorization: `Bearer ${args.clerkToken}` }
      });
      if (!orgRes.ok) return { ok: false, error: `org lookup failed (${orgRes.status})` };
      const orgJson = await orgRes.json();
      const orgId = String(orgJson?.orgId || "").trim();
      if (!orgId) return { ok: false, error: "no active org for this account" };
      const cred = await registerDevice({
        convexURL,
        clerkToken: args.clerkToken,
        orgId,
        name: args.name && args.name.trim() || os__namespace.hostname(),
        platform: args.platform
      });
      try {
        browserJobsConsumer?.stop();
      } catch {
      }
      startBrowserJobsConsumer({ events: consumerEvents() }).then((c) => {
        browserJobsConsumer = c;
      }).catch((e) => console.error("[browser-jobs] start after link failed:", e));
      return { ok: true, deviceId: cred.deviceId };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  };
  electron.ipcMain.handle(
    "device:register",
    async (_e, args) => registerWithClerkToken(args)
  );
  electron.ipcMain.handle("device:linkViaBrowser", async () => {
    try {
      const webBaseUrl = process.env.PONDER_WEB_BASE_URL || PUBLIC_CONFIG.webBaseUrl;
      const { clerkToken } = await linkViaBrowser({ webBaseUrl, timeoutMs: 12e4 });
      return await registerWithClerkToken({ clerkToken });
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
  electron.ipcMain.handle("device:linkCancel", () => {
    cancelActiveLink();
    return { ok: true };
  });
  electron.ipcMain.handle("device:unlink", async () => {
    const cred = loadDeviceCredential();
    try {
      browserJobsConsumer?.stop();
    } catch {
    }
    browserJobsConsumer = null;
    if (cred) {
      try {
        await revokeDeviceRemote(cred);
      } catch (e) {
        console.error("[device] remote revoke failed:", e);
      }
    }
    clearDeviceCredential();
    return { ok: true };
  });
  electron.ipcMain.handle("recipes:list", async () => {
    try {
      return await listRecipes();
    } catch (e) {
      console.warn(`[ipc] recipes:list failed: ${e instanceof Error ? e.message : String(e)}`);
      return [];
    }
  });
  electron.ipcMain.handle("recipes:get", async (_e, id) => {
    try {
      return await loadRecipe(id);
    } catch (e) {
      console.warn(`[ipc] recipes:get failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  });
  electron.ipcMain.handle("recipes:paths", (_e, id) => {
    return pathsFor(id);
  });
  electron.ipcMain.handle("recipes:reveal", async (_e, id) => {
    try {
      const paths = pathsFor(id);
      electron.shell.showItemInFolder(paths.recipePath);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
  electron.ipcMain.handle(
    "recipes:replay",
    async (_e, id, opts) => {
      try {
        const recipe = await loadRecipe(id);
        if (!recipe) return { ok: false, error: "recipe not found" };
        const { replaySession } = await Promise.resolve().then(() => require("./chunks/sdk-CS9epbch.js"));
        buddySay("status", `Replaying: ${recipe.task ?? id}`);
        const res = await replaySession(recipe, {
          reground: opts?.reground ?? true,
          stepDelayMs: opts?.stepDelayMs,
          browser: browserClient,
          provider: warmup.getProvider(),
          // Self-heal write-back: persist a drifted recipe (same id re-derived).
          persist: (r) => saveRecipe(r),
          onStep: ({ index, step, status, error }) => {
            buddySay(
              status === "error" ? "error" : "action",
              `${index + 1}. ${step.executed?.type ?? "step"}${error ? ` — ${error}` : ""}`
            );
          }
        });
        const healedNote = res.healed ? ` · adapted ${res.healed} changed step(s)` : "";
        buddySay(
          "answer",
          (res.failed ? `Replay finished — ${res.failed} step(s) failed` : "Replay finished cleanly") + healedNote
        );
        return { ok: true, failed: res.failed, healed: res.healed };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
  );
  electron.ipcMain.handle("recipes:saveLast", async (_e, task) => {
    try {
      if (!lastRunRecorder) {
        return { ok: false, error: "Nothing to save — run a task first." };
      }
      const recipe = lastRunRecorder.getRecipe();
      if (task && task.trim()) recipe.task = task.trim();
      if (!recipe.steps.length) return { ok: false, error: "That run had no recorded actions." };
      const saved = await saveRecipe(recipe);
      if (!saved) return { ok: false, error: "save failed" };
      return { ok: true, id: saved.id };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
  electron.ipcMain.handle("recipes:saveFromSession", async (_e, sessionId, task) => {
    try {
      if (!convex) return { ok: false, error: "History store unavailable." };
      const [steps, session] = await Promise.all([
        convex.query(api.steps.listBySession, { sessionId }),
        convex.query(api.sessions.get, { sessionId })
      ]);
      if (!steps || steps.length === 0) return { ok: false, error: "That run has no recorded steps." };
      const sess = session;
      const recipe = recipeFromConvexSteps(
        task && task.trim() || sess?.prompt || "Saved run",
        steps,
        sess?.provider ? { provider: sess.provider } : {}
      );
      if (!recipe.steps.length) return { ok: false, error: "That run had no replayable actions to save." };
      const saved = await saveRecipe(recipe);
      if (!saved) return { ok: false, error: "save failed" };
      return { ok: true, id: saved.id };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
  electron.ipcMain.handle("channels:open", async (_e, url) => {
    try {
      if (!/^https?:\/\//i.test(url)) return { ok: false, error: "bad url" };
      await electron.shell.openExternal(url);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
}
function buildTray() {
  const icon = electron.nativeImage.createFromPath(path.join(__dirname, "../../assets/tray-icon.png")).resize({ width: 18, height: 18 });
  if (icon.isEmpty()) {
    tray = new electron.Tray(electron.nativeImage.createEmpty());
    if (process.platform === "darwin") tray.setTitle("Anorha");
  } else {
    tray = new electron.Tray(icon);
  }
  tray.setToolTip("Anorha · ⌘E to summon");
  tray.on("click", () => toggleInputPill());
  rebuildTrayMenu();
}
function switchProvider(name) {
  if (name === providerName) {
    console.log(`[provider] already on "${name}" — no-op`);
    setProviderPreference(name);
    return;
  }
  console.log(`[provider] switching: ${providerName} → ${name}`);
  providerName = name;
  setProviderPreference(name);
  warmup = new WarmupQueue(makeProvider(name));
  warmup.onChange((state, detail) => {
    broadcastState({ warmup: state, errorMessage: detail });
    if (state === "ready") {
      new electron.Notification({
        title: "Anorha ready",
        body: `${humanProviderLabel(name)} ready.`
      }).show();
    }
  });
  warmup.warmInBackground();
  broadcastState();
  rebuildTrayMenu();
}
function openHistoryWindow() {
  if (!appWin || appWin.isDestroyed()) {
    appWin = createAppWindowWired();
    appWin.once("ready-to-show", () => {
      appWin?.focus();
      if (process.platform === "darwin") electron.app.focus({ steal: true });
    });
    return;
  }
  if (appWin.isMinimized()) appWin.restore();
  appWin.show();
  appWin.focus();
  if (process.platform === "darwin") electron.app.focus({ steal: true });
}
function createAppWindowWired() {
  const win = createAppWindow();
  win.on("focus", pingWarmIfOpen);
  win.on("show", pingWarmIfOpen);
  return win;
}
function rebuildTrayMenu() {
  if (!tray) return;
  const menu = electron.Menu.buildFromTemplate([
    {
      label: "Summon (⌘E)",
      click: () => toggleInputPill()
    },
    { type: "separator" },
    { label: `Status: ${warmup.getState()}`, enabled: false },
    {
      label: "Provider",
      submenu: [
        {
          label: "H Company API (api.hcompany.ai)",
          type: "radio",
          checked: providerName === "hcompany",
          enabled: isProviderConfigured("hcompany"),
          click: () => switchProvider("hcompany")
        },
        {
          label: "Modal · self-hosted Holo3",
          type: "radio",
          checked: providerName === "remote",
          enabled: isProviderConfigured("remote"),
          click: () => switchProvider("remote")
        },
        {
          label: "Local (Ollama)",
          type: "radio",
          checked: providerName === "local",
          click: () => switchProvider("local")
        }
      ]
    },
    {
      label: "Open History (⌘⇧H)",
      accelerator: "CommandOrControl+Shift+H",
      click: () => openHistoryWindow()
    },
    { type: "separator" },
    { label: "Quit", role: "quit" }
  ]);
  tray.setContextMenu(menu);
}
function toggleInputPill() {
  if (inputPillVisible) {
    dismissInputPill();
  } else {
    showInputPill();
  }
}
let keepWarmTimer = null;
function pingWarmIfOpen() {
  if (providerName !== "remote") return;
  if (!appWin || appWin.isDestroyed() || !appWin.isVisible()) return;
  void warmup.getProvider().warm().catch(() => {
  });
}
function startKeepWarm() {
  if (keepWarmTimer) return;
  keepWarmTimer = setInterval(pingWarmIfOpen, 24e4);
}
let browserJobsConsumer = null;
const recentActivity = [];
function pushActivity(e) {
  recentActivity.push(e);
  if (recentActivity.length > 50) recentActivity.shift();
  if (appWin && !appWin.isDestroyed()) appWin.webContents.send("agent:activity", e);
}
function consumerEvents() {
  return {
    log: (m) => console.log(`[browser-jobs] ${m}`),
    onJob: pushActivity
  };
}
electron.app.setAsDefaultProtocolClient("ponder");
const isPrimaryInstance = electron.app.requestSingleInstanceLock();
if (!isPrimaryInstance) {
  electron.app.quit();
} else {
  electron.app.on("second-instance", () => openHistoryWindow());
  electron.app.on("open-url", (e) => {
    e.preventDefault();
    openHistoryWindow();
  });
}
function maybeCheckForUpdates() {
  if (!electron.app.isPackaged) return;
  if (process.env.PONDER_DISABLE_UPDATER === "1") return;
  electronUpdater.autoUpdater.on("error", (e) => console.error("[updater]", e?.message || e));
  const check = () => electronUpdater.autoUpdater.checkForUpdatesAndNotify().catch((e) => console.error("[updater]", e?.message || e));
  void check();
  setInterval(() => void check(), 6 * 60 * 60 * 1e3);
}
electron.app.whenReady().then(() => {
  if (!isPrimaryInstance) return;
  buildTray();
  setupIpc();
  startBridgeServer();
  if (loadDeviceCredential()) {
    void startBrowserJobsConsumer({ events: consumerEvents() }).then((c) => {
      browserJobsConsumer = c;
    }).catch((e) => console.error("[browser-jobs] start failed:", e));
  }
  void warmup.warmInBackground();
  startKeepWarm();
  maybeCheckForUpdates();
  ensureBuddy();
  const primaryAccel = "CommandOrControl+E";
  const fallbackAccel = "CommandOrControl+Shift+Space";
  const okPrimary = electron.globalShortcut.register(primaryAccel, () => toggleInputPill());
  const okFallback = electron.globalShortcut.register(fallbackAccel, () => toggleInputPill());
  if (!okPrimary && !okFallback) {
    console.warn(
      "Both global shortcuts failed to register. macOS Input Monitoring permission may be missing."
    );
  } else if (!okPrimary) {
    console.warn(
      `Primary hotkey (${primaryAccel}) failed; falling back to ${fallbackAccel}.`
    );
  }
  const stopAccel = "CommandOrControl+.";
  const okStop = electron.globalShortcut.register(stopAccel, () => {
    if (!cancelFlag) {
      console.log("[hotkey] ⌘. — cancelling active task");
      cancelFlag = true;
      buddySay("status", "Stopping…");
    }
  });
  if (!okStop) {
    console.warn(`Stop hotkey (${stopAccel}) failed to register.`);
  }
  const historyAccel = "CommandOrControl+Shift+H";
  const okHistory = electron.globalShortcut.register(
    historyAccel,
    () => openHistoryWindow()
  );
  if (!okHistory) {
    console.warn(`History hotkey (${historyAccel}) failed to register.`);
  }
  console.log(
    `[boot] default provider="${providerName}" (configured: hcompany=${isProviderConfigured("hcompany")}, remote=${isProviderConfigured("remote")}, local=${isProviderConfigured("local")})`
  );
  if (process.platform === "darwin") {
    const exe = electron.app.getPath("exe");
    const bundle = exe.replace(/\/Contents\/MacOS\/.+$/, "");
    console.log(`[boot] electron binary: ${bundle}`);
    console.log(
      `[boot] in System Settings → Privacy & Security, look for the entry named "Electron" (NOT "Holo3 Agent" — that name only exists for packaged builds). If it's missing, click the + button and add the path above.`
    );
    void probe().then((p) => {
      console.log(
        `[boot] perms accessibility=${p.accessibility} screen=${p.screenRecording} input=${p.inputMonitoring}`
      );
      if (p.accessibility !== "granted") {
        console.warn(
          "[boot] Accessibility NOT granted — agent clicks will be silently dropped by macOS. Opening prompt."
        );
        void requestAccessibility();
        new electron.Notification({
          title: "Holo3 needs Accessibility access",
          body: 'Look for "Electron" in Privacy & Security → Accessibility, or add it via the + button. Then restart.'
        }).show();
      }
      if (p.screenRecording !== "granted") {
        console.warn(
          "[boot] Screen Recording NOT granted — screenshots will be black/empty."
        );
        void requestScreenRecording();
      }
    });
  }
  if (!isProviderConfigured(providerName)) {
    const hint = providerName === "remote" ? "Set MODAL_BASE_URL and MODAL_BEARER_TOKEN in .env, or switch provider from the tray / app sidebar." : providerName === "hcompany" ? "Set HAI_API_KEY in .env, or switch provider from the tray / app sidebar." : "Run `bash scripts/setup-local.sh` to import the Holo3 GGUF into Ollama.";
    console.warn(`[boot] provider "${providerName}" not configured. ${hint}`);
    broadcastState({ warmup: "error", errorMessage: hint });
  } else {
    warmup.warmInBackground();
  }
});
electron.app.on("window-all-closed", () => {
});
electron.app.on("will-quit", () => {
  electron.globalShortcut.unregisterAll();
});
exports.RECIPES_DIR = RECIPES_DIR;
exports.SESSIONS_DIR = SESSIONS_DIR;
exports.buildRecipeFromTrace = buildRecipeFromTrace;
exports.click = click;
exports.computeDefaultProvider = computeDefaultProvider;
exports.createPlaywriterClient = createPlaywriterClient;
exports.createRecipeRecorder = createRecipeRecorder;
exports.createSessionRecorder = createSessionRecorder;
exports.drag = drag;
exports.getTraceMeta = getTraceMeta;
exports.hover = hover;
exports.isProviderConfigured = isProviderConfigured;
exports.latestRecipeId = latestRecipeId;
exports.latestSessionId = latestSessionId;
exports.listRecipes = listRecipes;
exports.listSessions = listSessions;
exports.loadRecipe = loadRecipe;
exports.loadSession = loadSession;
exports.makeProvider = makeProvider;
exports.onTraceStep = onTraceStep;
exports.parseAxRefs = parseAxRefs;
exports.pathsFor = pathsFor;
exports.pressCombo = pressCombo;
exports.raiseMacApp = raiseMacApp;
exports.recordAction = recordAction;
exports.recordFromBridgeTranscript = recordFromBridgeTranscript;
exports.recorder = recorder;
exports.renderRecipeScript = renderRecipeScript;
exports.renderSessionScript = renderSessionScript;
exports.resolveRecipeId = resolveRecipeId;
exports.resolveSessionId = resolveSessionId;
exports.saveRecipe = saveRecipe;
exports.saveSession = saveSession;
exports.screenshot = screenshot;
exports.scroll = scroll;
exports.sleep = sleep$4;
exports.snapshotTrace = snapshotTrace;
exports.startNewTrace = startNewTrace;
exports.traceLength = traceLength;
exports.typeText = typeText;
