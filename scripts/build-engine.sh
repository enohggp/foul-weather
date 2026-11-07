#!/bin/sh
# Rebuilds the browser's copy of the rules from the same Rust as the contract.
set -e
cargo build --release -q -p foul-engine-wasm --target wasm32-unknown-unknown
mkdir -p web/public
cp target/wasm32-unknown-unknown/release/foul_engine_wasm.wasm web/public/engine.wasm