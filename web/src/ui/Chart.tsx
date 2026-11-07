// The sea chart. A static engraving is drawn once; ships and weather move over it.

import { useEffect, useRef, useState } from "react";
import type { Driver, View, Voyage } from "../types";
import { crowns, seaWord } from "../words";

const W = 1000;
const H = 880;

const PORTS: [number, number][] = [
  [196, 452],
  [452, 136],
  [622, 356],
  [438, 760],
  [824, 184],
  [832, 628],
];

// Bend of each lane, as an offset of the curve's midpoint.
const BENDS: [number, number][] = [
  [-30, -36],
  [14, -50],
  [-52, 34],
  [-30, -70],
  [40, 70],
];

interface Point {
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

/** An irregular island outline around a centre. */
function coast(cx: number, cy: number, rx: number, ry: number, seed: number, points = 46): Point[] {
  const r = seeded(seed);
  const phases = [r() * 6.28, r() * 6.28, r() * 6.28];
  const out: Point[] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const wobble =
      1 +
      0.16 * Math.sin(a * 3 + phases[0]) +
      0.09 * Math.sin(a * 7 + phases[1]) +
      0.05 * Math.sin(a * 13 + phases[2]) +
      (r() - 0.5) * 0.05;
    out.push({ x: cx + Math.cos(a) * rx * wobble, y: cy + Math.sin(a) * ry * wobble });
  }
  return out;
}

function mainland(): Point[] {
  const r = seeded(77);
  const [top, bottom, left] = [-700, H + 700, -900];
  const out: Point[] = [{ x: left, y: top }];
  const steps = 120;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = top + t * (bottom - top);
    const bay = -44 * Math.exp(-(((y - 452) / 70) ** 2));
    const v = y / H;
    const x =
      176 +
      bay +
      50 * Math.sin(v * 3.1 + 0.4) * (1 - v * 0.4) +
      20 * Math.sin(v * 11 + 1) +
      9 * Math.sin(v * 27) +
      (r() - 0.5) * 7;
    out.push({ x, y });
  }
  out.push({ x: left, y: bottom });
  return out;
}

function trace(ctx: CanvasRenderingContext2D, points: Point[]) {
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}

function land(ctx: CanvasRenderingContext2D, shape: Point[], seed: number) {
  ctx.save();
  // Depth lines, engraved outward from the shore.
  for (let i = 5; i >= 1; i--) {
    trace(ctx, shape);
    ctx.lineWidth = i * 4.2;
    ctx.lineJoin = "round";
    ctx.strokeStyle = `rgba(62, 104, 108, ${0.035 + (5 - i) * 0.012})`;
    ctx.stroke();
  }
  trace(ctx, shape);
  ctx.fillStyle = "#e7d6ab";
  ctx.fill();
  ctx.clip();
  // Hachures for high ground.
  const r = seeded(seed);
  const xs = shape.map((p) => p.x);
  const ys = shape.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  ctx.strokeStyle = "rgba(92, 70, 40, 0.34)";
  ctx.lineWidth = 0.8;
  const count = Math.min(120, ((x1 - x0) * (y1 - y0)) / 900);
  for (let i = 0; i < count; i++) {
    const x = x0 + r() * (x1 - x0);
    const y = y0 + r() * (y1 - y0);
    ctx.beginPath();
    ctx.moveTo(x - 4, y + 3);
    ctx.lineTo(x, y - 3);
    ctx.lineTo(x + 4, y + 3);
    ctx.stroke();
  }
  ctx.restore();
  trace(ctx, shape);
  ctx.strokeStyle = "#4a3a26";
  ctx.lineWidth = 1.3;
  ctx.lineJoin = "round";
  ctx.stroke();
}

