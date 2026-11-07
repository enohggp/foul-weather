// End-to-end test against the deployed contract: a real account, real transactions.
//
//   node scripts/e2e-contract.mjs
//
// Opens a player through the front door, founds a house, signs a slip, then
// exercises NEP-245: balances, supply, a transfer, and the events it logs.

import { generateKey, Near } from "near-kit";
import { CONTRACT, LATEST, network, reader, sleep } from "./lib.mjs";

const results = [];
// A caller must not be able to starve the watch of gas and reroll a bad outcome.
async function near0Tick() {
  const tickKey = await reader().view(CONTRACT, "tick_key", {}, LATEST);
  const near = new Near({ network, privateKey: tickKey, defaultSignerId: CONTRACT });
  await sleep(7500);
  const before = await near.view(CONTRACT, "status", {}, LATEST);
  await near
    .transaction(CONTRACT)
    .functionCall(CONTRACT, "tick", {}, { gas: "20 Tgas" })
    .send({ waitUntil: "EXECUTED_OPTIMISTIC" })
    .catch(() => null);
  await sleep(2500);
  const after = await near.view(CONTRACT, "status", {}, LATEST);
  return before.watch === after.watch;
}
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
};

const view = reader();
const door = await view.view(CONTRACT, "front_door", {});
check("front door key is published on-chain", Boolean(door));

const key = generateKey();
const gate = new Near({ network, privateKey: door, defaultSignerId: CONTRACT });
const opened = await gate
  .transaction(CONTRACT)
  .functionCall(CONTRACT, "open_account", { public_key: key.publicKey.toString(), identity: null }, { gas: "60 Tgas" })
  .send({ waitUntil: "EXECUTED_OPTIMISTIC" });
const player = JSON.parse(atob(opened.status.SuccessValue));
check("a new account opens with no wallet", player.endsWith(CONTRACT), player);
await sleep(2500);

// The front door must not be able to do anything else.
const misuse = await gate
  .transaction(CONTRACT)
  .functionCall(CONTRACT, "set_reporter", { reporter: "attacker.testnet" }, { gas: "30 Tgas" })
  .send({ waitUntil: "EXECUTED_OPTIMISTIC" })
  .then(() => false)
  .catch(() => true);
check("the front-door key cannot call other methods", misuse);

const shortTick = await near0Tick();
check("a tick with too little gas fails before the watch runs", shortTick);

const near = new Near({ network, privateKey: key.secretKey, defaultSignerId: player });
const send = (method, args) =>
  near.transaction(player).functionCall(CONTRACT, method, args, { gas: "40 Tgas" }).send({ waitUntil: "EXECUTED_OPTIMISTIC" });

await send("found_house", { name: `E2E ${Date.now() % 10000}`, agent: true });
await sleep(3000);
const crowns = await near.view(CONTRACT, "mt_balance_of", { account_id: player, token_id: "crown" });
check("founding a house pays capital as NEP-245 crowns", crowns === "4000", crowns);

const supplyBefore = await near.view(CONTRACT, "mt_supply", { token_id: "crown" });

let signed = false;
for (let i = 0; i < 40 && !signed; i++) {
  const w = await near.view(CONTRACT, "get_view", { viewer: player });
  const slip = w.slips.find((s) => s.closes > w.watch);
  if (slip) {
    const outcome = await send("quote", { slip: slip.id, rate_bps: slip.offer_bps, line_bps: 2500 }).catch(() => null);
    signed = Boolean(outcome);
  } else {
    await near.transaction(player).functionCall(CONTRACT, "tick", {}, { gas: "80 Tgas" }).send({ waitUntil: "EXECUTED_OPTIMISTIC" }).catch(() => null);
    await sleep(3000);
  }
}
check("a player key can sign a slip without popups", signed);

const refused = await send("quote", { slip: 999999, rate_bps: 500, line_bps: 2500 })
  .then(() => false)
  .catch((e) => String(e.panic ?? e.message).includes("closed"));
check("bad moves fail with a plain message", refused);

const audit = await near.view(CONTRACT, "audit", {});
check("the books balance", audit === "the books balance", audit);

const tokens = await near.view(CONTRACT, "mt_tokens", { limit: 100 });
check("all token types live in one contract", tokens.some((t) => t.token_id === "crown") && tokens.some((t) => t.token_id === "cargo:silk"), `${tokens.length} types`);

const batch = await near.view(CONTRACT, "mt_batch_balance_of", { account_id: player, token_ids: ["crown", "cargo:silk"] });
check("mt_batch_balance_of answers", batch.length === 2, batch.join(", "));

const supplyAfter = await near.view(CONTRACT, "mt_supply", { token_id: "crown" });
check("crown supply never changes", supplyBefore === supplyAfter, supplyAfter);

const npc = (await near.view(CONTRACT, "get_view", {})).captains[0].account;
const keys = await view.rpc?.getAccessKeys?.(npc).catch?.(() => null);
if (keys) check("captains' wallets have no keys", (keys.keys ?? keys).length === 0);

console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
if (results.includes(false)) process.exitCode = 1;
