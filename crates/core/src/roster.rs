//! The people of the harbor. Their temperament is fixed here; what happens to
//! them is decided by the economy.

pub struct CaptainDef {
    pub name: &'static str,
    pub slug: &'static str,
    pub ship: &'static str,
    /// Cargo the ship carries.
    pub capacity: u32,
    /// 0 = free with money, 100 = counts every coin.
    pub thrift: u8,
    /// 0 = stays in port at the first cloud, 100 = sails into anything.
    pub nerve: u8,
    /// 0 = honest to a fault, 100 = would sink their own mother's ship.
    pub shady: u8,
    /// Where the captain starts.
    pub home_lane: usize,
    pub cash: u64,
    pub hull: u8,
}

pub const CAPTAIN_COUNT: usize = 12;

pub const CAPTAINS: [CaptainDef; CAPTAIN_COUNT] = [
    CaptainDef { name: "Ada Quill", slug: "ada-quill", ship: "The Patient Margaret", capacity: 70, thrift: 40, nerve: 30, shady: 8, home_lane: 0, cash: 1_900, hull: 88 },
    CaptainDef { name: "Bram Okafor", slug: "bram-okafor", ship: "Second Thoughts", capacity: 90, thrift: 55, nerve: 45, shady: 15, home_lane: 1, cash: 2_300, hull: 76 },
    CaptainDef { name: "Nell Tarrant", slug: "nell-tarrant", ship: "The Unpaid Debt", capacity: 60, thrift: 70, nerve: 70, shady: 62, home_lane: 2, cash: 1_100, hull: 58 },
    CaptainDef { name: "Ishaan Vey", slug: "ishaan-vey", ship: "Monsoon Clerk", capacity: 80, thrift: 35, nerve: 40, shady: 12, home_lane: 3, cash: 2_500, hull: 84 },
    CaptainDef { name: "Marguerite Sol", slug: "marguerite-sol", ship: "La Belle Excuse", capacity: 75, thrift: 25, nerve: 60, shady: 30, home_lane: 4, cash: 2_800, hull: 72 },
    CaptainDef { name: "Tomas Reed", slug: "tomas-reed", ship: "The Honest Mistake", capacity: 55, thrift: 80, nerve: 25, shady: 5, home_lane: 0, cash: 1_500, hull: 66 },
    CaptainDef { name: "Yara Ben-Hadid", slug: "yara-ben-hadid", ship: "Fortune's Lodger", capacity: 95, thrift: 45, nerve: 80, shady: 25, home_lane: 3, cash: 3_000, hull: 80 },
    CaptainDef { name: "Old Pike", slug: "old-pike", ship: "The Last Good Idea", capacity: 50, thrift: 85, nerve: 90, shady: 78, home_lane: 1, cash: 800, hull: 44 },
    CaptainDef { name: "Lin Qiao", slug: "lin-qiao", ship: "Quiet Arithmetic", capacity: 85, thrift: 60, nerve: 20, shady: 6, home_lane: 4, cash: 2_600, hull: 92 },
    CaptainDef { name: "Esi Mensah", slug: "esi-mensah", ship: "Tomorrow's Weather", capacity: 65, thrift: 30, nerve: 55, shady: 18, home_lane: 2, cash: 1_800, hull: 74 },
    CaptainDef { name: "Corin Ash", slug: "corin-ash", ship: "The Slow Apology", capacity: 60, thrift: 65, nerve: 75, shady: 55, home_lane: 0, cash: 1_000, hull: 54 },
    CaptainDef { name: "Dov Harrow", slug: "dov-harrow", ship: "Plain Dealing", capacity: 100, thrift: 50, nerve: 35, shady: 20, home_lane: 3, cash: 3_200, hull: 78 },
];
