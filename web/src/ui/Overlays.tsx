// Screens that sit over the game: the title, reports and the clerk's notes.

import { useEffect, useRef, useState } from "react";
import type { House, View } from "../types";
import { crowns, pct, titleFor } from "../words";
import { runTour } from "../tour";
import { LineChart, Seal } from "./bits";

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
  const valid = name.trim().length >= 2;
  const go = (mode: TitleChoice["mode"]) => {
    if (!valid) {
      input.current?.focus();
      return;
    }
    try {
      localStorage.setItem("fw-house", name.trim());
    } catch {
      // A private window may refuse storage. The name just won't be remembered.
    }
    onStart({ mode, name: name.trim() });
  };
  return (
    <main className="title">
      <div className="title-card">
        <p className="kicker">Marine underwriters of Merrow</p>
        <h1>Foul Weather</h1>
        <p className="tag">You don't trade the goods. You carry the risk.</p>
        <p className="lede">
          Captains need cover before they sail. Price it well and you grow rich on other people's courage. Price it
          badly, and one storm takes the house.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            go("practice");
          }}
        >
          <label htmlFor="house">Name your house</label>
          <input
            id="house"
            ref={input}
            value={name}
            maxLength={32}
            placeholder="Quill & Daughters"
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
          <button className="primary" type="submit" disabled={!ready || !!working}>
            Open for business
          </button>
          <button
            className="secondary"
            type="button"
            disabled={!ready || !liveReady || !!working}
            onClick={() => go("live")}
          >
            Join the live Room
          </button>
          {loginReady && (
            <button className="link" type="button" disabled={!ready || !!working} onClick={() => go("login")}>
              Sign in with Google or email to keep your house
            </button>
          )}
        </form>
        <button className="link tour-link" type="button" disabled={!ready} onClick={() => void runTour()}>
          ▶ Take the guided tour, 3 minutes with voice
        </button>
        {working && <p className="muted small">{working}</p>}
        {error && <p className="warn">{error}</p>}
        <p className="muted small fine">
          No wallet, no sign-up, no real money. Crowns are game points with no cash value.
        </p>
      </div>
    </main>
  );
}

export function Notes({ note, onDismiss }: { note: { title: string; body: string } | null; onDismiss: () => void }) {
  if (!note) return null;
  return (
    <aside className="note" role="status">
      <p className="note-from">Your clerk writes</p>
      <h3>{note.title}</h3>
      <p>{note.body}</p>
      <button className="link" onClick={onDismiss}>
        Understood
      </button>
    </aside>
  );
}

