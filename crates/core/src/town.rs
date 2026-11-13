//! Your own town: ships to send out, buildings to put up, a crew to hire.
//!
//! The heart of it is one simple, tense choice. A ship's cargo is worth more the
//! further it gets, and the sea gets worse the further out it is. You can bring
//! it home at any moment and bank what it has earned, or push on for the treasure
//! chest at the island and risk losing everything.

use crate::actions::{clean_name, Receipt};
use crate::rng::Rng;
use crate::rules::{self, BPS, HUB, LANES, LANE_COUNT, PORTS};
use crate::world::*;
use borsh::{BorshDeserialize, BorshSerialize};
use nep245_ledger::{AccountIx, TokenIx};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SurpriseKind {
    Crate,
    Pirates,
    Shortcut,
}

/// Something that happens at sea and asks the player to choose, quickly.
#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub struct Surprise {
    pub kind: SurpriseKind,
    pub expires: u32,
    pub answer: Option<bool>,
}

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub struct Trip {
    pub lane: u8,
    pub sailed: u32,
    pub arrives: u32,
    /// What the whole cargo fetches if it gets there.
    pub full: u64,
    /// What the insurer pays if the ship is lost.
    pub cover: u64,
    pub insurer: Option<u16>,
    pub surprise: Option<Surprise>,
    pub raided: bool,
    pub raid_by: Option<u16>,
    /// The watch a raid under way reaches the ship. Until then it can run for home.
    pub raid_lands: u32,
    /// A risky shortcut makes the water worse until this watch.
    pub rough_until: u32,
}

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub struct OwnedShip {
    pub id: u32,
    /// Each ship is its own NEP-245 token, held by its owner.
    pub token: TokenIx,
    pub class: u8,
    pub cargo: u8,
    pub hull: u8,
    pub sails: u8,
    pub damaged: bool,
    pub ready_at: u32,
    pub trip: Option<Trip>,
}

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub struct Town {
    pub acct: AccountIx,
    pub name: String,
    pub bot: bool,
    pub xp: u32,
    pub streak: u16,
    pub best_streak: u16,
    pub ships: Vec<OwnedShip>,
    pub buildings: [u8; rules::BUILDING_KINDS],
    pub crew: [u8; rules::CREW_KINDS],
    pub collected_at: u32,
    pub earned: u64,
    pub wrecks: u32,
    pub raid_ready: u32,
    pub help_ready: u32,
    pub gift_ready: u32,
    /// The last watch this town did anything, to show who is around.
    pub last_seen: u32,
    pub said_watch: u32,
    pub said: u8,
}

/// One line of harbor talk. The words are in `rules::CHAT_PHRASES`.
#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub struct ChatLine {
    pub id: u32,
    pub watch: u32,
    pub town: u16,
    pub to: Option<u16>,
    pub phrase: u8,
    /// Words the player typed, in place of a phrase.
    pub typed: Option<String>,
}

/// Used for a town nobody has played since before this season.
const NOT_SEEN: u32 = u32::MAX;

impl World {
    pub fn town_of(&self, account: &str) -> Option<usize> {
        let acct = self.ledger.find_account(account)?;
        self.towns.iter().position(|t| t.acct == acct && !t.bot)
    }

    fn my_town(&self, who: &str) -> Result<usize, String> {
        self.town_of(who).ok_or_else(|| "open your town first".to_string())
    }

    fn ship_ix(&self, t: usize, ship: u32) -> Result<usize, String> {
        self.towns[t].ships.iter().position(|s| s.id == ship).ok_or_else(|| "you have no such ship".to_string())
    }

    pub fn town_level(&self, t: usize) -> u32 {
        rules::level_of(self.towns[t].xp).0
    }

    fn make_ship(&mut self, acct: AccountIx, class: u8) -> Result<OwnedShip, String> {
        let id = self.next_ship;
        self.next_ship += 1;
        let token = self.ledger.token(&format!("ship:{id}")).map_err(|e| e.to_string())?;
        self.ledger.mint(token, acct, 1);
        Ok(OwnedShip { id, token, class, cargo: 0, hull: 0, sails: 0, damaged: false, ready_at: 0, trip: None })
    }

    fn new_town(&mut self, acct: AccountIx, name: String, bot: bool) -> Result<usize, String> {
        let ship = self.make_ship(acct, 0)?;
        self.towns.push(Town {
            acct,
            name,
            bot,
            xp: 0,
            streak: 0,
            best_streak: 0,
            ships: vec![ship],
            buildings: [0; rules::BUILDING_KINDS],
            crew: [0; rules::CREW_KINDS],
            collected_at: self.watch,
            earned: 0,
            wrecks: 0,
            raid_ready: 0,
            help_ready: 0,
            gift_ready: 0,
            last_seen: self.watch,
            said_watch: 0,
            said: 0,
        });
        Ok(self.towns.len() - 1)
    }

    /// Rival towns run by the rules, so there is always someone to race and to raid.
    pub(crate) fn seed_rival_towns(&mut self) {
        let domain = self.cfg.domain.clone();
        for (i, name) in rules::RIVAL_TOWNS.iter().enumerate() {
            let acct = self.ledger.account(&format!("town-{i}.{domain}")).expect("room in ledger");
            self.pay_from_guild(acct, rules::TOWN_START_COINS);
            self.new_town(acct, (*name).to_string(), true).expect("room in ledger");
        }
    }

