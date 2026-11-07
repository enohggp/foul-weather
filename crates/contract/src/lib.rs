//! Foul Weather on NEAR.
//!
//! One contract holds the whole harbor: the rules, every captain and house, and
//! every token as NEP-245 multi-tokens. There is no game server. Anyone can call
//! `tick` to move the world on, and no key exists that can spend a captain's money.

use foul_core::view::WorldView;
use foul_core::{Action, Config, Receipt, World};
use near_sdk::json_types::{U128, U64};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{
    env, ext_contract, near, require, AccountId, Allowance, Gas, NearToken, PanicOnDefault,
    Promise, PromiseOrValue, PublicKey,
};

/// Watches a single `tick` may run after a quiet spell. Beyond this the world
/// has simply been asleep, so nothing is owed to it.
const MAX_CATCH_UP: u64 = 3;
const MAX_LOG_LINES: usize = 12;
const GAS_FOR_RECEIVER: Gas = Gas::from_tgas(40);
const GAS_FOR_RESOLVE: Gas = Gas::from_tgas(20);
const MAX_RECEIVER_REPLY: usize = 4_096;
/// Testnet NEAR given to a new player, enough for hundreds of moves.
const GRANT: NearToken = NearToken::from_millinear(120);
const ACCOUNTS_PER_HOUR: u32 = 40;
const HOUR_MS: u64 = 3_600_000;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct Token {
    pub token_id: String,
    pub owner_id: Option<AccountId>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct Status {
    pub season: u32,
    pub watch: u32,
    pub last_tick_ms: U64,
    pub watch_ms: U64,
    pub next_tick_ms: U64,
    pub seq: U64,
    pub state_bytes: U64,
}

/// Live sea readings, published for any other contract or app to read.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct SeaReport {
    pub lane: String,
    pub sea: u8,
    pub live: bool,
}

#[ext_contract(ext_receiver)]
pub trait MtReceiver {
    fn mt_on_transfer(
        &mut self,
        sender_id: AccountId,
        previous_owner_ids: Vec<AccountId>,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        msg: String,
    ) -> PromiseOrValue<Vec<U128>>;
}

#[ext_contract(ext_self)]
pub trait MtResolver {
    fn mt_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
    ) -> Vec<U128>;
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    world: World,
    owner: AccountId,
    /// The account allowed to post live sea readings.
    reporter: AccountId,
    last_tick_ms: u64,
    /// A key that can only call `open_account`. It is public on purpose: this
    /// is how a new player gets an account without a wallet or a server.
    front_door: Option<String>,
    accounts_opened: u32,
    window_started_ms: u64,
    window_count: u32,
}

fn entropy() -> [u8; 32] {
    env::random_seed_array()
}

