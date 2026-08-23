// Card pool for the MVP.
//
// NOTE ON DATA SOURCE: there's no official free public API for Cardfight!! Vanguard
// card data — Bushiroad doesn't publish one. The options are (a) fan-scraped
// datasets/APIs of varying reliability, or (b) original placeholder cards that
// follow the real game's stat conventions (power/shield/grade/trigger curve).
// This file uses (b) so the engine has something legal and stable to run against.
// Swapping in a real dataset later is just a matter of replacing this file —
// the engine doesn't care about card names, only the stat fields below.

let _id = 0;
const nextId = () => `c${++_id}`;

function card({ name, clan, grade, power, shield, critical = 1, trigger = null, skill = null }) {
  return { id: nextId(), name, clan, grade, power, shield, critical, trigger, skill };
}

// ---------- Clan A: Radiant Sword ----------
const A_START   = card({ name: 'Radiant Sword, Aldric',      clan: 'Radiant Sword', grade: 0, power: 6000, shield: 0,     trigger: null });
const A_CRIT    = card({ name: 'Sword Page',                  clan: 'Radiant Sword', grade: 0, power: 4000, shield: 10000, trigger: { type: 'critical', power: 5000 } });
const A_DRAW    = card({ name: 'Sword Scholar',               clan: 'Radiant Sword', grade: 0, power: 4000, shield: 10000, trigger: { type: 'draw', power: 5000 } });
const A_HEAL    = card({ name: 'Sword Cleric',                clan: 'Radiant Sword', grade: 0, power: 4000, shield: 10000, trigger: { type: 'heal', power: 5000 } });
const A_G1_A    = card({ name: 'Radiant Lancer',              clan: 'Radiant Sword', grade: 1, power: 7000, shield: 10000 });
const A_G1_B    = card({ name: 'Radiant Shieldbearer',        clan: 'Radiant Sword', grade: 1, power: 6000, shield: 15000 });
const A_G1_C    = card({ name: 'Radiant Squire',               clan: 'Radiant Sword', grade: 1, power: 7000, shield: 10000,
  skill: { on: 'ride', effect: 'draw1' } }); // example scripted effect
const A_G2_A    = card({ name: 'Radiant Knight-Captain',      clan: 'Radiant Sword', grade: 2, power: 9000, shield: 10000 });
const A_G2_B    = card({ name: 'Radiant Falconer',            clan: 'Radiant Sword', grade: 2, power: 10000, shield: 5000 });
const A_G3_A    = card({ name: 'Radiant Sword, Aldric the Just', clan: 'Radiant Sword', grade: 3, power: 11000, shield: 0 });
const A_G3_B    = card({ name: 'Radiant Paragon',             clan: 'Radiant Sword', grade: 3, power: 11000, shield: 0,
  skill: { on: 'attack', effect: 'powerUpSelf', amount: 2000, condition: 'vanguardOnly' } });

const A_POOL = [A_START, A_CRIT, A_DRAW, A_HEAL, A_G1_A, A_G1_B, A_G1_C, A_G2_A, A_G2_B, A_G3_A, A_G3_B];

const A_DECKLIST = [
  { card: A_START, qty: 4 },
  { card: A_CRIT,  qty: 4 },
  { card: A_DRAW,  qty: 4 },
  { card: A_HEAL,  qty: 4 },
  { card: A_G1_A,  qty: 4 },
  { card: A_G1_B,  qty: 4 },
  { card: A_G1_C,  qty: 6 > 4 ? 4 : 4 }, // 4
  { card: A_G2_A,  qty: 4 },
  { card: A_G2_B,  qty: 4 },
  { card: A_G3_A,  qty: 4 },
  { card: A_G3_B,  qty: 4 },
];
// 4*11 = 44, pad with 6 more G1_A-style filler to reach 50
const A_FILLER = card({ name: 'Radiant Recruit', clan: 'Radiant Sword', grade: 1, power: 7000, shield: 10000 });
A_DECKLIST.push({ card: A_FILLER, qty: 6 });

// ---------- Clan B: Ashen Fang ----------
const B_START   = card({ name: 'Ashen Fang, Drakaros',        clan: 'Ashen Fang', grade: 0, power: 6000, shield: 0,     trigger: null });
const B_CRIT    = card({ name: 'Fang Whelp',                  clan: 'Ashen Fang', grade: 0, power: 4000, shield: 10000, trigger: { type: 'critical', power: 5000 } });
const B_DRAW    = card({ name: 'Fang Seer',                   clan: 'Ashen Fang', grade: 0, power: 4000, shield: 10000, trigger: { type: 'draw', power: 5000 } });
const B_HEAL    = card({ name: 'Fang Shaman',                 clan: 'Ashen Fang', grade: 0, power: 4000, shield: 10000, trigger: { type: 'heal', power: 5000 } });
const B_G1_A    = card({ name: 'Ashen Skirmisher',            clan: 'Ashen Fang', grade: 1, power: 7000, shield: 10000 });
const B_G1_B    = card({ name: 'Ashen Bonecaller',            clan: 'Ashen Fang', grade: 1, power: 6000, shield: 15000 });
const B_G1_C    = card({ name: 'Ashen Cinderling',            clan: 'Ashen Fang', grade: 1, power: 7000, shield: 10000,
  skill: { on: 'ride', effect: 'draw1' } });
const B_G2_A    = card({ name: 'Ashen Warlord',               clan: 'Ashen Fang', grade: 2, power: 9000, shield: 10000 });
const B_G2_B    = card({ name: 'Ashen Firewing',              clan: 'Ashen Fang', grade: 2, power: 10000, shield: 5000 });
const B_G3_A    = card({ name: 'Ashen Fang, Drakaros Unbound', clan: 'Ashen Fang', grade: 3, power: 11000, shield: 0 });
const B_G3_B    = card({ name: 'Ashen Ravager',               clan: 'Ashen Fang', grade: 3, power: 11000, shield: 0,
  skill: { on: 'attack', effect: 'powerUpSelf', amount: 2000, condition: 'vanguardOnly' } });

const B_POOL = [B_START, B_CRIT, B_DRAW, B_HEAL, B_G1_A, B_G1_B, B_G1_C, B_G2_A, B_G2_B, B_G3_A, B_G3_B];

const B_DECKLIST = [
  { card: B_START, qty: 4 },
  { card: B_CRIT,  qty: 4 },
  { card: B_DRAW,  qty: 4 },
  { card: B_HEAL,  qty: 4 },
  { card: B_G1_A,  qty: 4 },
  { card: B_G1_B,  qty: 4 },
  { card: B_G1_C,  qty: 4 },
  { card: B_G2_A,  qty: 4 },
  { card: B_G2_B,  qty: 4 },
  { card: B_G3_A,  qty: 4 },
  { card: B_G3_B,  qty: 4 },
];
const B_FILLER = card({ name: 'Ashen Recruit', clan: 'Ashen Fang', grade: 1, power: 7000, shield: 10000 });
B_DECKLIST.push({ card: B_FILLER, qty: 6 });

function buildDeck(decklist) {
  const deck = [];
  for (const { card: c, qty } of decklist) {
    for (let i = 0; i < qty; i++) {
      // clone with a unique instance id so duplicates are distinguishable in play
      deck.push({ ...c, instanceId: `${c.id}-${i}-${Math.random().toString(36).slice(2, 7)}` });
    }
  }
  return deck;
}

module.exports = {
  buildDeckA: () => buildDeck(A_DECKLIST),
  buildDeckB: () => buildDeck(B_DECKLIST),
  startCardA: A_START,
  startCardB: B_START,
};
