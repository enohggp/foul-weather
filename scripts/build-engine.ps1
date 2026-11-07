# Rebuilds the browser's copy of the rules from the same Rust as the contract.
$ErrorActionPreference = 'Stop'
cargo build --release -q -p foul-engine-wasm --target wasm32-unknown-unknown
New-Item -ItemType Directory -Force web/public | Out-Null
Copy-Item target/wasm32-unknown-unknown/release/foul_engine_wasm.wasm web/public/engine.wasm -Force