    pub(crate) fn open_town(&mut self, who: &str, name: &str) -> Result<Receipt, String> {
        let name = clean_name(name)?;
        rules::check_words(&name)?;
        if self.town_of(who).is_some() {
            return Err("you already have a town".into());
        }
        if self.towns.iter().filter(|t| !t.bot).count() >= rules::MAX_PLAYER_TOWNS {
            return Err("this harbor is full".into());
        }
        let acct = self.ledger.account(who).map_err(|e| e.to_string())?;
        self.pay_from_guild(acct, rules::TOWN_START_COINS);
        self.new_town(acct, name, false)?;
        Ok(Receipt::Founded { capital: rules::TOWN_START_COINS })
    }

    // ---- what a ship is worth, and how much danger it is in ------------------------

    pub(crate) fn ship_hull(&self, t: usize, s: usize) -> u8 {
        let ship = &self.towns[t].ships[s];
        let class = &rules::SHIP_CLASSES[usize::from(ship.class)];
        (u64::from(class.hull) + u64::from(ship.hull) * rules::HULL_PER_LEVEL).min(98) as u8
    }

    pub(crate) fn ship_cargo(&self, t: usize, s: usize) -> u64 {
        let ship = &self.towns[t].ships[s];
        let class = &rules::SHIP_CLASSES[usize::from(ship.class)];
        u64::from(class.cargo) * (100 + u64::from(ship.cargo) * rules::CARGO_PCT_PER_LEVEL) / 100
    }

    pub(crate) fn ship_watches(&self, t: usize, s: usize, lane: usize) -> u32 {
        let town = &self.towns[t];
        let quicker = u32::from(town.ships[s].sails) + u32::from(town.crew[rules::CREW_NAVIGATOR]);
        LANES[lane].watches.saturating_sub(quicker).max(rules::SHORTEST_TRIP)
    }

    /// How much a port wants what this island makes, as a percentage of the usual price.
    pub(crate) fn market_pct(&self, lane: usize) -> u64 {
        let good = PORTS[LANES[lane].port].makes;
        rules::price_multiple_pct(good, self.port_good_price(HUB, good)).clamp(60, 220)
    }

    pub(crate) fn trip_full(&self, t: usize, s: usize, lane: usize) -> u64 {
        let town = &self.towns[t];
        let pay = 100 + u64::from(town.crew[rules::CREW_DECKHAND]) * 15 + u64::from(town.crew[rules::CREW_MERCHANT]) * 20;
        self.ship_cargo(t, s) * rules::ROUTE_PAY[lane] * self.market_pct(lane) / 100 * pay / 100
    }

    fn safety_pct(&self, t: usize) -> u64 {
        let town = &self.towns[t];
        100u64.saturating_sub(u64::from(town.buildings[rules::BUILD_LIGHTHOUSE]) * 15 + u64::from(town.crew[rules::CREW_LOOKOUT]) * 10).max(40)
    }

    /// Another real player's town with a ship at sea on this route, if there is one.
    pub(crate) fn convoy_of(&self, t: usize, lane: usize) -> Option<usize> {
        if self.towns[t].bot {
            return None;
        }
        (0..self.towns.len()).find(|&other| {
            other != t
                && !self.towns[other].bot
                && self.towns[other].ships.iter().any(|s| s.trip.as_ref().is_some_and(|trip| usize::from(trip.lane) == lane))
        })
    }

    /// Everything that makes a trip on this route safer, as a percentage of normal danger.
    fn safety_on(&self, t: usize, lane: usize) -> u64 {
        let safety = self.safety_pct(t);
        if self.convoy_of(t, lane).is_some() {
            safety * rules::CONVOY_DANGER_PCT / 100
        } else {
            safety
        }
    }

    /// Whether a real player is around right now. On-chain `now_s` is the chain's
    /// clock in seconds. A practice harbor has no clock, so it counts watches instead.
    pub(crate) fn is_online(&self, t: usize, now_s: Option<u32>) -> bool {
        let seen = self.towns[t].last_seen;
        if self.towns[t].bot || seen == NOT_SEEN {
            return false;
        }
        match now_s {
            Some(now) => seen <= now && now - seen <= rules::ONLINE_SECONDS,
            None => seen <= self.watch && self.watch - seen <= rules::ONLINE_WATCHES,
        }
    }

    /// Records, in real time, when this account last did something.
    pub fn note_seen_at(&mut self, who: &str, now_s: u32) {
        if let Some(t) = self.town_of(who) {
            self.towns[t].last_seen = now_s;
        }
    }

    pub(crate) fn note_seen(&mut self, who: &str) {
        if let Some(t) = self.town_of(who) {
            self.towns[t].last_seen = self.watch;
        }
    }

    /// The real player's town that owns this insurance office, if a real player owns it.
    fn office_owner(&self, h: usize) -> Option<usize> {
        let acct = self.houses[h].acct;
        self.towns.iter().position(|town| town.acct == acct && !town.bot)
    }

    fn friend(&self, t: usize, town: u16) -> Result<usize, String> {
        let other = usize::from(town);
        if other >= self.towns.len() || other == t {
            return Err("you can't do that with that town".into());
        }
        if self.towns[other].bot {
            return Err("that town is run by the game, not by a real player".into());
        }
        Ok(other)
    }

