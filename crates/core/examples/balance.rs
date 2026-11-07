//! Plays many seasons with scripted players and prints how the economy behaved.
//!
//!     cargo run --release -p foul-core --example balance -- 400
//!
//! This is how the numbers in rules.rs were tuned. A healthy economy should
//! punish recklessness, reward care, and still surprise everyone sometimes.

use foul_core::world::Event;
use foul_core::{Action, Config, World};

const YOU: &str = "you.near";

#[derive(Clone, Copy, PartialEq)]
enum Style {
    Idle,
    Reckless,
    SignEverything,
    Careful,
}

impl Style {
    fn name(self) -> &'static str {
        match self {
            Style::Idle => "idle (no play)",
            Style::Reckless => "reckless (100% lines)",
            Style::SignEverything => "signs everything at 50%",
            Style::Careful => "careful underwriter",
        }
    }
}

fn entropy(n: u64) -> [u8; 32] {
    let mut e = [0u8; 32];
    e[..8].copy_from_slice(&n.wrapping_mul(0x9E37_79B9_7F4A_7C15).to_le_bytes());
    e[8..16].copy_from_slice(&n.rotate_left(17).wrapping_mul(0xD1B5_4A32_D192_ED03).to_le_bytes());
    e
}

#[derive(Default)]
struct Tally {
    capital: Vec<u64>,
    failed: u32,
    lines: u64,
    room_failures: u64,
    cascades: u64,
    wrecks: u64,
    home: u64,
    bare: u64,
    withdrew: u64,
    laid_up_peak: u64,
    rate_min: u64,
    rate_max: u64,
    price_min: u64,
    price_max: u64,
    slips: u64,
    offer_sum: u64,
    risk_sum: u64,
    premiums: u64,
    claims: u64,
    guild_end: u64,
    mispriced: u64,
    positions_peak: u64,
    entrants: u64,
    bytes_peak: u64,
}

fn play(style: Style, seed: u64, t: &mut Tally) {
    let mut w = World::new(Config { domain: "fw.test".into(), watch_ms: 4_000, sandbox: true }, seed);
    let mut n = seed * 1_000;
    if style != Style::Idle {
        w.act(YOU, Action::FoundHouse { name: "Bot".into(), agent: false }, &entropy(n)).unwrap();
    }
    let mut failures_at: Vec<u32> = Vec::new();
    let mut seen = 0;
    let mut counted: Vec<u32> = Vec::new();
    while w.intermission.is_none() {
        n += 1;
        w.step(&entropy(n));
        for e in &w.events {
            if e.seq <= seen {
                continue;
            }
            seen = e.seq;
            match e.event {
                Event::HouseFailed { .. } => failures_at.push(e.watch),
                Event::Wrecked { .. } => t.wrecks += 1,
                Event::Home { .. } => t.home += 1,
                Event::SailedBare { .. } => t.bare += 1,
                Event::Withdrew { .. } => t.withdrew += 1,
                _ => {}
            }
        }
        t.bytes_peak = t.bytes_peak.max(borsh::to_vec(&w).unwrap().len() as u64);
        t.positions_peak = t.positions_peak.max(w.positions.len() as u64);

        let view = w.view(Some(YOU));
        for s in &view.slips {
            if !counted.contains(&s.id) && s.qty > 0 {
                counted.push(s.id);
                t.slips += 1;
                t.offer_sum += u64::from(s.offer_bps);
                t.risk_sum += (s.risk_low_bps + s.risk_high_bps) / 2;
                if s.risk_high_bps > u64::from(s.offer_bps) {
                    t.mispriced += 1;
                }
            }
        }

        if style == Style::Idle {
            continue;
        }
        let me = w.house_of(YOU).unwrap();
        if !w.houses[me].active() {
            break;
        }
        for s in &view.slips {
            if s.qty == 0 || w.slips.iter().all(|x| x.id != s.id) {
                continue;
            }
            n += 1;
            let mine = s.quotes.iter().any(|q| usize::from(q.house) == me);
            if mine {
                continue;
            }
            match style {
                Style::Reckless => {
                    let _ = w.act(YOU, Action::Quote { slip: s.id, rate_bps: s.offer_bps, line_bps: 10_000 }, &entropy(n));
                }
                Style::SignEverything => {
                    let _ = w.act(YOU, Action::Quote { slip: s.id, rate_bps: s.offer_bps, line_bps: 5_000 }, &entropy(n));
                }
                Style::Careful => {
                    let mid = (s.risk_low_bps + s.risk_high_bps) / 2;
                    let offer = u64::from(s.offer_bps);
                    if s.storm_bps > 0 || mid * 125 / 100 > offer {
                        continue;
                    }
                    let best = s.quotes.iter().map(|q| u64::from(q.rate_bps)).min().unwrap_or(offer);
                    let rate = (best.saturating_sub(5)).max(mid * 125 / 100).min(offer) as u16;
                    let capital = w.cash(w.houses[me].acct);
                    if w.net_book(me) > capital * 3 / 2 {
                        continue;
                    }
                    let _ = w.act(YOU, Action::Quote { slip: s.id, rate_bps: rate, line_bps: 4_000 }, &entropy(n));
                }
                Style::Idle => {}
            }
        }
        if style == Style::Careful {
            // Lay risk off as soon as the glass falls.
            let threatened: Vec<u32> = view
                .positions
                .iter()
                .filter(|p| usize::from(p.writer) == me && p.ceded == 0)
                .filter(|p| view.storms.iter().any(|st| st.lanes.contains(&p.lane)))
                .map(|p| p.id)
                .collect();
            for position in threatened {
                n += 1;
                let rate = 1_800;
                let _ = w.act(YOU, Action::OfferCession { position, share_bps: 7_000, rate_bps: rate }, &entropy(n));
            }
            for c in &view.claims {
                if c.suspicion >= 45 {
                    n += 1;
                    let _ = w.act(YOU, Action::Inquiry { claim: c.id }, &entropy(n));
                }
            }
        }
    }

    if style != Style::Idle {
        let me = w.house_of(YOU).unwrap();
        if w.houses[me].active() {
            t.capital.push(w.cash(w.houses[me].acct));
        } else {
            t.capital.push(0);
            t.failed += 1;
        }
        t.lines += u64::from(w.houses[me].stats.lines);
    }

    let room_fail = w.houses.iter().filter(|h| !h.active() && h.is_auto()).count() as u64;
    t.room_failures += room_fail;
    failures_at.sort_unstable();
    if failures_at.windows(2).any(|p| p[1] - p[0] <= 4) {
        t.cascades += 1;
    }
    t.entrants += u64::from(w.entrants);
    t.premiums += w.houses.iter().map(|h| h.stats.premiums).sum::<u64>();
    t.claims += w.houses.iter().map(|h| h.stats.claims).sum::<u64>();
    t.guild_end += w.cash(w.guild);
    let peak = w.history.iter().map(|d| u64::from(d.laid_up)).max().unwrap_or(0);
    t.laid_up_peak += peak;
    for d in &w.history {
        let rate = u64::from(d.rate_bps);
        let price = u64::from(d.price_index);
        t.rate_min = if t.rate_min == 0 { rate } else { t.rate_min.min(rate) };
        t.rate_max = t.rate_max.max(rate);
        t.price_min = if t.price_min == 0 { price } else { t.price_min.min(price) };
        t.price_max = t.price_max.max(price);
    }
}

