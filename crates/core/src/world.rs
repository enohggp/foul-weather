//! The state of the harbor. All of it is stored in one compact blob, so a step
//! of the world has a small, predictable cost on NEAR.

use crate::rules::{self, GOOD_COUNT, LANE_COUNT, PORT_COUNT};
use crate::rng::Rng;
use crate::roster::{CAPTAINS, CAPTAIN_COUNT};
use borsh::{BorshDeserialize, BorshSerialize};
use nep245_ledger::{AccountIx, Ledger, TokenIx};
use serde::{Deserialize, Serialize};

pub const CROWN: &str = "crown";
pub const MAX_HOUSES: usize = 64;
const EVENT_RING: usize = 96;
const GUILD_TREASURY: u64 = 400_000;

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct Config {
    /// Suffix for in-game accounts, such as `foulweather.testnet`.
    pub domain: String,
    /// Target length of a watch in milliseconds.
    pub watch_ms: u64,
    /// Sandbox worlds allow practice-only commands, such as summoning a storm.
    pub sandbox: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum CaptainState {
    AtPort { port: u8, ready_at: u32 },
    Seeking { slip: u32 },
    Sailing { voyage: u32 },
    Ashore { port: u8 },
    LaidUp { port: u8, since: u32 },
}

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub struct Captain {
    pub acct: AccountIx,
    pub state: CaptainState,
    /// What the town believes about the hull. The truth is drawn when needed.
    pub hull: u8,
    pub voyages: u16,
    pub losses: u16,
    pub frauds: u16,
    pub bond: Option<Bond>,
}

/// A refit loan, repaid only out of successful voyages.
#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub struct Bond {
    pub house: u16,
    pub owed: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HouseKind {
    /// One of the Room's rule-driven houses. Holds the index of its persona.
    Room(u8),
    /// An entrant lured in by high premiums.
    Entrant,
    Player,
    /// A house run by someone's own agent through the public contract methods.
    Agent,
}

#[derive(Clone, Debug, Default, BorshSerialize, BorshDeserialize)]
pub struct HouseStats {
    pub premiums: u64,
    pub claims: u64,
    pub ceded: u64,
    pub assumed: u64,
    pub recovered: u64,
    pub peak: u64,
    pub lines: u32,
    pub wrecks: u32,
}

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub struct House {
    pub acct: AccountIx,
    pub name: String,
    pub kind: HouseKind,
    pub failed_at: Option<u32>,
    pub reputation: u8,
    pub fear: u8,
    pub founded: u32,
    pub refounded: bool,
    /// A clerk runs this desk while the player fast-forwards.
    pub clerk: bool,
    pub stats: HouseStats,
}

impl House {
    pub fn active(&self) -> bool {
        self.failed_at.is_none()
    }
    pub fn is_auto(&self) -> bool {
        self.clerk || matches!(self.kind, HouseKind::Room(_) | HouseKind::Entrant)
    }
}

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub struct Quote {
    pub house: u16,
    pub rate_bps: u16,
    pub line_bps: u16,
}

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub struct Slip {
    pub id: u32,
    pub captain: u16,
    pub lane: u8,
    pub outbound: bool,
    pub good: u8,
    pub qty: u32,
    pub cargo_cost: u64,
    pub revenue: u64,
    pub provisions: u64,
    pub sum_insured: u64,
    pub offer_bps: u16,
    pub opened: u32,
    pub closes: u32,
    pub retried: bool,
    /// Set the moment a surveyor looks. Before that the hull does not exist as a number.
    pub hull: Option<u8>,
    pub surveyed_by: Vec<u16>,
    pub quotes: Vec<Quote>,
}

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub struct Voyage {
    pub id: u32,
    pub captain: u16,
    pub lane: u8,
    pub outbound: bool,
    pub good: u8,
    pub qty: u32,
    pub sum_insured: u64,
    pub cargo_cost: u64,
    pub covered_bps: u16,
    pub sailed: u32,
    pub arrives: u32,
    pub hull: u8,
    pub risk_bps: u16,
    pub scuttle_bps: u16,
    pub sea_at_sailing: u8,
}

/// One writer's promise to pay on one voyage. The promise itself is a NEP-245
/// token held by whoever is owed, so it can be moved like any other token.
#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub struct Position {
    pub id: u32,
    pub voyage: u32,
    pub lane: u8,
    pub writer: u16,
    pub token: TokenIx,
    pub sum: u64,
    pub rate_bps: u16,
    /// The position this one reinsures, if any.
    pub parent: Option<u32>,
}

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub struct Offer {
    pub id: u32,
    pub house: u16,
    pub position: u32,
    pub share_bps: u16,
    pub rate_bps: u16,
    pub expires: u32,
}

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub struct Claim {
    pub id: u32,
    pub voyage: u32,
    pub captain: u16,
    pub lane: u8,
    pub sum: u64,
    pub lost_at: u32,
    pub due: u32,
    /// Chance, in percent, that the wreck was no accident.
    pub suspicion: u8,
    pub inquired: bool,
}

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub struct Storm {
    pub id: u32,
    /// Bit mask of affected lanes.
    pub lanes: u8,
    pub strength_bps: u16,
    pub warned: u32,
    pub starts: u32,
    pub ends: u32,
    pub great: bool,
}

