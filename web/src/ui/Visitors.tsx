// The dock: captains come here one at a time and ask you to protect their ships.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CAST, cargo, fullName, place } from "../cast";
import { SKILL, unlocked } from "../progress";
import type { Action, House, Slip, View } from "../types";
import { crowns } from "../words";
import { Character, Coin, DealMeter, GoodIcon } from "./art";

export type Verdict = "great" | "ok" | "bad";

export interface Deal {
  share: number;
  rate: number;
  earn: number;
  lose: number;
  chance: number;
  verdict: Verdict;
  /** What the danger is worth for every coin of pay. Above 1, the deal loses money. */
  danger: number;
  full: boolean;
}

function effective(rate: number, reputation: number) {
  return rate * (100 + Math.trunc((50 - reputation) / 5));
}

/**
 * How much of a ship the shop takes on. One wreck costs about a quarter of its coins at
 * most, so a beginner can't lose everything to bad luck, and deals grow as the shop grows.
 */
function shareFor(s: Slip, you: House | undefined) {
  const wanted = (((you?.capital ?? 0) * 0.25) / Math.max(1, s.sum_insured)) * 10000;
  return Math.max(1000, Math.min(5000, Math.round(wanted / 500) * 500));
}

/** Works out the fee, the risk, and whether this is a good deal. */
export function dealFor(view: View, s: Slip, you: House | undefined): Deal {
  const share = shareFor(s, you);
  const others = s.quotes
    .filter((q) => q.house !== you?.id)
    .map((q) => ({ line: q.line_bps, rate: q.rate_bps, score: effective(q.rate_bps, view.houses[q.house]?.reputation ?? 50) }))
    .sort((a, b) => a.score - b.score);
  const taken = others.reduce((sum, q) => sum + q.line, 0);
  // If rival shops have left no room, offer a little less so the captain picks you.
  let rate = s.offer_bps;
  if (taken > 10000 - share && others.length) {
    rate = Math.max(60, Math.min(s.offer_bps, Math.floor((others[0].rate * 96) / 100)));
  }
  const cover = (s.sum_insured * share) / 10000;
  const earn = Math.floor((cover * rate) / 10000);
  const chance = (s.risk_low_bps + s.risk_high_bps) / 2;
  const expected = earn - (cover * chance) / 10000;
  const verdict: Verdict = expected > earn * 0.3 ? "great" : expected > 0 ? "ok" : "bad";
  const danger = earn > 0 ? (cover * chance) / 10000 / earn : 9;
  return { share, rate, earn, lose: Math.floor(cover), chance, verdict, danger, full: taken >= 10000 };
}

const VERDICT: Record<Verdict, { word: string; hint: string }> = {
  great: { word: "Great deal!", hint: "The pay is good and the sea looks kind." },
  ok: { word: "Could go either way", hint: "It might pay off. It might not." },
  bad: { word: "Not worth it!", hint: "The pay is too small for this much danger." },
};

function oneIn(bps: number) {
  if (bps >= 5000) return "about 1 in 2";
  return `about 1 in ${Math.max(2, Math.round(10000 / Math.max(1, bps)))}`;
}

interface CardProps {
  slip: Slip;
  view: View;
  you: House | undefined;
  xp: number;
  watchMs: number;
  busy: boolean;
  spotlight: string | null;
  lockNo: boolean;
  onYes: (slip: Slip, deal: Deal) => void;
  onNo: (slip: Slip, deal: Deal) => void;
  act: (action: Action) => Promise<unknown>;
  onInspect: () => void;
}

