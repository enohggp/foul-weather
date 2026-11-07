//! Claims clearing for a network of houses that insure each other.
//!
//! When several houses owe each other at once, "who pays first" has no good
//! answer: a house may only be able to pay because another house paid it. This
//! module computes the Eisenberg-Noe clearing payment: the largest set of
//! payments in which every debtor either pays in full or hands over everything
//! it has, shared across its creditors in proportion to what each is owed.
//!
//! It works in integers and stops after a fixed number of rounds, so it costs a
//! predictable amount of gas on NEAR and gives the same answer in every browser.

use std::collections::BTreeMap;

/// One debt: `debtor` owes `creditor` this many crowns.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Debt {
    pub debtor: u16,
    pub creditor: u16,
    pub amount: u64,
}

/// Each round is a single pass over the debts, so this is cheap even at 256.
const MAX_ROUNDS: usize = 256;

/// The outcome of clearing a batch of debts.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Cleared {
    /// What was actually paid on each debt, in the same order as the input.
    pub paid: Vec<u64>,
    /// Debtors that could not meet everything they owed.
    pub defaulted: Vec<u16>,
    /// Rounds used before the payments settled.
    pub rounds: usize,
}

fn share(amount: u64, total_due: u64, total_pay: u64) -> u64 {
    if total_due == 0 {
        return 0;
    }
    (u128::from(amount) * u128::from(total_pay) / u128::from(total_due)) as u64
}

struct Edge {
    debtor: usize,
    creditor: usize,
    amount: u64,
}

fn inflows(edges: &[Edge], due: &[u64], pay: &[u64]) -> Vec<u64> {
    let mut inflow = vec![0u64; due.len()];
    for e in edges {
        let paid = share(e.amount, due[e.debtor], pay[e.debtor]);
        inflow[e.creditor] = inflow[e.creditor].saturating_add(paid);
    }
    inflow
}