function compass(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  for (let ring = 0; ring < 2; ring++) {
    ctx.beginPath();
    ctx.arc(0, 0, size * (ring ? 0.82 : 0.9), 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(74, 58, 38, 0.55)";
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }
  for (let i = 0; i < 16; i++) {
    const major = i % 4 === 0;
    const middle = i % 2 === 0;
    const length = major ? size : middle ? size * 0.68 : size * 0.44;
    const width = major ? size * 0.11 : size * 0.07;
    ctx.save();
    ctx.rotate((i * Math.PI) / 8);
    for (const side of [1, -1]) {
      ctx.beginPath();
      ctx.moveTo(0, -length);
      ctx.lineTo(side * width, -width);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fillStyle = side > 0 ? "rgba(60, 46, 30, 0.82)" : "rgba(232, 218, 182, 0.9)";
      ctx.fill();
      ctx.strokeStyle = "rgba(60, 46, 30, 0.7)";
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.fillStyle = "#3a2c1c";
  ctx.font = `italic ${size * 0.26}px "IM Fell English", serif`;
  ctx.textAlign = "center";
  ctx.fillText("N", 0, -size - 5);
  ctx.restore();
}

function paintChart(ctx: CanvasRenderingContext2D) {
  const sea = ctx.createRadialGradient(W * 0.56, H * 0.46, 120, W * 0.56, H * 0.46, 980);
  sea.addColorStop(0, "#dfe3cf");
  sea.addColorStop(0.7, "#d3d6bd");
  sea.addColorStop(1, "#bdb793");
  ctx.fillStyle = sea;
  ctx.fillRect(-1200, -1200, W + 2400, H + 2400);

  // Rhumb lines from the compass.
  const origin = { x: 650, y: 776 };
  ctx.strokeStyle = "rgba(92, 70, 40, 0.13)";
  ctx.lineWidth = 0.7;
  for (let i = 0; i < 32; i++) {
    const a = (i * Math.PI) / 16;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(origin.x + Math.cos(a) * 2400, origin.y + Math.sin(a) * 2400);
    ctx.stroke();
  }

  // Soundings, scattered in tiny numerals.
  const r = seeded(41);
  ctx.fillStyle = "rgba(62, 84, 88, 0.42)";
  ctx.font = `10px "IM Fell English", serif`;
  ctx.textAlign = "center";
  for (let i = 0; i < 150; i++) {
    const x = 250 + r() * 900;
    const y = -160 + r() * 1200;
    ctx.fillText(String(6 + Math.floor(r() * 90)), x, y);
  }

  land(ctx, mainland(), 11);
  const isles: [number, number, number, number, number][] = [
    [478, 92, 66, 40, 21],
    [664, 328, 50, 38, 22],
    [416, 804, 78, 40, 23],
    [868, 142, 68, 48, 24],
    [880, 664, 62, 60, 25],
    [742, 500, 17, 12, 26],
    [330, 262, 13, 9, 27],
    [944, 410, 22, 16, 28],
    [292, 640, 14, 8, 29],
    [120, -120, 60, 40, 30],
  ];
  for (const [x, y, rx, ry, seed] of isles) land(ctx, coast(x, y, rx, ry, seed), seed);

  compass(ctx, origin.x, origin.y, 46);

  // Scale bar.
  ctx.save();
  ctx.translate(724, 836);
  ctx.strokeStyle = "rgba(60, 46, 30, 0.75)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "rgba(60, 46, 30, 0.75)";
  for (let i = 0; i < 4; i++) {
    if (i % 2 === 0) ctx.fillRect(i * 28, 0, 28, 4);
    ctx.strokeRect(i * 28, 0, 28, 4);
  }
  ctx.font = `italic 11px "IM Fell English", serif`;
  ctx.textAlign = "left";
  ctx.fillText("One watch's sailing", 0, 18);
  ctx.restore();

  // Cartouche.
  ctx.save();
  ctx.translate(26, 22);
  ctx.fillStyle = "rgba(240, 230, 204, 0.86)";
  ctx.strokeStyle = "#4a3a26";
  ctx.lineWidth = 1;
  ctx.fillRect(0, 0, 148, 62);
  ctx.strokeRect(0, 0, 148, 62);
  ctx.strokeRect(4, 4, 140, 54);
  ctx.fillStyle = "#3a2c1c";
  ctx.textAlign = "center";
  ctx.font = `13px "IM Fell English SC", serif`;
  ctx.fillText("A Chart of the", 74, 24);
  ctx.font = `17px "IM Fell English SC", serif`;
  ctx.fillText("Merrow Approaches", 74, 44);
  ctx.restore();

  // Paper grain.
  const tile = document.createElement("canvas");
  tile.width = tile.height = 180;
  const t = tile.getContext("2d")!;
  const grain = t.createImageData(180, 180);
  for (let i = 0; i < grain.data.length; i += 4) {
    const v = 90 + Math.random() * 90;
    grain.data[i] = grain.data[i + 1] = grain.data[i + 2] = v;
    grain.data[i + 3] = Math.random() * 15;
  }
  t.putImageData(grain, 0, 0);
  ctx.fillStyle = ctx.createPattern(tile, "repeat")!;
  ctx.fillRect(-1200, -1200, W + 2400, H + 2400);
}

function ship(ctx: CanvasRenderingContext2D, x: number, y: number, facing: number, scale: number, ink: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing * scale, scale);
  ctx.beginPath();
  ctx.moveTo(-9, 1);
  ctx.quadraticCurveTo(0, 7, 10, 0);
  ctx.lineTo(7, 0);
  ctx.lineTo(-7, 1);
  ctx.closePath();
  ctx.fillStyle = ink;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -13);
  ctx.moveTo(-5, 0);
  ctx.lineTo(-5, -10);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0.6, -12);
  ctx.quadraticCurveTo(7, -7, 0.6, -2);
  ctx.closePath();
  ctx.moveTo(-4.4, -9.5);
  ctx.quadraticCurveTo(0, -5.5, -4.4, -2);
  ctx.closePath();
  ctx.fillStyle = "#f3ead3";
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.restore();
}

