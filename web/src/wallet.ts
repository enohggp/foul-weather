// Play with your own NEAR testnet wallet, through NEAR Connect.
//
// Connecting asks the wallet, once, to add a key to the player's account that can only
// call this game's contract. That key stays on this device, so the moves after it are
// signed here with no popup. Their gas comes from the player's own testnet NEAR, up to
// the key's allowance. The town, its coins and its ships then belong to the player's own
// account, so everything the town earns is paid to it.

import type { NearConnector } from "@hot-labs/near-connect";
import { generateKey } from "near-kit";
import { CONTRACT, hasKey, type Saved } from "./live";

const STORE = "fw-wallet";
/** Gas the game's key may spend from the player's testnet NEAR: 1 NEAR, in yoctoNEAR. */
const ALLOWANCE = "1000000000000000000000000";

export interface WalletAccount extends Saved {
  publicKey: string;
}

/** Keeps each NEAR Connect connection's notes apart, so testnet and mainnet don't mix. */
export function prefixedStorage(prefix: string) {
  return {
    async get(key: string) {
      try {
        return localStorage.getItem(prefix + key);
      } catch {
        return null;
      }
    },
    async set(key: string, value: string) {
      try {
        localStorage.setItem(prefix + key, value);
      } catch {
        // A private window may refuse storage. The wallet is then asked again next time.
      }
    },
    async remove(key: string) {
      try {
        localStorage.removeItem(prefix + key);
      } catch {
        // Nothing was stored.
      }
    },
  };
}

let testnet: Promise<NearConnector> | null = null;

/** NEAR Connect loads only when a player asks for it. */
function connector(): Promise<NearConnector> {
  if (!testnet) {
    testnet = import("@hot-labs/near-connect").then(async ({ NearConnector }) => {
      const made = new NearConnector({ network: "testnet", features: { testnet: true }, storage: prefixedStorage("fw-nc-testnet:") });
      await made.whenManifestLoaded;
      return made;
    });
    testnet.catch(() => {
      testnet = null;
    });
  }
  return testnet;
}

export function savedWallet(): WalletAccount | null {
  try {
    const raw = localStorage.getItem(STORE);
    const saved = raw ? (JSON.parse(raw) as WalletAccount) : null;
    return saved?.accountId && saved.secretKey && saved.publicKey ? saved : null;
  } catch {
    return null;
  }
}

function save(account: WalletAccount) {
  try {
    localStorage.setItem(STORE, JSON.stringify(account));
  } catch {
    // Without storage the wallet is asked again next time.
  }
}

/** Forgets the wallet on this device. The key on the account can only call the game. */
export function forgetWallet() {
  try {
    localStorage.removeItem(STORE);
  } catch {
    // Nothing was stored.
  }
  void connector()
    .then((made) => made.disconnect())
    .catch(() => undefined);
}

async function waitForKey(accountId: string, publicKey: string, tries: number) {
  for (let i = 0; i < tries; i++) {
    if (await hasKey(accountId, publicKey)) return true;
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  return false;
}

function isTestnetAccount(accountId: string) {
  return accountId.endsWith(".testnet") || /^[0-9a-f]{64}$/.test(accountId);
}

/** Signs in with the player's wallet, and makes sure the game's key is on their account. */
export async function connectWallet(progress: (message: string) => void): Promise<WalletAccount> {
  const saved = savedWallet();
  if (saved) {
    progress(`Checking ${saved.accountId}…`);
    if (await hasKey(saved.accountId, saved.publicKey)) return saved;
    forgetWallet();
  }
  progress("Pick your wallet…");
  const made = await connector();
  const key = generateKey();
  const publicKey = key.publicKey.toString();
  const wallet = await made.connect({
    addFunctionCallKey: {
      contractId: CONTRACT,
      publicKey,
      allowMethods: { anyMethod: true },
      gasAllowance: { kind: "limited", amount: ALLOWANCE },
    },
  });
  const accountId = (await wallet.getAccounts({ network: "testnet" }))[0]?.accountId;
  if (!accountId) throw new Error("The wallet didn't share an account. Please try again.");
  if (!isTestnetAccount(accountId)) throw new Error("That account isn't on testnet. Switch your wallet to testnet and try again.");
  if (accountId === CONTRACT) throw new Error("That's the game's own account. Connect a player's account instead.");
  progress("Adding the game's key to your account…");
  if (!(await waitForKey(accountId, publicKey, 15))) {
    // Some wallets sign in without adding the key. Ask for it on its own.
    await wallet.signAndSendTransaction({
      receiverId: accountId,
      actions: [{ type: "AddKey", params: { publicKey, accessKey: { permission: { receiverId: CONTRACT, methodNames: [], allowance: ALLOWANCE } } } }],
    });
    if (!(await waitForKey(accountId, publicKey, 20))) {
      throw new Error("Your wallet didn't add the game's key. Please try again, or pick another wallet.");
    }
  }
  const account: WalletAccount = { accountId, publicKey, secretKey: key.secretKey };
  save(account);
  return account;
}
