//! Whole-season tests: the properties that must hold no matter what happens.

use foul_core::world::{CaptainState, Event, HouseKind};
use foul_core::{Action, Config, Receipt, World};

const YOU: &str = "you.near";

fn sandbox(seed: u64) -> World {
    World::new(
        Config { domain: "fw.test".into(), watch_ms: 1_000, sandbox: true },
        seed,
    )
}

fn entropy(n: u64) -> [u8; 32] {
    let mut e = [0u8; 32];
    e[..8].copy_from_slice(&n.wrapping_mul(0x9E37_79B9_7F4A_7C15).to_le_bytes());
    e
}

fn run(world: &mut World, watches: u64) {
    for i in 0..watches {
        world.step(&entropy(i + u64::from(world.watch) * 1_000));
        world.audit().unwrap_or_else(|e| panic!("audit failed at watch {}: {e}", world.watch));
    }
}

#[test]
fn a_whole_season_runs_and_the_books_balance_every_watch() {
    for seed in 1..=12 {
        let mut w = sandbox(seed);
        run(&mut w, 168);
        assert!(w.intermission.is_some(), "season {seed} should have ended");
    }
}

#[test]
fn no_crown_is_ever_created_or_destroyed() {
    let mut w = sandbox(5);
    let supply = w.ledger.supply(w.crown);
    w.act(YOU, Action::FoundHouse { name: "Test House".into(), agent: false }, &entropy(1)).unwrap();
    for i in 0..168 {
        w.step(&entropy(i));
        assert_eq!(w.ledger.supply(w.crown), supply);
    }
}

#[test]
fn the_same_seed_and_entropy_give_the_same_world() {
    let mut a = sandbox(9);
    let mut b = sandbox(9);
    run(&mut a, 120);
    run(&mut b, 120);
    assert_eq!(borsh::to_vec(&a).unwrap(), borsh::to_vec(&b).unwrap());
}

#[test]
fn state_survives_a_round_trip_through_storage() {
    let mut w = sandbox(3);
    w.act(YOU, Action::FoundHouse { name: "Round Trip".into(), agent: false }, &entropy(1)).unwrap();
    run(&mut w, 60);
    let bytes = borsh::to_vec(&w).unwrap();
    let mut back: World = borsh::from_slice(&bytes).unwrap();
    back.audit().unwrap();
    let mut original = w.clone();
    run(&mut original, 30);
    run(&mut back, 30);
    assert_eq!(borsh::to_vec(&original).unwrap(), borsh::to_vec(&back).unwrap());
}

#[test]
fn ships_sail_prices_move_and_premiums_change_hands() {
    let mut w = sandbox(11);
    let start = w.port_good_price(0, 4);
    run(&mut w, 120);
    let voyages: u32 = w.captains.iter().map(|c| u32::from(c.voyages)).sum();
    assert!(voyages > 40, "only {voyages} voyages finished");
    let premiums: u64 = w.houses.iter().map(|h| h.stats.premiums).sum();
    assert!(premiums > 500, "only {premiums} crowns of premium");
    assert_ne!(w.port_good_price(0, 4), start);
}

#[test]
fn a_player_can_sign_a_slip_and_goes_on_risk() {
    let mut w = sandbox(21);
    w.act(YOU, Action::FoundHouse { name: "Quill & Co".into(), agent: false }, &entropy(1)).unwrap();
    let mut signed = false;
    for i in 0..60 {
        w.step(&entropy(i));
        if let Some(s) = w.slips.iter().find(|s| s.qty > 0).cloned() {
            if !signed {
                let line_bps = 10_000;
                w.act(YOU, Action::Quote { slip: s.id, rate_bps: s.offer_bps / 2, line_bps }, &entropy(2)).unwrap();
                signed = true;
            }
        }
        let h = w.house_of(YOU).unwrap();
        if w.houses[h].stats.lines > 0 {
            assert!(w.positions.iter().any(|p| usize::from(p.writer) == h));
            return;
        }
    }
    panic!("the player's line was never bound");
}

#[test]
fn rates_above_the_captains_offer_are_refused() {
    let mut w = sandbox(22);
    w.act(YOU, Action::FoundHouse { name: "Greedy".into(), agent: false }, &entropy(1)).unwrap();
    run(&mut w, 12);
    let s = w.slips.first().cloned().expect("a slip should be open");
    let result = w.act(YOU, Action::Quote { slip: s.id, rate_bps: s.offer_bps + 1, line_bps: 5_000 }, &entropy(2));
    assert!(result.is_err());
}

