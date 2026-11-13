//! What a player may see. Built from the state on request, so the same JSON
//! reaches the page whether the world runs in the browser or on NEAR.

use crate::engine::{lane_of_port, trip_goods};
use crate::roster::CAPTAINS;
use crate::rules::{self, GOOD_COUNT, HUB, LANES, LANE_COUNT, PORTS, PORT_COUNT};
use crate::town::SurpriseKind;
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
    /// The ship this viewer is steering, if they are a captain.
    pub helm: Option<HelmView>,
    /// The viewer's own town, if they have one.
    pub town: Option<TownView>,
    /// Every town, best first.
    pub towns: Vec<TownRow>,
    /// Every town's ship at sea, for the map.
    pub fleet: Vec<FleetShip>,
    pub catalog: Catalog,
    /// The latest harbor talk, oldest first.
    pub chat: Vec<ChatView>,
}

#[derive(Serialize)]
pub struct ChatView {
    pub id: u32,
    pub watch: u32,
    pub town: u16,
    pub name: String,
    pub bot: bool,
    pub you: bool,
    pub text: String,
    /// True when these are the player's own words, not one of the set phrases.
    pub typed: bool,
    pub to: Option<u16>,
    pub to_name: Option<String>,
    pub to_you: bool,
}

#[derive(Serialize)]
pub struct TownTripView {
    pub lane: u8,
    pub to: u8,
    pub sailed: u32,
    pub arrives: u32,
    pub full: u64,
    /// What coming home right now would bank.
    pub now: u64,
    pub cover: u64,
    /// The chance of being lost in the coming watch.
    pub danger_bps: u64,
    /// The waves on this route right now, from 0 to 100.
    pub swell: u8,
    /// Watches until a storm reaches this route, if one is forecast.
    pub storm_in: Option<u32>,
    pub surprise: Option<SurpriseKind>,
    pub surprise_answered: bool,
    /// Another real player sailing this route, which makes it safer.
    pub convoy: Option<String>,
    /// Whose pirates are on their way to this ship.
    pub raid_from: Option<String>,
    /// Who pays out if this ship is lost.
    pub insurer: Option<String>,
}

#[derive(Serialize)]
pub struct ShipView {
    pub id: u32,
    pub token: String,
    pub class: u8,
    pub name: &'static str,
    pub cargo_units: u64,
    pub hull: u8,
    pub levels: [u8; 3],
    pub damaged: bool,
    pub ready_in: u32,
    pub repair_cost: u64,
    /// What the next level of cargo, hull and sails would cost.
    pub upgrade_costs: [u64; 3],
    pub trip: Option<TownTripView>,
    /// The worth of each route for this ship, and its chance of being lost.
    pub routes: Vec<RouteView>,
}

#[derive(Serialize)]
pub struct RouteView {
    pub lane: u8,
    pub to: u8,
    pub good_name: &'static str,
    pub full: u64,
    /// What the cargo costs up front.
    pub cost: u64,
    pub market_pct: u64,
    pub risk_bps: u64,
    pub storm: bool,
    pub watches: u32,
    pub locked_until: u32,
    pub protect_fee: Option<u64>,
    pub cover: u64,
    /// Another real player already sailing this route.
    pub convoy: Option<String>,
}

#[derive(Serialize)]
pub struct TownView {
    pub id: u16,
    pub name: String,
    pub coins: u64,
    pub level: u32,
    pub xp_into: u32,
    pub xp_need: u32,
    pub streak: u16,
    pub streak_bonus: u64,
    pub best_streak: u16,
    pub ships: Vec<ShipView>,
    pub buildings: Vec<u8>,
    pub building_costs: Vec<u64>,
    pub crew: Vec<u8>,
    pub crew_costs: Vec<u64>,
    pub crew_room: u32,
    pub ship_room: usize,
    pub income: u64,
    pub waiting: u64,
    pub store: u64,
    pub net_worth: u64,
    pub earned: u64,
    pub wrecks: u32,
    pub raid_in: u32,
    pub help_in: u32,
    pub gift_in: u32,
    /// What helping a town would pay each side, at your level.
    pub help_coins: u64,
}

#[derive(Serialize)]
pub struct TownRow {
    pub id: u16,
    pub name: String,
    pub bot: bool,
    pub you: bool,
    pub level: u32,
    pub net_worth: u64,
    pub ships: u8,
    /// A real player who has done something in the last little while.
    pub online: bool,
    pub buildings: Vec<u8>,
}

