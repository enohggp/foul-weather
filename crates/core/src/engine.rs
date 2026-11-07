//! One watch of the world: weather, ports, ships, claims, the Room, then captains.

use crate::clearing::{clear, Debt};
use crate::rng::Rng;
use crate::roster::CAPTAINS;
use crate::rules::{self, HousePersona, BPS, GOOD_COUNT, HUB, LANES, LANE_COUNT, PORTS, PORT_COUNT, WARES};
use crate::world::*;
use std::collections::BTreeMap;

const MAX_POSITIONS_PER_VOYAGE: usize = 9;

/// A voyage a captain is considering.
struct Plan {
    lane: usize,
    outbound: bool,
    good: usize,
    qty: u32,
    cost: u64,
    revenue: u64,
    provisions: u64,
    score: i64,
}

pub fn lane_of_port(port: usize) -> usize {
    LANES.iter().position(|l| l.port == port).unwrap_or(0)
}

impl World {
    /// Advances the world by one watch using fresh entropy from the host.
    pub fn step(&mut self, entropy: &[u8; 32]) {
        let mut r = Rng::from_entropy(self.rng, entropy);
        self.rng = r.next();

        if let Some(left) = self.intermission {
            if left <= 1 {
                self.start_next_season();
            } else {
                self.intermission = Some(left - 1);
            }
            return;
        }

        self.watch += 1;
        self.weather(&mut r);
        self.ports_tick();
        self.sea_tick(&mut r);
        self.claims_tick();
        self.room_tick(&mut r);
        self.slips_tick(&mut r);
        self.captains_tick(&mut r);
        if self.watch % rules::WATCHES_PER_DAY == 0 {
            self.close_day();
        }
        if self.watch >= self.season_length() {
            self.end_season();
        }
    }

    // ---- weather -------------------------------------------------------------

    fn weather(&mut self, r: &mut Rng) {
        let watch = self.watch;
        self.storms.retain(|s| s.ends > watch);

        // Great storms are planned at the start of a season, and the glass falls first.
        let mut i = 0;
        while i < self.great_at.len() {
            let at = self.great_at[i];
            let (low, high) = rules::GREAT_WARNING;
            let warning = low + at % (high - low + 1);
            if at <= watch + warning {
                self.great_at.remove(i);
                let starts = at.max(watch + 1);
                let count = r.range(rules::GREAT_LANES.0, rules::GREAT_LANES.1);
                let lanes = pick_lanes(r, count);
                let (a, b) = rules::GREAT_STRENGTH_BPS;
                self.add_storm(lanes, r.range(a, b) as u16, starts, rules::GREAT_LENGTH, true);
            } else {
                i += 1;
            }
        }

        if r.chance_bps(rules::SQUALL_CHANCE_BPS) {
            let lane = r.below(LANE_COUNT as u64) as usize;
            if self.storm_near(lane, 8).is_none() {
                let (a, b) = rules::SQUALL_STRENGTH_BPS;
                let strength = r.range(a, b) as u16;
                let warning = r.range(u64::from(rules::SQUALL_WARNING.0), u64::from(rules::SQUALL_WARNING.1)) as u32;
                let length = r.range(u64::from(rules::SQUALL_LENGTH.0), u64::from(rules::SQUALL_LENGTH.1)) as u32;
                self.add_storm(1 << lane, strength, watch + warning, length, false);
            }
        }

        let arriving: Vec<(u32, u8, bool)> = self
            .storms
            .iter()
            .filter(|s| s.starts == watch)
            .map(|s| (s.id, s.lanes, s.great))
            .collect();
        for (storm, lanes, great) in arriving {
            self.log(Event::StormHit { storm, lanes, great });
        }

        for lane in 0..LANE_COUNT {
            let raging = self.storm_now(lane).is_some();
            let looming = self.storm_near(lane, 4).is_some();
            let wander = r.range(0, 12) as i64 - 6;
            let l = &mut self.lanes[lane];
            let drift = i64::from(l.drift) + wander + (rules::SEA_CALM_MEAN - i64::from(l.drift)) / 6;
            l.drift = drift.clamp(6, 78) as u8;
            let reported = l
                .report
                .filter(|_| watch.saturating_sub(l.reported_at) <= rules::SEA_REPORT_FRESH_WATCHES);
            let mut target = i64::from(reported.unwrap_or(l.drift));
            if raging {
                target = target.max(92);
            } else if looming {
                target = target.max(58);
            }
            let sea = i64::from(l.sea);
            l.sea = (sea + (target - sea) / 2).clamp(0, 100) as u8;
        }
    }

    pub(crate) fn add_storm(&mut self, lanes: u8, strength_bps: u16, starts: u32, length: u32, great: bool) {
        let id = self.next_id();
        self.storms.push(Storm {
            id,
            lanes,
            strength_bps,
            warned: self.watch,
            starts,
            ends: starts + length,
            great,
        });
        self.log(Event::Glass { storm: id, lanes, great, starts });
    }

    // ---- ports ---------------------------------------------------------------

    fn ports_tick(&mut self) {
        for port in 0..PORT_COUNT {
            for good in 0..GOOD_COUNT {
                let (target, flow) = rules::port_stock_rule(port, good);
                if target == 0 {
                    continue;
                }
                let stock = self.ports[port].stock[good];
                if flow > 0 {
                    let add = (flow as u32).min((target * 2).saturating_sub(stock));
                    self.ports[port].stock[good] += add;
                    self.ledger.mint(self.cargo[good], self.guild, u128::from(add));
                } else {
                    let take = flow.unsigned_abs().min(stock);
                    self.ports[port].stock[good] -= take;
                    self.ledger
                        .burn(self.cargo[good], self.guild, u128::from(take))
                        .expect("port stock is held by the guild");
                }
            }
        }
    }

