// The cast. Every character is drawn in code, in the same friendly style.

export type Mood = "happy" | "cheer" | "worried" | "sad";

interface Animal {
  fur: string;
  muzzle: string;
  coat: string;
  ears: "round" | "pointy" | "none" | "floppy" | "tuft";
  face: "snout" | "beak" | "tusks";
  nose: string;
  hat: "captain" | "tricorn" | "bandana" | "sailor" | "beanie" | "none";
  mask?: boolean;
  shell?: boolean;
}

// One for each captain, in the same order as the engine's roster.
const ANIMALS: Animal[] = [
  { fur: "#a0693c", muzzle: "#f1d8b8", coat: "#2d9cdb", ears: "round", face: "snout", nose: "#4a2a17", hat: "sailor" }, // otter
  { fur: "#8b5a33", muzzle: "#e8c79f", coat: "#e8504a", ears: "round", face: "snout", nose: "#2e1a0e", hat: "beanie" }, // bear
  { fur: "#ef8a3c", muzzle: "#fff2e0", coat: "#3f8f5f", ears: "pointy", face: "snout", nose: "#2e1a0e", hat: "bandana" }, // fox
  { fur: "#9c7a54", muzzle: "#f0dfc4", coat: "#3d5fc4", ears: "tuft", face: "beak", nose: "#f2a63a", hat: "captain" }, // owl
  { fur: "#f4c26b", muzzle: "#fff4dd", coat: "#b45bb0", ears: "pointy", face: "snout", nose: "#e8708a", hat: "tricorn" }, // cat
  { fur: "#79c267", muzzle: "#d8f0b8", coat: "#8a6a3c", ears: "none", face: "snout", nose: "#3f7a33", hat: "none", shell: true }, // turtle
  { fur: "#b9c4cc", muzzle: "#eef3f6", coat: "#f2a63a", ears: "none", face: "snout", nose: "#2e333a", hat: "bandana" }, // seal
  { fur: "#a5805f", muzzle: "#dcc3a2", coat: "#46505e", ears: "none", face: "tusks", nose: "#3a2616", hat: "captain" }, // walrus
  { fur: "#39424f", muzzle: "#f7f7f2", coat: "#2fae9e", ears: "none", face: "beak", nose: "#f2a63a", hat: "none" }, // penguin
  { fur: "#fff3c9", muzzle: "#fff9e6", coat: "#e36a44", ears: "none", face: "beak", nose: "#f28c28", hat: "sailor" }, // duck
  { fur: "#8d8f99", muzzle: "#eceef2", coat: "#5a5fc4", ears: "round", face: "snout", nose: "#23252b", hat: "bandana", mask: true }, // raccoon
  { fur: "#d9a668", muzzle: "#fbeed8", coat: "#c43a3a", ears: "floppy", face: "snout", nose: "#2e1a0e", hat: "tricorn" }, // dog
];

const INK = "#3b2a1e";

function Eyes({ mood }: { mood: Mood }) {
  if (mood === "cheer") {
    return (
      <g fill="none" stroke={INK} strokeWidth="3.4" strokeLinecap="round">
        <path d="M31 46q6-7 12 0" />
        <path d="M57 46q6-7 12 0" />
      </g>
    );
  }
  const brows =
    mood === "worried" ? "M29 36l12 -5M71 36l-12 -5" : mood === "sad" ? "M30 33l12 6M70 33l-12 6" : "";
  return (
    <g>
      <ellipse cx="37" cy="47" rx="7.500" ry="8.500" fill="#fff" stroke={INK} strokeWidth="2" />
      <ellipse cx="63" cy="47" rx="7.500" ry="8.500" fill="#fff" stroke={INK} strokeWidth="2" />
      <circle cx="38" cy="48" r="4.300" fill={INK} />
      <circle cx="62" cy="48" r="4.300" fill={INK} />
      <circle cx="39.500" cy="46" r="1.500" fill="#fff" />
      <circle cx="63.500" cy="46" r="1.500" fill="#fff" />
      {brows && <path d={brows} stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />}
    </g>
  );
}

function Mouth({ mood, y }: { mood: Mood; y: number }) {
  if (mood === "sad") return <path d={`M42 ${y + 5}q8 -7 16 0`} fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />;
  if (mood === "worried") return <path d={`M43 ${y + 3}q4 -3 7 0t7 0`} fill="none" stroke={INK} strokeWidth="2.800" strokeLinecap="round" />;
  return (
    <g>
      <path d={`M40 ${y}q10 11 20 0z`} fill="#b5413a" stroke={INK} strokeWidth="2.500" strokeLinejoin="round" />
      {mood === "cheer" && <path d={`M44 ${y + 3}q6 4 12 0`} fill="#f7a0a0" />}
    </g>
  );
}