#[derive(Serialize)]
pub struct FleetShip {
    pub town: u16,
    pub town_name: String,
    pub mine: bool,
    pub bot: bool,
    pub ship: u32,
    pub class: u8,
    pub lane: u8,
    pub sailed: u32,
    pub arrives: u32,
    pub raided: bool,
}

#[derive(Serialize)]
pub struct CatalogItem {
    pub name: &'static str,
    pub cost: u64,
    pub level: u32,
    pub income: u64,
    pub max: u8,
    pub cargo: u32,
    pub hull: u8,
}

#[derive(Serialize)]
pub struct Catalog {
    pub ships: Vec<CatalogItem>,
    pub buildings: Vec<CatalogItem>,
    pub crew: Vec<CatalogItem>,
    pub raid_cost: u64,
    pub gift_max: u64,
    pub phrases: Vec<&'static str>,
}

/// One trip the person at the wheel could make from here.
#[derive(Serialize)]
pub struct TripView {
    pub lane: u8,
    pub to: u8,
    pub good: u8,
    pub good_name: &'static str,
    pub qty: u32,
    pub cost: u64,
    pub revenue: u64,
    pub provisions: u64,
    pub sum_insured: u64,
    /// What the captain would offer for cover if left to themselves.
    pub fair_offer_bps: u16,
    /// Chance of being lost on this trip, storms included.
    pub risk_bps: u64,
    pub storm: bool,
    pub watches: u32,
}

