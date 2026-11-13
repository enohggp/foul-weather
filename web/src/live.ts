// The live Room on NEAR testnet. Every NEAR call to the game's contract lives in this file.
//
// There is no game server. A guest gets a testnet account made in the background, with
// its key kept on this device. A player can instead connect their own NEAR wallet (see
// wallet.ts), which adds a key to their account that can only call this contract. Either
// way, each move is signed on this device with no popup.

import { generateKey, Near } from "near-kit";
import type { Action, Driver, Receipt, Role, View } from "./types";

export const CONTRACT: string = import.meta.env.VITE_FW_CONTRACT ?? "foulweather-harbor.testnet";
export const EXPLORER = "https://testnet.nearblocks.io";

// Public testnet servers. When one is busy or rate-limited, the next one takes over.
const RPCS = ["https://rpc.testnet.fastnear.com", "https://rpc.testnet.near.org", "https://near-testnet.drpc.org"];
const RETRY = { maxRetries: 1, initialDelayMs: 350 };
const ACCOUNT_HELPER = "https://helper.nearprotocol.com/account";
const STORE_KEY = "fw-live-account";
const POLL_MS = 2500;
/** A tab stops paying to move the world once nobody has touched it for this long. */
const IDLE_AFTER_MS = 120_000;
const SIGNS_OF_LIFE = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel"] as const;
// Prepaid gas is reserved from the key's allowance at 0.001 NEAR per Tgas, so keep
// this close to what a call really burns. A move burns about 3 Tgas and a watch about 8.
const ACTION_GAS = "15 Tgas";
const TICK_GAS = "80 Tgas";
const LATEST = { finality: "optimistic" } as const;

type NearSetup = { privateKey?: `ed25519:${string}`; defaultSignerId?: string };

/** One client for each server, all acting for the same account. */
function servers(setup: NearSetup = {}) {
  return RPCS.map((rpcUrl) => new Near({ network: { networkId: "testnet", rpcUrl }, retryConfig: RETRY, ...setup }));
}

/** The server that answered last, which is tried first next time. */
let preferred = 0;

function isServerTrouble(error: unknown) {
  return (error as { retryable?: boolean })?.retryable === true;
}

/** Runs a request that is safe to repeat, on each server in turn until one answers. */
async function viaAnyServer<T>(clients: Near[], run: (near: Near) => Promise<T>): Promise<T> {
  let last: unknown;
  for (let i = 0; i < clients.length; i++) {
    const at = (preferred + i) % clients.length;
    try {
      const result = await run(clients[at]);
      preferred = at;
      return result;
    } catch (error) {
      if (!isServerTrouble(error)) throw error;
      last = error;
    }
  }
  throw last;
}

