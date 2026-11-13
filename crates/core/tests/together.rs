//! Real players playing with each other: helping, gifts, sailing together, raids, insurance and talk.

use foul_core::rules;
use foul_core::{Action, Config, World};

const ANN: &str = "ann.near";
const BEN: &str = "ben.near";

fn world(seed: u64) -> World {
    World::new(Config { domain: "fw.test".into(), watch_ms: 1_000, sandbox: true }, seed)
}

fn entropy(n: u64) -> [u8; 32] {
    let mut e = [0u8; 32];
    e[..8].copy_from_slice(&n.wrapping_mul(0x9E37_79B9_7F4A_7C15).to_le_bytes());
    e
}

fn open(w: &mut World, who: &str) -> usize {
    w.act(who, Action::OpenTown { name: who.into() }, &entropy(1)).unwrap();
    w.town_of(who).unwrap()
}

fn act(w: &mut World, who: &str, a: Action) -> Result<(), String> {
    w.act(who, a, &entropy(2)).map(|_| ())
}

fn coins(w: &World, t: usize) -> u64 {
    w.cash(w.towns[t].acct)
}

fn give(w: &mut World, t: usize, amount: u64) {
    let (guild, acct, crown) = (w.guild, w.towns[t].acct, w.crown);
    w.ledger.transfer(crown, guild, acct, u128::from(amount)).unwrap();
}

#[test]
fn helping_pays_both_players_and_then_needs_a_rest() {
    let mut w = world(1);
    let (a, b) = (open(&mut w, ANN), open(&mut w, BEN));
    let (before_a, before_b) = (coins(&w, a), coins(&w, b));
    act(&mut w, ANN, Action::HelpTown { town: b as u16 }).unwrap();
    let paid = rules::help_coins(1);
    assert_eq!(coins(&w, a), before_a + paid);
    assert_eq!(coins(&w, b), before_b + paid);
    assert!(act(&mut w, ANN, Action::HelpTown { town: b as u16 }).is_err(), "needs a rest");
    for i in 0..rules::HELP_REST_WATCHES as u64 {
        w.step(&entropy(100 + i));
    }
    act(&mut w, ANN, Action::HelpTown { town: b as u16 }).unwrap();
    w.audit().unwrap();
}

#[test]
fn only_real_players_can_be_helped_or_sent_gifts() {
    let mut w = world(2);
    let a = open(&mut w, ANN);
    let rival = w.towns.iter().position(|t| t.bot).unwrap() as u16;
    assert!(act(&mut w, ANN, Action::HelpTown { town: rival }).is_err());
    assert!(act(&mut w, ANN, Action::SendGift { town: rival, coins: 10 }).is_err());
    assert!(act(&mut w, ANN, Action::HelpTown { town: a as u16 }).is_err(), "not yourself");
    assert!(act(&mut w, ANN, Action::SendGift { town: a as u16, coins: 10 }).is_err(), "not yourself");
}

#[test]
fn a_gift_moves_real_coins_and_has_a_limit() {
    let mut w = world(3);
    let (a, b) = (open(&mut w, ANN), open(&mut w, BEN));
    give(&mut w, a, 1_000);
    let (before_a, before_b) = (coins(&w, a), coins(&w, b));
    assert!(act(&mut w, ANN, Action::SendGift { town: b as u16, coins: rules::GIFT_MAX + 1 }).is_err());
    assert!(act(&mut w, ANN, Action::SendGift { town: b as u16, coins: 0 }).is_err());
    act(&mut w, ANN, Action::SendGift { town: b as u16, coins: 60 }).unwrap();
    assert_eq!(coins(&w, a), before_a - 60);
    assert_eq!(coins(&w, b), before_b + 60);
    assert!(act(&mut w, ANN, Action::SendGift { town: b as u16, coins: 10 }).is_err(), "needs a rest");
    w.audit().unwrap();
}

#[test]
fn you_cannot_give_away_coins_you_do_not_have() {
    let mut w = world(4);
    let (a, b) = (open(&mut w, ANN), open(&mut w, BEN));
    let ship = w.towns[a].ships[0].id;
    act(&mut w, ANN, Action::SendShip { ship, lane: 1, protect: false }).unwrap();
    let left = coins(&w, a);
    if left < rules::GIFT_MAX {
        assert!(act(&mut w, ANN, Action::SendGift { town: b as u16, coins: left + 1 }).is_err());
    }
    w.audit().unwrap();
}