    pub(crate) fn help_town(&mut self, who: &str, town: u16) -> Result<Receipt, String> {
        let t = self.my_town(who)?;
        let other = self.friend(t, town)?;
        if self.watch < self.towns[t].help_ready {
            return Err("you helped someone a moment ago".into());
        }
        self.towns[t].help_ready = self.watch + rules::HELP_REST_WATCHES;
        let coins = rules::help_coins(self.town_level(t).min(self.town_level(other)));
        self.earn(t, coins, rules::HELP_XP);
        self.earn(other, coins, rules::HELP_XP);
        self.log(Event::Helped { town: other as u16, by: t as u16, coins });
        Ok(Receipt::Done)
    }

    pub(crate) fn send_gift(&mut self, who: &str, town: u16, coins: u64) -> Result<Receipt, String> {
        let t = self.my_town(who)?;
        let other = self.friend(t, town)?;
        if coins == 0 || coins > rules::GIFT_MAX {
            return Err(format!("a gift can be up to {} coins", rules::GIFT_MAX));
        }
        if self.watch < self.towns[t].gift_ready {
            return Err("you sent a gift a moment ago".into());
        }
        let (from, to) = (self.towns[t].acct, self.towns[other].acct);
        self.ledger
            .transfer(self.crown, from, to, u128::from(coins))
            .map_err(|_| "you don't have enough coins".to_string())?;
        self.towns[t].gift_ready = self.watch + rules::GIFT_REST_WATCHES;
        self.log(Event::Gift { town: other as u16, by: t as u16, coins });
        Ok(Receipt::Done)
    }

    pub(crate) fn say(&mut self, who: &str, phrase: u8, to: Option<u16>) -> Result<Receipt, String> {
        let t = self.my_town(who)?;
        if usize::from(phrase) >= rules::CHAT_PHRASES.len() {
            return Err("no such phrase".into());
        }
        self.chat_turn(t, to)?;
        self.push_chat(t, phrase, to, None);
        Ok(Receipt::Done)
    }

    pub(crate) fn say_text(&mut self, who: &str, text: &str, to: Option<u16>) -> Result<Receipt, String> {
        let t = self.my_town(who)?;
        let text = rules::check_words(text)?;
        self.chat_turn(t, to)?;
        self.push_chat(t, 0, to, Some(text));
        Ok(Receipt::Done)
    }

    /// Checks who a line is for, and that this town isn't talking too fast.
    fn chat_turn(&mut self, t: usize, to: Option<u16>) -> Result<(), String> {
        if to.is_some_and(|other| usize::from(other) >= self.towns.len() || usize::from(other) == t) {
            return Err("no such town".into());
        }
        let watch = self.watch;
        let town = &mut self.towns[t];
        if town.said_watch != watch {
            town.said_watch = watch;
            town.said = 0;
        }
        if town.said >= rules::CHAT_PER_WATCH {
            return Err("give the others a moment to answer".into());
        }
        town.said += 1;
        Ok(())
    }

    fn push_chat(&mut self, t: usize, phrase: u8, to: Option<u16>, typed: Option<String>) {
        if self.chat.len() >= rules::CHAT_KEEP {
            self.chat.remove(0);
        }
        let id = self.next_chat;
        self.next_chat += 1;
        self.chat.push(ChatLine { id, watch: self.watch, town: t as u16, to, phrase, typed });
    }

    /// Rival towns chat a little, and often answer a real player who has just spoken.
    fn rival_chat(&mut self, r: &mut Rng) {
        let rivals: Vec<usize> = (0..self.towns.len()).filter(|&t| self.towns[t].bot).collect();
        if rivals.is_empty() {
            return;
        }
        let answering = self
            .chat
            .last()
            .filter(|line| !self.towns[usize::from(line.town)].bot && line.watch + 1 >= self.watch)
            .map(|line| line.town);
        let chance = if answering.is_some() { rules::RIVAL_ANSWER_PCT } else { rules::RIVAL_CHATTER_PCT };
        if r.below(100) < chance {
            let t = rivals[r.below(rivals.len() as u64) as usize];
            let phrase = rules::RIVAL_PHRASES[r.below(rules::RIVAL_PHRASES.len() as u64) as usize];
            self.push_chat(t, phrase, answering, None);
        }
    }

    /// The chance of being lost in one watch, from where the ship is now.
    pub(crate) fn hazard_now(&self, t: usize, s: usize, trip: &Trip) -> u64 {
        let lane = usize::from(trip.lane);
        let span = (trip.arrives - trip.sailed).max(1);
        let done = u64::from(self.watch.saturating_sub(trip.sailed).min(span)) * 100 / u64::from(span);
        let storm = self.storm_now(lane).map_or(0, |st| u64::from(st.strength_bps));
        let hazard = rules::trip_hazard_bps(lane, self.swells[lane], self.ship_hull(t, s), done, span, storm) * self.safety_on(t, lane) / 100;
        if self.watch < trip.rough_until {
            hazard * 3
        } else {
            hazard
        }
    }

