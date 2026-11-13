//! Plays many seasons with different styles of sailing, to check that no single
//! simple habit always wins and that reading the sea really pays.
//!
//!     cargo run --release -p foul-core --example town_styles -- 200

use foul_core::rules;
use foul_core::town::Trip;
use foul_core::{Action, Config, World};

const YOU: &str = "you.near";

#[derive(Clone, Copy)]
enum Style {
    /// Never comes home early, always the furthest island.
    AlwaysPushFurthest,
    /// Never comes home early, always the nearest island.
    AlwaysPushNearest,
    /// Comes home at the first sign of trouble, far or near.
    Timid,
    /// Comes home halfway, every single time.
    HalfwayAlways,
    /// Pushes on, but heads home when the danger is high or a storm is close.
    ReadsTheSea,
    /// The same reading of the sea, always on the furthest route it can reach.
    ReadsFurthest,
    /// Goes furthest, and only runs from wild water once well out.
    ReadsWildOnly,
    /// Picks the furthest island that is not wild right now, and runs from wild water.
    Patient,
    /// Someone just having fun: any island, and sometimes taps Come home for no reason.
    Casual,
}

fn entropy(a: u64, b: u64) -> [u8; 32] {
    let mut e = [0u8; 32];
    e[..8].copy_from_slice(&(a.wrapping_mul(0x9E37_79B9_7F4A_7C15) ^ b.wrapping_mul(0xC2B2_AE3D_27D4_EB4F)).to_le_bytes());
    e
}

fn lane_for(w: &World, t: usize, style: Style, turn: u64) -> u8 {
    let level = w.town_level(t);
    let open = (0..rules::LANE_COUNT).filter(|&l| rules::ROUTE_LEVEL[l] <= level).count() as u8;
    match style {
        Style::AlwaysPushNearest => 0,
        Style::Patient => (0..open).rev().find(|&l| w.swells[usize::from(l)] < 75 && w.storm_near(usize::from(l), 8).is_none()).unwrap_or(0),
        Style::AlwaysPushFurthest | Style::ReadsFurthest | Style::ReadsWildOnly => open - 1,
        Style::Timid | Style::HalfwayAlways | Style::ReadsTheSea | Style::Casual => (turn % u64::from(open)) as u8,
    }
}

fn should_come_home(w: &World, trip: &Trip, style: Style, dice: u64) -> bool {
    let span = trip.arrives - trip.sailed;
    let gone = w.watch.saturating_sub(trip.sailed);
    let storm = w.storm_near(usize::from(trip.lane), 1).is_some();
    match style {
        Style::AlwaysPushFurthest | Style::AlwaysPushNearest => false,
        Style::Timid => storm || gone >= span.saturating_sub(2),
        Style::HalfwayAlways => gone * 2 >= span,
        Style::ReadsWildOnly | Style::Patient => w.swells[usize::from(trip.lane)] >= 75,
        Style::ReadsTheSea | Style::ReadsFurthest => {
            let wild = w.swells[usize::from(trip.lane)] >= 75;
            let rough_late = w.swells[usize::from(trip.lane)] >= 55 && gone * 10 >= span * 7;
            (storm || wild || rough_late) && gone * 3 >= span
        }
        Style::Casual => gone > 0 && (dice % 100 < 12 || (w.swells[usize::from(trip.lane)] >= 75 && dice % 100 < 50)),
    }
}

/// The same shopping for every style, so only the sailing differs: whatever the
/// game offers next, something new first, cheapest first.
fn spend(w: &mut World, i: u64) {
    let _ = w.act(YOU, Action::CollectTown, &entropy(i, 1));
    loop {
        let view = w.view(Some(YOU));
        let town = view.town.as_ref().expect("a town");
        let mut goals: Vec<(bool, u64, Action)> = Vec::new();
        for (k, b) in view.catalog.buildings.iter().enumerate() {
            if town.buildings[k] < b.max && town.level >= b.level {
                goals.push((town.buildings[k] > 0, town.building_costs[k], Action::Build { building: k as u8 }));
            }
        }
        if town.ships.len() < town.ship_room {
            for (c, s) in view.catalog.ships.iter().enumerate().skip(1) {
                if town.level >= s.level {
                    goals.push((town.ships.iter().any(|x| usize::from(x.class) == c), s.cost, Action::BuyShip { class: c as u8 }));
                }
            }
        }
        if u32::from(town.crew.iter().sum::<u8>()) < town.crew_room {
            for (k, c) in view.catalog.crew.iter().enumerate() {
                if town.crew[k] < c.max && town.level >= c.level {
                    goals.push((town.crew[k] > 0, town.crew_costs[k], Action::Hire { crew: k as u8 }));
                }
            }
        }
        goals.sort_by_key(|g| (g.0, g.1));
        match goals.into_iter().next() {
            Some((_, cost, action)) if cost <= town.coins => {
                if w.act(YOU, action, &entropy(i, 2)).is_err() {
                    return;
                }
            }
            _ => return,
        }
    }
}

