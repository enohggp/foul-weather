// The live Room on NEAR testnet. Every NEAR call in the game lives in this file.
//
// There is no game server. The browser makes a testnet account in the background,
// keeps its key on this device, and signs each move without showing a wallet.

import { generateKey, Near } from "near-kit";
import type { Action, Driver, Receipt, Role, View } from "./types";

export const CONTRACT: string = import.meta.env.VITE_FW_CONTRACT ?? "foulweather-harbor.testnet";
export const EXPLORER = "https://testnet.nearblocks.io";

const RPC = "https://rpc.testnet.fastnear.com";
const ACCOUNT_HELPER = "https://helper.nearprotocol.com/account";
const STORE_KEY = "fw-live-account";
const POLL_MS = 2500;
// Prepaid gas is reserved from the key's allowance at 0.001 NEAR per Tgas, so keep
// this close to what a call really burns. A watch costs about 6 Tgas.
const ACTION_GAS = "40 Tgas";
const TICK_GAS = "80 Tgas";
const network = { networkId: "testnet", rpcUrl: RPC };
const LATEST = { finality: "optimistic" } as const;

interface Saved {
  accountId: string;
  secretKey: string;
}

interface Status {
  season: number;
  watch: number;
  next_tick_ms: string;
  seq: string;
}

interface Outcome {
  transaction: { hash: string };
  status: { SuccessValue?: string };
}

/** A guest gets a separate account for each role, so one device can try both sides. */
function storeKey(role: Role, identity?: string) {
  const base = identity ? `${STORE_KEY}:${identity}` : STORE_KEY;
  return role.kind === "captain" && !identity ? `${base}:captain` : base;
}

function loadAccount(role: Role, identity?: string): Saved | null {
  try {
    const raw = localStorage.getItem(storeKey(role, identity));
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function saveAccount(account: Saved, role: Role, identity?: string) {
  try {
    localStorage.setItem(storeKey(role, identity), JSON.stringify(account));
  } catch {
    // Without storage this house only lasts as long as the tab.
  }
}

/** The public faucet: free, but it limits how often one address may ask. */
async function viaFaucet(publicKey: string): Promise<string | null> {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const accountId = `fw-${suffix}.testnet`;
  const response = await fetch(ACCOUNT_HELPER, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: publicKey }),
  }).catch(() => null);
  return response?.ok ? accountId : null;
}

/** The contract's front door: a public key that can only open accounts. */
async function viaFrontDoor(publicKey: string, identity?: string): Promise<string | null> {
  const reader = new Near({ network });
  const door = await reader.view<string>(CONTRACT, "front_door", {});
  if (!door) return null;
  const near = new Near({ network, privateKey: door as `ed25519:${string}`, defaultSignerId: CONTRACT });
  const outcome = (await near
    .transaction(CONTRACT)
    .functionCall(CONTRACT, "open_account", { public_key: publicKey, identity: identity ?? null }, { gas: "60 Tgas" })
    .send({ waitUntil: "EXECUTED_OPTIMISTIC" })) as unknown as Outcome;
  const value = outcome.status?.SuccessValue;
  return value ? (JSON.parse(atob(value)) as string) : null;
}

async function hasKey(accountId: string, publicKey: string): Promise<boolean> {
  const reader = new Near({ network });
  const rpc = (reader as unknown as { rpc: { getAccessKey(a: string, k: string): Promise<unknown> } }).rpc;
  return rpc.getAccessKey(accountId, publicKey).then(
    () => true,
    () => false,
  );
}

