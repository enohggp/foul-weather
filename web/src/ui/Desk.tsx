// The Desk: captains' slips waiting for an underwriter.

import { useEffect, useMemo, useState } from "react";
import type { Action, House, Slip, View } from "../types";
import { crowns, greeting, offerReasons, pct, seaWord } from "../words";
import { Flag } from "./bits";

interface Props {
  view: View;
  you: House | undefined;
  selected: number | null;
  onSelect: (id: number | null) => void;
  act: (action: Action) => Promise<unknown>;
  busy: boolean;
  line: number;
  setLine: (bps: number) => void;
}

export type Odds = "good" | "even" | "poor";

export function oddsOf(s: Slip): Odds {
  const middle = (s.risk_low_bps + s.risk_high_bps) / 2;
  if (s.offer_bps >= s.risk_high_bps) return "good";
  if (s.offer_bps >= middle) return "even";
  return "poor";
}

const ODDS_WORD: Record<Odds, string> = { good: "Good odds", even: "Even odds", poor: "Poor odds" };
const ODDS_ICON: Record<Odds, string> = { good: "▲", even: "■", poor: "▼" };

function Timer({ s, watch }: { s: Slip; watch: number }) {
  const left = Math.max(0, s.closes - watch);
  return (
    <span className="timer" title={`Closes in ${left} ${left === 1 ? "watch" : "watches"}`}>
      {[0, 1, 2, 3].map((i) => (
        <i key={i} className={i < left ? "on" : ""} />
      ))}
    </span>
  );
}

function RiskBar({ s, rate }: { s: Slip; rate: number }) {
  const span = Math.max(1600, s.risk_high_bps * 1.25, s.offer_bps * 1.25);
  const x = (bps: number) => `${Math.min(100, (bps / span) * 100)}%`;
  return (
    <div className="riskbar" role="img" aria-label={`Likely risk ${pct(s.risk_low_bps)} to ${pct(s.risk_high_bps)}, your rate ${pct(rate)}`}>
      <div className="track" />
      <div
        className="band"
        style={{ left: x(s.risk_low_bps), width: `calc(${x(s.risk_high_bps)} - ${x(s.risk_low_bps)} + 2px)` }}
      />
      <div className="mark offer" style={{ left: x(s.offer_bps) }} title="The captain's limit" />
      <div className="mark rate" style={{ left: x(rate) }} title="Your rate" />
    </div>
  );
}

function fillAt(view: View, s: Slip, you: House, rate: number, line: number) {
  const entries = s.quotes
    .filter((q) => q.house !== you.id)
    .map((q) => {
      const rep = view.houses[q.house]?.reputation ?? 50;
      return { line: q.line_bps, score: q.rate_bps * (100 + Math.trunc((50 - rep) / 5)), mine: false };
    });
  entries.push({
    line,
    score: rate * (100 + Math.trunc((50 - you.reputation) / 5)),
    mine: true,
  });
  entries.sort((a, b) => a.score - b.score || Number(b.mine) - Number(a.mine));
  let left = 10000;
  for (const e of entries) {
    const take = Math.min(e.line, left);
    if (e.mine) return take;
    left -= take;
  }
  return 0;
}

