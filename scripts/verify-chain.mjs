// Checks the live contract without a wallet or a key. Reads only.
//
//   npm run verify

import { CONTRACT, reader } from "./lib.mjs";

const near = reader();
const status = await near.view(CONTRACT, "status", {});
const audit = await near.view(CONTRACT, "audit", {});
const view = await near.view(CONTRACT, "get_view", {});
const supply = await near.view(CONTRACT, "mt_supply", { token_id: "crown" });
const tokens = await near.view(CONTRACT, "mt_tokens", { limit: 200 });
const sea = await near.view(CONTRACT, "sea_report", {});

const held = await near.view(CONTRACT, "mt_batch_balance_of", {
  account_id: view.captains[0].account,
  token_ids: ["crown", "cargo:silk", "cargo:wares"],
});

console.log(`contract      ${CONTRACT}`);
console.log(`season/watch  ${status.season} / ${status.watch}`);
console.log(`audit         ${audit}`);
console.log(`crown supply  ${supply}`);
console.log(`token types   ${tokens.length} (NEP-245)`);
console.log(`captain       ${view.captains[0].name} holds ${held[0]} crowns at ${view.captains[0].account}`);
console.log(`at sea        ${view.voyages.length} ships, ${view.positions.length} live promises`);
console.log(`houses        ${view.houses.filter((h) => h.active).length} active, ${view.houses.filter((h) => !h.active).length} failed`);
console.log(`sea report    ${sea.map((s) => `${s.lane} ${s.sea}${s.live ? " (live)" : ""}`).join(", ")}`);
if (audit !== "the books balance") process.exitCode = 1;
