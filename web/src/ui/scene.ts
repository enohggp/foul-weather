// Cartoon scenes: a ship in the sun, a storm, a sinking and a happy arrival.
// Everything is drawn in code, so the game ships no image files.

const INK = "#3b2a1e";
const TAU = Math.PI * 2;

interface Weather {
  sky: [string, string];
  waves: [string, string, string, string];
  foam: string;
  rough: number;
  rain: number;
}

const SUNNY: Weather = {
  sky: ["#6fd3f7", "#d9f6ff"],
  waves: ["#7fe0ea", "#4cc9df", "#2fb2d4", "#1c97c4"],
  foam: "#ffffff",
  rough: 0.2,
  rain: 0,
};

const STORMY: Weather = {
  sky: ["#4b4f9a", "#8f8fc9"],
  waves: ["#6b7fc0", "#4f69b0", "#3b559e", "#2a4288"],
  foam: "#e6ecff",
  rough: 1,
  rain: 1,
};

export function surface(x: number, t: number, rough: number, layer: number, h: number): number {
  const amp = (h / 100) * (1.5 + 6.5 * rough) * (1 + layer * 0.16);
  return (
    h * (0.62 + layer * 0.07) +
    Math.sin(x * 0.0125 + t * 1.1 + layer * 1.9) * amp +
    Math.sin(x * 0.03 - t * 1.5 + layer * 0.8) * amp * 0.42
  );
}

