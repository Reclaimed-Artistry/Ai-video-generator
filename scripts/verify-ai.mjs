#!/usr/bin/env node
/**
 * Checks that every optional AI provider is wired up, and tells you exactly
 * what is missing. Safe to run at any time — it only reads env vars and makes
 * read-only API calls.
 *
 *   npm run verify:ai
 *
 * Run with --env-file so the local secrets are loaded:
 *   node --env-file=.env.local scripts/verify-ai.mjs
 */
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";

const ok = (s) => `${GREEN}✓${RESET} ${s}`;
const warn = (s) => `${YELLOW}!${RESET} ${s}`;
const bad = (s) => `${RED}✗${RESET} ${s}`;

function mask(value) {
  if (!value) return "";
  return value.length <= 8 ? "****" : `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/**
 * `fetch failed` means we could not reach the host at all (offline, proxy or
 * firewall). That is not the same as a bad key, and conflating them sends
 * people hunting for a credential problem they do not have.
 */
async function probe(name, url, headers) {
  try {
    const response = await fetch(url, { headers });
    if (response.ok) return { state: "ok", detail: `${response.status}` };
    if (response.status === 401 || response.status === 403) {
      return { state: "rejected", detail: `${response.status} — key not accepted` };
    }
    return { state: "error", detail: `HTTP ${response.status}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { state: "unreachable", detail: message };
  }
}

function report(state, detail, label) {
  if (state === "ok") return ok(`${label} ${DIM}(${detail})${RESET}`);
  if (state === "unreachable") return warn(`${label} — could not reach host: ${detail}`);
  return bad(`${label} — ${detail}`);
}

async function main() {
  const replicate = process.env.REPLICATE_API_TOKEN;
  const openai = process.env.OPENAI_API_KEY;
  const flaq = process.env.FLAQ_API_KEY || process.env.FLAQ_API_TOKEN;
  const gemini = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const groq = process.env.GROQ_API_KEY;
  const mode = (process.env.AI_VIDEO_MODE || "fallback").trim().toLowerCase();

  console.log(`\n${BOLD}AI provider setup${RESET}\n`);

  console.log(`${BOLD}Keys found${RESET}`);
  console.log(
    replicate
      ? ok(`REPLICATE_API_TOKEN        ${mask(replicate)}`)
      : warn(`REPLICATE_API_TOKEN        not set ${DIM}(needed for HunyuanVideo)${RESET}`),
  );
  console.log(
    flaq
      ? ok(`FLAQ_API_KEY               ${mask(flaq)}`)
      : warn(`FLAQ_API_KEY               not set ${DIM}(paid: scripts+image+video)${RESET}`),
  );
  console.log(
    openai ? ok(`OPENAI_API_KEY             ${mask(openai)}`) : warn(`OPENAI_API_KEY             not set`),
  );
  console.log(
    gemini
      ? ok(`GEMINI_API_KEY             ${mask(gemini)}`)
      : warn(`GEMINI_API_KEY             not set ${DIM}(free LLM)${RESET}`),
  );
  console.log(
    groq
      ? ok(`GROQ_API_KEY               ${mask(groq)}`)
      : warn(`GROQ_API_KEY               not set ${DIM}(free LLM)${RESET}`),
  );
  console.log(`  AI_VIDEO_MODE             ${mode}\n`);

  console.log(`${BOLD}Live checks${RESET}`);
  const outcomes = [];

  if (replicate) {
    const account = await probe(
      "replicate",
      "https://api.replicate.com/v1/account",
      { authorization: `Bearer ${replicate}` },
    );
    outcomes.push(account.state);
    console.log("  " + report(account.state, account.detail, "Replicate account       "));

    const model = await probe(
      "replicate",
      "https://api.replicate.com/v1/models/tencent/hunyuan-video",
      { authorization: `Bearer ${replicate}` },
    );
    outcomes.push(model.state);
    console.log("  " + report(model.state, model.detail, "HunyuanVideo model      "));
  } else {
    console.log("  " + warn("Replicate checks skipped — no token"));
  }


  // What the app will actually pick, mirroring src/lib/video.ts.
  // Mirrors src/lib/video.ts: Flaq wins when its key is present.
  const videoModel = flaq
    ? process.env.FLAQ_VIDEO_MODEL || "seedance-v2.5-text-to-video"
    : process.env.HUNYUAN_VIDEO_MODEL || "tencent/hunyuan-video";
  const videoProvider = flaq ? "Flaq AI Video" : replicate ? "HunyuanVideo (Replicate)" : "none";
  console.log(`\n${BOLD}Resolved providers${RESET}`);
  console.log(
    flaq || replicate
      ? ok(`AI video  -> ${videoProvider} ${DIM}(model ${videoModel})${RESET}`)
      : warn("AI video  -> none (scenes use stock clips, or an AI still + camera motion)"),
  );
  console.log(
    flaq || openai || replicate
      ? ok(`AI images -> ${flaq ? "Flaq AI Images" : openai ? "OpenAI Images" : "Replicate Flux"}`)
      : warn("AI images -> on-device procedural generator"),
  );
  const llm =
    flaq ? "Flaq" : openai ? "OpenAI" : gemini ? "Gemini" : groq ? "Groq" : null;
  console.log(
    llm
      ? ok(`Scripting -> ${llm}`)
      : warn("Scripting -> built-in beat engine (set GEMINI_API_KEY or GROQ_API_KEY — both free)"),
  );

  // Actionable next steps.
  const missing = [];
  if (!replicate) missing.push("REPLICATE_API_TOKEN");

  console.log(`\n${BOLD}Next steps${RESET}`);
  if (missing.length) {
    if (!replicate) {
      console.log("  1. Get a Replicate token: https://replicate.com/account/api-tokens");
      console.log("     Then add it to .env.local:");
      console.log(`${DIM}       REPLICATE_API_TOKEN=r8_your_token_here${RESET}`);
    }
    if (!flaq) {
      console.log("  0. One paid key for scripts + images + video: https://flaq.ai");
      console.log(`${DIM}       FLAQ_API_KEY=your_flaq_key${RESET}`);
    }
    if (!llm) {
      console.log("  2. For AI scriptwriting, add a FREE key (no card) to .env.local:");
      console.log("       GEMINI_API_KEY  — https://aistudio.google.com/apikey");
      console.log("       GROQ_API_KEY    — https://console.groq.com/keys");
    }
    console.log("  3. Re-run: npm run verify:ai");
  } else if (outcomes.some((o) => o === "rejected")) {
    console.log("  " + bad("A provider rejected its key — re-check the value above."));
  } else if (outcomes.length && outcomes.every((o) => o === "unreachable")) {
    console.log(
      "  " + warn("Keys are set but no provider could be reached from this machine."),
    );
    console.log(
      "    The app will still resolve them (see above); this only means the live",
    );
    console.log("    check itself was blocked — by a firewall, proxy, or being offline.");
  } else {
    console.log("  " + ok("All configured providers verified — render a video to try it."));
  }
  console.log(
    `\n${DIM}Note: HunyuanVideo needs ~45GB VRAM, so it runs on Replicate's GPUs,${RESET}\n${DIM}not locally and not on serverless hosting like Vercel.${RESET}\n`,
  );
}

main();
