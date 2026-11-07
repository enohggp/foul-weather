//! What a player may see. Built from the state on request, so the same JSON
//! reaches the page whether the world runs in the browser or on NEAR.

use crate::roster::CAPTAINS;
use crate::rules::{self, GOOD_COUNT, HUB, LANES, LANE_COUNT, PORTS, PORT_COUNT};
use crate::world::*;
use serde::Serialize;

#[derive(Serialize)]
pub struct WorldView {
    pub season: u32,
    pub watch: u32,
    pub watches_per_day: u32,
    pub season_watches: u32,
    pub watch_ms: u64,
    pub sandbox: bool,
    pub intermission: Option<u32>,
    pub seq: u64,
    pub lanes: Vec<LaneView>,
    pub ports: Vec<PortView>,
    pub captains: Vec<CaptainView>,
    pub houses: Vec<HouseView>,
    pub slips: Vec<SlipView>,
    pub voyages: Vec<VoyageView>,
    pub positions: Vec<PositionView>,
    pub offers: Vec<OfferView>,
    pub claims: Vec<ClaimView>,
    pub storms: Vec<StormView>,
    pub market: MarketView,
    pub history: Vec<DayStat>,
    pub hall: Vec<HallEntry>,
    pub events: Vec<EventView>,
    pub fees: FeesView,
}

#[derive(Serialize)]
pub struct FeesView {
    pub survey: u64,
    pub inquiry: u64,
    pub refit: u64,
    pub reckoning_watches: u32,
    pub max_gearing: u64,
}

#[derive(Serialize)]
pub struct LaneView {
    pub id: u8,
    pub name: &'static str,
    pub port: u8,
    pub sea: u8,
    pub live_report: bool,
    pub danger_bps: u64,
    pub watches: u32,
}

#[derive(Serialize)]
pub struct GoodView {
    pub good: u8,
    pub name: &'static str,
    pub price: u64,
    pub usual: u64,
    pub stock: u32,
    pub target: u32,
}

#[derive(Serialize)]
pub struct PortView {
    pub id: u8,
    pub name: &'static str,
    pub makes: &'static str,
    pub goods: Vec<GoodView>,
}

#[derive(Serialize)]
pub struct CaptainView {
    pub id: u16,
    pub account: String,
    pub name: &'static str,
    pub ship: &'static str,
    pub capacity: u32,
    pub cash: u64,
    pub state: CaptainState,
    pub hull_word: &'static str,
    pub rumour: &'static str,
    pub voyages: u16,
    pub losses: u16,
    pub frauds: u16,
    pub bond_owed: u64,
}

#[derive(Serialize)]
pub struct HouseView {
    pub id: u16,
    pub account: String,
    pub name: String,
    pub kind: HouseKind,
    pub active: bool,
    pub you: bool,
    pub capital: u64,
    pub reputation: u8,
    pub fear: u8,
    pub net_book: u64,
    pub net_by_lane: [u64; LANE_COUNT],
    pub premiums: u64,
    pub claims: u64,
    pub ceded: u64,
    pub assumed: u64,
    pub recovered: u64,
    pub lines: u32,
    pub wrecks: u32,
    pub clerk: bool,
    pub refounded: bool,
}

#[derive(Serialize)]
pub struct Reason {
    pub code: &'static str,
    pub value: i64,
}

#[derive(Serialize)]
pub struct QuoteView {
    pub house: u16,
    pub rate_bps: u16,
    pub line_bps: u16,
}

#[derive(Serialize)]
pub struct SlipView {
    pub id: u32,
    pub captain: u16,
    pub lane: u8,
    pub outbound: bool,
    pub from: u8,
    pub to: u8,
    pub good: u8,
    pub good_name: &'static str,
    pub qty: u32,
    pub sum_insured: u64,
    pub offer_bps: u16,
    pub opened: u32,
    pub closes: u32,
    pub retried: bool,
    /// Likely risk of this voyage, lowest and highest, in basis points.
    pub risk_low_bps: u64,
    pub risk_high_bps: u64,
    /// Added expected loss from storms already forecast, included above.
    pub storm_bps: u64,
    pub surveyed: Option<u8>,
    pub reasons: Vec<Reason>,
    pub quotes: Vec<QuoteView>,
}

