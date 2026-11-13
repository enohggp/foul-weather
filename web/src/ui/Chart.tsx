// The harbor map: a bright little world of islands, ships and weather.

import { useEffect, useRef, useState } from "react";
import { cargo, fullName, place, shopName } from "../cast";
import type { Driver, FleetShip, House, View, Voyage } from "../types";
import { crowns } from "../words";
import { AWNINGS, Character, YOUR_AWNING } from "./art";
import { drawShip, SAILS } from "./scene";

const W = 1000;
const H = 880;
const INK = "#3b2a1e";
const TAU = Math.PI * 2;

export const PORTS: [number, number][] = [
  [196, 452],
  [452, 136],
  [622, 356],
  [438, 760],
  [824, 184],
  [832, 628],
];

const BENDS: [number, number][] = [
  [-30, -36],
  [14, -50],
  [-52, 34],
  [-30, -70],
  [40, 70],
];

/** Where each rival's shop stands in Merrow Town. */
const SHOPS: [number, number][] = [
  [70, 300],
  [128, 352],
  [60, 196],
  [66, 610],
  [126, 560],
  [58, 716],
  [122, 240],
  [124, 668],
  [40, 450],
  [30, 540],
];
const YOUR_SHOP: [number, number] = [116, 452];

/** The town game shows this much extra land to the left of the usual map. */
const TOWN_LEFT = 200;

/** Where each building stands, by kind and then by how many of that kind you own. */
export const TOWN_PLOTS: [number, number][][] = [
  [[10, 390], [-70, 390], [-150, 530], [-150, 310], [-150, 610]], // Cottages
  [[90, 390], [-150, 390], [-70, 610]], // Fish Stalls
  [[-70, 530], [-70, 230]], // Bakeries
  [[10, 310], [-70, 690]], // Inns
  [[10, 230]], // Market Hall
  [[90, 530], [90, 310], [90, 230]], // Docks
  [[10, 530], [-150, 690]], // Taverns
  [[-70, 310], [-150, 230]], // Warehouses
  [[90, 610]], // Lighthouse
  [[10, 610]], // Shipyard
  [[10, 690]], // Insurance Office
  [[90, 690]], // Pirate Cove
];

/** The sandy streets and building pads of the player's town. */
function townGround(ctx: CanvasRenderingContext2D) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const road = (points: [number, number][], width: number) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = "#d9b273";
    ctx.lineWidth = width + 6;
    ctx.stroke();
    ctx.strokeStyle = "#f5dca6";
    ctx.lineWidth = width;
    ctx.stroke();
  };
  road([[-190, 452], [150, 452]], 30);
  road([[50, 452], [50, 180]], 20);
  road([[50, 452], [50, 720]], 20);
  road([[-110, 452], [-110, 180]], 20);
  road([[-110, 452], [-110, 720]], 20);
  for (const kind of TOWN_PLOTS) {
    for (const [x, y] of kind) {
      ctx.beginPath();
      ctx.ellipse(x, y + 2, 35, 13, 0, 0, TAU);
      ctx.fillStyle = "rgba(92,187,69,0.75)";
      ctx.fill();
    }
  }
}

interface Point {
  x: number;
  y: number;
}

export interface Fit {
  scale: number;
  x: number;
  y: number;
}

function curve(lane: number, t: number, side = 0): Point & { dx: number; dy: number } {
  const [ax, ay] = PORTS[0];
  const [bx, by] = PORTS[lane + 1];
  const cx = (ax + bx) / 2 + BENDS[lane][0];
  const cy = (ay + by) / 2 + BENDS[lane][1];
  const u = 1 - t;
  const x = u * u * ax + 2 * u * t * cx + t * t * bx;
  const y = u * u * ay + 2 * u * t * cy + t * t * by;
  const dx = 2 * u * (cx - ax) + 2 * t * (bx - cx);
  const dy = 2 * u * (cy - ay) + 2 * t * (by - cy);
  const length = Math.hypot(dx, dy) || 1;
  return { x: x - (dy / length) * side, y: y + (dx / length) * side, dx: dx / length, dy: dy / length };
}

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function coast(cx: number, cy: number, rx: number, ry: number, seed: number, points = 40): Point[] {
  const r = seeded(seed);
  const phases = [r() * 6.28, r() * 6.28];
  const out: Point[] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * TAU;
    const wobble = 1 + 0.12 * Math.sin(a * 3 + phases[0]) + 0.06 * Math.sin(a * 5 + phases[1]);
    out.push({ x: cx + Math.cos(a) * rx * wobble, y: cy + Math.sin(a) * ry * wobble });
  }
  return out;
}

function mainland(push: number): Point[] {
  const [top, bottom, left] = [-700, H + 700, -900];
  const out: Point[] = [{ x: left, y: top }];
  const steps = 90;
  for (let i = 0; i <= steps; i++) {
    const y = top + (i / steps) * (bottom - top);
    const v = y / H;
    const bay = -30 * Math.exp(-(((y - 452) / 80) ** 2));
    out.push({ x: 172 + bay + 26 * Math.sin(v * 3.1 + 0.4) + 10 * Math.sin(v * 9 + 1) + push, y });
  }
  out.push({ x: left, y: bottom });
  return out;
}

function smooth(ctx: CanvasRenderingContext2D, points: Point[]) {
  ctx.beginPath();
  points.forEach((p, i) => {
    const next = points[(i + 1) % points.length];
    const mx = (p.x + next.x) / 2;
    const my = (p.y + next.y) / 2;
    if (i === 0) ctx.moveTo(mx, my);
    else ctx.quadraticCurveTo(p.x, p.y, mx, my);
  });
  ctx.closePath();
}

function land(ctx: CanvasRenderingContext2D, sand: Point[], grass: Point[], grassColor: string, edge: string) {
  ctx.lineJoin = "round";
  smooth(ctx, sand);
  ctx.lineWidth = 34;
  ctx.strokeStyle = "rgba(165,240,238,0.55)";
  ctx.stroke();
  ctx.lineWidth = 16;
  ctx.strokeStyle = "rgba(235,255,250,0.85)";
  ctx.stroke();
  smooth(ctx, sand);
  ctx.fillStyle = "#ffe3a1";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#e6b866";
  ctx.stroke();
  smooth(ctx, grass);
  ctx.fillStyle = grassColor;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = edge;
  ctx.stroke();
}

