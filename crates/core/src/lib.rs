//! Foul Weather's engine.
//!
//! One deterministic rule set, written once. The NEAR contract compiles it for
//! the live world, and the browser compiles it for practice and fast-forward.
//!
//! * [`rules`] is the readable rulebook: every price, risk and decision.
//! * [`engine`] advances the world one watch at a time.
//! * [`actions`] is everything a player or agent may do.
//! * [`clearing`] settles claims across houses that insure each other.
//! * [`view`] turns the state into what a player may see.

pub mod actions;
pub mod clearing;
pub mod engine;
pub mod rng;
pub mod roster;
pub mod rules;
pub mod view;
pub mod world;

pub use actions::{Action, Receipt};
pub use world::{Config, World};
