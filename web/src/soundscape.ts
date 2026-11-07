// The harbor's background sound: the sea, gulls, wind and rain, and a little tune.
// Everything is made in code, so there are no audio files to download or license.
// The tune was written for this game.

export type Weather = 0 | 1 | 2;
export type Jingle = "star" | "quest" | "level" | "home" | "sad";

/** Six eighth notes, at 80 dotted quarter notes a minute. */
const BAR = 1.5;
const EIGHTH = BAR / 6;
const TAU = Math.PI * 2;

// The mix. All of these are plain gains, tuned by measuring rendered audio.
const MUSIC = 0.27;
const REVERB = 0.2;
const DEEP = 0.2;
const WASH = 0.2;
const WIND = 0.13;
const RAIN = 0.05;
const GULL = 0.09;

const rand = (low: number, high: number) => low + Math.random() * (high - low);

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function midi(name: string) {
  const sharp = name[1] === "#";
  return NOTE[name[0]] + (sharp ? 1 : 0) + (Number(name[sharp ? 2 : 1]) + 1) * 12;
}

const hz = (note: number) => 440 * 2 ** ((note - 69) / 12);

interface Sample {
  buffer: AudioBuffer;
  root: number;
}

function blank(ctx: BaseAudioContext, seconds: number, channels = 1) {
  return ctx.createBuffer(channels, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
}

/** Brings a sample to full level, with no click at the end. */
function finish(data: Float32Array, fade = 0.1) {
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  const tail = Math.floor(data.length * fade);
  for (let i = 0; i < data.length; i++) {
    data[i] /= peak || 1;
    if (i >= data.length - tail) data[i] *= (data.length - i) / tail;
  }
}

/** A plucked string, by the Karplus-Strong method. */
function pluck(ctx: BaseAudioContext, root: number, seconds: number, decay: number): Sample {
  const rate = ctx.sampleRate;
  const period = Math.max(2, Math.round(rate / root - 0.5));
  const ring = new Float32Array(period);
  let last = 0;
  let sum = 0;
  for (let i = 0; i < period; i++) {
    last = last * 0.55 + (Math.random() * 2 - 1) * 0.45;
    ring[i] = last;
    sum += last;
  }
  for (let i = 0; i < period; i++) ring[i] -= sum / period;
  const buffer = blank(ctx, seconds);
  const data = buffer.getChannelData(0);
  let at = 0;
  for (let i = 0; i < data.length; i++) {
    const next = (at + 1) % period;
    data[i] = ring[at];
    ring[at] = (ring[at] + ring[next]) * 0.5 * decay;
    at = next;
  }
  finish(data);
  return { buffer, root: rate / (period + 0.5) };
}

/** A struck tone, as a sum of fading sine waves: [ratio, level, seconds to fade]. */
function partials(ctx: BaseAudioContext, root: number, seconds: number, attack: number, parts: [number, number, number][]): Sample {
  const buffer = blank(ctx, seconds);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const t = i / ctx.sampleRate;
    let sum = 0;
    for (const [ratio, level, fade] of parts) sum += level * Math.sin(TAU * root * ratio * t) * Math.exp(-t / fade);
    data[i] = sum * Math.min(1, t / attack);
  }
  finish(data);
  return { buffer, root };
}

function whistle(ctx: BaseAudioContext, root: number, seconds: number): Sample {
  const buffer = blank(ctx, seconds);
  const data = buffer.getChannelData(0);
  let phase = 0;
  let breath = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / ctx.sampleRate;
    const vibrato = 1 + 0.004 * Math.sin(TAU * 5.4 * t) * Math.min(1, Math.max(0, (t - 0.3) / 0.5));
    phase += (TAU * root * vibrato) / ctx.sampleRate;
    breath = breath * 0.8 + (Math.random() * 2 - 1) * 0.2;
    data[i] = (Math.sin(phase) + 0.12 * Math.sin(2 * phase) + 0.04 * Math.sin(3 * phase) + breath * 0.03) * Math.min(1, t / 0.035);
  }
  finish(data, 0.15);
  return { buffer, root };
}