impl Storm {
    pub fn covers(&self, lane: usize) -> bool {
        self.lanes & (1u8 << lane) != 0
    }
}

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub struct Lane {
    pub sea: u8,
    /// The sea's own drifting mood, used when no live report is available.
    pub drift: u8,
    /// Latest live reading, if one has been posted.
    pub report: Option<u8>,
    pub reported_at: u32,
}

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub struct Port {
    pub stock: [u32; GOOD_COUNT],
}

/// Events shown to players and kept briefly in state so every client can animate them.
#[derive(Clone, Debug, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Event {
    SlipOpened { slip: u32, captain: u16 },
    Bound { voyage: u32, captain: u16, covered_bps: u16, avg_rate_bps: u16 },
    SailedBare { voyage: u32, captain: u16 },
    Withdrew { captain: u16 },
    Home { voyage: u32, captain: u16, profit: i64, port: u8 },
    Wrecked { voyage: u32, captain: u16, lane: u8, sum: u64, storm: bool },
    ClaimDue { claim: u32, captain: u16, sum: u64, suspicion: u8 },
    ClaimPaid { claim: u32, captain: u16, sum: u64, paid: u64 },
    HouseFailed { house: u16, owed: u64, paid: u64, victims: u16 },
    Founded { house: u16 },
    LaidUp { captain: u16 },
    Refitted { captain: u16, house: u16 },
    Glass { storm: u32, lanes: u8, great: bool, starts: u32 },
    StormHit { storm: u32, lanes: u8, great: bool },
    Ceded { from: u16, to: u16, position: u32, sum: u64, rate_bps: u16 },
    Fraud { claim: u32, captain: u16, house: u16, reward: u64 },
    HonestLoss { claim: u32, captain: u16, house: u16 },
    SeasonEnd { season: u32 },
}

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub struct Logged {
    pub seq: u64,
    pub watch: u32,
    pub event: Event,
}