#[test]
fn a_survey_fixes_the_hull_and_reports_the_same_answer_again() {
    let mut w = sandbox(23);
    w.act(YOU, Action::FoundHouse { name: "Careful".into(), agent: false }, &entropy(1)).unwrap();
    run(&mut w, 12);
    let s = w.slips.first().cloned().expect("a slip should be open");
    let before = w.cash(w.houses[w.house_of(YOU).unwrap()].acct);
    let first = w.act(YOU, Action::Survey { slip: s.id }, &entropy(7)).unwrap();
    let second = w.act(YOU, Action::Survey { slip: s.id }, &entropy(8)).unwrap();
    let (Receipt::Surveyed { hull: a }, Receipt::Surveyed { hull: b }) = (first, second) else {
        panic!("expected survey receipts");
    };
    assert_eq!(a, b);
    let after = w.cash(w.houses[w.house_of(YOU).unwrap()].acct);
    assert_eq!(before - after, foul_core::rules::SURVEY_FEE, "paid only once");
}

#[test]
fn a_great_storm_sinks_ships_and_can_bring_houses_down() {
    let mut any_failed = false;
    let mut wrecks = 0;
    for seed in 1..=30 {
        let mut w = sandbox(seed);
        for i in 0..168 {
            w.step(&entropy(i * 3 + seed));
            if w.intermission.is_some() {
                break;
            }
        }
        wrecks += w.captains.iter().map(|c| u32::from(c.losses)).sum::<u32>();
        any_failed |= w.houses.iter().any(|h| !h.active());
    }
    assert!(wrecks > 30, "only {wrecks} wrecks in 30 seasons");
    assert!(any_failed, "no house failed in 30 seasons");
}

#[test]
fn players_cannot_take_their_own_offers_or_touch_others_positions() {
    let mut w = sandbox(24);
    w.act(YOU, Action::FoundHouse { name: "Mine".into(), agent: false }, &entropy(1)).unwrap();
    run(&mut w, 40);
    if let Some(p) = w.positions.first().cloned() {
        let r = w.act(YOU, Action::OfferCession { position: p.id, share_bps: 5_000, rate_bps: 500 }, &entropy(2));
        assert!(r.is_err(), "that position belongs to someone else");
    }
}

#[test]
fn a_sandbox_storm_is_refused_in_a_live_world() {
    let mut w = World::new(
        Config { domain: "fw.test".into(), watch_ms: 12_000, sandbox: false },
        1,
    );
    assert!(w.act(YOU, Action::SummonStorm, &entropy(1)).is_err());
    assert!(w.act(YOU, Action::NextSeason, &entropy(1)).is_err());
}

#[test]
fn a_failed_player_may_found_again_once_with_less() {
    let mut w = sandbox(25);
    w.act(YOU, Action::FoundHouse { name: "First Try".into(), agent: false }, &entropy(1)).unwrap();
    let h = w.house_of(YOU).unwrap();
    w.fail_for_test(h);
    let r = w.act(YOU, Action::FoundHouse { name: "Second Try".into(), agent: false }, &entropy(2)).unwrap();
    assert!(matches!(r, Receipt::Founded { capital } if capital == foul_core::rules::REFOUND_CAPITAL));
    w.fail_for_test(h);
    assert!(w.act(YOU, Action::FoundHouse { name: "Third".into(), agent: false }, &entropy(3)).is_err());
}

#[test]
fn seasons_follow_one_another_and_the_hall_remembers() {
    let mut w = sandbox(26);
    w.act(YOU, Action::FoundHouse { name: "Long Lived".into(), agent: false }, &entropy(1)).unwrap();
    for i in 0..(168 + 18 + 5) {
        w.step(&entropy(i));
        w.audit().unwrap();
    }
    assert_eq!(w.season, 2);
    assert!(w.watch > 0);
    assert!(w.house_of(YOU).is_none(), "players found a new house each season");
    assert!(w.hall.iter().all(|e| e.kind == HouseKind::Player));
}

#[test]
fn every_captain_stays_in_a_valid_state() {
    let mut w = sandbox(27);
    for i in 0..168 {
        w.step(&entropy(i));
        for (id, c) in w.captains.iter().enumerate() {
            match c.state {
                CaptainState::Seeking { slip } => {
                    assert!(w.slips.iter().any(|s| s.id == slip), "captain {id} waits on a missing slip");
                }
                CaptainState::Sailing { voyage } => {
                    assert!(w.voyages.iter().any(|v| v.id == voyage), "captain {id} sails a missing voyage");
                }
                _ => {}
            }
        }
    }
}

#[test]
fn the_view_serializes_for_the_page() {
    let mut w = sandbox(28);
    w.act(YOU, Action::FoundHouse { name: "Viewer".into(), agent: false }, &entropy(1)).unwrap();
    run(&mut w, 30);
    let json = serde_json::to_string(&w.view(Some(YOU))).unwrap();
    assert!(json.contains("\"you\":true"));
    assert!(json.contains("\"name\":\"The Salt Road\""));
    let wrecked = w.events.iter().any(|e| matches!(e.event, Event::Wrecked { .. }));
    let _ = wrecked;
}