/** An account this device can sign for: a guest's, or a key added to the player's own wallet. */
export interface Saved {
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

interface Rpc {
  sendTransaction(bytes: Uint8Array, waitUntil: string): Promise<Outcome>;
  getAccessKey(account: string, key: string): Promise<unknown>;
}

const rpcOf = (near: Near) => (near as unknown as { rpc: Rpc }).rpc;

/**
 * Signs a call once, then offers those same signed bytes to each server in turn.
 * If a server goes quiet after the network has already taken the transaction,
 * offering it again elsewhere can't make it happen twice. Returns null when the
 * chain shows it already went through but no server could report the result.
 */
async function callOnce(clients: Near[], signer: string, method: string, args: object, gas: string): Promise<Outcome | null> {
  const build = (near: Near) => near.transaction(signer).functionCall(CONTRACT, method, args, { gas: gas as `${number} Tgas` });
  const signed = await viaAnyServer(clients, (near) => build(near).sign());
  const bytes = signed.serialize();
  let offered = false;
  let last: unknown;
  for (let i = 0; i < clients.length; i++) {
    const at = (preferred + i) % clients.length;
    try {
      const outcome = await rpcOf(clients[at]).sendTransaction(bytes, "EXECUTED_OPTIMISTIC");
      preferred = at;
      return outcome;
    } catch (error) {
      if ((error as Error)?.name === "InvalidNonceError") {
        if (offered) return null;
        // This key was used elsewhere, so nothing happened yet. Sign afresh.
        return (await build(clients[at]).send({ waitUntil: "EXECUTED_OPTIMISTIC" })) as unknown as Outcome;
      }
      if (!isServerTrouble(error)) throw error;
      offered = true;
      last = error;
    }
  }
  throw last;
}

/** A guest gets a separate account for each role, so one device can try both sides. */
function storeKey(role: Role, identity?: string) {
  const base = identity ? `${STORE_KEY}:${identity}` : STORE_KEY;
  return role.kind !== "shop" && !identity ? `${base}:${role.kind}` : base;
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
  const door = await viaAnyServer(servers(), (near) => near.view<string>(CONTRACT, "front_door", {}));
  if (!door) return null;
  const clients = servers({ privateKey: door as `ed25519:${string}`, defaultSignerId: CONTRACT });
  const outcome = await callOnce(clients, CONTRACT, "open_account", { public_key: publicKey, identity: identity ?? null }, "60 Tgas");
  const value = outcome?.status?.SuccessValue;
  return value ? (JSON.parse(atob(value)) as string) : null;
}

/** Whether this key is on that account right now. */
export async function hasKey(accountId: string, publicKey: string): Promise<boolean> {
  return viaAnyServer(servers(), (near) => rpcOf(near).getAccessKey(accountId, publicKey)).then(
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
  if (/NotEnoughAllowance|allowance/i.test(text)) {
    return "The game's key on your wallet has used up its gas allowance. Go back to the start and connect your wallet again.";
  }
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
    case "open_town":
      return { method: "open_town", args: { name: action.name } };
    case "send_ship":
      return { method: "send_ship", args: { ship: action.ship, lane: action.lane, protect: action.protect } };
    case "come_home":
      return { method: "come_home", args: { ship: action.ship } };
    case "answer_surprise":
      return { method: "answer_surprise", args: { ship: action.ship, yes: action.yes } };
    case "collect_town":
      return { method: "collect_town", args: {} };
    case "build":
      return { method: "build", args: { building: action.building } };
    case "hire":
      return { method: "hire", args: { crew: action.crew } };
    case "buy_ship":
      return { method: "buy_ship", args: { class: action.class } };
    case "upgrade_ship":
      return { method: "upgrade_ship", args: { ship: action.ship, part: action.part } };
    case "repair_ship":
      return { method: "repair_ship", args: { ship: action.ship } };
    case "raid":
      return { method: "raid", args: { town: action.town, ship: action.ship } };
    case "help_town":
      return { method: "help_town", args: { town: action.town } };
    case "send_gift":
      return { method: "send_gift", args: { town: action.town, coins: action.coins } };
    case "say":
      return { method: "say", args: { phrase: action.phrase, to: action.to } };
    case "say_text":
      return { method: "say_text", args: { text: action.text, to: action.to } };
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
  private failedPolls = 0;
  private lastActive = Date.now();
  private noteActive = () => {
    this.lastActive = Date.now();
  };
  /** The contract's public tick key pays for ticks, so they don't drain the player. */
  private ticker: Near[] | null = null;
  /** Hash of the player's latest transaction, for the "Under the hood" panel. */
  onTransaction: ((hash: string) => void) | null = null;

  private constructor(
    private near: Near[],
    readonly accountId: string,
    houseName: string,
    private role: Role,
    /** The player's own wallet. Its gas is theirs, so it never pays to move the world on. */
    readonly ownWallet: boolean,
  ) {
    this.houseName = houseName;
    for (const sign of SIGNS_OF_LIFE) window.addEventListener(sign, this.noteActive, { passive: true });
  }

  /** Every tick costs the contract NEAR, so only a tab someone is using sends one. */
  private someoneIsHere() {
    if (document.body.classList.contains("touring")) return true;
    return document.visibilityState === "visible" && Date.now() - this.lastActive < IDLE_AFTER_MS;
  }

  /** A look at the town with no account, to choose a role and a ship. */
  static async peek(): Promise<View | null> {
    return (await viaAnyServer(servers(), (near) => near.view<View>(CONTRACT, "get_view", { viewer: null }, LATEST))) ?? null;
  }

  /**
   * Opens or reopens this device's account, and takes up the chosen role. Pass `own` to
   * play as the player's own wallet account instead of a guest account.
   */
  static async connect(
    houseName: string,
    progress: (message: string) => void,
    role: Role,
    identity?: string,
    own?: Saved,
  ): Promise<LiveDriver> {
    let account = own ?? loadAccount(role, identity);
    if (!account) {
      progress("Opening your account…");
      account = await createAccount(identity);
      saveAccount(account, role, identity);
    }
    const near = servers({ privateKey: account.secretKey as `ed25519:${string}`, defaultSignerId: account.accountId });
    const driver = new LiveDriver(near, account.accountId, houseName, role, Boolean(own));
    progress("Heading down to the harbor…");
    await driver.refresh();
    if (!driver.view) throw new Error("The harbor is not answering. Try practice mode.");
    await driver.ensureRole();
    const key = await viaAnyServer(near, (client) => client.view<string>(CONTRACT, "tick_key", {}, LATEST)).catch(() => null);
    if (key) driver.ticker = servers({ privateKey: key as `ed25519:${string}`, defaultSignerId: CONTRACT });
    driver.schedule();
    return driver;
  }

  private you() {
    return this.view?.houses.find((h) => h.you);
  }

  /** Takes up the player's role, now and again after each new season. */
  private async ensureRole() {
    const view = this.view;
    if (!view) return;
    if (this.role.kind === "town") {
      if (view.town) return;
      await this.send("open_town", { name: this.houseName });
      await this.refresh();
      return;
    }
    if (view.intermission !== null) return;
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
    const outcome = await callOnce(this.near, this.accountId, method, args, gas);
    if (!outcome) return { result: "done" };
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
    const view = await viaAnyServer(this.near, (near) => near.view<View>(CONTRACT, "get_view", { viewer: this.accountId }, LATEST));
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
    // When every server is struggling, ask less often until one recovers.
    this.timer = window.setTimeout(() => void this.poll(), POLL_MS * 2 ** Math.min(this.failedPolls, 3));
  }

  private async poll() {
    if (this.stopped || this.polling) return;
    this.polling = true;
    try {
      const status = await viaAnyServer(this.near, (near) => near.view<Status>(CONTRACT, "status", {}, LATEST));
      this.failedPolls = 0;
      if (status) {
        const key = `${status.season}:${status.watch}:${status.seq}`;
        if (key !== this.lastSeq) {
          this.lastSeq = key;
          await this.refresh();
          await this.ensureRole();
        }
        // Anyone may move the world on. The more people are around, the more this
        // spreads them out, so they don't all try at the same moment.
        const around = Math.max(1, this.view?.towns.filter((t) => t.online).length ?? 1);
        const due = Number(status.next_tick_ms) + Math.random() * (1000 + 500 * around);
        if (this.someoneIsHere() && Date.now() >= due && !this.ticking) {
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
      this.failedPolls += 1;
    } finally {
      this.polling = false;
      this.schedule();
    }
  }

  private async tick() {
    if (this.ticker) {
      const paid = await viaAnyServer(this.ticker, (near) =>
        near.transaction(CONTRACT).functionCall(CONTRACT, "tick", {}, { gas: TICK_GAS }).send({ waitUntil: "EXECUTED_OPTIMISTIC" }),
      ).then(
        () => true,
        () => false,
      );
      if (paid) return;
    }
    // A guest's gas came with the game. A wallet's is the player's own, so leave it to others.
    if (this.ownWallet) return;
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
    this.noteActive();
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
    for (const sign of SIGNS_OF_LIFE) window.removeEventListener(sign, this.noteActive);
  }
}
