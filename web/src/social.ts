// near.social, the social network on NEAR (https://near.social/skill.md).
//
// A player can post a moment from the game from their own NEAR account. near.social lives
// on NEAR mainnet, so this is the one part of the game on mainnet, and the player's own
// wallet signs each post. A post is a single call to the account `social`, method
// `__fastdata_kv`, with no deposit and almost no gas. It always shows as failed, because
// `social` has no contract. The indexer at api2.near.social is what confirms it landed.

import type { NearConnector } from "@hot-labs/near-connect";
import { prefixedStorage } from "./wallet";

const API = "https://api2.near.social";
export const SOCIAL_SITE = "https://near.social";
/** The call runs no code, so it needs almost no gas: 1 Ggas. */
const POST_GAS = "1000000000";

export interface SocialProfile {
  accountId: string;
  name: string | null;
  avatarUrl: string | null;
}

let mainnet: Promise<NearConnector> | null = null;

function connector(): Promise<NearConnector> {
  if (!mainnet) {
    mainnet = import("@hot-labs/near-connect").then(async ({ NearConnector }) => {
      // Many wallets don't list a "mainnet" feature, so don't ask for one: mainnet is the default.
      const made = new NearConnector({
        network: "mainnet",
        features: { signAndSendTransaction: true },
        storage: prefixedStorage("fw-nc-mainnet:"),
      });
      await made.whenManifestLoaded;
      return made;
    });
    mainnet.catch(() => {
      mainnet = null;
    });
  }
  return mainnet;
}

/** Where people can play: the hosted game, but never a link to someone's own computer. */
export function gameLink(): string | null {
  const set = import.meta.env.VITE_FW_PUBLIC_URL as string | undefined;
  if (set) return set;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) return null;
  return `${window.location.origin}${window.location.pathname}`;
}

export async function socialProfile(accountId: string): Promise<SocialProfile> {
  const plain = { accountId, name: null, avatarUrl: null };
  try {
    const response = await fetch(`${API}/v1/accounts/${encodeURIComponent(accountId)}`);
    if (!response.ok) return plain;
    const profile = (await response.json()) as { name?: string | null; avatar_url?: string | null };
    const avatar = profile.avatar_url;
    return {
      accountId,
      name: profile.name?.trim() || null,
      avatarUrl: typeof avatar === "string" && avatar.startsWith("https://") ? avatar : null,
    };
  } catch {
    return plain;
  }
}

/** The account already connected for near.social, if any. Never opens a popup. */
export async function connectedSocial(): Promise<SocialProfile | null> {
  try {
    const made = await connector();
    const { accounts } = await made.getConnectedWallet();
    const accountId = accounts[0]?.accountId;
    return accountId ? await socialProfile(accountId) : null;
  } catch {
    return null;
  }
}

export async function connectSocial(): Promise<SocialProfile> {
  const made = await connector();
  const wallet = await made.connect();
  const accountId = (await wallet.getAccounts({ network: "mainnet" }))[0]?.accountId;
  if (!accountId) throw new Error("The wallet didn't share an account. Please try again.");
  if (accountId.endsWith(".testnet")) throw new Error("near.social runs on NEAR mainnet. Pick a mainnet account.");
  return socialProfile(accountId);
}

export async function forgetSocial() {
  try {
    const made = await connector();
    await made.disconnect();
  } catch {
    // Already disconnected.
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A failed receipt still has a transaction hash. Wallets report it in different places. */
function hashIn(value: unknown): string | null {
  let text = "";
  try {
    text = `${(value as Error)?.message ?? ""} ${JSON.stringify(value) ?? ""}`;
  } catch {
    text = String(value);
  }
  const found = text.match(/"(?:hash|id|transactionHash|txHash)"\s*:\s*"([1-9A-HJ-NP-Za-km-z]{43,44})"/);
  return found ? found[1] : null;
}

function looksCancelled(error: unknown) {
  return /reject|cancel|denied|declin|closed|user/i.test(String((error as Error)?.message ?? error));
}

interface TxReport {
  indexed?: boolean;
  actions?: { keys?: { key: string; status: string; reason?: string }[] }[];
}

/** Posts from the connected account, waits until near.social has it, and returns its address. */
export async function postToSocial(text: string): Promise<string> {
  const made = await connector();
  const wallet = await made.wallet();
  const accountId = (await wallet.getAccounts({ network: "mainnet" }))[0]?.accountId;
  if (!accountId) throw new Error("Connect a NEAR account first.");
  const id = String(Date.now());
  const key = `post/${id}`;
  let hash: string | null = null;
  try {
    const outcome = await wallet.signAndSendTransaction({
      receiverId: "social",
      actions: [{ type: "FunctionCall", params: { methodName: "__fastdata_kv", args: { [key]: { text } }, gas: POST_GAS, deposit: "0" } }],
    });
    hash = outcome?.transaction?.hash ?? hashIn(outcome);
  } catch (error) {
    // Expected even when the post is stored: the receipt fails with CodeDoesNotExist.
    hash = hashIn(error);
    if (!hash && looksCancelled(error)) throw new Error("The post was cancelled.");
  }
  const url = `${SOCIAL_SITE}/${accountId}/post/${id}`;
  for (let i = 0; i < 14; i++) {
    await sleep(1500);
    try {
      if (hash) {
        const response = await fetch(`${API}/v1/tx/${hash}`);
        if (!response.ok) continue;
        const report = (await response.json()) as TxReport;
        if (!report.indexed) continue;
        const write = report.actions?.flatMap((a) => a.keys ?? []).find((k) => k.key === key);
        if (!write || write.status === "ok") return url;
        throw new Error(
          write.status === "rate_limited"
            ? "near.social's daily limit for this account is used up. Try again tomorrow."
            : `near.social didn't accept the post (${write.reason ?? write.status}).`,
        );
      }
      const response = await fetch(`${API}/v1/posts/${encodeURIComponent(accountId)}/${id}`);
      if (response.ok) return url;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("near.social")) throw error;
      // A busy indexer: ask again in a moment.
    }
  }
  throw new Error("near.social hasn't shown the post yet. It may still appear in a minute.");
}