interface Effect {
  kind: "wreck" | "home";
  x: number;
  y: number;
  born: number;
  mine: boolean;
}

interface Hover {
  x: number;
  y: number;
  voyage: Voyage;
}

interface Props {
  view: View;
  driver: Driver;
  flash: number;
}

export default function Chart({ view, driver, flash }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(view);
  const flashAt = useRef(0);
  const [hover, setHover] = useState<Hover | null>(null);
  latest.current = view;

  useEffect(() => {
    if (flash) flashAt.current = performance.now();
  }, [flash]);

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d")!;
    const engraved = document.createElement("canvas");
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let dpr = 1;
    let type = 1;
    let frame = 0;
    let lastSeq = latest.current.seq;
    const effects: Effect[] = [];
    const lastPlace = new Map<number, Point>();
    const shipsDrawn: { x: number; y: number; voyage: Voyage }[] = [];

    const resize = () => {
      if (!host.current) return;
      const box = host.current.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      el.width = Math.max(1, Math.round(box.width * dpr));
      el.height = Math.max(1, Math.round(box.height * dpr));
      el.style.width = `${box.width}px`;
      el.style.height = `${box.height}px`;
      scale = Math.min(box.width / W, box.height / H);
      offsetX = (box.width - W * scale) / 2;
      offsetY = (box.height - H * scale) / 2;
      type = 1 / Math.pow(scale, 0.86);
      engraved.width = el.width;
      engraved.height = el.height;
      const g = engraved.getContext("2d")!;
      g.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
      paintChart(g);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host.current!);
    resize();
    // Fonts arrive after first paint; engrave again with the real type.
    void document.fonts?.ready.then(resize);

    const render = (now: number) => {
      frame = requestAnimationFrame(render);
      const v = latest.current;
      const length = driver.watchLength() || v.watch_ms;
      const running = driver.watchLength() > 0;
      const into = running ? Math.min(1, (now - driver.watchStartedAt()) / length) : 0;
      const clock = v.watch + into;
      const you = v.houses.find((h) => h.you);
      const mine = new Set(
        v.positions.filter((p) => you && p.writer === you.id).map((p) => p.voyage),
      );

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(engraved, 0, 0, el.width / dpr, el.height / dpr);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);

      // Lanes, drawn rougher as the sea rises.
      v.lanes.forEach((lane) => {
        ctx.beginPath();
        for (let i = 0; i <= 44; i++) {
          const p = curve(lane.id, i / 44);
          if (i) ctx.lineTo(p.x, p.y);
          else ctx.moveTo(p.x, p.y);
        }
        ctx.setLineDash([2, 7]);
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = "rgba(52, 40, 26, 0.5)";
        ctx.stroke();
        ctx.setLineDash([]);

        const marks = Math.floor(lane.sea / 11);
        ctx.strokeStyle = lane.sea >= 60 ? "rgba(58, 63, 99, 0.62)" : "rgba(62, 104, 108, 0.46)";
        ctx.lineWidth = 1;
        for (let i = 0; i < marks; i++) {
          const t = 0.12 + (0.76 * (i + 0.5)) / marks;
          const p = curve(lane.id, t, i % 2 ? 9 : -9);
          const lift = Math.sin(now / 520 + i * 1.7) * 1.6;
          ctx.beginPath();
          ctx.moveTo(p.x - 7, p.y + lift);
          ctx.quadraticCurveTo(p.x - 3.5, p.y - 4 + lift, p.x, p.y + lift);
          ctx.quadraticCurveTo(p.x + 3.5, p.y + 4 + lift, p.x + 7, p.y + lift);
          ctx.stroke();
        }

        const label = curve(lane.id, 0.44, -17);
        ctx.save();
        ctx.translate(label.x, label.y);
        const tilt = Math.atan2(label.dy, label.dx);
        ctx.rotate(tilt > Math.PI / 2 || tilt < -Math.PI / 2 ? tilt + Math.PI : tilt);
        ctx.font = `italic ${13.5 * type}px "IM Fell English", serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(46, 35, 22, 0.86)";
        ctx.fillText(`${lane.name}, ${seaWord(lane.sea).toLowerCase()}`, 0, 0);
        ctx.restore();
      });

      // Ports.
      v.ports.forEach((port, i) => {
        const [x, y] = PORTS[i];
        ctx.beginPath();
        ctx.arc(x, y, i === 0 ? 6 : 4.5, 0, Math.PI * 2);
        ctx.fillStyle = "#8c2b20";
        ctx.fill();
        ctx.strokeStyle = "#f2e7cf";
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.font = `${(i === 0 ? 21 : 17) * type}px "IM Fell English SC", serif`;
        ctx.textAlign = i === 0 ? "right" : "center";
        const tx = i === 0 ? x - 12 : x;
        const ty = i === 0 ? y + 6 : y - 11;
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(240, 230, 204, 0.72)";
        ctx.strokeText(port.name, tx, ty);
        ctx.fillStyle = "#2e2316";
        ctx.fillText(port.name, tx, ty);
      });

      // Weather.
      v.storms.forEach((storm) => {
        const active = storm.starts <= v.watch && v.watch < storm.ends;
        const eta = storm.starts - v.watch;
        storm.lanes.forEach((lane, index) => {
          const c = curve(lane, 0.5 + 0.12 * Math.sin(storm.id + index), 0);
          const radius = storm.great ? 74 : 46;
          ctx.save();
          ctx.translate(c.x, c.y);
          if (active) {
            const wash = ctx.createRadialGradient(0, 0, 6, 0, 0, radius * 1.15);
            wash.addColorStop(0, "rgba(34, 36, 66, 0.72)");
            wash.addColorStop(0.65, "rgba(44, 48, 84, 0.42)");
            wash.addColorStop(1, "rgba(44, 48, 84, 0)");
            ctx.fillStyle = wash;
            ctx.beginPath();
            ctx.arc(0, 0, radius * 1.15, 0, Math.PI * 2);
            ctx.fill();
            ctx.rotate(now / 900);
            ctx.strokeStyle = "rgba(240, 236, 224, 0.42)";
            ctx.lineWidth = 1.4;
            for (let arm = 0; arm < 4; arm++) {
              ctx.rotate(Math.PI / 2);
              ctx.beginPath();
              for (let s = 0; s < 34; s++) {
                const a = s * 0.16;
                const d = 5 + s * (radius / 40);
                if (s) ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
                else ctx.moveTo(Math.cos(a) * d, Math.sin(a) * d);
              }
              ctx.stroke();
            }
          } else {
            const pulse = 0.5 + 0.28 * Math.sin(now / 340);
            ctx.setLineDash([6, 6]);
            ctx.lineWidth = 1.6;
            ctx.strokeStyle = `rgba(58, 63, 99, ${pulse})`;
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = "#2e2c52";
            ctx.font = `italic ${14 * type}px "IM Fell English", serif`;
            ctx.textAlign = "center";
            ctx.fillText(eta === 1 ? "next watch" : `in ${eta} watches`, 0, 4);
          }
          ctx.restore();
        });
      });

      // Ships.
      shipsDrawn.length = 0;
      v.voyages.forEach((voyage) => {
        const span = Math.max(1, voyage.arrives - voyage.sailed);
        const progress = Math.min(1, Math.max(0, (clock - voyage.sailed) / span));
        const t = voyage.outbound ? progress : 1 - progress;
        const p = curve(voyage.lane, t, voyage.outbound ? 7 : -7);
        const facing = (voyage.outbound ? p.dx : -p.dx) >= 0 ? 1 : -1;
        const isMine = mine.has(voyage.id);
        const bob = Math.sin(now / 460 + voyage.id) * 1.2;
        lastPlace.set(voyage.id, { x: p.x, y: p.y });
        if (isMine) {
          ctx.beginPath();
          ctx.arc(p.x, p.y - 4, 17, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(164, 124, 44, 0.2)";
          ctx.fill();
          ctx.strokeStyle = "#a47c2c";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ship(ctx, p.x, p.y + bob, facing, (isMine ? 1.3 : 1.08) * Math.sqrt(type), voyage.covered_bps === 0 ? "#6f604c" : "#2a2014");
        shipsDrawn.push({ x: p.x, y: p.y, voyage });
      });

      // News from this watch.
      if (v.seq !== lastSeq) {
        for (const e of v.events) {
          if (e.seq <= lastSeq) continue;
          if (e.type === "wrecked") {
            const place = lastPlace.get(e.voyage);
            if (place) {
              effects.push({ kind: "wreck", x: place.x, y: place.y, born: now, mine: mine.has(e.voyage) || false });
            }
          } else if (e.type === "home") {
            const [x, y] = PORTS[e.port];
            effects.push({ kind: "home", x, y, born: now, mine: false });
          }
        }
        lastSeq = v.seq;
      }
      for (let i = effects.length - 1; i >= 0; i--) {
        const fx = effects[i];
        const age = (now - fx.born) / 1000;
        if (age > (fx.kind === "wreck" ? 12 : 1.6)) {
          effects.splice(i, 1);
          continue;
        }
        if (fx.kind === "home") {
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, 6 + age * 26, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(47, 107, 94, ${0.7 * (1 - age / 1.6)})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          const fade = Math.min(1, (12 - age) / 3);
          for (let ring = 0; ring < 3; ring++) {
            const a = (age * 0.6 + ring * 0.33) % 1;
            ctx.beginPath();
            ctx.arc(fx.x, fx.y, 4 + a * 34, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(140, 43, 32, ${(1 - a) * 0.75 * fade})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
          ctx.strokeStyle = `rgba(140, 43, 32, ${fade})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(fx.x - 8, fx.y - 8);
          ctx.lineTo(fx.x + 8, fx.y + 8);
          ctx.moveTo(fx.x + 8, fx.y - 8);
          ctx.lineTo(fx.x - 8, fx.y + 8);
          ctx.stroke();
        }
      }

      // Lightning, when the storm breaks.
      const sinceFlash = now - flashAt.current;
      if (sinceFlash < 420) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = `rgba(250, 248, 240, ${0.5 * (1 - sinceFlash / 420)})`;
        ctx.fillRect(0, 0, el.width, el.height);
      }
    };
    frame = requestAnimationFrame(render);

    const move = (event: MouseEvent) => {
      const box = el.getBoundingClientRect();
      const x = (event.clientX - box.left - offsetX) / scale;
      const y = (event.clientY - box.top - offsetY) / scale;
      const near = shipsDrawn.find((s) => Math.hypot(s.x - x, s.y - y) < 20);
      setHover(
        near
          ? { x: event.clientX - box.left, y: event.clientY - box.top, voyage: near.voyage }
          : null,
      );
    };
    const leave = () => setHover(null);
    el.addEventListener("mousemove", move);
    el.addEventListener("mouseleave", leave);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      el.removeEventListener("mousemove", move);
      el.removeEventListener("mouseleave", leave);
    };
  }, [driver]);

  const captain = hover ? view.captains[hover.voyage.captain] : null;
  const you = view.houses.find((h) => h.you);
  const atRisk = hover
    ? view.positions
        .filter((p) => you && p.writer === you.id && p.voyage === hover.voyage.id)
        .reduce((sum, p) => sum + p.sum - p.ceded, 0)
    : 0;

  return (
    <div className="chart" ref={host}>
      <canvas ref={canvas} aria-label="Sea chart showing ships, lanes and storms" role="img" />
      {hover && captain && (
        <div className="tip chart-tip" style={{ left: hover.x + 14, top: hover.y + 10 }}>
          <strong>{captain.ship}</strong>
          <span>{captain.name}</span>
          <span>
            {hover.voyage.qty > 0 ? `${hover.voyage.qty} ${hover.voyage.good_name}` : "In ballast"}, {Math.round(hover.voyage.covered_bps / 100)}% covered
          </span>
          {atRisk > 0 && <span>You stand to lose {crowns(atRisk)}</span>}
        </div>
      )}
    </div>
  );
}