    /// The chance of being lost on the whole trip, storms already forecast included.
    pub(crate) fn trip_risk_bps(&self, t: usize, s: usize, lane: usize) -> u64 {
        let span = self.ship_watches(t, s, lane);
        let hull = self.ship_hull(t, s);
        let mut survive = BPS;
        for w in 0..span {
            let at = self.watch + 1 + w;
            let storm = self
                .storms
                .iter()
                .find(|st| st.covers(lane) && st.starts <= at && at < st.ends)
                .map_or(0, |st| u64::from(st.strength_bps));
            let hazard = rules::trip_hazard_bps(lane, self.swells[lane], hull, u64::from(w) * 100 / u64::from(span), span, storm);
            survive = survive * (BPS - (hazard * self.safety_on(t, lane) / 100).min(BPS)) / BPS;
        }
        BPS - survive
    }

    /// The cheapest shop willing to protect this trip, and what it charges.
    pub(crate) fn best_cover(&self, t: usize, risk_bps: u64, cover: u64) -> Option<(usize, u64)> {
        let own = self.towns[t].acct;
        (0..self.houses.len())
            .filter(|&h| self.houses[h].active() && self.houses[h].acct != own)
            .filter(|&h| self.cash(self.houses[h].acct) >= cover * 2)
            .map(|h| {
                let ask = rules::house_ask_bps(self.persona(h), risk_bps, self.houses[h].fear, self.book_full_pct(h));
                (h, rules::of_bps(cover, ask.clamp(100, BPS)).max(1))
            })
            // People insure each other first, when their price is anywhere near.
            .min_by_key(|(h, fee)| if self.houses[*h].kind == HouseKind::Player { fee * rules::PLAYER_OFFICE_EDGE_PCT / 100 } else { *fee })
    }

    fn spend(&mut self, t: usize, coins: u64) -> Result<(), String> {
        let acct = self.towns[t].acct;
        self.ledger
            .transfer(self.crown, acct, self.guild, u128::from(coins))
            .map_err(|_| "you don't have enough coins".to_string())
    }

    fn earn(&mut self, t: usize, coins: u64, xp: u64) {
        let coins = if self.towns[t].bot { coins * rules::RIVAL_PAY_PCT / 100 } else { coins };
        let acct = self.towns[t].acct;
        self.pay_from_guild(acct, coins);
        let town = &mut self.towns[t];
        town.earned += coins;
        town.xp = town.xp.saturating_add(xp.min(u64::from(u32::MAX)) as u32);
    }

    // ---- sending ships out -----------------------------------------------------------

    pub(crate) fn send_ship(&mut self, who: &str, ship: u32, lane: u8, protect: bool) -> Result<Receipt, String> {
        let t = self.my_town(who)?;
        let s = self.ship_ix(t, ship)?;
        let lane = usize::from(lane);
        if lane >= LANE_COUNT {
            return Err("no such island".into());
        }
        if self.town_level(t) < rules::ROUTE_LEVEL[lane] {
            return Err("reach a higher level to sail there".into());
        }
        self.dispatch(t, s, lane, protect)?;
        Ok(Receipt::Done)
    }

    fn dispatch(&mut self, t: usize, s: usize, lane: usize, protect: bool) -> Result<(), String> {
        let ship = &self.towns[t].ships[s];
        if ship.trip.is_some() {
            return Err("that ship is already at sea".into());
        }
        if ship.damaged {
            return Err("that ship needs fixing first".into());
        }
        if self.watch < ship.ready_at {
            return Err("the crew needs a moment".into());
        }
        let span = self.ship_watches(t, s, lane);
        if self.watch + span + 1 >= self.season_length() {
            return Err("it is too close to the Harbor Festival to set out".into());
        }
        // Buy the cargo. It is what's at stake, and part-loads are always allowed.
        let whole = self.trip_full(t, s, lane);
        let want = whole * rules::CARGO_COST_PCT / 100;
        let coins = self.cash(self.towns[t].acct);
        let paid = want.min(coins);
        let load_pct = if want == 0 { 100 } else { (paid * 100 / want).max(rules::MIN_LOAD_PCT) };
        let full = whole * load_pct / 100;
        if paid > 0 {
            self.spend(t, paid)?;
        }
        let (mut cover, mut insurer) = (0, None);
        if protect {
            let wanted = rules::of_bps(full, rules::TRIP_COVER_BPS);
            let risk = self.trip_risk_bps(t, s, lane);
            let Some((h, fee)) = self.best_cover(t, risk, wanted) else {
                return Err("no shop will protect this trip right now".into());
            };
            let (from, to) = (self.towns[t].acct, self.houses[h].acct);
            self.ledger
                .transfer(self.crown, from, to, u128::from(fee))
                .map_err(|_| "you don't have enough coins".to_string())?;
            self.houses[h].stats.premiums += fee;
            self.houses[h].stats.lines += 1;
            cover = wanted;
            insurer = Some(h as u16);
            if let Some(owner) = self.office_owner(h) {
                let id = self.towns[t].ships[s].id;
                self.log(Event::TripCovered { town: t as u16, ship: id, by: owner as u16, fee });
            }
        }
        let watch = self.watch;
        self.towns[t].ships[s].trip = Some(Trip {
            lane: lane as u8,
            sailed: watch,
            arrives: watch + span,
            full,
            cover,
            insurer,
            surprise: None,
            raided: false,
            raid_by: None,
            raid_lands: 0,
            rough_until: 0,
        });
        Ok(())
    }

