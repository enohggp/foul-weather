//! THE RULEBOOK.
//!
//! Every price, risk and decision in Foul Weather comes from this one file.
//! The contract on NEAR and the game in your browser both compile it, so what
//! you read here is exactly what runs. Change a number, and the harbor changes.
//!
//! Money is in whole crowns. Rates are in basis points (100 bps = 1%).

pub const BPS: u64 = 10_000;

/// `x` multiplied by a rate in basis points.
pub fn of_bps(x: u64, bps: u64) -> u64 {
    (u128::from(x) * u128::from(bps) / u128::from(BPS)) as u64
}

/// The largest whole-number square root of `x`, used to ease extreme ratios.
pub fn isqrt(x: u64) -> u64 {
    if x < 2 {
        return x;
    }
    let (mut low, mut high) = (1u64, x.min(u64::from(u32::MAX)));
    while low < high {
        let mid = low + (high - low + 1) / 2;
        if mid * mid <= x {
            low = mid;
        } else {
            high = mid - 1;
        }
    }
    low
}

// ---- The calendar ----------------------------------------------------------

/// One step of the world is a ship's watch of four hours.
pub const WATCHES_PER_DAY: u32 = 6;
pub const DAYS_PER_WEEK: u32 = 7;
pub const WEEKS_PER_SEASON: u32 = 4;
pub const WATCHES_PER_WEEK: u32 = WATCHES_PER_DAY * DAYS_PER_WEEK;
pub const WATCHES_PER_SEASON: u32 = WATCHES_PER_WEEK * WEEKS_PER_SEASON;

/// No new voyages this close to the end: two rounds of bidding plus the longest
/// crossing, so every ship is home and every claim settled when the books close.
pub const LAST_SAILING_BEFORE_END: u32 = 18;
/// Watches between one season's end and the next season's start in a live world.
pub const WATCHES_BETWEEN_SEASONS: u32 = 18;

// ---- The map ----------------------------------------------------------------

pub const GOOD_COUNT: usize = 6;
pub const PORT_COUNT: usize = 6;
pub const LANE_COUNT: usize = 5;
pub const HUB: usize = 0;

pub struct Good {
    pub name: &'static str,
    pub base_price: u64,
}

pub const GOODS: [Good; GOOD_COUNT] = [
    Good { name: "grain", base_price: 12 },
    Good { name: "timber", base_price: 16 },
    Good { name: "iron", base_price: 24 },
    Good { name: "spice", base_price: 40 },
    Good { name: "silk", base_price: 54 },
    Good { name: "wares", base_price: 26 },
];

/// Merrow's workshops make wares; every other port takes them in trade.
pub const WARES: usize = 5;

pub struct Port {
    pub name: &'static str,
    /// The good this port produces.
    pub makes: usize,
}

pub const PORTS: [Port; PORT_COUNT] = [
    Port { name: "Merrow", makes: WARES },
    Port { name: "Saltmarch", makes: 0 },
    Port { name: "Greywater", makes: 1 },
    Port { name: "Cinder Isles", makes: 2 },
    Port { name: "Lantern Keys", makes: 3 },
    Port { name: "Old Aurum", makes: 4 },
];

pub struct Lane {
    pub name: &'static str,
    /// The overseas end of the lane. The other end is always Merrow.
    pub port: usize,
    /// Base chance of losing a sound ship on a calm crossing.
    pub danger_bps: u64,
    /// Length of a crossing in watches.
    pub watches: u32,
}

pub const LANES: [Lane; LANE_COUNT] = [
    Lane { name: "The Salt Road", port: 1, danger_bps: 170, watches: 5 },
    Lane { name: "Greywater Run", port: 2, danger_bps: 230, watches: 6 },
    Lane { name: "Cinder Passage", port: 3, danger_bps: 300, watches: 7 },
    Lane { name: "Lantern Deeps", port: 4, danger_bps: 380, watches: 8 },
    Lane { name: "The Aurum Cape", port: 5, danger_bps: 470, watches: 9 },
];

