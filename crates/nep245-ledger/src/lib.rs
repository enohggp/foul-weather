//! A small NEP-245 multi-token ledger with no dependency on `near-sdk`.
//!
//! `near-contract-standards` ships NEP-141 and NEP-171 but not NEP-245, so every
//! NEAR project that wants one contract to hold many token types writes this by
//! hand. This crate is that hand-written part, kept reusable:
//!
//! * balances, supply, mint, burn, transfer and atomic multi-party settlement
//! * compact storage: account and token names are interned to `u16`
//! * NEP-297 `EVENT_JSON` logs in the shape NEP-245 requires
//! * an `audit()` that proves balances add up to supply
//!
//! Because it has no SDK dependency it runs unchanged in a NEAR contract, in a
//! browser through WebAssembly, and in plain `cargo test`.
//!
//! The ledger does not check who is allowed to move tokens. That is the host
//! contract's job: check `predecessor_account_id` and the 1 yocto deposit first.

use borsh::{BorshDeserialize, BorshSerialize};
use std::collections::BTreeMap;

pub type AccountIx = u16;
pub type TokenIx = u16;

/// Most groups written into a single NEP-297 log line.
const GROUPS_PER_LOG: usize = 24;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LedgerError {
    InsufficientBalance { token: String, account: String },
    UnknownToken(String),
    UnknownAccount(String),
    TableFull,
    Unbalanced,
}

impl core::fmt::Display for LedgerError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::InsufficientBalance { token, account } => {
                write!(f, "{account} does not hold enough {token}")
            }
            Self::UnknownToken(t) => write!(f, "unknown token {t}"),
            Self::UnknownAccount(a) => write!(f, "unknown account {a}"),
            Self::TableFull => write!(f, "ledger table is full"),
            Self::Unbalanced => write!(f, "settlement would leave an account overdrawn"),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
enum EventKey {
    Mint { to: AccountIx },
    Burn { from: AccountIx },
    Transfer { from: AccountIx, to: AccountIx },
}

#[derive(Clone, Debug, Default, BorshSerialize, BorshDeserialize)]
pub struct Ledger {
    accounts: Vec<String>,
    /// An empty name marks a retired slot that can be reused.
    tokens: Vec<String>,
    supply: Vec<u128>,
    balances: BTreeMap<(TokenIx, AccountIx), u128>,
    #[borsh(skip)]
    events: BTreeMap<(EventKey, TokenIx), u128>,
}

impl Ledger {
    pub fn new() -> Self {
        Self::default()
    }

    // ---- names -----------------------------------------------------------

    /// Returns the index of `name`, adding it if it is new.
    pub fn account(&mut self, name: &str) -> Result<AccountIx, LedgerError> {
        if let Some(i) = self.find_account(name) {
            return Ok(i);
        }
        if self.accounts.len() >= usize::from(u16::MAX) {
            return Err(LedgerError::TableFull);
        }
        self.accounts.push(name.to_string());
        Ok((self.accounts.len() - 1) as AccountIx)
    }

    pub fn find_account(&self, name: &str) -> Option<AccountIx> {
        self.accounts.iter().position(|a| a == name).map(|i| i as AccountIx)
    }

    pub fn account_name(&self, ix: AccountIx) -> &str {
        &self.accounts[usize::from(ix)]
    }

    /// Returns the index of token `name`, creating it if it is new.
    pub fn token(&mut self, name: &str) -> Result<TokenIx, LedgerError> {
        if let Some(i) = self.find_token(name) {
            return Ok(i);
        }
        if let Some(i) = self.tokens.iter().position(String::is_empty) {
            self.tokens[i] = name.to_string();
            self.supply[i] = 0;
            return Ok(i as TokenIx);
        }
        if self.tokens.len() >= usize::from(u16::MAX) {
            return Err(LedgerError::TableFull);
        }
        self.tokens.push(name.to_string());
        self.supply.push(0);
        Ok((self.tokens.len() - 1) as TokenIx)
    }

    pub fn find_token(&self, name: &str) -> Option<TokenIx> {
        if name.is_empty() {
            return None;
        }
        self.tokens.iter().position(|t| t == name).map(|i| i as TokenIx)
    }