struct Outcome {
    worth: u64,
    sent: u32,
    wrecks: u32,
    level: u32,
    ships: usize,
    rank: usize,
    best_rival: u64,
    middle_rival: u64,
}

fn play(seed: u64, style: Style) -> Outcome {
    let mut w = World::new(Config { domain: "fw.test".into(), watch_ms: 1_000, sandbox: true }, seed);
    w.act(YOU, Action::OpenTown { name: "Bot".into() }, &entropy(seed, 0)).unwrap();
    let t = w.town_of(YOU).unwrap();
    let (mut turn, mut i, mut sent) = (0, 0, 0);
    while w.intermission.is_none() {
        for s in 0..w.towns[t].ships.len() {
            let ship = w.towns[t].ships[s].id;
            match w.towns[t].ships[s].trip.clone() {
                None => {
                    turn += 1;
                    let lane = lane_for(&w, t, style, turn);
                    if w.act(YOU, Action::SendShip { ship, lane, protect: false }, &entropy(seed, i)).is_ok() {
                        sent += 1;
                    }
                }
                Some(trip) => {
                    let dice = seed.wrapping_mul(31).wrapping_add(i * 17 + s as u64 * 7).wrapping_mul(0x9E37_79B9).rotate_left(21);
                    if should_come_home(&w, &trip, style, dice) {
                        let _ = w.act(YOU, Action::ComeHome { ship }, &entropy(seed, i));
                    }
                }
            }
        }
        if i % 3 == 0 {
            spend(&mut w, seed * 1_000 + i);
        }
        w.step(&entropy(seed + 77, i));
        i += 1;
    }
    let town = &w.towns[t];
    let view = w.view(Some(YOU));
    let rivals: Vec<u64> = view.towns.iter().filter(|row| row.bot).map(|row| row.net_worth).collect();
    Outcome {
        worth: w.net_worth(t),
        sent,
        wrecks: town.wrecks,
        level: w.town_level(t),
        ships: town.ships.len(),
        rank: view.towns.iter().position(|row| row.you).unwrap_or(0) + 1,
        best_rival: rivals[0],
        middle_rival: rivals[rivals.len() / 2],
    }
}

fn median(mut values: Vec<u64>) -> u64 {
    values.sort_unstable();
    values[values.len() / 2]
}

fn main() {
    let seasons: u64 = std::env::args().nth(1).and_then(|s| s.parse().ok()).unwrap_or(120);
    println!("style                     median worth   10th pct   90th pct   wrecks   sunk%  level ships  rank  rivals(best/mid)");
    for (name, style) in [
        ("always furthest, no stop", Style::AlwaysPushFurthest),
        ("always nearest, no stop", Style::AlwaysPushNearest),
        ("timid, leaves early", Style::Timid),
        ("always home halfway", Style::HalfwayAlways),
        ("reads the sea", Style::ReadsTheSea),
        ("reads the sea, furthest", Style::ReadsFurthest),
        ("runs from wild water", Style::ReadsWildOnly),
        ("patient, picks its moment", Style::Patient),
        ("casual, just having fun", Style::Casual),
    ] {
        let runs: Vec<Outcome> = (0..seasons).map(|seed| play(seed * 13 + 5, style)).collect();
        let mut worths: Vec<u64> = runs.iter().map(|r| r.worth).collect();
        worths.sort_unstable();
        let wrecks = runs.iter().map(|r| u64::from(r.wrecks)).sum::<u64>() as f64;
        let sent = runs.iter().map(|r| u64::from(r.sent)).sum::<u64>() as f64;
        let level = median(runs.iter().map(|r| u64::from(r.level)).collect());
        let ships = median(runs.iter().map(|r| r.ships as u64).collect());
        let rank = median(runs.iter().map(|r| r.rank as u64).collect());
        println!(
            "{name:25} {:12} {:10} {:10} {:8.1} {:6.1}% {:5} {:5} {:5}  {} / {}",
            worths[worths.len() / 2],
            worths[worths.len() / 10],
            worths[worths.len() * 9 / 10],
            wrecks / seasons as f64,
            100.0 * wrecks / sent.max(1.0),
            level,
            ships,
            rank,
            median(runs.iter().map(|r| r.best_rival).collect()),
            median(runs.iter().map(|r| r.middle_rival).collect())
        );
    }
}