// ---- Port prices ------------------------------------------------------------

/// How much of a good a port wants on hand, and how it changes each watch.
/// Returns `(target, flow)`. A positive flow is production; negative is consumption.
/// A target of zero means the port does not trade that good.
pub fn port_stock_rule(port: usize, good: usize) -> (u32, i32) {
    if port == HUB {
        if good == WARES {
            (360, 25)
        } else {
            (180, -5)
        }
    } else if PORTS[port].makes == good {
        (240, 5)
    } else if good == WARES {
        (180, -5)
    } else {
        (0, 0)
    }
}

/// A port pays more when it is short and less when it is flooded:
/// `base Ã— target / stock`, held between 0.4Ã— and 3.5Ã— the usual price.
pub fn port_price(good: usize, stock: u64, target: u64) -> u64 {
    let base = GOODS[good].base_price;
    let price = base * target / stock.max(1);
    price.clamp(base * 2 / 5, base * 7 / 2).max(1)
}

/// The value of trading `qty` units, priced at the stock level halfway through
/// the trade so that large cargoes move the price against themselves.
pub fn trade_value(good: usize, stock_before: u64, stock_after: u64, target: u64, qty: u64) -> u64 {
    qty * port_price(good, (stock_before + stock_after) / 2, target)
}

// ---- The risk at sea --------------------------------------------------------

/// A worn ship multiplies risk: 70% at hull 100, 90% at 70, 150% at 40, 212% at 20.
pub fn hull_factor_pct(hull: u8) -> u64 {
    let wear = u64::from(100 - hull.min(100));
    70 + wear * wear / 45
}

/// Rough water multiplies risk: 60% at sea state 0, 130% at 35, 260% at 100.
pub fn sea_factor_pct(sea: u8) -> u64 {
    60 + u64::from(sea.min(100)) * 2
}

/// Chance of losing a ship on this crossing with no storm about.
pub fn voyage_risk_bps(lane: usize, sea: u8, hull: u8) -> u64 {
    LANES[lane].danger_bps * sea_factor_pct(sea) / 100 * hull_factor_pct(hull) / 100
}

/// Chance per watch of losing a ship caught in a storm. A worn hull suffers more.
pub fn storm_hazard_bps(strength_bps: u64, hull: u8) -> u64 {
    strength_bps * hull_factor_pct(hull) / 100
}

/// How far a hull can differ from what the town believes until someone looks.
pub const HULL_SPREAD: u8 = 18;

/// The hull is not stored as a secret, because nothing on a public chain is one.
/// It is drawn from fresh randomness the moment someone needs to know it.
pub fn hull_from_roll(believed: u8, roll_0_to_100: u64) -> u8 {
    let spread = u64::from(HULL_SPREAD);
    let low = u64::from(believed).saturating_sub(spread).max(8);
    let high = (u64::from(believed) + spread).min(100);
    (low + (high - low) * roll_0_to_100 / 100) as u8
}

/// Wear taken from one crossing. Rough water is harder on a ship.
pub fn hull_wear(sea: u8, roll_0_to_3: u64) -> u8 {
    (3 + u64::from(sea) / 20 + roll_0_to_3) as u8
}

/// Temptation to scuttle: a broke captain with an over-insured wreck.
/// Returns an added chance of "losing" the ship, in basis points.
pub fn scuttle_risk_bps(cash: u64, insured: u64, hull: u8, shady: u8) -> u64 {
    if insured == 0 || cash * 4 > insured {
        return 0;
    }
    let desperation = (insured - cash * 4).min(insured) * 100 / insured;
    let wreck = u64::from(100 - hull.min(100));
    desperation * (wreck + 20) * u64::from(shady) / 500
}

// ---- Captains -----------------------------------------------------------------

