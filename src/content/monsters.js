// Monster families. `model` names a procedural builder in game/monsterModels.js.
// behavior: 'melee' charges and swings, 'ranged' keeps distance and casts, 'slam' winds up an area smash.
export const MONSTERS = {
  husk: {
    name: 'Ashen Husk',
    model: 'husk',
    hp: 32,
    speed: 2.9,
    radius: 0.45,
    damage: 6,
    xp: 5,
    behavior: 'melee',
    reach: 1.1,
    windup: 0.42,
    cooldown: 1.4,
    gait: 9,
    gaitAmt: 0.32,
    legH: 0.75,
    debris: [0.9, 0.6, 0.4],
  },
  skitter: {
    name: 'Cinder Skitter',
    model: 'skitter',
    hp: 14,
    speed: 5.4,
    radius: 0.38,
    damage: 3.5,
    xp: 3,
    behavior: 'melee',
    reach: 0.9,
    windup: 0.24,
    cooldown: 0.95,
    gait: 26,
    gaitAmt: 0.12,
    legH: 0.6,
    debris: [2.4, 1.0, 0.2],
  },
  wisp: {
    name: 'Choir Wisp',
    model: 'wisp',
    hp: 28,
    speed: 3.0,
    radius: 0.45,
    damage: 9,
    xp: 7,
    behavior: 'ranged',
    range: 11,
    cooldown: 2.8,
    gait: 0,
    gaitAmt: 0,
    legH: 1,
    float: true,
    debris: [1.8, 0.8, 3.0],
  },
  brute: {
    name: 'Grave Brute',
    model: 'brute',
    hp: 180,
    speed: 2.0,
    radius: 0.95,
    damage: 24,
    xp: 26,
    behavior: 'slam',
    reach: 2.8,
    windup: 0.85,
    cooldown: 2.6,
    gait: 5.5,
    gaitAmt: 0.35,
    legH: 1.0,
    debris: [1.6, 0.5, 0.3],
  },
};

// Elite name generator: "Gorlath the Unyielding".
export const ELITE_FIRST = ['Gorlath', 'Vessiq', 'Mourn', 'Karrow', 'Ysolde', 'Threnn', 'Bael', 'Ostrakh', 'Hesk', 'Wenlow', 'Carrigan', 'Mother Ash'];
export const ELITE_TITLE = ['the Unyielding', 'the Hollow', 'Bellbreaker', 'the Drowned', 'of the Last Choir', 'Ashborn', 'the Patient', 'Who Waits', 'the Rimebitten', 'Gravesinger'];

// Elite modifiers: each changes how the fight plays.
export const ELITE_AFFIXES = {
  molten: { name: 'Molten', desc: 'leaves burning ground' },
  frenzied: { name: 'Frenzied', desc: 'moves and strikes faster' },
  vortex: { name: 'Vortex', desc: 'pulls you in' },
};