function Expanded({ s, view, you, act, busy, line, setLine }: Omit<Props, "selected" | "onSelect"> & { s: Slip }) {
  const lane = view.lanes[s.lane];
  const mine = you ? s.quotes.find((q) => q.house === you.id) : undefined;
  const floor = Math.max(100, Math.min(s.offer_bps - 100, s.risk_low_bps));
  const [rate, setRate] = useState(mine?.rate_bps ?? s.offer_bps);
  const [why, setWhy] = useState(false);

  useEffect(() => setRate(mine?.rate_bps ?? s.offer_bps), [s.id, s.offer_bps, mine?.rate_bps]);

  const premium = Math.floor(((s.sum_insured * line) / 10000) * (rate / 10000));
  const exposure = Math.floor((s.sum_insured * line) / 10000);
  const fill = you ? fillAt(view, s, you, rate, line) : 0;
  const placed = s.quotes.filter((q) => !you || q.house !== you.id);
  const placedLine = placed.reduce((sum, q) => sum + q.line_bps, 0);
  const cheapest = placed.length ? Math.min(...placed.map((q) => q.rate_bps)) : null;
  const room = you ? you.capital * view.fees.max_gearing - you.net_book : 0;

  return (
    <div className="slip-open">
      <p className="speech">“{greeting(s)}”</p>
      <dl className="facts">
        <dt>Route</dt>
        <dd>
          {view.ports[s.from].name} to {view.ports[s.to].name}
        </dd>
        <dt>Cargo</dt>
        <dd>
          {s.qty} {s.good_name}
        </dd>
        <dt>Sea</dt>
        <dd>
          {lane.name}, {seaWord(lane.sea).toLowerCase()}
        </dd>
        <dt>Ship</dt>
        <dd>
          {s.surveyed !== null ? (
            <>
              Hull <b>{s.surveyed}</b> of 100, surveyed
            </>
          ) : (
            <>
              Said to be {view.captains[s.captain].hull_word}{" "}
              <button
                className="link"
                disabled={busy || !you?.active}
                onClick={() => void act({ kind: "survey", slip: s.id })}
              >
                Survey for {view.fees.survey}
              </button>
            </>
          )}
        </dd>
        <dt>Talk</dt>
        <dd>
          {view.captains[s.captain].rumour}, {view.captains[s.captain].losses} lost in {view.captains[s.captain].voyages + view.captains[s.captain].losses}
        </dd>
        <dt>Insured</dt>
        <dd>{crowns(s.sum_insured)} crowns</dd>
      </dl>

      <div className="odds-row">
        <div>
          <span className="label">Pays up to</span>
          <strong className="big">{pct(s.offer_bps)}</strong>
          <button className="why" onClick={() => setWhy(!why)} aria-expanded={why}>
            Why?
          </button>
        </div>
        <div>
          <span className="label">Likely risk</span>
          <strong className="big">
            {s.risk_low_bps === s.risk_high_bps ? pct(s.risk_low_bps) : `${pct(s.risk_low_bps)} to ${pct(s.risk_high_bps)}`}
          </strong>
        </div>
      </div>
      {why && (
        <ul className="reasons">
          {offerReasons(s).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {s.storm_bps > 0 && (
        <p className="warn">⚠ Storm forecast on this crossing. It adds {pct(s.storm_bps)} to the risk.</p>
      )}
      <RiskBar s={s} rate={rate} />

      <div className="control">
        <span className="label">Your line</span>
        <div className="segment" role="group" aria-label="Your line">
          {[2500, 5000, 10000].map((bps, i) => (
            <button key={bps} className={line === bps ? "on" : ""} onClick={() => setLine(bps)}>
              {bps / 100}% <kbd>{i + 1}</kbd>
            </button>
          ))}
        </div>
      </div>
      <div className="control">
        <label className="label" htmlFor={`rate-${s.id}`}>
          Your rate <b>{pct(rate)}</b>
        </label>
        <input
          id={`rate-${s.id}`}
          type="range"
          min={floor}
          max={s.offer_bps}
          step={5}
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
        />
      </div>

      <p className="room-note">
        {placed.length === 0
          ? "No other house has signed yet."
          : `The Room has signed ${Math.min(100, placedLine / 100)}%, the lowest at ${pct(cheapest!)}.`}{" "}
        {fill === 0
          ? "At this rate you would get nothing. Go lower."
          : fill < line
            ? `At this rate you would get ${fill / 100}%.`
            : ""}
      </p>

      <div className="terms">
        <div>
          <span className="label">You earn now</span>
          <strong className="good-ink">+{crowns(premium)}</strong>
        </div>
        <div>
          <span className="label">If she is lost</span>
          <strong className="bad-ink">−{crowns(exposure)}</strong>
        </div>
      </div>

      {exposure > room && <p className="warn">Your capital cannot carry this line. Choose less, or lay risk off.</p>}

      <button
        className="primary"
        disabled={busy || !you?.active || exposure > room}
        onClick={() => void act({ kind: "quote", slip: s.id, rate_bps: rate, line_bps: line })}
      >
        {mine ? "Amend your line" : "Sign the slip"} <kbd>Enter</kbd>
      </button>
      {mine && (
        <p className="signed">
          ✓ Signed {mine.line_bps / 100}% at {pct(mine.rate_bps)}. The captain decides when the slip closes.
        </p>
      )}
    </div>
  );
}

export default function Desk(props: Props) {
  const { view, you, selected, onSelect } = props;
  const slips = useMemo(
    () => [...view.slips].filter((s) => s.qty > 0).sort((a, b) => a.closes - b.closes || a.id - b.id),
    [view.slips],
  );

  useEffect(() => {
    if (slips.length && !slips.some((s) => s.id === selected)) onSelect(slips[0].id);
    if (!slips.length && selected !== null) onSelect(null);
  }, [slips, selected, onSelect]);

  return (
    <section className="desk" aria-label="The Desk">
      <h2>
        The Desk <small>{slips.length ? `${slips.length} seeking cover` : "No one waiting"}</small>
      </h2>
      <div className="slips">
        {slips.map((s) => {
          const captain = view.captains[s.captain];
          const odds = oddsOf(s);
          const open = s.id === selected;
          const signed = you && s.quotes.some((q) => q.house === you.id);
          return (
            <article key={s.id} className={`slip${open ? " open" : ""}${signed ? " signed-row" : ""}`}>
              <button className="slip-head" onClick={() => onSelect(open ? null : s.id)} aria-expanded={open}>
                <Flag captain={s.captain} />
                <span className="who">
                  <b>{captain.ship}</b>
                  <small>
                    {captain.name} · {crowns(s.sum_insured)}
                  </small>
                </span>
                <span className={`odds ${odds}`}>
                  <span aria-hidden="true">{ODDS_ICON[odds]}</span> {pct(s.offer_bps)}
                  <small>{ODDS_WORD[odds]}</small>
                </span>
                <Timer s={s} watch={view.watch} />
              </button>
              {open && <Expanded {...props} s={s} />}
            </article>
          );
        })}
        {slips.length === 0 && <p className="muted pad">Captains are at sea or out of cover. New slips arrive each watch.</p>}
      </div>
    </section>
  );
}