function shrink(points: Point[], cx: number, cy: number, by: number) {
  return points.map((p) => ({ x: cx + (p.x - cx) * by, y: cy + (p.y - cy) * by }));
}

function outlined(ctx: CanvasRenderingContext2D, fill: string, width = 2.5) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = width;
  ctx.strokeStyle = INK;
  ctx.lineJoin = "round";
  ctx.stroke();
}

function tree(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color = "#4fb84a") {
  ctx.beginPath();
  ctx.roundRect(x - 2.5 * s, y - 8 * s, 5 * s, 10 * s, 1);
  outlined(ctx, "#8b5a33", 2);
  ctx.beginPath();
  ctx.arc(x - 6 * s, y - 13 * s, 7.5 * s, 0, TAU);
  ctx.moveTo(x + 13.5 * s, y - 13 * s);
  ctx.arc(x + 6 * s, y - 13 * s, 7.5 * s, 0, TAU);
  ctx.moveTo(x + 9 * s, y - 20 * s);
  ctx.arc(x, y - 20 * s, 9 * s, 0, TAU);
  outlined(ctx, color, 2.2);
}

function pine(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.roundRect(x - 2.5 * s, y - 6 * s, 5 * s, 8 * s, 1);
  outlined(ctx, "#8b5a33", 2);
  for (let i = 0; i < 3; i++) {
    const top = y - (16 + i * 9) * s;
    ctx.beginPath();
    ctx.moveTo(x - (13 - i * 3) * s, top + 12 * s);
    ctx.lineTo(x, top - 3 * s);
    ctx.lineTo(x + (13 - i * 3) * s, top + 12 * s);
    ctx.closePath();
    outlined(ctx, i === 2 ? "#3f9a58" : "#2f8450", 2);
  }
}

function palm(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6 * s;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x - 4 * s, y - 16 * s, x + 4 * s, y - 28 * s);
  ctx.stroke();
  ctx.strokeStyle = "#a9743f";
  ctx.lineWidth = 3.4 * s;
  ctx.stroke();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI * (0.05 + i * 0.225);
    const [ox, oy] = [x + 4 * s, y - 28 * s];
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.quadraticCurveTo(ox + Math.cos(a) * 12 * s, oy + Math.sin(a) * 16 * s, ox + Math.cos(a) * 22 * s, oy + 4 * s + Math.sin(a) * 8 * s);
    ctx.quadraticCurveTo(ox + Math.cos(a) * 10 * s, oy + Math.sin(a) * 6 * s, ox, oy);
    outlined(ctx, "#4fb84a", 1.6);
  }
}

function house(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, wall: string, roof: string) {
  ctx.beginPath();
  ctx.roundRect(x - 13 * s, y - 20 * s, 26 * s, 20 * s, 2);
  outlined(ctx, wall);
  ctx.beginPath();
  ctx.moveTo(x - 17 * s, y - 19 * s);
  ctx.lineTo(x, y - 34 * s);
  ctx.lineTo(x + 17 * s, y - 19 * s);
  ctx.closePath();
  outlined(ctx, roof);
  ctx.beginPath();
  ctx.roundRect(x - 4 * s, y - 11 * s, 8 * s, 11 * s, 1);
  outlined(ctx, "#8b5a33", 1.8);
}

function lighthouse(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.beginPath();
  ctx.moveTo(x - 11, y);
  ctx.lineTo(x - 6, y - 50);
  ctx.lineTo(x + 6, y - 50);
  ctx.lineTo(x + 11, y);
  ctx.closePath();
  outlined(ctx, "#ffffff");
  ctx.fillStyle = "#e8504a";
  ctx.fillRect(x - 8.5, y - 36, 17, 11);
  ctx.fillRect(x - 10, y - 16, 20, 11);
  ctx.beginPath();
  ctx.roundRect(x - 8, y - 62, 16, 13, 2);
  outlined(ctx, "#ffd23f");
  ctx.beginPath();
  ctx.moveTo(x - 10, y - 62);
  ctx.lineTo(x, y - 72);
  ctx.lineTo(x + 10, y - 62);
  ctx.closePath();
  outlined(ctx, "#e8504a");
}

function plaque(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.font = `600 17px "Fredoka", "Trebuchet MS", sans-serif`;
  const width = ctx.measureText(text).width + 22;
  ctx.beginPath();
  ctx.roundRect(x - width / 2, y - 14, width, 27, 9);
  outlined(ctx, "#fff8e8", 2.5);
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y + 0.5);
  ctx.textBaseline = "alphabetic";
}

