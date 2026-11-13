// Pictures for the things a player can own: buildings, ships and crew.

import type { ReactNode } from "react";

const INK = "#3b2a1e";
const line = { stroke: INK, strokeWidth: 2.4, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

function Frame({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="town-art">
      {children}
    </svg>
  );
}

function House({ roof, wall = "#fff4dd" }: { roof: string; wall?: string }) {
  return (
    <>
      <rect x="14" y="30" width="36" height="28" rx="2" fill={wall} {...line} />
      <path d="M8 32 32 10l24 22z" fill={roof} {...line} />
      <rect x="27" y="42" width="11" height="16" rx="1.500" fill="#b9773f" {...line} />
    </>
  );
}

/** One picture for each kind of building, in the order the rulebook lists them. */
export function BuildingArt({ kind, size = 56 }: { kind: number; size?: number }) {
  switch (kind) {
    case 0: // Cottage
      return (
        <Frame size={size}>
          <House roof="#e8504a" />
          <rect x="18" y="36" width="7" height="7" fill="#bdeeff" {...line} />
        </Frame>
      );
    case 1: // Fish Stall
      return (
        <Frame size={size}>
          <rect x="12" y="34" width="40" height="24" fill="#d39a5e" {...line} />
          <path d="M8 34 14 18h36l6 16z" fill="#2d9cdb" {...line} />
          <path d="M22 18l-3 16M32 18v16M42 18l3 16" stroke="#fff" strokeWidth="3" />
          <path d="M22 46c6-6 14-6 18 0-4 6-12 6-18 0zM40 46l6-4v8z" fill="#9ad6ef" {...line} />
        </Frame>
      );
    case 2: // Bakery
      return (
        <Frame size={size}>
          <rect x="42" y="10" width="8" height="16" fill="#b9773f" {...line} />
          <House roof="#f2a63a" />
          <path d="M16 38c3-5 13-5 15 0v5H16z" fill="#e7b56f" {...line} />
        </Frame>
      );
    case 3: // Inn
      return (
        <Frame size={size}>
          <rect x="8" y="22" width="48" height="36" rx="2" fill="#ffe6c7" {...line} />
          <path d="M4 24 32 6l28 18z" fill="#b45bb0" {...line} />
          <rect x="14" y="30" width="8" height="8" fill="#bdeeff" {...line} />
          <rect x="42" y="30" width="8" height="8" fill="#bdeeff" {...line} />
          <rect x="26" y="42" width="12" height="16" fill="#b9773f" {...line} />
        </Frame>
      );
    case 4: // Market Hall
      return (
        <Frame size={size}>
          <path d="M6 24 32 6l26 18z" fill="#ffc531" {...line} />
          <rect x="8" y="24" width="48" height="6" fill="#fff4dd" {...line} />
          {[12, 24, 36, 48].map((x) => (
            <rect key={x} x={x} y="30" width="5" height="24" fill="#fff4dd" {...line} />
          ))}
          <rect x="6" y="54" width="52" height="5" fill="#d9cfc0" {...line} />
        </Frame>
      );
    case 5: // Dock
      return (
        <Frame size={size}>
          <rect x="4" y="30" width="56" height="12" fill="#b9773f" {...line} />
          {[12, 26, 40, 54].map((x) => (
            <rect key={x} x={x - 2} y="42" width="5" height="16" fill="#8a5a2c" {...line} />
          ))}
          <path d="M18 30V16l16 7-16 6" fill="#fff" {...line} />
        </Frame>
      );
    case 6: // Tavern
      return (
        <Frame size={size}>
          <House roof="#5a5fc4" wall="#ffe6c7" />
          <rect x="15" y="16" width="14" height="14" rx="2" fill="#ffc531" {...line} />
          <path d="M19 20h6v6h-6zM25 21h2v4h-2" fill="#fff" stroke={INK} strokeWidth="1.400" />
        </Frame>
      );
    case 7: // Warehouse
      return (
        <Frame size={size}>
          <path d="M6 28 32 12l26 16v30H6z" fill="#c9a06b" {...line} />
          <rect x="20" y="36" width="24" height="22" fill="#8a5a2c" {...line} />
          <path d="M20 36l24 22M44 36 20 58" stroke={INK} strokeWidth="2" />
        </Frame>
      );
    case 8: // Lighthouse
      return (
        <Frame size={size}>
          <path d="M22 58 26 18h12l4 40z" fill="#fff" {...line} />
          <path d="M24.500 34h15l1 10h-17z" fill="#e8504a" {...line} />
          <rect x="24" y="10" width="16" height="9" fill="#ffd23f" {...line} />
          <path d="M22 10 32 3l10 7z" fill="#e8504a" {...line} />
        </Frame>
      );
    case 9: // Shipyard
      return (
        <Frame size={size}>
          <path d="M8 40h48l-7 15H15z" fill="#b9773f" {...line} />
          <path d="M14 40V20M50 40V20M10 22h44" stroke={INK} strokeWidth="4" strokeLinecap="round" />
          <path d="M32 22v10" stroke={INK} strokeWidth="2.400" />
          <rect x="27" y="30" width="10" height="7" fill="#9aa8b5" {...line} />
        </Frame>
      );
    case 10: // Insurance Office
      return (
        <Frame size={size}>
          <rect x="10" y="20" width="44" height="38" rx="2" fill="#dfe9f2" {...line} />
          <path d="M6 22 32 6l26 16z" fill="#2fae6e" {...line} />
          <path d="M32 28c6 2 9 2 12 1 1 11-5 18-12 21-7-3-13-10-12-21 3 1 6 1 12-1z" fill="#2d9cdb" {...line} />
        </Frame>
      );
    default: // Pirate Cove
      return (
        <Frame size={size}>
          <path d="M8 58 32 16l24 42z" fill="#6b5645" {...line} />
          <path d="M32 16V5" stroke={INK} strokeWidth="3" />
          <path d="M32 6h16l-4 5 4 5H32z" fill="#3b2a1e" {...line} />
          <circle cx="32" cy="44" r="7" fill="#fff4dd" {...line} />
          <circle cx="29.500" cy="43" r="1.500" fill={INK} />
          <circle cx="34.500" cy="43" r="1.500" fill={INK} />
        </Frame>
      );
  }
}

/** A treasure chest, shut or bursting with gold. */
export function ChestArt({ size = 170, open = false }: { size?: number; open?: boolean }) {
  return (
    <svg width={size} height={size * 0.9} viewBox="0 0 120 108" aria-hidden="true" className={`chest-art${open ? " open" : ""}`}>
      {open ? (
        <>
          <path d="M16 54C14 22 34 8 60 8s46 14 44 46z" fill="#8a5a2c" {...line} />
          <path d="M26 50C26 28 40 18 60 18s34 10 34 32z" fill="#5d3a1b" />
          <ellipse cx="60" cy="56" rx="44" ry="17" fill="#ffd23f" {...line} />
          {[
            [34, 52],
            [50, 46],
            [68, 45],
            [86, 52],
            [58, 58],
          ].map(([x, y]) => (
            <circle key={x} cx={x} cy={y} r="8" fill="#ffc531" {...line} />
          ))}
        </>
      ) : (
        <path d="M10 58C10 30 28 16 60 16s50 14 50 42z" fill="#b9773f" {...line} />
      )}
      <rect x="10" y="56" width="100" height="46" rx="6" fill="#a9652f" {...line} />
      <rect x="10" y="56" width="16" height="46" fill="#ffc531" {...line} />
      <rect x="94" y="56" width="16" height="46" fill="#ffc531" {...line} />
      <rect x="49" y={open ? 66 : 50} width="22" height="24" rx="5" fill="#ffc531" {...line} />
      <circle cx="60" cy={open ? 77 : 61} r="4" fill={INK} />
    </svg>
  );
}

/** Shown next to a run of good trips. */
export function Flame({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 1.500c1 4.500 7 7 7 13a7 7 0 0 1-14 0c0-3.500 2.500-5 3.500-8 1.200 1 2 2.200 2.300 3.300C11.800 7.500 12 4.500 12 1.500z" fill="#ff7b39" stroke={INK} strokeWidth="1.800" strokeLinejoin="round" />
      <path d="M12 12c1 2.200 3.200 3.300 3.200 5.600a3.200 3.200 0 0 1-6.400 0c0-2.300 2.200-3.400 3.200-5.600z" fill="#ffd23f" />
    </svg>
  );
}

const SAIL_COLOURS = ["#fff", "#ffe08a", "#ffb4ac", "#b4e0ff"];

export function ShipArt({ cls, size = 70, damaged = false }: { cls: number; size?: number; damaged?: boolean }) {
  const masts = cls === 0 ? 0 : cls === 3 ? 3 : cls === 2 ? 2 : 1;
  const sail = SAIL_COLOURS[cls % SAIL_COLOURS.length];
  return (
    <svg width={size} height={size * 0.82} viewBox="0 0 80 66" aria-hidden="true" className={`ship-art${damaged ? " damaged" : ""}`}>
      <path d="M6 44h68l-9 18H15z" fill="#b9773f" {...line} />
      <path d="M12 52h56" stroke="#fff4dd" strokeWidth="3" />
      {cls === 0 ? (
        <path d="M46 44 60 26" stroke={INK} strokeWidth="3.400" strokeLinecap="round" />
      ) : (
        Array.from({ length: masts }, (_, i) => {
          const x = 40 + (i - (masts - 1) / 2) * 20;
          return (
            <g key={i}>
              <path d={`M${x} 44V8`} stroke={INK} strokeWidth="3" strokeLinecap="round" />
              <path d={`M${x + 2} 10c14 6 14 22 0 30z`} fill={sail} {...line} />
            </g>
          );
        })
      )}
    </svg>
  );
}
