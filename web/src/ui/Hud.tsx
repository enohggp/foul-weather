// The bar across the top, your quests, your ships, and the building shop.

import { useEffect, useRef, useState } from "react";
import { fullName, shopName } from "../cast";
import { BUILDS, levelOf, QUESTS, type Progress, type Quest } from "../progress";
import type { House, Position, View } from "../types";
import { crowns } from "../words";
import { AWNINGS, Character, Coin, Pip, ShopIcon, Star, YOUR_AWNING } from "./art";

function useCounting(value: number) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const begin = from.current;
    let frame = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 600);
      const next = Math.round(begin + (value - begin) * p);
      from.current = next;
      setShown(next);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return shown;
}

interface BarProps {
  view: View;
  you: House | undefined;
  progress: Progress;
  paused: boolean;
  fast: boolean;
  canPace: boolean;
  muted: boolean;
  onPause: () => void;
  onPlay: () => void;
  onFast: () => void;
  onMute: () => void;
  onBuild: () => void;
  onLedger: () => void;
  onHome: () => void;
}

export function TopBar({ view, you, progress, paused, fast, canPace, muted, onPause, onPlay, onFast, onMute, onBuild, onLedger, onHome }: BarProps) {
  const coins = useCounting(you?.capital ?? 0);
  const { level, into, need } = levelOf(progress.xp);
  const day = Math.floor(view.watch / view.watches_per_day) + 1;
  const total = view.season_watches / view.watches_per_day;
  const canBuild = BUILDS.some((b) => !progress.built.includes(b.id) && b.stars <= progress.stars);
  return (
    <header className="bar">
      <button className="logo" onClick={onHome} title="Back to the start">
        Foul Weather
      </button>

      <div className="level" title={`${into} of ${need} XP to the next level`}>
        <span className="level-badge">{level}</span>
        <span className="xp">
          <small>Level {level}</small>
          <span className="xp-bar">
            <i style={{ width: `${(into / need) * 100}%` }} />
          </span>
        </span>
      </div>

      <div className="pill coins" title="Your coins">
        <Coin size={28} /> <strong key={you?.capital}>{crowns(coins)}</strong>
      </div>
      <div className="pill stars" title="Stars buy decorations">
        <Star size={26} /> <strong>{progress.stars}</strong>
      </div>

      <div className="festival" title="The shop with the most coins at the Harbor Festival wins">
        <small>Harbor Festival in {Math.max(0, total - day + 1)} days</small>
        <span className="xp-bar days">
          <i style={{ width: `${(view.watch / view.season_watches) * 100}%` }} />
        </span>
      </div>

      <div className="bar-buttons">
        <button className={`build${canBuild ? " ready" : ""}`} onClick={onBuild}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 20l9-9 3 3-9 9zM12 4c4-2 8 1 8 5l-3-1-2 2 1 3c-3 0-6-3-5-6z" fill="#fff" stroke="#3b2a1e" strokeWidth="1.800" strokeLinejoin="round" />
          </svg>
          Build
        </button>
        {canPace && (
          <>
            <button className={`round${paused ? " on" : ""}`} onClick={onPause} aria-label="Pause" title="Pause">
              ❚❚
            </button>
            <button className={`round${!paused && !fast ? " on" : ""}`} onClick={onPlay} aria-label="Play" title="Play">
              ▶
            </button>
            <button className={`round${fast ? " on" : ""}`} onClick={onFast} aria-label="Fast" title="Fast">
              ▶▶
            </button>
          </>
        )}
        <button className="round" onClick={onMute} aria-label={muted ? "Turn sound on" : "Turn sound off"} title="Sound">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9v6h4l5 4V5L8 9z" fill="#fff" stroke="#3b2a1e" strokeWidth="1.800" strokeLinejoin="round" />
            {!muted && <path d="M16 8c2 2 2 6 0 8M18.500 5.500c3.500 3.500 3.500 9.500 0 13" fill="none" stroke="#3b2a1e" strokeWidth="1.800" strokeLinecap="round" />}
            {muted && <path d="M16 9l5 6M21 9l-5 6" stroke="#3b2a1e" strokeWidth="2" strokeLinecap="round" />}
          </svg>
        </button>
        <button className="grown-ups" onClick={onLedger}>
          For grown-ups
        </button>
      </div>
    </header>
  );
}

function questValue(q: Quest, progress: Progress, coins: number) {
  return q.count === "coins" ? coins : (progress.counts[q.count] ?? 0);
}

export function Quests({ progress, coins }: { progress: Progress; coins: number }) {
  const q = QUESTS.find((quest) => !progress.doneQuests.includes(quest.id));
  if (!q) return null;
  const value = Math.min(q.target, questValue(q, progress, coins));
  return (
    <section className="quests" aria-label="Your quest">
      <div className="quest" key={q.id}>
        <span>{q.text}</span>
        <span className="quest-bar">
          <i style={{ width: `${(value / q.target) * 100}%` }} />
        </span>
        <small>
          <Star size={18} /> {q.stars}
        </small>
      </div>
    </section>
  );
}

/** The colour of a shop's awning, the same on the map and in the race. */
export function shopColour(view: View, id: number) {
  const rivals = view.houses.filter((h) => !h.you);
  const index = rivals.findIndex((h) => h.id === id);
  return index < 0 ? YOUR_AWNING : AWNINGS[index % AWNINGS.length];
}

