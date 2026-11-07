# nep245-ledger

A small NEP-245 multi-token ledger for NEAR, with no `near-sdk` dependency.

`near-contract-standards` covers NEP-141 and NEP-171 but not NEP-245, so projects that want one contract to hold many token types write the bookkeeping by hand. This crate is that part.

## What it gives you

- Balances, supply, mint, burn and transfer
- `settle`: many transfers applied atomically, so circular debts clear on net positions
- Compact storage, with account and token names interned to `u16`
- `retire_token`, which reuses slots so long-lived games don't grow without limit
- `drain_logs`: NEP-297 `EVENT_JSON:` lines in the shape NEP-245 requires, with repeat movements merged
- `audit`: proof that balances add up to supply

Because it has no SDK dependency, the same code runs in a contract, in a browser through WebAssembly, and in plain `cargo test`.

## What it leaves to you

The ledger does not check who may move tokens. In your contract, check `predecessor_account_id` and the 1 yocto deposit first. `crates/contract/src/lib.rs` shows a complete NEP-245 interface on top of it, including `mt_transfer_call` and `mt_resolve_transfer`.

Approvals are not implemented.

## Example

```rust
use nep245_ledger::Ledger;

let mut ledger = Ledger::new();
let crown = ledger.token("crown").unwrap();
let (alice, bob) = (ledger.account("alice.near").unwrap(), ledger.account("bob.near").unwrap());

ledger.mint(crown, alice, 100);
ledger.transfer(crown, alice, bob, 40).unwrap();
ledger.audit().unwrap();

for line in ledger.drain_logs(8) {
    near_sdk::env::log_str(&line);
}
```

## Tests

```bash
cargo test -p nep245-ledger
```
