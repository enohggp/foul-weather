//! Everything a person or an agent can do. The contract and the browser both
//! call `World::act`, so the same checks apply everywhere.

use crate::rng::Rng;
use crate::rules;
use crate::world::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Action {
    /// Open an underwriting house, or found one again after a failure.
    FoundHouse { name: String, #[serde(default)] agent: bool },
    /// Sign a slip: take `line_bps` of the risk at `rate_bps`.
    Quote { slip: u32, rate_bps: u16, line_bps: u16 },
    /// Pay a surveyor to find out what state a ship is really in.
    Survey { slip: u32 },
    /// Offer part of a risk to the Room, paying `rate_bps` for it to be carried.
    OfferCession { position: u32, share_bps: u16, rate_bps: u16 },
    /// Accept a reinsurance offer and collect its premium.
    TakeCession { offer: u32 },
    /// Challenge a claim you are on the hook for, before it falls due.
    Inquiry { claim: u32 },
    /// Pay to refit a laid-up captain, and be repaid from future voyages.
    Refit { captain: u16 },
    /// Sandbox only: hand the desk to a clerk while fast-forwarding.
    SetClerk { on: bool },
    /// Sandbox only: send a great storm for demonstration.
    SummonStorm,
    /// Sandbox only: begin the next season at once.
    NextSeason,
}

/// What came of an action, for the person who took it.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "result", rename_all = "snake_case")]
pub enum Receipt {
    Done,
    Founded { capital: u64 },
    Surveyed { hull: u8 },
}

impl World {
    /// Carries out `action` for `who`, the account that signed it.
    pub fn act(&mut self, who: &str, action: Action, entropy: &[u8; 32]) -> Result<Receipt, String> {
        if self.intermission.is_some() && !matches!(action, Action::NextSeason) {
            return Err("the Room is closed until the new season".into());
        }
        match action {
            Action::FoundHouse { name, agent } => self.found_house(who, &name, agent),
            Action::Quote { slip, rate_bps, line_bps } => self.quote(who, slip, rate_bps, line_bps),
            Action::Survey { slip } => self.survey(who, slip, entropy),
            Action::OfferCession { position, share_bps, rate_bps } => {
                self.offer_cession(who, position, share_bps, rate_bps)
            }
            Action::TakeCession { offer } => self.take_cession(who, offer),
            Action::Inquiry { claim } => self.inquiry(who, claim),
            Action::Refit { captain } => {
                let h = self.active_house(who)?;
                let c = usize::from(captain);
                if c >= self.captains.len() {
                    return Err("no such captain".into());
                }
                self.refit(c, h)?;
                Ok(Receipt::Done)
            }
            Action::SetClerk { on } => {
                self.sandbox_only()?;
                let h = self.house_of(who).ok_or("you have no house")?;
                self.houses[h].clerk = on;
                Ok(Receipt::Done)
            }
            Action::SummonStorm => {
                self.sandbox_only()?;
                let (_, strongest) = rules::GREAT_STRENGTH_BPS;
                let starts = self.watch + 3;
                self.add_storm(0b11111, strongest as u16, starts, rules::GREAT_LENGTH, true);
                Ok(Receipt::Done)
            }
            Action::NextSeason => {
                self.sandbox_only()?;
                self.start_next_season();
                Ok(Receipt::Done)
            }
        }
    }

    fn sandbox_only(&self) -> Result<(), String> {
        if self.cfg.sandbox {
            Ok(())
        } else {
            Err("this is only allowed in a practice harbor".into())
        }
    }

    fn active_house(&self, who: &str) -> Result<usize, String> {
        let h = self.house_of(who).ok_or("found a house first")?;
        if self.houses[h].active() {
            Ok(h)
        } else {
            Err("your house has been struck from the register".into())
        }
    }

    fn found_house(&mut self, who: &str, name: &str, agent: bool) -> Result<Receipt, String> {
        let name = clean_name(name)?;
        let kind = if agent { HouseKind::Agent } else { HouseKind::Player };
        if let Some(h) = self.house_of(who) {
            if self.houses[h].active() {
                return Err("you already have a house".into());
            }
            if self.houses[h].refounded {
                return Err("a house may only be founded again once in a season".into());
            }
            let acct = self.houses[h].acct;
            self.pay_from_guild(acct, rules::REFOUND_CAPITAL);
            let house = &mut self.houses[h];
            house.failed_at = None;
            house.refounded = true;
            house.reputation = 30;
            house.fear = 0;
            house.name = name;
            self.log(Event::Founded { house: h as u16 });
            return Ok(Receipt::Founded { capital: rules::REFOUND_CAPITAL });
        }
        if self.houses.len() >= MAX_HOUSES {
            return Err("the Room is full this season".into());
        }
        let acct = self.ledger.account(who).map_err(|e| e.to_string())?;
        self.pay_from_guild(acct, rules::PLAYER_START_CAPITAL);
        self.houses.push(House {
            acct,
            name,
            kind,
            failed_at: None,
            reputation: 50,
            fear: 0,
            founded: self.watch,
            refounded: false,
            clerk: false,
            stats: HouseStats { peak: rules::PLAYER_START_CAPITAL, ..HouseStats::default() },
        });
        self.log(Event::Founded { house: self.houses.len() as u16 - 1 });
        Ok(Receipt::Founded { capital: rules::PLAYER_START_CAPITAL })
    }

    fn quote(&mut self, who: &str, slip: u32, rate_bps: u16, line_bps: u16) -> Result<Receipt, String> {
        let h = self.active_house(who)?;
        let ix = self.slips.iter().position(|s| s.id == slip).ok_or("that slip has closed")?;
        let s = &self.slips[ix];
        if !(50..=s.offer_bps).contains(&rate_bps) {
            return Err("the captain will not pay that rate".into());
        }
        if !(500..=10_000).contains(&line_bps) {
            return Err("a line must be between 5% and 100%".into());
        }
        let exposure = rules::of_bps(s.sum_insured, u64::from(line_bps));
        let capital = self.cash(self.houses[h].acct);
        if self.net_book(h) + exposure > capital * rules::MAX_GEARING {
            return Err("your capital cannot carry that line".into());
        }
        let quotes = &mut self.slips[ix].quotes;
        quotes.retain(|q| usize::from(q.house) != h);
        quotes.push(Quote { house: h as u16, rate_bps, line_bps });
        Ok(Receipt::Done)
    }

    fn survey(&mut self, who: &str, slip: u32, entropy: &[u8; 32]) -> Result<Receipt, String> {
        let h = self.active_house(who)?;
        let ix = self.slips.iter().position(|s| s.id == slip).ok_or("that slip has closed")?;
        if let Some(hull) = self.slips[ix].hull {
            if self.slips[ix].surveyed_by.contains(&(h as u16)) {
                return Ok(Receipt::Surveyed { hull });
            }
        }
        let acct = self.houses[h].acct;
        self.ledger
            .transfer(self.crown, acct, self.guild, u128::from(rules::SURVEY_FEE))
            .map_err(|_| "you cannot afford the surveyor".to_string())?;
        let mut r = Rng::from_entropy(self.rng, entropy);
        let believed = self.captains[usize::from(self.slips[ix].captain)].hull;
        let hull = match self.slips[ix].hull {
            Some(known) => known,
            None => rules::hull_from_roll(believed, r.below(101)),
        };
        self.slips[ix].hull = Some(hull);
        self.slips[ix].surveyed_by.push(h as u16);
        Ok(Receipt::Surveyed { hull })
    }

    fn offer_cession(&mut self, who: &str, position: u32, share_bps: u16, rate_bps: u16) -> Result<Receipt, String> {
        let h = self.active_house(who)?;
        let p = self
            .positions
            .iter()
            .find(|p| p.id == position)
            .ok_or("that risk has ended")?;
        if usize::from(p.writer) != h {
            return Err("that risk is not yours to pass on".into());
        }
        if !self.voyages.iter().any(|v| v.id == p.voyage) {
            return Err("that ship is no longer at sea".into());
        }
        if !(500..=10_000).contains(&share_bps) {
            return Err("offer between 5% and 100% of the risk".into());
        }
        if !(50..=4_000).contains(&rate_bps) {
            return Err("that rate is out of bounds".into());
        }
        if p.sum.saturating_sub(self.ceded_from(p.id)) == 0 {
            return Err("you have already passed all of this risk on".into());
        }
        self.offers.retain(|o| o.position != position);
        let id = self.next_id();
        self.offers.push(Offer {
            id,
            house: h as u16,
            position,
            share_bps,
            rate_bps,
            expires: self.watch + rules::OFFER_WATCHES,
        });
        Ok(Receipt::Done)
    }

    fn take_cession(&mut self, who: &str, offer: u32) -> Result<Receipt, String> {
        let h = self.active_house(who)?;
        let o = self.offers.iter().find(|o| o.id == offer).ok_or("that offer has gone")?;
        if usize::from(o.house) == h {
            return Err("you cannot take your own offer".into());
        }
        let p = self
            .positions
            .iter()
            .find(|p| p.id == o.position)
            .ok_or("that risk has ended")?;
        if usize::from(p.writer) == h {
            return Err("you already wrote this risk".into());
        }
        let sum = rules::of_bps(p.sum, u64::from(o.share_bps));
        let capital = self.cash(self.houses[h].acct);
        if self.net_book(h) + sum > capital * rules::MAX_GEARING {
            return Err("your capital cannot carry that much more".into());
        }
        self.execute_cession(offer, h)?;
        Ok(Receipt::Done)
    }

    /// Pays for an inquiry. Its finding comes at the next watch, in a separate
    /// step, so nobody can undo the transaction if they dislike the answer.
    fn inquiry(&mut self, who: &str, claim: u32) -> Result<Receipt, String> {
        let h = self.active_house(who)?;
        let ix = self.claims.iter().position(|c| c.id == claim).ok_or("that claim has been settled")?;
        let c = self.claims[ix].clone();
        if c.inquired {
            return Err("an inquiry has already been held".into());
        }
        if !self.positions.iter().any(|p| p.voyage == c.voyage && usize::from(p.writer) == h) {
            return Err("you have no stake in this claim".into());
        }
        let acct = self.houses[h].acct;
        self.ledger
            .transfer(self.crown, acct, self.guild, u128::from(rules::INQUIRY_FEE))
            .map_err(|_| "you cannot afford an inquiry".to_string())?;
        self.claims[ix].inquired = true;
        self.claims[ix].inquiry_by = Some(h as u16);
        Ok(Receipt::Done)
    }

    /// Reports on every inquiry waiting for a finding.
    pub(crate) fn resolve_inquiries(&mut self, r: &mut Rng) {
        let waiting: Vec<(u32, u16)> = self
            .claims
            .iter()
            .filter_map(|c| c.inquiry_by.map(|house| (c.id, house)))
            .collect();
        for (id, house) in waiting {
            let Some(ix) = self.claims.iter().position(|c| c.id == id) else { continue };
            let c = self.claims[ix].clone();
            self.claims[ix].inquiry_by = None;
            let h = usize::from(house);

            // The truth is not stored anywhere. It is decided here, by fresh
            // randomness, at exactly the odds the harbor could see.
            if r.below(100) >= u64::from(c.suspicion) {
                let name = &mut self.houses[h];
                name.reputation = name.reputation.saturating_sub(4);
                self.log(Event::HonestLoss { claim: c.id, captain: c.captain, house });
                continue;
            }

            // Proven fraud: the claim dies, and the captain's money pays the reward.
            self.claims.remove(ix);
            let mut i = 0;
            while i < self.positions.len() {
                if self.positions[i].voyage == c.voyage {
                    let p = self.positions.remove(i);
                    self.burn_policy(&p);
                } else {
                    i += 1;
                }
            }
            let live: Vec<u32> = self.positions.iter().map(|p| p.id).collect();
            self.offers.retain(|o| live.contains(&o.position));
            let captain = usize::from(c.captain);
            let wallet = self.captains[captain].acct;
            let reward = (c.sum * rules::FRAUD_REWARD_PCT / 100).min(self.cash(wallet));
            self.ledger
                .transfer(self.crown, wallet, self.houses[h].acct, u128::from(reward))
                .expect("the reward was capped at the captain's cash");
            self.captains[captain].frauds += 1;
            if let CaptainState::Ashore { port } = self.captains[captain].state {
                self.captains[captain].state = CaptainState::LaidUp { port, since: self.watch };
            }
            let name = &mut self.houses[h];
            name.reputation = (name.reputation + 3).min(100);
            self.log(Event::Fraud { claim: c.id, captain: c.captain, house, reward });
        }
    }

    /// The NEP-245 transfer rule. A policy is a claim, and a claim can be sold to
    /// another house, but only whole: a split claim has no single holder to pay.
    /// Crowns and cargo are never transferable, or a house could empty itself just
    /// before a claim fell due.
    pub fn transfer_token(&mut self, from: &str, to: &str, token: &str, amount: u128) -> Result<(), String> {
        if !token.starts_with("policy:") {
            return Err("crowns and cargo only move under the rules of the game".into());
        }
        let t = self.ledger.find_token(token).ok_or("no such token")?;
        let sender = self.ledger.find_account(from).ok_or("the sender holds nothing here")?;
        let held = self.ledger.balance(t, sender);
        if held == 0 {
            return Err("the sender does not hold that policy".into());
        }
        if amount != held {
            return Err("a policy moves whole or not at all".into());
        }
        // Only names the ledger already knows, so transfers can't grow it without limit.
        let receiver = self.ledger.find_account(to).ok_or("the receiver has no house in the Room")?;
        self.ledger.transfer(t, sender, receiver, amount).map_err(|e| e.to_string())
    }

    /// Posts live sea readings, one per lane. Only a trusted reporter may call this;
    /// the contract checks who is calling.
    pub fn post_sea_report(&mut self, seas: &[u8]) -> Result<(), String> {
        if seas.len() != rules::LANE_COUNT {
            return Err("one reading per lane".into());
        }
        for (lane, sea) in self.lanes.iter_mut().zip(seas) {
            lane.report = Some((*sea).min(100));
            lane.reported_at = self.watch;
        }
        Ok(())
    }

    /// Confirms that the books balance. Run by the tests and by anyone who asks.
    pub fn audit(&self) -> Result<(), String> {
        self.ledger.audit()?;
        for (i, port_good) in self.cargo.iter().enumerate() {
            let in_ports: u64 = self.ports.iter().map(|p| u64::from(p.stock[i])).sum();
            let held = self.ledger.balance(*port_good, self.guild) as u64;
            if in_ports != held {
                return Err(format!("{} in ports does not match the guild's holding", rules::GOODS[i].name));
            }
        }
        let supply = self.ledger.supply(self.crown);
        if supply == 0 {
            return Err("the crown has vanished".into());
        }
        for p in &self.positions {
            if p.parent.is_some_and(|parent| !self.positions.iter().any(|q| q.id == parent)) {
                return Err(format!("position {} reinsures a position that has gone", p.id));
            }
            if self.ceded_from(p.id) > p.sum {
                return Err(format!("position {} ceded more than it holds", p.id));
            }
        }
        Ok(())
    }
}

fn clean_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    let count = name.chars().count();
    if !(2..=32).contains(&count) {
        return Err("a house name must be 2 to 32 characters".into());
    }
    if name.chars().any(char::is_control) {
        return Err("that name has characters a ledger cannot hold".into());
    }
    Ok(name.to_string())
}
