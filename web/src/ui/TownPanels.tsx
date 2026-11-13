// What you do with your coins: build, buy ships, hire a crew, and race the other towns.

import { useState } from "react";
import type { Action, View } from "../types";
import { crowns } from "../words";
import { Character, Coin } from "./art";
import { BuildingArt, ShipArt } from "./townArt";

export type Sheet = "build" | "ships" | "crew" | "towns";

const BUILD_NOTES: Record<number, string> = {
  5: "Room for one more ship",
  6: "Room for two more crew",
  7: "Holds more coins for you",
  8: "Makes every trip safer",
  9: "Fixes ships much faster",
  10: "Earn coins protecting ships",
  11: "Lets you raid other towns",
};

export const CREW_INFO = [
  { face: 11, note: "+15% coins from every trip" },
  { face: 3, note: "Every trip is safer" },
  { face: 8, note: "Your ships sail quicker" },
  { face: 4, note: "+20% coins from every trip" },
];

const PARTS = ["Bigger hold", "Stronger hull", "Better sails"];

function Price({ cost, coins }: { cost: number; coins: number }) {
  return (
    <span className={`price${coins < cost ? " short" : ""}`}>
      <Coin size={16} /> {crowns(cost)}
    </span>
  );
}

function Build({ view, busy, act }: { view: View; busy: boolean; act: (a: Action) => void }) {
  const town = view.town!;
  return (
    <div className="shop-grid">
      {view.catalog.buildings.map((b, kind) => {
        const owned = town.buildings[kind];
        const full = owned >= b.max;
        const locked = town.level < b.level;
        const cost = town.building_costs[kind];
        return (
          <button key={b.name} className={`shop-item${locked ? " locked" : ""}`} disabled={busy || full || locked || town.coins < cost} onClick={() => act({ kind: "build", building: kind })} data-buy={b.name}>
            <BuildingArt kind={kind} size={58} />
            <b>{b.name}</b>
            <small>{locked ? `Level ${b.level}` : b.income ? `Makes ${b.income} ${b.income === 1 ? "coin" : "coins"} every few seconds` : BUILD_NOTES[kind]}</small>
            {full ? <span className="price done">All built</span> : <Price cost={cost} coins={town.coins} />}
            <em className="owned-count">
              {owned}/{b.max}
            </em>
          </button>
        );
      })}
    </div>
  );
}

