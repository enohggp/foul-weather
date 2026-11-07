// Screens that sit over the game: the start, reports and celebrations.

import { useEffect, useRef, useState } from "react";
import { shopName } from "../cast";
import { runTour } from "../tour";
import type { House, View } from "../types";
import { crowns, pct, titleFor } from "../words";
import { Character, Coin, Pip, ShopIcon, Star } from "./art";
import { LineChart } from "./bits";
import { shopColour } from "./Hud";
import { TitleSea } from "./Theatre";

export interface TitleChoice {
  mode: "practice" | "live" | "login";
  name: string;
}

export function Title({
  onStart,
  ready,
  liveReady,
  loginReady,
  error,
  working,
}: {
  onStart: (choice: TitleChoice) => void;
  ready: boolean;
  liveReady: boolean;
  loginReady: boolean;
  error: string | null;
  working: string | null;
}) {
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("fw-house") ?? "";
    } catch {
      return "";
    }
  });
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const go = (mode: TitleChoice["mode"]) => {
    const chosen = name.trim().length >= 2 ? name.trim() : "My Harbor Shop";
    try {
      localStorage.setItem("fw-house", name.trim());
    } catch {
      // A private window may refuse storage. The name just won't be remembered.
    }
    onStart({ mode, name: chosen });
  };
  return (
    <main className="title">
      <TitleSea />
      <div className="title-card">
        <div className="title-pip">
          <Pip size={116} />
          <p className="bubble">Ahoy! Ready to run your own harbor shop?</p>
        </div>
        <h1>Foul Weather</h1>
        <ol className="steps">
          <li>
            <Character id={0} size={58} />
            <span>Captains ask you to protect their ships</span>
          </li>
          <li>
            <span className="step-icon">
              <Coin size={44} />
            </span>
            <span>They pay you coins</span>
          </li>
          <li>
            <span className="step-icon">
              <Star size={46} />
            </span>
            <span>Bring ships home and grow your harbor</span>
          </li>
        </ol>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            go("practice");
          }}
        >
          <label htmlFor="house">Name your shop</label>
          <input
            id="house"
            ref={input}
            value={name}
            maxLength={32}
            placeholder="My Harbor Shop"
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
          <button className="big-button" type="submit" disabled={!ready || !!working}>
            Play!
          </button>
          <div className="title-more">
            <button className="soft-button" type="button" disabled={!ready || !liveReady || !!working} onClick={() => go("live")}>
              Play with others
            </button>
            <button className="soft-button" type="button" disabled={!ready} onClick={() => void runTour()}>
              Watch Pip play
            </button>
          </div>
          {loginReady && (
            <button className="text-link" type="button" disabled={!ready || !!working} onClick={() => go("login")}>
              Sign in with Google or email to save your shop
            </button>
          )}
        </form>
        {working && <p className="working">{working}</p>}
        {error && <p className="problem">{error}</p>}
        <p className="fine">No wallet, no sign-up and no real money. Coins are just for fun.</p>
      </div>
    </main>
  );
}

export interface Toast {
  id: number;
  kind: "good" | "bad" | "plain";
  title: string;
  sub?: string;
}

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <b>{t.title}</b>
          {t.sub && <span>{t.sub}</span>}
        </div>
      ))}
    </div>
  );
}

export function Report({
  view,
  you,
  onNext,
  practice,
}: {
  view: View;
  you: House | undefined;
  onNext: () => void;
  practice: boolean;
}) {
  const open = [...view.houses].filter((h) => h.active).sort((a, b) => b.capital - a.capital);
  const rank = you ? open.findIndex((h) => h.id === you.id) + 1 : 0;
  const closed = view.houses.filter((h) => !h.active).length;
  const podium = open.slice(0, 3);
  const heights = [120, 88, 66];
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label="Harbor Festival">
      <div className="modal center">
        <h2>The Harbor Festival!</h2>
        <p className="lede">
          {you?.active
            ? rank === 1
              ? "You are the best shop in the harbor!"
              : `Your shop came number ${rank} of ${open.length}.`
            : "Your shop closed this time. There is always next season!"}
        </p>
        <div className="podium" aria-label="The top three shops">
          {[podium[1], podium[0], podium[2]].map((h, i) =>
            h ? (
              <div key={h.id} className={`step${h.you ? " you" : ""}`}>
                <ShopIcon colour={shopColour(view, h.id)} size={46} />
                <span className="podium-name">{h.you ? "Your shop" : shopName(h.name)}</span>
                <span className="podium-coins">
                  <Coin size={16} /> {crowns(h.capital)}
                </span>
                <span className="podium-block" style={{ height: heights[[1, 0, 2][i]] }}>
                  {[2, 1, 3][i]}
                </span>
              </div>
            ) : null,
          )}
        </div>
        <p className="report-line">
          Your title: <b>{titleFor(you?.active ? you.capital : 0)}</b>
          {closed > 0 ? `. ${closed} ${closed === 1 ? "shop" : "shops"} closed this season.` : "."}
        </p>
        {practice ? (
          <button className="big-button" onClick={onNext}>
            Play the next season
          </button>
        ) : (
          <p className="working">The next season starts by itself in a moment.</p>
        )}
      </div>
    </div>
  );
}

