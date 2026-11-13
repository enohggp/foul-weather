//! A player's own town: ships, buildings, crew, surprises and raids.

use foul_core::rules;
use foul_core::{Action, Config, World};

const YOU: &str = "you.near";
const RIVAL: &str = "rival.near";

fn world(seed: u64) -> World {
    World::new(Config { domain: "fw.test".into(), watch_ms: 1_000, sandbox: true }, seed)
}

fn entropy(n: u64) -> [u8; 32] {
    let mut e = [0u8; 32];
    e[..8].copy_from_slice(&n.wrapping_mul(0x9E37_79B9_7F4A_7C15).to_le_bytes());
    e
}

fn open(w: &mut World, who: &str) -> usize {
    w.act(who, Action::OpenTown { name: who.into() }, &entropy(1)).unwrap();
    w.town_of(who).unwrap()
}

fn act(w: &mut World, who: &str, a: Action) -> Result<(), String> {
    w.act(who, a, &entropy(2)).map(|_| ())
}

fn coins(w: &World, t: usize) -> u64 {
    w.cash(w.towns[t].acct)
}

fn give(w: &mut World, t: usize, amount: u64) {
    let (guild, acct, crown) = (w.guild, w.towns[t].acct, w.crown);
    w.ledger.transfer(crown, guild, acct, u128::from(amount)).unwrap();
}

#[test]
fn a_new_town_starts_with_one_boat_and_some_coins() {
    let mut w = world(1);
    let t = open(&mut w, YOU);
    assert_eq!(w.towns[t].ships.len(), 1);
    assert_eq!(coins(&w, t), rules::TOWN_START_COINS);
    assert!(w.act(YOU, Action::OpenTown { name: "Twice".into() }, &entropy(1)).is_err());
    let view = w.view(Some(YOU));
    assert!(view.town.is_some());
    assert!(view.towns.iter().any(|row| row.you));
    assert_eq!(view.towns.len(), rules::RIVAL_TOWNS.len() + 1);
    w.audit().unwrap();
}

#[test]
fn ships_are_real_tokens_held_by_their_owner() {
    let mut w = world(2);
    let t = open(&mut w, YOU);
    let token = w.towns[t].ships[0].token;
    assert_eq!(w.ledger.balance(token, w.towns[t].acct), 1);
    assert!(w.ledger.token_name(token).starts_with("ship:"));
}

#[test]
fn a_ship_that_comes_home_early_banks_part_of_its_value() {
    let mut w = world(3);
    let t = open(&mut w, YOU);
    let ship = w.towns[t].ships[0].id;
    act(&mut w, YOU, Action::SendShip { ship, lane: 1, protect: false }).unwrap();
    let full = w.towns[t].ships[0].trip.as_ref().unwrap().full;
    for i in 0..3 {
        w.step(&entropy(10 + i));
    }
    if w.towns[t].ships[0].trip.is_none() {
        return; // Lost on the way, which is allowed.
    }
    let before = coins(&w, t);
    act(&mut w, YOU, Action::ComeHome { ship }).unwrap();
    let banked = coins(&w, t) - before;
    assert!(banked > 0 && banked < full, "banked {banked} of {full}");
    assert!(w.towns[t].ships[0].trip.is_none());
    w.audit().unwrap();
}

#[test]
fn a_ship_that_gets_there_pays_at_least_its_full_value_and_grows_the_streak() {
    for seed in 0..60 {
        let mut w = world(100 + seed);
        let t = open(&mut w, YOU);
        let ship = w.towns[t].ships[0].id;
        act(&mut w, YOU, Action::SendShip { ship, lane: 0, protect: false }).unwrap();
        let full = w.towns[t].ships[0].trip.as_ref().unwrap().full;
        for i in 0..14 {
            w.step(&entropy(seed * 100 + i));
            if w.towns[t].ships[0].trip.is_none() {
                break;
            }
        }
        if w.towns[t].streak == 1 {
            assert!(coins(&w, t) >= rules::TOWN_START_COINS + full * 50 / 100);
            w.audit().unwrap();
            return;
        }
    }
    panic!("no ship ever got there");
}

#[test]
fn a_lost_ship_is_damaged_and_ends_the_streak() {
    let mut lost = 0;
    for seed in 0..120 {
        let mut w = world(200 + seed);
        let t = open(&mut w, YOU);
        w.towns[t].streak = 4;
        let ship = w.towns[t].ships[0].id;
        act(&mut w, YOU, Action::SendShip { ship, lane: 0, protect: false }).unwrap();
        // A very rough sea, so that some ships go down.
        for lane in &mut w.lanes {
            lane.sea = 100;
        }
        for i in 0..8 {
            w.step(&entropy(seed * 100 + i));
        }
        if w.towns[t].wrecks > 0 {
            lost += 1;
            assert_eq!(w.towns[t].streak, 0);
            assert!(act(&mut w, YOU, Action::SendShip { ship, lane: 0, protect: false }).is_err() || !w.towns[t].ships[0].damaged);
        }
    }
    assert!(lost > 0, "no ship was ever lost");
}

