// Searches for a season where one great storm brings down a chain of houses.
// The "Watch a spiral collapse" button replays the best one. The engine is the
// real one and nothing is staged: this only picks which season to show.
//
//   node scripts/find-spiral.mjs [seeds] [preRoll]

import { readFile } from "node:fs/promises";

const bytes = await readFile(new URL("../web/public/engine.wasm", import.meta.url));
const { instance } = await WebAssembly.instantiate(bytes, {});
const x = instance.exports;

function call(command) {
  const data = new TextEncoder().encode(JSON.stringify(command));
  const input = x.fw_alloc(data.length);
  new Uint8Array(x.memory.buffer, input, data.length).set(data);
  const packed = x.fw_call(input, data.length);
  x.fw_free(input, data.length);
  const pointer = Number(packed >> 32n);
  const length = Number(packed & 0xffffffffn);
  const text = new TextDecoder().decode(new Uint8Array(x.memory.buffer, pointer, length));
  x.fw_free(pointer, length);
  const reply = JSON.parse(text);
  if (!reply.ok) throw new Error(reply.error);
  return reply.result;
}

// Must match scriptedEntropy in web/src/engine.ts.
function scripted(seed, step) {
  const out = [];
  let v = (seed * 2654435761 + step * 40503) >>> 0;
  for (let i = 0; i < 32; i++) {
    v = (v * 1664525 + 1013904223) >>> 0;
    out.push(v >>> 24);
  }
  return out;
}

function play(seed, preRoll, watch = 26) {
  let steps = 0;
  const step = () => {
    steps += 1;
    return call({ op: "step", entropy: scripted(seed, steps) });
  };
  call({ op: "new", seed, watch_ms: 4500 });
  for (let i = 0; i < preRoll; i++) step();
  const act = (action) => call({ op: "act", action, entropy: scripted(seed, steps) });
  act({ kind: "found_house", name: "The Observer" });
  act({ kind: "set_clerk", on: true });
  let view = act({ kind: "summon_storm" }).view;
  const startSeq = view.seq;
  const failed = new Set();
  let wrecks = 0;
  let firstFail = 0;
  let lastFail = 0;
  const seen = new Set();
  for (let i = 0; i < watch; i++) {
    view = step();
    for (const e of view.events) {
      if (e.seq <= startSeq || seen.has(e.seq)) continue;
      seen.add(e.seq);
      if (e.type === "wrecked") wrecks += 1;
      if (e.type === "house_failed") {
        failed.add(e.house);
        firstFail ||= e.watch;
        lastFail = e.watch;
      }
    }
  }
  return { seed, failed: failed.size, wrecks, span: lastFail - firstFail, you: view.houses.find((h) => h.you)?.active };
}

const seeds = Number(process.argv[2] ?? 3000);
const preRoll = Number(process.argv[3] ?? 60);
const results = [];
for (let seed = 1; seed <= seeds; seed++) results.push(play(seed, preRoll));
results.sort((a, b) => b.failed - a.failed || b.span - a.span);
console.table(results.slice(0, 8));
const share = results.filter((r) => r.failed >= 2).length / results.length;
console.log(`2+ houses failed in ${(share * 100).toFixed(0)}% of ${seeds} seasons`);