/** Two reeds a hair apart, like a small accordion. */
function reed(ctx: BaseAudioContext, root: number, seconds: number): Sample {
  const buffer = blank(ctx, seconds);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const t = i / ctx.sampleRate;
    let sum = 0;
    for (let h = 1; h <= 7; h++) {
      const level = 1 / h ** 1.25;
      sum += level * (Math.sin(TAU * root * h * t) + Math.sin(TAU * root * 1.0035 * h * t + h));
    }
    data[i] = sum * Math.min(1, t / 0.14);
  }
  finish(data, 0.2);
  return { buffer, root };
}

function shaker(ctx: BaseAudioContext): Sample {
  const buffer = blank(ctx, 0.08);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const noise = Math.random() * 2 - 1;
    data[i] = (noise - last) * Math.exp(-i / ctx.sampleRate / 0.014);
    last = noise;
  }
  finish(data, 0.05);
  return { buffer, root: 440 };
}

function drum(ctx: BaseAudioContext): Sample {
  const buffer = blank(ctx, 0.7);
  const data = buffer.getChannelData(0);
  let phase = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / ctx.sampleRate;
    phase += (TAU * (62 + 70 * Math.exp(-t / 0.04))) / ctx.sampleRate;
    data[i] = Math.sin(phase) * Math.exp(-t / 0.2) * Math.min(1, t / 0.004);
  }
  finish(data);
  return { buffer, root: 440 };
}

/** Endless noise that loops without a seam. */
function noiseLoop(ctx: BaseAudioContext, seconds: number, colour: "white" | "pink" | "brown") {
  const rate = ctx.sampleRate;
  const fade = Math.floor(rate * 0.5);
  const length = Math.floor(rate * seconds);
  const raw = new Float32Array(length + fade);
  let a = 0;
  let b = 0;
  let c = 0;
  for (let i = 0; i < raw.length; i++) {
    const white = Math.random() * 2 - 1;
    if (colour === "white") {
      raw[i] = white;
    } else if (colour === "brown") {
      a = (a + 0.02 * white) / 1.02;
      raw[i] = a;
    } else {
      a = 0.99765 * a + white * 0.099046;
      b = 0.963 * b + white * 0.2965164;
      c = 0.57 * c + white * 1.0526913;
      raw[i] = a + b + c + white * 0.1848;
    }
  }
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = i < fade ? raw[i] * (i / fade) + raw[length + i] * (1 - i / fade) : raw[i];
  finish(data, 0);
  return buffer;
}

function roomEcho(ctx: BaseAudioContext) {
  const convolver = ctx.createConvolver();
  const impulse = blank(ctx, 1.4, 2);
  for (let side = 0; side < 2; side++) {
    const data = impulse.getChannelData(side);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = last * 0.55 + (Math.random() * 2 - 1) * 0.45;
      data[i] = last * Math.exp(-i / ctx.sampleRate / 0.32);
    }
  }
  convolver.buffer = impulse;
  return convolver;
}

interface Chord {
  notes: string[];
  bass: [string, string];
}

const CHORDS: Record<string, Chord> = {
  G: { notes: ["D4", "G4", "B4"], bass: ["G2", "D3"] },
  C: { notes: ["E4", "G4", "C5"], bass: ["C3", "G2"] },
  D: { notes: ["D4", "F#4", "A4"], bass: ["D3", "A2"] },
  Em: { notes: ["E4", "G4", "B4"], bass: ["E3", "B2"] },
  Am: { notes: ["E4", "A4", "C5"], bass: ["A2", "E3"] },
  B: { notes: ["D#4", "F#4", "B4"], bass: ["B2", "F#3"] },
};

/** A chord, and the tune over it: six eighth notes, "-" to hold, "." for a rest. */
type Bar = [string, string];

const SHORE: Bar[] = [
  ["G", ""],
  ["D", ""],
];