/** Creates a fresh testnet account. The player never sees any of this. */
async function createAccount(identity?: string): Promise<Saved> {
  const key = generateKey();
  const publicKey = key.publicKey.toString();
  const accountId = identity
    ? await viaFrontDoor(publicKey, identity).catch(() => null)
    : ((await viaFaucet(publicKey)) ?? (await viaFrontDoor(publicKey).catch(() => null)));
  if (!accountId) {
    throw new Error(
      identity
        ? "This login may already have a house on another device. Open it there, or join as a guest here."
        : "The Room could not open an account right now. Try practice mode.",
    );
  }
  // The opening runs a moment after the call, and it can fail if the name is taken.
  for (let i = 0; i < 20; i++) {
    if (await hasKey(accountId, publicKey)) return { accountId, secretKey: key.secretKey };
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  throw new Error(
    identity
      ? "This login may already have a house on another device. Open it there, or join as a guest here."
      : "The new account did not appear in time. Please try again.",
  );
}

function plainError(error: unknown): string {
  const raw = error as { panic?: string; message?: string };
  const text = raw?.panic ?? raw?.message ?? "That could not be done.";
  return text.replace(/^Smart contract panicked:\s*/i, "").replace(/\s*\(.*$/s, "");
}

function methodFor(action: Action): { method: string; args: object } | null {
  switch (action.kind) {
    case "found_house":
      return { method: "found_house", args: { name: action.name, agent: action.agent ?? false } };
    case "quote":
      return { method: "quote", args: { slip: action.slip, rate_bps: action.rate_bps, line_bps: action.line_bps } };
    case "survey":
      return { method: "survey", args: { slip: action.slip } };
    case "offer_cession":
      return { method: "offer_cession", args: { position: action.position, share_bps: action.share_bps, rate_bps: action.rate_bps } };
    case "take_cession":
      return { method: "take_cession", args: { offer: action.offer } };
    case "inquiry":
      return { method: "inquiry", args: { claim: action.claim } };
    case "refit":
      return { method: "refit", args: { captain: action.captain } };
    case "take_helm":
      return { method: "take_helm", args: { name: action.name, captain: action.captain } };
    case "leave_helm":
      return { method: "leave_helm", args: {} };
    case "plan_trip":
      return { method: "plan_trip", args: { lane: action.lane, offer_bps: action.offer_bps } };
    case "cancel_trip":
      return { method: "cancel_trip", args: {} };
    case "sail_now":
      return { method: "sail_now", args: {} };
    case "scuttle":
      return { method: "scuttle", args: {} };
    default:
      return null;
  }
}

export class LiveDriver implements Driver {
  readonly mode = "live" as const;
  private listeners = new Set<(view: View) => void>();
  private view: View | null = null;
  private timer: number | undefined;
  private stopped = false;
  private ticking = false;
  private startedAt = performance.now();
  private lastWatch = -1;
  private lastSeq = "";
  private polling = false;
  private houseName: string;
  /** The contract's public tick key pays for ticks, so they don't drain the player. */
  private ticker: Near | null = null;
  /** Hash of the player's latest transaction, for the "Under the hood" panel. */
  onTransaction: ((hash: string) => void) | null = null;

  private constructor(
    private near: Near,
    readonly accountId: string,
    houseName: string,
    private role: Role,
  ) {
    this.houseName = houseName;
  }

  /** A look at the town with no account, to choose a role and a ship. */
  static async peek(): Promise<View | null> {
    return (await new Near({ network }).view<View>(CONTRACT, "get_view", { viewer: null }, LATEST)) ?? null;
  }

  /** Opens or reopens this device's account, and takes up the chosen role. */
  static async connect(
    houseName: string,
    progress: (message: string) => void,
    role: Role,
    identity?: string,
  ): Promise<LiveDriver> {
    let account = loadAccount(role, identity);
    if (!account) {
      progress("Opening your account…");
      account = await createAccount(identity);
      saveAccount(account, role, identity);
    }
    const near = new Near({
      network,
      privateKey: account.secretKey as `ed25519:${string}`,
      defaultSignerId: account.accountId,
    });
    const driver = new LiveDriver(near, account.accountId, houseName, role);
    progress("Heading down to the harbor…");
    await driver.refresh();
    if (!driver.view) throw new Error("The harbor is not answering. Try practice mode.");
    await driver.ensureRole();
    const key = await near.view<string>(CONTRACT, "tick_key", {}, LATEST).catch(() => null);
    if (key) driver.ticker = new Near({ network, privateKey: key as `ed25519:${string}`, defaultSignerId: CONTRACT });
    driver.schedule();
    return driver;
  }

  private you() {
    return this.view?.houses.find((h) => h.you);
  }

  /** Takes up the player's role, now and again after each new season. */
  private async ensureRole() {
    const view = this.view;
    if (!view || view.intermission !== null) return;
    if (this.role.kind === "shop") {
      if (this.you()) return;
      await this.send("found_house", { name: this.houseName, agent: false });
    } else {
      if (view.helm) return;
      const wanted = this.role.captain;
      const free = view.captains.find((c) => c.id === wanted && !c.player) ?? view.captains.find((c) => !c.player);
      if (!free) throw new Error("Every ship has a player right now. Try running a shop!");
      await this.send("take_helm", { name: this.houseName, captain: free.id });
    }
    await this.refresh();
  }

  private async send(method: string, args: object, gas = ACTION_GAS): Promise<Receipt> {
    const outcome = (await this.near
      .transaction(this.accountId)
      .functionCall(CONTRACT, method, args, { gas: gas as `${number} Tgas` })
      .send({ waitUntil: "EXECUTED_OPTIMISTIC" })) as unknown as Outcome;
    const hash = outcome.transaction?.hash;
    if (hash) this.onTransaction?.(hash);
    const value = outcome.status?.SuccessValue;
    if (value) {
      try {
        return JSON.parse(atob(value)) as Receipt;
      } catch {
        return { result: "done" };
      }
    }
    return { result: "done" };
  }

  private async refresh() {
    const view = await this.near.view<View>(CONTRACT, "get_view", { viewer: this.accountId }, LATEST);
    if (!view) return;
    if (view.watch !== this.lastWatch) {
      this.lastWatch = view.watch;
      this.startedAt = performance.now();
    }
    this.view = view;
    for (const listener of this.listeners) listener(view);
  }

  private schedule() {
    if (this.stopped) return;
    this.timer = window.setTimeout(() => void this.poll(), POLL_MS);
  }

  private async poll() {
    if (this.stopped || this.polling) return;
    this.polling = true;
    try {
      const status = await this.near.view<Status>(CONTRACT, "status", {}, LATEST);
      if (status) {
        const key = `${status.season}:${status.watch}:${status.seq}`;
        if (key !== this.lastSeq) {
          this.lastSeq = key;
          await this.refresh();
          await this.ensureRole();
        }
        // Anyone may move the world on. A little jitter keeps players from colliding.
        const due = Number(status.next_tick_ms) + Math.random() * 1500;
        if (Date.now() >= due && !this.ticking) {
          this.ticking = true;
          void this.tick()
            .catch(() => undefined)
            .finally(() => {
              this.ticking = false;
            });
        }
      }
    } catch {
      // A missed poll is harmless. The next one will catch up.
    } finally {
      this.polling = false;
      this.schedule();
    }
  }

  private async tick() {
    if (this.ticker) {
      const paid = await this.ticker
        .transaction(CONTRACT)
        .functionCall(CONTRACT, "tick", {}, { gas: TICK_GAS })
        .send({ waitUntil: "EXECUTED_OPTIMISTIC" })
        .then(
          () => true,
          () => false,
        );
      if (paid) return;
    }
    await this.send("tick", {}, TICK_GAS);
  }

  subscribe(listener: (view: View) => void) {
    this.listeners.add(listener);
    if (this.view) listener(this.view);
    return () => void this.listeners.delete(listener);
  }

  async act(action: Action): Promise<Receipt> {
    const call = methodFor(action);
    if (!call) throw new Error("That is only possible in a practice harbor.");
    try {
      const receipt = await this.send(call.method, call.args);
      await this.refresh();
      return receipt;
    } catch (error) {
      throw new Error(plainError(error));
    }
  }

  watchStartedAt() {
    return this.startedAt;
  }

  watchLength() {
    return this.view?.watch_ms ?? 12000;
  }

  stop() {
    this.stopped = true;
    window.clearTimeout(this.timer);
  }
}
