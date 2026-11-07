//! Deterministic randomness. The host supplies fresh entropy (the block's random
//! seed on NEAR, the browser's on the page) and the engine mixes it with its state.

/// SplitMix64: small, fast and good enough for dice, with no floating point.
#[derive(Clone, Debug)]
pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Self {
        Rng(seed)
    }

    pub fn from_entropy(state: u64, entropy: &[u8; 32]) -> Self {
        let mut mixed = state;
        for chunk in entropy.chunks_exact(8) {
            let mut word = [0u8; 8];
            word.copy_from_slice(chunk);
            mixed = Rng(mixed ^ u64::from_le_bytes(word)).next();
        }
        Rng(mixed)
    }

    pub fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// A number from 0 up to, but not including, `limit`.
    pub fn below(&mut self, limit: u64) -> u64 {
        if limit == 0 {
            return 0;
        }
        self.next() % limit
    }

    /// A number from `low` to `high`, inclusive.
    pub fn range(&mut self, low: u64, high: u64) -> u64 {
        low + self.below(high.saturating_sub(low) + 1)
    }

    /// True with a chance of `bps` in 10,000.
    pub fn chance_bps(&mut self, bps: u64) -> bool {
        self.below(10_000) < bps
    }

    /// A value within `spread_pct` percent either side of 100.
    pub fn wobble_pct(&mut self, spread_pct: u64) -> u64 {
        self.range(100 - spread_pct.min(99), 100 + spread_pct)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_seed_same_numbers() {
        let mut a = Rng::new(9);
        let mut b = Rng::new(9);
        for _ in 0..100 {
            assert_eq!(a.next(), b.next());
        }
    }

    #[test]
    fn entropy_changes_the_stream() {
        let mut a = Rng::from_entropy(1, &[0u8; 32]);
        let mut b = Rng::from_entropy(1, &[7u8; 32]);
        assert_ne!(a.next(), b.next());
    }

    #[test]
    fn range_is_inclusive_and_chance_is_fair() {
        let mut r = Rng::new(3);
        let mut hits = 0;
        for _ in 0..20_000 {
            let n = r.range(5, 7);
            assert!((5..=7).contains(&n));
            if r.chance_bps(2_500) {
                hits += 1;
            }
        }
        assert!((4_500..5_500).contains(&hits));
    }
}
