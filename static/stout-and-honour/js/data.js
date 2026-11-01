'use strict';
/* =====================================================================
   STOUT & HONOUR — data.js
   Looks, movesets, enemy archetypes, the story ladder and the script.
   Tweak numbers here to rebalance the game.
   ===================================================================== */

/* ------------------------------------------------------------ difficulty */
const DIFFS = [
  { name: 'Shandy', blurb: 'Gentle. Telegraphs are slow, hits are soft.', dmg: 0.62, hp: 0.85, tele: 1.28, tokens: 1, block: 0.45, cd: 1.3, parry: 0.24, craic: 1.2, gift: 0.75 },
  { name: 'Pint of Plain', blurb: 'The way the parish intended.', dmg: 1.0, hp: 1.0, tele: 1.0, tokens: 2, block: 1.0, cd: 1.0, parry: 0.18, craic: 1.0, gift: 1.0 },
  { name: 'Poitín', blurb: 'Rough stuff. Fast lads. No mercy.', dmg: 1.35, hp: 1.2, tele: 0.84, tokens: 3, block: 1.4, cd: 0.78, parry: 0.14, craic: 0.9, gift: 1.3 },
];
const DIFF = () => DIFFS[clamp((Store.data && Store.data.settings.difficulty) | 0, 0, 2)];

/* ------------------------------------------------------------------ looks */
const SKINS = ['#f2c9a6', '#eab38d', '#e3a47f', '#f6d5bd', '#cf9068', '#a86c48', '#8a5636'];
const HAIRS = ['#2a1a10', '#4a2c17', '#6e4022', '#b5652a', '#d9b46a', '#16110d', '#8a8070'];