const SAILING: Bar[] = [
  ["G", "G4 - B4 D5 E5 D5"],
  ["G", "B4 - D5 A4 - -"],
  ["C", "G4 - C5 E5 G5 E5"],
  ["G", "D5 - B4 G4 - -"],
  ["Em", "B4 - E5 G5 F#5 E5"],
  ["C", "C5 - E5 D5 - C5"],
  ["D", "A4 - D5 F#5 E5 D5"],
  ["G", "B4 A4 G4 - - ."],
];

const HOMEWARD: Bar[] = [
  ["C", "E5 - - G5 - E5"],
  ["G", "D5 - - B4 - D5"],
  ["Am", "C5 - E5 A5 G5 E5"],
  ["D", "F#5 - - D5 - ."],
  ["C", "G5 - E5 C5 - E5"],
  ["G", "D5 - B4 G4 - B4"],
  ["D", "A4 - D5 C5 B4 A4"],
  ["G", "G4 - - - - ."],
];

const RESTING: Bar[] = [
  ["C", ""],
  ["G", ""],
  ["Am", ""],
  ["D", ""],
];

interface Part {
  bars: Bar[];
  lead: "mallet" | "whistle" | null;
  pad: boolean;
  shake: boolean;
}

const SONG: Part[] = [
  { bars: SHORE, lead: null, pad: false, shake: false },
  { bars: SAILING, lead: "mallet", pad: false, shake: true },
  { bars: HOMEWARD, lead: "mallet", pad: true, shake: true },
  { bars: SAILING, lead: "whistle", pad: true, shake: true },
  { bars: RESTING, lead: null, pad: true, shake: false },
];

/** The tune moves to a new key each time round, so it never quite repeats. */
const KEYS = [0, 2, -2, 3];

const STORM: Bar[] = [
  ["Em", ""],
  ["Em", "B4 - - G4 - -"],
  ["C", ""],
  ["B", "A4 - - F#4 - -"],
];

const JINGLES: Record<Jingle, { notes: string[]; gap: number; level: number }> = {
  star: { notes: ["E6", "G6", "C7"], gap: 0.07, level: 0.5 },
  quest: { notes: ["C5", "E5", "G5", "C6"], gap: 0.09, level: 0.6 },
  level: { notes: ["G4", "C5", "E5", "G5", "E5", "G5", "C6"], gap: 0.12, level: 0.7 },
  home: { notes: ["G4", "B4", "D5", "G5"], gap: 0.14, level: 0.6 },
  sad: { notes: ["E4", "D#4", "D4", "C#4"], gap: 0.3, level: 0.7 },
};

function parseLine(line: string) {
  const notes: { step: number; pitch: number; steps: number }[] = [];
  line.split(" ").forEach((token, step) => {
    if (!token) return;
    if (token === "-") {
      if (notes.length) notes[notes.length - 1].steps += 1;
    } else if (token !== ".") {
      notes.push({ step, pitch: midi(token), steps: 1 });
    }
  });
  return notes;
}

interface Layer {
  gain: GainNode;
  filter: BiquadFilterNode;
}

export class Soundscape {
  private tune: GainNode;
  private tone: BiquadFilterNode;
  private air: GainNode;
  private echo: ConvolverNode;
  private leadBus: StereoPannerNode;
  private strumBus: StereoPannerNode;

  private bass: Sample;
  private uke: Sample;
  private mallet: Sample;
  private flute: Sample;
  private squeeze: Sample;
  private shake: Sample;
  private tom: Sample;
  private buoy: Sample;

  private brown: AudioBuffer;
  private deep: Layer;
  private washes: Layer[];
  private wind: Layer;
  private rain: Layer;

  private weather: Weather = 0;
  private musicOn = true;
  private ducked = false;
  private part = 0;
  private bar = 0;
  private round = 0;
  private stormBars = 0;
  private wasStorm = false;
  private side = 0;

  private nextBar = 0.2;
  private nextWave = 0;
  private nextGull: number;
  private nextBuoy: number;
  private nextHorn: number;
  private nextGust = 0;
  private nextRumble = 0;