export interface Toast {
  id: number;
  kind: "safe" | "lost" | "bound" | "paid" | "plain";
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

function rankOf(view: View, you: House | undefined) {
  const live = [...view.houses].filter((h) => h.active).sort((a, b) => b.capital - a.capital);
  return you ? live.findIndex((h) => h.id === you.id) + 1 : 0;
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
  const capital = you?.active ? you.capital : 0;
  const ranked = [...view.houses].sort((a, b) => Number(b.active) - Number(a.active) || b.capital - a.capital);
  const failed = view.houses.filter((h) => !h.active).length;
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label="Season report">
      <div className="modal">
        <p className="kicker">Season {view.season} closes</p>
        <h2>{titleFor(capital)}</h2>
        {you && (
          <p className="lede">
            {you.name} ends the season with <b>{crowns(capital)} crowns</b>
            {you.active ? `, ranked ${rankOf(view, you)} of ${view.houses.filter((h) => h.active).length} houses still standing` : ""}.
          </p>
        )}
        <div className="kpis three">
          <div>
            <span className="label">Premiums</span>
            <strong>{crowns(you?.premiums ?? 0)}</strong>
          </div>
          <div>
            <span className="label">Claims paid</span>
            <strong>{crowns(you?.claims ?? 0)}</strong>
          </div>
          <div>
            <span className="label">Houses lost</span>
            <strong>{failed}</strong>
          </div>
        </div>
        <table className="houses">
          <tbody>
            {ranked.slice(0, 8).map((h) => (
              <tr key={h.id} className={`${h.you ? "you" : ""}${h.active ? "" : " dead"}`}>
                <td>
                  <Seal house={h} size={20} /> {h.name}
                </td>
                <td className="num">{h.active ? crowns(h.capital) : "Struck off"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {practice ? (
          <button className="primary" onClick={onNext}>
            Open next season
          </button>
        ) : (
          <p className="muted small">The next season opens by itself in a few watches.</p>
        )}
      </div>
    </div>
  );
}

export function StruckOff({
  you,
  onRefound,
  onWatch,
}: {
  you: House;
  onRefound: () => void;
  onWatch: () => void;
}) {
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label="Your house has failed">
      <div className="modal">
        <p className="kicker">Notice to the Room</p>
        <h2>{you.name} is struck from the register</h2>
        <p className="lede">
          The claims came due and the money was not there. {crowns(you.premiums)} crowns of premium could not cover
          what you owed. Every promise you made is void, and the captains you insured are on their own.
        </p>
        {!you.refounded && (
          <button className="primary" onClick={onRefound}>
            Found the house again with {crowns(2000)} crowns
          </button>
        )}
        <button className="secondary" onClick={onWatch}>
          Watch the season play out
        </button>
        <p className="muted small">A house may be founded again once in a season, with half the money and a poor name.</p>
      </div>
    </div>
  );
}

export interface Fallen {
  name: string;
  watch: number;
  owed: number;
  paid: number;
}

export function Collapse({
  fallen,
  lost,
  watches,
  wrecks,
  onClose,
}: {
  fallen: Fallen[];
  lost: number;
  watches: number;
  wrecks: number;
  onClose: () => void;
}) {
  const first = fallen[0]?.watch ?? 0;
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label="The spiral">
      <div className="modal">
        <p className="kicker">{watches} watches later</p>
        <h2>One storm, {fallen.length} {fallen.length === 1 ? "house" : "houses"} gone</h2>
        <p className="lede">
          Each house thought it had passed its risk on. It had passed it to a house that had done the same. When claims
          fell due, one failure left the next without its reinsurance. Real insurance markets have failed the same way.
        </p>
        <ol className="fallen">
          {fallen.map((f) => (
            <li key={f.name}>
              <span className="when">+{f.watch - first}</span>
              <b>{f.name}</b>
              <span className="num">
                paid {crowns(f.paid)} of {crowns(f.owed)}
              </span>
            </li>
          ))}
        </ol>
        <div className="kpis three">
          <div>
            <span className="label">Ships lost this season</span>
            <strong>{wrecks}</strong>
          </div>
          <div>
            <span className="label">Capital destroyed</span>
            <strong>{crowns(lost)}</strong>
          </div>
          <div>
            <span className="label">Crowns created</span>
            <strong>0</strong>
          </div>
        </div>
        <p className="muted small">
          Only the storm was staged. Who fell, and in what order, came from the same rules the contract runs, replaying one fixed season.
        </p>
        <button className="primary" onClick={onClose}>
          Open your own house
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
        <p className="kicker">A week has passed</p>
        <h2>The economy moved without you</h2>
        <div className="kpis four">
          <div>
            <span className="label">Your capital</span>
            <strong className={change >= 0 ? "good-ink" : "bad-ink"}>
              {change >= 0 ? "+" : "−"}
              {crowns(Math.abs(change))}
            </strong>
          </div>
          <div>
            <span className="label">Ships lost</span>
            <strong>{wrecks}</strong>
          </div>
          <div>
            <span className="label">Houses failed</span>
            <strong>{failed}</strong>
          </div>
          <div>
            <span className="label">Market rate</span>
            <strong>
              {pct(before.rate)} → {pct(view.market.rate_bps)}
            </strong>
          </div>
        </div>
        <div className="charts">
          <LineChart
            title="Market rate"
            points={days.map((d) => ({ x: d.day, y: d.rate_bps }))}
            format={(y) => pct(y)}
            xLabel={dayLabel}
          />
          <LineChart
            title="Merrow price index"
            points={days.map((d) => ({ x: d.day, y: d.price_index }))}
            format={(y) => String(Math.round(y))}
            xLabel={dayLabel}
          />
          <LineChart
            title="Capital in the Room"
            points={days.map((d) => ({ x: d.day, y: d.room_capital }))}
            format={(y) => crowns(y)}
            xLabel={dayLabel}
          />
        </div>
        <button className="primary" onClick={onClose}>
          Back to the desk
        </button>
      </div>
    </div>
  );
}
