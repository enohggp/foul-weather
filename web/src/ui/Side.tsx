// The side ledger: your book, the Room, the harbor, and what's under the hood.

import { useMemo, useState } from "react";
import type { Action, House, Position, View } from "../types";
import { crowns, pct, priceReason, seaWord } from "../words";
import { Flag, Seal, Spark } from "./bits";

export interface RouteReading {
  lane: string;
  route: string;
  sea: number;
  spreadBps: number;
  seconds: number;
}

export interface Hood {
  contract: string | null;
  account: string | null;
  lastTx: string | null;
  sea: RouteReading[];
  seaUpdated: number | null;
  explorer: string;
}

interface Props {
  view: View;
  you: House | undefined;
  act: (action: Action) => Promise<unknown>;
  busy: boolean;
  priceTrail: Record<string, number[]>;
  hood: Hood;
  onRunWeek: () => void;
  onSpiral: () => void;
  onSummon: () => void;
  practice: boolean;
}

export type Tab = "book" | "room" | "harbor" | "hood";

function voyageOf(view: View, id: number) {
  return view.voyages.find((v) => v.id === id);
}

function LayOff({ p, view, act, busy, onClose }: { p: Position; view: View; act: Props["act"]; busy: boolean; onClose: () => void }) {
  const [share, setShare] = useState(5000);
  const hint = p.lay_off_hint_bps || 800;
  const [rate, setRate] = useState(hint);
  const sum = Math.floor((p.sum * share) / 10000);
  const cost = Math.floor((sum * rate) / 10000);
  const stormy = view.storms.some((s) => s.lanes.includes(p.lane));
  return (
    <div className="layoff">
      <p>
        Pay another house to carry part of this. If the ship is lost, they pay you back, as long as they can.
      </p>
      <div className="segment" role="group" aria-label="Share to lay off">
        {[2500, 5000, 7500, 10000].map((bps) => (
          <button key={bps} className={share === bps ? "on" : ""} onClick={() => setShare(bps)}>
            {bps / 100}%
          </button>
        ))}
      </div>
      <label className="label">
        Rate you pay <b>{pct(rate)}</b>
        <input
          type="range"
          min={100}
          max={4000}
          step={10}
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
        />
      </label>
      <p className="muted small">
        The Room would probably accept {pct(hint)}{stormy ? ", and that rises as houses notice the glass" : ""}.
      </p>
      <div className="row">
        <button
          className="primary small"
          disabled={busy}
          onClick={() => {
            void act({ kind: "offer_cession", position: p.id, share_bps: share, rate_bps: rate });
            onClose();
          }}
        >
          Offer {crowns(sum)} of risk for {crowns(cost)}
        </button>
        <button className="link" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Book({ view, you, act, busy }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  if (!you) return <p className="muted pad">Found a house to start a book.</p>;

  const mine = view.positions.filter((p) => p.writer === you.id);
  const claims = view.claims.filter((c) => mine.some((p) => p.voyage === c.voyage));
  const dueSoon = claims.reduce((sum, c) => {
    const net = mine.filter((p) => p.voyage === c.voyage).reduce((s, p) => s + p.sum - p.ceded, 0);
    return sum + net;
  }, 0);
  const atSea = mine.filter((p) => !claims.some((c) => c.voyage === p.voyage));
  const limit = you.capital * view.fees.max_gearing;
  const used = limit ? Math.min(100, Math.round((you.net_book / limit) * 100)) : 0;
  const top = Math.max(1, ...you.net_by_lane);

  return (
    <div className="pane">
      <div className="kpis">
        <div>
          <span className="label">Net at risk</span>
          <strong>{crowns(you.net_book)}</strong>
        </div>
        <div>
          <span className="label">Book used</span>
          <strong>{used}%</strong>
        </div>
      </div>

      {claims.length > 0 && (
        <div className="claims">
          <h3>
            Reckoning <small>you owe about {crowns(dueSoon)}</small>
          </h3>
          {dueSoon > you.capital && (
            <p className="warn">⚠ You owe more than you hold. Unless reinsurers pay you, your house will fail.</p>
          )}
          {claims.map((c) => {
            const left = Math.max(0, c.due - view.watch);
            return (
              <div className="claim" key={c.id}>
                <div className="row between">
                  <span>
                    <Flag captain={c.captain} size={18} /> <b>{view.captains[c.captain].ship}</b>
                  </span>
                  <span className="small">due in {left}</span>
                </div>
                <div className="meter" role="img" aria-label={`Suspicion ${c.suspicion}%`}>
                  <i style={{ width: `${c.suspicion}%` }} />
                </div>
                <div className="row between">
                  <span className="small">{c.suspicion >= 8 ? `${c.suspicion}% this was no accident` : "No sign of foul play"}</span>
                  <button
                    className="link"
                    disabled={busy || c.inquired || !you.active}
                    onClick={() => void act({ kind: "inquiry", claim: c.id })}
                  >
                    {c.inquired ? "Inquiry held" : `Inquiry, ${view.fees.inquiry}`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <h3>Risk by lane</h3>
      <ul className="lanebars">
        {view.lanes.map((lane, i) => {
          const storm = view.storms.some((s) => s.lanes.includes(lane.id));
          return (
            <li key={lane.id}>
              <span className="lane-name">
                {storm && <span title="Storm forecast">⚠ </span>}
                {lane.name}
              </span>
              <span className="bar">
                <i className={storm ? "hot" : ""} style={{ width: `${(you.net_by_lane[i] / top) * 100}%` }} />
              </span>
              <span className="num">{crowns(you.net_by_lane[i])}</span>
            </li>
          );
        })}
      </ul>

      <h3>
        At sea <small>{atSea.length ? `${atSea.length} risks` : "nothing yet"}</small>
      </h3>
      <ul className="risks">
        {atSea.map((p) => {
          const voyage = voyageOf(view, p.voyage);
          if (!voyage) return null;
          const captain = view.captains[voyage.captain];
          const span = Math.max(1, voyage.arrives - voyage.sailed);
          const progress = Math.min(100, ((view.watch - voyage.sailed) / span) * 100);
          const stormy = view.storms.some((s) => s.lanes.includes(p.lane));
          const net = p.sum - p.ceded;
          const offered = view.offers.some((o) => o.position === p.id);
          return (
            <li key={p.id} className={stormy ? "stormy" : ""}>
              <div className="row between">
                <span>
                  <Flag captain={voyage.captain} size={18} /> <b>{captain.ship}</b>
                </span>
                <span className="num">{crowns(net)}</span>
              </div>
              <div className="progress" aria-hidden="true">
                <i style={{ width: `${progress}%` }} />
              </div>
              <div className="row between small">
                <span>
                  {view.lanes[p.lane].name}, {pct(p.rate_bps)}
                  {p.parent !== null ? ", reinsurance" : ""}
                </span>
                {net > 0 && !offered && (
                  <button className="link" onClick={() => setOpen(open === p.id ? null : p.id)}>
                    Lay off
                  </button>
                )}
                {offered && <span className="muted">Offered</span>}
              </div>
              {open === p.id && <LayOff p={p} view={view} act={act} busy={busy} onClose={() => setOpen(null)} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Network({ view }: { view: View }) {
  const houses = view.houses;
  const size = 300;
  const centre = size / 2;
  const radius = 106;
  const place = (i: number) => {
    const a = (i / Math.max(1, houses.length)) * Math.PI * 2 - Math.PI / 2;
    return { x: centre + Math.cos(a) * radius, y: centre + Math.sin(a) * radius };
  };
  const links = useMemo(() => {
    const totals = new Map<string, { from: number; to: number; sum: number }>();
    for (const p of view.positions) {
      if (p.owed_to === null) continue;
      const key = `${p.writer}-${p.owed_to}`;
      const entry = totals.get(key) ?? { from: p.writer, to: p.owed_to, sum: 0 };
      entry.sum += p.sum;
      totals.set(key, entry);
    }
    return [...totals.values()];
  }, [view.positions]);
  const top = Math.max(1, ...links.map((l) => l.sum));
  const largest = Math.max(1, ...houses.map((h) => h.capital));
  return (
    <figure className="network">
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Who is relying on whom">
        {links.map((l) => {
          const a = place(l.from);
          const b = place(l.to);
          return (
            <line
              key={`${l.from}-${l.to}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              strokeWidth={1 + (l.sum / top) * 4}
              className={houses[l.from]?.active ? "link-line" : "link-line dead"}
            >
              <title>
                {houses[l.to]?.name} relies on {houses[l.from]?.name} for {crowns(l.sum)} crowns
              </title>
            </line>
          );
        })}
        {houses.map((h, i) => {
          const p = place(i);
          const r = 8 + (Math.sqrt(h.capital / largest) || 0) * 15;
          return (
            <g key={h.id}>
              <circle cx={p.x} cy={p.y} r={h.active ? r : 8} className={`node${h.you ? " you" : ""}${h.active ? "" : " dead"}`}>
                <title>
                  {h.name}: {h.active ? `${crowns(h.capital)} crowns` : "struck off"}
                </title>
              </circle>
              <text x={p.x} y={p.y + 4} textAnchor="middle" className="node-label">
                {h.name.replace(/^The /, "").charAt(0)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption>Lines show who relies on whom. Thicker means more money.</figcaption>
    </figure>
  );
}

function Room({ view, you, act, busy }: Props) {
  const others = view.offers.filter((o) => !you || o.house !== you.id);
  const ranked = [...view.houses].sort((a, b) => Number(b.active) - Number(a.active) || b.capital - a.capital);
  return (
    <div className="pane">
      <h3>
        Offers <small>{others.length ? "paid to carry risk" : "none open"}</small>
      </h3>
      <ul className="offers">
        {others.map((o) => {
          const voyage = voyageOf(view, o.voyage);
          const stormy = view.storms.some((s) => s.lanes.includes(o.lane));
          return (
            <li key={o.id} className={stormy ? "stormy" : ""}>
              <p>
                <b>{view.houses[o.house]?.name}</b> pays <b className="good-ink">{crowns(o.premium)}</b> for you to carry{" "}
                {crowns(o.sum)} of {voyage ? view.captains[voyage.captain].ship : "a ship"}
              </p>
              <div className="row between small">
                <span>
                  {stormy && "⚠ "}
                  {view.lanes[o.lane].name}, {pct(o.rate_bps)}
                </span>
                <button
                  className="link"
                  disabled={busy || !you?.active}
                  onClick={() => void act({ kind: "take_cession", offer: o.id })}
                >
                  Carry it
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <Network view={view} />
      <h3>Houses</h3>
      <table className="houses">
        <thead>
          <tr>
            <th scope="col">House</th>
            <th scope="col" className="num">
              Capital
            </th>
            <th scope="col" className="num">
              At risk
            </th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((h) => (
            <tr key={h.id} className={`${h.you ? "you" : ""}${h.active ? "" : " dead"}`}>
              <td>
                <Seal house={h} size={20} /> {h.name}
              </td>
              <td className="num">{h.active ? crowns(h.capital) : "Struck off"}</td>
              <td className="num">{h.active ? crowns(h.net_book) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Harbor({ view, you, act, busy, priceTrail }: Props) {
  const merrow = view.ports[0];
  const laidUp = view.captains.filter((c) => c.state.state === "laid_up");
  return (
    <div className="pane">
      <div className="kpis three">
        <div>
          <span className="label">Market rate</span>
          <strong>{pct(view.market.rate_bps)}</strong>
        </div>
        <div>
          <span className="label">Price index</span>
          <strong>{view.market.price_index}</strong>
        </div>
        <div>
          <span className="label">At sea</span>
          <strong>{view.market.at_sea}</strong>
        </div>
      </div>
      <h3>What Merrow pays</h3>
      <table className="prices">
        <tbody>
          {merrow.goods.map((g) => {
            const multiple = g.price / g.usual;
            return (
              <tr key={g.good} title={priceReason(g.name, g.price, g.usual, g.stock, g.target)}>
                <th scope="row">{g.name}</th>
                <td>
                  <Spark values={priceTrail[g.name] ?? []} />
                </td>
                <td className="num">{g.price}</td>
                <td className={`num small ${multiple >= 1.15 ? "up" : multiple <= 0.85 ? "down" : ""}`}>
                  {multiple >= 1.15 ? "▲" : multiple <= 0.85 ? "▼" : "·"} {Math.round(multiple * 100)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small">Hover a good to see why it costs what it does.</p>

      <h3>
        Laid up <small>{laidUp.length ? "out of money" : "no one"}</small>
      </h3>
      <ul className="risks">
        {laidUp.map((c) => (
          <li key={c.id}>
            <div className="row between">
              <span>
                <Flag captain={c.id} size={18} /> <b>{c.name}</b>
              </span>
              <button
                className="link"
                disabled={busy || !you?.active || (you?.capital ?? 0) < view.fees.refit}
                onClick={() => void act({ kind: "refit", captain: c.id })}
              >
                Refit, {crowns(view.fees.refit)}
              </button>
            </div>
            <p className="small muted">They repay you 135% out of future voyages, if they survive.</p>
          </li>
        ))}
      </ul>

      <h3>Captains</h3>
      <table className="houses">
        <tbody>
          {view.captains.map((c) => (
            <tr key={c.id}>
              <td>
                <Flag captain={c.id} size={16} /> {c.name}
              </td>
              <td className="small">{c.state.state.replace("_", " ")}</td>
              <td className="num">{crowns(c.cash)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Under({ view, hood, onRunWeek, onSpiral, onSummon, practice }: Props) {
  const tokens = view.positions.length + 7;
  return (
    <div className="pane hood">
      <h3>Fast-forward</h3>
      <div className="stack">
        <button className="secondary" disabled={!practice} onClick={onRunWeek}>
          Run a week in a minute
        </button>
        <button className="secondary" disabled={!practice} onClick={onSpiral}>
          Watch a spiral collapse
        </button>
        <button className="secondary" disabled={!practice} onClick={onSummon}>
          Summon a great storm
        </button>
      </div>

      <h3>Where this runs</h3>
      {practice ? (
        <p className="small">
          This is a private practice harbor. The rules below run in your browser, compiled from the same Rust the NEAR
          contract uses. Nothing here touches a chain.
        </p>
      ) : (
        <dl className="facts">
          <dt>Contract</dt>
          <dd>
            <a href={`${hood.explorer}/address/${hood.contract}`} target="_blank" rel="noreferrer">
              {hood.contract}
            </a>
          </dd>
          <dt>Your account</dt>
          <dd>
            <a href={`${hood.explorer}/address/${hood.account}`} target="_blank" rel="noreferrer">
              {hood.account}
            </a>
          </dd>
          {hood.lastTx && (
            <>
              <dt>Last action</dt>
              <dd>
                <a href={`${hood.explorer}/txns/${hood.lastTx}`} target="_blank" rel="noreferrer">
                  {hood.lastTx.slice(0, 12)}…
                </a>
              </dd>
            </>
          )}
        </dl>
      )}

      <h3>Sea reports from NEAR Intents</h3>
      {hood.sea.length ? (
        <>
          <table className="houses">
            <thead>
              <tr>
                <th scope="col">Lane</th>
                <th scope="col">Route</th>
                <th scope="col" className="num">
                  Cost
                </th>
                <th scope="col" className="num">
                  Sea
                </th>
              </tr>
            </thead>
            <tbody>
              {hood.sea.map((r) => (
                <tr key={r.lane}>
                  <td>{r.lane}</td>
                  <td className="small">{r.route}</td>
                  <td className="num small">{(r.spreadBps / 100).toFixed(2)}%</td>
                  <td className="num">{r.sea}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">
            Each lane follows a real cross-chain route. A live price check, with no money moved, sets how rough the water
            is: {seaWord(hood.sea[0].sea).toLowerCase()} on {hood.sea[0].lane} right now.
          </p>
        </>
      ) : (
        <p className="muted small">Live reports are unavailable, so the sea is drifting on its own.</p>
      )}

      <h3>The books</h3>
      <dl className="facts">
        <dt>Crowns</dt>
        <dd>{crowns(Number(view.market.crown_supply))} in existence, fixed for ever</dd>
        <dt>Guild</dt>
        <dd>{crowns(view.market.guild_cash)} crowns</dd>
        <dt>Tokens</dt>
        <dd>about {tokens} NEP-245 token types in one contract</dd>
      </dl>
    </div>
  );
}

export default function Side(props: Props & { tab: Tab; setTab: (t: Tab) => void; badge: { book: boolean; room: boolean; harbor: boolean } }) {
  const { tab, setTab, badge } = props;
  const tabs: [Tab, string, boolean][] = [
    ["book", "Your Book", badge.book],
    ["room", "The Room", badge.room],
    ["harbor", "Harbor", badge.harbor],
    ["hood", "Under the hood", false],
  ];
  return (
    <section className="side" aria-label="Ledger">
      <div className="tabs" role="tablist">
        {tabs.map(([id, label, dot]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            {label}
            {dot && tab !== id && <i className="dot" />}
          </button>
        ))}
      </div>
      {tab === "book" && <Book {...props} />}
      {tab === "room" && <Room {...props} />}
      {tab === "harbor" && <Harbor {...props} />}
      {tab === "hood" && <Under {...props} />}
    </section>
  );
}
