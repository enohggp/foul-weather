// Gives every captain, Room house and the Guild a real NEAR account of its own.
//
// Each account is created with no access key at all. Nobody, including the
// deployer, can sign for it. Its money moves only under the contract's rules.
//
//   FW_CONTRACT=your-contract.testnet node scripts/npc-wallets.mjs

import { CONTRACT, signer } from "./lib.mjs";

const near = await signer(CONTRACT);
const view = await near.view(CONTRACT, "get_view", {});
const npcs = [
  ...view.captains.map((c) => c.account),
  ...view.houses.filter((h) => typeof h.kind === "object").map((h) => h.account),
  `guild.${CONTRACT}`,
];

let created = 0;
for (const account of npcs) {
  if (await near.accountExists(account)) continue;
  await near
    .transaction(CONTRACT)
    .createAccount(account)
    .transfer(account, "0.01 NEAR")
    .send({ waitUntil: "EXECUTED_OPTIMISTIC" });
  created += 1;
  console.log(`opened ${account}`);
}
console.log(`${created} new wallets, ${npcs.length} in all, none with a key.`);