  constructor(
    private ctx: BaseAudioContext,
    out: AudioNode,
  ) {
    this.tune = ctx.createGain();
    this.tune.gain.value = MUSIC;
    this.tone = ctx.createBiquadFilter();
    this.tone.type = "lowpass";
    this.tone.frequency.value = 9000;
    this.tune.connect(this.tone).connect(out);

    this.air = ctx.createGain();
    this.air.connect(out);

    this.echo = roomEcho(ctx);
    const wet = ctx.createGain();
    wet.gain.value = REVERB;
    this.echo.connect(wet).connect(out);

    this.leadBus = ctx.createStereoPanner();
    this.leadBus.pan.value = 0.18;
    this.leadBus.connect(this.tune);
    const leadSend = ctx.createGain();
    leadSend.gain.value = 0.5;
    this.leadBus.connect(leadSend).connect(this.echo);

    this.strumBus = ctx.createStereoPanner();
    this.strumBus.pan.value = -0.22;
    this.strumBus.connect(this.tune);
    const strumSend = ctx.createGain();
    strumSend.gain.value = 0.25;
    this.strumBus.connect(strumSend).connect(this.echo);

    this.bass = partials(ctx, 110, 1.5, 0.008, [
      [1, 1, 0.7],
      [2, 0.3, 0.4],
      [3, 0.1, 0.2],
    ]);
    this.uke = pluck(ctx, 196, 1.6, 0.993);
    this.mallet = partials(ctx, 440, 1.3, 0.003, [
      [1, 1, 0.45],
      [3.93, 0.25, 0.12],
      [9.6, 0.08, 0.04],
    ]);
    this.flute = whistle(ctx, 880, 3);
    this.squeeze = reed(ctx, 220, 3);
    this.shake = shaker(ctx);
    this.tom = drum(ctx);
    this.buoy = partials(ctx, 660, 3, 0.004, [
      [1, 1, 1.3],
      [2.76, 0.4, 0.6],
      [5.4, 0.2, 0.22],
    ]);

    const pink = noiseLoop(ctx, 7, "pink");
    this.brown = noiseLoop(ctx, 7, "brown");
    const white = noiseLoop(ctx, 3, "white");
    this.deep = this.layer(this.brown, "lowpass", 340, 0.5, 0, DEEP);
    this.washes = [this.layer(pink, "bandpass", 850, 0.45, -0.65, WASH * 0.25), this.layer(pink, "bandpass", 1100, 0.45, 0.65, WASH * 0.25)];
    this.wind = this.layer(pink, "bandpass", 480, 1.2, 0.1, 0);
    this.rain = this.layer(white, "highpass", 2600, 0.5, 0, 0);

    const start = ctx.currentTime;
    this.nextBar = start + 0.2;
    this.nextWave = start;
    this.nextGull = start + rand(1, 4);
    this.nextBuoy = start + rand(9, 18);
    this.nextHorn = start + rand(25, 50);
    this.nextGust = start;
    this.nextRumble = start;
  }

  private layer(buffer: AudioBuffer, type: BiquadFilterType, frequency: number, q: number, pan: number, level: number): Layer {
    const { ctx } = this;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = level;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    source.connect(filter).connect(gain).connect(panner).connect(this.air);
    source.start(ctx.currentTime, Math.random() * buffer.duration);
    return { gain, filter };
  }