/// Wages and provisions for each watch at sea.
pub const WAGES_PER_WATCH: u64 = 18;
/// What a captain needs in hand to keep working.
pub const WORKING_CASH: u64 = 160;
pub const REPAIR_COST_PER_POINT: u64 = 6;
pub const NEW_SHIP_COST: u64 = 1_200;
/// Watches a slip stays open in the Room before the captain decides.
pub const SLIP_WATCHES: u32 = 4;
/// Watches a captain waits before trying again after sitting out.
pub const REST_WATCHES: u32 = 2;

/// Share of a voyage's expected profit a free-spending captain gives up for cover.
pub const GIVES_UP_BASE_PCT: u64 = 30;

/// Share of expected profit this captain will spend on cover.
pub fn gives_up_pct(thrift: u8) -> u64 {
    GIVES_UP_BASE_PCT - u64::from(thrift) / 4
}

pub fn hull_value(capacity: u32) -> u64 {
    700 + u64::from(capacity) * 6
}

pub struct OfferInputs {
    pub revenue: u64,
    pub cargo_cost: u64,
    pub provisions: u64,
    pub sum_insured: u64,
    /// 0 = free with money, 100 = counts every coin.
    pub thrift: u8,
    pub cash: u64,
}

/// The most a captain will pay for cover, as a rate on the sum insured.
///
/// Captains do not price the sea. They price their own profit: a captain gives
/// up part of what the voyage should earn, and no more. That is why a desperate
/// captain with a thin margin will offer too little for a dangerous crossing,
/// and why spotting that is the underwriter's whole job.
pub fn captain_offer_bps(i: &OfferInputs) -> u16 {
    let profit = i.revenue.saturating_sub(i.cargo_cost + i.provisions);
    let offer = (profit * gives_up_pct(i.thrift) / 100) * BPS / i.sum_insured.max(1);
    offer.clamp(140, 1_800) as u16
}

/// Least cover a captain will accept before sailing, in basis points.
/// A bold captain goes with a tenth of the ship covered; a timid one wants most of it.
pub fn min_cover_bps(nerve: u8) -> u16 {
    (7_000 - u64::from(nerve.min(100)) * 60) as u16
}

/// A second attempt offers a fifth more.
pub fn raised_offer_bps(offer: u16) -> u16 {
    (u64::from(offer) * 120 / 100).min(2_400) as u16
}

// ---- Houses (the underwriters) --------------------------------------------------

pub const PLAYER_START_CAPITAL: u64 = 4_000;
/// A house may be struck off and found again once, with half the money.
pub const REFOUND_CAPITAL: u64 = 2_000;
/// A house may not hold net risk beyond this many times its capital.
pub const MAX_GEARING: u64 = 5;
pub const SURVEY_FEE: u64 = 14;
pub const INQUIRY_FEE: u64 = 60;
/// Watches between a loss and the day the claim falls due.
pub const RECKONING_WATCHES: u32 = 3;
/// Watches a reinsurance offer stays open.
pub const OFFER_WATCHES: u32 = 3;
/// Part of a claim's value a house receives when it proves fraud.
pub const FRAUD_REWARD_PCT: u64 = 40;

pub struct HousePersona {
    pub name: &'static str,
    /// Profit asked for above its estimate of the risk, in percent.
    pub margin: u64,
    /// How far off its estimates may be, in percent either way.
    pub error: u64,
    /// Largest line it will take on one ship, in basis points.
    pub line_bps: u16,
    /// Risk it keeps on any one lane before passing the rest on, as % of capital.
    pub retention_pct: u64,
    /// Watches before it reacts to a falling glass.
    pub slow_watches: u32,
    pub capital: u64,
}

