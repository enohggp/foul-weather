// Optional. Keeps the live world moving while nobody is playing, and posts live
// sea readings from NEAR Intents. Players' browsers tick the world themselves, so
// the game runs without this. Stop it at any time and nothing breaks.
//
//   node scripts/keeper.mjs                 run until stopped
//   node scripts/keeper.mjs --watches 40    run 40 watches, then exit
//   node scripts/keeper.mjs --sea-only      post one sea report, then exit

import { CONTRACT, LATEST, signer, sleep } from "./lib.mjs";
import { SeaWatch } from "../web/src/seaCore.ts";

const args = process.argv.slice(2);
const limit = args.includes("--watches") ? Number(args[args.indexOf("--watches") + 1]) : Infinity;
const seaOnly = args.includes("--sea-only");
const SEA_EVERY_WATCHES = 6;

const near = await signer(process.env.FW_KEEPER ?? CONTRACT);
const reporter = process.env.FW_KEEPER ?? CONTRACT;
const sea = new SeaWatch();

async function postSea() {
  const readings = await sea.read();
  if (!readings) {
    console.log("no sea report: Intents did not answer");
    return;
  }
  await near
    .transaction(reporter)
    .functionCall(CONTRACT, "post_sea_report", { seas: readings.map((r) => r.sea) }, { gas: "30 Tgas" })
    .send({ waitUntil: "EXECUTED_OPTIMISTIC" });
  console.log(`sea ${readings.map((r) => `${r.lane}=${r.sea}`).join("  ")}`);
}

if (seaOnly) {
  await postSea();
  process.exit(0);
}

let watches = 0;
while (watches < limit) {
  const status = await near.view(CONTRACT, "status", {}, LATEST);
  const wait = Number(status.next_tick_ms) - Date.now();
  if (wait > 0) await sleep(Math.min(wait + 200, 15_000));
  try {
    const outcome = await near
      .transaction(reporter)
      .functionCall(CONTRACT, "tick", {}, { gas: "80 Tgas" })
      .send({ waitUntil: "EXECUTED_OPTIMISTIC" });
    watches += 1;
    const burnt = outcome.transaction_outcome?.outcome?.gas_burnt ?? 0;
    const inner = (outcome.receipts_outcome ?? []).reduce((sum, r) => sum + r.outcome.gas_burnt, 0);
    console.log(`watch ${status.watch + 1}  ${((burnt + inner) / 1e12).toFixed(1)} Tgas`);
    if (watches % SEA_EVERY_WATCHES === 1) await postSea();
  } catch (error) {
    console.log(`tick failed: ${error.message}`);
    await sleep(3_000);
  }
}
