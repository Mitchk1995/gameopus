// The hero's kit. Skills unlock as you level, so the early game is blade and footwork.
export const SKILLS = [
  { id: 'cleave', name: 'Cleave', key: 'LMB', level: 1, desc: 'Sweep your blade through everything in front of you.' },
  { id: 'bolt', name: 'Arcane Bolt', key: 'RMB', level: 3, desc: 'Right mouse fires a piercing bolt of raw arcana. 8 mana.' },
  { id: 'dash', name: 'Shadowstep', key: 'SPACE', level: 1, desc: 'Dash through danger, briefly untouchable.' },
  { id: 'nova', name: 'Frost Nova', key: 'Q', level: 6, desc: 'Q freezes and shatters everything around you. 25 mana.' },
  { id: 'potion', name: 'Healing Draught', key: 'R', level: 1, desc: 'Restores 40% of your life.' },
];
export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