    pub fn port_good_price(&self, port: usize, good: usize) -> u64 {
        let (target, _) = rules::port_stock_rule(port, good);
        if target == 0 {
            return 0;
        }
        rules::port_price(good, u64::from(self.ports[port].stock[good]), u64::from(target))
    }

    // ---- ships at sea --------------------------------------------------------

    fn sea_tick(&mut self, r: &mut Rng) {
        let mut i = 0;
        while i < self.voyages.len() {
            let (lane, watches, risk, scuttle, hull, arrives) = {
                let v = &self.voyages[i];
                let lane = usize::from(v.lane);
                (lane, LANES[lane].watches, u64::from(v.risk_bps), u64::from(v.scuttle_bps), v.hull, v.arrives)
            };
            let storm = self.storm_now(lane).map(|s| u64::from(s.strength_bps)).unwrap_or(0);
            let storm_hazard = rules::storm_hazard_bps(storm, hull);
            let hazard = (risk + scuttle) / u64::from(watches) + storm_hazard;
            if r.chance_bps(hazard) {
                self.wreck(i, storm_hazard, r);
            } else if self.watch >= arrives {
                self.arrive(i, r);
            } else {
                i += 1;
            }
        }
    }

    fn wreck(&mut self, ix: usize, storm_hazard: u64, r: &mut Rng) {
        let v = self.voyages.remove(ix);
        let c = usize::from(v.captain);
        let acct = self.captains[c].acct;
        let lane = usize::from(v.lane);
        self.ledger
            .burn(self.cargo[usize::from(v.good)], acct, u128::from(v.qty))
            .expect("the captain carried this cargo");
        self.captains[c].losses += 1;

        let covered: u64 = self
            .positions
            .iter()
            .filter(|p| p.voyage == v.id && p.parent.is_none())
            .map(|p| p.sum)
            .sum();
        let port = if v.outbound { HUB } else { LANES[lane].port } as u8;

        // Chance the wreck was deliberate: its share of everything that could
        // have sunk this ship on this crossing.
        let watches = u64::from(LANES[lane].watches);
        let total = u64::from(v.risk_bps) + u64::from(v.scuttle_bps) + storm_hazard * watches;
        let suspicion = (u64::from(v.scuttle_bps) * 100 / total.max(1)).min(95) as u8;

        self.log(Event::Wrecked {
            voyage: v.id,
            captain: v.captain,
            lane: v.lane,
            sum: covered,
            storm: storm_hazard > 0,
        });

        if covered > 0 {
            let id = self.next_id();
            let due = self.watch + rules::RECKONING_WATCHES;
            self.claims.push(Claim {
                id,
                voyage: v.id,
                captain: v.captain,
                lane: v.lane,
                sum: covered,
                lost_at: self.watch,
                due,
                suspicion,
                inquired: false,
            });
            self.captains[c].state = CaptainState::Ashore { port };
            self.log(Event::ClaimDue { claim: id, captain: v.captain, sum: covered, suspicion });
            self.spread_fear(v.id);
        } else {
            self.captains[c].state = CaptainState::Ashore { port };
            self.rebuild(c, r);
        }
    }

    fn spread_fear(&mut self, voyage: u32) {
        let hits: Vec<(usize, u64)> = self
            .positions
            .iter()
            .filter(|p| p.voyage == voyage)
            .map(|p| (usize::from(p.writer), p.sum))
            .collect();
        for (h, sum) in hits {
            let capital = self.cash(self.houses[h].acct);
            let fear = rules::fear_from_claim(sum, capital);
            let house = &mut self.houses[h];
            house.fear = house.fear.saturating_add(fear).min(90);
        }
    }

    fn arrive(&mut self, ix: usize, r: &mut Rng) {
        let v = self.voyages.remove(ix);
        let c = usize::from(v.captain);
        let lane = usize::from(v.lane);
        let dest = if v.outbound { LANES[lane].port } else { HUB };
        let good = usize::from(v.good);
        let acct = self.captains[c].acct;

        let mut revenue = 0;
        if v.qty > 0 {
            let (target, _) = rules::port_stock_rule(dest, good);
            let before = u64::from(self.ports[dest].stock[good]);
            let after = before + u64::from(v.qty);
            revenue = rules::trade_value(good, before, after, u64::from(target), u64::from(v.qty));
            self.ledger
                .transfer(self.cargo[good], acct, self.guild, u128::from(v.qty))
                .expect("the captain carried this cargo");
            self.ports[dest].stock[good] += v.qty;
            self.pay_from_guild(acct, revenue);
        }

        self.repay_bond(c, revenue);

        let wear = rules::hull_wear(v.sea_at_sailing, r.below(4));
        let captain = &mut self.captains[c];
        captain.hull = v.hull.saturating_sub(wear).max(6);
        captain.voyages += 1;
        captain.state = CaptainState::AtPort { port: dest as u8, ready_at: self.watch + 1 };

        self.expire_positions(v.id);
        self.log(Event::Home {
            voyage: v.id,
            captain: v.captain,
            profit: revenue as i64 - v.cargo_cost as i64,
            port: dest as u8,
        });
    }

    fn repay_bond(&mut self, c: usize, revenue: u64) {
        let Some(bond) = self.captains[c].bond.clone() else { return };
        let acct = self.captains[c].acct;
        let due = (revenue * rules::BOND_SHARE_PCT / 100).min(bond.owed).min(self.cash(acct));
        let house = usize::from(bond.house);
        let lender = self.houses[house].acct;
        self.ledger
            .transfer(self.crown, acct, lender, u128::from(due))
            .expect("repayment was capped at cash");
        let left = bond.owed - due;
        self.captains[c].bond = if left == 0 { None } else { Some(Bond { house: bond.house, owed: left }) };
    }