    pub fn token_name(&self, ix: TokenIx) -> &str {
        &self.tokens[usize::from(ix)]
    }

    /// Frees a token's slot once nothing is left of it. Long-lived games mint
    /// many one-off tokens, so this keeps the table from growing for ever.
    pub fn retire_token(&mut self, ix: TokenIx) {
        if self.supply[usize::from(ix)] == 0 {
            self.tokens[usize::from(ix)] = String::new();
        }
    }

    pub fn tokens(&self) -> impl Iterator<Item = (TokenIx, &str)> {
        self.tokens
            .iter()
            .enumerate()
            .filter(|(_, t)| !t.is_empty())
            .map(|(i, t)| (i as TokenIx, t.as_str()))
    }

    // ---- reads -----------------------------------------------------------

    pub fn balance(&self, token: TokenIx, account: AccountIx) -> u128 {
        self.balances.get(&(token, account)).copied().unwrap_or(0)
    }

    pub fn balance_of(&self, token: &str, account: &str) -> u128 {
        match (self.find_token(token), self.find_account(account)) {
            (Some(t), Some(a)) => self.balance(t, a),
            _ => 0,
        }
    }

    pub fn supply(&self, token: TokenIx) -> u128 {
        self.supply[usize::from(token)]
    }

    /// First holder of a token. For one-of-a-kind tokens this is the owner.
    pub fn owner_of(&self, token: TokenIx) -> Option<AccountIx> {
        self.balances
            .range((token, 0)..=(token, AccountIx::MAX))
            .find(|(_, amount)| **amount > 0)
            .map(|((_, account), _)| *account)
    }

    // ---- writes ----------------------------------------------------------

    pub fn mint(&mut self, token: TokenIx, to: AccountIx, amount: u128) {
        if amount == 0 {
            return;
        }
        *self.balances.entry((token, to)).or_insert(0) += amount;
        self.supply[usize::from(token)] += amount;
        self.note(EventKey::Mint { to }, token, amount);
    }

    pub fn burn(&mut self, token: TokenIx, from: AccountIx, amount: u128) -> Result<(), LedgerError> {
        if amount == 0 {
            return Ok(());
        }
        self.debit(token, from, amount)?;
        self.supply[usize::from(token)] -= amount;
        self.note(EventKey::Burn { from }, token, amount);
        Ok(())
    }

    pub fn transfer(
        &mut self,
        token: TokenIx,
        from: AccountIx,
        to: AccountIx,
        amount: u128,
    ) -> Result<(), LedgerError> {
        if amount == 0 || from == to {
            return Ok(());
        }
        self.debit(token, from, amount)?;
        *self.balances.entry((token, to)).or_insert(0) += amount;
        self.note(EventKey::Transfer { from, to }, token, amount);
        Ok(())
    }

    /// Applies many transfers of one token as a single atomic step.
    ///
    /// Only the final net position of each account must be covered, so circular
    /// debts settle even when no account could pay its gross amount up front.
    /// On error the ledger is left untouched.
    pub fn settle(
        &mut self,
        token: TokenIx,
        payments: &[(AccountIx, AccountIx, u128)],
    ) -> Result<(), LedgerError> {
        let mut net: BTreeMap<AccountIx, i128> = BTreeMap::new();
        for &(from, to, amount) in payments {
            let amount = i128::try_from(amount).map_err(|_| LedgerError::Unbalanced)?;
            *net.entry(from).or_insert(0) -= amount;
            *net.entry(to).or_insert(0) += amount;
        }
        for (&account, &delta) in &net {
            let held = self.balance(token, account) as i128;
            if held + delta < 0 {
                return Err(LedgerError::Unbalanced);
            }
        }
        for (&account, &delta) in &net {
            let next = (self.balance(token, account) as i128 + delta) as u128;
            if next == 0 {
                self.balances.remove(&(token, account));
            } else {
                self.balances.insert((token, account), next);
            }
        }
        for &(from, to, amount) in payments {
            if amount > 0 && from != to {
                self.note(EventKey::Transfer { from, to }, token, amount);
            }
        }
        Ok(())
    }

