// Shops, as data. Stock rows are [item, count, price] or { id, n, price, if } for
// stock that only appears once a condition holds (see src/content/people.js for
// conditions). `buys` says what the shop will take off your hands: 'all', a list of
// items, or a kind of goods ('fish', 'metal', 'food').

export const SHOPS = {
  general: {
    name: "Maren's General Store", owner: 'Maren', buys: 'all',
    stock: [
      ['bronze_axe', 5, 18], ['iron_axe', 3, 60], ['steel_axe', 2, 210],
      ['bronze_pickaxe', 5, 18], ['iron_pickaxe', 3, 60], ['steel_pickaxe', 2, 210],
      ['hammer', 8, 3], ['knife', 8, 4], ['small_net', 6, 6], ['bronze_sword', 3, 30], ['bronze_med_helm', 2, 25],
    ],
  },
  tackle: {
    name: "Tam's Tackle", owner: 'Old Tam', buys: 'fish',
    stock: [['small_net', 5, 6], ['fly_rod', 4, 12], ['feather', 2000, 3]],
  },
  smithy: {
    name: "Brom's Smithy", owner: 'Brom', buys: 'metal',
    stock: [
      ['hammer', 10, 3], ['bronze_bar', 20, 14], ['iron_bar', 10, 60],
      ['bronze_dagger', 3, 20], ['bronze_sword', 3, 30], ['bronze_full_helm', 2, 50], ['bronze_kiteshield', 2, 70],
      ['iron_dagger', 2, 70], ['iron_sword', 2, 110], ['iron_med_helm', 2, 90],
      { id: 'steel_bar', n: 10, price: 190, if: { done: 'ledger' } },
      { id: 'steel_sword', n: 2, price: 420, if: { done: 'ledger' } },
      { id: 'steel_full_helm', n: 2, price: 520, if: { done: 'ledger' } },
    ],
  },
  inn: {
    name: 'The Crooked Pike', owner: 'Bess', buys: 'food',
    stock: [['bread', 20, 12], ['ale', 30, 3]],
  },
};