#[test]
fn sailing_the_same_route_as_a_real_player_is_safer() {
    let mut w = world(5);
    let (a, b) = (open(&mut w, ANN), open(&mut w, BEN));
    let (ship_a, ship_b) = (w.towns[a].ships[0].id, w.towns[b].ships[0].id);
    act(&mut w, ANN, Action::SendShip { ship: ship_a, lane: 1, protect: false }).unwrap();
    let alone = w.view(Some(ANN)).town.unwrap().ships[0].trip.as_ref().unwrap().danger_bps;
    assert!(w.view(Some(ANN)).town.unwrap().ships[0].trip.as_ref().unwrap().convoy.is_none());
    act(&mut w, BEN, Action::SendShip { ship: ship_b, lane: 1, protect: false }).unwrap();
    let view = w.view(Some(ANN)).town.unwrap();
    let trip = view.ships[0].trip.as_ref().unwrap();
    assert_eq!(trip.convoy.as_deref(), Some(BEN));
    assert!(trip.danger_bps < alone, "{} should be below {alone}", trip.danger_bps);
}

#[test]
fn rival_towns_do_not_count_as_company() {
    let mut w = world(6);
    let a = open(&mut w, ANN);
    let ship = w.towns[a].ships[0].id;
    act(&mut w, ANN, Action::SendShip { ship, lane: 1, protect: false }).unwrap();
    for i in 0..3 {
        w.step(&entropy(40 + i));
        let view = w.view(Some(ANN)).town.unwrap();
        if let Some(trip) = view.ships[0].trip.as_ref() {
            assert!(trip.convoy.is_none());
        }
    }
}

fn raider(w: &mut World, t: usize, who: &str) {
    w.towns[t].xp = 100_000;
    give(w, t, 5_000);
    act(w, who, Action::Build { building: rules::BUILD_COVE as u8 }).unwrap();
}

#[test]
fn a_raid_gives_warning_and_the_target_can_get_away() {
    let mut escaped = false;
    for seed in 0..30 {
        let mut w = world(200 + seed);
        let (a, b) = (open(&mut w, ANN), open(&mut w, BEN));
        raider(&mut w, a, ANN);
        let ship = w.towns[b].ships[0].id;
        act(&mut w, BEN, Action::SendShip { ship, lane: 1, protect: false }).unwrap();
        w.step(&entropy(seed + 1));
        if w.towns[b].ships[0].trip.is_none() {
            continue;
        }
        act(&mut w, ANN, Action::Raid { town: b as u16, ship }).unwrap();
        let warned = w.view(Some(BEN)).town.unwrap();
        assert_eq!(warned.ships[0].trip.as_ref().unwrap().raid_from.as_deref(), Some(ANN));
        let attacker_before = coins(&w, a);
        w.step(&entropy(seed + 2));
        if w.towns[b].ships[0].trip.is_none() {
            continue;
        }
        assert_eq!(coins(&w, a), attacker_before, "the raid has not landed yet");
        act(&mut w, BEN, Action::ComeHome { ship }).unwrap();
        for i in 0..4 {
            w.step(&entropy(seed + 10 + i));
        }
        assert_eq!(coins(&w, a), attacker_before, "the ship got away");
        w.audit().unwrap();
        escaped = true;
        break;
    }
    assert!(escaped, "no ship ever got the chance to run");
}

#[test]
fn a_real_players_insurance_is_picked_and_reported() {
    let mut w = world(7);
    let (a, b) = (open(&mut w, ANN), open(&mut w, BEN));
    w.towns[a].xp = 100_000;
    give(&mut w, a, 20_000);
    act(&mut w, ANN, Action::Build { building: rules::BUILD_OFFICE as u8 }).unwrap();
    let ship = w.towns[b].ships[0].id;
    let view = w.view(Some(BEN));
    let fee = view.town.as_ref().unwrap().ships[0].routes[0].protect_fee.expect("someone will protect it");
    assert!(fee > 0);
    let office_before = coins(&w, a);
    act(&mut w, BEN, Action::SendShip { ship, lane: 0, protect: true }).unwrap();
    let trip = w.view(Some(BEN)).town.unwrap().ships[0].trip.as_ref().map(|t| t.insurer.clone()).unwrap();
    assert_eq!(trip.as_deref(), Some("ann.near Insurance"), "a real player's office goes first");
    assert_eq!(coins(&w, a), office_before + fee, "the fee went straight to the other player");
    w.audit().unwrap();
}