#[derive(Serialize)]
pub struct VoyageView {
    pub id: u32,
    pub captain: u16,
    pub lane: u8,
    pub outbound: bool,
    pub good_name: &'static str,
    pub qty: u32,
    pub sum_insured: u64,
    pub covered_bps: u16,
    pub sailed: u32,
    pub arrives: u32,
}

#[derive(Serialize)]
pub struct PositionView {
    pub id: u32,
    pub voyage: u32,
    pub lane: u8,
    pub writer: u16,
    pub token: String,
    /// The house owed under this promise, if it is reinsurance.
    pub owed_to: Option<u16>,
    pub sum: u64,
    pub ceded: u64,
    pub rate_bps: u16,
    pub parent: Option<u32>,
    /// For your own risks: a rate the Room would probably accept to carry it.
    pub lay_off_hint_bps: u16,
}

#[derive(Serialize)]
pub struct OfferView {
    pub id: u32,
    pub house: u16,
    pub position: u32,
    pub lane: u8,
    pub voyage: u32,
    pub share_bps: u16,
    pub sum: u64,
    pub rate_bps: u16,
    pub premium: u64,
    pub expires: u32,
}

#[derive(Serialize)]
pub struct ClaimView {
    pub id: u32,
    pub voyage: u32,
    pub captain: u16,
    pub lane: u8,
    pub sum: u64,
    pub lost_at: u32,
    pub due: u32,
    pub suspicion: u8,
    pub inquired: bool,
}

#[derive(Serialize)]
pub struct StormView {
    pub id: u32,
    pub lanes: Vec<u8>,
    pub strength_bps: u16,
    pub starts: u32,
    pub ends: u32,
    pub great: bool,
}

#[derive(Serialize)]
pub struct MarketView {
    pub rate_bps: u16,
    pub price_index: u64,
    pub room_capital: u64,
    pub at_sea: u32,
    pub laid_up: u32,
    pub guild_cash: u64,
    pub crown_supply: String,
}

#[derive(Serialize)]
pub struct EventView {
    pub seq: u64,
    pub watch: u32,
    #[serde(flatten)]
    pub event: Event,
}

fn hull_word(hull: u8) -> &'static str {
    match hull {
        85..=100 => "sound",
        65..=84 => "fair",
        45..=64 => "tired",
        25..=44 => "worn",
        _ => "rotten",
    }
}

fn rumour(shady: u8, frauds: u16, losses: u16) -> &'static str {
    if frauds > 0 {
        "proven fraud"
    } else if shady >= 60 {
        "people talk"
    } else if losses >= 3 {
        "unlucky"
    } else if shady >= 30 {
        "keeps to themselves"
    } else {
        "well liked"
    }
}

impl World {
    /// Risk a voyage would run, with the storm forecast added in.
    fn forecast_risk(&self, s: &Slip, hull: u8) -> (u64, u64) {
        let lane = usize::from(s.lane);
        let base = rules::voyage_risk_bps(lane, self.lanes[lane].sea, hull).min(rules::BPS);
        let sails = s.closes;
        let lands = sails + LANES[lane].watches;
        // Chance of surviving every storm watch, so the total can never pass 100%.
        let mut survive = rules::BPS - base;
        for st in self.storms.iter().filter(|st| st.covers(lane)) {
            let hazard = rules::storm_hazard_bps(u64::from(st.strength_bps), hull).min(rules::BPS);
            for _ in st.starts.max(sails)..st.ends.min(lands) {
                survive = survive * (rules::BPS - hazard) / rules::BPS;
            }
        }
        (base, rules::BPS - survive - base)
    }

