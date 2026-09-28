export const SLOTS = ['weapon', 'helm', 'chest', 'gloves', 'boots', 'amulet', 'ring'];

export const SLOT_NAMES = {
  weapon: 'One-Handed Sword',
  helm: 'Helm',
  chest: 'Body Armor',
  gloves: 'Gloves',
  boots: 'Boots',
  amulet: 'Amulet',
  ring: 'Ring',
};

// Base names get grander with item level.
export const BASES = {
  weapon: ['Rusted Blade', 'Broadsword', 'Runic Saber', 'Grave Edge', 'Voidsteel Blade', 'Choirglass Sword'],
  helm: ['Leather Cowl', 'Iron Helm', 'Barbute', 'Bellwarden Helm', 'Crown of Thorns', 'Hollow Visage'],
  chest: ['Padded Tunic', 'Chainmail', 'Scale Hauberk', 'Wardplate', 'Reliquary Plate', 'Starless Cuirass'],
  gloves: ['Wraps', 'Leather Gloves', 'Chain Gauntlets', 'Ironfists', 'Sepulcher Grips', 'Nightclaws'],
  boots: ['Sandals', 'Leather Boots', 'Greaves', 'Ashwalkers', 'Tomb Sabatons', 'Voidtreads'],
  amulet: ['Bone Amulet', 'Copper Amulet', 'Silver Amulet', 'Onyx Amulet', 'Choir Pendant', 'Star Locket'],
  ring: ['Iron Ring', 'Copper Ring', 'Garnet Ring', 'Obsidian Ring', 'Bellmetal Ring', 'Void Band'],
};

export const ARMOR_WEIGHT = { helm: 1, chest: 1.7, gloves: 0.7, boots: 0.7 };

export const RARE_FIRST = ['Grim', 'Doom', 'Blood', 'Ash', 'Storm', 'Soul', 'Night', 'Rune', 'Dread', 'Viper', 'Gloom', 'Bone', 'Wraith', 'Ember', 'Frost', 'Hollow', 'Carrion', 'Star', 'Bell', 'Knell', 'Rime', 'Dusk'];
export const RARE_SECOND = {
  weapon: ['Bite', 'Edge', 'Fang', 'Song', 'Reaver', 'Thirst', 'Needle', 'Hymn'],
  helm: ['Crown', 'Visage', 'Cowl', 'Mask', 'Brow', 'Halo'],
  chest: ['Shell', 'Hide', 'Carapace', 'Mantle', 'Coat', 'Ward'],
  gloves: ['Grip', 'Clutch', 'Hand', 'Fist', 'Talon', 'Knuckle'],
  boots: ['Stride', 'Trek', 'Road', 'Track', 'Spur', 'March'],
  amulet: ['Charm', 'Heart', 'Eye', 'Locket', 'Talisman', 'Tear'],
  ring: ['Loop', 'Band', 'Coil', 'Spiral', 'Circle', 'Knot'],
};

export const RARITY = {
  magic: { label: 'Magic', css: '#7f97ff', hdr: [0.7, 1.0, 4.5], beam: false },
  rare: { label: 'Rare', css: '#ffd54a', hdr: [4.5, 3.6, 0.7], beam: true },
  unique: { label: 'Unique', css: '#ff8a2b', hdr: [7, 2.8, 0.45], beam: true },
  ascendant: { label: 'Ascendant', css: '#ff3d71', hdr: [7, 0.7, 2.6], beam: true },
};