#[derive(Clone, Debug, Default, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct DayStat {
    pub day: u32,
    pub rate_bps: u16,
    pub price_index: u16,
    pub room_capital: u64,
    pub at_sea: u8,
    pub laid_up: u8,
    pub houses: u8,
    pub premiums: u64,
    pub claims: u64,
}

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct HallEntry {
    pub season: u32,
    pub house: String,
    pub capital: u64,
    pub kind: HouseKind,
}

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub struct World {
    pub cfg: Config,
    pub season: u32,
    pub watch: u32,
    pub rng: u64,
    pub next_id: u32,
    pub seq: u64,
    /// Watches left between seasons, when one has ended.
    pub intermission: Option<u32>,
    pub ports: [Port; PORT_COUNT],
    pub lanes: [Lane; LANE_COUNT],
    pub captains: Vec<Captain>,
    pub houses: Vec<House>,
    pub slips: Vec<Slip>,
    pub voyages: Vec<Voyage>,
    pub positions: Vec<Position>,
    pub offers: Vec<Offer>,
    pub claims: Vec<Claim>,
    pub storms: Vec<Storm>,
    pub great_at: Vec<u32>,
    pub entrants: u8,
    /// Premium and sum insured bound today, for the market rate.
    pub day_premium: u64,
    pub day_sum: u64,
    pub day_claims: u64,
    pub last_rate_bps: u16,
    pub history: Vec<DayStat>,
    pub hall: Vec<HallEntry>,
    pub events: Vec<Logged>,
    pub ledger: Ledger,
    pub guild: AccountIx,
    pub crown: TokenIx,
    pub cargo: [TokenIx; GOOD_COUNT],
}

impl World {
    pub fn new(cfg: Config, seed: u64) -> World {
        let mut ledger = Ledger::new();
        let guild = ledger.account(&format!("guild.{}", cfg.domain)).expect("room in ledger");
        let crown = ledger.token(CROWN).expect("room in ledger");
        let mut cargo = [0; GOOD_COUNT];
        for (i, good) in rules::GOODS.iter().enumerate() {
            cargo[i] = ledger.token(&format!("cargo:{}", good.name)).expect("room in ledger");
        }
        ledger.mint(crown, guild, u128::from(GUILD_TREASURY));

        let mut world = World {
            cfg,
            season: 1,
            watch: 0,
            rng: seed,
            next_id: 1,
            seq: 0,
            intermission: None,
            ports: core::array::from_fn(|_| Port { stock: [0; GOOD_COUNT] }),
            lanes: core::array::from_fn(|_| Lane { sea: 30, drift: 30, report: None, reported_at: 0 }),
            captains: Vec::with_capacity(CAPTAIN_COUNT),
            houses: Vec::new(),
            slips: Vec::new(),
            voyages: Vec::new(),
            positions: Vec::new(),
            offers: Vec::new(),
            claims: Vec::new(),
            storms: Vec::new(),
            great_at: Vec::new(),
            entrants: 0,
            day_premium: 0,
            day_sum: 0,
            day_claims: 0,
            last_rate_bps: 600,
            history: Vec::new(),
            hall: Vec::new(),
            events: Vec::new(),
            ledger,
            guild,
            crown,
            cargo,
        };
        world.seed_season();
        world
    }

    /// Fills the harbor for a new season: stock, captains, Room houses and storms.
    pub(crate) fn seed_season(&mut self) {
        let mut r = Rng::new(self.rng ^ 0x5EA5_0000 ^ u64::from(self.season));

        for port in 0..PORT_COUNT {
            for good in 0..GOOD_COUNT {
                let (target, flow) = rules::port_stock_rule(port, good);
                if target == 0 {
                    continue;
                }
                // Makers start with plenty and buyers start short, so trade pays from day one.
                let level = if flow > 0 { target * 13 / 10 } else { target * 3 / 4 };
                let spread = target / 4;
                let stock = level - spread / 2 + r.below(u64::from(spread)) as u32;
                self.ports[port].stock[good] = stock;
                self.ledger.mint(self.cargo[good], self.guild, u128::from(stock));
            }
        }

        let domain = self.cfg.domain.clone();
        for (i, def) in CAPTAINS.iter().enumerate() {
            let acct = self
                .ledger
                .account(&format!("{}.{}", def.slug, domain))
                .expect("room in ledger");
            self.pay_from_guild(acct, def.cash);
            let port = if i % 2 == 0 { rules::HUB } else { rules::LANES[def.home_lane].port };
            self.captains.push(Captain {
                acct,
                state: CaptainState::AtPort { port: port as u8, ready_at: r.below(5) as u32 },
                hull: def.hull,
                voyages: 0,
                losses: 0,
                frauds: 0,
                bond: None,
            });
        }

        for (i, persona) in rules::HOUSE_PERSONAS.iter().enumerate() {
            let slug: String = persona
                .name
                .chars()
                .filter(|c| c.is_ascii_alphabetic() || *c == ' ')
                .collect::<String>()
                .to_ascii_lowercase()
                .split_whitespace()
                .collect::<Vec<_>>()
                .join("-");
            let acct = self.ledger.account(&format!("{slug}.{domain}")).expect("room in ledger");
            self.pay_from_guild(acct, persona.capital);
            self.houses.push(House {
                acct,
                name: persona.name.to_string(),
                kind: HouseKind::Room(i as u8),
                failed_at: None,
                reputation: 62 + r.below(24) as u8,
                fear: 0,
                founded: 0,
                refounded: false,
                clerk: false,
                stats: HouseStats { peak: persona.capital, ..HouseStats::default() },
            });
        }

        self.great_at = rules::GREAT_WINDOWS.iter().map(|(a, b)| r.range(u64::from(*a), u64::from(*b)) as u32).collect();
    }