function paintWorld(ctx: CanvasRenderingContext2D, townMode: boolean) {
  const sea = ctx.createLinearGradient(0, -300, 0, H + 300);
  sea.addColorStop(0, "#5fd8e8");
  sea.addColorStop(1, "#2bb0d6");
  ctx.fillStyle = sea;
  ctx.fillRect(-1400, -1400, W + 2800, H + 2800);

  // Sparkles on the water.
  const r = seeded(9);
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  for (let i = 0; i < 170; i++) {
    const x = 220 + r() * 1100;
    const y = -240 + r() * 1360;
    ctx.beginPath();
    ctx.moveTo(x - 9, y);
    ctx.quadraticCurveTo(x - 4, y - 5, x, y);
    ctx.quadraticCurveTo(x + 4, y + 5, x + 9, y);
    ctx.stroke();
  }

  // Merrow Town and the mainland.
  land(ctx, mainland(0), mainland(-22), "#86df5c", "#5cbb45");
  const trees = seeded(5);
  for (let i = 0; i < 46; i++) {
    const x = -220 + trees() * 330;
    const y = -220 + trees() * 1330;
    if (Math.abs(y - 452) < 320 && x > (townMode ? -200 : -30)) continue;
    tree(ctx, x, y, 1 + trees() * 0.4, i % 3 ? "#4fb84a" : "#3fa84a");
  }
  (
    [
      [18, 372, "#fff4dd", "#e8504a"],
      [28, 520, "#ffe6c7", "#2d9cdb"],
      [-16, 460, "#fff4dd", "#f2a63a"],
      [-10, 300, "#ffe6c7", "#b45bb0"],
      [-8, 620, "#fff4dd", "#e8504a"],
    ] as [number, number, string, string][]
  ).forEach(([x, y, a, b]) => {
    if (!townMode) house(ctx, x, y, 1.05, a, b);
  });

  if (townMode) townGround(ctx);

  // The pier.
  ctx.beginPath();
  ctx.roundRect(142, 442, 62, 18, 3);
  outlined(ctx, "#b9773f");
  ctx.strokeStyle = "rgba(59,42,30,0.5)";
  ctx.lineWidth = 2;
  for (let x = 152; x < 204; x += 11) {
    ctx.beginPath();
    ctx.moveTo(x, 443);
    ctx.lineTo(x, 459);
    ctx.stroke();
  }
  lighthouse(ctx, 176, 410);

  // Wheat Island.
  const wheat = coast(478, 96, 84, 56, 21);
  land(ctx, wheat, shrink(wheat, 478, 96, 0.8), "#a5e46a", "#7fc452");
  [
    [440, 90],
    [486, 72],
    [528, 96],
    [474, 118],
  ].forEach(([x, y]) => {
    ctx.beginPath();
    ctx.roundRect(x - 22, y - 12, 44, 24, 6);
    outlined(ctx, "#ffd23f", 2);
    ctx.strokeStyle = "#d99a1e";
    ctx.lineWidth = 2;
    for (let i = -16; i <= 16; i += 8) {
      ctx.beginPath();
      ctx.moveTo(x + i, y - 8);
      ctx.lineTo(x + i, y + 8);
      ctx.stroke();
    }
  });

  // Timber Island.
  const wood = coast(664, 328, 62, 48, 22);
  land(ctx, wood, shrink(wood, 664, 328, 0.78), "#6fce5c", "#50ad48");
  [
    [640, 330],
    [664, 318],
    [690, 336],
    [652, 354],
    [680, 362],
    [710, 318],
  ].forEach(([x, y]) => pine(ctx, x, y, 0.95));

  // Iron Volcano.
  const rock = coast(418, 800, 92, 50, 23);
  land(ctx, rock, shrink(rock, 418, 800, 0.8), "#b6a79b", "#8f8074");
  ctx.beginPath();
  ctx.moveTo(366, 830);
  ctx.lineTo(404, 764);
  ctx.quadraticCurveTo(418, 756, 432, 764);
  ctx.lineTo(474, 830);
  ctx.closePath();
  outlined(ctx, "#7d6a60");
  ctx.beginPath();
  ctx.moveTo(404, 764);
  ctx.quadraticCurveTo(418, 776, 432, 764);
  ctx.lineTo(446, 788);
  ctx.quadraticCurveTo(436, 780, 428, 800);
  ctx.quadraticCurveTo(420, 776, 410, 794);
  ctx.quadraticCurveTo(402, 778, 392, 786);
  ctx.closePath();
  outlined(ctx, "#ff7b39", 2);

  // Spice Island.
  const spice = coast(868, 150, 82, 58, 24);
  land(ctx, spice, shrink(spice, 868, 150, 0.8), "#a5e46a", "#7fc452");
  [
    [826, 152],
    [860, 128],
    [900, 146],
    [870, 176],
    [916, 176],
  ].forEach(([x, y]) => palm(ctx, x, y, 1.05));

  // Silk Palace.
  const silk = coast(880, 664, 78, 72, 25);
  land(ctx, silk, shrink(silk, 880, 664, 0.8), "#c9eb8c", "#9ccb62");
  ctx.beginPath();
  ctx.roundRect(838, 650, 84, 42, 3);
  outlined(ctx, "#ffe6f2");
  for (const [x, size] of [
    [880, 26],
    [846, 15],
    [914, 15],
  ]) {
    ctx.beginPath();
    ctx.arc(x, 650, size, Math.PI, 0);
    ctx.quadraticCurveTo(x + size * 0.2, 650 - size * 1.1, x, 650 - size * 1.7);
    ctx.quadraticCurveTo(x - size * 0.2, 650 - size * 1.1, x - size, 650);
    outlined(ctx, "#e36ba4");
  }
  ctx.beginPath();
  ctx.roundRect(872, 668, 16, 24, [8, 8, 0, 0]);
  outlined(ctx, "#8b5a33", 2);

  // Little islands.
  for (const [x, y, rx, ry, seed] of [
    [742, 508, 24, 16, 26],
    [330, 262, 18, 12, 27],
    [952, 402, 28, 20, 28],
    [296, 646, 20, 11, 29],
  ]) {
    const isle = coast(x, y, rx, ry, seed);
    land(ctx, isle, shrink(isle, x, y, 0.66), "#a5e46a", "#7fc452");
    palm(ctx, x, y + 2, 0.7);
  }

  // Names, each saying what the island makes.
  if (!townMode) plaque(ctx, "Merrow Town", 108, 512);
  plaque(ctx, "Wheat Island", 470, 176);
  plaque(ctx, "Timber Island", 664, 396);
  plaque(ctx, "Iron Volcano", 430, 842);
  plaque(ctx, "Spice Island", 868, 228);
  plaque(ctx, "Silk Palace", 880, 748);
}