    fn debit(&mut self, token: TokenIx, from: AccountIx, amount: u128) -> Result<(), LedgerError> {
        let held = self.balance(token, from);
        if held < amount {
            return Err(LedgerError::InsufficientBalance {
                token: self.token_name(token).to_string(),
                account: self.account_name(from).to_string(),
            });
        }
        if held == amount {
            self.balances.remove(&(token, from));
        } else {
            self.balances.insert((token, from), held - amount);
        }
        Ok(())
    }

    fn note(&mut self, key: EventKey, token: TokenIx, amount: u128) {
        *self.events.entry((key, token)).or_insert(0) += amount;
    }

    // ---- audit and events --------------------------------------------------

    /// Confirms that, for every token, balances add up exactly to supply.
    pub fn audit(&self) -> Result<(), String> {
        let mut totals = vec![0u128; self.supply.len()];
        for (&(token, _), &amount) in &self.balances {
            totals[usize::from(token)] += amount;
        }
        for (i, total) in totals.iter().enumerate() {
            if *total != self.supply[i] {
                return Err(format!(
                    "token {} holds {} against a supply of {}",
                    self.tokens[i], total, self.supply[i]
                ));
            }
        }
        Ok(())
    }

    /// Drains buffered activity into NEP-297 `EVENT_JSON:` log lines, merging
    /// repeated movements so one busy step stays within NEAR's log limits.
    pub fn drain_logs(&mut self, max_lines: usize) -> Vec<String> {
        let events = core::mem::take(&mut self.events);
        let mut mints: Vec<serde_json::Value> = Vec::new();
        let mut burns: Vec<serde_json::Value> = Vec::new();
        let mut transfers: Vec<serde_json::Value> = Vec::new();
        for ((key, token), amount) in events {
            let token_id = serde_json::Value::from(self.token_label(token));
            let amounts = serde_json::Value::from(vec![amount.to_string()]);
            let token_ids = serde_json::Value::Array(vec![token_id]);
            let mut entry = serde_json::Map::new();
            match key {
                EventKey::Mint { to } => {
                    entry.insert("owner_id".into(), self.account_name(to).into());
                    entry.insert("token_ids".into(), token_ids);
                    entry.insert("amounts".into(), amounts);
                    mints.push(entry.into());
                }
                EventKey::Burn { from } => {
                    entry.insert("owner_id".into(), self.account_name(from).into());
                    entry.insert("token_ids".into(), token_ids);
                    entry.insert("amounts".into(), amounts);
                    burns.push(entry.into());
                }
                EventKey::Transfer { from, to } => {
                    entry.insert("old_owner_id".into(), self.account_name(from).into());
                    entry.insert("new_owner_id".into(), self.account_name(to).into());
                    entry.insert("token_ids".into(), token_ids);
                    entry.insert("amounts".into(), amounts);
                    transfers.push(entry.into());
                }
            }
        }
        let mut lines = Vec::new();
        for (event, data) in [("mt_mint", mints), ("mt_burn", burns), ("mt_transfer", transfers)] {
            for chunk in data.chunks(GROUPS_PER_LOG) {
                if lines.len() >= max_lines {
                    return lines;
                }
                let mut body = serde_json::Map::new();
                body.insert("standard".into(), "nep245".into());
                body.insert("version".into(), "1.0.0".into());
                body.insert("event".into(), event.into());
                body.insert("data".into(), serde_json::Value::Array(chunk.to_vec()));
                lines.push(format!("EVENT_JSON:{}", serde_json::Value::Object(body)));
            }
        }
        lines
    }

