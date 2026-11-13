// Your ships: send them out, watch the water, and bring them home in time.

import { useState } from "react";
import { place, shopName } from "../cast";
import type { Action, OwnedShip, Route, TownTrip, View } from "../types";
import { crowns } from "../words";
import { Coin, GoodIcon } from "./art";
import { ChestArt, ShipArt } from "./townArt";

export function water(swell: number) {
  if (swell >= 75) return { word: "WILD!", tone: "wild" };
  if (swell >= 55) return { word: "Rough", tone: "rough" };
  if (swell >= 30) return { word: "Choppy", tone: "choppy" };
  return { word: "Calm", tone: "calm" };
}

const SURPRISES = {
  crate: { title: "A floating crate!", text: "Grab it for more coins? You'll be a bit later.", yes: "Grab it!", no: "Leave it" },
  pirates: { title: "Pirates!", text: "Fight them for treasure, or pay them to go away?", yes: "Fight!", no: "Pay them" },
  shortcut: { title: "A secret shortcut!", text: "Quicker, but the water is much worse.", yes: "Take it!", no: "Stay safe" },
};

function tooLate(route: Route, view: View) {
  return view.watch + route.watches + 1 >= view.season_watches;
}

function RouteRow({ route, view, coins, protect, busy, watchMs, hot, onGo }: { route: Route; view: View; coins: number; protect: boolean; busy: boolean; watchMs: number; hot: boolean; onGo: () => void }) {
  const state = water(view.lanes[route.lane].swell);
  const locked = route.locked_until > 0;
  const late = !locked && tooLate(route, view);
  // With few coins the ship carries a part-load, so show what this trip would really pay.
  const load = route.cost === 0 ? 1 : Math.max(0.25, Math.min(1, coins / route.cost));
  const profit = (route.full - route.cost) * load - (protect ? (route.protect_fee ?? 0) : 0);
  const seconds = Math.round((route.watches * watchMs) / 1000);
  return (
    <button className="route-row" disabled={busy || locked || late} onClick={onGo} data-route={route.lane}>
      <GoodIcon good={route.good_name} size={28} />
      <span className="route-name">
        <b>{place(view.ports[route.to].name)}</b>
        {locked ? (
          <small>Level {route.locked_until}</small>
        ) : late ? (
          <small>Too close to the Festival</small>
        ) : (
          <small className={`water-${state.tone}`}>
            {route.storm ? "Storm coming!" : state.word}
            <span className="route-time">{seconds}s</span>
            {route.convoy && <span className="convoy-tag">with {route.convoy}</span>}
          </small>
        )}
      </span>
      {!locked && !late && (
        <strong>
          +{crowns(Math.max(0, profit))}
          {hot && <em className="hot-price">Best price!</em>}
        </strong>
      )}
    </button>
  );
}