function Ships({ view, busy, act }: { view: View; busy: boolean; act: (a: Action) => void }) {
  const town = view.town!;
  const roomy = town.ships.length < town.ship_room;
  return (
    <>
      <h3 className="sheet-head">Buy a ship</h3>
      <div className="shop-grid">
        {view.catalog.ships.slice(1).map((s, i) => {
          const locked = town.level < s.level;
          return (
            <button key={s.name} className={`shop-item${locked ? " locked" : ""}`} disabled={busy || locked || !roomy || town.coins < s.cost} onClick={() => act({ kind: "buy_ship", class: i + 1 })} data-buy={s.name}>
              <ShipArt cls={i + 1} size={66} />
              <b>{s.name}</b>
              <small>{locked ? `Level ${s.level}` : `Carries ${s.cargo} crates`}</small>
              <Price cost={s.cost} coins={town.coins} />
            </button>
          );
        })}
      </div>
      {!roomy && <p className="sheet-note">Your dock is full. Build a Dock to make room for another ship.</p>}
      <h3 className="sheet-head">Make your ships better</h3>
      {town.ships.map((ship) => (
        <div key={ship.id} className="upgrade-row">
          <ShipArt cls={ship.class} size={50} />
          <b>{ship.name}</b>
          <div className="upgrade-buttons">
            {PARTS.map((part, p) => {
              const max = p === 2 ? 2 : 3;
              const level = ship.levels[p];
              const done = level >= max;
              return (
                <button key={part} className="buy" disabled={busy || done || town.coins < ship.upgrade_costs[p]} onClick={() => act({ kind: "upgrade_ship", ship: ship.id, part: p })} data-upgrade={p}>
                  {part} {level}/{max}
                  {!done && (
                    <>
                      {" "}
                      <Coin size={14} /> {crowns(ship.upgrade_costs[p])}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

function Crew({ view, busy, act }: { view: View; busy: boolean; act: (a: Action) => void }) {
  const town = view.town!;
  const hired = town.crew.reduce((sum, n) => sum + n, 0);
  return (
    <>
      <p className="sheet-note">
        Crew hired: {hired} of {town.crew_room}. A Tavern makes room for more.
      </p>
      <div className="shop-grid">
        {view.catalog.crew.map((c, kind) => {
          const owned = town.crew[kind];
          const locked = town.level < c.level;
          const cost = town.crew_costs[kind];
          const noRoom = hired >= town.crew_room;
          const full = owned >= c.max;
          return (
            <button key={c.name} className={`shop-item${locked ? " locked" : ""}`} disabled={busy || locked || full || noRoom || town.coins < cost} onClick={() => act({ kind: "hire", crew: kind })} data-buy={c.name}>
              <Character id={CREW_INFO[kind].face} size={62} />
              <b>{c.name}</b>
              <small>{locked ? `Level ${c.level}` : CREW_INFO[kind].note}</small>
              {full ? <span className="price done">All hired</span> : <Price cost={cost} coins={town.coins} />}
              <em className="owned-count">
                {owned}/{c.max}
              </em>
            </button>
          );
        })}
      </div>
    </>
  );
}

/** A little picture of another player's town. */
function MiniTown({ buildings }: { buildings: number[] }) {
  const kinds = buildings.flatMap((n, kind) => (n > 0 ? [kind] : []));
  if (!kinds.length) return <span className="mini-town empty">Nothing built yet</span>;
  return (
    <span className="mini-town">
      {kinds.map((kind) => (
        <span key={kind}>
          <BuildingArt kind={kind} size={26} />
          {buildings[kind] > 1 && <i>{buildings[kind]}</i>}
        </span>
      ))}
    </span>
  );
}

const GIFT = 50;
const SAY_HI = 1;

function Towns({ view, busy, act }: { view: View; busy: boolean; act: (a: Action) => void }) {
  const town = view.town!;
  const hasCove = town.buildings[11] > 0;
  // Real players first, so a friend's ship is never pushed off the end of the list.
  const targets = view.fleet.filter((f) => !f.mine && !f.raided).sort((a, b) => Number(a.bot) - Number(b.bot));
  const people = view.towns.filter((row) => !row.bot && !row.you).sort((a, b) => Number(b.online) - Number(a.online));
  return (
    <>
      <h3 className="sheet-head">Real players</h3>
      {people.length === 0 ? (
        <p className="sheet-note">{view.sandbox ? "Choose Play with others on the start screen to meet real players." : "You're the first one here. Share the game with a friend!"}</p>
      ) : (
        <div className="friends">
          {people.map((row) => (
            <div key={row.id} className="friend" data-friend={row.name}>
              <div className="friend-top">
                <span className={`online-dot${row.online ? " on" : ""}`} title={row.online ? "Around right now" : "Away"} />
                <b>{row.name}</b>
                <small className={row.online ? "friend-status on" : "friend-status"}>{row.online ? "Online now" : "Away"}</small>
                <small>Level {row.level}</small>
                <strong>
                  <Coin size={15} /> {crowns(row.net_worth)}
                </strong>
              </div>
              <MiniTown buildings={row.buildings} />
              <div className="friend-actions">
                <button className="buy" disabled={busy || town.help_in > 0} onClick={() => act({ kind: "help_town", town: row.id })} data-help={row.id}>
                  {town.help_in > 0 ? "Helped!" : `Help: you both get ${crowns(town.help_coins)}`}
                </button>
                <button className="buy" disabled={busy || town.gift_in > 0 || town.coins < GIFT} onClick={() => act({ kind: "send_gift", town: row.id, coins: GIFT })} data-gift={row.id}>
                  Send <Coin size={14} /> {GIFT}
                </button>
                <button className="buy" disabled={busy} onClick={() => act({ kind: "say", phrase: SAY_HI, to: row.id })} data-hi={row.id}>
                  Say hello
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <h3 className="sheet-head">Richest towns</h3>
      <ol className="town-rank">
        {view.towns.slice(0, 12).map((row, i) => (
          <li key={row.id} className={row.you ? "you" : ""}>
            <b>{i + 1}</b>
            <span>
              {row.you ? `${row.name} (you)` : row.name}
              {!row.bot && !row.you && <em className="real-badge">Real player</em>}
              {row.bot && <em className="bot-tag">bot</em>}
            </span>
            <small>Level {row.level}</small>
            <strong>
              <Coin size={15} /> {crowns(row.net_worth)}
            </strong>
          </li>
        ))}
      </ol>
      <p className="sheet-note">The top three towns at the Harbor Festival win prizes.</p>
      <h3 className="sheet-head">Raid a ship at sea</h3>
      {!hasCove ? (
        <p className="sheet-note">Build a Pirate Cove to steal from rival ships.</p>
      ) : targets.length === 0 ? (
        <p className="sheet-note">No rival ships at sea right now.</p>
      ) : town.raid_in > 0 ? (
        <p className="sheet-note">Your pirates are resting.</p>
      ) : (
        <div className="raid-list">
          {targets.slice(0, 6).map((f) => (
            <button key={f.ship} className="buy" disabled={busy || town.coins < view.catalog.raid_cost} onClick={() => act({ kind: "raid", town: f.town, ship: f.ship })} data-raid={f.ship}>
              Raid {f.town_name}
              {!f.bot && " (real player)"}: <Coin size={14} /> {crowns(view.catalog.raid_cost)}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export default function TownPanels({ view, busy, act, tab, onClose }: { view: View; busy: boolean; act: (a: Action) => void; tab: Sheet; onClose: () => void }) {
  const [current, setCurrent] = useState<Sheet>(tab);
  const title: Record<Sheet, string> = { build: "Build", ships: "Ships", crew: "Crew", towns: "Players" };
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label={title[current]} onClick={onClose}>
      <div className="modal sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-tabs">
          {(Object.keys(title) as Sheet[]).map((key) => (
            <button key={key} className={key === current ? "on" : ""} onClick={() => setCurrent(key)}>
              {title[key]}
            </button>
          ))}
          <button className="sheet-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="sheet-body">
          <p className="sheet-coins">
            <Coin size={22} /> {crowns(view.town?.coins ?? 0)}
          </p>
          {current === "build" && <Build view={view} busy={busy} act={act} />}
          {current === "ships" && <Ships view={view} busy={busy} act={act} />}
          {current === "crew" && <Crew view={view} busy={busy} act={act} />}
          {current === "towns" && <Towns view={view} busy={busy} act={act} />}
        </div>
      </div>
    </div>
  );
}
