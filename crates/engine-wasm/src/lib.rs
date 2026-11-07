//! The same rules the contract runs, compiled for the browser.
//!
//! The page sends one JSON command at a time through `fw_call` and gets one JSON
//! reply. A practice harbor lives here in memory, with no network and no chain.

use core::cell::RefCell;
use foul_core::{Action, Config, World};
use serde::Deserialize;
use serde_json::{json, Value};

/// The player's account name inside a practice harbor.
pub const YOU: &str = "you.practice.local";

struct Holder(RefCell<Option<World>>);
// The browser runs this module on a single thread.
unsafe impl Sync for Holder {}
static WORLD: Holder = Holder(RefCell::new(None));

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
enum Command {
    New { seed: u64, watch_ms: u64 },
    Step { entropy: Vec<u8>, #[serde(default = "one")] watches: u32 },
    Act { action: Action, entropy: Vec<u8> },
    View,
    Sea { seas: Vec<u8> },
    Save,
    Load { data: String },
}

fn one() -> u32 {
    1
}

fn entropy32(bytes: &[u8]) -> [u8; 32] {
    let mut out = [0u8; 32];
    for (slot, byte) in out.iter_mut().zip(bytes) {
        *slot = *byte;
    }
    out
}

fn to_hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push(char::from_digit(u32::from(b >> 4), 16).unwrap_or('0'));
        s.push(char::from_digit(u32::from(b & 15), 16).unwrap_or('0'));
    }
    s
}

fn from_hex(s: &str) -> Option<Vec<u8>> {
    let digits: Vec<u8> = s
        .chars()
        .map(|c| c.to_digit(16).map(|d| d as u8))
        .collect::<Option<_>>()?;
    Some(digits.chunks_exact(2).map(|p| p[0] << 4 | p[1]).collect())
}

fn view_of(world: &World) -> Value {
    serde_json::to_value(world.view(Some(YOU))).unwrap_or(Value::Null)
}

/// Runs one command against the practice harbor.
pub fn dispatch(input: &str) -> String {
    let reply = match serde_json::from_str::<Command>(input) {
        Err(e) => Err(format!("bad command: {e}")),
        Ok(command) => run(command),
    };
    match reply {
        Ok(result) => json!({ "ok": true, "result": result }).to_string(),
        Err(error) => json!({ "ok": false, "error": error }).to_string(),
    }
}

fn run(command: Command) -> Result<Value, String> {
    let mut slot = WORLD.0.borrow_mut();
    if let Command::New { seed, watch_ms } = command {
        let cfg = Config { domain: "practice.local".into(), watch_ms, sandbox: true };
        let world = World::new(cfg, seed);
        let view = view_of(&world);
        *slot = Some(world);
        return Ok(view);
    }
    if let Command::Load { data } = command {
        let bytes = from_hex(&data).ok_or("that save is damaged")?;
        let world: World = borsh::from_slice(&bytes).map_err(|_| "that save is damaged")?;
        let view = view_of(&world);
        *slot = Some(world);
        return Ok(view);
    }
    let world = slot.as_mut().ok_or("no harbor has been opened")?;
    match command {
        Command::Step { entropy, watches } => {
            let mut e = entropy32(&entropy);
            for i in 0..watches.max(1) {
                e[31] = e[31].wrapping_add(i as u8);
                world.step(&e);
            }
            Ok(view_of(world))
        }
        Command::Act { action, entropy } => {
            let receipt = world.act(YOU, action, &entropy32(&entropy))?;
            Ok(json!({ "receipt": receipt, "view": view_of(world) }))
        }
        Command::View => Ok(view_of(world)),
        Command::Sea { seas } => {
            world.post_sea_report(&seas)?;
            Ok(view_of(world))
        }
        Command::Save => {
            let bytes = borsh::to_vec(world).map_err(|e| e.to_string())?;
            Ok(json!({ "data": to_hex(&bytes) }))
        }
        Command::New { .. } | Command::Load { .. } => Err("unreachable".into()),
    }
}

/// Reserves `len` bytes for the page to write a command into.
#[no_mangle]
pub extern "C" fn fw_alloc(len: usize) -> *mut u8 {
    let mut buffer = Vec::<u8>::with_capacity(len);
    let ptr = buffer.as_mut_ptr();
    core::mem::forget(buffer);
    ptr
}

/// Releases memory returned by `fw_alloc` or `fw_call`.
///
/// # Safety
/// `ptr` and `len` must come from `fw_alloc` or from the result of `fw_call`.
#[no_mangle]
pub unsafe extern "C" fn fw_free(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, 0, len));
}

/// Runs the JSON command at `ptr`. The result packs a pointer and a length:
/// the top 32 bits are the address and the bottom 32 bits are the byte count.
///
/// # Safety
/// `ptr` and `len` must describe a buffer filled by the page from `fw_alloc`.
#[no_mangle]
pub unsafe extern "C" fn fw_call(ptr: *mut u8, len: usize) -> u64 {
    let input = core::slice::from_raw_parts(ptr, len);
    let reply = dispatch(core::str::from_utf8(input).unwrap_or("{}")).into_bytes();
    let mut boxed = reply.into_boxed_slice().into_vec();
    boxed.shrink_to_fit();
    let (out, out_len) = (boxed.as_mut_ptr(), boxed.len());
    core::mem::forget(boxed);
    ((out as u64) << 32) | out_len as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_harbor_opens_steps_and_saves() {
        let v: Value = serde_json::from_str(&dispatch(r#"{"op":"new","seed":4,"watch_ms":4000}"#)).unwrap();
        assert_eq!(v["ok"], true);
        let found = r#"{"op":"act","action":{"kind":"found_house","name":"Test"},"entropy":[1,2,3]}"#;
        let v: Value = serde_json::from_str(&dispatch(found)).unwrap();
        assert_eq!(v["ok"], true, "{v}");
        let v: Value = serde_json::from_str(&dispatch(r#"{"op":"step","entropy":[9],"watches":12}"#)).unwrap();
        assert_eq!(v["result"]["watch"], 12);
        let saved: Value = serde_json::from_str(&dispatch(r#"{"op":"save"}"#)).unwrap();
        let data = saved["result"]["data"].as_str().unwrap();
        let load = json!({ "op": "load", "data": data }).to_string();
        let v: Value = serde_json::from_str(&dispatch(&load)).unwrap();
        assert_eq!(v["result"]["watch"], 12);
    }

    #[test]
    fn errors_come_back_as_json() {
        let v: Value = serde_json::from_str(&dispatch("not json")).unwrap();
        assert_eq!(v["ok"], false);
    }
}