fn seed_from_entropy() -> u64 {
    let e = entropy();
    let mut word = [0u8; 8];
    word.copy_from_slice(&e[..8]);
    u64::from_le_bytes(word)
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner: AccountId, reporter: AccountId, watch_ms: U64) -> Self {
        let cfg = Config {
            domain: env::current_account_id().to_string(),
            watch_ms: watch_ms.0,
            sandbox: false,
        };
        Self {
            world: World::new(cfg, seed_from_entropy()),
            owner,
            reporter,
            last_tick_ms: env::block_timestamp_ms(),
            front_door: None,
            accounts_opened: 0,
            window_started_ms: 0,
            window_count: 0,
        }
    }

    /// Replaces all contract state. For upgrades during the hackathon.
    #[private]
    #[init(ignore_state)]
    pub fn reinit(owner: AccountId, reporter: AccountId, watch_ms: U64) -> Self {
        Self::new(owner, reporter, watch_ms)
    }

    // ---- moving the world on ----------------------------------------------

    /// Advances the world if a watch has passed. Anyone may call this, and it is
    /// harmless to call early. Returns the number of watches that ran.
    pub fn tick(&mut self) -> u32 {
        let now = env::block_timestamp_ms();
        let due = now.saturating_sub(self.last_tick_ms) / self.world.cfg.watch_ms.max(1);
        if due == 0 {
            return 0;
        }
        let run = due.min(MAX_CATCH_UP);
        for i in 0..run {
            let mut seed = entropy();
            seed[0] ^= i as u8;
            self.world.step(&seed);
        }
        self.last_tick_ms = now;
        self.flush_logs();
        run as u32
    }

    // ---- what players and agents do ----------------------------------------

    /// Opens an underwriting house for the caller. Set `agent` if software runs it.
    pub fn found_house(&mut self, name: String, agent: Option<bool>) -> Receipt {
        self.act(Action::FoundHouse { name, agent: agent.unwrap_or(false) })
    }

    pub fn quote(&mut self, slip: u32, rate_bps: u16, line_bps: u16) -> Receipt {
        self.act(Action::Quote { slip, rate_bps, line_bps })
    }

    pub fn survey(&mut self, slip: u32) -> Receipt {
        self.act(Action::Survey { slip })
    }

    pub fn offer_cession(&mut self, position: u32, share_bps: u16, rate_bps: u16) -> Receipt {
        self.act(Action::OfferCession { position, share_bps, rate_bps })
    }

    pub fn take_cession(&mut self, offer: u32) -> Receipt {
        self.act(Action::TakeCession { offer })
    }

    pub fn inquiry(&mut self, claim: u32) -> Receipt {
        self.act(Action::Inquiry { claim })
    }

    pub fn refit(&mut self, captain: u16) -> Receipt {
        self.act(Action::Refit { captain })
    }

    // ---- the front door ----------------------------------------------------

    /// Opens a game account for a new player. Only the contract's own front-door
    /// key can call this, and it is capped per hour. The new account gets a little
    /// testnet NEAR and a key that can only call this contract.
    ///
    /// With `identity` (the key NEAR Auth derives for a Google or email login),
    /// the account name comes from that key and the login owns the account.
    pub fn open_account(&mut self, public_key: PublicKey, identity: Option<PublicKey>) -> AccountId {
        require!(
            env::predecessor_account_id() == env::current_account_id(),
            "only the front door opens accounts"
        );
        require!(
            env::account_balance() > GRANT.saturating_mul(4).saturating_add(env::storage_byte_cost().saturating_mul(u128::from(env::storage_usage()))),
            "the front door is closed for now"
        );
        let now = env::block_timestamp_ms();
        if now.saturating_sub(self.window_started_ms) > HOUR_MS {
            self.window_started_ms = now;
            self.window_count = 0;
        }
        require!(self.window_count < ACCOUNTS_PER_HOUR, "too many new accounts this hour");
        self.window_count += 1;
        self.accounts_opened += 1;
        // Names come from the key, so they are unique and survive a world reset.
        let named_by = identity.as_ref().unwrap_or(&public_key);
        let digest = env::sha256(named_by.as_bytes());
        let short: String = digest[..8].iter().map(|b| format!("{b:02x}")).collect();
        let prefix = if identity.is_some() { "id" } else { "p" };
        let name = format!("{prefix}-{short}");
        let id: AccountId = format!("{name}.{}", env::current_account_id())
            .parse()
            .unwrap_or_else(|_| env::panic_str("bad account name"));
        let mut opening = Promise::new(id.clone())
            .create_account()
            .transfer(GRANT)
            .add_access_key_allowance(
                public_key,
                Allowance::limited(GRANT).unwrap_or_else(|| env::panic_str("bad allowance")),
                env::current_account_id(),
                String::new(),
            );
        if let Some(key) = identity {
            opening = opening.add_full_access_key(key);
        }
        let _ = opening;
        id
    }

    /// The public front-door key, for any client that wants to open an account.
    pub fn front_door(&self) -> Option<String> {
        self.front_door.clone()
    }

    pub fn set_front_door(&mut self, key: Option<String>) {
        require!(env::predecessor_account_id() == self.owner, "owner only");
        self.front_door = key;
    }

    // ---- sea reports --------------------------------------------------------

    /// Posts one reading per lane, derived from live NEAR Intents quotes.
    pub fn post_sea_report(&mut self, seas: Vec<u8>) {
        require!(env::predecessor_account_id() == self.reporter, "only the reporter may post");
        self.world.post_sea_report(&seas).unwrap_or_else(|e| env::panic_str(&e));
    }

    /// Current sea state by lane. A small public feed any app can read.
    pub fn sea_report(&self) -> Vec<SeaReport> {
        self.world
            .view(None)
            .lanes
            .iter()
            .map(|l| SeaReport { lane: l.name.to_string(), sea: l.sea, live: l.live_report })
            .collect()
    }

    // ---- owner -------------------------------------------------------------

    pub fn set_reporter(&mut self, reporter: AccountId) {
        require!(env::predecessor_account_id() == self.owner, "owner only");
        self.reporter = reporter;
    }

    /// Starts the world again from scratch, with a new watch length.
    pub fn reset(&mut self, watch_ms: U64) {
        require!(env::predecessor_account_id() == self.owner, "owner only");
        let cfg = Config {
            domain: env::current_account_id().to_string(),
            watch_ms: watch_ms.0,
            sandbox: false,
        };
        self.world = World::new(cfg, seed_from_entropy());
        self.last_tick_ms = env::block_timestamp_ms();
    }

    // ---- reads --------------------------------------------------------------

    /// The whole harbor as seen by `viewer`. This is what the page renders.
    pub fn get_view(&self, viewer: Option<AccountId>) -> WorldView {
        self.world.view(viewer.as_ref().map(|a| a.as_str()))
    }

    pub fn status(&self) -> Status {
        let watch_ms = self.world.cfg.watch_ms;
        Status {
            season: self.world.season,
            watch: self.world.watch,
            last_tick_ms: U64(self.last_tick_ms),
            watch_ms: U64(watch_ms),
            next_tick_ms: U64(self.last_tick_ms + watch_ms),
            seq: U64(self.world.seq),
            state_bytes: U64(env::storage_usage()),
        }
    }

    /// Proves that every balance adds up to its token's supply, right now.
    pub fn audit(&self) -> String {
        match self.world.audit() {
            Ok(()) => "the books balance".to_string(),
            Err(e) => e,
        }
    }

    // ---- NEP-245: core --------------------------------------------------------

    #[payable]
    pub fn mt_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        amount: U128,
        approval: Option<(AccountId, u64)>,
        memo: Option<String>,
    ) {
        near_sdk::assert_one_yocto();
        Self::no_approvals(approval.is_some());
        let _ = memo;
        let sender = env::predecessor_account_id();
        self.move_tokens(&sender, &receiver_id, &[token_id], &[amount]);
        self.flush_logs();
    }

    #[payable]
    pub fn mt_batch_transfer(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        approvals: Option<Vec<Option<(AccountId, u64)>>>,
        memo: Option<String>,
    ) {
        near_sdk::assert_one_yocto();
        Self::no_approvals(approvals.is_some());
        let _ = memo;
        require!(token_ids.len() == amounts.len(), "token_ids and amounts differ in length");
        let sender = env::predecessor_account_id();
        self.move_tokens(&sender, &receiver_id, &token_ids, &amounts);
        self.flush_logs();
    }

    #[payable]
    pub fn mt_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        amount: U128,
        approval: Option<(AccountId, u64)>,
        memo: Option<String>,
        msg: String,
    ) -> Promise {
        near_sdk::assert_one_yocto();
        Self::no_approvals(approval.is_some());
        let _ = memo;
        self.transfer_and_call(receiver_id, vec![token_id], vec![amount], msg)
    }

    #[payable]
    pub fn mt_batch_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        approvals: Option<Vec<Option<(AccountId, u64)>>>,
        memo: Option<String>,
        msg: String,
    ) -> Promise {
        near_sdk::assert_one_yocto();
        Self::no_approvals(approvals.is_some());
        let _ = memo;
        require!(token_ids.len() == amounts.len(), "token_ids and amounts differ in length");
        self.transfer_and_call(receiver_id, token_ids, amounts, msg)
    }

    /// Finishes `mt_transfer_call`, returning whatever the receiver did not use.
    #[private]
    pub fn mt_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
    ) -> Vec<U128> {
        let unused: Vec<U128> = env::promise_result_checked(0, MAX_RECEIVER_REPLY)
            .ok()
            .and_then(|bytes| near_sdk::serde_json::from_slice(&bytes).ok())
            .filter(|v: &Vec<U128>| v.len() == amounts.len())
            .unwrap_or_else(|| amounts.clone());
        let mut spent = Vec::with_capacity(amounts.len());
        for ((token_id, amount), unused) in token_ids.iter().zip(&amounts).zip(&unused) {
            let held = self.world.ledger.balance_of(token_id, receiver_id.as_str());
            let back = unused.0.min(amount.0).min(held);
            if back > 0 {
                self.move_tokens(&receiver_id, &sender_id, core::slice::from_ref(token_id), &[U128(back)]);
            }
            spent.push(U128(amount.0 - back));
        }
        self.flush_logs();
        spent
    }

    pub fn mt_token(&self, token_ids: Vec<String>) -> Vec<Option<Token>> {
        token_ids
            .into_iter()
            .map(|token_id| {
                let token = self.world.ledger.find_token(&token_id)?;
                let unique = token_id.starts_with("policy:");
                let owner_id = unique
                    .then(|| self.world.ledger.owner_of(token))
                    .flatten()
                    .and_then(|a| self.world.ledger.account_name(a).parse().ok());
                Some(Token { token_id, owner_id })
            })
            .collect()
    }

    pub fn mt_balance_of(&self, account_id: AccountId, token_id: String) -> U128 {
        U128(self.world.ledger.balance_of(&token_id, account_id.as_str()))
    }

    pub fn mt_batch_balance_of(&self, account_id: AccountId, token_ids: Vec<String>) -> Vec<U128> {
        token_ids
            .iter()
            .map(|t| U128(self.world.ledger.balance_of(t, account_id.as_str())))
            .collect()
    }

    pub fn mt_supply(&self, token_id: String) -> Option<U128> {
        self.world.ledger.find_token(&token_id).map(|t| U128(self.world.ledger.supply(t)))
    }

    pub fn mt_batch_supply(&self, token_ids: Vec<String>) -> Vec<Option<U128>> {
        token_ids.into_iter().map(|t| self.mt_supply(t)).collect()
    }

    // ---- NEP-245: enumeration --------------------------------------------------

    pub fn mt_tokens(&self, from_index: Option<U128>, limit: Option<u32>) -> Vec<Token> {
        let from = from_index.map(|i| i.0 as usize).unwrap_or(0);
        let limit = limit.unwrap_or(50) as usize;
        self.world
            .ledger
            .tokens()
            .skip(from)
            .take(limit)
            .map(|(_, name)| Token { token_id: name.to_string(), owner_id: None })
            .collect()
    }

    pub fn mt_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u32>,
    ) -> Vec<Token> {
        let from = from_index.map(|i| i.0 as usize).unwrap_or(0);
        let limit = limit.unwrap_or(50) as usize;
        self.world
            .ledger
            .tokens()
            .filter(|(_, name)| self.world.ledger.balance_of(name, account_id.as_str()) > 0)
            .skip(from)
            .take(limit)
            .map(|(_, name)| Token { token_id: name.to_string(), owner_id: Some(account_id.clone()) })
            .collect()
    }
}

