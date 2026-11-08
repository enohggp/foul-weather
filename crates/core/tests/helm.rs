//! A person at the wheel of a captain's ship, dealing with people who run shops.

use foul_core::rules;
use foul_core::world::{CaptainState, Event};
use foul_core::{Action, Config, World};

const SAILOR: &str = "sailor.near";
const SHOPKEEPER: &str = "shop.near";
const OTHER: &str = "other.near";

fn world(seed: u64, sandbox: bool) -> World {
    World::new(Config { domain: "fw.test".into(), watch_ms: 1_000, sandbox }, seed)
}

fn entropy(n: u64) -> [u8; 32] {
    let mut e = [0u8; 32];
    e[..8].copy_from_slice(&n.wrapping_mul(0x9E37_79B9_7F4A_7C15).to_le_bytes());
    e
}

fn take(w: &mut World, who: &str, captain: u16) {
    w.act(who, Action::TakeHelm { name: who.into(), captain }, &entropy(1)).unwrap();
}

fn found(w: &mut World, who: &str) {
    w.act(who, Action::FoundHouse { name: who.into(), agent: false }, &entropy(2)).unwrap();
}

/// Plays until the captain is in port and free to plan a trip, then returns its route.
fn ready(w: &mut World, c: usize, from: u64) -> u8 {
    for i in 0..60 {
        if let CaptainState::AtPort { port, ready_at } = w.captains[c].state {
            if w.watch >= ready_at {
                return if usize::from(port) == rules::HUB {
                    0
                } else {
                    rules::LANES.iter().position(|l| l.port == usize::from(port)).unwrap() as u8
                };
            }
        }
        w.step(&entropy(from + i));
    }
    panic!("the ship never came ready");
}

fn sail(w: &mut World, who: &str, c: usize, offer_bps: u16, from: u64) {
    let lane = ready(w, c, from);
    w.act(who, Action::PlanTrip { lane, offer_bps }, &entropy(from)).unwrap();
}

#[test]
fn a_player_can_take_a_free_ship_and_give_it_back() {
    let mut w = world(3, false);
    take(&mut w, SAILOR, 2);
    assert_eq!(w.helm_of(SAILOR), Some(2));
    assert!(w.view(Some(SAILOR)).helm.is_some());
    assert!(w.view(Some(OTHER)).helm.is_none());
    assert_eq!(w.view(None).captains[2].player.as_deref(), Some(SAILOR));
    w.act(SAILOR, Action::LeaveHelm, &entropy(1)).unwrap();
    assert_eq!(w.helm_of(SAILOR), None);
    w.audit().unwrap();
}

#[test]
fn taking_over_at_sea_counts_the_cargo_as_the_captains_money() {
    let mut w = world(16, true);
    for i in 0..40 {
        if matches!(w.captains[0].state, CaptainState::Sailing { .. }) {
            break;
        }
        w.step(&entropy(1_400 + i));
    }
    let CaptainState::Sailing { voyage } = w.captains[0].state else { return };
    let cargo = w.voyages.iter().find(|v| v.id == voyage).unwrap().cargo_cost;
    let cash = w.cash(w.captains[0].acct);
    take(&mut w, SAILOR, 0);
    assert_eq!(w.view(Some(SAILOR)).helm.unwrap().start_cash, cash + cargo);
}

#[test]
fn nobody_can_steal_a_wheel_or_steer_two_ships() {
    let mut w = world(4, false);
    take(&mut w, SAILOR, 2);
    assert!(w.act(OTHER, Action::TakeHelm { name: "Other".into(), captain: 2 }, &entropy(1)).is_err());
    assert!(w.act(SAILOR, Action::TakeHelm { name: "Twice".into(), captain: 3 }, &entropy(1)).is_err());
    assert!(w.act(OTHER, Action::PlanTrip { lane: 0, offer_bps: 500 }, &entropy(1)).is_err());
    assert!(w.act(OTHER, Action::Scuttle, &entropy(1)).is_err());
    assert!(w.act(OTHER, Action::TakeHelm { name: "Ghost".into(), captain: 99 }, &entropy(1)).is_err());
}

