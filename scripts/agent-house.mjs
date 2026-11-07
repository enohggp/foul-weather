// Bring your own agent. This is a complete underwriting house in about 100 lines,
// using only the contract's public methods. Rewrite `byRule` and enter the league.
//
//   node scripts/agent-house.mjs                 rule-based, no setup needed
//   NEAR_AI_API_KEY=... node scripts/agent-house.mjs     decisions by NEAR AI Cloud
//
// It opens its own testnet account through the contract's front door and saves
// the key to .agent-key.json, which git ignores.

import { readFile, writeFile } from "node:fs/promises";
import { generateKey, Near } from "near-kit";
import { CONTRACT, LATEST, network, reader, sleep } from "./lib.mjs";

const KEY_FILE = new URL("../.agent-key.json", import.meta.url);
const HOUSE = process.env.FW_AGENT_NAME ?? "Rule of Thumb & Co";
const WATCHES = Number(process.env.FW_AGENT_WATCHES ?? Infinity);
const MODEL = process.env.NEAR_AI_MODEL ?? "deepseek-ai/DeepSeek-V3.1";

async function account() {
  try {
    return JSON.parse(await readFile(KEY_FILE, "utf8"));
  } catch {
    const key = generateKey();
    const door = await reader().view(CONTRACT, "front_door", {});
    if (!door) throw new Error("the front door is closed");
    const near = new Near({ network, privateKey: door, defaultSignerId: CONTRACT });
    const outcome = await near
      .transaction(CONTRACT)
      .functionCall(CONTRACT, "open_account", { public_key: key.publicKey.toString(), identity: null }, { gas: "60 Tgas" })
      .send({ waitUntil: "EXECUTED_OPTIMISTIC" });
    const accountId = JSON.parse(atob(outcome.status.SuccessValue));
    const saved = { accountId, secretKey: key.secretKey };
    await writeFile(KEY_FILE, JSON.stringify(saved));
    await sleep(2500);
    return saved;
  }
}

/** The simplest sound strategy: only sign what pays well above the likely risk. */
function byRule(view, me) {
  const room = me.capital * view.fees.max_gearing * 0.4 - me.net_book;
  return view.slips
    .filter((s) => !s.quotes.some((q) => q.house === me.id))
    .filter((s) => s.storm_bps === 0 && s.offer_bps >= ((s.risk_low_bps + s.risk_high_bps) / 2) * 1.3)
    .filter((s) => s.sum_insured * 0.3 < room)
    .slice(0, 2)
    .map((s) => ({ slip: s.id, rate_bps: s.offer_bps, line_bps: 3000 }));
}

/** Asks a model inside NEAR AI Cloud's confidential environment to choose. */
async function byModel(view, me) {
  const candidates = view.slips.map((s) => ({
    slip: s.id,
    pays_up_to_bps: s.offer_bps,
    risk_low_bps: s.risk_low_bps,
    risk_high_bps: s.risk_high_bps,
    storm_bps: s.storm_bps,
    sum_insured: s.sum_insured,
  }));
  const response = await fetch("https://cloud-api.near.ai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.NEAR_AI_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            'You run a marine insurance house. Reply with JSON only: {"quotes":[{"slip":number,"rate_bps":number,"line_bps":number}]}. rate_bps may not exceed pays_up_to_bps. line_bps is 500 to 10000. Sign only risks that pay well.',
        },
        { role: "user", content: JSON.stringify({ capital: me.capital, net_at_risk: me.net_book, slips: candidates }) },
      ],
    }),
  });
  const body = await response.json();
  const text = body.choices?.[0]?.message?.content ?? "{}";
  return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)).quotes ?? [];
}

const saved = await account();
const near = new Near({ network, privateKey: saved.secretKey, defaultSignerId: saved.accountId });
const call = (method, args) =>
  near.transaction(saved.accountId).functionCall(CONTRACT, method, args, { gas: "40 Tgas" }).send({ waitUntil: "EXECUTED_OPTIMISTIC" });

console.log(`${HOUSE} is ${saved.accountId}`);
let lastWatch = -1;
let seen = 0;
while (seen < WATCHES) {
  const view = await near.view(CONTRACT, "get_view", { viewer: saved.accountId }, LATEST);
  const me = view.houses.find((h) => h.you);
  if (!me && view.intermission === null) {
    await call("found_house", { name: HOUSE, agent: true });
    console.log("house founded");
    continue;
  }
  if (view.watch !== lastWatch && me?.active) {
    lastWatch = view.watch;
    seen += 1;
    const quotes = process.env.NEAR_AI_API_KEY
      ? await byModel(view, me).catch((e) => (console.log(`model unavailable: ${e.message}`), byRule(view, me)))
      : byRule(view, me);
    for (const q of quotes) {
      await call("quote", q).catch((e) => console.log(`refused: ${e.panic ?? e.message}`));
      console.log(`watch ${view.watch}: signed ${q.line_bps / 100}% of slip ${q.slip} at ${q.rate_bps / 100}%`);
    }
    console.log(`watch ${view.watch}: capital ${me.capital}, at risk ${me.net_book}`);
  }
  await sleep(2500);
}
