// Loads the rules (compiled from the same Rust the contract uses) and runs a
// practice harbor in the browser. No network and no chain are involved.

import type { Action, Driver, Receipt, View } from "./types";

interface Exports {
  memory: WebAssembly.Memory;
  fw_alloc(len: number): number;
  fw_free(ptr: number, len: number): void;
  fw_call(ptr: number, len: number): bigint;
}

interface Reply<T> {
  ok: boolean;
  result?: T;
  error?: string;
}

export class Engine {
  private constructor(private x: Exports) {}

  static async load(): Promise<Engine> {
    const url = new URL("engine.wasm", new URL(import.meta.env.BASE_URL, window.location.href));
    const response = await fetch(url);
    if (!response.ok) throw new Error("The rulebook could not be loaded.");
    const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), {});
    return new Engine(instance.exports as unknown as Exports);
  }

  call<T>(command: object): T {
    const bytes = new TextEncoder().encode(JSON.stringify(command));
    const input = this.x.fw_alloc(bytes.length);
    new Uint8Array(this.x.memory.buffer, input, bytes.length).set(bytes);
    const packed = this.x.fw_call(input, bytes.length);
    this.x.fw_free(input, bytes.length);
    const pointer = Number(packed >> 32n);
    const length = Number(packed & 0xffffffffn);
    const text = new TextDecoder().decode(new Uint8Array(this.x.memory.buffer, pointer, length));
    this.x.fw_free(pointer, length);
    const reply = JSON.parse(text) as Reply<T>;
    if (!reply.ok) throw new Error(reply.error ?? "The clerk could not do that.");
    return reply.result as T;
  }
}

function freshEntropy(): number[] {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)));
}

/** Fixed entropy, used to replay a known season exactly. */
function scriptedEntropy(seed: number, step: number): number[] {
  const out: number[] = [];
  let x = (seed * 2654435761 + step * 40503) >>> 0;
  for (let i = 0; i < 32; i++) {
    x = (x * 1664525 + 1013904223) >>> 0;
    out.push(x >>> 24);
  }
  return out;
}

export const NORMAL_WATCH_MS = 4500;
/** A week of 42 watches in one minute. */
export const WEEK_IN_A_MINUTE_MS = Math.round(60000 / 42);

export class PracticeDriver implements Driver {
  readonly mode = "practice" as const;
  private listeners = new Set<(view: View) => void>();
  private timer: number | undefined;
  private startedAt = performance.now();
  private length = 0;
  private stepCount = 0;
  private stopped = false;
  private script: number | null = null;
  view: View;
  /** Called after each watch, used by fast-forward and scripted demos. */
  onWatch: ((view: View) => void) | null = null;

  constructor(private engine: Engine, seed: number, opts: { scripted?: boolean; preRoll?: number } = {}) {
    this.view = engine.call<View>({ op: "new", seed, watch_ms: NORMAL_WATCH_MS });
    if (opts.scripted) this.script = seed;
    const roll = opts.preRoll ?? 10;
    for (let i = 0; i < roll; i++) this.advance(false);
  }

  private entropy(): number[] {
    return this.script === null ? freshEntropy() : scriptedEntropy(this.script, this.stepCount);
  }

  private advance(notify = true) {
    this.stepCount += 1;
    this.view = this.engine.call<View>({ op: "step", entropy: this.entropy() });
    this.startedAt = performance.now();
    if (notify) this.emit();
  }

  private emit() {
    for (const listener of this.listeners) listener(this.view);
    this.onWatch?.(this.view);
  }

  subscribe(listener: (view: View) => void) {
    this.listeners.add(listener);
    listener(this.view);
    return () => void this.listeners.delete(listener);
  }

  /** Sets the length of a watch. Zero pauses the world. */
  setPace(ms: number) {
    window.clearTimeout(this.timer);
    this.timer = undefined;
    this.length = ms;
    this.startedAt = performance.now();
    if (ms > 0) this.schedule();
  }

  pace() {
    return this.length;
  }

  private schedule() {
    if (this.stopped || this.length <= 0) return;
    this.timer = window.setTimeout(() => {
      if (this.stopped || this.length <= 0) return;
      this.advance();
      this.schedule();
    }, this.length);
  }

  async act(action: Action): Promise<Receipt> {
    const reply = this.engine.call<{ receipt: Receipt; view: View }>({
      op: "act",
      action,
      entropy: this.entropy(),
    });
    this.view = reply.view;
    for (const listener of this.listeners) listener(this.view);
    return reply.receipt;
  }

  /** Feeds live sea readings into this harbor. */
  sea(seas: number[]) {
    this.view = this.engine.call<View>({ op: "sea", seas });
  }

  /** Runs watches immediately without animation. */
  skip(watches: number) {
    for (let i = 0; i < watches; i++) this.advance(false);
    this.emit();
  }

  watchStartedAt() {
    return this.startedAt;
  }

  watchLength() {
    return this.length;
  }

  stop() {
    this.stopped = true;
    window.clearTimeout(this.timer);
  }
}