function AtSea({ ship, trip, view, watchMs, busy, act }: { ship: OwnedShip; trip: TownTrip; view: View; watchMs: number; busy: boolean; act: (a: Action) => void }) {
  const span = Math.max(1, trip.arrives - trip.sailed);
  const progress = Math.min(100, ((view.watch - trip.sailed) / span) * 100);
  const seconds = Math.max(0, Math.ceil(((trip.arrives - view.watch) * watchMs) / 1000));
  const state = water(trip.swell);
  const storm = trip.storm_in !== null && trip.storm_in <= 1;
  const danger = Math.min(100, trip.danger_bps / 40);
  const surprise = trip.surprise ? SURPRISES[trip.surprise] : null;
  const scary = storm || state.tone === "wild" || trip.raid_from !== null;
  return (
    <div className={`at-sea water-box-${scary ? "wild" : state.tone}`} data-state={state.tone}>
      <p className="trip-where">
        <span>To {place(view.ports[trip.to].name)}</span>
        <b>{seconds}s</b>
      </p>
      <p className="trip-now">
        <Coin size={34} /> <strong key={trip.now}>{crowns(trip.now)}</strong>
      </p>
      <span className="trip big">
        <i style={{ width: `${progress}%`, transitionDuration: `${watchMs}ms` }} />
      </span>
      <div className="danger-row">
        <span className={`water-word water-${scary ? "wild" : state.tone}`}>{storm ? "STORM!" : state.word}</span>
        <span className="danger-bar" title="How dangerous the water is">
          <i style={{ width: `${danger}%` }} />
        </span>
      </div>
      {trip.raid_from && <p className="raid-warning">{trip.raid_from}'s pirates are coming! Run for home!</p>}
      {trip.convoy && !trip.raid_from && <p className="convoy-note">Sailing with {trip.convoy}: safer together!</p>}
      {surprise && !trip.surprise_answered && (
        <div className="surprise">
          <b>{surprise.title}</b>
          <span>{surprise.text}</span>
          <div className="yes-no even">
            <button className="no" disabled={busy} onClick={() => act({ kind: "answer_surprise", ship: ship.id, yes: false })}>
              {surprise.no}
            </button>
            <button className="yes" disabled={busy} onClick={() => act({ kind: "answer_surprise", ship: ship.id, yes: true })}>
              {surprise.yes}
            </button>
          </div>
        </div>
      )}
      <button className={`come-home${scary ? " urgent" : ""}`} disabled={busy} onClick={() => act({ kind: "come_home", ship: ship.id })}>
        Come home!
        <small>
          Keep <Coin size={15} /> {crowns(trip.now)}
        </small>
      </button>
      <p className="chest-note">
        {trip.cover > 0 ? (
          <>
            {trip.insurer ? shopName(trip.insurer) : "A shop"} pays you {crowns(trip.cover)} if you sink
          </>
        ) : (
          <>
            <ChestArt size={24} /> Reach the island for a chest: {crowns(trip.full)}+
          </>
        )}
      </p>
    </div>
  );
}

function ShipCard({ ship, view, coins, watchMs, busy, act, spot, onPick }: { ship: OwnedShip; view: View; coins: number; watchMs: number; busy: boolean; act: (a: Action) => void; spot: boolean; onPick: () => void }) {
  const [picking, setPicking] = useState(false);
  const [protect, setProtect] = useState(false);
  const fixing = ship.damaged;
  const canProtect = ship.routes.some((r) => r.protect_fee !== null);
  const waiting = !ship.trip && !fixing && ship.ready_in > 0;
  const closed = view.intermission !== null;
  const open = ship.routes.filter((r) => r.locked_until === 0 && !tooLate(r, view));
  const festivalSoon = open.length === 0;
  const best = Math.max(...open.map((r) => r.market_pct));
  return (
    <article className={`fleet-card${ship.trip ? " sailing" : ""}`} data-ship={ship.id}>
      <div className="fleet-top">
        <ShipArt cls={ship.class} size={58} damaged={fixing} />
        <b>{ship.name}</b>
        {!ship.trip && !fixing && !picking && !closed && (
          <button
            className={`sail-now${spot ? " spot" : ""}`}
            disabled={waiting || festivalSoon}
            onClick={() => {
              setPicking(true);
              onPick();
            }}
          >
            {waiting ? `${Math.ceil((ship.ready_in * watchMs) / 1000)}s` : festivalSoon ? "Festival!" : "Sail!"}
          </button>
        )}
        {picking && !ship.trip && (
          <button className="text-link" onClick={() => setPicking(false)}>
            Back
          </button>
        )}
      </div>
      {ship.trip && <AtSea ship={ship} trip={ship.trip} view={view} watchMs={watchMs} busy={busy} act={act} />}
      {fixing && (
        <div className="fixing">
          <span>Being fixed: {Math.ceil((ship.ready_in * watchMs) / 1000)}s</span>
          <button className="buy" disabled={busy || coins < ship.repair_cost} onClick={() => act({ kind: "repair_ship", ship: ship.id })}>
            Fix now: <Coin size={15} /> {crowns(ship.repair_cost)}
          </button>
        </div>
      )}
      {picking && !ship.trip && !fixing && (
        <div className="routes">
          {ship.routes.map((route) => (
            <RouteRow
              key={route.lane}
              route={route}
              view={view}
              coins={coins}
              protect={protect}
              busy={busy}
              watchMs={watchMs}
              hot={route.market_pct >= 130 && open.includes(route) && open.filter((r) => r.market_pct === best).length === 1 && route.market_pct === best}
              onGo={() => {
                act({ kind: "send_ship", ship: ship.id, lane: route.lane, protect: protect && route.protect_fee !== null });
                setPicking(false);
              }}
            />
          ))}
          {canProtect && (
            <label className="protect-toggle">
              <input type="checkbox" checked={protect} onChange={(e) => setProtect(e.target.checked)} />
              Protect this trip: pay a shop, and they pay you if it sinks
            </label>
          )}
        </div>
      )}
    </article>
  );
}

export default function Fleet({ view, watchMs, busy, spot, act, onPick }: { view: View; watchMs: number; busy: boolean; spot: boolean; act: (a: Action) => void; onPick: () => void }) {
  const town = view.town;
  if (!town) return null;
  return (
    <section className="dock fleet" aria-label="Your ships">
      {town.ships.map((ship, i) => (
        <ShipCard key={ship.id} ship={ship} view={view} coins={town.coins} watchMs={watchMs} busy={busy} act={act} spot={spot && i === 0} onPick={onPick} />
      ))}
    </section>
  );
}