    fn token_label(&self, token: TokenIx) -> String {
        let name = self.token_name(token);
        if name.is_empty() {
            format!("retired:{token}")
        } else {
            name.to_string()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> (Ledger, TokenIx, AccountIx, AccountIx, AccountIx) {
        let mut l = Ledger::new();
        let t = l.token("crown").unwrap();
        let a = l.account("a.near").unwrap();
        let b = l.account("b.near").unwrap();
        let c = l.account("c.near").unwrap();
        (l, t, a, b, c)
    }

    #[test]
    fn mint_transfer_burn_keep_supply_honest() {
        let (mut l, t, a, b, _) = fixture();
        l.mint(t, a, 100);
        l.transfer(t, a, b, 40).unwrap();
        l.burn(t, b, 10).unwrap();
        assert_eq!(l.balance(t, a), 60);
        assert_eq!(l.balance(t, b), 30);
        assert_eq!(l.supply(t), 90);
        l.audit().unwrap();
    }

    #[test]
    fn overdraft_is_refused_and_changes_nothing() {
        let (mut l, t, a, b, _) = fixture();
        l.mint(t, a, 5);
        assert!(l.transfer(t, a, b, 6).is_err());
        assert_eq!(l.balance(t, a), 5);
        assert_eq!(l.balance(t, b), 0);
    }

    #[test]
    fn circular_debts_settle_on_net_positions() {
        // Nobody can pay 100 up front, yet the circle clears: each ends where it began.
        let (mut l, t, a, b, c) = fixture();
        l.mint(t, a, 1);
        l.settle(t, &[(a, b, 100), (b, c, 100), (c, a, 100)]).unwrap();
        assert_eq!(l.balance(t, a), 1);
        l.audit().unwrap();
    }

    #[test]
    fn failed_settlement_leaves_the_ledger_untouched() {
        let (mut l, t, a, b, c) = fixture();
        l.mint(t, a, 10);
        assert_eq!(l.settle(t, &[(a, b, 11), (b, c, 5)]), Err(LedgerError::Unbalanced));
        assert_eq!(l.balance(t, a), 10);
        assert_eq!(l.balance(t, b), 0);
    }

    #[test]
    fn retired_token_slots_are_reused() {
        let (mut l, _, a, _, _) = fixture();
        let p = l.token("policy:1").unwrap();
        l.mint(p, a, 7);
        l.retire_token(p);
        assert!(l.find_token("policy:1").is_some(), "a live token cannot be retired");
        l.burn(p, a, 7).unwrap();
        l.retire_token(p);
        assert!(l.find_token("policy:1").is_none());
        assert_eq!(l.token("policy:2").unwrap(), p);
    }

    #[test]
    fn owner_of_finds_the_single_holder() {
        let (mut l, _, a, b, _) = fixture();
        let p = l.token("policy:1").unwrap();
        l.mint(p, a, 900);
        l.transfer(p, a, b, 900).unwrap();
        assert_eq!(l.owner_of(p), Some(b));
    }

    #[test]
    fn logs_follow_the_nep245_shape() {
        let (mut l, t, a, b, _) = fixture();
        l.mint(t, a, 10);
        l.transfer(t, a, b, 3).unwrap();
        l.transfer(t, a, b, 4).unwrap();
        l.burn(t, b, 1).unwrap();
        let logs = l.drain_logs(8);
        assert_eq!(logs.len(), 3);
        let parsed: Vec<serde_json::Value> = logs
            .iter()
            .map(|line| serde_json::from_str(line.strip_prefix("EVENT_JSON:").unwrap()).unwrap())
            .collect();
        assert_eq!(parsed[0]["standard"], "nep245");
        assert_eq!(parsed[0]["event"], "mt_mint");
        assert_eq!(parsed[0]["data"][0]["owner_id"], "a.near");
        assert_eq!(parsed[1]["event"], "mt_burn");
        assert_eq!(parsed[2]["event"], "mt_transfer");
        assert_eq!(parsed[2]["data"][0]["old_owner_id"], "a.near");
        assert_eq!(parsed[2]["data"][0]["new_owner_id"], "b.near");
        assert_eq!(parsed[2]["data"][0]["amounts"][0], "7", "repeat transfers are merged");
        assert!(l.drain_logs(8).is_empty());
    }

    #[test]
    fn borsh_round_trip_keeps_balances() {
        let (mut l, t, a, _, _) = fixture();
        l.mint(t, a, 42);
        let bytes = borsh::to_vec(&l).unwrap();
        let back: Ledger = borsh::from_slice(&bytes).unwrap();
        assert_eq!(back.balance_of("crown", "a.near"), 42);
    }
}