    /// Ends every policy on a voyage that came home safe.
    fn expire_positions(&mut self, voyage: u32) {
        let mut i = 0;
        while i < self.positions.len() {
            if self.positions[i].voyage == voyage {
                let p = self.positions.remove(i);
                self.burn_policy(&p);
            } else {
                i += 1;
            }
        }
        let live: Vec<u32> = self.positions.iter().map(|p| p.id).collect();
        self.offers.retain(|o| live.contains(&o.position));
    }

    /// Strikes a house off the register. Exposed so tests can stage a failure.
    pub fn fail_for_test(&mut self, house: usize) {
        self.fail_house(house, 0, 0);
    }

    pub(crate) fn burn_policy(&mut self, p: &Position) {
        if let Some(owner) = self.ledger.owner_of(p.token) {
            let held = self.ledger.balance(p.token, owner);
            self.ledger.burn(p.token, owner, held).expect("balance was just read");
        }
        self.ledger.retire_token(p.token);
    }

    // ---- claims --------------------------------------------------------------

    fn claims_tick(&mut self) {
        let watch = self.watch;
        let due: Vec<Claim> = self.claims.iter().filter(|c| c.due <= watch).cloned().collect();
        if due.is_empty() {
            return;
        }
        self.claims.retain(|c| c.due > watch);

        let voyages: Vec<u32> = due.iter().map(|c| c.voyage).collect();
        let settling: Vec<Position> = self
            .positions
            .iter()
            .filter(|p| voyages.contains(&p.voyage))
            .cloned()
            .collect();

        let mut debts = Vec::with_capacity(settling.len());
        let mut wallets: BTreeMap<u16, u64> = BTreeMap::new();
        for p in &settling {
            let debtor = self.houses[usize::from(p.writer)].acct;
            let Some(creditor) = self.ledger.owner_of(p.token) else { continue };
            debts.push((p.id, Debt { debtor, creditor, amount: p.sum }));
            wallets.insert(debtor, self.cash(debtor));
            wallets.insert(creditor, self.cash(creditor));
        }
        let plain: Vec<Debt> = debts.iter().map(|(_, d)| *d).collect();
        let cleared = clear(&plain, &wallets);

        let payments: Vec<(u16, u16, u128)> = plain
            .iter()
            .zip(&cleared.paid)
            .map(|(d, paid)| (d.debtor, d.creditor, u128::from(*paid)))
            .collect();
        self.ledger.settle(self.crown, &payments).expect("clearing never overdraws an account");

        // Book-keeping for each house and each claim.
        let mut paid_by_position: BTreeMap<u32, u64> = BTreeMap::new();
        for ((id, debt), paid) in debts.iter().zip(&cleared.paid) {
            paid_by_position.insert(*id, *paid);
            if let Some(h) = self.houses.iter().position(|h| h.acct == debt.debtor) {
                self.houses[h].stats.claims += *paid;
            }
            if let Some(h) = self.houses.iter().position(|h| h.acct == debt.creditor) {
                self.houses[h].stats.recovered += *paid;
            }
        }
        for claim in &due {
            let top: Vec<&Position> = settling
                .iter()
                .filter(|p| p.voyage == claim.voyage && p.parent.is_none())
                .collect();
            let sum: u64 = top.iter().map(|p| p.sum).sum();
            let paid: u64 = top.iter().map(|p| paid_by_position.get(&p.id).copied().unwrap_or(0)).sum();
            self.day_claims += paid;
            self.log(Event::ClaimPaid { claim: claim.id, captain: claim.captain, sum, paid });
            let hit: Vec<usize> = settling
                .iter()
                .filter(|p| p.voyage == claim.voyage)
                .map(|p| usize::from(p.writer))
                .collect();
            for h in hit {
                self.houses[h].stats.wrecks += 1;
            }
        }
        for p in &settling {
            self.positions.retain(|q| q.id != p.id);
            self.burn_policy(p);
        }

        // A house that could not pay is struck from the register.
        let mut owed: BTreeMap<u16, (u64, u64)> = BTreeMap::new();
        for (d, paid) in plain.iter().zip(&cleared.paid) {
            let entry = owed.entry(d.debtor).or_insert((0, 0));
            entry.0 += d.amount;
            entry.1 += *paid;
        }
        for acct in &cleared.defaulted {
            if let Some(h) = self.houses.iter().position(|h| h.acct == *acct) {
                let (total, paid) = owed[acct];
                self.fail_house(h, total, paid);
            }
        }
        for (acct, _) in owed.iter().filter(|(a, _)| !cleared.defaulted.contains(a)) {
            if let Some(h) = self.houses.iter().position(|h| h.acct == *acct) {
                self.houses[h].reputation = (self.houses[h].reputation + 1).min(100);
            }
        }

        // Captains paid in full can rebuild. Others wait for someone to refit them.
        let mut r = Rng::new(self.rng ^ u64::from(watch));
        for claim in &due {
            self.rebuild(usize::from(claim.captain), &mut r);
        }
    }

    pub(crate) fn fail_house(&mut self, h: usize, owed: u64, paid: u64) {
        let acct = self.houses[h].acct;
        let left = self.ledger.balance(self.crown, acct);
        self.ledger
            .transfer(self.crown, acct, self.guild, left)
            .expect("transferring the exact balance");
        self.houses[h].failed_at = Some(self.watch);
        self.houses[h].reputation = 0;

        // Every promise this house wrote dies with it, along with any cover
        // that was reinsuring those promises.
        let mut doomed: Vec<u32> = self
            .positions
            .iter()
            .filter(|p| usize::from(p.writer) == h)
            .map(|p| p.id)
            .collect();
        let mut i = 0;
        while i < doomed.len() {
            let id = doomed[i];
            for p in self.positions.iter().filter(|p| p.parent == Some(id)) {
                if !doomed.contains(&p.id) {
                    doomed.push(p.id);
                }
            }
            i += 1;
        }
        let victims = doomed.len() as u16;
        for id in doomed {
            if let Some(ix) = self.positions.iter().position(|p| p.id == id) {
                let p = self.positions.remove(ix);
                self.burn_policy(&p);
            }
        }
        let live: Vec<u32> = self.positions.iter().map(|p| p.id).collect();
        self.offers.retain(|o| usize::from(o.house) != h && live.contains(&o.position));
        for slip in &mut self.slips {
            slip.quotes.retain(|q| usize::from(q.house) != h);
        }
        for captain in &mut self.captains {
            if captain.bond.as_ref().is_some_and(|b| usize::from(b.house) == h) {
                captain.bond = None;
            }
        }
        self.log(Event::HouseFailed { house: h as u16, owed, paid, victims });
    }