#[test]
fn protection_costs_coins_and_pays_out_when_a_ship_is_lost() {
    let mut paid_out = false;
    for seed in 0..200 {
        let mut w = world(400 + seed);
        let t = open(&mut w, YOU);
        let ship = w.towns[t].ships[0].id;
        let before = coins(&w, t);
        act(&mut w, YOU, Action::SendShip { ship, lane: 1, protect: true }).unwrap();
        assert!(coins(&w, t) < before, "the fee was paid");
        let cover = w.towns[t].ships[0].trip.as_ref().unwrap().cover;
        for lane in &mut w.lanes {
            lane.sea = 100;
        }
        let after_fee = coins(&w, t);
        for i in 0..9 {
            w.step(&entropy(seed * 7 + i));
            if w.towns[t].wrecks > 0 {
                assert!(coins(&w, t) >= after_fee + cover);
                paid_out = true;
                w.audit().unwrap();
                break;
            }
        }
        if paid_out {
            break;
        }
    }
    assert!(paid_out, "no protected ship was ever lost");
}

#[test]
fn buildings_earn_coins_up_to_a_limit_and_cost_more_each_time() {
    let mut w = world(5);
    let t = open(&mut w, YOU);
    act(&mut w, YOU, Action::Build { building: 0 }).unwrap();
    assert_eq!(w.towns[t].buildings[0], 1);
    assert!(rules::building_cost(0, 1) > rules::building_cost(0, 0));
    for i in 0..10 {
        w.step(&entropy(600 + i));
    }
    let before = coins(&w, t);
    act(&mut w, YOU, Action::CollectTown).unwrap();
    assert_eq!(coins(&w, t), before + 10);
    for i in 0..(rules::INCOME_STORE_WATCHES + 30) {
        w.step(&entropy(700 + i));
    }
    let before = coins(&w, t);
    act(&mut w, YOU, Action::CollectTown).unwrap();
    assert_eq!(coins(&w, t) - before, rules::INCOME_STORE_WATCHES, "income stops at the store's limit");
    w.audit().unwrap();
}

#[test]
fn you_cannot_buy_what_you_cannot_afford_or_have_not_unlocked() {
    let mut w = world(6);
    let t = open(&mut w, YOU);
    assert!(act(&mut w, YOU, Action::Build { building: rules::BUILD_OFFICE as u8 }).is_err(), "too low a level");
    assert!(act(&mut w, YOU, Action::BuyShip { class: 1 }).is_err(), "too low a level");
    w.towns[t].xp = 100_000;
    assert!(act(&mut w, YOU, Action::Build { building: rules::BUILD_OFFICE as u8 }).is_err(), "too expensive");
    give(&mut w, t, 50_000);
    assert!(act(&mut w, YOU, Action::BuyShip { class: 3 }).is_err(), "no room without a dock");
    act(&mut w, YOU, Action::Build { building: rules::BUILD_DOCK as u8 }).unwrap();
    act(&mut w, YOU, Action::BuyShip { class: 3 }).unwrap();
    assert_eq!(w.towns[t].ships.len(), 2);
    w.audit().unwrap();
}

#[test]
fn crew_and_upgrades_make_a_ship_better() {
    let mut w = world(7);
    let t = open(&mut w, YOU);
    w.towns[t].xp = 100_000;
    give(&mut w, t, 50_000);
    let ship = w.towns[t].ships[0].id;
    let before_full = w.view(Some(YOU)).town.unwrap().ships[0].routes[0].full;
    let before_risk = w.view(Some(YOU)).town.unwrap().ships[0].routes[0].risk_bps;
    act(&mut w, YOU, Action::UpgradeShip { ship, part: 0 }).unwrap();
    act(&mut w, YOU, Action::UpgradeShip { ship, part: 1 }).unwrap();
    act(&mut w, YOU, Action::Hire { crew: rules::CREW_LOOKOUT as u8 }).unwrap();
    let view = w.view(Some(YOU)).town.unwrap();
    assert!(view.ships[0].routes[0].full > before_full);
    assert!(view.ships[0].routes[0].risk_bps < before_risk);
    assert!(act(&mut w, YOU, Action::UpgradeShip { ship, part: 9 }).is_err());
}

#[test]
fn surprises_take_effect_at_the_next_watch() {
    use foul_core::town::{Surprise, SurpriseKind};
    let mut w = world(8);
    let t = open(&mut w, YOU);
    let ship = w.towns[t].ships[0].id;
    act(&mut w, YOU, Action::SendShip { ship, lane: 4, protect: false }).unwrap_or(());
    if w.towns[t].ships[0].trip.is_none() {
        act(&mut w, YOU, Action::SendShip { ship, lane: 1, protect: false }).unwrap();
    }
    let (full, arrives) = {
        let trip = w.towns[t].ships[0].trip.as_mut().unwrap();
        trip.surprise = Some(Surprise { kind: SurpriseKind::Crate, expires: w.watch + 5, answer: None });
        (trip.full, trip.arrives)
    };
    act(&mut w, YOU, Action::AnswerSurprise { ship, yes: true }).unwrap();
    w.step(&entropy(900));
    if let Some(trip) = &w.towns[t].ships[0].trip {
        assert!(trip.full > full);
        assert_eq!(trip.arrives, arrives + 1);
    }
}