  private note(sample: Sample, pitch: number, at: number, level: number, to: AudioNode, length?: number) {
    const { ctx } = this;
    const source = ctx.createBufferSource();
    source.buffer = sample.buffer;
    source.playbackRate.value = hz(pitch) / sample.root;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, at);
    source.connect(gain).connect(to);
    source.start(at);
    if (length !== undefined) {
      gain.gain.setValueAtTime(level, at + length);
      gain.gain.linearRampToValueAtTime(0, at + length + 0.09);
      source.stop(at + length + 0.1);
    }
  }

  private lead(line: string, kind: "mallet" | "whistle", key: number, at: number) {
    for (const n of parseLine(line)) {
      const when = at + n.step * EIGHTH + rand(-0.006, 0.006);
      if (kind === "mallet") this.note(this.mallet, n.pitch + key, when, rand(0.48, 0.58), this.leadBus);
      else this.note(this.flute, n.pitch + key, when, rand(0.2, 0.24), this.leadBus, n.steps * EIGHTH - 0.03);
    }
  }

  private calmBar(at: number) {
    if (this.wasStorm) {
      this.wasStorm = false;
      this.part = 1;
      this.bar = 0;
    }
    const part = SONG[this.part];
    const [name, line] = part.bars[this.bar];
    const chord = CHORDS[name];
    const key = KEYS[this.round % KEYS.length];

    this.note(this.bass, midi(chord.bass[0]) + key, at, 0.5, this.tune);
    this.note(this.bass, midi(chord.bass[1]) + key, at + 3 * EIGHTH, 0.38, this.tune);
    for (const step of [2, 5]) {
      chord.notes.forEach((n, i) => {
        this.note(this.uke, midi(n) + key, at + step * EIGHTH + i * 0.016 + rand(-0.004, 0.004), rand(0.3, 0.38), this.strumBus);
      });
    }
    if (part.pad) {
      chord.notes.forEach((n) => this.note(this.squeeze, midi(n) + key - 12, at, 0.06, this.strumBus, BAR - 0.06));
    }
    if (part.shake) {
      for (let step = 0; step < 6; step++) {
        this.note(this.shake, 69, at + step * EIGHTH, step % 3 === 0 ? 0.06 : 0.03, this.tune);
      }
    }
    if (part.lead) this.lead(line, part.lead, key, at);

    this.bar += 1;
    if (this.bar >= part.bars.length) {
      this.bar = 0;
      this.part += 1;
      if (this.part >= SONG.length) {
        this.part = 0;
        this.round += 1;
      }
    }
  }

  /** Something darker while a big storm blows, and still not scary. */
  private stormBar(at: number) {
    this.wasStorm = true;
    const [name, line] = STORM[this.stormBars % STORM.length];
    const chord = CHORDS[name];
    this.note(this.bass, midi(chord.bass[0]) - 12, at, 0.5, this.tune);
    this.note(this.bass, midi(chord.bass[1]) - 12, at + 3 * EIGHTH, 0.38, this.tune);
    this.note(this.tom, 69, at, 0.26, this.tune);
    this.note(this.tom, 69, at + 3 * EIGHTH, 0.16, this.tune);
    for (const step of [1, 2, 4, 5]) {
      chord.notes.slice(0, 2).forEach((n) => {
        this.note(this.uke, midi(n) - 12, at + step * EIGHTH, 0.26, this.strumBus, 0.1);
      });
    }
    if (line) this.lead(line, "whistle", -12, at);
    this.stormBars += 1;
  }

  private wave(at: number) {
    const layer = this.washes[this.side];
    this.side = 1 - this.side;
    const size = rand(0.7, 1) * [1, 1.3, 1.8][this.weather] * WASH;
    layer.gain.gain.setTargetAtTime(size, at, 0.9);
    layer.gain.gain.setTargetAtTime(size * 0.25, at + rand(2.2, 3.2), 1.4);
  }

  private gull(at: number) {
    const { ctx } = this;
    const pan = ctx.createStereoPanner();
    pan.pan.value = rand(-0.8, 0.8);
    const level = GULL * rand(0.45, 1);
    pan.connect(this.air);
    pan.connect(this.echo);
    const pitch = rand(0.9, 1.15);
    const calls = 2 + Math.floor(Math.random() * 3);
    let t = at;
    for (let i = 0; i < calls; i++) {
      const length = rand(0.2, 0.3);
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(1150 * pitch, t);
      osc.frequency.exponentialRampToValueAtTime(1800 * pitch, t + 0.05);
      osc.frequency.exponentialRampToValueAtTime(1000 * pitch, t + length);
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 2100;
      filter.Q.value = 2.5;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(level, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
      osc.connect(filter).connect(gain).connect(pan);
      osc.start(t);
      osc.stop(t + length + 0.02);
      t += length + rand(0.05, 0.16);
    }
  }

  private horn(at: number) {
    const { ctx } = this;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.05, at + 0.5);
    gain.gain.setValueAtTime(0.05, at + 2);
    gain.gain.linearRampToValueAtTime(0, at + 3);
    filter.connect(gain);
    gain.connect(this.air);
    gain.connect(this.echo);
    for (const pitch of [98, 147.5]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = pitch;
      osc.connect(filter);
      osc.start(at);
      osc.stop(at + 3.1);
    }
  }

  private rumble(at: number) {
    const { ctx } = this;
    const source = ctx.createBufferSource();
    source.buffer = this.brown;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 170;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.5, at + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 3.4);
    source.connect(filter).connect(gain).connect(this.air);
    source.start(at, Math.random() * 3, 3.5);
  }

  /** Plans the next stretch of sound. Call this often, and from any timer. */
  run(now: number, ahead = 2.4) {
    const until = now + ahead;
    if (this.nextBar < now) this.nextBar = now + 0.05;
    while (this.nextBar < until) {
      if (this.musicOn) {
        if (this.weather === 2) this.stormBar(this.nextBar);
        else this.calmBar(this.nextBar);
      }
      this.nextBar += BAR;
    }
    while (this.nextWave < until) {
      this.wave(Math.max(now, this.nextWave));
      this.nextWave += rand(3.2, 6);
    }
    while (this.nextGull < until) {
      if (this.weather < 2) this.gull(Math.max(now, this.nextGull));
      this.nextGull += this.weather === 0 ? rand(7, 18) : rand(18, 34);
    }
    while (this.nextBuoy < until) {
      const at = Math.max(now, this.nextBuoy);
      this.note(this.buoy, midi("E5"), at, 0.05, this.echo);
      this.note(this.buoy, midi("E5"), at + rand(1.3, 2.1), 0.035, this.echo);
      this.nextBuoy += rand(24, 44);
    }
    while (this.nextHorn < until) {
      if (this.weather === 0) this.horn(Math.max(now, this.nextHorn));
      this.nextHorn += rand(70, 130);
    }
    while (this.nextGust < until) {
      const at = Math.max(now, this.nextGust);
      if (this.weather > 0) {
        this.wind.filter.frequency.setTargetAtTime(rand(300, 900), at, 1);
        this.wind.gain.gain.setTargetAtTime(rand(0.5, 1) * WIND * this.weather, at, 1.2);
      }
      this.nextGust += rand(2.5, 5);
    }
    while (this.nextRumble < until) {
      if (this.weather === 2) this.rumble(Math.max(now, this.nextRumble) + rand(0, 2));
      this.nextRumble += rand(9, 20);
    }
  }

  setWeather(level: Weather) {
    if (level === this.weather) return;
    this.weather = level;
    const now = this.ctx.currentTime;
    this.wind.gain.gain.setTargetAtTime([0, 0.5, 1][level] * WIND, now, 1.5);
    this.rain.gain.gain.setTargetAtTime([0, 0.3, 1][level] * RAIN, now, 1.5);
    this.deep.gain.gain.setTargetAtTime([1, 1.2, 1.6][level] * DEEP, now, 1.5);
    this.tone.frequency.setTargetAtTime([9000, 5000, 2800][level], now, 0.8);
  }

  private level() {
    const now = this.ctx.currentTime;
    this.tune.gain.setTargetAtTime(this.musicOn ? MUSIC * (this.ducked ? 0.3 : 1) : 0, now, 0.25);
    this.air.gain.setTargetAtTime(this.ducked ? 0.6 : 1, now, 0.25);
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    this.level();
  }

  /** Turns the background down so a voice or a big moment can be heard. */
  duck(on: boolean) {
    this.ducked = on;
    this.level();
  }

  jingle(kind: Jingle, to: AudioNode) {
    const { notes, gap, level } = JINGLES[kind];
    const at = this.ctx.currentTime + 0.02;
    notes.forEach((n, i) => this.note(this.mallet, midi(n), at + i * gap, level, to));
  }
}
