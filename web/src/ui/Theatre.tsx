// A cartoon moment over the map: your ship sinking, or sailing home.

import { useEffect, useRef } from "react";
import { CAST } from "../cast";
import { Character, Coin } from "./art";
import { paintHome, paintTitle, paintWreck, SAILS } from "./scene";

export interface Moment {
  id: number;
  kind: "wreck" | "home";
  ship: string;
  captain: number;
  amount: number;
  /** The second line of the captain's bubble, when the player is the captain. */
  note?: string;
  /** How long the scene runs, when it isn't the usual length. */
  seconds?: number;
}

const SECONDS = { wreck: 6.5, home: 3.4 };
const SIZE = { width: 760, height: 400 };

export function Theatre({ moment, onDone }: { moment: Moment; onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d")!;
    const length = moment.seconds ?? SECONDS[moment.kind];
    const [sail, stripe] = SAILS[moment.captain % SAILS.length];
    const begun = performance.now();
    let frame = 0;
    const draw = (now: number) => {
      const seconds = (now - begun) / 1000;
      const p = Math.min(1, seconds / length);
      if (moment.kind === "wreck") paintWreck(ctx, SIZE.width, SIZE.height, seconds + 4, p, sail, stripe);
      else paintHome(ctx, SIZE.width, SIZE.height, seconds + 2, p, sail, stripe);
      if (p >= 1) {
        onDone();
        return;
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [moment, onDone]);

  const lost = moment.kind === "wreck";
  const cast = CAST[moment.captain % CAST.length];
  return (
    <button className={`theatre ${moment.kind}`} onClick={onDone} aria-label="Close this scene">
      <canvas ref={canvas} width={SIZE.width} height={SIZE.height} />
      <span className="theatre-title">{lost ? "Oh no! A shipwreck!" : "Safe home!"}</span>
      <span className="theatre-person">
        <Character id={moment.captain} mood={lost ? "sad" : "cheer"} size={120} />
        <span className="bubble">
          {lost ? cast.sad : cast.thanks}
          <b>
            <Coin size={22} /> {moment.note ?? (lost ? `You pay ${moment.amount.toLocaleString("en-US")} coins` : "The coins are yours!")}
          </b>
        </span>
      </span>
    </button>
  );
}

/** The moving picture behind the title screen. */
export function TitleSea() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d")!;
    let frame = 0;
    const size = () => {
      el.width = Math.min(window.innerWidth, 1500);
      el.height = Math.round((el.width * window.innerHeight) / Math.max(1, window.innerWidth));
    };
    size();
    window.addEventListener("resize", size);
    const begun = performance.now();
    const draw = (now: number) => {
      paintTitle(ctx, el.width, el.height, (now - begun) / 1000 + 3);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", size);
    };
  }, []);
  return <canvas ref={canvas} className="title-sea" aria-hidden="true" />;
}
