// ─── functions/aiAdvisor.js ──────────────────────────────────────────────────
// AI exit-timing advisor for the Options Manager → Projections tab. Sends the
// post-entry price path of a treasury future plus the long call / long put at a
// chosen strike to Claude, and returns concise, actionable advice on when to get
// out of each leg. Requires the ANTHROPIC_API_KEY secret:
//   firebase functions:secrets:set ANTHROPIC_API_KEY

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const MODEL = "claude-sonnet-4-6";

function requireAuth(req) { if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first."); }
const f3 = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(3) : "—");

// Send a prompt to Claude and return the text. Throws HttpsError on failure.
async function callClaude(key, prompt) {
  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 500, messages: [{ role: "user", content: prompt }] }),
    });
  } catch (e) { throw new HttpsError("unavailable", "Couldn't reach the AI service."); }
  if (!res.ok) {
    console.error("optionsExitAdvice — Anthropic API", res.status);
    throw new HttpsError("internal", res.status === 401 ? "AI key rejected — check ANTHROPIC_API_KEY." : "AI service error.");
  }
  const body = await res.json();
  return (body?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim() || "No advice returned.";
}

exports.optionsExitAdvice = onCall({ cors: true, timeoutSeconds: 60, secrets: [ANTHROPIC_API_KEY] }, async (request) => {
  requireAuth(request);
  const key = ANTHROPIC_API_KEY.value();
  if (!key) throw new HttpsError("failed-precondition", "AI isn't configured yet — set the ANTHROPIC_API_KEY secret.");

  const d = request.data || {};

  // A caller can send a fully-built prompt (covered-call / custom views) instead
  // of the structured straddle fields below.
  const custom = typeof d.prompt === "string" && d.prompt.trim().length > 20 ? d.prompt.trim() : null;
  if (custom) {
    const out = await callClaude(key, custom);
    return { advice: out, model: MODEL };
  }

  const inst = String(d.instrument || "treasury future");
  const K = Number(d.strike) || 0;
  const cPrem = Number(d.callPrem) || 0, pPrem = Number(d.putPrem) || 0;
  const n = Math.max(1, Math.round(Number(d.contracts) || 1));
  const mult = Number(d.multiplier) || 1000;
  const callBE = Number(d.callBE), putBE = Number(d.putBE);
  const callLong = String(d.callDir || "long") !== "short", putLong = String(d.putDir || "long") !== "short";
  const path = Array.isArray(d.path) ? d.path.slice(0, 80) : [];
  if (path.length < 2) throw new HttpsError("invalid-argument", "Not enough price history to analyze.");

  const pathStr = path.map((p) => `${p.d}:${f3(p.c)}`).join("  ");
  const entry = path[0], now = path[path.length - 1];
  const cForm = callLong ? `max(0, S-${K}) - ${f3(cPrem)}` : `${f3(cPrem)} - max(0, S-${K})`;
  const pForm = putLong ? `max(0, ${K}-S) - ${f3(pPrem)}` : `${f3(pPrem)} - max(0, ${K}-S)`;

  const prompt = [
    `You are a disciplined options trade advisor. The trader ${callLong ? "bought a LONG" : "sold a SHORT"} call and ${putLong ? "bought a LONG" : "sold a SHORT"} put on the ${inst} at strike ${K}.`,
    `Call premium: ${f3(cPrem)} per point; Put premium: ${f3(pPrem)}. Contracts: ${n}. Point multiplier: $${mult}.`,
    `Call breakeven: ${f3(callBE)} (${callLong ? "profit above" : "profit below"}). Put breakeven: ${f3(putBE)} (${putLong ? "profit below" : "profit above"}).`,
    `Entry on ${entry.d} at ${f3(entry.c)}; latest ${now.d} at ${f3(now.c)}.`,
    `Daily closes since entry (date:price): ${pathStr}`,
    ``,
    `Per-leg P&L at a price S (at/near expiry): call = (${cForm}) * ${mult} * ${n}; put = (${pForm}) * ${mult} * ${n}.`,
    ``,
    `Give concise, practical EXIT guidance for someone already in this position. Consider momentum/direction of the path, how far price moved through or away from each breakeven, and premium decay as expiry nears. Respond in this exact format (no preamble):`,
    `CALL: <keep or exit, and why, 1-2 sentences>`,
    `PUT: <keep or exit, and why, 1-2 sentences>`,
    `OVERALL: <the single most important action to take now, 1 sentence>`,
    ``,
    `This is educational analysis of historical data, not financial advice. Be direct and specific; reference prices/dates from the path.`,
  ].join("\n");

  const advice = await callClaude(key, prompt);
  return { advice, model: MODEL };
});