function Ears({ a }: { a: Animal }) {
  const line = { stroke: INK, strokeWidth: 3, strokeLinejoin: "round" as const };
  switch (a.ears) {
    case "round":
      return (
        <g fill={a.fur} {...line}>
          <circle cx="24" cy="28" r="11" />
          <circle cx="76" cy="28" r="11" />
        </g>
      );
    case "pointy":
      return (
        <g fill={a.fur} {...line}>
          <path d="M18 40L20 12 42 26z" />
          <path d="M82 40L80 12 58 26z" />
        </g>
      );
    case "tuft":
      return (
        <g fill={a.fur} {...line}>
          <path d="M22 34L14 12 38 24z" />
          <path d="M78 34L86 12 62 24z" />
        </g>
      );
    case "floppy":
      return (
        <g fill="#a9743f" {...line}>
          <path d="M22 28c-14 2-16 24-8 34 8-2 13-14 16-26z" />
          <path d="M78 28c14 2 16 24 8 34-8-2-13-14-16-26z" />
        </g>
      );
    default:
      return null;
  }
}

function Hat({ a }: { a: Animal }) {
  const line = { stroke: INK, strokeWidth: 3, strokeLinejoin: "round" as const };
  switch (a.hat) {
    case "captain":
      return (
        <g {...line}>
          <path d="M26 30c-6-16 14-22 24-22s30 6 24 22z" fill="#fff" />
          <path d="M24 30h52l2 8H22z" fill="#2c3e6b" />
          <circle cx="50" cy="20" r="5" fill="#ffc531" strokeWidth="2" />
        </g>
      );
    case "tricorn":
      return (
        <g {...line}>
          <path d="M10 30c12 2 18-20 40-20s28 22 40 20c-8 9-22 12-40 12s-32-3-40-12z" fill="#3a2a4e" />
          <path d="M16 33c10 4 22 5 34 5s24-1 34-5" fill="none" stroke="#ffc531" strokeWidth="2.500" />
        </g>
      );
    case "bandana":
      return (
        <g {...line}>
          <path d="M24 34c-2-16 12-24 26-24s28 8 26 24c-16-6-36-6-52 0z" fill="#e8504a" />
          <circle cx="40" cy="22" r="2.200" fill="#fff" stroke="none" />
          <circle cx="56" cy="19" r="2.200" fill="#fff" stroke="none" />
          <circle cx="66" cy="27" r="2.200" fill="#fff" stroke="none" />
          <path d="M76 30l13-6-4 11 7 7-14-4z" fill="#e8504a" />
        </g>
      );
    case "sailor":
      return (
        <g {...line}>
          <path d="M30 26c0-10 40-10 40 0l3 8c-14-4-32-4-46 0z" fill="#fff" />
          <path d="M28 30c14-4 30-4 44 0" fill="none" stroke="#2d9cdb" strokeWidth="3" />
        </g>
      );
    case "beanie":
      return (
        <g {...line}>
          <path d="M26 32c-2-16 12-24 24-24s26 8 24 24c-16-5-32-5-48 0z" fill="#f2a63a" />
          <circle cx="50" cy="8" r="5" fill="#e8504a" />
          <path d="M26 30c16-5 32-5 48 0v6c-16-5-32-5-48 0z" fill="#e8504a" />
        </g>
      );
    default:
      return null;
  }
}