fn pct(sorted: &[u64], p: usize) -> u64 {
    if sorted.is_empty() {
        return 0;
    }
    sorted[(sorted.len() - 1) * p / 100]
}

fn main() {
    let seasons: u64 = std::env::args().nth(1).and_then(|s| s.parse().ok()).unwrap_or(200);
    for style in [Style::Idle, Style::Reckless, Style::SignEverything, Style::Careful] {
        let mut t = Tally::default();
        for seed in 1..=seasons {
            play(style, seed, &mut t);
        }
        let s = seasons;
        t.capital.sort_unstable();
        println!("== {} over {s} seasons", style.name());
        if style != Style::Idle {
            println!(
                "   player: failed {}%  capital p10 {}  median {}  p90 {}  lines/season {}",
                u64::from(t.failed) * 100 / s,
                pct(&t.capital, 10),
                pct(&t.capital, 50),
                pct(&t.capital, 90),
                t.lines / s
            );
        }
        println!(
            "   world : voyages {} wrecks {} bare {} withdrew {} | room failures {:.2} cascades {}% entrants {:.1} laid-up peak {:.1}",
            t.home / s,
            t.wrecks / s,
            t.bare / s,
            t.withdrew / s,
            t.room_failures as f64 / s as f64,
            t.cascades * 100 / s,
            t.entrants as f64 / s as f64,
            t.laid_up_peak as f64 / s as f64,
        );
        println!(
            "   market: slips {} avg offer {} bps avg risk {} bps mispriced {}% | rate {}..{} bps price index {}..{} | loss ratio {}%",
            t.slips / s,
            t.offer_sum / t.slips.max(1),
            t.risk_sum / t.slips.max(1),
            t.mispriced * 100 / t.slips.max(1),
            t.rate_min,
            t.rate_max,
            t.price_min,
            t.price_max,
            t.claims * 100 / t.premiums.max(1),
        );
        println!(
            "   books : guild end {} peak positions {} peak state {} bytes",
            t.guild_end / s,
            t.positions_peak,
            t.bytes_peak
        );
    }
}