    fn rebuild(&mut self, c: usize, r: &mut Rng) {
        let CaptainState::Ashore { port } = self.captains[c].state else { return };
        if self.claims.iter().any(|claim| usize::from(claim.captain) == c) {
            return;
        }
        let acct = self.captains[c].acct;
        if self.cash(acct) >= rules::NEW_SHIP_COST + rules::WORKING_CASH {
            self.ledger
                .transfer(self.crown, acct, self.guild, u128::from(rules::NEW_SHIP_COST))
                .expect("cash was checked");
            self.captains[c].hull = 72 + r.below(16) as u8;
            self.captains[c].state = CaptainState::AtPort { port, ready_at: self.watch + rules::REST_WATCHES };
        } else {
            self.captains[c].state = CaptainState::LaidUp { port, since: self.watch };
            self.log(Event::LaidUp { captain: c as u16 });
        }
    }

    // ---- the Room: reinsurance ----------------------------------------------------

    pub(crate) fn persona(&self, h: usize) -> &'static HousePersona {
        let house = &self.houses[h];
        match house.kind {
            HouseKind::Room(i) => &rules::HOUSE_PERSONAS[usize::from(i)],
            HouseKind::Entrant => &rules::HOUSE_PERSONAS[2],
            _ => &rules::CLERK,
        }
    }

    /// What a house thinks a crossing is worth, given what it has noticed so far.
    fn house_estimate(&self, h: usize, lane: usize, hull: u8, r: &mut Rng) -> u64 {
        let persona = self.persona(h);
        let sea = self.lanes[lane].sea;
        let mut estimate = rules::voyage_risk_bps(lane, sea, hull) * r.wobble_pct(persona.error) / 100;
        let horizon = LANES[lane].watches + 1;
        if let Some(storm) = self.storm_near(lane, horizon) {
            if self.watch >= storm.warned + persona.slow_watches {
                estimate += u64::from(storm.strength_bps) * u64::from(storm.ends - storm.starts);
            }
        }
        estimate
    }

    fn room_tick(&mut self, r: &mut Rng) {
        let watch = self.watch;
        self.offers.retain(|o| o.expires > watch);

        // Houses over their retention pass risk along.
        for h in 0..self.houses.len() {
            if !self.houses[h].active() || !self.houses[h].is_auto() {
                continue;
            }
            let persona = self.persona(h);
            let capital = self.cash(self.houses[h].acct);
            let retention = capital * persona.retention_pct / 100;
            for lane in 0..LANE_COUNT {
                let net = self.net_on_lane(h, lane);
                if net <= retention {
                    continue;
                }
                let excess = net - retention;
                let candidate = self
                    .positions
                    .iter()
                    .filter(|p| usize::from(p.writer) == h && usize::from(p.lane) == lane)
                    .filter(|p| !self.offers.iter().any(|o| o.position == p.id))
                    .map(|p| (p.id, p.sum.saturating_sub(self.ceded_from(p.id)), p.rate_bps, p.sum))
                    .filter(|(_, free, _, _)| *free > 0)
                    .max_by_key(|(_, free, _, _)| *free);
                let Some((id, free, rate, sum)) = candidate else { continue };
                let wanted = excess.min(free);
                let share = (wanted * BPS / sum.max(1)).clamp(1_000, 9_000) as u16;
                let alarm = self.storm_near(lane, LANES[lane].watches).is_some()
                    && self.storm_near(lane, LANES[lane].watches).is_some_and(|s| watch >= s.warned + persona.slow_watches);
                let bid = u64::from(rate) * if alarm { 240 } else { 112 } / 100;
                let offer_id = self.next_id();
                self.offers.push(Offer {
                    id: offer_id,
                    house: h as u16,
                    position: id,
                    share_bps: share,
                    rate_bps: bid.min(3_500) as u16,
                    expires: watch + rules::OFFER_WATCHES,
                });
                break;
            }
        }

        // Offers from people go straight to the Room. Room offers wait a moment
        // so that players get first look.
        let ids: Vec<u32> = self.offers.iter().map(|o| o.id).collect();
        for id in ids {
            let Some(o) = self.offers.iter().find(|o| o.id == id).cloned() else { continue };
            let from_auto = self.houses[usize::from(o.house)].is_auto();
            if from_auto && o.expires > watch + 1 {
                continue;
            }
            let Some(p) = self.positions.iter().find(|p| p.id == o.position).cloned() else { continue };
            let hull = self
                .voyages
                .iter()
                .find(|v| v.id == p.voyage)
                .map(|v| self.captains[usize::from(v.captain)].hull)
                .unwrap_or(60);
            let start = r.below(self.houses.len() as u64) as usize;
            for step in 0..self.houses.len() {
                let t = (start + step) % self.houses.len();
                if t == usize::from(o.house) || !self.houses[t].active() || !self.houses[t].is_auto() {
                    continue;
                }
                if self.position_is_duplicate(t, &p) {
                    continue;
                }
                let estimate = self.house_estimate(t, usize::from(p.lane), hull, r);
                let ask = rules::reinsurer_ask_bps(
                    self.persona(t),
                    estimate,
                    self.houses[t].fear,
                    self.book_full_pct(t),
                );
                let ceded = rules::of_bps(p.sum, u64::from(o.share_bps));
                let room = self.cash(self.houses[t].acct) * rules::MAX_GEARING;
                if u64::from(o.rate_bps) >= ask && self.net_book(t) + ceded <= room {
                    self.execute_cession(o.id, t).ok();
                    break;
                }
            }
        }
    }

    fn position_is_duplicate(&self, taker: usize, p: &Position) -> bool {
        self.positions
            .iter()
            .filter(|q| q.voyage == p.voyage)
            .count()
            >= MAX_POSITIONS_PER_VOYAGE
            || usize::from(p.writer) == taker
    }

    /// Moves part of a position to `taker`, who is paid a premium to carry it.
    pub(crate) fn execute_cession(&mut self, offer: u32, taker: usize) -> Result<(), String> {
        let ix = self
            .offers
            .iter()
            .position(|o| o.id == offer)
            .ok_or("that offer has gone")?;
        let o = self.offers.remove(ix);
        let p = self
            .positions
            .iter()
            .find(|p| p.id == o.position)
            .cloned()
            .ok_or("that risk has gone")?;
        let free = p.sum.saturating_sub(self.ceded_from(p.id));
        let sum = rules::of_bps(p.sum, u64::from(o.share_bps)).min(free);
        if sum == 0 {
            return Err("nothing left to pass on".into());
        }
        let premium = rules::of_bps(sum, u64::from(o.rate_bps));
        let cedent = usize::from(o.house);
        let (from, to) = (self.houses[cedent].acct, self.houses[taker].acct);
        self.ledger
            .transfer(self.crown, from, to, u128::from(premium))
            .map_err(|e| e.to_string())?;

        let id = self.next_id();
        let token = self
            .ledger
            .token(&format!("policy:{id}"))
            .map_err(|e| e.to_string())?;
        self.ledger.mint(token, from, u128::from(sum));
        self.positions.push(Position {
            id,
            voyage: p.voyage,
            lane: p.lane,
            writer: taker as u16,
            token,
            sum,
            rate_bps: o.rate_bps,
            parent: Some(p.id),
        });
        self.houses[cedent].stats.ceded += premium;
        self.houses[taker].stats.assumed += premium;
        self.houses[taker].stats.premiums += premium;
        self.log(Event::Ceded {
            from: cedent as u16,
            to: taker as u16,
            position: p.id,
            sum,
            rate_bps: o.rate_bps,
        });
        Ok(())
    }

    // ---- slips ---------------------------------------------------------------

    fn slips_tick(&mut self, r: &mut Rng) {
        let watch = self.watch;
        for i in 0..self.slips.len() {
            if self.slips[i].opened + 1 == watch {
                self.auto_quotes(i, r);
            }
        }
        let closing: Vec<u32> = self
            .slips
            .iter()
            .filter(|s| s.closes <= watch)
            .map(|s| s.id)
            .collect();
        for id in closing {
            if let Some(ix) = self.slips.iter().position(|s| s.id == id) {
                let slip = self.slips.remove(ix);
                self.close_slip(slip, r);
            }
        }
    }

    fn auto_quotes(&mut self, ix: usize, r: &mut Rng) {
        let (lane, offer, sum, believed) = {
            let s = &self.slips[ix];
            (
                usize::from(s.lane),
                u64::from(s.offer_bps),
                s.sum_insured,
                self.captains[usize::from(s.captain)].hull,
            )
        };
        for h in 0..self.houses.len() {
            if !self.houses[h].active() || !self.houses[h].is_auto() {
                continue;
            }
            if self.slips[ix].quotes.iter().any(|q| usize::from(q.house) == h) {
                continue;
            }
            if !r.chance_bps(4_000) {
                continue;
            }
            let estimate = self.house_estimate(h, lane, believed, r);
            let persona = self.persona(h);
            let full = self.book_full_pct(h);
            let ask = rules::house_ask_bps(persona, estimate, self.houses[h].fear, full);
            let Some(rate_bps) = rules::house_quote_bps(ask, offer) else { continue };
            let capital = self.cash(self.houses[h].acct);
            let line = rules::of_bps(sum, u64::from(persona.line_bps));
            if self.net_book(h) + line > capital * rules::MAX_GEARING {
                continue;
            }
            self.slips[ix].quotes.push(Quote { house: h as u16, rate_bps, line_bps: persona.line_bps });
        }
    }

    fn close_slip(&mut self, mut slip: Slip, r: &mut Rng) {
        let c = usize::from(slip.captain);
        let def = &CAPTAINS[c];

        let mut quotes = slip.quotes.clone();
        quotes.retain(|q| self.houses[usize::from(q.house)].active());
        quotes.sort_by_key(|q| {
            let house = &self.houses[usize::from(q.house)];
            let human = !house.is_auto();
            (rules::effective_rate(q.rate_bps, house.reputation), !human)
        });

        let cash = self.cash(self.captains[c].acct);
        let mut budget = cash.saturating_sub(slip.provisions);
        let mut remaining = BPS;
        let mut fills: Vec<(u16, u16, u16, u64)> = Vec::new();
        for q in &quotes {
            if remaining == 0 {
                break;
            }
            let take = u64::from(q.line_bps).min(remaining);
            let sum = rules::of_bps(slip.sum_insured, take);
            let premium = rules::of_bps(sum, u64::from(q.rate_bps));
            if premium > budget || sum == 0 {
                continue;
            }
            budget -= premium;
            remaining -= take;
            fills.push((q.house, take as u16, q.rate_bps, sum));
        }
        let covered = BPS - remaining;

        let enough = covered >= u64::from(rules::min_cover_bps(def.nerve));
        if enough || (slip.retried && def.nerve >= 60 && cash >= slip.provisions) {
            self.sail(slip, fills, r);
            return;
        }
        if !slip.retried {
            slip.retried = true;
            slip.offer_bps = rules::raised_offer_bps(slip.offer_bps);
            slip.opened = self.watch;
            slip.closes = self.watch + rules::SLIP_WATCHES;
            self.slips.push(slip);
            return;
        }
        self.withdraw(slip);
    }

    /// The captain gives up, sells the cargo back at a loss, and waits ashore.
    fn withdraw(&mut self, slip: Slip) {
        let c = usize::from(slip.captain);
        let acct = self.captains[c].acct;
        let good = usize::from(slip.good);
        let port = if slip.outbound { HUB } else { LANES[usize::from(slip.lane)].port };
        if slip.qty > 0 {
            self.ledger
                .transfer(self.cargo[good], acct, self.guild, u128::from(slip.qty))
                .expect("the captain bought this cargo");
            self.ports[port].stock[good] += slip.qty;
            self.pay_from_guild(acct, slip.cargo_cost * 90 / 100);
        }
        self.captains[c].state = CaptainState::AtPort {
            port: port as u8,
            ready_at: self.watch + rules::REST_WATCHES,
        };
        self.log(Event::Withdrew { captain: slip.captain });
    }

    fn sail(&mut self, slip: Slip, fills: Vec<(u16, u16, u16, u64)>, r: &mut Rng) {
        let c = usize::from(slip.captain);
        let def = &CAPTAINS[c];
        let lane = usize::from(slip.lane);
        let acct = self.captains[c].acct;
        let believed = self.captains[c].hull;
        let sea = self.lanes[lane].sea;

        let hull = slip.hull.unwrap_or_else(|| rules::hull_from_roll(believed, r.below(101)));
        let risk = rules::voyage_risk_bps(lane, sea, hull);
        let provisions = slip.provisions.min(self.cash(acct));
        self.ledger
            .transfer(self.crown, acct, self.guild, u128::from(provisions))
            .expect("provisions were capped at cash");

        let id = self.next_id();
        let mut weighted = 0u64;
        let mut covered = 0u16;
        for &(house, line, rate, sum) in &fills {
            let premium = rules::of_bps(sum, u64::from(rate));
            let h = usize::from(house);
            let to = self.houses[h].acct;
            self.ledger
                .transfer(self.crown, acct, to, u128::from(premium))
                .expect("premiums were budgeted against cash");
            let position = self.next_id();
            let token = self
                .ledger
                .token(&format!("policy:{position}"))
                .expect("room in ledger");
            self.ledger.mint(token, acct, u128::from(sum));
            self.positions.push(Position {
                id: position,
                voyage: id,
                lane: slip.lane,
                writer: house,
                token,
                sum,
                rate_bps: rate,
                parent: None,
            });
            self.houses[h].stats.premiums += premium;
            self.houses[h].stats.lines += 1;
            weighted += u64::from(rate) * u64::from(line);
            covered += line;
            self.day_premium += premium;
            self.day_sum += sum;
        }

        let covered_sum = rules::of_bps(slip.sum_insured, u64::from(covered));
        let cash_after = self.cash(acct);
        let scuttle = rules::scuttle_risk_bps(cash_after, covered_sum, hull, def.shady);
        let voyage = Voyage {
            id,
            captain: slip.captain,
            lane: slip.lane,
            outbound: slip.outbound,
            good: slip.good,
            qty: slip.qty,
            sum_insured: slip.sum_insured,
            cargo_cost: slip.cargo_cost,
            covered_bps: covered,
            sailed: self.watch,
            arrives: self.watch + LANES[lane].watches,
            hull,
            risk_bps: risk.min(u64::from(u16::MAX)) as u16,
            scuttle_bps: scuttle.min(u64::from(u16::MAX)) as u16,
            sea_at_sailing: sea,
        };
        self.voyages.push(voyage);
        self.captains[c].state = CaptainState::Sailing { voyage: id };
        if covered > 0 {
            let avg = (weighted / u64::from(covered)) as u16;
            self.log(Event::Bound { voyage: id, captain: slip.captain, covered_bps: covered, avg_rate_bps: avg });
        } else {
            self.log(Event::SailedBare { voyage: id, captain: slip.captain });
        }
    }

    // ---- captains ------------------------------------------------------------

    fn captains_tick(&mut self, r: &mut Rng) {
        for c in 0..self.captains.len() {
            match self.captains[c].state {
                CaptainState::AtPort { port, ready_at } if self.watch >= ready_at => {
                    self.plan_voyage(c, usize::from(port), r);
                }
                CaptainState::Ashore { .. } => self.rebuild(c, r),
                CaptainState::LaidUp { since, .. } => {
                    if self.watch >= since + rules::ROOM_REFITS_AFTER {
                        self.room_refit(c);
                    }
                }
                _ => {}
            }
        }
    }

    /// The richest Room house takes a stake in a captain nobody else has helped.
    fn room_refit(&mut self, c: usize) {
        let lender = (0..self.houses.len())
            .filter(|&h| self.houses[h].active() && self.houses[h].is_auto())
            .max_by_key(|&h| self.cash(self.houses[h].acct));
        if let Some(h) = lender {
            if self.cash(self.houses[h].acct) > rules::REFIT_COST * 3 {
                self.refit(c, h).ok();
            }
        }
    }

    pub(crate) fn refit(&mut self, c: usize, h: usize) -> Result<(), String> {
        let CaptainState::LaidUp { port, .. } = self.captains[c].state else {
            return Err("that captain is not laid up".into());
        };
        let (lender, acct) = (self.houses[h].acct, self.captains[c].acct);
        self.ledger
            .transfer(self.crown, lender, acct, u128::from(rules::REFIT_COST))
            .map_err(|e| e.to_string())?;
        self.ledger
            .transfer(self.crown, acct, self.guild, u128::from(rules::NEW_SHIP_COST / 2))
            .expect("the refit stake covers the yard's bill");
        self.captains[c].hull = 78;
        self.captains[c].bond = Some(Bond {
            house: h as u16,
            owed: rules::REFIT_COST * rules::BOND_RETURN_PCT / 100,
        });
        self.captains[c].state = CaptainState::AtPort { port, ready_at: self.watch + 1 };
        self.log(Event::Refitted { captain: c as u16, house: h as u16 });
        Ok(())
    }

    fn plan_voyage(&mut self, c: usize, port: usize, r: &mut Rng) {
        if self.watch + rules::LAST_SAILING_BEFORE_END > self.season_length() {
            return;
        }
        self.maintain(c);
        let acct = self.captains[c].acct;
        let cash = self.cash(acct);
        if cash < rules::WORKING_CASH {
            self.captains[c].state = CaptainState::LaidUp { port: port as u8, since: self.watch };
            self.log(Event::LaidUp { captain: c as u16 });
            return;
        }

        let def = &CAPTAINS[c];
        let mut best: Option<Plan> = None;
        let lanes: Vec<usize> = if port == HUB {
            (0..LANE_COUNT).collect()
        } else {
            vec![lane_of_port(port)]
        };
        for lane in lanes {
            let watches = LANES[lane].watches;
            if self.storm_near(lane, watches).is_some() && def.nerve < 45 {
                continue;
            }
            let outbound = port == HUB;
            let good = if outbound { WARES } else { PORTS[port].makes };
            let plan = self.cost_voyage(c, port, lane, outbound, good, cash, r);
            if best.as_ref().is_none_or(|b| plan.score > b.score) {
                best = Some(plan);
            }
        }
        let Some(plan) = best else {
            self.captains[c].state = CaptainState::AtPort { port: port as u8, ready_at: self.watch + 1 };
            return;
        };
        self.open_slip(c, port, plan);
    }

    fn maintain(&mut self, c: usize) {
        let def = &CAPTAINS[c];
        let acct = self.captains[c].acct;
        let hull = self.captains[c].hull;
        let threshold = 82 - def.thrift / 3;
        if hull >= threshold {
            return;
        }
        let want = u64::from(92 - hull.min(92)) * rules::REPAIR_COST_PER_POINT;
        let spend = want.min(self.cash(acct) * 40 / 100);
        let points = spend / rules::REPAIR_COST_PER_POINT;
        if points == 0 {
            return;
        }
        self.ledger
            .transfer(self.crown, acct, self.guild, u128::from(points * rules::REPAIR_COST_PER_POINT))
            .expect("repair was capped at cash");
        self.captains[c].hull = (u64::from(hull) + points).min(100) as u8;
    }

    #[allow(clippy::too_many_arguments)]
    fn cost_voyage(&self, c: usize, port: usize, lane: usize, outbound: bool, good: usize, cash: u64, r: &mut Rng) -> Plan {
        let def = &CAPTAINS[c];
        let dest = if outbound { LANES[lane].port } else { HUB };
        let watches = LANES[lane].watches;
        let provisions = rules::WAGES_PER_WATCH * u64::from(watches);
        let (from_target, _) = rules::port_stock_rule(port, good);
        let (to_target, _) = rules::port_stock_rule(dest, good);
        let from_stock = u64::from(self.ports[port].stock[good]);
        let to_stock = u64::from(self.ports[dest].stock[good]);

        let price = rules::port_price(good, from_stock, u64::from(from_target));
        let spendable = cash.saturating_sub(provisions) * 75 / 100;
        let affordable = spendable / price.max(1);
        let qty = u64::from(def.capacity).min(affordable).min(from_stock);

        let cost = rules::trade_value(good, from_stock, from_stock - qty, u64::from(from_target), qty);
        let revenue = rules::trade_value(good, to_stock, to_stock + qty, u64::from(to_target), qty);
        let profit = revenue as i64 - cost as i64 - provisions as i64;

        if profit <= 0 || qty == 0 {
            // Better to sail empty than to haul at a loss.
            return Plan {
                lane,
                outbound,
                good,
                qty: 0,
                cost: 0,
                revenue: 0,
                provisions,
                score: -(provisions as i64),
            };
        }
        Plan {
            lane,
            outbound,
            good,
            qty: qty as u32,
            cost,
            revenue,
            provisions,
            score: profit * r.wobble_pct(25) as i64 / 100,
        }
    }

    fn open_slip(&mut self, c: usize, port: usize, plan: Plan) {
        let def = &CAPTAINS[c];
        let acct = self.captains[c].acct;
        if plan.qty > 0 {
            self.ledger
                .transfer(self.cargo[plan.good], self.guild, acct, u128::from(plan.qty))
                .expect("quantity was limited by stock");
            self.ports[port].stock[plan.good] -= plan.qty;
            let cost = plan.cost.min(self.cash(acct));
            self.ledger
                .transfer(self.crown, acct, self.guild, u128::from(cost))
                .expect("cost was capped at cash");
        }
        let sum_insured = plan.revenue + rules::hull_value(def.capacity);
        let offer_bps = rules::captain_offer_bps(&rules::OfferInputs {
            revenue: plan.revenue,
            cargo_cost: plan.cost,
            provisions: plan.provisions,
            sum_insured,
            thrift: def.thrift,
            cash: self.cash(acct),
        });
        let id = self.next_id();
        self.slips.push(Slip {
            id,
            captain: c as u16,
            lane: plan.lane as u8,
            outbound: plan.outbound,
            good: plan.good as u8,
            qty: plan.qty,
            cargo_cost: plan.cost,
            revenue: plan.revenue,
            provisions: plan.provisions,
            sum_insured,
            offer_bps,
            opened: self.watch,
            closes: self.watch + rules::SLIP_WATCHES,
            retried: false,
            hull: None,
            surveyed_by: Vec::new(),
            quotes: Vec::new(),
        });
        self.captains[c].state = CaptainState::Seeking { slip: id };
        self.log(Event::SlipOpened { slip: id, captain: c as u16 });
        if plan.qty == 0 {
            // Nothing aboard worth insuring: the ship simply sails.
            let slip = self.slips.pop().expect("the slip was just added");
            let mut r = Rng::new(self.rng ^ u64::from(id));
            self.sail(slip, Vec::new(), &mut r);
        }
    }

    // ---- the calendar ----------------------------------------------------------

    fn close_day(&mut self) {
        if self.day_sum > 0 {
            self.last_rate_bps = (self.day_premium * BPS / self.day_sum) as u16;
        }
        let mut index = 0;
        for port in 1..PORT_COUNT {
            let good = PORTS[port].makes;
            index += rules::price_multiple_pct(good, self.port_good_price(HUB, good));
        }
        let room_capital: u64 = self
            .houses
            .iter()
            .filter(|h| h.active())
            .map(|h| self.cash(h.acct))
            .sum();
        let stat = DayStat {
            day: self.watch / rules::WATCHES_PER_DAY,
            rate_bps: self.last_rate_bps,
            price_index: (index / (PORT_COUNT as u64 - 1)) as u16,
            room_capital,
            at_sea: self.voyages.len() as u8,
            laid_up: self
                .captains
                .iter()
                .filter(|c| matches!(c.state, CaptainState::LaidUp { .. }))
                .count() as u8,
            houses: self.houses.iter().filter(|h| h.active()).count() as u8,
            premiums: self.day_premium,
            claims: self.day_claims,
        };
        self.history.push(stat);
        self.day_premium = 0;
        self.day_sum = 0;
        self.day_claims = 0;

        for h in 0..self.houses.len() {
            let capital = self.cash(self.houses[h].acct);
            let house = &mut self.houses[h];
            house.fear = house.fear.saturating_sub(rules::FEAR_DECAY_PER_DAY);
            house.stats.peak = house.stats.peak.max(capital);
        }
        self.consider_entrant();
    }

    /// High premiums and thin competition bring new money into the Room.
    fn consider_entrant(&mut self) {
        let room: Vec<usize> = (0..self.houses.len())
            .filter(|&h| self.houses[h].active() && self.houses[h].is_auto())
            .collect();
        let dear = self.last_rate_bps >= 1_100;
        let thin = room.len() < 4;
        if (!dear && !thin)
            || room.len() >= rules::MAX_ROOM_HOUSES
            || usize::from(self.entrants) >= rules::ENTRANT_NAMES.len()
            || self.houses.len() >= MAX_HOUSES
        {
            return;
        }
        let name = rules::ENTRANT_NAMES[usize::from(self.entrants)];
        self.entrants += 1;
        let slug = format!("entrant-{}-s{}", self.entrants, self.season);
        let acct = self
            .ledger
            .account(&format!("{slug}.{}", self.cfg.domain))
            .expect("room in ledger");
        self.pay_from_guild(acct, rules::ENTRANT_CAPITAL);
        self.houses.push(House {
            acct,
            name: name.to_string(),
            kind: HouseKind::Entrant,
            failed_at: None,
            reputation: 55,
            fear: 0,
            founded: self.watch,
            refounded: false,
            clerk: false,
            stats: HouseStats { peak: rules::ENTRANT_CAPITAL, ..HouseStats::default() },
        });
        self.log(Event::Founded { house: self.houses.len() as u16 - 1 });
    }

    fn end_season(&mut self) {
        self.log(Event::SeasonEnd { season: self.season });
        for h in 0..self.houses.len() {
            if !self.houses[h].active() {
                continue;
            }
            let capital = self.cash(self.houses[h].acct);
            let house = &self.houses[h];
            if matches!(house.kind, HouseKind::Player | HouseKind::Agent) {
                self.hall.push(HallEntry {
                    season: self.season,
                    house: house.name.clone(),
                    capital,
                    kind: house.kind.clone(),
                });
            }
        }
        self.hall.sort_by(|a, b| b.capital.cmp(&a.capital));
        self.hall.truncate(20);
        self.intermission = Some(rules::WATCHES_BETWEEN_SEASONS);
    }

    /// Returns every crown to the Guild and every good to the sea, then begins again.
    pub fn start_next_season(&mut self) {
        let accounts: Vec<u16> = self
            .houses
            .iter()
            .map(|h| h.acct)
            .chain(self.captains.iter().map(|c| c.acct))
            .collect();
        for acct in accounts {
            let held = self.ledger.balance(self.crown, acct);
            self.ledger
                .transfer(self.crown, acct, self.guild, held)
                .expect("transferring the exact balance");
            for good in 0..GOOD_COUNT {
                let token = self.cargo[good];
                let goods = self.ledger.balance(token, acct);
                self.ledger.burn(token, acct, goods).expect("burning the exact balance");
            }
        }
        for good in 0..GOOD_COUNT {
            let token = self.cargo[good];
            let held = self.ledger.balance(token, self.guild);
            self.ledger.burn(token, self.guild, held).expect("burning the exact balance");
        }
        let positions = core::mem::take(&mut self.positions);
        for p in &positions {
            self.burn_policy(p);
        }
        self.captains.clear();
        self.houses.clear();
        self.slips.clear();
        self.voyages.clear();
        self.offers.clear();
        self.claims.clear();
        self.storms.clear();
        self.history.clear();
        self.entrants = 0;
        self.day_premium = 0;
        self.day_sum = 0;
        self.day_claims = 0;
        self.watch = 0;
        self.season += 1;
        self.intermission = None;
        self.seed_season();
    }
}

fn pick_lanes(r: &mut Rng, count: u64) -> u8 {
    let mut order: Vec<u8> = (0..LANE_COUNT as u8).collect();
    for i in (1..order.len()).rev() {
        let j = r.below(i as u64 + 1) as usize;
        order.swap(i, j);
    }
    order.iter().take(count as usize).fold(0u8, |mask, lane| mask | (1 << lane))
}
