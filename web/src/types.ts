// The JSON the engine sends. The same shape comes from the browser build and the contract.

export type CaptainState =
  | { state: "at_port"; port: number; ready_at: number }
  | { state: "seeking"; slip: number }
  | { state: "sailing"; voyage: number }
  | { state: "ashore"; port: number }
  | { state: "laid_up"; port: number; since: number };

export interface Lane {
  id: number;
  name: string;
  port: number;
  sea: number;
  live_report: boolean;
  danger_bps: number;
  watches: number;
  /** The waves right now, 0 to 100. */
  swell: number;
}

export interface Good {
  good: number;
  name: string;
  price: number;
  usual: number;
  stock: number;
  target: number;
}

export interface Port {
  id: number;
  name: string;
  makes: string;
  goods: Good[];
}

export interface Captain {
  id: number;
  account: string;
  name: string;
  ship: string;
  capacity: number;
  cash: number;
  state: CaptainState;
  hull_word: string;
  rumour: string;
  voyages: number;
  losses: number;
  frauds: number;
  bond_owed: number;
  /** The name of the real person steering this ship, if there is one. */
  player: string | null;
  start_cash: number;
}

export type HouseKind = { room: number } | "entrant" | "player" | "agent";

export interface House {
  id: number;
  account: string;
  name: string;
  kind: HouseKind;
  active: boolean;
  you: boolean;
  capital: number;
  reputation: number;
  fear: number;
  net_book: number;
  net_by_lane: number[];
  premiums: number;
  claims: number;
  ceded: number;
  assumed: number;
  recovered: number;
  lines: number;
  wrecks: number;
  clerk: boolean;
  refounded: boolean;
}

export interface Reason {
  code: string;
  value: number;
}

export interface QuoteV {
  house: number;
  rate_bps: number;
  line_bps: number;
}

export interface Slip {
  id: number;
  captain: number;
  lane: number;
  outbound: boolean;
  from: number;
  to: number;
  good: number;
  good_name: string;
  qty: number;
  sum_insured: number;
  offer_bps: number;
  opened: number;
  closes: number;
  retried: boolean;
  steered: boolean;
  risk_low_bps: number;
  risk_high_bps: number;
  storm_bps: number;
  surveyed: number | null;
  reasons: Reason[];
  quotes: QuoteV[];
}

export interface Voyage {
  id: number;
  captain: number;
  lane: number;
  outbound: boolean;
  good_name: string;
  qty: number;
  sum_insured: number;
  covered_bps: number;
  sailed: number;
  arrives: number;
}

export interface Position {
  id: number;
  voyage: number;
  lane: number;
  writer: number;
  token: string;
  owed_to: number | null;
  sum: number;
  ceded: number;
  rate_bps: number;
  parent: number | null;
  lay_off_hint_bps: number;
}

export interface Offer {
  id: number;
  house: number;
  position: number;
  lane: number;
  voyage: number;
  share_bps: number;
  sum: number;
  rate_bps: number;
  premium: number;
  expires: number;
}

export interface Claim {
  id: number;
  voyage: number;
  captain: number;
  lane: number;
  sum: number;
  lost_at: number;
  due: number;
  suspicion: number;
  inquired: boolean;
}

export interface Storm {
  id: number;
  lanes: number[];
  strength_bps: number;
  starts: number;
  ends: number;
  great: boolean;
}

export interface Market {
  rate_bps: number;
  price_index: number;
  room_capital: number;
  at_sea: number;
  laid_up: number;
  guild_cash: number;
  crown_supply: string;
}

export interface DayStat {
  day: number;
  rate_bps: number;
  price_index: number;
  room_capital: number;
  at_sea: number;
  laid_up: number;
  houses: number;
  premiums: number;
  claims: number;
}

export interface HallEntry {
  season: number;
  house: string;
  capital: number;
  kind: HouseKind;
}