    /// Bank what the cargo has earned so far, and give up on the chest.
    pub(crate) fn come_home(&mut self, who: &str, ship: u32) -> Result<Receipt, String> {
        let t = self.my_town(who)?;
        let s = self.ship_ix(t, ship)?;
        self.bring_home(t, s)?;
        Ok(Receipt::Done)
    }

    fn bring_home(&mut self, t: usize, s: usize) -> Result<(), String> {
        let trip = self.towns[t].ships[s].trip.take().ok_or("that ship is not at sea")?;
        let coins = rules::trip_value_now(trip.full, self.watch.saturating_sub(trip.sailed), trip.arrives - trip.sailed);
        self.earn(t, coins, coins / rules::XP_PER_COIN_BANKED + 1);
        let watch = self.watch;
        let ship = &mut self.towns[t].ships[s];
        ship.ready_at = watch + 1;
        let id = ship.id;
        self.log(Event::TripBack { town: t as u16, ship: id, coins });
        Ok(())
    }

    pub(crate) fn answer_surprise(&mut self, who: &str, ship: u32, yes: bool) -> Result<Receipt, String> {
        let t = self.my_town(who)?;
        let s = self.ship_ix(t, ship)?;
        let surprise = self.towns[t].ships[s]
            .trip
            .as_mut()
            .and_then(|trip| trip.surprise.as_mut())
            .ok_or("nothing is happening to that ship")?;
        // It plays out at the next watch, in the world's own step.
        surprise.answer = Some(yes);
        Ok(Receipt::Done)
    }

    // ---- the town ---------------------------------------------------------------------

    pub(crate) fn town_income_rate(&self, t: usize) -> u64 {
        self.towns[t]
            .buildings
            .iter()
            .zip(rules::BUILDINGS.iter())
            .map(|(count, b)| u64::from(*count) * b.income)
            .sum()
    }

    /// Coins waiting to be collected from the town's buildings.
    pub(crate) fn town_waiting(&self, t: usize) -> u64 {
        let town = &self.towns[t];
        let rate = self.town_income_rate(t);
        let cap = rate * rules::INCOME_STORE_WATCHES * (100 + u64::from(town.buildings[rules::BUILD_WAREHOUSE]) * 50) / 100;
        (u64::from(self.watch.saturating_sub(town.collected_at)) * rate).min(cap)
    }

    pub(crate) fn collect_town(&mut self, who: &str) -> Result<Receipt, String> {
        let t = self.my_town(who)?;
        self.pay_out_town(t);
        Ok(Receipt::Done)
    }

    fn pay_out_town(&mut self, t: usize) {
        let coins = self.town_waiting(t);
        self.towns[t].collected_at = self.watch;
        if coins > 0 {
            self.earn(t, coins, coins / rules::XP_PER_COIN_BANKED);
        }
    }

    pub(crate) fn build(&mut self, who: &str, kind: u8) -> Result<Receipt, String> {
        let t = self.my_town(who)?;
        let k = usize::from(kind);
        let building = rules::BUILDINGS.get(k).ok_or("no such building")?;
        if self.town_level(t) < building.level {
            return Err("reach a higher level to build that".into());
        }
        let have = self.towns[t].buildings[k];
        if have >= building.max {
            return Err("you can't build any more of those".into());
        }
        // Income waiting is paid out first, so a new building can't back-date its own.
        self.pay_out_town(t);
        self.spend(t, rules::building_cost(k, have))?;
        self.towns[t].buildings[k] = have + 1;
        self.towns[t].xp += (rules::building_cost(k, have) / rules::XP_PER_COIN_SPENT + 1) as u32;
        if k == rules::BUILD_OFFICE {
            self.open_office(t);
        }
        Ok(Receipt::Done)
    }

    /// An insurance office works for its owner: it earns fees, and pays when ships sink.
    pub(crate) fn open_office(&mut self, t: usize) {
        if self.houses.len() >= MAX_HOUSES {
            return;
        }
        let town = &self.towns[t];
        let (acct, name) = (town.acct, format!("{} Insurance", town.name));
        self.houses.push(House {
            acct,
            name,
            kind: HouseKind::Player,
            failed_at: None,
            reputation: 50,
            fear: 0,
            founded: self.watch,
            refounded: false,
            clerk: true,
            stats: HouseStats::default(),
        });
    }

    pub(crate) fn hire(&mut self, who: &str, kind: u8) -> Result<Receipt, String> {
        let t = self.my_town(who)?;
        let k = usize::from(kind);
        let crew = rules::CREW.get(k).ok_or("no such crew")?;
        if self.town_level(t) < crew.level {
            return Err("reach a higher level to hire them".into());
        }
        let hired: u32 = self.towns[t].crew.iter().map(|n| u32::from(*n)).sum();
        if hired >= rules::crew_slots(self.towns[t].buildings[rules::BUILD_TAVERN]) {
            return Err("build a tavern to make room for more crew".into());
        }
        let have = self.towns[t].crew[k];
        if have >= crew.max {
            return Err("you already have all of those you can use".into());
        }
        self.spend(t, rules::crew_cost(k, have))?;
        self.towns[t].crew[k] = have + 1;
        self.towns[t].xp += (rules::crew_cost(k, have) / rules::XP_PER_COIN_SPENT + 1) as u32;
        Ok(Receipt::Done)
    }

