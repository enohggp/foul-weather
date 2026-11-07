// Publishes the front-door key that lets new players open an account with no
// wallet and no server.
//
// NEAR itself limits this key: it can only call `open_account` on this contract,
// and only spend the gas allowance below. The contract adds an hourly cap. The
// key is meant to be public, so it is kept on-chain and never in this repository.
//
//   node scripts/front-door.mjs

import { generateKey } from "near-kit";
import { CONTRACT, signer } from "./lib.mjs";

const near = await signer(CONTRACT);
const key = generateKey();

await near
  .transaction(CONTRACT)
  .addKey(key.publicKey.toString(), {
    type: "functionCall",
    receiverId: CONTRACT,
    methodNames: ["open_account"],
    allowance: "1 NEAR",
  })
  .functionCall(CONTRACT, "set_front_door", { key: key.secretKey }, { gas: "30 Tgas" })
  .send({ waitUntil: "EXECUTED_OPTIMISTIC" });

console.log(`front door open with key ${key.publicKey.toString()}`);