    pub(crate) fn pay_from_guild(&mut self, to: AccountIx, amount: u64) {
        let available = self.ledger.balance(self.crown, self.guild);
        let amount = u128::from(amount).min(available);
        self.ledger
            .transfer(self.crown, self.guild, to, amount)
            .expect("guild balance was checked");
    }

    pub fn cash(&self, acct: AccountIx) -> u64 {
        self.ledger.balance(self.crown, acct) as u64
    }

    pub fn next_id(&mut self) -> u32 {
        let id = self.next_id;
        self.next_id += 1;
        id
    }

    pub(crate) fn log(&mut self, event: Event) {
        self.seq += 1;
        let entry = Logged { seq: self.seq, watch: self.watch, event };
        if self.events.len() >= EVENT_RING {
            self.events.remove(0);
        }
        self.events.push(entry);
    }

    pub fn house_of(&self, account: &str) -> Option<usize> {
        let acct = self.ledger.find_account(account)?;
        self.houses.iter().position(|h| h.acct == acct)
    }

    pub fn season_length(&self) -> u32 {
        rules::WATCHES_PER_SEASON
    }

    /// A house's stake in a lane after what it has passed on to reinsurers.
    pub fn net_on_lane(&self, house: usize, lane: usize) -> u64 {
        let mut total: i64 = 0;
        for p in &self.positions {
            if usize::from(p.lane) != lane {
                continue;
            }
            if usize::from(p.writer) == house {
                total += p.sum as i64;
                total -= self.ceded_from(p.id) as i64;
            }
        }
        total.max(0) as u64
    }

    /// Everything a house has at risk, net of reinsurance.
    pub fn net_book(&self, house: usize) -> u64 {
        (0..LANE_COUNT).map(|lane| self.net_on_lane(house, lane)).sum()
    }

    pub(crate) fn ceded_from(&self, position: u32) -> u64 {
        self.positions
            .iter()
            .filter(|p| p.parent == Some(position))
            .map(|p| p.sum)
            .sum()
    }

    /// How full a house's book is, as a percentage of what it may hold.
    pub fn book_full_pct(&self, house: usize) -> u64 {
        let capital = self.cash(self.houses[house].acct).max(1);
        self.net_book(house) * 100 / (capital * rules::MAX_GEARING)
    }

    /// The storm, if any, threatening a lane within `within` watches.
    pub fn storm_near(&self, lane: usize, within: u32) -> Option<&Storm> {
        self.storms
            .iter()
            .find(|s| s.covers(lane) && s.starts <= self.watch + within && s.ends >= self.watch)
    }

    pub fn storm_now(&self, lane: usize) -> Option<&Storm> {
        self.storms
            .iter()
            .find(|s| s.covers(lane) && s.starts <= self.watch && self.watch < s.ends)
    }
}