    pub(crate) fn buy_ship(&mut self, who: &str, class: u8) -> Result<Receipt, String> {
        let t = self.my_town(who)?;
        let c = usize::from(class);
        let info = rules::SHIP_CLASSES.get(c).ok_or("no such ship")?;
        if self.town_level(t) < info.level {
            return Err("reach a higher level to buy that ship".into());
        }
        if self.towns[t].ships.len() >= rules::ship_slots(self.towns[t].buildings[rules::BUILD_DOCK]) {
            return Err("build another dock to make room".into());
        }
        self.spend(t, info.cost)?;
        let acct = self.towns[t].acct;
        let ship = self.make_ship(acct, class)?;
        self.towns[t].ships.push(ship);
        self.towns[t].xp += (info.cost / rules::XP_PER_COIN_SPENT + 1) as u32;
        Ok(Receipt::Done)
    }

    pub(crate) fn upgrade_ship(&mut self, who: &str, ship: u32, part: u8) -> Result<Receipt, String> {
        let t = self.my_town(who)?;
        let s = self.ship_ix(t, ship)?;
        let current = {
            let owned = &self.towns[t].ships[s];
            match part {
                0 => owned.cargo,
                1 => owned.hull,
                2 => owned.sails,
                _ => return Err("no such upgrade".into()),
            }
        };
        if current >= rules::upgrade_max(part) {
            return Err("that part is as good as it gets".into());
        }
        let cost = rules::upgrade_cost(usize::from(self.towns[t].ships[s].class), current);
        self.spend(t, cost)?;
        let owned = &mut self.towns[t].ships[s];
        match part {
            0 => owned.cargo += 1,
            1 => owned.hull += 1,
            _ => owned.sails += 1,
        }
        self.towns[t].xp += (cost / rules::XP_PER_COIN_SPENT + 1) as u32;
        Ok(Receipt::Done)
    }

    pub(crate) fn repair_ship(&mut self, who: &str, ship: u32) -> Result<Receipt, String> {
        let t = self.my_town(who)?;
        let s = self.ship_ix(t, ship)?;
        if !self.towns[t].ships[s].damaged {
            return Err("that ship is fine".into());
        }
        let cost = rules::repair_cost(usize::from(self.towns[t].ships[s].class));
        self.spend(t, cost)?;
        let watch = self.watch;
        let owned = &mut self.towns[t].ships[s];
        owned.damaged = false;
        owned.ready_at = watch;
        Ok(Receipt::Done)
    }

    /// Send pirates after a rival's ship. It plays out at the next watch.
    pub(crate) fn raid(&mut self, who: &str, town: u16, ship: u32) -> Result<Receipt, String> {
        let t = self.my_town(who)?;
        if self.towns[t].buildings[rules::BUILD_COVE] == 0 {
            return Err("build a pirate cove first".into());
        }
        if self.watch < self.towns[t].raid_ready {
            return Err("your pirates are still resting".into());
        }
        let victim = usize::from(town);
        if victim >= self.towns.len() || victim == t {
            return Err("you can't raid that town".into());
        }
        let s = self.towns[victim].ships.iter().position(|o| o.id == ship).ok_or("no such ship")?;
        {
            let trip = self.towns[victim].ships[s].trip.as_ref().ok_or("that ship is not at sea")?;
            if trip.raided || trip.raid_by.is_some() {
                return Err("that ship has already been raided".into());
            }
        }
        self.spend(t, rules::RAID_COST)?;
        self.towns[t].raid_ready = self.watch + rules::RAID_REST_WATCHES;
        let lands = self.watch + rules::RAID_WARNING_WATCHES;
        if let Some(trip) = self.towns[victim].ships[s].trip.as_mut() {
            trip.raid_by = Some(t as u16);
            trip.raid_lands = lands;
        }
        Ok(Receipt::Done)
    }

    // ---- one watch at sea ---------------------------------------------------------------

    /// Everything to do with towns, on a random stream of its own, so that the
    /// rest of the harbor plays out exactly as it would without them.
    pub(crate) fn towns_tick(&mut self) {
        let mut r = Rng::new(self.rng ^ 0x7075_5F74_6F77_6E73);
        for t in 0..self.towns.len() {
            if self.towns[t].bot {
                self.rival_moves(t, &mut r);
            }
            for s in 0..self.towns[t].ships.len() {
                self.ship_watch(t, s, &mut r);
            }
        }
        self.rival_chat(&mut r);
        // The waves change after the ships have faced them. What a player can see
        // now is exactly what the next watch will bring, so reading it really pays.
        for lane in 0..LANE_COUNT {
            self.swells[lane] = rules::next_swell(self.swells[lane], self.lanes[lane].sea, r.below(100_000));
        }
    }

