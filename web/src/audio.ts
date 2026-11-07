// All sound is synthesized. Marine insurers once rang a bell for news of a ship:
// one stroke for a loss, two for a ship safe home. The game keeps that tradition.
// The sea, the gulls and the tune underneath are in soundscape.ts.

import { Soundscape, type Jingle, type Weather } from "./soundscape";

export type { Weather };

function remembered(key: string) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function remember(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // A private window may refuse storage. Sound still follows this page's setting.
  }
}

let context: AudioContext | null = null;
let master: GainNode | null = null;
let effects: GainNode | null = null;
let scape: Soundscape | null = null;
let muted = remembered("fw-muted");
let musicOn = !remembered("fw-music-off");
let weather: Weather = 0;
const ducks = new Set<string>();

function open(): AudioContext | null {
  if (!context) {
    const Ctor = window.AudioContext;
    if (!Ctor) return null;
    context = new Ctor();
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.2;
    master = context.createGain();
    master.gain.value = muted ? 0 : 1;
    effects = context.createGain();
    effects.connect(master);
    master.connect(limiter).connect(context.destination);
    if (import.meta.env.DEV) {
      const meter = context.createAnalyser();
      meter.fftSize = 8192;
      limiter.connect(meter);
      (window as unknown as { fwAudio: object }).fwAudio = { context, meter, limiter };
    }
  }
  if (context.state === "suspended") void context.resume();
  return context;
}

function ctx(): AudioContext | null {
  return muted ? null : open();
}

/**
 * Browsers keep a page silent until the player first taps or presses a key, so this
 * runs on that first touch. After that the sound plays all the time, on every screen.
 */
export function startBackground() {
  const c = open();
  if (!c || !master || scape) return;
  scape = new Soundscape(c, master);
  scape.setMusic(musicOn);
  scape.setWeather(weather);
  scape.duck(ducks.size > 0);
  const plan = () => scape?.run(c.currentTime);
  plan();
  window.setInterval(plan, 500);
}

export function setMuted(value: boolean) {
  muted = value;
  remember("fw-muted", value);
  if (!value) startBackground();
  if (master && context) master.gain.setTargetAtTime(value ? 0 : 1, context.currentTime, 0.08);
}

export function isMuted() {
  return muted;
}

export function setMusicOn(value: boolean) {
  musicOn = value;
  remember("fw-music-off", !value);
  startBackground();
  scape?.setMusic(value);
}

export function isMusicOn() {
  return musicOn;
}

/** 0 is fair weather, 1 a storm somewhere about, 2 a big storm or one on your ship. */
export function setWeather(level: Weather) {
  weather = level;
  scape?.setWeather(level);
}

/** Turns the background down while something needs to be heard over it. */
export function duck(reason: string, on: boolean) {
  if (on) ducks.add(reason);
  else ducks.delete(reason);
  scape?.duck(ducks.size > 0);
}

const clips = new Map<string, Promise<AudioBuffer | null>>();
let voice: AudioBufferSourceNode | null = null;
let voiceTurn = 0;

function clip(id: string) {
  let loading = clips.get(id);
  if (!loading) {
    const url = new URL(`voice/${id}.mp3`, new URL(import.meta.env.BASE_URL, window.location.href));
    loading = fetch(url)
      .then((reply) => (reply.ok ? reply.arrayBuffer() : Promise.reject(new Error("missing"))))
      .then((bytes) => open()?.decodeAudioData(bytes) ?? null)
      .catch(() => null);
    clips.set(id, loading);
  }
  return loading;
}

/** Fetches lines ahead of time, so Pip answers without a pause. */
export function prepareVoice(ids: string[]) {
  ids.forEach((id) => void clip(id));
}

export function isSpeaking() {
  return voice !== null;
}

export function stopVoice() {
  voiceTurn += 1;
  const speaking = voice;
  voice = null;
  speaking?.stop();
  duck("pip", false);
}

/** Pip says a line. Resolves true once it's finished, or false if it couldn't be heard. */
export async function speak(id: string): Promise<boolean> {
  stopVoice();
  const turn = voiceTurn;
  const c = ctx();
  if (!c || !effects) return false;
  const buffer = await clip(id);
  if (!buffer || muted || turn !== voiceTurn) return false;
  duck("pip", true);
  return new Promise((resolve) => {
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.connect(effects!);
    source.onended = () => {
      if (voice === source) {
        voice = null;
        duck("pip", false);
      }
      resolve(true);
    };
    voice = source;
    source.start();
  });
}

export function jingle(kind: Jingle) {
  const c = ctx();
  if (c && effects) scape?.jingle(kind, effects);
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
    osc.connect(gain).connect(effects!);
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
  source.connect(filter).connect(gain).connect(effects!);
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
    osc.connect(gain).connect(effects!);
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
  source.connect(gain).connect(effects!);
  source.start();
}

if (import.meta.env.DEV) {
  /** Renders the background offline, so its level can be measured in tests. */
  (window as unknown as { fwRender: unknown }).fwRender = async (seconds: number, level: Weather, music: boolean) => {
    const offline = new OfflineAudioContext(2, 44100 * seconds, 44100);
    const offlineScape = new Soundscape(offline, offline.destination);
    offlineScape.setMusic(music);
    offlineScape.setWeather(level);
    offlineScape.run(0, seconds);
    const rendered = await offline.startRendering();
    const pcm = new Int16Array(rendered.length * 2);
    const left = rendered.getChannelData(0);
    const right = rendered.getChannelData(1);
    for (let i = 0; i < rendered.length; i++) {
      pcm[i * 2] = Math.max(-1, Math.min(1, left[i])) * 32767;
      pcm[i * 2 + 1] = Math.max(-1, Math.min(1, right[i])) * 32767;
    }
    let text = "";
    const bytes = new Uint8Array(pcm.buffer);
    for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(text);
  };
}