#[test]
fn a_raid_needs_a_cove_and_can_steal_from_a_rival() {
    let mut stolen = false;
    for seed in 0..40 {
        let mut w = world(1_000 + seed);
        let t = open(&mut w, YOU);
        let r = open(&mut w, RIVAL);
        let target = w.towns[r].ships[0].id;
        act(&mut w, RIVAL, Action::SendShip { ship: target, lane: 1, protect: false }).unwrap();
        for i in 0..2 {
            w.step(&entropy(seed + i));
        }
        if w.towns[r].ships[0].trip.is_none() {
            continue;
        }
        assert!(act(&mut w, YOU, Action::Raid { town: r as u16, ship: target }).is_err(), "no cove yet");
        w.towns[t].xp = 100_000;
        give(&mut w, t, 5_000);
        act(&mut w, YOU, Action::Build { building: rules::BUILD_COVE as u8 }).unwrap();
        act(&mut w, YOU, Action::Raid { town: r as u16, ship: target }).unwrap();
        let own = w.towns[t].ships[0].id;
        assert!(act(&mut w, YOU, Action::Raid { town: t as u16, ship: own }).is_err(), "not yourself");
        let before = coins(&w, t);
        for i in 0..rules::RAID_WARNING_WATCHES as u64 + 1 {
            w.step(&entropy(seed + 50 + i));
        }
        if coins(&w, t) > before {
            stolen = true;
            w.audit().unwrap();
            break;
        }
    }
    assert!(stolen, "no raid ever worked");
}

#[test]
fn the_festival_brings_ships_home_pays_prizes_and_towns_carry_on() {
    let mut w = world(9);
    let t = open(&mut w, YOU);
    act(&mut w, YOU, Action::Build { building: 0 }).unwrap();
    let ship = w.towns[t].ships[0].id;
    let mut i = 0;
    while w.intermission.is_none() {
        if w.towns[t].ships[0].trip.is_none() {
            let _ = w.act(YOU, Action::SendShip { ship, lane: 0, protect: false }, &entropy(i));
        }
        w.step(&entropy(5_000 + i));
        w.audit().unwrap();
        i += 1;
        assert!(i < 400);
    }
    assert!(w.towns.iter().all(|town| town.ships.iter().all(|s| s.trip.is_none())));
    let (wealth, buildings) = (coins(&w, t), w.towns[t].buildings);
    w.start_next_season();
    let t = w.town_of(YOU).expect("the town survives the season");
    assert_eq!(coins(&w, t), wealth, "the town keeps its coins");
    assert_eq!(w.towns[t].buildings, buildings);
    assert_eq!(w.watch, 0);
    assert!(w.act(YOU, Action::SendShip { ship, lane: 0, protect: false }, &entropy(7)).is_ok());
    w.audit().unwrap();
}

#[test]
fn an_insurance_office_works_for_its_owner_and_survives_the_season() {
    let mut w = world(10);
    let t = open(&mut w, YOU);
    w.towns[t].xp = 100_000;
    give(&mut w, t, 20_000);
    act(&mut w, YOU, Action::Build { building: rules::BUILD_OFFICE as u8 }).unwrap();
    let h = w.house_of(YOU).expect("an office is a shop");
    assert!(w.houses[h].clerk, "it runs itself");
    w.start_next_season();
    assert!(w.house_of(YOU).is_some(), "the office reopens");
    w.audit().unwrap();
}

#[test]
fn the_books_balance_with_busy_towns_for_a_whole_season() {
    let mut w = world(11);
    let t = open(&mut w, YOU);
    let r = open(&mut w, RIVAL);
    for i in 0..168u64 {
        for town in [t, r] {
            let who = if town == t { YOU } else { RIVAL };
            for s in 0..w.towns[town].ships.len() {
                let ship = w.towns[town].ships[s].id;
                if w.towns[town].ships[s].trip.is_none() {
                    let _ = w.act(who, Action::SendShip { ship, lane: (i % 2) as u8, protect: i % 3 == 0 }, &entropy(i));
                } else if i % 7 == 0 {
                    let _ = w.act(who, Action::ComeHome { ship }, &entropy(i));
                }
            }
            let _ = w.act(who, Action::Build { building: 0 }, &entropy(i));
            let _ = w.act(who, Action::CollectTown, &entropy(i));
        }
        w.step(&entropy(8_000 + i));
        w.audit().unwrap();
        if w.intermission.is_some() {
            break;
        }
    }
}

#[test]
fn the_rival_towns_grow_by_themselves() {
    let mut w = world(12);
    let before: u64 = (0..w.towns.len()).map(|t| w.net_worth(t)).sum();
    for i in 0..150 {
        w.step(&entropy(9_000 + i));
    }
    let after: u64 = (0..w.towns.len()).map(|t| w.net_worth(t)).sum();
    assert!(after > before, "{before} became {after}");
    w.audit().unwrap();
}