pub const HOUSE_PERSONAS: [HousePersona; 6] = [
    HousePersona { name: "Widow Marchetti & Daughters", margin: 34, error: 14, line_bps: 2_500, retention_pct: 20, slow_watches: 1, capital: 6_000 },
    HousePersona { name: "Brisk & Sons", margin: 16, error: 30, line_bps: 3_000, retention_pct: 24, slow_watches: 5, capital: 4_200 },
    HousePersona { name: "The Salt Mutual", margin: 26, error: 20, line_bps: 2_500, retention_pct: 18, slow_watches: 3, capital: 5_500 },
    HousePersona { name: "Harrow & Vane", margin: 20, error: 26, line_bps: 3_000, retention_pct: 9, slow_watches: 4, capital: 4_500 },
    HousePersona { name: "Okonkwo Re", margin: 24, error: 18, line_bps: 2_000, retention_pct: 30, slow_watches: 2, capital: 7_000 },
    HousePersona { name: "The Lantern Syndicate", margin: 14, error: 34, line_bps: 3_500, retention_pct: 12, slow_watches: 6, capital: 3_600 },
];

pub const ENTRANT_NAMES: [&str; 6] = [
    "Fairweather & Co",
    "The Aurelian Trust",
    "Pike Street Assurance",
    "Quayside Mutual",
    "Ostrander & Lowe",
    "The New Merchants' Room",
];

/// New money comes in when premiums are high. It is lent by the Guild.
pub const ENTRANT_CAPITAL: u64 = 7_000;
pub const MAX_ROOM_HOUSES: usize = 10;

/// The clerk who runs a player's desk during fast-forward.
pub const CLERK: HousePersona = HousePersona {
    name: "Your clerk",
    margin: 28,
    error: 18,
    line_bps: 2_500,
    retention_pct: 26,
    slow_watches: 2,
    capital: 0,
};

/// The rate a house would ask, given its estimate of the risk.
/// Fear after recent losses and a full book both raise the price.
pub fn house_ask_bps(p: &HousePersona, estimate_bps: u64, fear: u8, book_full_pct: u64) -> u64 {
    let load = p.margin + u64::from(fear) / 2 + book_full_pct / 3;
    estimate_bps * (100 + load) / 100
}

/// Houses shade towards the captain's offer, then stop at their asking price.
pub fn house_quote_bps(ask_bps: u64, offer_bps: u64) -> Option<u16> {
    if ask_bps > offer_bps {
        return None;
    }
    Some(((ask_bps + (offer_bps - ask_bps) / 2).max(100)) as u16)
}

/// Reinsurers want the price of the risk they can see, plus their margin.
pub fn reinsurer_ask_bps(p: &HousePersona, estimate_bps: u64, fear: u8, book_full_pct: u64) -> u64 {
    house_ask_bps(p, estimate_bps, fear, book_full_pct) * 105 / 100
}

/// Fear added by a claim, scaled by how much of the house's capital it took.
pub fn fear_from_claim(claim: u64, capital: u64) -> u8 {
    (claim * 60 / capital.max(1)).min(60) as u8
}

/// Fear fades by this much every day.
pub const FEAR_DECAY_PER_DAY: u8 = 4;

/// Captains prefer houses that pay. A spotless name is worth 10% on the rate;
/// a poor one costs up to 10%.
pub fn effective_rate(rate_bps: u16, reputation: u8) -> u64 {
    let rep = i64::from(reputation.min(100));
    let adjust = 100 + (50 - rep) / 5;
    u64::from(rate_bps) * adjust as u64 / 100
}

// ---- The weather -----------------------------------------------------------------

pub const SEA_CALM_MEAN: i64 = 30;
/// Readings older than this many watches are ignored, and the sea drifts by itself.
pub const SEA_REPORT_FRESH_WATCHES: u32 = 40;

pub const SQUALL_CHANCE_BPS: u64 = 450;
pub const SQUALL_STRENGTH_BPS: (u64, u64) = (500, 900);
pub const SQUALL_WARNING: (u32, u32) = (4, 6);
pub const SQUALL_LENGTH: (u32, u32) = (2, 3);

pub const GREAT_STRENGTH_BPS: (u64, u64) = (2_000, 3_000);
pub const GREAT_WARNING: (u32, u32) = (6, 9);
pub const GREAT_LENGTH: u32 = 4;
pub const GREAT_LANES: (u64, u64) = (3, 5);
/// Great storms fall in these windows of the season.
pub const GREAT_WINDOWS: [(u32, u32); 2] = [(52, 84), (120, 146)];