#[derive(Serialize)]
pub struct HelmView {
    pub captain: u16,
    pub start_cash: u64,
    pub trips: Vec<TripView>,
    /// Sailing is still allowed this season.
    pub can_sail: bool,
    /// In port with the crew ready, so a trip can be planned now.
    pub ready: bool,
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
    /// The waves right now, from 0 to 100. Towns' ships have to read these.
    pub swell: u8,
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
    /// The name of the person at the wheel, if there is one.
    pub player: Option<String>,
    pub start_cash: u64,
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
    pub steered: bool,
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
        self.lane_forecast(usize::from(s.lane), s.closes, hull)
    }

    fn lane_forecast(&self, lane: usize, sails: u32, hull: u8) -> (u64, u64) {
        let base = rules::voyage_risk_bps(lane, self.lanes[lane].sea, hull).min(rules::BPS);
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

    fn ship_view(&self, t: usize, s: usize) -> ShipView {
        let ship = &self.towns[t].ships[s];
        let class = usize::from(ship.class);
        let level = self.town_level(t);
        let routes = (0..LANE_COUNT)
            .map(|lane| {
                let good = PORTS[LANES[lane].port].makes;
                let full = self.trip_full(t, s, lane);
                let risk_bps = self.trip_risk_bps(t, s, lane);
                let cover = rules::of_bps(full, rules::TRIP_COVER_BPS);
                RouteView {
                    lane: lane as u8,
                    to: LANES[lane].port as u8,
                    good_name: rules::GOODS[good].name,
                    full,
                    cost: full * rules::CARGO_COST_PCT / 100,
                    market_pct: self.market_pct(lane),
                    risk_bps,
                    storm: self.storm_near(lane, self.ship_watches(t, s, lane) + 1).is_some(),
                    watches: self.ship_watches(t, s, lane),
                    locked_until: if rules::ROUTE_LEVEL[lane] > level { rules::ROUTE_LEVEL[lane] } else { 0 },
                    protect_fee: self.best_cover(t, risk_bps, cover).map(|(_, fee)| fee),
                    cover,
                    convoy: self.convoy_of(t, lane).map(|other| self.towns[other].name.clone()),
                }
            })
            .collect();
        let trip = ship.trip.as_ref().map(|trip| {
            let lane = usize::from(trip.lane);
            TownTripView {
                lane: trip.lane,
                to: LANES[lane].port as u8,
                sailed: trip.sailed,
                arrives: trip.arrives,
                full: trip.full,
                now: rules::trip_value_now(trip.full, self.watch.saturating_sub(trip.sailed), trip.arrives - trip.sailed),
                cover: trip.cover,
                danger_bps: self.hazard_now(t, s, trip),
                swell: self.swells[lane],
                storm_in: self
                    .storms
                    .iter()
                    .filter(|st| st.covers(lane) && st.ends > self.watch && st.starts < trip.arrives)
                    .map(|st| st.starts.saturating_sub(self.watch))
                    .min(),
                surprise: trip.surprise.as_ref().map(|x| x.kind),
                surprise_answered: trip.surprise.as_ref().is_some_and(|x| x.answer.is_some()),
                convoy: self.convoy_of(t, lane).map(|other| self.towns[other].name.clone()),
                raid_from: trip.raid_by.map(|by| self.towns[usize::from(by)].name.clone()),
                insurer: trip.insurer.map(|h| self.houses[usize::from(h)].name.clone()),
            }
        });
        ShipView {
            id: ship.id,
            token: self.ledger.token_name(ship.token).to_string(),
            class: ship.class,
            name: rules::SHIP_CLASSES[class].name,
            cargo_units: self.ship_cargo(t, s),
            hull: self.ship_hull(t, s),
            levels: [ship.cargo, ship.hull, ship.sails],
            damaged: ship.damaged,
            ready_in: ship.ready_at.saturating_sub(self.watch),
            repair_cost: rules::repair_cost(class),
            upgrade_costs: [
                rules::upgrade_cost(class, ship.cargo),
                rules::upgrade_cost(class, ship.hull),
                rules::upgrade_cost(class, ship.sails),
            ],
            trip,
            routes,
        }
    }

    fn town_view(&self, t: usize) -> TownView {
        let town = &self.towns[t];
        let (level, xp_into, xp_need) = rules::level_of(town.xp);
        let income = self.town_income_rate(t);
        TownView {
            id: t as u16,
            name: town.name.clone(),
            coins: self.cash(town.acct),
            level,
            xp_into,
            xp_need,
            streak: town.streak,
            streak_bonus: rules::streak_bonus_pct(town.streak),
            best_streak: town.best_streak,
            ships: (0..town.ships.len()).map(|s| self.ship_view(t, s)).collect(),
            buildings: town.buildings.to_vec(),
            building_costs: (0..rules::BUILDING_KINDS).map(|k| rules::building_cost(k, town.buildings[k])).collect(),
            crew: town.crew.to_vec(),
            crew_costs: (0..rules::CREW_KINDS).map(|k| rules::crew_cost(k, town.crew[k])).collect(),
            crew_room: rules::crew_slots(town.buildings[rules::BUILD_TAVERN]),
            ship_room: rules::ship_slots(town.buildings[rules::BUILD_DOCK]),
            income,
            waiting: self.town_waiting(t),
            store: income * rules::INCOME_STORE_WATCHES * (100 + u64::from(town.buildings[rules::BUILD_WAREHOUSE]) * 50) / 100,
            net_worth: self.net_worth(t),
            earned: town.earned,
            wrecks: town.wrecks,
            raid_in: town.raid_ready.saturating_sub(self.watch),
            help_in: town.help_ready.saturating_sub(self.watch),
            gift_in: town.gift_ready.saturating_sub(self.watch),
            help_coins: rules::help_coins(level),
        }
    }

    fn catalog(&self) -> Catalog {
        let empty = |name, cost, level, income, max| CatalogItem { name, cost, level, income, max, cargo: 0, hull: 0 };
        Catalog {
            ships: rules::SHIP_CLASSES
                .iter()
                .map(|c| CatalogItem { name: c.name, cost: c.cost, level: c.level, income: 0, max: 0, cargo: c.cargo, hull: c.hull })
                .collect(),
            buildings: rules::BUILDINGS.iter().map(|b| empty(b.name, b.cost, b.level, b.income, b.max)).collect(),
            crew: rules::CREW.iter().map(|c| empty(c.name, c.cost, c.level, 0, c.max)).collect(),
            raid_cost: rules::RAID_COST,
            gift_max: rules::GIFT_MAX,
            phrases: rules::CHAT_PHRASES.to_vec(),
        }
    }

    /// The choices open to the person at the wheel of captain `c`.
    fn helm_view(&self, c: usize) -> Option<HelmView> {
        let captain = &self.captains[c];
        let helm = captain.helm.as_ref()?;
        let def = &CAPTAINS[c];
        let can_sail = self.watch + rules::LAST_SAILING_BEFORE_END <= self.season_length();
        let ready = matches!(captain.state, CaptainState::AtPort { ready_at, .. } if self.watch >= ready_at);
        let mut trips = Vec::new();
        if let (CaptainState::AtPort { port, .. }, true) = (&captain.state, can_sail && ready) {
            let port = usize::from(*port);
            let cash = self.cash(captain.acct);
            let lanes: Vec<usize> = if port == HUB { (0..LANE_COUNT).collect() } else { vec![lane_of_port(port)] };
            let (outbound, good) = trip_goods(port);
            for lane in lanes {
                let plan = self.trip_plan(c, port, lane, outbound, good, cash);
                let sum_insured = plan.revenue + rules::hull_value(def.capacity);
                let fair_offer_bps = rules::captain_offer_bps(&rules::OfferInputs {
                    revenue: plan.revenue,
                    cargo_cost: plan.cost,
                    provisions: plan.provisions,
                    sum_insured,
                    thrift: def.thrift,
                    cash,
                });
                let sails = self.watch + rules::SLIP_WATCHES;
                let (base, storm) = self.lane_forecast(lane, sails, captain.hull);
                trips.push(TripView {
                    lane: lane as u8,
                    to: if outbound { LANES[lane].port as u8 } else { HUB as u8 },
                    good: plan.good as u8,
                    good_name: rules::GOODS[plan.good].name,
                    qty: plan.qty,
                    cost: plan.cost,
                    revenue: plan.revenue,
                    provisions: plan.provisions,
                    sum_insured,
                    fair_offer_bps,
                    risk_bps: base + storm,
                    storm: storm > 0,
                    watches: LANES[lane].watches,
                });
            }
        }
        Some(HelmView { captain: c as u16, start_cash: helm.start_cash, trips, can_sail, ready })
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
        self.view_at(viewer, None)
    }

    /// The same picture, with who's online judged by a real clock, in seconds.
    pub fn view_at(&self, viewer: Option<&str>, now_s: Option<u32>) -> WorldView {
        let you = viewer.and_then(|v| self.house_of(v));
        let helm = viewer.and_then(|v| self.helm_of(v)).and_then(|c| self.helm_view(c));
        let mine = viewer.and_then(|v| self.town_of(v));
        let town = mine.map(|t| self.town_view(t));
        let mut towns: Vec<TownRow> = self
            .towns
            .iter()
            .enumerate()
            .map(|(t, row)| TownRow {
                id: t as u16,
                name: row.name.clone(),
                bot: row.bot,
                you: mine == Some(t),
                level: self.town_level(t),
                net_worth: self.net_worth(t),
                ships: row.ships.len() as u8,
                online: self.is_online(t, now_s),
                buildings: row.buildings.to_vec(),
            })
            .collect();
        towns.sort_by_key(|row| std::cmp::Reverse(row.net_worth));
        let fleet = self
            .towns
            .iter()
            .enumerate()
            .flat_map(|(t, row)| {
                row.ships.iter().filter_map(move |ship| {
                    ship.trip.as_ref().map(|trip| FleetShip {
                        town: t as u16,
                        town_name: row.name.clone(),
                        mine: mine == Some(t),
                        bot: row.bot,
                        ship: ship.id,
                        class: ship.class,
                        lane: trip.lane,
                        sailed: trip.sailed,
                        arrives: trip.arrives,
                        raided: trip.raided || trip.raid_by.is_some(),
                    })
                })
            })
            .collect();

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
                    swell: self.swells[i],
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
                player: c.helm.as_ref().map(|h| h.name.clone()),
                start_cash: c.helm.as_ref().map(|h| h.start_cash).unwrap_or(0),
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
                    steered: s.steered,
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
            helm,
            town,
            towns,
            fleet,
            catalog: self.catalog(),
            chat: self
                .chat
                .iter()
                .map(|line| {
                    let town = &self.towns[usize::from(line.town)];
                    ChatView {
                        id: line.id,
                        watch: line.watch,
                        town: line.town,
                        name: town.name.clone(),
                        bot: town.bot,
                        you: mine == Some(usize::from(line.town)),
                        text: line.typed.clone().unwrap_or_else(|| rules::CHAT_PHRASES[usize::from(line.phrase)].to_string()),
                        typed: line.typed.is_some(),
                        to: line.to,
                        to_name: line.to.map(|other| self.towns[usize::from(other)].name.clone()),
                        to_you: line.to.is_some() && line.to.map(usize::from) == mine,
                    }
                })
                .collect(),
        }
    }
}