const LOOKS = {
  mike: () => ({ skin: '#eec5a5', hair: '#5d3c22', hairStyle: 'mop', beard: 'stubble', dirt: true, shades: true, shirt: '#f2efe8', sleeves: 'short', frayed: true, tunic: '#f2efe8', armor: { plate: '#1d1d21', trim: '#c9ccd3' }, pauldrons: true, pteruges: true, bracers: true, greaves: true, pants: '#eec5a5', shoes: '#18181c', weapon: 'hurley', shield: 'bodhran', build: 0.98 }),
  marcus: () => ({ skin: '#efc9a8', hair: '#e2e2e2', hairStyle: 'sides', beard: 'full', beardColor: '#e6e6e6', shirt: '#f1ebdc', waistcoat: '#2c4a3a', sleeves: 'long', pants: '#2a2622', shoes: '#3a2416', build: 1.02, belly: 0.25, towel: true }),
  proximo: () => ({ skin: '#d9a07a', hair: '#3a2a1e', hairStyle: 'bald', beard: 'full', beardColor: '#7a6a58', shirt: '#ece2cc', apron: '#26221f', sleeves: 'rolled', pants: '#2b2b33', shoes: '#2a1a10', build: 1.12, belly: 0.4, towel: true }),
  cassius: () => ({ skin: '#edc4a2', hair: '#2a1a10', hairStyle: 'slick', shirt: '#f4f1e8', jacket: '#7a1f2e', bowtie: '#e2b23a', sleeves: 'long', pants: '#1c1c22', shoes: '#111', build: 0.95, glasses: true, mic: true }),
  commodus: () => ({ skin: '#f2d0b5', hair: '#33241a', hairStyle: 'slick', hat: 'wreath', shirt: '#f4f1e8', waistcoat: '#5b2a86', sleeves: 'long', pants: '#1c1c22', shoes: '#5a3a1e', weapon: 'shillelagh', chain: true, towel: true, build: 1.05, belly: 0.12 }),
  tigris: () => ({ skin: '#e6ad8a', hair: '#3a2416', hairStyle: 'short', beard: 'full', beardColor: '#5a3a22', hat: 'helmet', hatColor: '#d9861c', hatStripe: '#1a1a1a', cage: true, shirt: '#7a1430', trim: '#f4f4f4', pattern: 'hoops', sleeves: 'short', shorts: true, pants: '#f4f4f4', socks: '#7a1430', sockTrim: '#f4f4f4', shoes: '#111', weapon: 'hurley2', build: 1.3 }),
  stag: () => ({ skin: pick(SKINS), hair: pick(HAIRS), hairStyle: pick(['short', 'spiky', 'curly', 'short']), beard: chance(0.35) ? 'stubble' : null, hat: chance(0.6) ? 'viking' : null, shirt: pick(['#ff6fae', '#ff6fae', '#ff8fbe']), pattern: 'text', text: chance(0.2) ? 'GROOM' : 'STAG', sleeves: 'short', pants: pick(['#2f4a7a', '#34507f', '#28395c']), shoes: '#efefef', weapon: 'fists', build: rand(0.95, 1.08) }),
  rugby: () => ({ skin: pick(SKINS.slice(0, 5)), hair: pick(['#d9b46a', '#6e4022', '#2a1a10']), hairStyle: 'slick', shirt: pick(['#1d2d5a', '#7a1222']), trim: pick(['#8fc0ea', '#f2f2f2']), pattern: 'hoops', collar: '#f4f4f4', sleeves: 'short', pants: '#c9b48a', shoes: '#6a4426', weapon: 'fists', build: 1.18 }),
  bouncer: () => ({ skin: pick(SKINS), hair: '#16110d', hairStyle: 'bald', beard: chance(0.5) ? 'stubble' : null, shirt: '#151515', jacket: '#141414', sleeves: 'long', pants: '#141414', shoes: '#0d0d0d', earpiece: true, weapon: 'fists', build: 1.38 }),
  darts: () => ({ skin: pick(SKINS), hair: pick(HAIRS), hairStyle: 'mullet', shirt: pick(['#f5a623', '#2fb3c7', '#e8e032']), pattern: 'panel', trim: '#151515', sleeves: 'short', pants: '#2a2a2a', shoes: '#efefef', chain: true, weapon: 'darts', build: 1.14, belly: 0.75 }),
  hustler: () => ({ skin: pick(SKINS), hair: pick(['#16110d', '#2a1a10']), hairStyle: 'slick', shirt: '#f4f1e8', waistcoat: '#151515', bowtie: '#b0182c', sleeves: 'long', pants: '#151515', shoes: '#0d0d0d', weapon: 'cue', build: 0.98 }),
  farmer: () => ({ skin: '#e7a98a', cheeks: true, hair: pick(['#b5652a', '#8a8070', '#4a2c17']), hairStyle: 'short', hat: 'cap', hatColor: '#6b5a3a', shirt: '#8a8a6a', jacket: '#4a4a2a', sleeves: 'long', pants: '#3e3a2e', shoes: '#2f5a2f', wellies: true, weapon: 'turf', build: 1.1, belly: 0.3 }),
  punter: () => {
    const kind = Math.random();
    const base = { skin: pick(SKINS), hair: pick(HAIRS), hairStyle: pick(['short', 'curly', 'slick', 'bald', 'sides', 'short']), beard: chance(0.3) ? pick(['stubble', 'full', 'mustache']) : null, sleeves: 'long', pants: pick(['#2a2a33', '#3a3226', '#2f4a7a']), shoes: '#1a1a1a', build: rand(0.92, 1.15), belly: chance(0.4) ? rand(0.2, 0.7) : 0 };
    if (kind < 0.3) return Object.assign(base, { shirt: pick(['#1c7a3e', '#7a1430', '#1d2d5a', '#d9861c', '#2c6fb7']), trim: pick(['#f2c230', '#f4f4f4', '#151515']), pattern: 'hoops', sleeves: 'short' });
    if (kind < 0.55) return Object.assign(base, { shirt: pick(['#6b4a3a', '#4a5a3a', '#7a6a5a', '#3a4a5a']), jacket: pick(['#5a4632', '#3e4a32', '#4a3a2e']) });
    if (kind < 0.75) return Object.assign(base, { shirt: pick(['#c9b48a', '#9a3a2a', '#2a4a6a', '#e8e0cc']), hat: chance(0.5) ? 'cap' : null, hatColor: pick(['#6b5a3a', '#4a4a4a', '#5a4632']) });
    return Object.assign(base, { shirt: pick(['#e8e0cc', '#9fb8cc', '#c9a0a0', '#a0c9a8']), sleeves: 'short' });
  },
};

