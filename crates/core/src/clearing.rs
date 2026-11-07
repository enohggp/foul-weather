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

const MAX_ROUNDS: usize = 48;

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

fn owed_on(debt: &Debt, total_due: u64, total_pay: u64) -> u64 {
    if total_due == 0 {
        return 0;
    }
    (u128::from(debt.amount) * u128::from(total_pay) / u128::from(total_due)) as u64
}

/// Clears `debts` given each party's cash on hand.
///
/// `cash` is looked up by party; a party not in the map has nothing.
pub fn clear(debts: &[Debt], cash: &BTreeMap<u16, u64>) -> Cleared {
    let mut due: BTreeMap<u16, u64> = BTreeMap::new();
    for d in debts {
        *due.entry(d.debtor).or_insert(0) += d.amount;
    }

    // Start by assuming everyone pays in full, then lower payments until they
    // are consistent. This reaches the largest clearing vector.
    let mut pay = due.clone();
    let mut rounds = 0;
    for _ in 0..MAX_ROUNDS {
        rounds += 1;
        let mut inflow: BTreeMap<u16, u64> = BTreeMap::new();
        for d in debts {
            let total_due = due[&d.debtor];
            let paid = owed_on(d, total_due, pay[&d.debtor]);
            *inflow.entry(d.creditor).or_insert(0) += paid;
        }
        let mut changed = false;
        for (party, owed) in &due {
            let available = cash.get(party).copied().unwrap_or(0)
                + inflow.get(party).copied().unwrap_or(0);
            let next = (*owed).min(available);
            if next < pay[party] {
                pay.insert(*party, next);
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }

    // If the rounds ran out, fall back to what each party can pay from its own
    // cash. This can only lower payments, so no account can end up overdrawn.
    let settled = is_consistent(debts, cash, &due, &pay);
    if !settled {
        for (party, amount) in pay.iter_mut() {
            *amount = (*amount).min(cash.get(party).copied().unwrap_or(0));
        }
    }

    let paid = debts
        .iter()
        .map(|d| owed_on(d, due[&d.debtor], pay[&d.debtor]))
        .collect();
    let defaulted = due
        .iter()
        .filter(|(party, owed)| pay[party] < **owed)
        .map(|(party, _)| *party)
        .collect();
    Cleared { paid, defaulted, rounds }
}

fn is_consistent(
    debts: &[Debt],
    cash: &BTreeMap<u16, u64>,
    due: &BTreeMap<u16, u64>,
    pay: &BTreeMap<u16, u64>,
) -> bool {
    let mut inflow: BTreeMap<u16, u64> = BTreeMap::new();
    for d in debts {
        *inflow.entry(d.creditor).or_insert(0) += owed_on(d, due[&d.debtor], pay[&d.debtor]);
    }
    due.keys().all(|party| {
        pay[party]
            <= cash.get(party).copied().unwrap_or(0) + inflow.get(party).copied().unwrap_or(0)
    })
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