#[test]
fn one_person_cannot_protect_their_own_ship() {
    // Otherwise a player could sink a ship and pay the claim to themselves.
    let mut w = world(5, false);
    found(&mut w, SHOPKEEPER);
    assert!(w.act(SHOPKEEPER, Action::TakeHelm { name: "Both".into(), captain: 1 }, &entropy(1)).is_err());
    take(&mut w, SAILOR, 2);
    assert!(w.act(SAILOR, Action::FoundHouse { name: "Both".into(), agent: false }, &entropy(1)).is_err());
}

#[test]
fn a_planned_trip_buys_cargo_and_asks_the_shops() {
    let mut w = world(6, true);
    take(&mut w, SAILOR, 0);
    let before = w.cash(w.captains[0].acct);
    sail(&mut w, SAILOR, 0, 900, 100);
    let CaptainState::Seeking { slip } = w.captains[0].state else { panic!("no trip was opened") };
    let open = w.slips.iter().find(|s| s.id == slip).unwrap();
    assert!(open.steered);
    assert_eq!(open.offer_bps, 900);
    assert!(w.cash(w.captains[0].acct) < before, "the cargo was paid for");
    assert_eq!(w.view(Some(SAILOR)).helm.unwrap().trips.len(), 0, "no more trips while one is open");
}

#[test]
fn a_ship_at_the_wheel_waits_for_its_player_in_practice() {
    let mut w = world(7, true);
    take(&mut w, SAILOR, 0);
    let _ = ready(&mut w, 0, 200);
    let voyages = w.captains[0].voyages;
    for i in 0..40 {
        w.step(&entropy(300 + i));
    }
    assert_eq!(w.captains[0].voyages, voyages);
    assert!(matches!(w.captains[0].state, CaptainState::AtPort { .. }));
}

#[test]
fn a_player_who_walks_away_never_holds_up_a_live_harbor() {
    let mut w = world(8, false);
    take(&mut w, SAILOR, 0);
    for i in 0..300 {
        w.step(&entropy(400 + i));
    }
    assert_eq!(w.helm_of(SAILOR), None, "the wheel came free");
    assert!(w.captains[0].voyages > 0 || w.captains[0].losses > 0, "the captain sailed alone");
    assert!(w.events.iter().any(|e| matches!(e.event, Event::HelmLeft { captain: 0 })) || w.watch > 100);
}

#[test]
fn a_shop_run_by_a_person_can_protect_a_ship_steered_by_a_person() {
    let mut w = world(9, true);
    take(&mut w, SAILOR, 3);
    found(&mut w, SHOPKEEPER);
    sail(&mut w, SAILOR, 3, 1_500, 500);
    let CaptainState::Seeking { slip } = w.captains[3].state else { panic!("no trip") };
    let h = w.house_of(SHOPKEEPER).unwrap();
    let fees_before = w.cash(w.houses[h].acct);
    w.act(SHOPKEEPER, Action::Quote { slip, rate_bps: 200, line_bps: 3_000 }, &entropy(3)).unwrap();
    let mut held = false;
    for i in 0..8 {
        w.step(&entropy(600 + i));
        held |= w.positions.iter().any(|p| usize::from(p.writer) == h);
        if held {
            break;
        }
    }
    assert!(held, "the person's quote was the cheapest, so it should be taken");
    assert!(w.cash(w.houses[h].acct) > fees_before, "the shop was paid by the captain");
    w.audit().unwrap();
}

#[test]
fn offering_nothing_means_sailing_bare_at_the_next_watch() {
    let mut w = world(10, true);
    take(&mut w, SAILOR, 4);
    sail(&mut w, SAILOR, 4, 0, 700);
    w.step(&entropy(800));
    assert!(matches!(w.captains[4].state, CaptainState::Sailing { .. }));
    let CaptainState::Sailing { voyage } = w.captains[4].state else { unreachable!() };
    let v = w.voyages.iter().find(|v| v.id == voyage).unwrap();
    assert_eq!(v.covered_bps, 0);
    assert!(w.act(SAILOR, Action::Scuttle, &entropy(4)).is_err(), "nobody would pay for a bare ship");
}