export type GameEvent = { seq: number; watch: number } & (
  | { type: "slip_opened"; slip: number; captain: number }
  | { type: "bound"; voyage: number; captain: number; covered_bps: number; avg_rate_bps: number }
  | { type: "sailed_bare"; voyage: number; captain: number }
  | { type: "withdrew"; captain: number }
  | { type: "home"; voyage: number; captain: number; profit: number; port: number }
  | { type: "wrecked"; voyage: number; captain: number; lane: number; sum: number; storm: boolean }
  | { type: "claim_due"; claim: number; captain: number; sum: number; suspicion: number }
  | { type: "claim_paid"; claim: number; captain: number; sum: number; paid: number }
  | { type: "house_failed"; house: number; owed: number; paid: number; victims: number }
  | { type: "founded"; house: number }
  | { type: "laid_up"; captain: number }
  | { type: "refitted"; captain: number; house: number }
  | { type: "glass"; storm: number; lanes: number; great: boolean; starts: number }
  | { type: "storm_hit"; storm: number; lanes: number; great: boolean }
  | { type: "ceded"; from: number; to: number; position: number; sum: number; rate_bps: number }
  | { type: "fraud"; claim: number; captain: number; house: number; reward: number }
  | { type: "honest_loss"; claim: number; captain: number; house: number }
  | { type: "season_end"; season: number }
  | { type: "helm_taken"; captain: number }
  | { type: "helm_left"; captain: number }
  | { type: "trip_home"; town: number; ship: number; coins: number; chest: number; streak: number }
  | { type: "trip_back"; town: number; ship: number; coins: number }
  | { type: "trip_lost"; town: number; ship: number; lane: number; paid: number }
  | { type: "raided"; town: number; ship: number; by: number; coins: number }
  | { type: "raid_failed"; town: number; ship: number; by: number }
  | { type: "pirates_won"; town: number; ship: number }
  | { type: "pirates_beaten"; town: number; ship: number }
  | { type: "festival_prize"; town: number; place: number; coins: number; season: number }
  | { type: "helped"; town: number; by: number; coins: number }
  | { type: "gift"; town: number; by: number; coins: number }
  | { type: "trip_covered"; town: number; ship: number; by: number; fee: number }
  | { type: "cover_paid"; town: number; to: number; coins: number }
);

export interface ChatLine {
  id: number;
  watch: number;
  town: number;
  name: string;
  bot: boolean;
  you: boolean;
  text: string;
  /** The player's own words, not one of the set phrases. */
  typed: boolean;
  to: number | null;
  to_name: string | null;
  to_you: boolean;
}

export type SurpriseKind = "crate" | "pirates" | "shortcut";

export interface TownTrip {
  lane: number;
  to: number;
  sailed: number;
  arrives: number;
  full: number;
  now: number;
  cover: number;
  danger_bps: number;
  swell: number;
  storm_in: number | null;
  surprise: SurpriseKind | null;
  surprise_answered: boolean;
  /** Another real player sailing this route, which makes it safer. */
  convoy: string | null;
  /** Whose pirates are on their way to this ship. */
  raid_from: string | null;
  /** Who pays out if this ship is lost. */
  insurer: string | null;
}

export interface Route {
  lane: number;
  to: number;
  good_name: string;
  full: number;
  cost: number;
  market_pct: number;
  risk_bps: number;
  storm: boolean;
  watches: number;
  locked_until: number;
  protect_fee: number | null;
  cover: number;
  convoy: string | null;
}

export interface OwnedShip {
  id: number;
  token: string;
  class: number;
  name: string;
  cargo_units: number;
  hull: number;
  levels: [number, number, number];
  damaged: boolean;
  ready_in: number;
  repair_cost: number;
  upgrade_costs: [number, number, number];
  trip: TownTrip | null;
  routes: Route[];
}

export interface TownInfo {
  id: number;
  name: string;
  coins: number;
  level: number;
  xp_into: number;
  xp_need: number;
  streak: number;
  streak_bonus: number;
  best_streak: number;
  ships: OwnedShip[];
  buildings: number[];
  building_costs: number[];
  crew: number[];
  crew_costs: number[];
  crew_room: number;
  ship_room: number;
  income: number;
  waiting: number;
  store: number;
  net_worth: number;
  earned: number;
  wrecks: number;
  raid_in: number;
  help_in: number;
  gift_in: number;
  help_coins: number;
}

export interface TownRow {
  id: number;
  name: string;
  bot: boolean;
  you: boolean;
  level: number;
  net_worth: number;
  ships: number;
  /** A real player who has done something in the last little while. */
  online: boolean;
  buildings: number[];
}

