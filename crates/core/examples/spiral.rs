//! Summons a great storm in the middle of a season and reports how far the
//! damage spreads through the Room.
//!
//!     cargo run --release -p foul-core --example spiral -- 300

use foul_core::world::Event;
use foul_core::{Action, Config, World};

fn entropy(n: u64) -> [u8; 32] {
    let mut e = [0u8; 32];
    e[..8].copy_from_slice(&n.wrapping_mul(0x9E37_79B9_7F4A_7C15).to_le_bytes());
    e
}

fn main() {
    let seasons: u64 = std::env::args().nth(1).and_then(|s| s.parse().ok()).unwrap_or(200);
    let (mut failed_total, mut cascades, mut wrecks, mut worst, mut capital_lost) = (0u64, 0u64, 0u64, 0u64, 0u64);
    for seed in 1..=seasons {
        let mut w = World::new(Config { domain: "fw.test".into(), watch_ms: 1_000, sandbox: true }, seed);
        let mut n = seed * 77_000;
        for _ in 0..60 {
            n += 1;
            w.step(&entropy(n));
        }
        let before: u64 = w.houses.iter().filter(|h| h.active()).map(|h| w.cash(h.acct)).sum();
        n += 1;
        w.act("you.near", Action::FoundHouse { name: "Watcher".into(), agent: false }, &entropy(n)).unwrap();
        w.act("you.near", Action::SummonStorm, &entropy(n)).unwrap();
        let seq = w.seq;
        for _ in 0..16 {
            n += 1;
            w.step(&entropy(n));
        }
        let mut failed = 0;
        for e in w.events.iter().filter(|e| e.seq > seq) {
            match e.event {
                Event::HouseFailed { .. } => failed += 1,
                Event::Wrecked { .. } => wrecks += 1,
                _ => {}
            }
        }
        let after: u64 = w.houses.iter().filter(|h| h.active()).map(|h| w.cash(h.acct)).sum();
        capital_lost += before.saturating_sub(after);
        failed_total += failed;
        worst = worst.max(failed);
        if failed >= 2 {
            cascades += 1;
        }
    }
    println!(
        "after a summoned storm: {:.1} wrecks, {:.2} houses failed (worst {}), 2+ houses in {}% of seasons, {} crowns of Room capital gone",
        wrecks as f64 / seasons as f64,
        failed_total as f64 / seasons as f64,
        worst,
        cascades * 100 / seasons,
        capital_lost / seasons,
    );
}