/* ------------------------------------------------------------------ moves
   Times are seconds. startup = the telegraph, active = when it can hit,
   recovery = how long the attacker is open afterwards.
   tele: 'w' blockable (white flash), 'r' unblockable (red), 'y' crisps,
   'p' counter stance (purple).                                          */
const MOVES = {
  // Mike
  p1: { anim: 'jab', startup: 0.075, active: 0.08, recovery: 0.17, range: 94, dmg: 7, hitstun: 0.36, kb: 70, depth: 36, lunge: 120 },
  p2: { anim: 'swipe', startup: 0.085, active: 0.09, recovery: 0.19, range: 102, dmg: 8, hitstun: 0.38, kb: 80, depth: 36, lunge: 130 },
  p3: { anim: 'swing', startup: 0.13, active: 0.1, recovery: 0.3, range: 120, dmg: 13, hitstun: 0.5, kb: 300, depth: 42, lunge: 170, knockdown: true, multi: true, launch: 330, tag: 'combo3' },
  heavy: { anim: 'smash', startup: 0.09, active: 0.12, recovery: 0.38, range: 124, dmg: 16, kb: 360, depth: 48, lunge: 150, knockdown: true, guardBreak: true, multi: true, launch: 360, tag: 'heavy' },

  // the lads
  jab: { anim: 'punch', tele: 'w', startup: 0.42, active: 0.08, recovery: 0.36, range: 78, dmg: 6, hitstun: 0.3, kb: 90, depth: 30, lunge: 90 },
  haymaker: { anim: 'hook', tele: 'r', startup: 0.8, active: 0.1, recovery: 0.6, range: 88, dmg: 12, kb: 260, depth: 34, lunge: 170, unblockable: true, knockdown: true, launch: 300 },
  tackle: { anim: 'tackle', tele: 'r', startup: 0.62, active: 0.42, recovery: 0.62, range: 58, dmg: 13, depth: 30, lunge: 520, unblockable: true, knockdown: true, launch: 280, kb: 320, minDist: 120 },
  bigPunch: { anim: 'punch', tele: 'w', startup: 0.58, active: 0.1, recovery: 0.46, range: 94, dmg: 13, hitstun: 0.42, kb: 200, depth: 34, lunge: 80 },
  shove: { anim: 'shove', tele: 'r', startup: 0.74, active: 0.12, recovery: 0.62, range: 90, dmg: 9, kb: 520, depth: 38, unblockable: true, knockdown: true, launch: 220 },
  dart: { anim: 'throw', tele: 'w', startup: 0.54, active: 0.06, recovery: 0.42, proj: 'dart', dmg: 6, range: 760 },
  slap: { anim: 'punch', tele: 'w', startup: 0.38, active: 0.08, recovery: 0.36, range: 72, dmg: 4, hitstun: 0.25, kb: 70, depth: 30 },
  cuePoke: { anim: 'poke', tele: 'w', startup: 0.48, active: 0.1, recovery: 0.4, range: 150, dmg: 9, hitstun: 0.34, kb: 140, depth: 28, lunge: 60 },
  cueSweep: { anim: 'sweep', tele: 'r', startup: 0.76, active: 0.14, recovery: 0.56, range: 142, dmg: 11, depth: 46, unblockable: true, knockdown: true, launch: 260, kb: 240 },
  turf: { anim: 'lob', tele: 'w', startup: 0.58, active: 0.06, recovery: 0.5, proj: 'turf', dmg: 9, range: 640 },
  welly: { anim: 'kick', tele: 'w', startup: 0.42, active: 0.1, recovery: 0.42, range: 84, dmg: 7, hitstun: 0.3, kb: 160, depth: 30 },

  // Tigris of Galway
  tSwing: { anim: 'swing', tele: 'w', startup: 0.5, active: 0.1, recovery: 0.24, range: 124, dmg: 11, hitstun: 0.38, kb: 150, depth: 42, lunge: 140, chain: 'tSwing2' },
  tSwing2: { anim: 'swingB', tele: 'w', startup: 0.27, active: 0.1, recovery: 0.52, range: 124, dmg: 12, hitstun: 0.42, kb: 230, depth: 42, lunge: 150 },
  tOverhead: { anim: 'overhead', tele: 'r', startup: 0.88, active: 0.12, recovery: 0.75, range: 132, dmg: 22, depth: 50, unblockable: true, knockdown: true, launch: 360, kb: 300, armor: true, shake: 12 },
  tCharge: { anim: 'tackle', tele: 'r', startup: 0.72, active: 0.6, recovery: 0.72, range: 70, dmg: 16, depth: 34, lunge: 660, unblockable: true, knockdown: true, launch: 320, kb: 380, armor: true, minDist: 200 },

  // Commodus
  cJab: { anim: 'stab', tele: 'w', startup: 0.38, active: 0.08, recovery: 0.16, range: 112, dmg: 8, hitstun: 0.3, kb: 90, depth: 34, lunge: 120, chain: 'cJab2' },
  cJab2: { anim: 'swipe', tele: 'w', startup: 0.2, active: 0.08, recovery: 0.16, range: 112, dmg: 8, hitstun: 0.3, kb: 100, depth: 34, lunge: 120, chain: 'cJab3' },
  cJab3: { anim: 'swing', tele: 'w', startup: 0.24, active: 0.1, recovery: 0.52, range: 120, dmg: 10, kb: 260, depth: 38, lunge: 160, knockdown: true, launch: 260 },
  cLunge: { anim: 'stab', tele: 'r', startup: 0.62, active: 0.18, recovery: 0.62, range: 120, dmg: 17, depth: 36, lunge: 580, unblockable: true, knockdown: true, launch: 300, kb: 300, feintable: true },
  cCrisps: { anim: 'throw', tele: 'y', startup: 0.46, active: 0.06, recovery: 0.46, proj: 'crisps', dmg: 4, range: 360, minDist: 140 },
  cCounter: { anim: 'counter', tele: 'p', startup: 1.35, active: 0.01, recovery: 0.45, counter: true },
  cRiposte: { anim: 'swing', startup: 0.07, active: 0.1, recovery: 0.5, range: 140, dmg: 16, kb: 320, depth: 46, lunge: 220, knockdown: true, launch: 320 },

  // the world
  trolley: { dmg: 14, kb: 420, launch: 340, knockdown: true, unblockable: true },
  bite: { dmg: 6, hitstun: 0.36, kb: 90 },
  sambuca: { dmg: 9, kb: 160, launch: 260, knockdown: false },
  mat: { dmg: 2, hitstun: 0, kb: 0 },
};

