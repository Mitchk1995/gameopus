import { BANDIT_CAMP } from '../world/map.js';

// Quests, as data. Stage 0 is "not started"; each numbered step is a stage, and the
// journal shows every step reached so far (earlier ones struck through). Dialogue
// in src/content/people.js moves quests along with { quest: [id, stage] } and
// finishes them with { complete: id }.
//
//   giver        the person who starts it (their map dot turns into a quest star)
//   steps[n]     { short: the tracker line, text: the journal entry, goal: where the
//                map points (an npc, a spot, or x/z) }
//   spots        named places and objects the quest adds to the world; each one's
//                `action` is a mechanic in src/game/quests.js
//   drops        items a monster always drops while a condition holds
//   reads        what reading an item does
//   rewards      quest points, experience, items and a line about anything unlocked

export const QUESTS = {
  kindling: {
    name: 'A Little Warmth',
    giver: 'rowan',
    difficulty: 'Novice',
    length: 'Very short',
    start: 'Meet Rowan at the stone cottage west of the lake jetty.',
    requirements: 'An axe. The bronze axe in your starting pack will do.',
    steps: {
      1: { short: 'Bring Rowan three ordinary logs for the hearth.', text: 'Rowan and Elin need firewood for their cottage. Chop ordinary trees along the lake road until you have three logs, then bring them to Rowan. He works by the nets, at his indoor table and along the little path to the jetty.', goal: { npc: 'rowan' } },
    },
    rewards: { points: 1, items: [['trout', 2], ['coins', 25]] },
  },
  gnasher: {
    name: 'The One That Got Away',
    giver: 'tam',
    difficulty: 'Novice',
    length: 'Short',
    start: 'Talk to Old Tam at the lake jetty, south of Ashford.',
    requirements: 'None. You will mine, smelt and fish a little along the way.',
    steps: {
      1: { short: 'Bring Brom a bronze bar to forge a heavy hook.', text: 'Old Tam wants a hook heavy enough for Old Gnasher, the monster pike of the lake. Brom the smith could forge one from a bronze bar: mine copper and tin at the quarry, then smelt them at his furnace.', goal: { npc: 'brom' } },
      2: { short: 'Bait the hook with a raw shrimp and cast off the end of the jetty.', text: 'Brom forged a heavy hook. Bait it with a raw shrimp and cast into the deep water at the end of the jetty, then strike the moment Gnasher bites.', goal: { spot: 'deepwater' } },
      3: { short: 'Bring Old Gnasher to Old Tam.', text: 'You landed Old Gnasher! Bring him to Old Tam.', goal: { npc: 'tam' } },
    },
    spots: {
      deepwater: { at: 'jettyEnd', name: 'Deep water', verb: 'Cast into', action: 'castForGnasher', if: { quest: ['gnasher', 2] } },
    },
    rewards: {
      points: 1,
      xp: { fishing: 1200, smithing: 250 },
      items: [['fly_rod', 1], ['feather', 100], ['coins', 200]],
    },
  },

  ledger: {
    name: "The Captain's Ledger",
    giver: 'brom',
    difficulty: 'Intermediate',
    length: 'Medium',
    start: 'Talk to Brom at the smithy in Ashford.',
    requirements: 'You must be able to defeat the bandit captain (level 32) and Grubnak, the Warren King (level 26).',
    steps: {
      1: { short: 'Ask Garrow the guard about the missing carts.', text: "Brom's carts of iron ore keep vanishing on the road from the quarry. Ask Garrow the guard what he knows; he keeps watch at the east gate.", goal: { npc: 'garrow' } },
      2: { short: 'Search the wrecked cart on the east road.', text: 'Garrow says the last cart was found wrecked on the east road, past the farms, where the woods begin. Search it.', goal: { spot: 'wreck' } },
      3: { short: 'Defeat the bandit captain in the eastern woods.', text: 'In the wreck you found a scrap of bandit cloth and cart tracks heading east. The bandit captain, in the eastern woods, will know where the ore went.', goal: { x: BANDIT_CAMP.x, z: BANDIT_CAMP.z } },
      4: { short: "Find Brom's strongbox in the Old Warren.", text: "The captain's ledger says the ore was sold to \"the King under the hill\", and that the King kept Brom's strongbox. Find it in the Old Warren, down the shaft at the quarry.", goal: { spot: 'cave' } },
      5: { short: 'Return the strongbox to Brom.', text: "You took Brom's strongbox back from the Warren King's lair. Return it to Brom.", goal: { npc: 'brom' } },
    },
    spots: {
      wreck: { at: 'wreck', name: 'Wrecked cart', verb: 'Search', action: 'searchWreck' },
    },
    drops: [
      { monster: 'bandit_captain', item: 'captains_ledger', if: { quest: ['ledger', 3], lacks: 'captains_ledger' } },
    ],
    reads: {
      captains_ledger: { if: { quest: ['ledger', 3] }, do: { quest: ['ledger', 4] } },
    },
    rewards: {
      points: 2,
      xp: { attack: 2500, strength: 2500, defence: 2500, smithing: 1500 },
      items: [['coins', 600]],
      unlocks: 'Brom now sells steel.',
    },
  },
};

// Stage value for a finished quest.
export const DONE = 100;
