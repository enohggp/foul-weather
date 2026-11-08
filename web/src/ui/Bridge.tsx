// The captain's side of the game: choose a trip, ask the shops, sail.

import { useState } from "react";
import { cargo, fullName, place, shopName } from "../cast";
import type { Action, Captain, Slip, Trip, View } from "../types";
import { crowns, pct } from "../words";
import { Character, Coin, GoodIcon, ShopIcon } from "./art";
import { shopColour } from "./Hud";

const OFFERS = [
  { id: "cheap", word: "Cheap", times: 125, hint: "Shops might say no" },
  { id: "fair", word: "Fair", times: 175, hint: "Most shops say yes" },
  { id: "kind", word: "Generous", times: 260, hint: "Nearly all say yes" },
];

const rateFor = (trip: Trip, times: number) => Math.min(2400, Math.max(100, Math.round((Math.max(trip.risk_bps, 60) * times) / 100)));
const feeFor = (trip: Trip, rate: number) => Math.floor((trip.sum_insured * rate) / 10000);

function dangerWord(bps: number) {
  if (bps >= 1500) return { word: "Very dangerous", tone: "bad" };
  if (bps >= 700) return { word: "Risky", tone: "ok" };
  return { word: "Calm", tone: "great" };
}

function TripButton({ trip, view, chosen, onChoose }: { trip: Trip; view: View; chosen: boolean; onChoose: () => void }) {
  const profit = trip.revenue - trip.cost - trip.provisions;
  const danger = dangerWord(trip.risk_bps);
  return (
    <button className={`trip-pick${chosen ? " on" : ""}`} onClick={onChoose} data-trip={trip.lane}>
      <GoodIcon good={trip.good_name} size={30} />
      <span className="trip-pick-text">
        <b>{place(view.ports[trip.to].name)}</b>
        <small className={`tone-${danger.tone}`}>{trip.storm ? "Storm on this route!" : danger.word}</small>
      </span>
      <strong className={profit >= 0 ? "good-ink" : "bad-ink"}>
        {profit >= 0 ? "+" : "−"}
        {crowns(Math.abs(profit))}
      </strong>
    </button>
  );
}

function Protection({ trip, cash, busy, act }: { trip: Trip; cash: number; busy: boolean; act: (a: Action) => void }) {
  const [choice, setChoice] = useState("fair");
  const chosen = OFFERS.find((o) => o.id === choice);
  const rate = chosen ? rateFor(trip, chosen.times) : 0;
  const fee = chosen ? feeFor(trip, rate) : 0;
  const profit = trip.revenue - trip.cost - trip.provisions;
  const left = cash - trip.cost - trip.provisions;
  return (
    <div className="protect">
      <p className="protect-title">
        Carry <b>{cargo(trip.qty, trip.good_name)}</b>. How much will you pay for protection?
      </p>
      <div className="protect-choices">
        {OFFERS.map((o) => (
          <button key={o.id} className={`chip${choice === o.id ? " on" : ""}`} onClick={() => setChoice(o.id)} data-offer={o.id}>
            <b>{o.word}</b>
            <span>
              <Coin size={15} /> {crowns(feeFor(trip, rateFor(trip, o.times)))}
            </span>
          </button>
        ))}
        <button className={`chip none${choice === "none" ? " on" : ""}`} onClick={() => setChoice("none")} data-offer="none">
          <b>None</b>
          <span>
            <Coin size={15} /> 0
          </span>
        </button>
      </div>
      <p className="protect-hint">
        {chosen ? chosen.hint : "If you sink, you lose everything!"}
        {chosen && fee > left ? " You can't afford all of it, so you'd only get part." : ""}
      </p>
      <div className="payoff">
        <div className="pay good">
          <span>If you get there</span>
          <strong>
            <Coin size={20} /> +{crowns(Math.max(0, profit - fee))}
          </strong>
        </div>
        <div className="pay bad">
          <span>{chosen ? "If you sink, shops pay" : "If you sink"}</span>
          <strong>
            <Coin size={20} /> {chosen ? `+${crowns(trip.sum_insured)}` : `−${crowns(trip.cost)}`}
          </strong>
        </div>
      </div>
      <button className="big-button sail-button" disabled={busy} onClick={() => act({ kind: "plan_trip", lane: trip.lane, offer_bps: rate })}>
        {chosen ? "Ask the shops" : "Set sail!"}
      </button>
    </div>
  );
}