/* --------------------------------------------------------------- archetypes */
const PLAYER_ARCH = { name: 'Mike Lynch', hp: 100, speed: 255, scale: 1, look: LOOKS.mike };
const ARCH = {
  stag: { name: 'Stag Party Lad', hp: 42, speed: 150, scale: 1, look: LOOKS.stag, moves: { jab: 3, haymaker: 1 }, ai: { ring: 200, block: 0, cd: [0.9, 1.8], drinks: true }, score: 100 },
  rugby: { name: 'Rugby Club Gael', hp: 72, speed: 138, scale: 1.08, look: LOOKS.rugby, moves: { jab: 2, tackle: 1 }, ai: { ring: 240, block: 0.15, cd: [1.1, 2.0], drinks: true }, score: 180 },
  bouncer: { name: 'The Bouncer', hp: 125, speed: 100, scale: 1.16, look: LOOKS.bouncer, moves: { bigPunch: 2, shove: 1 }, ai: { ring: 180, block: 0.62, cd: [1.2, 2.2] }, score: 260 },
  darts: { name: 'The Darts Champion', hp: 46, speed: 132, scale: 1.04, look: LOOKS.darts, moves: { dart: 4, slap: 1 }, ai: { ranged: true, keep: [300, 470], cd: [1.4, 2.4], block: 0 }, score: 160 },
  hustler: { name: 'The Snooker Hustler', hp: 62, speed: 145, scale: 1.02, look: LOOKS.hustler, moves: { cuePoke: 3, cueSweep: 1 }, ai: { ring: 235, block: 0.2, cd: [1.0, 1.9] }, score: 180 },
  farmer: { name: 'The Culchie from the Next Parish', hp: 58, speed: 120, scale: 1.06, look: LOOKS.farmer, moves: { turf: 3, welly: 1 }, ai: { ranged: true, keep: [260, 430], cd: [1.6, 2.6], block: 0.1 }, score: 170 },
  tigris: { name: 'Tigris of Galway', boss: true, hp: 340, speed: 118, scale: 1.24, look: LOOKS.tigris, moves: { tSwing: 3, tOverhead: 2, tCharge: 1 }, ai: { ring: 150, block: 0.25, cd: [0.6, 1.25] }, poise: 34, score: 2000 },
  commodus: { name: "Commodus O'Dowd", boss: true, hp: 300, speed: 168, scale: 1.04, look: LOOKS.commodus, moves: { cJab: 3, cLunge: 2, cCrisps: 1, cCounter: 1 }, ai: { ring: 170, block: 0.35, cd: [0.5, 1.1], feint: 0.4 }, poise: 28, score: 3000 },
};
// Lock-In menu of threats: cost in "trouble points"
const LOCKIN_POOL = [['stag', 1], ['stag', 1], ['rugby', 2], ['hustler', 2], ['darts', 2], ['farmer', 2], ['bouncer', 3]];

