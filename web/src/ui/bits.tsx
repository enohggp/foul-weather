// Small shared pieces: flags, seals, and a line chart.

import { useMemo, useState } from "react";
import type { House } from "../types";

const FLAGS: [string, string][] = [
  ["#8c2b20", "#f2e7cf"],
  ["#2f5f6b", "#e7c76a"],
  ["#2a2014", "#c98b2b"],
  ["#3f6b45", "#f2e7cf"],
  ["#6b2f5f", "#e7c76a"],
  ["#a47c2c", "#2a2014"],
  ["#23497e", "#f2e7cf"],
  ["#5a5a4a", "#8c2b20"],
  ["#2f6b5e", "#2a2014"],
  ["#b3562a", "#f2e7cf"],
  ["#3a3f63", "#c98b2b"],
  ["#7d3b24", "#dfe3cf"],
];

export function Flag({ captain, size = 22 }: { captain: number; size?: number }) {
  const [field, charge] = FLAGS[captain % FLAGS.length];
  const pattern = captain % 3;
  return (
    <svg className="flag" width={size} height={size * 0.72} viewBox="0 0 28 20" aria-hidden="true">
      <path d="M1 1H27L21 10 27 19H1Z" fill={field} stroke="#2a2014" strokeWidth="1" />
      {pattern === 0 && <path d="M1 8H23V12H1Z" fill={charge} />}
      {pattern === 1 && <circle cx="10" cy="10" r="4" fill={charge} />}
      {pattern === 2 && <path d="M8 1H13V19H8Z" fill={charge} />}
    </svg>
  );
}

export function Seal({ house, size = 26 }: { house: House; size?: number }) {
  const initial = house.name.replace(/^The /, "").charAt(0).toUpperCase();
  return (
    <span
      className={`seal${house.you ? " you" : ""}${house.active ? "" : " dead"}`}
      style={{ width: size, height: size, fontSize: size * 0.54 }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

interface LineChartProps {
  title: string;
  points: { x: number; y: number }[];
  format: (y: number) => string;
  xLabel: (x: number) => string;
}

/** One measure over time. A title names the single series, so no legend is needed. */
export function LineChart({ title, points, format, xLabel }: LineChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const [w, h, left, right, top, bottom] = [300, 124, 44, 10, 10, 22];

  const scale = useMemo(() => {
    const ys = points.map((p) => p.y);
    const low = Math.min(...ys, 0);
    const high = Math.max(...ys, 1) * 1.08;
    const xs = points.map((p) => p.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs, minX + 1);
    return {
      x: (x: number) => left + ((x - minX) / (maxX - minX)) * (w - left - right),
      y: (y: number) => h - bottom - ((y - low) / (high - low)) * (h - top - bottom),
      ticks: [low, (low + high) / 2, high],
      minX,
      maxX,
    };
  }, [points, w, h, left, right, top, bottom]);

  if (points.length < 2) {
    return (
      <figure className="linechart">
        <figcaption>{title}</figcaption>
        <p className="muted">Not enough days yet.</p>
      </figure>
    );
  }

  const path = points.map((p, i) => `${i ? "L" : "M"}${scale.x(p.x).toFixed(1)} ${scale.y(p.y).toFixed(1)}`).join("");
  const last = points[points.length - 1];
  const hovered = hover === null ? null : points[hover];

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * w;
    let best = 0;
    let gap = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(scale.x(p.x) - px);
      if (d < gap) {
        gap = d;
        best = i;
      }
    });
    setHover(best);
  };

  return (
    <figure className="linechart">
      <figcaption>
        {title} <b>{format((hovered ?? last).y)}</b>
        {hovered && <span className="muted"> {xLabel(hovered.x)}</span>}
      </figcaption>
      <svg viewBox={`0 0 ${w} ${h}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={`${title}, latest ${format(last.y)}`}>
        {scale.ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={w - right} y1={scale.y(t)} y2={scale.y(t)} className="grid" />
            <text x={left - 6} y={scale.y(t) + 3} textAnchor="end" className="axis">
              {format(t)}
            </text>
          </g>
        ))}
        <text x={left} y={h - 6} className="axis">
          {xLabel(scale.minX)}
        </text>
        <text x={w - right} y={h - 6} textAnchor="end" className="axis">
          {xLabel(scale.maxX)}
        </text>
        <path d={path} className="line" />
        {hovered && (
          <>
            <line x1={scale.x(hovered.x)} x2={scale.x(hovered.x)} y1={top} y2={h - bottom} className="cross" />
            <circle cx={scale.x(hovered.x)} cy={scale.y(hovered.y)} r="4" className="dot" />
          </>
        )}
      </svg>
    </figure>
  );
}

/** A small trend with no axes, for use beside a number in a table. */
export function Spark({ values, width = 64, height = 18 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  const low = Math.min(...values);
  const high = Math.max(...values, low + 1);
  const d = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * (width - 2) + 1;
      const y = height - 2 - ((v - low) / (high - low)) * (height - 4);
      return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join("");
  return (
    <svg width={width} height={height} className="spark" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