function Planning({ view, cash, busy, act }: { view: View; cash: number; busy: boolean; act: (a: Action) => void }) {
  const trips = view.helm?.trips ?? [];
  const [picked, setPicked] = useState<number | null>(null);
  const trip = trips.find((t) => t.lane === picked) ?? (trips.length === 1 ? trips[0] : undefined);
  return (
    <>
      <h2 className="bridge-title">Where to, Captain?</h2>
      <div className="trip-list">
        {trips.map((t) => (
          <TripButton key={t.lane} trip={t} view={view} chosen={trip?.lane === t.lane} onChoose={() => setPicked(t.lane)} />
        ))}
      </div>
      {trip ? <Protection key={trip.lane} trip={trip} cash={cash} busy={busy} act={act} /> : <p className="protect-hint">Pick the island that pays best. Look out for storms!</p>}
    </>
  );
}

function shopLabel(view: View, id: number) {
  const house = view.houses[id];
  if (!house) return { name: "A shop", real: false };
  return { name: shopName(house.name), real: house.kind === "player" };
}

function Waiting({ view, slip, watchMs, busy, act }: { view: View; slip: Slip; watchMs: number; busy: boolean; act: (a: Action) => void }) {
  const covered = Math.min(10000, slip.quotes.reduce((sum, q) => sum + q.line_bps, 0));
  const seconds = Math.max(0, Math.ceil(((slip.closes - view.watch) * watchMs) / 1000));
  const bare = slip.offer_bps === 0;
  return (
    <>
      <h2 className="bridge-title">{bare ? "Casting off!" : "Asking the shops…"}</h2>
      <p className="route">
        <GoodIcon good={slip.good_name} size={26} />
        <span>
          {cargo(slip.qty, slip.good_name)} to <b>{place(view.ports[slip.to].name)}</b>
        </span>
        <small>{seconds}s</small>
      </p>
      {!bare && (
        <>
          <span className="cover-bar" role="img" aria-label={`${pct(covered, 0)} protected`}>
            <i style={{ width: `${covered / 100}%` }} />
          </span>
          <p className="protect-hint">{covered > 0 ? `${pct(covered, 0)} of your ship is protected so far` : "No answers yet…"}</p>
          <ul className="answers">
            {slip.quotes.map((q) => {
              const shop = shopLabel(view, q.house);
              return (
                <li key={q.house} className={shop.real ? "real" : ""}>
                  <ShopIcon colour={shopColour(view, q.house)} size={28} />
                  <span>
                    <b>{shop.name}</b>
                    {shop.real && <em>Real player</em>}
                  </span>
                  <small>
                    {pct(q.line_bps, 0)} at {crowns((slip.sum_insured * q.line_bps * q.rate_bps) / 100000000)} coins
                  </small>
                </li>
              );
            })}
          </ul>
          <div className="yes-no">
            <button className="no" disabled={busy} onClick={() => act({ kind: "cancel_trip" })}>
              Cancel
            </button>
            <button className="yes" disabled={busy} onClick={() => act({ kind: "sail_now" })}>
              Set sail now!
            </button>
          </div>
        </>
      )}
    </>
  );
}