/** A captain, drawn with a mood that matches what just happened to them. */
export function Character({ id, mood = "happy", size = 96 }: { id: number; mood?: Mood; size?: number }) {
  const a = ANIMALS[id % ANIMALS.length];
  const line = { stroke: INK, strokeWidth: 3, strokeLinejoin: "round" as const };
  const mouthY = a.face === "snout" ? 66 : a.face === "tusks" ? 71 : 70;
  return (
    <svg className={`character mood-${mood}`} width={size} height={size * 1.2} viewBox="0 0 100 120" aria-hidden="true">
      {/* Body */}
      {a.shell && <ellipse cx="50" cy="104" rx="40" ry="26" fill="#5e9d4e" {...line} />}
      <path d="M22 120c0-22 12-34 28-34s28 12 28 34z" fill={a.coat} {...line} />
      <circle cx="50" cy="102" r="2.500" fill="#ffc531" stroke={INK} strokeWidth="1.500" />
      <circle cx="50" cy="113" r="2.500" fill="#ffc531" stroke={INK} strokeWidth="1.500" />
      <Ears a={a} />
      {/* Head */}
      <ellipse cx="50" cy="52" rx="34" ry="35" fill={a.fur} {...line} />
      {a.mask && <path d="M20 48c6-10 22-10 30-2 8-8 24-8 30 2-4 12-22 12-30 6-8 6-26 6-30-6z" fill="#3b3d46" />}
      {a.face === "beak" && (
        <>
          <ellipse cx="50" cy="60" rx="24" ry="22" fill={a.muzzle} />
          <path d="M38 62q12-9 24 0-12 14-24 0z" fill={a.nose} {...line} />
        </>
      )}
      {a.face === "snout" && (
        <>
          <ellipse cx="50" cy="66" rx="20" ry="15" fill={a.muzzle} />
          <ellipse cx="50" cy="59" rx="5.500" ry="4" fill={a.nose} stroke={INK} strokeWidth="1.800" />
        </>
      )}
      {a.face === "tusks" && (
        <>
          <ellipse cx="38" cy="66" rx="14" ry="11" fill={a.muzzle} {...line} />
          <ellipse cx="62" cy="66" rx="14" ry="11" fill={a.muzzle} {...line} />
          <ellipse cx="50" cy="59" rx="5" ry="3.600" fill={a.nose} />
          <path d="M40 74l-3 17 8-14zM60 74l3 17-8-14z" fill="#fff8e6" stroke={INK} strokeWidth="2" />
        </>
      )}
      {a.face !== "beak" && <Mouth mood={mood} y={mouthY} />}
      {a.face === "beak" && mood === "sad" && <path d="M44 78q6-4 12 0" fill="none" stroke={INK} strokeWidth="2.500" strokeLinecap="round" />}
      <Eyes mood={mood} />
      {mood === "sad" && <path d="M29 56q-5 8 0 10 5-2 0-10z" fill="#6cc6f0" stroke="#3b8fc0" strokeWidth="1.200" />}
      <Hat a={a} />
    </svg>
  );
}

/** Pip the parrot, who teaches you the game. */
export function Pip({ size = 110, mood = "happy" }: { size?: number; mood?: Mood }) {
  const line = { stroke: INK, strokeWidth: 3.200, strokeLinejoin: "round" as const };
  return (
    <svg className={`pip mood-${mood}`} width={size} height={size} viewBox="0 0 110 110" aria-hidden="true">
      <path d="M46 92l-8 16 14-7 2 9 8-17z" fill="#2d9cdb" {...line} />
      <ellipse cx="56" cy="66" rx="27" ry="31" fill="#e8504a" {...line} />
      <ellipse cx="60" cy="74" rx="16" ry="19" fill="#ffc531" />
      <path className="pip-wing" d="M33 54c-14 8-17 26-9 38 12-2 18-14 18-28z" fill="#2fae6e" {...line} />
      <circle cx="58" cy="34" r="25" fill="#e8504a" {...line} />
      <path d="M46 10c2-8 10-9 12-2 3-6 11-4 10 3" fill="#2fae6e" {...line} />
      <circle cx="66" cy="31" r="10" fill="#fff" stroke={INK} strokeWidth="2.400" />
      {mood === "cheer" ? (
        <path d="M60 32q6-7 12 0" fill="none" stroke={INK} strokeWidth="3.200" strokeLinecap="round" />
      ) : (
        <>
          <circle cx="68" cy="31" r="5.200" fill={INK} />
          <circle cx="70" cy="29" r="1.800" fill="#fff" />
        </>
      )}
      <path d="M78 34c14-1 22 7 19 18-6-6-12-7-21-5z" fill="#ffc531" {...line} />
      <path d="M76 47c6-1 12 0 16 3-5 5-12 6-17 2z" fill="#f2953a" {...line} />
      <path d="M50 96v7M63 96v7" stroke="#f2a63a" strokeWidth="4.500" strokeLinecap="round" />
    </svg>
  );
}