/// Clears `debts` given each party's cash on hand.
///
/// `cash` is looked up by party; a party not in the map has nothing.
pub fn clear(debts: &[Debt], cash: &BTreeMap<u16, u64>) -> Cleared {
    let mut parties: Vec<u16> = debts.iter().flat_map(|d| [d.debtor, d.creditor]).collect();
    parties.sort_unstable();
    parties.dedup();
    let index = |party: u16| parties.binary_search(&party).unwrap_or(0);

    let edges: Vec<Edge> = debts
        .iter()
        .map(|d| Edge { debtor: index(d.debtor), creditor: index(d.creditor), amount: d.amount })
        .collect();
    let held: Vec<u64> = parties.iter().map(|p| cash.get(p).copied().unwrap_or(0)).collect();
    let mut due = vec![0u64; parties.len()];
    for e in &edges {
        due[e.debtor] = due[e.debtor].saturating_add(e.amount);
    }

    // Start by assuming everyone pays in full, then lower payments until they
    // are consistent. This reaches the largest clearing vector.
    let mut pay = due.clone();
    let mut rounds = 0;
    let mut settled = false;
    for _ in 0..MAX_ROUNDS {
        rounds += 1;
        let inflow = inflows(&edges, &due, &pay);
        let mut changed = false;
        for i in 0..pay.len() {
            let next = due[i].min(held[i].saturating_add(inflow[i]));
            if next < pay[i] {
                pay[i] = next;
                changed = true;
            }
        }
        if !changed {
            settled = true;
            break;
        }
    }

    // A deliberately slow ring can outlast the rounds. Fall back to what each
    // party can pay from its own cash, which can never overdraw an account.
    if !settled {
        let inflow = inflows(&edges, &due, &pay);
        let consistent = (0..pay.len()).all(|i| pay[i] <= held[i].saturating_add(inflow[i]));
        if !consistent {
            for i in 0..pay.len() {
                pay[i] = pay[i].min(held[i]);
            }
        }
    }

    let paid = edges.iter().map(|e| share(e.amount, due[e.debtor], pay[e.debtor])).collect();
    let defaulted = (0..pay.len())
        .filter(|&i| pay[i] < due[i])
        .map(|i| parties[i])
        .collect();
    Cleared { paid, defaulted, rounds }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cash(pairs: &[(u16, u64)]) -> BTreeMap<u16, u64> {
        pairs.iter().copied().collect()
    }

    fn debt(debtor: u16, creditor: u16, amount: u64) -> Debt {
        Debt { debtor, creditor, amount }
    }

    #[test]
    fn solvent_debtors_pay_in_full() {
        let r = clear(&[debt(1, 9, 100)], &cash(&[(1, 150)]));
        assert_eq!(r.paid, vec![100]);
        assert!(r.defaulted.is_empty());
    }

    #[test]
    fn a_failed_debtor_shares_what_it_has_pro_rata() {
        let r = clear(&[debt(1, 8, 300), debt(1, 9, 100)], &cash(&[(1, 200)]));
        assert_eq!(r.paid, vec![150, 50]);
        assert_eq!(r.defaulted, vec![1]);
    }

    #[test]
    fn a_debtor_can_pay_with_money_it_is_owed() {
        // House 1 cannot pay the captain alone, but its reinsurer covers the gap.
        let debts = [debt(1, 9, 1_000), debt(2, 1, 800)];
        let r = clear(&debts, &cash(&[(1, 200), (2, 900)]));
        assert_eq!(r.paid, vec![1_000, 800]);
        assert!(r.defaulted.is_empty());
    }

    #[test]
    fn failure_spreads_to_those_relying_on_the_failed_house() {
        // House 2 fails, so house 1 recovers too little and fails in turn.
        let debts = [debt(1, 9, 1_000), debt(2, 1, 800)];
        let r = clear(&debts, &cash(&[(1, 300), (2, 100)]));
        assert_eq!(r.paid, vec![400, 100]);
        assert_eq!(r.defaulted, vec![1, 2]);
    }

    #[test]
    fn a_ring_of_houses_settles_without_cash() {
        let debts = [debt(1, 2, 500), debt(2, 3, 500), debt(3, 1, 500)];
        let r = clear(&debts, &BTreeMap::new());
        assert_eq!(r.paid, vec![500, 500, 500]);
        assert!(r.defaulted.is_empty());
    }

    #[test]
    fn a_ring_with_an_outside_debt_fails_together() {
        // The spiral: three houses pass one loss round, and the money runs out.
        let debts = [
            debt(1, 2, 1_000),
            debt(2, 3, 1_000),
            debt(3, 1, 1_000),
            debt(1, 9, 1_200),
        ];
        let r = clear(&debts, &cash(&[(1, 100), (2, 100), (3, 100)]));
        assert_eq!(r.defaulted, vec![1, 2, 3]);
        let paid_out: u64 = r.paid[3];
        assert!(paid_out <= 300, "only real cash can reach the outside creditor");
    }

    #[test]
    fn a_slow_ring_does_not_default_an_honest_house_that_relies_on_it() {
        // Most of each debt circles the ring. House 5 is owed by the ring and
        // must not be treated as insolvent just because clearing takes many rounds.
        let debts = [
            debt(1, 2, 10_000),
            debt(2, 3, 10_000),
            debt(3, 1, 10_000),
            debt(1, 5, 120),
            debt(5, 9, 100),
        ];
        let r = clear(&debts, &cash(&[(1, 400), (5, 40)]));
        assert!(r.rounds < MAX_ROUNDS, "took {} rounds", r.rounds);
        assert!(!r.defaulted.contains(&5), "house 5 was paid enough to meet its debt");
    }

    #[test]
    fn nobody_ever_pays_more_than_they_have_plus_receive() {
        // Pseudo-random networks, checked for the one property that must hold.
        let mut seed = 7u64;
        let mut next = move |limit: u64| {
            seed = seed.wrapping_mul(0x9E37_79B9_7F4A_7C15).wrapping_add(0xD1B5_4A32_D192_ED03);
            (seed >> 33) % limit
        };
        for _ in 0..500 {
            let mut debts = Vec::new();
            for _ in 0..(2 + next(12)) {
                let debtor = next(6) as u16;
                let creditor = next(7) as u16;
                if debtor != creditor {
                    debts.push(debt(debtor, creditor, 1 + next(2_000)));
                }
            }
            let mut wallet = BTreeMap::new();
            for party in 0..7u16 {
                wallet.insert(party, next(1_500));
            }
            let r = clear(&debts, &wallet);
            let mut end: BTreeMap<u16, i64> =
                wallet.iter().map(|(party, money)| (*party, *money as i64)).collect();
            for (d, paid) in debts.iter().zip(&r.paid) {
                *end.get_mut(&d.debtor).unwrap() -= *paid as i64;
                *end.get_mut(&d.creditor).unwrap() += *paid as i64;
            }
            assert!(end.values().all(|money| *money >= 0), "an account went negative");
        }
    }
}