function shop(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, roof: string, closed: boolean, you: boolean) {
  ctx.beginPath();
  ctx.roundRect(x - 22 * s, y - 28 * s, 44 * s, 28 * s, 3);
  outlined(ctx, closed ? "#cfc6ba" : "#fff4dd");
  ctx.beginPath();
  ctx.moveTo(x - 27 * s, y - 27 * s);
  ctx.lineTo(x - 20 * s, y - 42 * s);
  ctx.lineTo(x + 20 * s, y - 42 * s);
  ctx.lineTo(x + 27 * s, y - 27 * s);
  ctx.closePath();
  outlined(ctx, closed ? "#9a9288" : roof);
  // Striped awning.
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  for (let i = -2; i <= 1; i += 2) ctx.fillRect(x + i * 11 * s, y - 41 * s, 9 * s, 13 * s);
  ctx.beginPath();
  ctx.roundRect(x - 6 * s, y - 17 * s, 12 * s, 17 * s, 2);
  outlined(ctx, "#8b5a33", 2);
  if (closed) {
    ctx.save();
    ctx.translate(x, y - 22 * s);
    ctx.rotate(-0.16);
    ctx.beginPath();
    ctx.roundRect(-26, -9, 52, 18, 3);
    outlined(ctx, "#e8504a", 2);
    ctx.fillStyle = "#fff";
    ctx.font = `700 12px "Fredoka", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("CLOSED", 0, 1);
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }
  if (you) {
    ctx.beginPath();
    ctx.roundRect(x - 2, y - 66 * s, 4, 26 * s, 2);
    outlined(ctx, "#8b5a33", 1.5);
    ctx.beginPath();
    ctx.moveTo(x + 2, y - 66 * s);
    ctx.lineTo(x + 24, y - 59 * s);
    ctx.lineTo(x + 2, y - 52 * s);
    ctx.closePath();
    outlined(ctx, "#ffc531", 2);
  }
}

function stormCloud(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, active: boolean) {
  const bob = Math.sin(t * 2) * 3;
  ctx.save();
  ctx.translate(x, y + bob);
  if (active) {
    ctx.strokeStyle = "rgba(235,245,255,0.8)";
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const dx = -38 * s + (i * 76 * s) / 11;
      const fall = ((t * 90 + i * 37) % 44) * s;
      ctx.moveTo(dx, 14 * s + fall);
      ctx.lineTo(dx - 3, 24 * s + fall);
    }
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(-26 * s, 2 * s, 18 * s, 0, TAU);
  ctx.moveTo(25 * s, -8 * s);
  ctx.arc(0, -8 * s, 25 * s, 0, TAU);
  ctx.moveTo(45 * s, 2 * s);
  ctx.arc(26 * s, 2 * s, 19 * s, 0, TAU);
  ctx.fillStyle = active ? "#4a4a7e" : "rgba(92,96,146,0.86)";
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 10 * s, 44 * s, 13 * s, 0, 0, TAU);
  ctx.fill();
  // An angry little face.
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.lineWidth = 3.2 * s;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-17 * s, -12 * s);
  ctx.lineTo(-6 * s, -6 * s);
  ctx.moveTo(17 * s, -12 * s);
  ctx.lineTo(6 * s, -6 * s);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-11 * s, 0, 3.4 * s, 0, TAU);
  ctx.moveTo(14.4 * s, 0);
  ctx.arc(11 * s, 0, 3.4 * s, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 11 * s, 6 * s, Math.PI, 0);
  ctx.stroke();
  if (active && Math.sin(t * 7 + x) > 0.8) {
    ctx.beginPath();
    ctx.moveTo(4 * s, 16 * s);
    ctx.lineTo(-8 * s, 34 * s);
    ctx.lineTo(1 * s, 34 * s);
    ctx.lineTo(-7 * s, 54 * s);
    ctx.lineTo(13 * s, 28 * s);
    ctx.lineTo(4 * s, 28 * s);
    ctx.lineTo(12 * s, 16 * s);
    ctx.closePath();
    ctx.fillStyle = "#ffe66b";
    ctx.fill();
    ctx.strokeStyle = "#f2a63a";
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }
  ctx.restore();
}

function decorations(ctx: CanvasRenderingContext2D, built: string[], t: number) {
  if (built.includes("flags")) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(84, 412);
    ctx.quadraticCurveTo(116, 424, 150, 408);
    ctx.stroke();
    const colors = ["#e8504a", "#ffd23f", "#2d9cdb", "#2fae6e"];
    for (let i = 0; i < 7; i++) {
      const u = (i + 0.5) / 7;
      const x = 84 + u * 66;
      const y = 412 + Math.sin(u * Math.PI) * 9;
      ctx.beginPath();
      ctx.moveTo(x - 4, y);
      ctx.lineTo(x + 4, y);
      ctx.lineTo(x, y + 9);
      ctx.closePath();
      ctx.fillStyle = colors[i % 4];
      ctx.fill();
    }
  }
  if (built.includes("flowers")) {
    const colors = ["#ff6b9d", "#ffd23f", "#b45bb0"];
    for (let i = 0; i < 10; i++) {
      const x = 10 + (i % 5) * 13;
      const y = 652 + Math.floor(i / 5) * 13;
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, TAU);
      outlined(ctx, colors[i % 3], 1.5);
    }
  }
  if (built.includes("fountain")) {
    ctx.beginPath();
    ctx.ellipse(52, 462, 21, 10, 0, 0, TAU);
    outlined(ctx, "#b6c7d3");
    ctx.beginPath();
    ctx.ellipse(52, 461, 15, 6.5, 0, 0, TAU);
    ctx.fillStyle = "#6fd3f7";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.4;
    for (let i = 0; i < 3; i++) {
      const lift = 18 + Math.sin(t * 5 + i) * 4;
      ctx.beginPath();
      ctx.moveTo(52, 460);
      ctx.quadraticCurveTo(52 + (i - 1) * 9, 460 - lift, 52 + (i - 1) * 16, 460);
      ctx.stroke();
    }
  }
  if (built.includes("statue")) {
    ctx.beginPath();
    ctx.roundRect(46, 392, 24, 24, 3);
    outlined(ctx, "#cfc6ba");
    ctx.beginPath();
    ctx.ellipse(58, 382, 10, 13, 0, 0, TAU);
    outlined(ctx, "#ffc531");
    ctx.beginPath();
    ctx.arc(62, 368, 8, 0, TAU);
    outlined(ctx, "#ffc531");
  }
  if (built.includes("wheel")) {
    ctx.save();
    ctx.translate(134, 196);
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.moveTo(-14, 30);
    ctx.lineTo(0, 0);
    ctx.lineTo(14, 30);
    ctx.stroke();
    ctx.rotate(t * 0.5);
    ctx.beginPath();
    ctx.arc(0, 0, 25, 0, TAU);
    ctx.stroke();
    const colors = ["#e8504a", "#ffd23f", "#2d9cdb", "#2fae6e", "#b45bb0", "#f2a63a"];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 25, Math.sin(a) * 25);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 25, Math.sin(a) * 25, 5.5, 0, TAU);
      outlined(ctx, colors[i], 2);
    }
    ctx.restore();
  }
}

interface Wreck {
  x: number;
  y: number;
  born: number;
  mine: boolean;
  captain: number;
}

interface Hover {
  x: number;
  y: number;
  voyage?: Voyage;
  port?: number;
  house?: House;
  fleet?: FleetShip;
}

interface Props {
  view: View;
  driver: Driver;
  flash: number;
  built: string[];
  /** Screen space kept clear on the left for the dock and at the top for the bar. */
  inset: { left: number; top: number; bottom: number };
  level: number;
  onFit: (fit: Fit) => void;
  /** Set when the player is a captain: the ship with the gold ring. */
  myCaptain?: number;
  /** The town game: draws towns' ships and the waves, and leaves the land free to build on. */
  townMode?: boolean;
  /** A rival ship on the map was tapped. */
  onRival?: (ship: FleetShip) => void;
  /** What each town has just said, shown over its ship. */
  speech?: Map<number, { text: string; until: number }>;
}

/** How big each class of ship looks on the map. */
const CLASS_SCALE = [0.72, 0.92, 1.1, 1.32];

function waterColour(swell: number) {
  if (swell >= 75) return "rgba(235,70,60,0.95)";
  if (swell >= 55) return "rgba(255,160,50,0.95)";
  return "rgba(255,255,255,0.85)";
}

export default function Chart({ view, driver, flash, built, level, inset, onFit, myCaptain, townMode = false, onRival, speech }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ view, built, level, inset, myCaptain, townMode, onRival, speech });
  const flashAt = useRef(0);
  const refit = useRef<() => void>(() => undefined);
  const [hover, setHover] = useState<Hover | null>(null);
  latest.current = { view, built, level, inset, myCaptain, townMode, onRival, speech };

  useEffect(() => {
    if (flash) flashAt.current = performance.now();
  }, [flash]);

  // The space kept clear can change after the map first sizes itself.
  useEffect(() => refit.current(), [inset]);

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d")!;
    const world = document.createElement("canvas");
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let dpr = 1;
    let frame = 0;
    let lastSeq = latest.current.view.seq;
    let boats = 1;
    const wrecks: Wreck[] = [];
    const ripples: { x: number; y: number; born: number }[] = [];
    const lastPlace = new Map<number, Point>();
    const drawn: { x: number; y: number; voyage: Voyage }[] = [];
    const drawnFleet: { x: number; y: number; ship: FleetShip }[] = [];
    const lastShip = new Map<number, FleetShip>();
    const homers: { x: number; y: number; born: number; ship: FleetShip }[] = [];

    const resize = () => {
      if (!host.current) return;
      const box = host.current.getBoundingClientRect();
      const { left, top, bottom } = latest.current.inset;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      el.width = Math.max(1, Math.round(box.width * dpr));
      el.height = Math.max(1, Math.round(box.height * dpr));
      el.style.width = `${box.width}px`;
      el.style.height = `${box.height}px`;
      const roomW = box.width - left;
      const roomH = box.height - top - bottom;
      const extra = latest.current.townMode ? TOWN_LEFT : 0;
      scale = Math.min(roomW / (W + extra), roomH / H);
      offsetX = left + (roomW - (W + extra) * scale) / 2 + extra * scale;
      offsetY = top + (roomH - H * scale) / 2;
      boats = Math.max(0.22, 0.19 / Math.pow(scale, 0.6));
      world.width = el.width;
      world.height = el.height;
      const g = world.getContext("2d")!;
      g.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
      paintWorld(g, latest.current.townMode);
      onFit({ scale, x: offsetX, y: offsetY });
    };

    refit.current = resize;
    const observer = new ResizeObserver(resize);
    observer.observe(host.current!);
    resize();
    void document.fonts?.ready.then(resize);

    const render = (now: number) => {
      frame = requestAnimationFrame(render);
      const { view: v, built: decor, level: rank, myCaptain: captain, townMode: towny } = latest.current;
      const t = now / 1000;
      const length = driver.watchLength() || v.watch_ms;
      const running = driver.watchLength() > 0;
      const into = running ? Math.min(1, (now - driver.watchStartedAt()) / length) : 0;
      const clock = v.watch + into;
      const you = v.houses.find((h) => h.you);
      const mine = new Set(v.positions.filter((p) => you && p.writer === you.id).map((p) => p.voyage));
      for (const voyage of v.voyages) if (voyage.captain === captain) mine.add(voyage.id);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(world, 0, 0);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);

      // Sea routes.
      v.lanes.forEach((lane) => {
        ctx.beginPath();
        for (let i = 0; i <= 40; i++) {
          const p = curve(lane.id, i / 40);
          if (i) ctx.lineTo(p.x, p.y);
          else ctx.moveTo(p.x, p.y);
        }
        ctx.setLineDash([3, 11]);
        ctx.lineCap = "round";
        ctx.lineWidth = 3.4;
        const stormy = v.storms.some((s) => s.lanes.includes(lane.id));
        ctx.strokeStyle = stormy ? "rgba(235,70,60,0.95)" : towny ? waterColour(lane.swell) : "rgba(255,255,255,0.85)";
        ctx.stroke();
        ctx.setLineDash([]);
        // Bigger waves when the sea is rough.
        const marks = towny ? Math.floor(lane.swell / 9) : Math.floor(lane.sea / 16);
        const tall = towny ? 6 + Math.max(0, lane.swell - 30) / 6 : 6;
        const speed = towny && lane.swell >= 55 ? 4 : 1.7;
        ctx.strokeStyle = towny && lane.swell >= 75 ? "rgba(255,225,220,0.95)" : "rgba(255,255,255,0.75)";
        ctx.lineWidth = towny && lane.swell >= 55 ? 3 : 2.2;
        for (let i = 0; i < marks; i++) {
          const u = 0.14 + (0.72 * (i + 0.5)) / marks;
          const p = curve(lane.id, u, i % 2 ? 15 : -15);
          const lift = Math.sin(t * speed + i * 1.6) * (tall / 2.8);
          const wide = tall * 1.5;
          ctx.beginPath();
          ctx.moveTo(p.x - wide, p.y + lift);
          ctx.quadraticCurveTo(p.x - wide / 2, p.y - tall + lift, p.x, p.y + lift);
          ctx.quadraticCurveTo(p.x + wide / 2, p.y - tall + lift, p.x + wide, p.y + lift);
          ctx.stroke();
        }
        if (towny && lane.swell >= 55) {
          // A word on the water, so nobody has to decode the colours.
          const wild = lane.swell >= 75;
          const spot = curve(lane.id, 0.56, 34);
          const label = wild ? "WILD!" : "Rough";
          const grow = wild ? 1 + Math.sin(t * 6) * 0.08 : 1;
          ctx.font = `700 ${Math.round(19 * grow)}px "Fredoka", sans-serif`;
          ctx.textAlign = "center";
          ctx.lineJoin = "round";
          ctx.lineWidth = 6;
          ctx.strokeStyle = "#fff";
          ctx.strokeText(label, spot.x, spot.y);
          ctx.fillStyle = wild ? "#d13a2e" : "#d9791a";
          ctx.fillText(label, spot.x, spot.y);
        }
      });

      // Merrow's shops. A failed rival's shop closes for everyone to see.
      if (!towny) {
        const rivals = v.houses.filter((h) => !h.you).slice(0, SHOPS.length);
        rivals.forEach((h, i) => {
          const [x, y] = SHOPS[i];
          shop(ctx, x, y, 0.9, AWNINGS[i % AWNINGS.length], !h.active, false);
        });
        // Your shop grows with you.
        if (captain === undefined) {
          shop(ctx, YOUR_SHOP[0], YOUR_SHOP[1], 1.14 + Math.min(rank, 8) * 0.06, YOUR_AWNING, you ? !you.active : false, true);
        }
        decorations(ctx, decor, t);
      }

      // Volcano smoke.
      for (let i = 0; i < 4; i++) {
        const life = (t * 0.32 + i * 0.25) % 1;
        ctx.beginPath();
        ctx.arc(418 + Math.sin(life * 5 + i) * 7, 758 - life * 58, 5 + life * 11, 0, TAU);
        ctx.fillStyle = `rgba(120,110,105,${0.5 * (1 - life)})`;
        ctx.fill();
      }

      // Ships.
      drawn.length = 0;
      drawnFleet.length = 0;
      if (towny) {
        v.fleet.forEach((ship) => {
          const span = Math.max(1, ship.arrives - ship.sailed);
          const progress = Math.min(1, Math.max(0, (clock - ship.sailed) / span));
          const p = curve(ship.lane, progress, ship.mine ? 8 : ship.ship % 2 ? -12 : 14);
          const facing = p.dx >= 0 ? 1 : -1;
          const bob = Math.sin(t * 2.2 + ship.ship) * 1.8;
          lastPlace.set(ship.ship, { x: p.x, y: p.y });
          lastShip.set(ship.ship, ship);
          ctx.strokeStyle = "rgba(255,255,255,0.75)";
          ctx.lineWidth = 2.4;
          for (let i = 1; i <= 3; i++) {
            ctx.beginPath();
            ctx.arc(p.x - facing * (14 + i * 9), p.y + 6, 2.5 + i, 0, Math.PI);
            ctx.stroke();
          }
          if (ship.mine) {
            ctx.beginPath();
            ctx.arc(p.x, p.y - 12, 34 + Math.sin(t * 4) * 2, 0, TAU);
            ctx.fillStyle = "rgba(255,210,63,0.34)";
            ctx.fill();
            ctx.lineWidth = 3.5;
            ctx.strokeStyle = "#ffc531";
            ctx.stroke();
          }
          const [sail, stripe] = SAILS[ship.town % SAILS.length];
          drawShip(ctx, {
            x: p.x,
            y: p.y + 6 + bob,
            angle: Math.sin(t * 1.7 + ship.ship) * 0.05,
            scale: boats * CLASS_SCALE[ship.class] * (ship.mine ? 1.3 : 1.05),
            facing,
            sail,
            stripe,
            t: t + ship.ship,
          });
          drawnFleet.push({ x: p.x, y: p.y - 10, ship });
          const label = ship.mine ? "You" : ship.bot ? `${ship.town_name} (bot)` : ship.town_name;
          ctx.font = `600 ${ship.mine ? 16 : 13}px "Fredoka", sans-serif`;
          ctx.textAlign = "center";
          ctx.lineJoin = "round";
          ctx.lineWidth = 5;
          ctx.strokeStyle = "#fff";
          ctx.strokeText(label, p.x, p.y - 44);
          ctx.fillStyle = ship.mine ? "#c47d00" : ship.bot ? "#1b75ab" : "#7a3fb0";
          ctx.fillText(label, p.x, p.y - 44);
          const said = latest.current.speech?.get(ship.town);
          if (said && said.until > now) {
            ctx.font = `600 15px "Fredoka", sans-serif`;
            const wide = ctx.measureText(said.text).width + 22;
            const [left, top] = [p.x - wide / 2, p.y - 92];
            ctx.beginPath();
            ctx.roundRect(left, top, wide, 30, 12);
            ctx.fillStyle = "#fff";
            ctx.fill();
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = INK;
            ctx.stroke();
            ctx.fillStyle = INK;
            ctx.textAlign = "center";
            ctx.fillText(said.text, p.x, top + 20);
          }
        });
        // Ships called home race back to the pier.
        for (let i = homers.length - 1; i >= 0; i--) {
          const home = homers[i];
          const age = (now - home.born) / 900;
          if (age >= 1) {
            ripples.push({ x: PORTS[0][0], y: PORTS[0][1], born: now });
            homers.splice(i, 1);
            continue;
          }
          const eased = age * age * (3 - 2 * age);
          const [sail, stripe] = SAILS[home.ship.town % SAILS.length];
          drawShip(ctx, {
            x: home.x + (PORTS[0][0] - home.x) * eased,
            y: home.y + (PORTS[0][1] - home.y) * eased,
            angle: 0,
            scale: boats * CLASS_SCALE[home.ship.class],
            facing: PORTS[0][0] >= home.x ? 1 : -1,
            sail,
            stripe,
            t,
          });
        }
      }
      if (!towny) v.voyages.forEach((voyage) => {
        const span = Math.max(1, voyage.arrives - voyage.sailed);
        const progress = Math.min(1, Math.max(0, (clock - voyage.sailed) / span));
        const u = voyage.outbound ? progress : 1 - progress;
        const p = curve(voyage.lane, u, voyage.outbound ? 8 : -8);
        const facing = (voyage.outbound ? p.dx : -p.dx) >= 0 ? 1 : -1;
        const isMine = mine.has(voyage.id);
        const bob = Math.sin(t * 2.2 + voyage.id) * 1.8;
        lastPlace.set(voyage.id, { x: p.x, y: p.y });

        // Wake.
        ctx.strokeStyle = "rgba(255,255,255,0.75)";
        ctx.lineWidth = 2.4;
        for (let i = 1; i <= 3; i++) {
          ctx.beginPath();
          ctx.arc(p.x - facing * (14 + i * 9), p.y + 6, 2.5 + i, 0, Math.PI);
          ctx.stroke();
        }
        if (isMine) {
          ctx.beginPath();
          ctx.arc(p.x, p.y - 12, 34 + Math.sin(t * 4) * 2, 0, TAU);
          ctx.fillStyle = "rgba(255,210,63,0.34)";
          ctx.fill();
          ctx.lineWidth = 3.5;
          ctx.strokeStyle = "#ffc531";
          ctx.stroke();
        }
        const [sail, stripe] = SAILS[voyage.captain % SAILS.length];
        drawShip(ctx, {
          x: p.x,
          y: p.y + 6 + bob,
          angle: Math.sin(t * 1.7 + voyage.id) * 0.05,
          scale: boats * (isMine ? 1.35 : 1.08),
          facing,
          sail,
          stripe,
          t: t + voyage.id,
        });
        drawn.push({ x: p.x, y: p.y - 10, voyage });

        // A ship with a real person at the wheel carries their name.
        const player = v.captains[voyage.captain]?.player;
        if (player) {
          const label = voyage.captain === captain ? "You" : player;
          ctx.font = `600 15px "Fredoka", sans-serif`;
          ctx.textAlign = "center";
          ctx.lineJoin = "round";
          ctx.lineWidth = 5;
          ctx.strokeStyle = "#fff";
          ctx.strokeText(label, p.x, p.y - 42);
          ctx.fillStyle = "#1b75ab";
          ctx.fillText(label, p.x, p.y - 42);
        }
      });

      // Weather.
      v.storms.forEach((storm) => {
        const active = storm.starts <= v.watch && v.watch < storm.ends;
        const eta = storm.starts - clock;
        storm.lanes.forEach((lane, index) => {
          const c = curve(lane, 0.5 + 0.14 * Math.sin(storm.id + index));
          const sway = Math.sin(t * 0.5 + index) * 10;
          stormCloud(ctx, c.x + sway, c.y - 16, (storm.great ? 1.45 : 1) * (active ? 1 : 0.86), t + index, active);
          if (!active) {
            const seconds = Math.max(1, Math.ceil((eta * (driver.watchLength() || v.watch_ms)) / 1000));
            ctx.font = `700 16px "Fredoka", sans-serif`;
            ctx.textAlign = "center";
            ctx.lineWidth = 5;
            ctx.strokeStyle = "#fff";
            ctx.lineJoin = "round";
            ctx.strokeText(`Storm in ${seconds}s`, c.x + sway, c.y + 34);
            ctx.fillStyle = "#d13a2e";
            ctx.fillText(`Storm in ${seconds}s`, c.x + sway, c.y + 34);
          }
        });
      });

      // News from this watch.
      if (v.seq !== lastSeq) {
        for (const e of v.events) {
          if (e.seq <= lastSeq) continue;
          if (e.type === "wrecked") {
            const spot = lastPlace.get(e.voyage);
            if (spot) wrecks.push({ ...spot, born: now, mine: mine.has(e.voyage), captain: e.captain });
          } else if (e.type === "home") {
            const [x, y] = PORTS[e.port];
            ripples.push({ x, y, born: now });
          } else if (e.type === "trip_lost") {
            const spot = lastPlace.get(e.ship);
            if (spot) wrecks.push({ ...spot, born: now, mine: false, captain: e.town });
          } else if (e.type === "trip_back") {
            const spot = lastPlace.get(e.ship);
            const ship = lastShip.get(e.ship);
            if (spot && ship) homers.push({ ...spot, born: now, ship });
          } else if (e.type === "trip_home") {
            const ship = lastShip.get(e.ship);
            if (ship) {
              const [x, y] = PORTS[ship.lane + 1];
              ripples.push({ x, y, born: now });
            }
          }
        }
        lastSeq = v.seq;
      }
      for (let i = ripples.length - 1; i >= 0; i--) {
        const age = (now - ripples[i].born) / 1000;
        if (age > 1.2) {
          ripples.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.arc(ripples[i].x, ripples[i].y, 8 + age * 30, 0, TAU);
        ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - age / 1.2)})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      // Wrecks stay on the map for a while, slowly going under.
      for (let i = wrecks.length - 1; i >= 0; i--) {
        const fx = wrecks[i];
        const age = (now - fx.born) / 1000;
        if (age > 14) {
          wrecks.splice(i, 1);
          continue;
        }
        const fade = Math.min(1, (14 - age) / 2);
        const [sail, stripe] = SAILS[fx.captain % SAILS.length];
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.beginPath();
        ctx.rect(fx.x - 50, fx.y - 70, 100, 76 - Math.min(26, age * 3));
        ctx.clip();
        drawShip(ctx, {
          x: fx.x,
          y: fx.y + 8 + Math.min(18, age * 3.5),
          angle: 0.6,
          scale: boats * 1.1,
          sail,
          stripe,
          t,
          damage: 1,
        });
        ctx.restore();
        ctx.globalAlpha = fade;
        for (let r = 0; r < 2; r++) {
          const a = (age * 0.5 + r * 0.5) % 1;
          ctx.beginPath();
          ctx.ellipse(fx.x, fx.y + 8, 14 + a * 26, 5 + a * 9, 0, 0, TAU);
          ctx.strokeStyle = `rgba(255,255,255,${(1 - a) * 0.9})`;
          ctx.lineWidth = 2.6;
          ctx.stroke();
        }
        for (let b = 0; b < 5; b++) {
          const life = (t * 0.8 + b * 0.21) % 1;
          ctx.beginPath();
          ctx.arc(fx.x - 12 + b * 6, fx.y + 2 - life * 26, 2 + (b % 3), 0, TAU);
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      const sinceFlash = now - flashAt.current;
      if (sinceFlash < 380) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = `rgba(255,255,235,${0.55 * (1 - sinceFlash / 380)})`;
        ctx.fillRect(0, 0, el.width, el.height);
      }
    };
    frame = requestAnimationFrame(render);

    const point = (event: MouseEvent) => {
      const box = el.getBoundingClientRect();
      const sx = event.clientX - box.left;
      const sy = event.clientY - box.top;
      const x = (sx - offsetX) / scale;
      const y = (sy - offsetY) / scale;
      const rival = drawnFleet.find((s) => Math.hypot(s.x - x, s.y - y) < 30);
      if (rival) return setHover({ x: sx, y: sy, fleet: rival.ship });
      const ship = drawn.find((s) => Math.hypot(s.x - x, s.y - y) < 28);
      if (ship) return setHover({ x: sx, y: sy, voyage: ship.voyage });
      const port = PORTS.findIndex(([px, py]) => Math.hypot(px - x, py - y) < 58);
      if (port >= 0) return setHover({ x: sx, y: sy, port });
      const v = latest.current.view;
      if (latest.current.townMode) return setHover(null);
      const rivals = v.houses.filter((h) => !h.you).slice(0, SHOPS.length);
      const near = SHOPS.findIndex(([px, py], i) => rivals[i] && Math.hypot(px - x, py - 18 - y) < 28);
      if (near >= 0) return setHover({ x: sx, y: sy, house: rivals[near] });
      return setHover(null);
    };
    const leave = () => setHover(null);
    const tap = (event: MouseEvent) => {
      point(event);
      const box = el.getBoundingClientRect();
      const x = (event.clientX - box.left - offsetX) / scale;
      const y = (event.clientY - box.top - offsetY) / scale;
      const hit = drawnFleet.find((s) => !s.ship.mine && Math.hypot(s.x - x, s.y - y) < 30);
      if (hit) latest.current.onRival?.(hit.ship);
    };
    el.addEventListener("mousemove", point);
    el.addEventListener("click", tap);
    el.addEventListener("mouseleave", leave);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      el.removeEventListener("mousemove", point);
      el.removeEventListener("click", tap);
      el.removeEventListener("mouseleave", leave);
    };
  }, [driver, onFit]);

  const you = view.houses.find((h) => h.you);
  const atRisk = hover?.voyage
    ? view.positions
        .filter((p) => you && p.writer === you.id && p.voyage === hover.voyage?.id)
        .reduce((sum, p) => sum + p.sum - p.ceded, 0)
    : 0;
  const portInfo = hover?.port !== undefined ? view.ports[hover.port] : null;
  const home = view.ports[0];

  return (
    <div className="chart" ref={host}>
      <canvas ref={canvas} aria-label="Map of the harbor with ships, islands and storms" role="img" />
      {hover?.voyage && (
        <div className="tip" style={{ left: hover.x + 14, top: hover.y + 10 }}>
          <Character id={hover.voyage.captain} size={52} mood={atRisk ? "cheer" : "happy"} />
          <span>
            <b>{fullName(hover.voyage.captain)}</b>
            {view.captains[hover.voyage.captain]?.player && <span className="tip-mine">Played by {view.captains[hover.voyage.captain].player}</span>}
            <span>{hover.voyage.qty > 0 ? `Carrying ${cargo(hover.voyage.qty, hover.voyage.good_name)}` : "Sailing empty"}</span>
            {atRisk > 0 && <span className="tip-mine">You protect this ship</span>}
          </span>
        </div>
      )}
      {hover?.fleet && (
        <div className="tip" style={{ left: hover.x + 14, top: hover.y + 10 }}>
          <span>
            <b>{hover.fleet.mine ? "Your ship" : hover.fleet.town_name}</b>
            <span>{hover.fleet.raided ? "Pirates are after this ship!" : hover.fleet.mine ? "The gold ring means it's yours" : hover.fleet.bot ? "Run by the computer" : "A real player"}</span>
          </span>
        </div>
      )}
      {portInfo && !townMode && (
        <div className="tip" style={{ left: hover!.x + 14, top: hover!.y + 10 }}>
          <span>
            <b>{place(portInfo.name)}</b>
            <span>Makes {portInfo.makes}.</span>
            {hover!.port !== 0 && (
              <span>Merrow pays {home.goods.find((g) => g.name === portInfo.makes)?.price ?? 0} coins each for it.</span>
            )}
          </span>
        </div>
      )}
      {hover?.house && (
        <div className="tip" style={{ left: hover.x + 14, top: hover.y + 10 }}>
          <span>
            <b>{shopName(hover.house.name)}</b>
            <span>{hover.house.active ? `${crowns(hover.house.capital)} coins` : "Closed for good"}</span>
          </span>
        </div>
      )}
    </div>
  );
}
