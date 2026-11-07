// Who everyone is, and the simple words they use.
// The engine and the contract keep their own names. This is the friendly face.

export interface Cast {
  name: string;
  animal: string;
  hello: string;
  thanks: string;
  sad: string;
  worried: string;
}

export const CAST: Cast[] = [
  { name: "Ada", animal: "Otter", hello: "Please keep my ship safe!", thanks: "We made it! Thank you!", sad: "My poor ship!", worried: "I don't like those clouds." },
  { name: "Bram", animal: "Bear", hello: "Will you look after my boat?", thanks: "Home again! Thanks, friend!", sad: "Oh, my boat...", worried: "Is it getting windy?" },
  { name: "Nell", animal: "Fox", hello: "Protect my ship. You won't be sorry.", thanks: "Told you I'd make it!", sad: "That wasn't my fault!", worried: "Don't look at me like that." },
  { name: "Ishaan", animal: "Owl", hello: "I have checked the map. Will you protect me?", thanks: "Just as I worked out!", sad: "I did not plan for that.", worried: "My maths says trouble." },
  { name: "Margot", animal: "Cat", hello: "Keep me safe, and I'll pay you well!", thanks: "Purrfect trip!", sad: "I hate getting wet!", worried: "I don't like water." },
  { name: "Tomas", animal: "Turtle", hello: "Slow and careful. Will you protect me?", thanks: "Slow and safe!", sad: "Oh dear, oh dear.", worried: "Let's be careful." },
  { name: "Yara", animal: "Seal", hello: "I love big waves! Will you protect me?", thanks: "What a ride!", sad: "Too big a wave!", worried: "Waves are getting big!" },
  { name: "Old Pike", animal: "Walrus", hello: "My old ship needs protecting.", thanks: "Still floating, heh heh!", sad: "She was a good old ship.", worried: "These old bones feel a storm." },
  { name: "Lin", animal: "Penguin", hello: "Would you protect my ship, please?", thanks: "Thank you very much!", sad: "That was not on the plan.", worried: "Please be careful." },
  { name: "Esi", animal: "Duck", hello: "Quack! Protect my ship?", thanks: "Quack quack, hooray!", sad: "Quack... my ship...", worried: "Quack! Storm?" },
  { name: "Corin", animal: "Raccoon", hello: "Sorry to ask. Can you protect me?", thanks: "Oh! I got home!", sad: "It just... sank. Honest!", worried: "Sorry, is that a storm?" },
  { name: "Dov", animal: "Dog", hello: "Woof! Keep my ship safe?", thanks: "Woof! We're home!", sad: "Awoooo...", worried: "Woof? Dark clouds!" },
];

export const fullName = (captain: number) => {
  const c = CAST[captain % CAST.length];
  return `${c.name} the ${c.animal}`;
};

/** The islands, named for what they make so a child can follow the trade. */
export const PLACES: Record<string, string> = {
  Merrow: "Merrow Town",
  Saltmarch: "Wheat Island",
  Greywater: "Timber Island",
  "Cinder Isles": "Iron Volcano",
  "Lantern Keys": "Spice Island",
  "Old Aurum": "Silk Palace",
};

export const place = (name: string) => PLACES[name] ?? name;

const SHOPS: Record<string, string> = {
  "Widow Marchetti & Daughters": "Mama Magpie's Shop",
  "Brisk & Sons": "Brisk Badger's Shop",
  "The Salt Mutual": "Salty Seagull's Shop",
  "Harrow & Vane": "Harry Heron's Shop",
  "Okonkwo Re": "Big Bison's Shop",
  "The Lantern Syndicate": "Lantern Lizard's Shop",
  "Fairweather & Co": "Sunny Squirrel's Shop",
  "The Aurelian Trust": "Golden Goat's Shop",
  "Pike Street Assurance": "Penny Pelican's Shop",
  "Quayside Mutual": "Quayside Crab's Shop",
  "Ostrander & Lowe": "Ollie Ostrich's Shop",
  "The New Merchants' Room": "New Shop",
};

export const shopName = (name: string) => SHOPS[name] ?? name;

const LANES: Record<string, string> = {
  "The Salt Road": "Wheat Island route",
  "Greywater Run": "Timber Island route",
  "Cinder Passage": "Iron Volcano route",
  "Lantern Deeps": "Spice Island route",
  "The Aurum Cape": "Silk Palace route",
};

export const laneName = (name: string) => LANES[name] ?? name;

const CARGO: Record<string, string> = {
  grain: "sacks of wheat",
  timber: "logs",
  iron: "bars of iron",
  spice: "bags of spice",
  silk: "rolls of silk",
  wares: "boxes",
};

export const cargo = (qty: number, good: string) => `${qty} ${CARGO[good] ?? good}`;