/* ------------------------------------------------------------ the ladder */
const BOUTS = [
  {
    id: 'germania', num: 'I', title: 'The Battle of Germania', place: 'The Lounge, Colosseum Bar', theme: 'colosseum', host: 'marcus', music: 'reel', time: 120, tutorial: true,
    waves: [['stag'], ['stag', 'stag'], ['stag', 'stag', 'stag']],
    pre: [
      ['narrator', 'Halloween night. Mike Lynch went out dressed as a gladiator. By closing time, he would be one.'],
      ['narrator', 'The Colosseum Bar & Lounge, established A.D. 180, was the finest pub in the Big Smoke.'],
      ['narrator', "For twenty years old Marcus O'Reilly pulled the pints. Now he was tired, and the pub needed an heir."],
      ['narrator', 'His son Commodus wanted it badly. Marcus had other plans, for his most loyal barman, Mike Lynch, who had turned up for the Halloween shift in full armour.'],
      ['marcus', 'Lynchy. The barbarian hordes from Ballygobackwards are in the lounge. A stag party. Will they listen to reason?'],
      ['mike', "They're on their fourteenth pint, Marcus. Reason went home at nine o'clock."],
      ['mike', 'Right, lads. Strength and honour.'],
    ],
    post: [
      ['marcus', 'Fair play, Lynchy. When I go, I want you to have the pub. Not Commodus. You.'],
      ['marcus', 'Give it back to the people. A pub with no telly. Just the pints, the session and the craic.'],
      ['commodus', 'Father... you are giving the pub to the BARMAN? The one dressed as a GLADIATOR?'],
      ['marcus', "You'd put a telly in every corner and water in every pint, son. No."],
      ['narrator', "Marcus O'Reilly passed away that night, peacefully, in his snug. Some say Commodus had a hand in it. Most say it was the coddle."],
      ['commodus', "Shake on it, Lynch. You work for me now. It's a once-off offer."],
      ['mike', 'Marcus wanted the pub left to the people.'],
      ['commodus', 'Then you are BARRED. And your pint... goes down the sink.'],
      ['narrator', "And so Mike's pint was poured, untouched, down the sink. A crime the parish would never forget."],
      ['narrator', 'Barred from every pub in the Big Smoke, still in his armour, Mike fled to the provinces, and woke up somewhere called Zucchabar.'],
    ],
  },
  {
    id: 'zucchabar', num: 'II', title: 'Zucchabar', place: "Proximo's back room, just outside Mullingar", theme: 'zucchabar', host: 'proximo', music: 'reel', time: 120,
    waves: [['stag', 'stag'], ['rugby', 'stag'], ['rugby', 'rugby']],
    pre: [
      ['proximo', 'Zucchabar. The name has "bar" in it, so that is something. They call me Proximo. I run the back room.'],
      ['proximo', "Nice costume, lad. In here it isn't a costume. You're a gladiator now, and a gladiator doesn't win for me. He wins the crowd."],
      ['proximo', 'Watch the CRAIC METER. The crowd loves variety: combos, parries, a well-timed dodge. Do the same thing over and over and they will boo you.'],
      ['proximo', 'And when a lad is on the floor, give them a TAUNT. Show them what you are.'],
    ],
    post: [
      ['mike', 'ARE YOU NOT ENTERTAINED?! Is this not worth the cover charge?!'],
      ['crowd', 'LYNCHY! LYNCHY! LYNCHY!'],
      ['proximo', "Ha! I never pulled the fastest pint in Mullingar. But the punters loved me, and that kept me behind the bar for forty years."],
      ['proximo', 'Win the crowd, Lynchy. That is the whole job.'],
    ],
  },
  {
    id: 'pairs', num: 'III', title: 'The Pairs', place: "Proximo's back room", theme: 'zucchabar', host: 'proximo', music: 'reel', time: 140,
    waves: [['bouncer'], ['darts', 'stag'], ['bouncer', 'darts'], ['hustler', 'farmer']],
    pre: [
      ['proximo', 'Tonight: the pairs. A bouncer who blocks everything, a darts man who never misses, and a culchie with a bag of turf.'],
      ['proximo', 'A blocker hates a HURLEY SMASH. Hold STRIKE to wind it up. It breaks any guard.'],
      ['proximo', 'And a dart is only a pint with ambitions. Tap BLOCK just as it arrives and it goes straight back to the thrower.'],
    ],
    post: [
      ['proximo', 'News from the Big Smoke. Commodus has reopened the Colosseum Bar, and he is hosting a gladiator night.'],
      ['proximo', 'Every back-room fighter in Ireland is invited.'],
      ['mike', "Then we're going to the Big Smoke."],
      ['proximo', "We all get barred in the end, Lynchy. You don't get to pick the night. You only get to pick how you go out the door."],
    ],
  },
  {
    id: 'carthage', num: 'IV', title: 'The Battle of Carthage', place: 'The Colosseum Bar, the Big Smoke', theme: 'colosseum', host: 'commodus', music: 'reel', time: 160, trolleys: true, helmet: true,
    waves: [['stag', 'stag', 'stag'], ['rugby', 'hustler', 'stag'], ['rugby', 'rugby', 'darts']],
    pre: [
      ['cassius', 'LADIES AND GENTLEMEN! For one night only, the Colosseum Bar recreates the fall of mighty CARTHAGE!'],
      ['cassius', 'On one side: the barbarian hordes!'],
      ['mike', "That's us."],
      ['cassius', 'And on the other: the legions of Scipio... in SHOPPING TROLLEYS!'],
      ['mike', 'Lads. Whatever comes out of those jacks, we stand shoulder to shoulder. Nobody leaves the line.'],
      ['proximo', 'Watch the floor. A flashing lane means a trolley is coming. Get out of its way.'],
    ],
    post: [
      ['commodus', 'You. In the helmet. Who are you?'],
      ['mike', 'Just a gladiator.'],
      ['commodus', 'Nobody turns their back on the Landlord. Take that helmet off.'],
      ['mike', "Mike Decimus Lynch. Captain of the darts team. Keeper of the Friday lock-in. The last barman Marcus O'Reilly ever hired."],
      ['mike', 'Owner of a murdered pint. And I will have my round. Tonight, or some other night.'],
      ['crowd', 'LYNCHY! LYNCHY! LYNCHY!'],
      ['commodus', '...It vexes me. I am terribly vexed.'],
    ],
  },
  {
    id: 'tigris', num: 'V', title: 'Tigris of Galway', place: 'The Colosseum Bar', theme: 'colosseum', host: 'commodus', music: 'boss', time: 170, hatches: true, boss: 'tigris', verdict: true,
    waves: [['tigris']],
    pre: [
      ['cassius', 'And now: never beaten, in this pub or any other...'],
      ['cassius', 'Five-time Connacht champion, unbeaten since the Celtic Tiger... TIGRIS OF GALWAY!'],
      ['tigris', "I've not lost since 1995, Lynch. And I'm not losing to a lad in a Halloween costume."],
      ['proximo', "Mind the floor. Commodus has put his Jack Russell in the cellar. The dog's name is Tiger. He goes for the ankles."],
      ['proximo', 'If a hatch starts rattling, get clear. Give the dog a tap with the hurley and the hatch slams shut.'],
    ],
    postSpared: [
      ['crowd', 'MIKE THE MERCIFUL! MIKE THE MERCIFUL!'],
      ['commodus', 'The crowd... the crowd LOVES him. How?'],
      ['tigris', "You've a good heart, Lynchy. I owe you a pint. I won't forget it."],
    ],
    postBarred: [
      ['commodus', 'Am I not merciful? AM I NOT MERCIFUL?!'],
      ['narrator', 'The crowd booed. Tigris was escorted out, still holding his hurley. The parish would remember this.'],
    ],
  },
  {
    id: 'praetorians', num: 'VI', title: 'The Praetorian Guard', place: 'The Colosseum Bar', theme: 'colosseum', host: 'commodus', music: 'boss', time: 170, trolleys: true, hatches: true,
    waves: [['bouncer', 'bouncer'], ['darts', 'farmer', 'hustler'], ['bouncer', 'rugby', 'darts']],
    pre: [
      ['commodus', "If the crowd won't let me bar him, my bouncers will."],
      ['cassius', "Ladies and gentlemen: the Landlord's own PRAETORIAN GUARD! Not tonight, lads!"],
    ],
    post: [
      ['commodus', 'Behind my bar, out to the provinces, and back into my arena. Quite the story, Lynch.'],
      ['commodus', 'The parish wants an ending, and I have one in mind. A barring for the ages.'],
      ['commodus', 'Here. A pint, on the house. To honour you.'],
      ['narrator', 'Mike should have known. Nobody gets a pint on the house from Commodus. It was spiked.'],
    ],
  },
  {
    id: 'commodus', num: 'VII', title: 'Commodus', place: 'The Colosseum Bar, closing time', theme: 'colosseum', host: null, music: 'boss', time: 180, boss: 'commodus', spiked: true,
    waves: [['commodus']],
    pre: [
      ['proximo', 'Lynchy... your pint. He spiked your pint!'],
      ['mike', "I'm grand. Strength and honour, Proximo."],
      ['proximo', "Mind him. When he glows purple he's waiting for you to swing. Don't. Make him come to you."],
    ],
    preSpared: [['tigris', 'Lynchy! I said I owed you a pint. CATCH!']],
    post: [
      ['commodus', 'You simply won\'t... go... home.'],
      ['cassius', 'COMMODUS... is BARRED!'],
      ['narrator', 'And then the spiked pint caught up with Mike. The room went quiet. He saw a field of barley, golden, all the way to a little pub at the end of a road.'],
      ['narrator', 'Elysium. Where every pint settles instantly, the session never ends, and nobody ever calls time.'],
      ['proximo', 'Lynchy? LYNCHY! Get up, ye big eejit. You only fainted.'],
      ['mike', 'Is... is the pub safe?'],
      ['proximo', "It's the people's pub now, like Marcus wanted. No telly. Just the session and the craic."],
      ['mike', "Then the pub is free. I'll see that barley field some day. Just... not tonight."],
      ['proximo', "Not tonight. Sure, it's your round."],
      ['narrator', 'Not bad for a lad who only came out in a costume.'],
      ['narrator', 'What we do in the pub... echoes in the parish.'],
    ],
  },
];