function VisitorCard({ slip, view, you, xp, watchMs, busy, spotlight, lockNo, onYes, onNo, act, onInspect }: CardProps) {
  const [why, setWhy] = useState(false);
  // A new card waits a moment, so a tap meant for the last captain can't land on this one.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setArmed(true), 450);
    return () => window.clearTimeout(timer);
  }, []);

  const deal = dealFor(view, slip, you);
  const cast = CAST[slip.captain % CAST.length];
  const left = Math.max(0, slip.closes - view.watch);
  const seconds = Math.ceil((left * watchMs) / 1000);
  const total = Math.max(1, slip.closes - slip.opened);
  const danger = slip.storm_bps > 0;
  const mood = deal.verdict === "bad" || danger ? "worried" : "happy";
  const canInspect = unlocked(xp, SKILL.inspector) && slip.surveyed === null;
  const room = you ? you.capital * view.fees.max_gearing - you.net_book : 0;
  const tooMuch = deal.lose > room;
  const lane = view.lanes[slip.lane];

  return (
    <article className={`visitor v-${deal.verdict}`}>
      <span className="visitor-timer" aria-hidden="true">
        <i style={{ width: `${(left / total) * 100}%` }} />
      </span>
      <div className="visitor-top">
        <Character id={slip.captain} mood={mood} size={88} />
        <div className="visitor-say">
          <b>{fullName(slip.captain)}</b>
          <p className="bubble small-bubble">{danger ? cast.worried : cast.hello}</p>
        </div>
      </div>

      <p className="route">
        <GoodIcon good={slip.good_name} size={26} />
        <span>
          {cargo(slip.qty, slip.good_name)} to <b>{place(view.ports[slip.to].name)}</b>
        </span>
        <small title="Time until this ship sails">{seconds}s</small>
      </p>

      <div className="payoff">
        <div className={`pay good${spotlight === "earn" ? " spot" : ""}`} data-coach="earn">
          <span>You get now</span>
          <strong>
            <Coin size={22} /> +{crowns(deal.earn)}
          </strong>
        </div>
        <div className={`pay bad${spotlight === "lose" ? " spot" : ""}`} data-coach="lose">
          <span>If it sinks</span>
          <strong>
            <Coin size={22} /> −{crowns(deal.lose)}
          </strong>
        </div>
      </div>

      <div className={`verdict ${deal.verdict}${spotlight === "danger" ? " spot" : ""}`} data-coach="danger">
        <div>
          <b>{VERDICT[deal.verdict].word}</b>
          <button className="why-link" onClick={() => setWhy(!why)} aria-expanded={why}>
            Why?
          </button>
        </div>
        <DealMeter danger={deal.danger} />
        {why && (
          <p className="why-text">
            {VERDICT[deal.verdict].hint} Ships like this sink {oneIn(deal.chance)} trips. The sea on this route is{" "}
            {lane.sea >= 60 ? "very rough" : lane.sea >= 42 ? "rough" : "calm"}.
            {danger ? " A storm is coming this way!" : ""}
          </p>
        )}
      </div>

      {canInspect && (
        <button
          className="inspect"
          disabled={busy}
          onClick={() => {
            onInspect();
            void act({ kind: "survey", slip: slip.id });
          }}
        >
          Send the inspector ({view.fees.survey} coins)
        </button>
      )}
      {slip.surveyed !== null && (
        <p className="inspected">
          Inspector says: {slip.surveyed >= 75 ? "strong ship" : slip.surveyed >= 55 ? "okay ship" : "falling apart!"} ({slip.surveyed} out of 100)
        </p>
      )}

      <div className="yes-no">
        <button className="no" disabled={busy || lockNo || !armed} onClick={() => onNo(slip, deal)}>
          No thanks
        </button>
        <button
          className={`yes${spotlight === "yes" ? " spot" : ""}`}
          data-coach="yes"
          disabled={busy || tooMuch || !you?.active || !armed}
          onClick={() => onYes(slip, deal)}
        >
          {tooMuch ? "Not enough coins" : "Yes, protect it!"}
        </button>
      </div>
    </article>
  );
}

interface Props extends Omit<CardProps, "slip"> {
  passed: Set<number>;
  only: number | null;
  children?: ReactNode;
}

export default function Dock({ view, passed, only, children, ...rest }: Props) {
  const [chosen, setChosen] = useState<number | null>(null);
  const you = rest.you;
  const waiting = useMemo(
    () =>
      view.slips
        .filter(
          (s) =>
            s.qty > 0 &&
            !passed.has(s.id) &&
            (only === null || s.id === only) &&
            !(you && s.quotes.some((q) => q.house === you.id)),
        )
        .sort((a, b) => a.id - b.id),
    [view, passed, only, you],
  );
  const current = waiting.find((s) => s.id === chosen) ?? waiting[0];

  return (
    <section className="dock" aria-label="Captains at your dock">
      <div className="dock-head">
        <h2>At your dock</h2>
        {waiting.length > 1 && (
          <div className="queue" aria-label="Captains waiting">
            {waiting.slice(0, 6).map((s) => (
              <button
                key={s.id}
                className={`face ${dealFor(view, s, you).verdict}${s.id === current?.id ? " on" : ""}`}
                onClick={() => setChosen(s.id)}
                aria-label={`See ${fullName(s.captain)}`}
                title={fullName(s.captain)}
              >
                <Character id={s.captain} size={36} />
              </button>
            ))}
          </div>
        )}
      </div>
      {current ? (
        <VisitorCard key={current.id} slip={current} view={view} {...rest} />
      ) : (
        <div className="dock-empty">
          <p>No one is here right now. The next captain will be along soon!</p>
        </div>
      )}
      {children}
    </section>
  );
}