#[test]
fn players_can_type_their_own_words() {
    let mut w = world(11);
    let (_, b) = (open(&mut w, ANN), open(&mut w, BEN));
    act(&mut w, ANN, Action::SayText { text: "  want to   race to Spice Island?  ".into(), to: Some(b as u16) }).unwrap();
    let view = w.view(Some(BEN));
    let line = view.chat.last().unwrap();
    assert_eq!(line.text, "want to race to Spice Island?", "spaces are tidied");
    assert!(line.typed && line.to_you);
    act(&mut w, BEN, Action::SayText { text: "नमस्ते दोस्त! 🚢".into(), to: None }).unwrap();
    assert_eq!(w.view(Some(ANN)).chat.last().unwrap().text, "नमस्ते दोस्त! 🚢", "any language works");
    w.audit().unwrap();
}

#[test]
fn typed_words_are_checked() {
    let mut w = world(12);
    open(&mut w, ANN);
    let say = |w: &mut World, text: &str| act(w, ANN, Action::SayText { text: text.into(), to: None });
    assert!(say(&mut w, "   ").is_err(), "blank");
    assert!(say(&mut w, &"a".repeat(rules::CHAT_MAX_CHARS + 1)).is_err(), "too long");
    assert!(say(&mut w, &"a".repeat(rules::CHAT_MAX_CHARS)).is_ok(), "just fits");
    w.step(&entropy(1));
    assert!(say(&mut w, "join http://bad.example").is_err(), "link");
    assert!(say(&mut w, "visit www.example.net").is_err(), "link");
    assert!(say(&mut w, "mail me at kid@example.org").is_err(), "email");
    assert!(say(&mut w, "call 555 123 4567").is_err(), "phone number");
    assert!(say(&mut w, "you are a BITCH").is_err(), "bad word");
    assert!(say(&mut w, "I have 12 ships and 300 coins").is_ok(), "ordinary numbers are fine");
    assert!(say(&mut w, "I live in Scunthorpe").is_ok(), "a word inside a word is fine");
    assert_eq!(w.chat.last().unwrap().typed.as_deref(), Some("I live in Scunthorpe"));
}

#[test]
fn typing_counts_towards_the_same_speed_limit() {
    let mut w = world(13);
    open(&mut w, ANN);
    for _ in 0..rules::CHAT_PER_WATCH {
        act(&mut w, ANN, Action::SayText { text: "hello".into(), to: None }).unwrap();
    }
    assert!(act(&mut w, ANN, Action::SayText { text: "hello".into(), to: None }).is_err());
    assert!(act(&mut w, ANN, Action::Say { phrase: 0, to: None }).is_err());
    w.step(&entropy(9));
    act(&mut w, ANN, Action::SayText { text: "hello again".into(), to: None }).unwrap();
}

#[test]
fn town_names_are_checked_too() {
    let mut w = world(14);
    assert!(w.act(ANN, Action::OpenTown { name: "www.example.net".into() }, &entropy(1)).is_err());
    assert!(w.act(ANN, Action::OpenTown { name: "Shit Town".into() }, &entropy(1)).is_err());
    assert!(w.act(ANN, Action::OpenTown { name: "Sunny Harbor".into() }, &entropy(1)).is_ok());
}