    fn ship_watch(&mut self, t: usize, s: usize, r: &mut Rng) {
        let watch = self.watch;
        {
            let ship = &mut self.towns[t].ships[s];
            if ship.damaged && watch >= ship.ready_at {
                ship.damaged = false;
            }
        }
        if self.towns[t].ships[s].trip.is_none() {
            return;
        }
        self.settle_raid(t, s, r);
        if !self.settle_surprise(t, s, r) {
            return;
        }
        let Some(trip) = self.towns[t].ships[s].trip.clone() else { return };
        if watch >= trip.arrives {
            self.trip_arrives(t, s, r);
            return;
        }
        if r.chance_bps(self.hazard_now(t, s, &trip)) {
            self.trip_lost(t, s);
            return;
        }
        let far_enough = watch + 1 < trip.arrives;
        if !self.towns[t].bot && trip.surprise.is_none() && far_enough && r.chance_bps(rules::SURPRISE_BPS) {
            let kind = match r.below(3) {
                0 => SurpriseKind::Crate,
                1 => SurpriseKind::Pirates,
                _ => SurpriseKind::Shortcut,
            };
            if let Some(active) = self.towns[t].ships[s].trip.as_mut() {
                active.surprise = Some(Surprise { kind, expires: watch + rules::SURPRISE_WATCHES, answer: None });
            }
        }
    }

    fn settle_raid(&mut self, t: usize, s: usize, r: &mut Rng) {
        let Some(by) = self.towns[t].ships[s].trip.as_ref().and_then(|trip| trip.raid_by) else { return };
        if self.towns[t].ships[s].trip.as_ref().is_some_and(|trip| self.watch < trip.raid_lands) {
            return;
        }
        let attacker = usize::from(by);
        let chance = rules::raid_chance_pct(self.towns[attacker].crew.iter().map(|n| u64::from(*n)).sum(), u64::from(self.towns[t].crew[rules::CREW_LOOKOUT]));
        let won = r.below(100) < chance;
        let watch = self.watch;
        let id = self.towns[t].ships[s].id;
        let trip = self.towns[t].ships[s].trip.as_mut().expect("checked above");
        trip.raid_by = None;
        trip.raided = true;
        if !won {
            self.log(Event::RaidFailed { town: t as u16, ship: id, by });
            return;
        }
        let worth = rules::trip_value_now(trip.full, watch.saturating_sub(trip.sailed), trip.arrives - trip.sailed);
        let coins = (worth * rules::RAID_TAKES_PCT / 100).max(5);
        trip.full = trip.full.saturating_sub(coins);
        self.earn(attacker, coins, coins / rules::XP_PER_COIN_BANKED);
        self.log(Event::Raided { town: t as u16, ship: id, by, coins });
    }

    /// Returns false if the surprise ended the trip.
    fn settle_surprise(&mut self, t: usize, s: usize, r: &mut Rng) -> bool {
        let watch = self.watch;
        let Some(trip) = self.towns[t].ships[s].trip.as_ref() else { return false };
        let Some(surprise) = trip.surprise.clone() else { return true };
        if surprise.answer.is_none() && watch < surprise.expires {
            return true;
        }
        let id = self.towns[t].ships[s].id;
        let yes = surprise.answer.unwrap_or(false);
        let trip = self.towns[t].ships[s].trip.as_mut().expect("checked above");
        trip.surprise = None;
        match (surprise.kind, yes) {
            (SurpriseKind::Crate, true) => {
                trip.full += trip.full / 4;
                trip.arrives += 1;
            }
            (SurpriseKind::Pirates, true) => {
                if r.below(100) < rules::PIRATE_SINK_PCT {
                    self.log(Event::PiratesWon { town: t as u16, ship: id });
                    self.trip_lost(t, s);
                    return false;
                }
                trip.full += trip.full / 4;
                self.log(Event::PiratesBeaten { town: t as u16, ship: id });
            }
            (SurpriseKind::Pirates, false) => {
                trip.full -= trip.full * rules::PIRATE_TOLL_PCT / 100;
            }
            (SurpriseKind::Shortcut, true) => {
                trip.arrives = trip.arrives.saturating_sub(2).max(watch + 1);
                trip.rough_until = watch + 2;
            }
            _ => {}
        }
        true
    }

    fn trip_arrives(&mut self, t: usize, s: usize, r: &mut Rng) {
        let Some(trip) = self.towns[t].ships[s].trip.take() else { return };
        let chest = rules::chest_pct(r.below(100));
        let streak = self.towns[t].streak;
        let coins = trip.full * chest / 100 * (100 + rules::streak_bonus_pct(streak)) / 100;
        self.earn(t, coins, coins / rules::XP_PER_COIN_DELIVERED + 5);
        let watch = self.watch;
        let town = &mut self.towns[t];
        town.streak = streak + 1;
        town.best_streak = town.best_streak.max(town.streak);
        town.ships[s].ready_at = watch + 1;
        let id = town.ships[s].id;

        // A real delivery: the good reaches Merrow, and its price falls for everyone.
        let good = PORTS[LANES[usize::from(trip.lane)].port].makes;
        let qty = (self.ship_cargo(t, s) / rules::CARGO_UNITS_PER_STOCK) as u32;
        if qty > 0 {
            self.ledger.mint(self.cargo[good], self.guild, u128::from(qty));
            self.ports[HUB].stock[good] += qty;
        }
        self.log(Event::TripHome { town: t as u16, ship: id, coins, chest: chest as u16, streak: streak + 1 });
    }