export interface FleetShip {
  town: number;
  town_name: string;
  mine: boolean;
  bot: boolean;
  ship: number;
  class: number;
  lane: number;
  sailed: number;
  arrives: number;
  raided: boolean;
}

export interface CatalogItem {
  name: string;
  cost: number;
  level: number;
  income: number;
  max: number;
  cargo: number;
  hull: number;
}

export interface Catalog {
  ships: CatalogItem[];
  buildings: CatalogItem[];
  crew: CatalogItem[];
  raid_cost: number;
  gift_max: number;
  phrases: string[];
}

/** One trip a player at the wheel could make from where the ship is now. */
export interface Trip {
  lane: number;
  to: number;
  good: number;
  good_name: string;
  qty: number;
  cost: number;
  revenue: number;
  provisions: number;
  sum_insured: number;
  fair_offer_bps: number;
  risk_bps: number;
  storm: boolean;
  watches: number;
}

export interface Helm {
  captain: number;
  start_cash: number;
  trips: Trip[];
  can_sail: boolean;
  ready: boolean;
}

/** Who a player has chosen to be. */
export type Role = { kind: "town" } | { kind: "shop" } | { kind: "captain"; captain: number };

export interface View {
  season: number;
  watch: number;
  watches_per_day: number;
  season_watches: number;
  watch_ms: number;
  sandbox: boolean;
  intermission: number | null;
  seq: number;
  lanes: Lane[];
  ports: Port[];
  captains: Captain[];
  houses: House[];
  slips: Slip[];
  voyages: Voyage[];
  positions: Position[];
  offers: Offer[];
  claims: Claim[];
  storms: Storm[];
  market: Market;
  history: DayStat[];
  hall: HallEntry[];
  events: GameEvent[];
  fees: {
    survey: number;
    inquiry: number;
    refit: number;
    reckoning_watches: number;
    max_gearing: number;
  };
  helm: Helm | null;
  town: TownInfo | null;
  towns: TownRow[];
  fleet: FleetShip[];
  catalog: Catalog;
  chat: ChatLine[];
}

export type Action =
  | { kind: "found_house"; name: string; agent?: boolean }
  | { kind: "quote"; slip: number; rate_bps: number; line_bps: number }
  | { kind: "survey"; slip: number }
  | { kind: "offer_cession"; position: number; share_bps: number; rate_bps: number }
  | { kind: "take_cession"; offer: number }
  | { kind: "inquiry"; claim: number }
  | { kind: "refit"; captain: number }
  | { kind: "take_helm"; name: string; captain: number }
  | { kind: "leave_helm" }
  | { kind: "plan_trip"; lane: number; offer_bps: number }
  | { kind: "cancel_trip" }
  | { kind: "sail_now" }
  | { kind: "scuttle" }
  | { kind: "open_town"; name: string }
  | { kind: "send_ship"; ship: number; lane: number; protect: boolean }
  | { kind: "come_home"; ship: number }
  | { kind: "answer_surprise"; ship: number; yes: boolean }
  | { kind: "collect_town" }
  | { kind: "build"; building: number }
  | { kind: "hire"; crew: number }
  | { kind: "buy_ship"; class: number }
  | { kind: "upgrade_ship"; ship: number; part: number }
  | { kind: "repair_ship"; ship: number }
  | { kind: "raid"; town: number; ship: number }
  | { kind: "help_town"; town: number }
  | { kind: "send_gift"; town: number; coins: number }
  | { kind: "say"; phrase: number; to: number | null }
  | { kind: "say_text"; text: string; to: number | null }
  | { kind: "set_clerk"; on: boolean }
  | { kind: "summon_storm" }
  | { kind: "next_season" };

export type Receipt =
  | { result: "done" }
  | { result: "founded"; capital: number }
  | { result: "surveyed"; hull: number };

export interface Driver {
  readonly mode: "practice" | "live";
  subscribe(listener: (view: View) => void): () => void;
  act(action: Action): Promise<Receipt>;
  /** Time the current watch began, for smooth animation between watches. */
  watchStartedAt(): number;
  /** Length of the current watch in milliseconds, or 0 when paused. */
  watchLength(): number;
  stop(): void;
}
