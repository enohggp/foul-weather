// Shared setup for the scripts. Keys come from the environment or the standard
// NEAR credentials folder. They are never read from, or written to, this repository.

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Near } from "near-kit";

export const CONTRACT = process.env.FW_CONTRACT ?? "foulweather-harbor.testnet";
export const network = { networkId: "testnet", rpcUrl: "https://rpc.testnet.fastnear.com" };

export function reader() {
  return new Near({ network });
}

/** Opens a signing client for `accountId`. */
export async function signer(accountId) {
  let privateKey = process.env.NEAR_PRIVATE_KEY;
  if (!privateKey) {
    const file = join(homedir(), ".near-credentials", "testnet", `${accountId}.json`);
    const saved = JSON.parse(await readFile(file, "utf8"));
    privateKey = saved.private_key;
  }
  return new Near({ network, privateKey, defaultSignerId: accountId });
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