function puff(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, fill: string, shade: string) {
  const parts: [number, number, number][] = [
    [-1, 0.18, 0.62],
    [-0.38, -0.24, 0.8],
    [0.32, -0.12, 0.72],
    [0.98, 0.2, 0.56],
  ];
  ctx.fillStyle = fill;
  for (const [dx, dy, r] of parts) {
    ctx.beginPath();
    ctx.arc(x + dx * s, y + dy * s, r * s, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.ellipse(x, y + 0.5 * s, 1.42 * s, 0.26 * s, 0, 0, TAU);
  ctx.fill();
}

function sun(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 0.12);
  ctx.fillStyle = "#ffd23f";
  ctx.strokeStyle = "#f2a63a";
  ctx.lineWidth = 3;
  for (let i = 0; i < 12; i++) {
    ctx.rotate(TAU / 12);
    ctx.beginPath();
    ctx.moveTo(r * 1.14, -r * 0.14);
    ctx.lineTo(r * 1.5, 0);
    ctx.lineTo(r * 1.14, r * 0.14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function angryCloud(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  puff(ctx, x, y, s, "#3f3f6e", "#2e2e55");
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.lineWidth = s * 0.08;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - s * 0.58, y - s * 0.22);
  ctx.lineTo(x - s * 0.18, y - s * 0.04);
  ctx.moveTo(x + s * 0.58, y - s * 0.22);
  ctx.lineTo(x + s * 0.18, y - s * 0.04);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x - s * 0.34, y + s * 0.1, s * 0.08, 0, TAU);
  ctx.arc(x + s * 0.34, y + s * 0.1, s * 0.08, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y + s * 0.42, s * 0.2, Math.PI, 0);
  ctx.stroke();
}

function skyScene(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, weather: Weather) {
  const g = ctx.createLinearGradient(0, 0, 0, h * 0.7);
  g.addColorStop(0, weather.sky[0]);
  g.addColorStop(1, weather.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const stormy = weather.rough > 0.5;
  if (!stormy) sun(ctx, w * 0.84, h * 0.2, h * 0.09, t);
  for (let i = 0; i < 4; i++) {
    const speed = 7 + i * 3 + weather.rough * 22;
    const x = ((i * 271 + t * speed) % (w + 300)) - 150;
    const y = h * (0.12 + (i % 3) * 0.1);
    const s = h * (0.06 + (i % 2) * 0.03);
    if (stormy) angryCloud(ctx, x, y, s * 1.5);
    else puff(ctx, x, y, s, "#ffffff", "rgba(180,225,245,0.7)");
  }
}

function waveLayer(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, weather: Weather, layer: number, color: string) {
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w + 8; x += 8) ctx.lineTo(x, surface(x, t, weather.rough, layer, h));
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  for (let x = 0; x <= w + 8; x += 8) {
    const y = surface(x, t, weather.rough, layer, h);
    if (x) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.strokeStyle = weather.foam;
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.stroke();
}

export interface ShipPose {
  x: number;
  y: number;
  angle?: number;
  scale: number;
  facing?: number;
  sail?: string;
  /** Second sail colour, drawn as stripes. */
  stripe?: string;
  t?: number;
  /** 0 is sound; 1 has a broken mast and a torn sail. */
  damage?: number;
}

/** A chunky little ship. Local drawing units are about 240 across. */
export function drawShip(ctx: CanvasRenderingContext2D, pose: ShipPose) {
  const { sail = "#ffffff", stripe = "#e8504a", t = 0, facing = 1, damage = 0, angle = 0 } = pose;
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(angle * facing);
  ctx.scale(pose.scale * facing, pose.scale);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;

  const puffOut = 16 + Math.sin(t * 1.6) * 4;

  // Mast.
  ctx.save();
  if (damage > 0.5) {
    ctx.translate(-6, -70);
    ctx.rotate(0.5 + damage * 0.7);
    ctx.translate(6, 70);
  }
  ctx.fillStyle = "#8b5a33";
  ctx.beginPath();
  ctx.roundRect(-13, -196, 13, 170, 6);
  ctx.fill();
  ctx.stroke();

  // Flag.
  ctx.fillStyle = stripe;
  ctx.beginPath();
  ctx.moveTo(-6, -196);
  for (let i = 0; i <= 5; i++) ctx.lineTo(-6 + i * 9, -196 + Math.sin(t * 5 + i) * 2.6);
  for (let i = 5; i >= 0; i--) ctx.lineTo(-6 + i * 9, -176 + Math.sin(t * 5 + i) * 2.6);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.lineWidth = 6;

  // Big sail.
  ctx.beginPath();
  ctx.moveTo(-70, -168);
  ctx.quadraticCurveTo(-6 + puffOut, -184, 58, -168);
  ctx.quadraticCurveTo(84 + puffOut, -112, 58, -60);
  if (damage > 0.3) {
    ctx.lineTo(36, -84);
    ctx.lineTo(22, -56);
    ctx.lineTo(0, -88);
    ctx.lineTo(-18, -54);
    ctx.lineTo(-40, -86);
    ctx.lineTo(-70, -60);
  } else {
    ctx.quadraticCurveTo(-6 + puffOut, -42, -70, -60);
  }
  ctx.quadraticCurveTo(-46 + puffOut, -112, -70, -168);
  ctx.closePath();
  ctx.fillStyle = sail;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = stripe;
  ctx.fillRect(-90, -146, 200, 24);
  ctx.fillRect(-90, -100, 200, 24);
  ctx.restore();
  ctx.stroke();
  ctx.restore();

  // Hull.
  ctx.beginPath();
  ctx.moveTo(-112, -44);
  ctx.quadraticCurveTo(-120, -26, -104, 6);
  ctx.quadraticCurveTo(-82, 42, 0, 42);
  ctx.quadraticCurveTo(84, 42, 112, 2);
  ctx.quadraticCurveTo(128, -22, 136, -56);
  ctx.quadraticCurveTo(112, -30, 84, -30);
  ctx.lineTo(-76, -30);
  ctx.quadraticCurveTo(-96, -30, -112, -44);
  ctx.closePath();
  ctx.fillStyle = "#b9773f";
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#d99a5b";
  ctx.fillRect(-140, -60, 290, 42);
  ctx.fillStyle = "#fff4dd";
  ctx.fillRect(-140, 2, 290, 9);
  ctx.restore();
  ctx.stroke();

  // Portholes.
  ctx.lineWidth = 4;
  for (const hole of [-58, -14, 30, 72]) {
    ctx.fillStyle = "#bdeeff";
    ctx.beginPath();
    ctx.arc(hole, -12, 9, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function lifeBits(ctx: CanvasRenderingContext2D, h: number, t: number, weather: Weather, life: number, origin: number) {
  for (let i = 0; i < 7; i++) {
    const x = origin + (i - 3) * (30 + life * 34) + Math.sin(i * 3.3) * 20;
    const y = surface(x, t, weather.rough, 0.3, h) - 4;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 2 + i * 1.7) * 0.4);
    ctx.globalAlpha = Math.min(1, life * 2.2);
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    if (i % 2 === 0) {
      ctx.fillStyle = "#b9773f";
      ctx.beginPath();
      ctx.ellipse(0, 0, 13, 15, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-12, -5);
      ctx.lineTo(12, -5);
      ctx.moveTo(-12, 5);
      ctx.lineTo(12, 5);
      ctx.stroke();
    } else {
      ctx.fillStyle = "#d99a5b";
      ctx.beginPath();
      ctx.roundRect(-14, -13, 28, 26, 4);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-14, -13);
      ctx.lineTo(14, 13);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function lightning(ctx: CanvasRenderingContext2D, x: number, h: number) {
  ctx.beginPath();
  const points: [number, number][] = [
    [0, 0],
    [-26, h * 0.18],
    [8, h * 0.2],
    [-22, h * 0.42],
    [16, h * 0.28],
    [-10, h * 0.26],
    [20, 0],
  ];
  points.forEach(([dx, y], i) => (i ? ctx.lineTo(x + dx, y + 30) : ctx.moveTo(x + dx, y + 30)));
  ctx.closePath();
  ctx.fillStyle = "#ffe66b";
  ctx.strokeStyle = "#f2a63a";
  ctx.lineWidth = 4;
  ctx.fill();
  ctx.stroke();
}

function rainFall(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  ctx.strokeStyle = "rgba(220,235,255,0.6)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = 0; i < 70; i++) {
    const seed = i * 7919;
    const x = ((seed % (w + 100)) - t * 160 + (w + 100) * 9) % (w + 100);
    const y = ((seed * 3) % h + t * 520) % h;
    ctx.moveTo(x, y);
    ctx.lineTo(x - 7, y + 18);
  }
  ctx.stroke();
}

const ease = (x: number) => x * x * (3 - 2 * x);
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));

function splash(ctx: CanvasRenderingContext2D, x: number, y: number, p: number) {
  if (p <= 0 || p >= 1) return;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#7fd6ee";
  ctx.lineWidth = 3;
  for (let i = 0; i < 14; i++) {
    const a = -Math.PI * (0.1 + (i / 13) * 0.8);
    const speed = 70 + (i % 4) * 44;
    const px = x + Math.cos(a) * speed * p;
    const py = y + Math.sin(a) * speed * p + 190 * p * p;
    ctx.beginPath();
    ctx.arc(px, py, 9 * (1 - p) + 3, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
}

/** Plays one frame of a ship being lost. `p` runs from 0 to 1. */
export function paintWreck(ctx: CanvasRenderingContext2D, w: number, h: number, seconds: number, p: number, sail: string, stripe: string) {
  const weather = STORMY;
  const t = seconds;
  const hit = clamp((p - 0.24) / 0.08);
  const shake = hit > 0 && hit < 1 ? Math.sin(hit * Math.PI * 8) * 8 : 0;
  ctx.save();
  ctx.translate(shake, shake * 0.4);
  skyScene(ctx, w, h, t, weather);

  const zap = Math.abs(p - 0.25) < 0.035 || Math.abs(p - 0.5) < 0.02;
  if (zap) {
    ctx.fillStyle = "rgba(255,255,220,0.45)";
    ctx.fillRect(0, 0, w, h);
    lightning(ctx, w * 0.46, h);
  }

  waveLayer(ctx, w, h, t, weather, -1.5, weather.waves[0]);
  waveLayer(ctx, w, h, t, weather, -0.6, weather.waves[1]);

  const scale = h / 430;
  const x = w * 0.46 + Math.sin(t * 0.7) * 8;
  const top = surface(x, t, weather.rough, 0, h);
  const pitch = Math.atan((surface(x + 70, t, weather.rough, 0, h) - surface(x - 70, t, weather.rough, 0, h)) / 140);
  const sink = ease(clamp((p - 0.36) / 0.5));
  const lean = ease(clamp((p - 0.3) / 0.4)) * 0.8;
  drawShip(ctx, {
    x,
    y: top + 8 + sink * h * 0.62,
    angle: pitch * 0.8 + lean,
    scale,
    t,
    sail,
    stripe,
    damage: clamp((p - 0.24) / 0.1),
  });

  if (sink > 0.1) {
    ctx.fillStyle = "rgba(255,255,255,0.86)";
    ctx.strokeStyle = "#7fd6ee";
    ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const life = (t * 0.7 + i * 0.137) % 1;
      const bx = x + Math.sin(i * 12.7) * 66 * scale + Math.sin(life * 9 + i) * 6;
      const by = top + 34 - life * 76;
      ctx.beginPath();
      ctx.arc(bx, by, 3 + (i % 4) * 1.5, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  }
  lifeBits(ctx, h, t, weather, clamp((p - 0.55) / 0.3), x);
  waveLayer(ctx, w, h, t, weather, 0.9, weather.waves[2]);
  splash(ctx, x, top, clamp((p - 0.42) / 0.3));
  waveLayer(ctx, w, h, t, weather, 1.8, weather.waves[3]);
  rainFall(ctx, w, h, t);
  ctx.restore();
}

function town(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const base = h * 0.64;
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.fillStyle = "#7ed957";
  ctx.beginPath();
  ctx.moveTo(-10, base + 30);
  ctx.quadraticCurveTo(w * 0.12, base - h * 0.2, w * 0.3, base - h * 0.04);
  ctx.quadraticCurveTo(w * 0.42, base, w * 0.48, base + 30);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const roofs = ["#e8504a", "#2d9cdb", "#f2a63a", "#b45bb0"];
  for (let i = 0; i < 5; i++) {
    const x = 20 + i * 62;
    const size = 40 + (i % 2) * 12;
    const y = base + 6 - size - Math.sin(i / 1.4) * 26;
    ctx.fillStyle = "#fff4dd";
    ctx.beginPath();
    ctx.roundRect(x, y, size, size + 16, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = roofs[i % roofs.length];
    ctx.beginPath();
    ctx.moveTo(x - 7, y + 2);
    ctx.lineTo(x + size / 2, y - 22);
    ctx.lineTo(x + size + 7, y + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#6fd3f7";
    ctx.beginPath();
    ctx.roundRect(x + size / 2 - 7, y + 10, 14, 14, 2);
    ctx.fill();
    ctx.stroke();
  }
  const lx = w * 0.42;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(lx - 20, base + 16);
  ctx.lineTo(lx - 11, base - h * 0.3);
  ctx.lineTo(lx + 11, base - h * 0.3);
  ctx.lineTo(lx + 20, base + 16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#e8504a";
  ctx.fillRect(lx - 15, base - h * 0.18, 30, 22);
  ctx.strokeRect(lx - 15, base - h * 0.18, 30, 22);
  ctx.fillStyle = "#ffd23f";
  ctx.fillRect(lx - 12, base - h * 0.36, 24, 20);
  ctx.strokeRect(lx - 12, base - h * 0.36, 24, 20);
}

function gull(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const flap = Math.sin(t * 6) * 7;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - 15, y - flap);
  ctx.quadraticCurveTo(x - 6, y - 7, x, y);
  ctx.quadraticCurveTo(x + 6, y - 7, x + 15, y - flap);
  ctx.stroke();
}

function coinFountain(ctx: CanvasRenderingContext2D, x: number, y: number, p: number) {
  for (let i = 0; i < 16; i++) {
    const life = (p * 2.2 + i * 0.09) % 1;
    const a = -Math.PI * (0.25 + (i / 15) * 0.5);
    const px = x + Math.cos(a) * 180 * life;
    const py = y + Math.sin(a) * 240 * life + 300 * life * life;
    ctx.fillStyle = "#ffc531";
    ctx.strokeStyle = "#a8690f";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(px, py, 10 * Math.abs(Math.cos(life * 14)) + 2, 10, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
}

/** Plays one frame of a ship coming home safe. */
export function paintHome(ctx: CanvasRenderingContext2D, w: number, h: number, seconds: number, p: number, sail: string, stripe: string) {
  const weather = SUNNY;
  const t = seconds;
  skyScene(ctx, w, h, t, weather);
  town(ctx, w, h);
  waveLayer(ctx, w, h, t, weather, -1, weather.waves[1]);
  const scale = h / 520;
  const x = w * (1.05 - ease(clamp(p * 1.3)) * 0.35);
  const top = surface(x, t, weather.rough, 0, h);
  drawShip(ctx, { x, y: top + 8, angle: Math.sin(t * 1.4) * 0.04, scale, facing: -1, t, sail, stripe });
  waveLayer(ctx, w, h, t, weather, 0.8, weather.waves[2]);
  waveLayer(ctx, w, h, t, weather, 1.7, weather.waves[3]);
  if (p > 0.5) coinFountain(ctx, x, top - 40, p);
  gull(ctx, w * 0.3 + Math.sin(t) * 40, h * 0.17, t);
  gull(ctx, w * 0.56 + Math.sin(t + 2) * 30, h * 0.11, t + 1);
}

/** The endless sunny scene behind the title. */
export function paintTitle(ctx: CanvasRenderingContext2D, w: number, h: number, seconds: number) {
  const weather = SUNNY;
  const t = seconds;
  skyScene(ctx, w, h, t, weather);
  waveLayer(ctx, w, h, t, weather, -1.5, weather.waves[0]);
  waveLayer(ctx, w, h, t, weather, -0.6, weather.waves[1]);
  const scale = Math.max(0.55, h / 700);
  const x = w * 0.2 + Math.sin(t * 0.3) * 30;
  const top = surface(x, t, weather.rough, 0, h);
  const pitch = Math.atan((surface(x + 70, t, weather.rough, 0, h) - surface(x - 70, t, weather.rough, 0, h)) / 140);
  drawShip(ctx, { x, y: top + 8, angle: pitch, scale, t });
  const x2 = w * 0.84 + Math.sin(t * 0.26) * 24;
  const top2 = surface(x2, t, weather.rough, -0.6, h);
  drawShip(ctx, { x: x2, y: top2 + 4, scale: scale * 0.6, facing: -1, t: t + 2, sail: "#ffe6a8", stripe: "#2d9cdb" });
  waveLayer(ctx, w, h, t, weather, 0.8, weather.waves[2]);
  waveLayer(ctx, w, h, t, weather, 1.7, weather.waves[3]);
  gull(ctx, w * 0.44 + Math.sin(t * 0.5) * 60, h * 0.2, t);
  gull(ctx, w * 0.62 + Math.sin(t * 0.7) * 50, h * 0.13, t + 1);
}

/** Each captain's sail colours, shared by the map and the scenes. */
export const SAILS: [string, string][] = [
  ["#ffffff", "#2d9cdb"],
  ["#fff4dd", "#e8504a"],
  ["#ffe6c7", "#3f8f5f"],
  ["#ffffff", "#3d5fc4"],
  ["#fbe3f7", "#b45bb0"],
  ["#eaf7d8", "#6aa84f"],
  ["#fff4dd", "#f2a63a"],
  ["#e9e9ef", "#46505e"],
  ["#e3fbf7", "#2fae9e"],
  ["#fff8e0", "#e36a44"],
  ["#e6e7fb", "#5a5fc4"],
  ["#ffe9e0", "#c43a3a"],
];