// ---- Refits (bottomry) -------------------------------------------------------------

pub const REFIT_COST: u64 = 1_500;
/// A captain repays the investor this share of each sale...
pub const BOND_SHARE_PCT: u64 = 25;
/// ...until the investor has this share of the stake back.
pub const BOND_RETURN_PCT: u64 = 135;
/// The Room quietly refits a captain left idle this long.
pub const ROOM_REFITS_AFTER: u32 = 24;

// ---- The reasons shown to players ---------------------------------------------------

/// Why a port's price stands where it does: `stock` against `target`.
pub fn price_multiple_pct(good: usize, price: u64) -> u64 {
    price * 100 / GOODS[good].base_price
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scarcity_raises_a_price_and_glut_lowers_it() {
        assert!(port_price(4, 60, 180) > port_price(4, 180, 180));
        assert!(port_price(4, 400, 180) < port_price(4, 180, 180));
    }

    #[test]
    fn prices_stay_between_their_limits() {
        assert_eq!(port_price(0, 1, 180), 42);
        assert_eq!(port_price(0, 100_000, 180), 4);
    }

    #[test]
    fn a_large_cargo_earns_less_per_unit_than_a_small_one() {
        let small = trade_value(4, 100, 110, 180, 10) / 10;
        let large = trade_value(4, 100, 200, 180, 100) / 100;
        assert!(large < small);
    }

    #[test]
    fn rough_water_and_worn_hulls_raise_risk() {
        assert!(voyage_risk_bps(2, 80, 80) > voyage_risk_bps(2, 20, 80));
        assert!(voyage_risk_bps(2, 40, 30) > voyage_risk_bps(2, 40, 90));
    }

    #[test]
    fn hull_rolls_stay_near_belief_and_in_range() {
        for belief in [5u8, 50, 95] {
            for roll in [0u64, 50, 100] {
                let hull = hull_from_roll(belief, roll);
                assert!(hull <= 100 && hull >= 5);
                assert!(i32::from(hull).abs_diff(i32::from(belief)) <= u32::from(HULL_SPREAD) + 3);
            }
        }
    }

    #[test]
    fn only_broke_captains_with_overinsured_ships_are_tempted() {
        assert_eq!(scuttle_risk_bps(2_000, 3_000, 40, 80), 0);
        assert!(scuttle_risk_bps(100, 3_000, 40, 80) > 0);
        assert!(scuttle_risk_bps(100, 3_000, 40, 80) > scuttle_risk_bps(100, 3_000, 40, 20));
    }

    #[test]
    fn a_thin_margin_means_a_thin_offer() {
        let offer = |revenue| {
            captain_offer_bps(&OfferInputs {
                revenue,
                cargo_cost: 1_000,
                provisions: 100,
                sum_insured: 2_500,
                thrift: 50,
                cash: 500,
            })
        };
        assert!(offer(1_800) > offer(1_300));
        assert_eq!(offer(1_000), 140, "the floor applies when a voyage earns nothing");
    }

    #[test]
    fn fear_and_a_full_book_raise_the_asking_price() {
        let p = &HOUSE_PERSONAS[2];
        assert!(house_ask_bps(p, 500, 40, 0) > house_ask_bps(p, 500, 0, 0));
        assert!(house_ask_bps(p, 500, 0, 90) > house_ask_bps(p, 500, 0, 0));
    }

    #[test]
    fn houses_will_not_quote_below_their_ask() {
        assert_eq!(house_quote_bps(700, 600), None);
        assert_eq!(house_quote_bps(500, 700), Some(600));
    }

    #[test]
    fn good_names_win_ties() {
        assert!(effective_rate(600, 90) < effective_rate(600, 30));
    }

    #[test]
    fn isqrt_is_exact_on_squares_and_floors_otherwise() {
        assert_eq!(isqrt(0), 0);
        assert_eq!(isqrt(81), 9);
        assert_eq!(isqrt(82), 9);
    }
}