export function GoodIcon({ good, size = 28 }: { good: string; size?: number }) {
  const props = { width: size, height: size, viewBox: "0 0 32 32", "aria-hidden": true, className: "good-icon" };
  const line = { stroke: INK, strokeWidth: 2, strokeLinejoin: "round" as const };
  switch (good) {
    case "grain":
      return (
        <svg {...props}>
          <path d="M16 29V10" stroke={INK} strokeWidth="2.400" strokeLinecap="round" />
          {[0, 1, 2].map((i) => (
            <g key={i} fill="#ffc531" {...line}>
              <ellipse cx="10.500" cy={13 + i * 5} rx="5" ry="2.800" transform={`rotate(-30 10.500 ${13 + i * 5})`} />
              <ellipse cx="21.500" cy={13 + i * 5} rx="5" ry="2.800" transform={`rotate(30 21.500 ${13 + i * 5})`} />
            </g>
          ))}
          <ellipse cx="16" cy="7" rx="3" ry="5" fill="#ffc531" {...line} />
        </svg>
      );
    case "timber":
      return (
        <svg {...props}>
          <rect x="3" y="17" width="26" height="9" rx="4.500" fill="#b9773f" {...line} />
          <rect x="6" y="7" width="24" height="9" rx="4.500" fill="#d39a5e" {...line} />
          <ellipse cx="9" cy="11.500" rx="3" ry="4" fill="#f1cf9e" {...line} />
        </svg>
      );
    case "iron":
      return (
        <svg {...props}>
          <path d="M3 25l5-13h16l5 13z" fill="#9aa8b5" {...line} />
          <path d="M9 12l3-6h8l3 6z" fill="#c6d0d9" {...line} />
        </svg>
      );
    case "spice":
      return (
        <svg {...props}>
          <path d="M8 13c-5 5-5 16 8 16s13-11 8-16z" fill="#e8703a" {...line} />
          <path d="M10 13c3-3 9-3 12 0-3 3-9 3-12 0z" fill="#ffc531" {...line} />
          <path d="M16 11V4" stroke={INK} strokeWidth="2.400" strokeLinecap="round" />
          <circle cx="16" cy="4" r="2.200" fill="#e8504a" {...line} />
        </svg>
      );
    case "silk":
      return (
        <svg {...props}>
          <rect x="4" y="9" width="24" height="16" rx="8" fill="#e36ba4" {...line} />
          <path d="M12 10c-2 5-2 10 0 14M20 10c-2 5-2 10 0 14" fill="none" stroke="#ffd6ea" strokeWidth="2" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <rect x="5" y="11" width="22" height="16" rx="2" fill="#d39a5e" {...line} />
          <path d="M5 11l4-6h14l4 6M16 5v22" fill="none" {...line} />
        </svg>
      );
  }
}

export function Coin({ size = 24 }: { size?: number }) {
  return (
    <svg className="coin" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10.500" fill="#ffc531" stroke="#a8690f" strokeWidth="2" />
      <circle cx="12" cy="12" r="6.800" fill="#ffdc6b" stroke="#d99a1e" strokeWidth="1.500" />
      <path d="M9 9.500h6M9 14.500h6" stroke="#d99a1e" strokeWidth="1.800" strokeLinecap="round" />
    </svg>
  );
}

export function Star({ size = 24 }: { size?: number }) {
  return (
    <svg className="star" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2l3 6.600 7.200.8-5.400 4.800 1.500 7.100L12 17.600 5.700 21.300l1.500-7.100L1.800 9.400 9 8.600z"
        fill="#ffd23f"
        stroke="#b57a0c"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A row of little boats. The red ones are how many of that many would sink. */
/** Green is a great deal, gold could go either way, red loses money. */
export function DealMeter({ danger }: { danger: number }) {
  const place = Math.min(0.97, Math.max(0.03, danger / 1.5));
  return (
    <span className="meter-bar" role="img" aria-label={danger < 0.7 ? "In the green" : danger < 1 ? "In the middle" : "In the red"}>
      <span className="meter-zones" aria-hidden="true">
        <i className="z-good" />
        <i className="z-ok" />
        <i className="z-bad" />
      </span>
      <svg className="meter-arrow" style={{ left: `${place * 100}%` }} width="22" height="16" viewBox="0 0 22 16" aria-hidden="true">
        <path d="M2 2h18L11 14z" fill="#fff" stroke={INK} strokeWidth="2.400" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export const AWNINGS = ["#2d9cdb", "#2fae6e", "#f2a63a", "#b45bb0", "#e36ba4", "#5a5fc4"];
export const YOUR_AWNING = "#e8504a";

export function ShopIcon({ colour, closed = false, size = 34 }: { colour: string; closed?: boolean; size?: number }) {
  return (
    <svg className={`shop-icon${closed ? " toppled" : ""}`} width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <rect x="5" y="13" width="24" height="18" fill="#fff8e8" stroke={INK} strokeWidth="2.200" strokeLinejoin="round" />
      <rect x="13.500" y="19" width="7" height="12" fill={colour} stroke={INK} strokeWidth="1.800" />
      <path d="M2.500 13L7 3h20l4.500 10z" fill={colour} stroke={INK} strokeWidth="2.200" strokeLinejoin="round" />
      <path d="M12 3l-2 10M22 3l2 10" stroke="#fff" strokeWidth="2" opacity="0.7" />
    </svg>
  );
}