    /// The lowest rate any Room house would likely accept to carry part of a risk.
    fn lay_off_hint(&self, p: &Position) -> u16 {
        let lane = usize::from(p.lane);
        let hull = self
            .voyages
            .iter()
            .find(|v| v.id == p.voyage)
            .map(|v| self.captains[usize::from(v.captain)].hull)
            .unwrap_or(60);
        let base = rules::voyage_risk_bps(lane, self.lanes[lane].sea, hull);
        let horizon = LANES[lane].watches + 1;
        let storm = self.storm_near(lane, horizon);
        let lowest = (0..self.houses.len())
            .filter(|&h| self.houses[h].active() && self.houses[h].is_auto())
            .map(|h| {
                let persona = self.persona(h);
                let noticed = storm.filter(|s| self.watch >= s.warned + persona.slow_watches);
                let load = noticed.map_or(0, |s| u64::from(s.strength_bps) * u64::from(s.ends - s.starts));
                rules::reinsurer_ask_bps(persona, base + load, self.houses[h].fear, self.book_full_pct(h))
            })
            .min()
            .unwrap_or(4_000);
        (lowest * 112 / 100).clamp(100, 4_000) as u16
    }

    fn slip_reasons(&self, s: &Slip) -> Vec<Reason> {
        let c = usize::from(s.captain);
        let def = &CAPTAINS[c];
        let cash = self.cash(self.captains[c].acct);
        let profit = s.revenue as i64 - s.cargo_cost as i64 - s.provisions as i64;
        let mut reasons = vec![
            Reason { code: "profit", value: profit },
            Reason { code: "gives_up_pct", value: rules::gives_up_pct(def.thrift) as i64 },
        ];
        if s.qty > 0 {
            let dest = if s.outbound { LANES[usize::from(s.lane)].port } else { HUB };
            let price = self.port_good_price(dest, usize::from(s.good));
            let multiple = rules::price_multiple_pct(usize::from(s.good), price);
            reasons.push(Reason { code: "dest_price_pct", value: multiple as i64 });
        } else {
            reasons.push(Reason { code: "ballast", value: 0 });
        }
        if cash < 500 {
            reasons.push(Reason { code: "short_of_cash", value: cash as i64 });
        }
        if s.retried {
            reasons.push(Reason { code: "second_try", value: 20 });
        }
        if self.captains[c].losses > 0 {
            reasons.push(Reason { code: "lost_ships", value: i64::from(self.captains[c].losses) });
        }
        reasons
    }