function AtSea({ view, me, showTrick, busy, act }: { view: View; me: Captain; showTrick: boolean; busy: boolean; act: (a: Action) => void }) {
  const [sure, setSure] = useState(false);
  const voyage = view.voyages.find((v) => me.state.state === "sailing" && v.id === me.state.voyage);
  if (!voyage) return null;
  const span = Math.max(1, voyage.arrives - voyage.sailed);
  const progress = Math.min(100, ((view.watch - voyage.sailed) / span) * 100);
  const to = voyage.outbound ? view.lanes[voyage.lane].port : 0;
  return (
    <>
      <h2 className="bridge-title">Sailing to {place(view.ports[to].name)}</h2>
      <span className="trip big">
        <i style={{ width: `${progress}%` }} />
      </span>
      <p className="protect-hint">
        {voyage.covered_bps > 0 ? `${pct(voyage.covered_bps, 0)} of your ship is protected` : "No protection. Fingers crossed!"}
      </p>
      {showTrick && voyage.covered_bps > 0 && (
        <div className="sneaky">
          {sure ? (
            <>
              <p>Sink your own ship and collect the money? Shops may look into it. If they catch you, you pay!</p>
              <div className="yes-no">
                <button className="no" onClick={() => setSure(false)}>
                  Stay honest
                </button>
                <button className="danger" disabled={busy} onClick={() => act({ kind: "scuttle" })}>
                  Sink it
                </button>
              </div>
            </>
          ) : (
            <button className="text-link" onClick={() => setSure(true)}>
              Sneaky trick…
            </button>
          )}
        </div>
      )}
    </>
  );
}

function Ashore({ view, me }: { view: View; me: Captain }) {
  const claim = view.claims.find((c) => c.captain === me.id);
  return (
    <>
      <h2 className="bridge-title">Your ship sank</h2>
      <p className="protect-hint">
        {claim ? `The shops owe you ${crowns(claim.sum)} coins. They have a moment to look into it.` : "You're ashore, waiting for a new ship."}
      </p>
    </>
  );
}

interface Props {
  view: View;
  me: Captain;
  watchMs: number;
  busy: boolean;
  showTrick: boolean;
  act: (a: Action) => void;
}

export default function Bridge({ view, me, watchMs, busy, showTrick, act }: Props) {
  const slip = me.state.state === "seeking" ? view.slips.find((s) => me.state.state === "seeking" && s.id === me.state.slip) : undefined;
  return (
    <section className="dock" aria-label="Your ship">
      <article className="visitor bridge">
        <div className="visitor-top">
          <Character id={me.id} mood={me.state.state === "laid_up" || me.state.state === "ashore" ? "sad" : "happy"} size={72} />
          <div className="visitor-say">
            <b>{fullName(me.id)}</b>
            <p className="ship-note">
              {me.hull_word === "sound" || me.hull_word === "fair" ? "Your ship is strong" : "Your ship is getting old"}
              {me.frauds > 0 ? ". Everyone knows what you did!" : ""}
            </p>
          </div>
        </div>
        {me.state.state === "at_port" &&
          (!view.helm?.can_sail ? (
            <p className="protect-hint">The Harbor Festival is close. Stay in port!</p>
          ) : view.helm.ready ? (
            <Planning key={me.voyages + me.losses} view={view} cash={me.cash} busy={busy} act={act} />
          ) : (
            <>
              <h2 className="bridge-title">In port</h2>
              <p className="protect-hint">Your crew is unloading. Get ready to choose your next trip!</p>
            </>
          ))}
        {slip && <Waiting view={view} slip={slip} watchMs={watchMs} busy={busy} act={act} />}
        {me.state.state === "sailing" && <AtSea view={view} me={me} showTrick={showTrick} busy={busy} act={act} />}
        {me.state.state === "ashore" && <Ashore view={view} me={me} />}
        {me.state.state === "laid_up" && (
          <>
            <h2 className="bridge-title">Out of coins!</h2>
            <p className="protect-hint">You can't sail without coins. A shop may help you, soon.</p>
          </>
        )}
      </article>
    </section>
  );
}

export function CaptainRace({ view, you }: { view: View; you: number }) {
  const ranked = [...view.captains].sort((a, b) => b.cash - a.cash);
  const shown = ranked.slice(0, 7);
  const mine = ranked.find((c) => c.id === you);
  if (mine && !shown.includes(mine)) shown[shown.length - 1] = mine;
  return (
    <section className="race" aria-label="All the captains">
      <h2>Top captains</h2>
      <ol>
        {shown.map((c) => (
          <li key={c.id} className={c.id === you ? "you" : ""} title={c.player ? `${fullName(c.id)}, played by ${c.player}` : fullName(c.id)}>
            <Character id={c.id} size={26} />
            <span className="race-coins">{crowns(c.cash)}</span>
            {c.player && c.id !== you && <em className="real-dot" aria-label="Real player" />}
          </li>
        ))}
      </ol>
    </section>
  );
}