    fn trip_lost(&mut self, t: usize, s: usize) {
        let Some(trip) = self.towns[t].ships[s].trip.take() else { return };
        let watch = self.watch;
        let mut paid = 0;
        if let Some(h) = trip.insurer {
            let h = usize::from(h);
            if self.houses[h].active() {
                let (from, to) = (self.houses[h].acct, self.towns[t].acct);
                paid = trip.cover.min(self.cash(from));
                self.ledger
                    .transfer(self.crown, from, to, u128::from(paid))
                    .expect("the payment was capped at cash");
                self.houses[h].stats.claims += paid;
                if paid < trip.cover {
                    self.fail_house(h, trip.cover, paid);
                }
                if let Some(owner) = self.office_owner(h) {
                    self.log(Event::CoverPaid { town: owner as u16, to: t as u16, coins: paid });
                }
            }
        }
        let town = &mut self.towns[t];
        town.streak = 0;
        town.wrecks += 1;
        let repair = rules::REPAIR_WATCHES / if town.buildings[rules::BUILD_SHIPYARD] > 0 { 3 } else { 1 };
        let ship = &mut town.ships[s];
        ship.damaged = true;
        ship.ready_at = watch + repair;
        let id = ship.id;
        self.log(Event::TripLost { town: t as u16, ship: id, lane: trip.lane, paid });
    }

    // ---- rival towns ---------------------------------------------------------------------

    fn rival_moves(&mut self, t: usize, r: &mut Rng) {
        let level = self.town_level(t);
        for s in 0..self.towns[t].ships.len() {
            match self.towns[t].ships[s].trip.clone() {
                None => {
                    if r.below(100) < rules::RIVAL_SAIL_PCT {
                        let reach = (0..LANE_COUNT).filter(|&l| rules::ROUTE_LEVEL[l] <= level).count() as u64;
                        let lane = r.below(reach.max(1)) as usize;
                        let _ = self.dispatch(t, s, lane, false);
                    }
                }
                Some(trip) => {
                    // A rival heads home when a storm is about to catch it.
                    let lane = usize::from(trip.lane);
                    let done = self.watch.saturating_sub(trip.sailed) * 2 >= trip.arrives - trip.sailed;
                    if done && self.storm_near(lane, 1).is_some() && self.watch < trip.arrives {
                        let _ = self.bring_home(t, s);
                    }
                }
            }
        }
        if self.watch % rules::RIVAL_SHOP_EVERY == 0 {
            self.pay_out_town(t);
            let coins = self.cash(self.towns[t].acct);
            let have = &self.towns[t].buildings;
            let next = (0..rules::INCOME_KINDS)
                .filter(|&k| rules::BUILDINGS[k].level <= level && have[k] < rules::BUILDINGS[k].max)
                .map(|k| (k, rules::building_cost(k, have[k])))
                .filter(|(_, cost)| *cost <= coins)
                .max_by_key(|(_, cost)| *cost);
            if let Some((k, cost)) = next {
                if self.spend(t, cost).is_ok() {
                    self.towns[t].buildings[k] += 1;
                    self.towns[t].xp += (cost / rules::XP_PER_COIN_SPENT + 1) as u32;
                }
            }
        }
    }

    // ---- the Harbor Festival -------------------------------------------------------------

    pub fn net_worth(&self, t: usize) -> u64 {
        let town = &self.towns[t];
        let ships: u64 = town.ships.iter().map(|s| rules::SHIP_CLASSES[usize::from(s.class)].cost).sum();
        let buildings: u64 = town
            .buildings
            .iter()
            .enumerate()
            .map(|(k, n)| (0..*n).map(|i| rules::building_cost(k, i)).sum::<u64>())
            .sum();
        self.cash(town.acct) + ships + buildings
    }

    /// Everyone comes home for the festival, and the best towns win prizes.
    pub(crate) fn close_towns_for_festival(&mut self) {
        for t in 0..self.towns.len() {
            for s in 0..self.towns[t].ships.len() {
                if self.towns[t].ships[s].trip.is_some() {
                    let _ = self.bring_home(t, s);
                }
            }
            self.pay_out_town(t);
        }
        let mut order: Vec<usize> = (0..self.towns.len()).collect();
        order.sort_by_key(|&t| std::cmp::Reverse(self.net_worth(t)));
        for (place, t) in order.into_iter().take(rules::FESTIVAL_PRIZES.len()).enumerate() {
            let (coins, season) = (rules::FESTIVAL_PRIZES[place], self.season);
            self.earn(t, coins, coins / rules::XP_PER_COIN_BANKED);
            self.log(Event::FestivalPrize { town: t as u16, place: place as u8 + 1, coins, season });
        }
    }

    /// A new season starts every clock again, but towns and their coins carry on.
    pub(crate) fn towns_next_season(&mut self, names: &[String], season_end: u32) {
        for (t, name) in names.iter().enumerate() {
            self.towns[t].acct = self.ledger.account(name).expect("room in ledger");
            let town = &mut self.towns[t];
            town.collected_at = 0;
            town.raid_ready = 0;
            town.help_ready = 0;
            town.gift_ready = 0;
            town.said_watch = 0;
            town.said = 0;
            // Only people who were around when the season ended still count as around.
            town.last_seen = if town.last_seen != NOT_SEEN && season_end.saturating_sub(town.last_seen) <= rules::ONLINE_WATCHES { 0 } else { NOT_SEEN };
            for ship in &mut town.ships {
                ship.ready_at = 0;
                ship.damaged = false;
            }
            if town.buildings[rules::BUILD_OFFICE] > 0 {
                self.open_office(t);
            }
        }
    }
}
