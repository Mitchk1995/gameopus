// Monster families. `model` names a procedural builder in game/monsterModels.js.
// behavior: 'melee' charges and swings, 'ranged' keeps distance and casts, 'slam' winds up an area smash.
export const MONSTERS = {
  husk: {
    name: 'Ashen Husk',
    model: 'husk',
    hp: 26,
    speed: 2.6,
    radius: 0.45,
    damage: 5,
    xp: 4,
    behavior: 'melee',
    reach: 1.1,
    windup: 0.35,
    cooldown: 1.2,
    gait: 9,
    gaitAmt: 0.32,
    legH: 0.75,
    debris: [0.9, 0.6, 0.4],
  },
  skitter: {
    name: 'Cinder Skitter',
    model: 'skitter',
    hp: 12,
    speed: 5.2,
    radius: 0.38,
    damage: 3,
    xp: 3,
    behavior: 'melee',
    reach: 0.9,
    windup: 0.2,
    cooldown: 0.9,
    gait: 26,
    gaitAmt: 0.12,
    legH: 0.6,
    debris: [2.4, 1.0, 0.2],
  },
  wisp: {
    name: 'Choir Wisp',
    model: 'wisp',
    hp: 20,
    speed: 2.8,
    radius: 0.45,
    damage: 9,
    xp: 6,
    behavior: 'ranged',
    range: 10,
    cooldown: 2.4,
    gait: 0,
    gaitAmt: 0,
    legH: 1,
    float: true,
    debris: [1.8, 0.8, 3.0],
  },
  brute: {
    name: 'Grave Brute',
    model: 'brute',
    hp: 140,
    speed: 1.9,
    radius: 0.95,
    damage: 20,
    xp: 20,
    behavior: 'slam',
    reach: 2.6,
    windup: 0.8,
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