export function StruckOff({ you, onRefound, onWatch }: { you: House; onRefound: () => void; onWatch: () => void }) {
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label="Your shop ran out of coins">
      <div className="modal center">
        <Pip size={110} mood="worried" />
        <h2>Your shop ran out of coins!</h2>
        <p className="lede">Too many ships sank and there wasn't enough to pay for them. It happens to the best of us.</p>
        {!you.refounded && (
          <button className="big-button" onClick={onRefound}>
            Try again with {crowns(2000)} coins
          </button>
        )}
        <button className="soft-button" onClick={onWatch}>
          Just watch for now
        </button>
      </div>
    </div>
  );
}

export interface Fallen {
  name: string;
  colour: string;
  watch: number;
  owed: number;
  paid: number;
}

export function Collapse({
  fallen,
  lost,
  wrecks,
  onClose,
}: {
  fallen: Fallen[];
  lost: number;
  wrecks: number;
  onClose: () => void;
}) {
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label="One storm">
      <div className="modal">
        <div className="pip-line">
          <Pip size={84} mood="worried" />
          <div>
            <h2>
              One storm closed {fallen.length} {fallen.length === 1 ? "shop" : "shops"}!
            </h2>
            <p>
              Each shop had asked another shop to help pay if a ship sank. When too many ships sank, one shop ran out of
              coins. Then the shop counting on it ran out too, like falling dominoes.
            </p>
          </div>
        </div>
        <div className="dominoes" aria-hidden="true">
          {fallen.map((f, i) => (
            <span key={f.name} style={{ animationDelay: `${0.3 + i * 0.35}s` }}>
              <ShopIcon colour={f.colour} size={58} />
            </span>
          ))}
        </div>
        <ol className="fallen">
          {fallen.map((f) => (
            <li key={f.name}>
              <b>{shopName(f.name)}</b>
              <span>
                paid {crowns(f.paid)} of {crowns(f.owed)}
              </span>
            </li>
          ))}
        </ol>
        <div className="numbers">
          <div>
            <span>Ships lost</span>
            <strong>{wrecks}</strong>
          </div>
          <div>
            <span>Coins gone</span>
            <strong>{crowns(lost)}</strong>
          </div>
        </div>
        <p className="fine">Only the storm was planned. Who fell, and in what order, came from the game's real rules.</p>
        <button className="big-button" onClick={onClose}>
          Open your own shop
        </button>
      </div>
    </div>
  );
}

export function WeekReview({
  view,
  before,
  onClose,
}: {
  view: View;
  before: { capital: number; wrecks: number; failed: number; rate: number };
  onClose: () => void;
}) {
  const you = view.houses.find((h) => h.you);
  const days = view.history;
  const dayLabel = (x: number) => `Day ${x}`;
  const wrecks = view.captains.reduce((sum, c) => sum + c.losses, 0) - before.wrecks;
  const failed = view.houses.filter((h) => !h.active).length - before.failed;
  const change = (you?.capital ?? 0) - before.capital;
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label="The week in review">
      <div className="modal wide">
        <h2>A week went by</h2>
        <p className="lede">Prices, fees and shops all moved by themselves.</p>
        <div className="numbers">
          <div>
            <span>Your coins</span>
            <strong className={change >= 0 ? "good-ink" : "bad-ink"}>
              {change >= 0 ? "+" : "−"}
              {crowns(Math.abs(change))}
            </strong>
          </div>
          <div>
            <span>Ships lost</span>
            <strong>{wrecks}</strong>
          </div>
          <div>
            <span>Shops closed</span>
            <strong>{failed}</strong>
          </div>
          <div>
            <span>Average fee</span>
            <strong>
              {pct(before.rate)} → {pct(view.market.rate_bps)}
            </strong>
          </div>
        </div>
        <div className="charts">
          <LineChart title="Average fee" points={days.map((d) => ({ x: d.day, y: d.rate_bps }))} format={(y) => pct(y)} xLabel={dayLabel} />
          <LineChart title="Town prices" points={days.map((d) => ({ x: d.day, y: d.price_index }))} format={(y) => String(Math.round(y))} xLabel={dayLabel} />
          <LineChart title="Coins in all the shops" points={days.map((d) => ({ x: d.day, y: d.room_capital }))} format={(y) => crowns(y)} xLabel={dayLabel} />
        </div>
        <button className="big-button" onClick={onClose}>
          Back to the harbor
        </button>
      </div>
    </div>
  );
}
