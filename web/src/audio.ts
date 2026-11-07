// All sound is synthesized. Marine insurers once rang a bell for news of a ship:
// one stroke for a loss, two for a ship safe home. The game keeps that tradition.

let context: AudioContext | null = null;
let muted = false;
let surf: GainNode | null = null;

function ctx(): AudioContext | null {
  if (muted) return null;
  if (!context) {
    const Ctor = window.AudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  if (context.state === "suspended") void context.resume();
  return context;
}

export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem("fw-muted", value ? "1" : "0");
  } catch {
    // A private window may refuse storage. Sound still follows this page's setting.
  }
  if (surf && context) surf.gain.setTargetAtTime(value ? 0 : 0.012, context.currentTime, 0.3);
}

export function isMuted() {
  try {
    muted = localStorage.getItem("fw-muted") === "1";
  } catch {
    muted = false;
  }
  return muted;
}

function strike(at: number, level: number) {
  const c = ctx();
  if (!c) return;
  const ratios = [1, 2.0, 2.76, 5.4];
  const base = 392;
  ratios.forEach((ratio, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = base * ratio;
    const peak = (level * 0.16) / (i + 1);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(peak, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 2.2 / (1 + i * 0.7));
    osc.connect(gain).connect(c.destination);
    osc.start(at);
    osc.stop(at + 2.6);
  });
}

export function bell(strokes: 1 | 2) {
  const c = ctx();
  if (!c) return;
  strike(c.currentTime + 0.01, strokes === 1 ? 1 : 0.7);
  if (strokes === 2) strike(c.currentTime + 0.42, 0.55);
}

export function stamp() {
  const c = ctx();
  if (!c) return;
  const length = 0.12;
  const buffer = c.createBuffer(1, c.sampleRate * length, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 4;
  const source = c.createBufferSource();
  source.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 420;
  const gain = c.createGain();
  gain.gain.value = 0.5;
  source.connect(filter).connect(gain).connect(c.destination);
  source.start();
}

export function coins() {
  const c = ctx();
  if (!c) return;
  [0, 0.05, 0.11].forEach((delay, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "triangle";
    osc.frequency.value = 2200 + i * 340;
    const at = c.currentTime + delay;
    gain.gain.setValueAtTime(0.03, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
    osc.connect(gain).connect(c.destination);
    osc.start(at);
    osc.stop(at + 0.1);
  });
}

export function thunder() {
  const c = ctx();
  if (!c) return;
  const seconds = 2.4;
  const buffer = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = last * 0.985 + (Math.random() * 2 - 1) * 0.04;
    data[i] = last * (1 - i / data.length) ** 2 * (1 + Math.sin(i / 2400));
  }
  const source = c.createBufferSource();
  source.buffer = buffer;
  const gain = c.createGain();
  gain.gain.value = 0.9;
  source.connect(gain).connect(c.destination);
  source.start();
}

/** A faint, endless wash of surf under the game. */
export function startSurf() {
  const c = ctx();
  if (!c || surf) return;
  const seconds = 6;
  const buffer = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = last * 0.97 + (Math.random() * 2 - 1) * 0.06;
    const swell = 0.55 + 0.45 * Math.sin((i / data.length) * Math.PI * 2 * 2);
    data[i] = last * swell;
  }
  const source = c.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  surf = c.createGain();
  surf.gain.value = 0.012;
  source.connect(surf).connect(c.destination);
  source.start();
}
