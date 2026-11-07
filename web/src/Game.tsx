// The game screen: one world view, however it is being driven.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as sound from "./audio";
import { NORMAL_WATCH_MS, PracticeDriver, WEEK_IN_A_MINUTE_MS } from "./engine";
import type { Action, Driver, Receipt, View } from "./types";
import Chart from "./ui/Chart";
import Desk from "./ui/Desk";
import { Notes, Report, StruckOff, Toasts, WeekReview, type Toast } from "./ui/Overlays";
import Side, { type Hood, type Tab } from "./ui/Side";
import { crowns, eventLine, pct, when, watchName, type Line } from "./words";

interface Props {
  driver: Driver;
  houseName: string;
  hood: Hood;
  onExit: () => void;
  onSpiral: () => void;
  autoplay: boolean;
  spiral?: boolean;
}

interface Note {
  title: string;
  body: string;
}

const seen = new Set<string>();

function useView(driver: Driver) {
  const [view, setView] = useState<View | null>(null);
  useEffect(() => driver.subscribe(setView), [driver]);
  return view;
}

export default function Game({ driver, houseName, hood, onExit, onSpiral, autoplay, spiral }: Props) {
  const view = useView(driver);
  const [selected, setSelected] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("book");
  const [line, setLine] = useState(5000);
  const [busy, setBusy] = useState(false);
  const [ticker, setTicker] = useState<(Line & { seq: number })[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [flash, setFlash] = useState(0);
  const [muted, setMuted] = useState(sound.isMuted);
  const [pace, setPace] = useState(autoplay ? NORMAL_WATCH_MS : 0);
  const [error, setError] = useState<string | null>(null);
  const [priceTrail, setPriceTrail] = useState<Record<string, number[]>>({});
  const [week, setWeek] = useState<{ left: number; capital: number; wrecks: number; failed: number; rate: number } | null>(null);
  const [review, setReview] = useState<{ capital: number; wrecks: number; failed: number; rate: number } | null>(null);
  const [watching, setWatching] = useState(false);
  const toastId = useRef(1);
  const lastSeq = useRef(0);
  const previous = useRef<View | null>(null);
  const myQuotes = useRef(new Map<number, { rate: number; line: number; captain: number }>());

  const practice = driver instanceof PracticeDriver ? driver : null;
  const you = view?.houses.find((h) => h.you);

  const note = useCallback((key: string, title: string, body: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    setNotes((list) => [...list, { title, body }]);
  }, []);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = toastId.current++;
    setToasts((list) => [...list.slice(-3), { ...t, id }]);
    window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 4200);
  }, []);

  const setSpeed = useCallback(
    (ms: number) => {
      practice?.setPace(ms);
      setPace(ms);
    },
    [practice],
  );

  useEffect(() => {
    if (!view || lastSeq.current) return;
    lastSeq.current = view.seq;
    if (autoplay) practice?.setPace(NORMAL_WATCH_MS);
    if (!spiral) {
      note(
        "start",
        `Welcome to the Room, ${houseName}`,
        "A captain wants cover. If what they pay beats the likely risk, sign. The world waits for your first signature.",
      );
    }
    previous.current = view;
  }, [view, autoplay, houseName, note, practice, spiral]);

  // Everything that happened since the last view.
  useEffect(() => {
    if (!view) return;
    const before = previous.current;
    const fresh = view.events.filter((e) => e.seq > lastSeq.current);
    lastSeq.current = Math.max(lastSeq.current, view.seq);
    previous.current = view;
    const me = view.houses.find((h) => h.you);

    const mineBefore = new Map<number, number>();
    if (before && me) {
      for (const p of before.positions) {
        if (p.writer === me.id) mineBefore.set(p.voyage, (mineBefore.get(p.voyage) ?? 0) + p.sum - p.ceded);
      }
    }

    const lines: (Line & { seq: number })[] = [];
    for (const e of fresh) {
      const text = eventLine(e, view);
      if (text) lines.push({ ...text, seq: e.seq });

      if (e.type === "bound" && me) {
        const mine = view.positions.filter((p) => p.voyage === e.voyage && p.writer === me.id);
        if (mine.length) {
          const earned = mine.reduce((sum, p) => sum + Math.floor((p.sum * p.rate_bps) / 10000), 0);
          const risk = mine.reduce((sum, p) => sum + p.sum, 0);
          sound.stamp();
          sound.coins();
          toast({ kind: "bound", title: "Bound", sub: `+${crowns(earned)} now, ${crowns(risk)} at risk` });
          note(
            "bound",
            "The line is bound",
            `You've been paid ${crowns(earned)} crowns. If she comes home you keep it. If she's lost you pay ${crowns(risk)}. Listen for the bell: two strokes for safe, one for lost.`,
          );
        }
      }
      if (e.type === "home" && mineBefore.has(e.voyage)) {
        sound.bell(2);
        toast({ kind: "safe", title: "Safe home", sub: view.captains[e.captain].ship });
        note("home", "Two bells", "A ship safe home. The premium is yours to keep, and your capital can carry more.");
      }
      if (e.type === "wrecked" && mineBefore.has(e.voyage)) {
        const amount = mineBefore.get(e.voyage) ?? 0;
        sound.bell(1);
        toast({ kind: "lost", title: "Lost at sea", sub: `${view.captains[e.captain].ship}, −${crowns(amount)}` });
        note(
          "wreck",
          "One bell",
          `The claim falls due in ${view.fees.reckoning_watches} watches. If the wreck smells wrong, hold an inquiry in Your Book before it does.`,
        );
        setTab("book");
      }
      if (e.type === "glass") {
        const threatened = me ? view.positions.some((p) => p.writer === me.id && e.lanes & (1 << p.lane)) : false;
        if (e.great) sound.thunder();
        if (threatened) {
          note(
            "glass",
            "The glass is falling",
            "Ships on those lanes are in danger. Open Your Book and lay off risk now, while the Room is still asleep. It will wake up.",
          );
          setTab("book");
        }
      }
      if (e.type === "storm_hit" && e.great) {
        setFlash(performance.now());
        sound.thunder();
      }
      if (e.type === "house_failed") {
        const fallen = view.houses[e.house];
        if (fallen?.you) {
          sound.bell(1);
        } else {
          toast({ kind: "lost", title: "A house has failed", sub: fallen?.name });
          note(
            "failed",
            "A house has failed",
            "Anyone who laid risk off onto them is now exposed. Their reinsurance is worth nothing. Look in the Room: who goes next?",
          );
        }
      }
      if (e.type === "laid_up") {
        note(
          "laid_up",
          "A captain is out of money",
          `${view.captains[e.captain].name} can't sail. Refit them in the Harbor and they'll repay you from future voyages.`,
        );
      }
      if (e.type === "fraud" && me && e.house === me.id) {
        sound.coins();
        toast({ kind: "safe", title: "Fraud proven", sub: `Claim void, +${crowns(e.reward)} reward` });
      }
      if (e.type === "honest_loss" && me && e.house === me.id) {
        toast({ kind: "plain", title: "An honest loss", sub: "Your name suffers for asking" });
      }
    }
    if (lines.length) setTicker((list) => [...lines.reverse(), ...list].slice(0, 6));

    if (view.offers.some((o) => me && o.house !== me.id)) {
      note(
        "offer",
        "Easy money in the Room",
        "Another house will pay you to carry part of its risk. It's free premium, right up until it isn't.",
      );
    }

    const merrow = view.ports[0];
    setPriceTrail((trail) => {
      const next: Record<string, number[]> = {};
      for (const g of merrow.goods) next[g.name] = [...(trail[g.name] ?? []), g.price].slice(-40);
      return next;
    });

    // Tell the player what happened to slips they signed.
    if (before && me) {
      for (const s of before.slips) {
        const quote = s.quotes.find((q) => q.house === me.id);
        if (quote) myQuotes.current.set(s.id, { rate: quote.rate_bps, line: quote.line_bps, captain: s.captain });
      }
      for (const [id, q] of myQuotes.current) {
        if (view.slips.some((s) => s.id === id)) continue;
        myQuotes.current.delete(id);
        const bound = view.positions.some((p) => p.writer === me.id && view.voyages.some((v) => v.id === p.voyage && v.captain === q.captain));
        if (!bound) toast({ kind: "plain", title: "Undercut", sub: `${view.captains[q.captain].ship} placed elsewhere` });
      }
    }
  }, [view, note, toast]);

  // Sign-first start: the world waits for the first signature.
  const started = useRef(autoplay);

  // Notes clear themselves so they never sit over the chart for long.
  useEffect(() => {
    if (!notes.length || !started.current) return;
    const timer = window.setTimeout(() => setNotes((list) => list.slice(1)), 13000);
    return () => window.clearTimeout(timer);
  }, [notes]);
  const act = useCallback(
    async (action: Action): Promise<Receipt | null> => {
      setBusy(true);
      setError(null);
      try {
        const receipt = await driver.act(action);
        if (action.kind === "quote") {
          sound.stamp();
          sound.startSurf();
          if (!started.current) {
            started.current = true;
            setSpeed(NORMAL_WATCH_MS);
            setNotes((list) => list.slice(1));
          }
        }
        if (receipt.result === "inquiry" && !receipt.fraud) sound.stamp();
        return receipt;
      } catch (e) {
        setError(e instanceof Error ? e.message : "That could not be done.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [driver, setSpeed],
  );

  // A week in a minute.
  const runWeek = useCallback(() => {
    if (!practice || !view) return;
    const me = view.houses.find((h) => h.you);
    const snapshot = {
      left: 42,
      capital: me?.capital ?? 0,
      wrecks: view.captains.reduce((sum, c) => sum + c.losses, 0),
      failed: view.houses.filter((h) => !h.active).length,
      rate: view.market.rate_bps,
    };
    setWeek(snapshot);
    setNotes([]);
    started.current = true;
    void driver.act({ kind: "set_clerk", on: true });
    setSpeed(WEEK_IN_A_MINUTE_MS);
  }, [practice, view, driver, setSpeed]);

  useEffect(() => {
    if (!practice) return;
    practice.onWatch = () => {
      setWeek((w) => (w ? { ...w, left: w.left - 1 } : w));
    };
    return () => {
      practice.onWatch = null;
    };
  }, [practice]);

  const finishWeek = useCallback(() => {
    if (!week) return;
    setWeek(null);
    void driver.act({ kind: "set_clerk", on: false });
    setSpeed(0);
    setReview({ capital: week.capital, wrecks: week.wrecks, failed: week.failed, rate: week.rate });
  }, [week, driver, setSpeed]);

  useEffect(() => {
    if (week && (week.left <= 0 || view?.intermission !== null)) finishWeek();
  }, [week, view?.intermission, finishWeek]);

  // Keyboard.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" && (target as HTMLInputElement).type === "text") return;
      if (event.key === " ") {
        event.preventDefault();
        if (practice) setSpeed(pace ? 0 : NORMAL_WATCH_MS);
      }
      if (event.key === "1") setLine(2500);
      if (event.key === "2") setLine(5000);
      if (event.key === "3") setLine(10000);
      if (event.key === "Enter" && target.tagName !== "BUTTON") {
        const slip = view?.slips.find((s) => s.id === selected);
        if (slip) void act({ kind: "quote", slip: slip.id, rate_bps: slip.offer_bps, line_bps: line });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [practice, pace, setSpeed, view, selected, act, line]);

  const badge = useMemo(() => {
    if (!view || !you) return { book: false, room: false, harbor: false };
    const claimed = view.claims.some((c) => view.positions.some((p) => p.voyage === c.voyage && p.writer === you.id));
    return {
      book: claimed,
      room: view.offers.some((o) => o.house !== you.id),
      harbor: view.captains.some((c) => c.state.state === "laid_up"),
    };
  }, [view, you]);

  if (!view) return null;

  const t = when(view.watch, view.watches_per_day);
  const seasonProgress = Math.min(100, (view.watch / view.season_watches) * 100);
  const showStruck = you && !you.active && !watching && view.intermission === null;

  return (
    <div className="game">
      <header className="top">
        <div className="brand">
          <button className="link brand-name" onClick={onExit} title="Leave the Room">
            Foul Weather
          </button>
          <span className="date">
            Season {view.season}, week {t.week}, day {t.day}
            <small>{watchName(view.watch)}</small>
          </span>
          <span className="season-bar" aria-hidden="true">
            <i style={{ width: `${seasonProgress}%` }} />
          </span>
        </div>
        <div className="purse">
          <div>
            <span className="label">Capital</span>
            <strong key={you?.capital} className="capital">
              {crowns(you?.capital ?? 0)}
            </strong>
          </div>
          <div>
            <span className="label">Good name</span>
            <strong>{you?.reputation ?? 0}</strong>
          </div>
          <div>
            <span className="label">Market</span>
            <strong>{pct(view.market.rate_bps)}</strong>
          </div>
        </div>
        <div className="controls">
          {practice && (
            <div className="segment" role="group" aria-label="Speed">
              <button className={pace === 0 ? "on" : ""} onClick={() => setSpeed(0)} aria-label="Pause" title="Pause (Space)">
                ❚❚
              </button>
              <button className={pace === NORMAL_WATCH_MS ? "on" : ""} onClick={() => { started.current = true; setSpeed(NORMAL_WATCH_MS); }} aria-label="Normal speed" title="Normal speed">
                ▶
              </button>
              <button className={pace === WEEK_IN_A_MINUTE_MS ? "on" : ""} onClick={() => { started.current = true; setSpeed(WEEK_IN_A_MINUTE_MS); }} aria-label="Fast" title="Fast: a week in a minute">
                ▶▶
              </button>
            </div>
          )}
          {!practice && <span className="live-chip">Live Room</span>}
          <button
            className="icon"
            aria-label={muted ? "Turn sound on" : "Turn sound off"}
            onClick={() => {
              sound.setMuted(!muted);
              setMuted(!muted);
            }}
          >
            {muted ? "🔇" : "🔔"}
          </button>
        </div>
      </header>

      <Desk view={view} you={you} selected={selected} onSelect={setSelected} act={act} busy={busy} line={line} setLine={setLine} />

      <main className="sea">
        <Chart view={view} driver={driver} flash={flash} />
        <Toasts toasts={toasts} />
        {week && (
          <div className="fastforward" role="status">
            <b>Your clerk has the desk</b>
            <span>A week in a minute: {Math.max(0, week.left)} watches left</span>
            <button className="link" onClick={finishWeek}>
              Stop
            </button>
          </div>
        )}
        <Notes note={notes[0] ?? null} onDismiss={() => setNotes((list) => list.slice(1))} />
        <ol className="ticker" aria-label="The List: latest news" aria-live="off">
          {ticker.slice(0, 4).map((line) => (
            <li key={line.seq} className={line.tone}>
              {line.text}
            </li>
          ))}
        </ol>
        {error && (
          <button className="error-bar" onClick={() => setError(null)}>
            {error}
          </button>
        )}
      </main>

      <Side
        view={view}
        you={you}
        act={act}
        busy={busy}
        tab={tab}
        setTab={setTab}
        badge={badge}
        priceTrail={priceTrail}
        hood={hood}
        practice={!!practice}
        onRunWeek={runWeek}
        onSpiral={onSpiral}
        onSummon={() => {
          started.current = true;
          void act({ kind: "summon_storm" });
          if (!pace) setSpeed(NORMAL_WATCH_MS);
        }}
      />

      {review && <WeekReview view={view} before={review} onClose={() => setReview(null)} />}
      {view.intermission !== null && (
        <Report
          view={view}
          you={you}
          practice={!!practice}
          onNext={() => {
            setWatching(false);
            void (async () => {
              await act({ kind: "next_season" });
              await act({ kind: "found_house", name: houseName });
              setSpeed(NORMAL_WATCH_MS);
            })();
          }}
        />
      )}
      {showStruck && you && (
        <StruckOff
          you={you}
          onRefound={() => void act({ kind: "found_house", name: houseName })}
          onWatch={() => setWatching(true)}
        />
      )}
    </div>
  );
}