#[test]
fn a_trip_can_be_cancelled_at_a_small_loss() {
    let mut w = world(11, true);
    take(&mut w, SAILOR, 0);
    let before = {
        let lane = ready(&mut w, 0, 900);
        let cash = w.cash(w.captains[0].acct);
        w.act(SAILOR, Action::PlanTrip { lane, offer_bps: 500 }, &entropy(9)).unwrap();
        cash
    };
    w.act(SAILOR, Action::CancelTrip, &entropy(9)).unwrap();
    let after = w.cash(w.captains[0].acct);
    assert!(after < before && after > before * 80 / 100, "{after} of {before}");
    assert!(matches!(w.captains[0].state, CaptainState::AtPort { .. }));
    w.audit().unwrap();
}

#[test]
fn sail_now_leaves_at_the_next_chance_with_the_cover_it_has() {
    let mut w = world(12, true);
    take(&mut w, SAILOR, 0);
    sail(&mut w, SAILOR, 0, 900, 1_000);
    let opened = w.watch;
    w.step(&entropy(1_100));
    w.act(SAILOR, Action::SailNow, &entropy(9)).unwrap();
    w.step(&entropy(1_101));
    assert!(matches!(w.captains[0].state, CaptainState::Sailing { .. }), "sailed by watch {}", w.watch);
    assert!(w.watch < opened + rules::SLIP_WATCHES);
}

/// Sends a steered ship to sea with a person's shop covering all of it.
fn protected_at_sea(w: &mut World, from: u64) -> (u32, usize) {
    take(w, SAILOR, 3);
    found(w, SHOPKEEPER);
    let h = w.house_of(SHOPKEEPER).unwrap();
    sail(w, SAILOR, 3, 1_500, from);
    let CaptainState::Seeking { slip } = w.captains[3].state else { panic!("no trip") };
    w.act(SHOPKEEPER, Action::Quote { slip, rate_bps: 60, line_bps: 10_000 }, &entropy(3)).unwrap();
    for i in 0..10 {
        if let CaptainState::Sailing { voyage } = w.captains[3].state {
            return (voyage, h);
        }
        w.step(&entropy(from + 50 + i));
    }
    panic!("the ship never sailed");
}

#[test]
fn a_ship_sunk_on_purpose_goes_down_and_leaves_a_claim_that_looks_bad_in_calm_water() {
    let mut w = world(13, true);
    let (voyage, _) = protected_at_sea(&mut w, 1_200);
    assert!(w.act(SAILOR, Action::Scuttle, &entropy(5)).is_err(), "not in sight of the harbor");
    w.step(&entropy(1_300));
    if !w.voyages.iter().any(|v| v.id == voyage) {
        return; // The sea took it first, which is fair.
    }
    w.act(SAILOR, Action::Scuttle, &entropy(5)).unwrap();
    w.step(&entropy(1_301));
    assert!(!w.voyages.iter().any(|v| v.id == voyage), "it went down at the next watch");
    let claim = w.claims.iter().find(|c| c.voyage == voyage).expect("a claim was made");
    assert!(claim.deliberate && claim.steered);
    assert!(claim.suspicion >= 10);
    w.audit().unwrap();
}

