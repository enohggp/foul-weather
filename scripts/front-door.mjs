// Publishes two public keys. They let a new player open an account, and any browser
// move the world on, with no wallet and no server.
//
// NEAR itself limits each key: the front door can only call `open_account`, and the
// tick key can only call `tick`, each within the gas allowance below. The contract
// adds an hourly cap on accounts. Both keys are meant to be public, so they are
// kept on-chain and never in this repository.
//
//   node scripts/front-door.mjs

import { generateKey } from "near-kit";
import { CONTRACT, signer } from "./lib.mjs";

const near = await signer(CONTRACT);
const door = generateKey();
const ticker = generateKey();

await near
  .transaction(CONTRACT)
  .addKey(door.publicKey.toString(), {
    type: "functionCall",
    receiverId: CONTRACT,
    methodNames: ["open_account"],
    allowance: "1 NEAR",
  })
  .addKey(ticker.publicKey.toString(), {
    type: "functionCall",
    receiverId: CONTRACT,
    methodNames: ["tick"],
    allowance: "2.5 NEAR",
  })
  .functionCall(CONTRACT, "set_public_keys", { front_door: door.secretKey, tick_key: ticker.secretKey }, { gas: "30 Tgas" })
  .send({ waitUntil: "EXECUTED_OPTIMISTIC" });

console.log(`front door ${door.publicKey.toString()}`);
console.log(`tick key   ${ticker.publicKey.toString()}`);