export function Race({ view, wide = false }: { view: View; wide?: boolean }) {
  const open = view.houses.filter((h) => h.active).sort((a, b) => b.capital - a.capital);
  const closed = view.houses.filter((h) => !h.active);
  const top = open[0]?.capital || 1;
  return (
    <section className={`race${wide ? " wide" : ""}`} aria-label="All the shops">
      <h2>{wide ? "The shops in town" : "Who's winning?"}</h2>
      <ol>
        {[...open, ...closed].slice(0, wide ? 12 : 9).map((h) => (
          <li key={h.id} className={`${h.you ? "you" : ""}${h.active ? "" : " closed"}`} title={shopName(h.name)}>
            <ShopIcon colour={shopColour(view, h.id)} closed={!h.active} size={wide ? 38 : 30} />
            {wide ? (
              <span className="race-info">
                <b>{h.you ? "Your shop" : shopName(h.name)}</b>
                <span className="race-bar">
                  <i style={{ width: `${h.active ? Math.max(3, (h.capital / top) * 100) : 0}%` }} />
                </span>
              </span>
            ) : null}
            <span className="race-coins">{h.active ? crowns(h.capital) : "Closed"}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

interface ShipsProps {
  view: View;
  you: House | undefined;
  canShare: boolean;
  busy: boolean;
  onShare: (p: Position) => void;
}

export function MyShips({ view, you, canShare, busy, onShare }: ShipsProps) {
  if (!you) return null;
  const mine = view.positions.filter((p) => p.writer === you.id);
  const atSea = mine.filter((p) => view.voyages.some((v) => v.id === p.voyage));
  const readying = view.slips.filter((s) => s.quotes.some((q) => q.house === you.id));
  if (!atSea.length && !readying.length) return null;
  const isStormy = (p: Position) => view.storms.some((s) => s.lanes.includes(p.lane));
  const stormyFirst = [...atSea].sort((a, b) => Number(isStormy(b)) - Number(isStormy(a)));
  const seaRows = stormyFirst.slice(0, 3);
  const readyRows = readying.slice(0, 3 - seaRows.length);
  const hidden = atSea.length + readying.length - seaRows.length - readyRows.length;
  return (
    <section className="ships" aria-label="Ships you protect">
      <h2>
        Your ships {hidden > 0 && <small>+{hidden} more</small>}
      </h2>
      {readyRows.map((s) => (
        <div key={`slip-${s.id}`} className="ship-row">
          <Character id={s.captain} size={40} mood="cheer" />
          <span className="ship-info">
            <b>{fullName(s.captain)}</b>
            <small>Getting ready to sail…</small>
          </span>
        </div>
      ))}
      {seaRows.map((p) => {
        const voyage = view.voyages.find((v) => v.id === p.voyage)!;
        const span = Math.max(1, voyage.arrives - voyage.sailed);
        const progress = Math.min(100, ((view.watch - voyage.sailed) / span) * 100);
        const stormy = isStormy(p);
        const shared = p.ceded > 0;
        const offered = view.offers.some((o) => o.position === p.id);
        return (
          <div key={p.id} className={`ship-row${stormy ? " stormy" : ""}`}>
            <Character id={voyage.captain} size={40} mood={stormy ? "worried" : "happy"} />
            <span className="ship-info">
              <b>{fullName(voyage.captain)}</b>
              <span className="trip">
                <i style={{ width: `${progress}%` }} />
              </span>
            </span>
            {stormy && canShare && !shared && !offered && (
              <button className="share" disabled={busy} onClick={() => onShare(p)}>
                Share
              </button>
            )}
            {(shared || offered) && <small className="shared">{shared ? "Shared" : "Asking…"}</small>}
          </div>
        );
      })}
    </section>
  );
}

export function BuildShop({ progress, onBuy, onClose }: { progress: Progress; onBuy: (id: string, stars: number) => void; onClose: () => void }) {
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label="Build">
      <div className="modal">
        <h2>Build your harbor</h2>
        <p className="lede">
          Earn stars by finishing quests and bringing ships home. You have <b>{progress.stars}</b>{" "}
          {progress.stars === 1 ? "star" : "stars"}.
        </p>
        <ul className="build-list">
          {BUILDS.map((b) => {
            const owned = progress.built.includes(b.id);
            return (
              <li key={b.id}>
                <span>{b.name}</span>
                {owned ? (
                  <b className="owned">Built ✓</b>
                ) : (
                  <button className="buy" disabled={progress.stars < b.stars} onClick={() => onBuy(b.id, b.stars)}>
                    <Star size={18} /> {b.stars}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <button className="big-button" onClick={onClose}>
          Back to the harbor
        </button>
      </div>
    </div>
  );
}

export function LevelUp({ level, unlock, onClose }: { level: number; unlock?: { name: string; text: string }; onClose: () => void }) {
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label="Level up">
      <div className="modal center">
        <div className="confetti" aria-hidden="true">
          {Array.from({ length: 22 }, (_, i) => (
            <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.09}s`, background: ["#e8504a", "#ffd23f", "#2d9cdb", "#2fae6e"][i % 4] }} />
          ))}
        </div>
        <Pip size={120} mood="cheer" />
        <h2>Level {level}!</h2>
        {unlock ? (
          <>
            <p className="lede">
              <b>New skill: {unlock.name}</b>
            </p>
            <p>{unlock.text}</p>
          </>
        ) : (
          <p className="lede">Your shop is growing. Keep going!</p>
        )}
        <button className="big-button" onClick={onClose}>
          Hooray!
        </button>
      </div>
    </div>
  );
}
