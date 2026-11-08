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
);

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
export type Role = { kind: "shop" } | { kind: "captain"; captain: number };

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