const ROUND_LINES = ["It's your round", 'Same again', 'One for the road', 'A sneaky one', 'Go on so', 'Ah go on', 'Last one, honest'];
const GRADES = [[1.35, 'S', 'Legend of the Parish'], [1.1, 'A', 'Sound Man'], [0.85, 'B', 'Grand'], [0.6, 'C', 'Sure Look'], [0, 'D', 'Ah Here']];
const COMBO_WORDS = [[50, 'ABSOLUTE LEGEND'], [30, 'LEGEND'], [20, 'MENTAL'], [15, 'SAVAGE'], [10, 'DEADLY'], [5, 'SOUND']];

const TIPS = [
  'A white flash means the hit can be blocked. Tap BLOCK just before it lands to PARRY.',
  'A red flash means unblockable. Leg it.',
  'Hold STRIKE for a Hurley Smash. It breaks any guard, even a bouncer\'s.',
  'The crowd hates a bore. Mix it up: combos, parries, dodges, taunts.',
  'The craic meter tops out at ninety. Everyone knows that.',
  'A pint has to settle before you can drink it. Two-part pour, lads.',
  'If a lad drinks your pint, hit him. The parish will understand.',
  'When time is called, the crowd decides. Win them over and you win the bout.',
  'Parry a dart and it goes straight back to the thrower.',
  'Hit the dog in the hatch to shut it. Down, Tiger.',
  'Purple glow on Commodus? Don\'t swing. He\'s waiting for you.',
  'Dodge an attack at the last second for an OLÉ. The crowd goes wild for it.',
  'Under a quarter health, Mike fights for vengeance: his hits land harder.',
  'Woke up in a green field with the sun on your face? That is not the afterlife. That is Kerry, and you missed the last bus.',
  'Marcus always said the best lock-ins are the ones you only whisper about. Any louder and the Guards hear it.',
  'The frost sometimes makes the tap stick.',
  'Shadows and dust, Lynchy. Shadows and dust, and crisp crumbs.',
  'The crowd doesn\'t know what it wants until it sees what the fella beside it wants. (A French lad at the bar.)',
  'Never trust a man who won\'t stand his round. Skin in the game. (A Lebanese lad who deadlifts.)',
  'Competition is for losers, says a lad from California. He has never seen a Saturday night in Mullingar.',
  'The marginal pint is always the one that gets you barred. (An economist in the snug.)',
  'No sound? Flick the silent switch on the side of the phone.',
];

const CREDITS = [
  ['STOUT & HONOUR', ''],
  ['Mike Lynch', 'as himself, in his own armour'],
  ["Commodus O'Dowd", 'barred'],
  ['Proximo', 'retired, ish'],
  ['Tigris of Galway', 'undefeated (mostly)'],
  ['Tiger the Jack Russell', 'good boy'],
  ['Cassius', 'quizmaster'],
  ['The lads from Ballygobackwards', 'themselves'],
  ['The Colosseum House Band', 'fiddle, whistle and bodhrán'],
  ['No pints were harmed', 'except one'],
  ['Inspired by', 'a certain sword-and-sandals epic, and every pub that ever called last orders'],
];