    /// Builds the page's picture of the world, as seen by `viewer`.
    pub fn view(&self, viewer: Option<&str>) -> WorldView {
        let you = viewer.and_then(|v| self.house_of(v));

        let lanes = (0..LANE_COUNT)
            .map(|i| {
                let l = &self.lanes[i];
                let fresh = l.report.is_some()
                    && self.watch.saturating_sub(l.reported_at) <= rules::SEA_REPORT_FRESH_WATCHES;
                LaneView {
                    id: i as u8,
                    name: LANES[i].name,
                    port: LANES[i].port as u8,
                    sea: l.sea,
                    live_report: fresh,
                    danger_bps: LANES[i].danger_bps,
                    watches: LANES[i].watches,
                }
            })
            .collect();

        let ports = (0..PORT_COUNT)
            .map(|p| PortView {
                id: p as u8,
                name: PORTS[p].name,
                makes: rules::GOODS[PORTS[p].makes].name,
                goods: (0..GOOD_COUNT)
                    .filter_map(|g| {
                        let (target, _) = rules::port_stock_rule(p, g);
                        (target > 0).then(|| GoodView {
                            good: g as u8,
                            name: rules::GOODS[g].name,
                            price: self.port_good_price(p, g),
                            usual: rules::GOODS[g].base_price,
                            stock: self.ports[p].stock[g],
                            target,
                        })
                    })
                    .collect(),
            })
            .collect();

        let captains = self
            .captains
            .iter()
            .enumerate()
            .map(|(i, c)| CaptainView {
                id: i as u16,
                account: self.ledger.account_name(c.acct).to_string(),
                name: CAPTAINS[i].name,
                ship: CAPTAINS[i].ship,
                capacity: CAPTAINS[i].capacity,
                cash: self.cash(c.acct),
                state: c.state.clone(),
                hull_word: hull_word(c.hull),
                rumour: rumour(CAPTAINS[i].shady, c.frauds, c.losses),
                voyages: c.voyages,
                losses: c.losses,
                frauds: c.frauds,
                bond_owed: c.bond.as_ref().map(|b| b.owed).unwrap_or(0),
            })
            .collect();

        let houses = self
            .houses
            .iter()
            .enumerate()
            .map(|(i, h)| {
                let net_by_lane: [u64; LANE_COUNT] = core::array::from_fn(|l| self.net_on_lane(i, l));
                HouseView {
                    id: i as u16,
                    account: self.ledger.account_name(h.acct).to_string(),
                    name: h.name.clone(),
                    kind: h.kind.clone(),
                    active: h.active(),
                    you: you == Some(i),
                    capital: self.cash(h.acct),
                    reputation: h.reputation,
                    fear: h.fear,
                    net_book: net_by_lane.iter().sum(),
                    net_by_lane,
                    premiums: h.stats.premiums,
                    claims: h.stats.claims,
                    ceded: h.stats.ceded,
                    assumed: h.stats.assumed,
                    recovered: h.stats.recovered,
                    lines: h.stats.lines,
                    wrecks: h.stats.wrecks,
                    clerk: h.clerk,
                    refounded: h.refounded,
                }
            })
            .collect();

        let slips = self
            .slips
            .iter()
            .map(|s| {
                let c = usize::from(s.captain);
                let believed = self.captains[c].hull;
                let seen = you
                    .filter(|h| s.surveyed_by.contains(&(*h as u16)))
                    .and_then(|_| s.hull);
                let (low, high, storm) = match seen {
                    Some(hull) => {
                        let (base, storm) = self.forecast_risk(s, hull);
                        (base + storm, base + storm, storm)
                    }
                    None => {
                        let top = believed.saturating_add(rules::HULL_SPREAD).min(100);
                        let bottom = believed.saturating_sub(rules::HULL_SPREAD).max(8);
                        let (best, storm_best) = self.forecast_risk(s, top);
                        let (worst, storm_worst) = self.forecast_risk(s, bottom);
                        (best + storm_best, worst + storm_worst, storm_worst)
                    }
                };
                let spoke = LANES[usize::from(s.lane)].port as u8;
                SlipView {
                    id: s.id,
                    captain: s.captain,
                    lane: s.lane,
                    outbound: s.outbound,
                    from: if s.outbound { HUB as u8 } else { spoke },
                    to: if s.outbound { spoke } else { HUB as u8 },
                    good: s.good,
                    good_name: rules::GOODS[usize::from(s.good)].name,
                    qty: s.qty,
                    sum_insured: s.sum_insured,
                    offer_bps: s.offer_bps,
                    opened: s.opened,
                    closes: s.closes,
                    retried: s.retried,
                    risk_low_bps: low,
                    risk_high_bps: high,
                    storm_bps: storm,
                    surveyed: seen,
                    reasons: self.slip_reasons(s),
                    quotes: s
                        .quotes
                        .iter()
                        .map(|q| QuoteView { house: q.house, rate_bps: q.rate_bps, line_bps: q.line_bps })
                        .collect(),
                }
            })
            .collect();

        let voyages = self
            .voyages
            .iter()
            .map(|v| VoyageView {
                id: v.id,
                captain: v.captain,
                lane: v.lane,
                outbound: v.outbound,
                good_name: rules::GOODS[usize::from(v.good)].name,
                qty: v.qty,
                sum_insured: v.sum_insured,
                covered_bps: v.covered_bps,
                sailed: v.sailed,
                arrives: v.arrives,
            })
            .collect();

        let positions = self
            .positions
            .iter()
            .map(|p| {
                let owed_to = p.parent.and_then(|parent| {
                    self.positions.iter().find(|q| q.id == parent).map(|q| q.writer)
                });
                PositionView {
                    id: p.id,
                    voyage: p.voyage,
                    lane: p.lane,
                    writer: p.writer,
                    token: self.ledger.token_name(p.token).to_string(),
                    owed_to,
                    sum: p.sum,
                    ceded: self.ceded_from(p.id),
                    rate_bps: p.rate_bps,
                    parent: p.parent,
                    lay_off_hint_bps: if you == Some(usize::from(p.writer)) { self.lay_off_hint(p) } else { 0 },
                }
            })
            .collect();

        let offers = self
            .offers
            .iter()
            .filter_map(|o| {
                let p = self.positions.iter().find(|p| p.id == o.position)?;
                let sum = rules::of_bps(p.sum, u64::from(o.share_bps));
                Some(OfferView {
                    id: o.id,
                    house: o.house,
                    position: o.position,
                    lane: p.lane,
                    voyage: p.voyage,
                    share_bps: o.share_bps,
                    sum,
                    rate_bps: o.rate_bps,
                    premium: rules::of_bps(sum, u64::from(o.rate_bps)),
                    expires: o.expires,
                })
            })
            .collect();

        let claims = self
            .claims
            .iter()
            .map(|c| ClaimView {
                id: c.id,
                voyage: c.voyage,
                captain: c.captain,
                lane: c.lane,
                sum: c.sum,
                lost_at: c.lost_at,
                due: c.due,
                suspicion: c.suspicion,
                inquired: c.inquired,
            })
            .collect();

        let storms = self
            .storms
            .iter()
            .map(|s| StormView {
                id: s.id,
                lanes: (0..LANE_COUNT as u8).filter(|l| s.covers(usize::from(*l))).collect(),
                strength_bps: s.strength_bps,
                starts: s.starts,
                ends: s.ends,
                great: s.great,
            })
            .collect();

        let mut index = 0;
        for port in 1..PORT_COUNT {
            let good = PORTS[port].makes;
            index += rules::price_multiple_pct(good, self.port_good_price(HUB, good));
        }
        let market = MarketView {
            rate_bps: self.last_rate_bps,
            price_index: index / (PORT_COUNT as u64 - 1),
            room_capital: self.houses.iter().filter(|h| h.active()).map(|h| self.cash(h.acct)).sum(),
            at_sea: self.voyages.len() as u32,
            laid_up: self
                .captains
                .iter()
                .filter(|c| matches!(c.state, CaptainState::LaidUp { .. }))
                .count() as u32,
            guild_cash: self.cash(self.guild),
            crown_supply: self.ledger.supply(self.crown).to_string(),
        };

        WorldView {
            season: self.season,
            watch: self.watch,
            watches_per_day: rules::WATCHES_PER_DAY,
            season_watches: self.season_length(),
            watch_ms: self.cfg.watch_ms,
            sandbox: self.cfg.sandbox,
            intermission: self.intermission,
            seq: self.seq,
            lanes,
            ports,
            captains,
            houses,
            slips,
            voyages,
            positions,
            offers,
            claims,
            storms,
            market,
            history: self.history.clone(),
            hall: self.hall.clone(),
            events: self
                .events
                .iter()
                .map(|e| EventView { seq: e.seq, watch: e.watch, event: e.event.clone() })
                .collect(),
            fees: FeesView {
                survey: rules::SURVEY_FEE,
                inquiry: rules::INQUIRY_FEE,
                refit: rules::REFIT_COST,
                reckoning_watches: rules::RECKONING_WATCHES,
                max_gearing: rules::MAX_GEARING,
            },
        }
    }
}