impl Contract {
    fn act(&mut self, action: Action) -> Receipt {
        let who = env::predecessor_account_id();
        let receipt = self
            .world
            .act(who.as_str(), action, &entropy())
            .unwrap_or_else(|e| env::panic_str(&e));
        self.flush_logs();
        receipt
    }

    fn flush_logs(&mut self) {
        for line in self.world.ledger.drain_logs(MAX_LOG_LINES) {
            env::log_str(&line);
        }
    }

    fn no_approvals(present: bool) {
        require!(!present, "this contract does not use approvals");
    }

    fn move_tokens(&mut self, from: &AccountId, to: &AccountId, tokens: &[String], amounts: &[U128]) {
        require!(from != to, "sender and receiver are the same");
        let ledger = &mut self.world.ledger;
        let sender = ledger
            .find_account(from.as_str())
            .unwrap_or_else(|| env::panic_str("the sender holds nothing here"));
        let receiver = ledger.account(to.as_str()).unwrap_or_else(|e| env::panic_str(&e.to_string()));
        for (token, amount) in tokens.iter().zip(amounts) {
            require!(amount.0 > 0, "amount must be positive");
            let ix = ledger
                .find_token(token)
                .unwrap_or_else(|| env::panic_str("no such token"));
            ledger
                .transfer(ix, sender, receiver, amount.0)
                .unwrap_or_else(|e| env::panic_str(&e.to_string()));
        }
    }

    fn transfer_and_call(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        msg: String,
    ) -> Promise {
        let sender = env::predecessor_account_id();
        self.move_tokens(&sender, &receiver_id, &token_ids, &amounts);
        self.flush_logs();
        let previous = vec![sender.clone(); token_ids.len()];
        ext_receiver::ext(receiver_id.clone())
            .with_static_gas(GAS_FOR_RECEIVER)
            .with_attached_deposit(NearToken::from_yoctonear(0))
            .mt_on_transfer(sender.clone(), previous, token_ids.clone(), amounts.clone(), msg)
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_RESOLVE)
                    .mt_resolve_transfer(sender, receiver_id, token_ids, amounts),
            )
    }
}
