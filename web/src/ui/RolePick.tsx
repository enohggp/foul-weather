// Choosing a side: run a shop, or take the wheel of a ship.

import { useEffect, useState } from "react";
import * as sound from "../audio";
import { fullName } from "../cast";
import type { Role, View } from "../types";
import { crowns } from "../words";
import { AWNINGS, Character, Coin, Pip, ShopIcon } from "./art";
import { TitleSea } from "./Theatre";

interface Props {
  view: View | null;
  live: boolean;
  working: string | null;
  error: string | null;
  onPick: (role: Role) => void;
  onBack: () => void;
  /** Offered in a practice harbor: play these same roles online instead. */
  onLive?: () => void;
}

export default function RolePick({ view, live, working, error, onPick, onBack, onLive }: Props) {
  const [choosingShip, setChoosingShip] = useState(false);
  const realCaptains = view?.captains.filter((c) => c.player).length ?? 0;
  const realShops = view?.houses.filter((h) => h.kind === "player" && h.active).length ?? 0;

  useEffect(() => {
    if (!document.body.classList.contains("touring")) void sound.speak("who");
  }, []);

  return (
    <main className="title">
      <TitleSea />
      <div className="title-card wide">
        {!choosingShip ? (
          <>
            <div className="title-pip">
              <Pip size={92} />
              <p className="bubble">Who do you want to be?</p>
            </div>
            <div className="roles">
              <button className="role-card shop" disabled={!!working} onClick={() => onPick({ kind: "shop" })}>
                <ShopIcon colour={AWNINGS[0]} size={84} />
                <b>Run a shop</b>
                <span>Protect ships from storms. Captains pay you coins.</span>
              </button>
              <button className="role-card captain" disabled={!!working} onClick={() => setChoosingShip(true)}>
                <Character id={6} size={84} />
                <b>Be a captain</b>
                <span>Sail your own ship. Buy, sell, and ask the shops to protect you.</span>
              </button>
            </div>
            {live && (
              <p className="fine">
                Right now in town: {realShops} real {realShops === 1 ? "shop" : "shops"} and {realCaptains} real{" "}
                {realCaptains === 1 ? "captain" : "captains"}. The rest are run by the game, so there's always someone to play with.
              </p>
            )}
          </>
        ) : (
          <>
            <h2 className="pick-title">Choose your captain</h2>
            <div className="captain-grid">
              {(view?.captains ?? []).map((c) => (
                <button
                  key={c.id}
                  className="captain-card"
                  disabled={!!c.player || !!working}
                  onClick={() => onPick({ kind: "captain", captain: c.id })}
                  title={c.player ? `Played by ${c.player}` : fullName(c.id)}
                >
                  <Character id={c.id} size={58} />
                  <b>{fullName(c.id)}</b>
                  {c.player ? (
                    <small>Played by {c.player}</small>
                  ) : (
                    <small>
                      <Coin size={13} /> {crowns(c.cash)}, {c.hull_word === "sound" || c.hull_word === "fair" ? "strong ship" : "old ship"}
                    </small>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
        {working && <p className="working">{working}</p>}
        {error && <p className="problem">{error}</p>}
        {onLive && !choosingShip && (
          <button className="text-link" disabled={!!working} onClick={onLive}>
            Play these online, with real people
          </button>
        )}
        <button className="text-link back-link" disabled={!!working} onClick={() => (choosingShip ? setChoosingShip(false) : onBack())}>
          Back
        </button>
      </div>
    </main>
  );
}