#[test]
fn an_inquiry_usually_catches_a_deliberate_wreck() {
    let (mut caught, mut tried) = (0, 0);
    for seed in 0..30 {
        let mut w = world(100 + seed, true);
        let (voyage, h) = protected_at_sea(&mut w, 2_000 + seed * 100);
        w.step(&entropy(3_000 + seed));
        if !w.voyages.iter().any(|v| v.id == voyage) {
            continue;
        }
        w.act(SAILOR, Action::Scuttle, &entropy(5)).unwrap();
        w.step(&entropy(3_100 + seed));
        let Some(claim) = w.claims.iter().find(|c| c.voyage == voyage).map(|c| c.id) else { continue };
        tried += 1;
        let shop_before = w.cash(w.houses[h].acct);
        let _ = w.act(SHOPKEEPER, Action::Inquiry { claim }, &entropy(6));
        w.step(&entropy(3_200 + seed));
        if w.events.iter().any(|e| matches!(e.event, Event::Fraud { .. })) {
            caught += 1;
            assert!(w.cash(w.houses[h].acct) >= shop_before.saturating_sub(rules::INQUIRY_FEE));
            assert!(w.captains[3].frauds > 0);
        }
        w.audit().unwrap();
    }
    assert!(tried >= 15, "tried {tried}");
    assert!(caught * 100 >= tried * 60, "caught {caught} of {tried}");
}

#[test]
fn an_honest_player_is_never_framed() {
    // Steered ships that sink by themselves must never be "proven" to be fraud.
    let mut framed = 0;
    let mut wrecks = 0;
    for seed in 0..40 {
        let mut w = world(500 + seed, true);
        take(&mut w, SAILOR, 7); // Old Pike's weak ship.
        found(&mut w, SHOPKEEPER);
        for i in 0..168 {
            if let CaptainState::AtPort { port, ready_at } = w.captains[7].state {
                if w.watch >= ready_at {
                    let lane = if usize::from(port) == rules::HUB {
                        4
                    } else {
                        rules::LANES.iter().position(|l| l.port == usize::from(port)).unwrap() as u8
                    };
                    let _ = w.act(SAILOR, Action::PlanTrip { lane, offer_bps: 2_000 }, &entropy(i));
                }
            }
            if let CaptainState::Seeking { slip } = w.captains[7].state {
                let _ = w.act(SHOPKEEPER, Action::Quote { slip, rate_bps: 800, line_bps: 10_000 }, &entropy(i));
            }
            let claims: Vec<u32> = w.claims.iter().map(|c| c.id).collect();
            for claim in claims {
                if w.act(SHOPKEEPER, Action::Inquiry { claim }, &entropy(i)).is_ok() {
                    wrecks += 1;
                }
            }
            w.step(&entropy(seed * 1_000 + i));
            if w.intermission.is_some() {
                break;
            }
        }
        framed += w.captains[7].frauds;
        w.audit().unwrap();
    }
    assert!(wrecks > 0, "no honest wrecks were tested");
    assert_eq!(framed, 0);
}

#[test]
fn a_new_season_clears_the_wheels() {
    let mut w = world(14, true);
    take(&mut w, SAILOR, 1);
    w.act(SAILOR, Action::LeaveHelm, &entropy(1)).unwrap();
    take(&mut w, SAILOR, 1);
    w.start_next_season();
    assert_eq!(w.helm_of(SAILOR), None);
    take(&mut w, SAILOR, 1);
    w.audit().unwrap();
}

#[test]
fn the_books_balance_through_a_season_with_people_at_the_wheel() {
    let mut w = world(15, false);
    take(&mut w, SAILOR, 0);
    take(&mut w, OTHER, 5);
    found(&mut w, SHOPKEEPER);
    for i in 0..168u64 {
        for (who, c) in [(SAILOR, 0usize), (OTHER, 5usize)] {
            if let CaptainState::AtPort { port, ready_at } = w.captains[c].state {
                if w.watch >= ready_at {
                    let lane = if usize::from(port) == rules::HUB {
                        (i % 5) as u8
                    } else {
                        rules::LANES.iter().position(|l| l.port == usize::from(port)).unwrap() as u8
                    };
                    let _ = w.act(who, Action::PlanTrip { lane, offer_bps: 900 }, &entropy(i));
                }
            }
        }
        w.step(&entropy(i + 7_000));
        w.audit().unwrap();
        if w.intermission.is_some() {
            break;
        }
    }
}