#[test]
fn phrases_are_checked_and_the_log_stays_short() {
    let mut w = world(8);
    let (a, b) = (open(&mut w, ANN), open(&mut w, BEN));
    assert!(act(&mut w, ANN, Action::Say { phrase: rules::CHAT_PHRASES.len() as u8, to: None }).is_err());
    assert!(act(&mut w, ANN, Action::Say { phrase: 0, to: Some(a as u16) }).is_err(), "not to yourself");
    assert!(act(&mut w, ANN, Action::Say { phrase: 0, to: Some(999) }).is_err());
    act(&mut w, ANN, Action::Say { phrase: 3, to: Some(b as u16) }).unwrap();
    let view = w.view(Some(BEN));
    let line = view.chat.last().unwrap();
    assert_eq!(line.text, rules::CHAT_PHRASES[3]);
    assert!(line.to_you && !line.you && !line.bot);
    assert_eq!(line.name, ANN);
    for _ in 0..rules::CHAT_PER_WATCH - 1 {
        act(&mut w, ANN, Action::Say { phrase: 0, to: None }).unwrap();
    }
    assert!(act(&mut w, ANN, Action::Say { phrase: 0, to: None }).is_err(), "too much at once");
    for i in 0..200 {
        w.step(&entropy(300 + i));
        if w.intermission.is_some() {
            break;
        }
        act(&mut w, BEN, Action::Say { phrase: 1, to: None }).unwrap();
        assert!(w.chat.len() <= rules::CHAT_KEEP);
    }
}

#[test]
fn rival_towns_answer_when_a_real_player_speaks() {
    let mut answered = false;
    for seed in 0..40 {
        let mut w = world(400 + seed);
        open(&mut w, ANN);
        let before = w.next_chat;
        act(&mut w, ANN, Action::Say { phrase: 0, to: None }).unwrap();
        for i in 0..2 {
            w.step(&entropy(seed + i));
        }
        if w.next_chat > before + 1 && w.chat.last().is_some_and(|l| w.towns[usize::from(l.town)].bot) {
            answered = true;
            break;
        }
    }
    assert!(answered, "nobody ever answered");
}

#[test]
fn the_table_shows_who_is_around() {
    let mut w = world(9);
    let (a, _) = (open(&mut w, ANN), open(&mut w, BEN));
    let row = |w: &World, id: usize| w.view(Some(ANN)).towns.iter().find(|r| usize::from(r.id) == id).map(|r| (r.online, r.bot)).unwrap();
    assert_eq!(row(&w, a), (true, false));
    for i in 0..rules::ONLINE_WATCHES as u64 + 2 {
        w.step(&entropy(600 + i));
    }
    assert_eq!(row(&w, a), (false, false), "gone quiet");
    act(&mut w, ANN, Action::Say { phrase: 0, to: None }).unwrap();
    assert_eq!(row(&w, a), (true, false), "back again");
    let rival = w.towns.iter().position(|t| t.bot).unwrap();
    assert_eq!(row(&w, rival).0, false, "the game's own towns are never shown as online");
}

#[test]
fn online_follows_the_real_clock_even_when_the_game_is_paused() {
    let mut w = world(15);
    let (a, _) = (open(&mut w, ANN), open(&mut w, BEN));
    w.note_seen_at(ANN, 1_000_000);
    let online = |w: &World, now: u32| w.view_at(Some(BEN), Some(now)).towns.iter().find(|r| usize::from(r.id) == a).unwrap().online;
    assert!(online(&w, 1_000_000 + rules::ONLINE_SECONDS), "still around");
    assert!(!online(&w, 1_000_000 + rules::ONLINE_SECONDS + 1), "gone, though no watch has passed");
    let rival = w.towns.iter().position(|t| t.bot).unwrap();
    let row = w.view_at(Some(BEN), Some(1_000_000)).towns.iter().find(|r| usize::from(r.id) == rival).map(|r| r.online).unwrap();
    assert!(!row, "the game's own towns are never online");
}

#[test]
fn friends_and_talk_survive_into_the_next_season() {
    let mut w = world(10);
    let (_, b) = (open(&mut w, ANN), open(&mut w, BEN));
    act(&mut w, ANN, Action::Say { phrase: 0, to: None }).unwrap();
    w.start_next_season();
    let a2 = w.town_of(ANN).unwrap();
    assert_eq!(w.towns[a2].help_ready, 0);
    act(&mut w, ANN, Action::HelpTown { town: b as u16 }).unwrap();
    assert!(!w.chat.is_empty());
    w.audit().unwrap();
}
