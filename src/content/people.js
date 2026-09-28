// The people of Ashford, as data. Each has:
//   look       outfit, body and hair for the character factory
//   at         where they stand: { place, x, z } inside a village building (local
//              metres), { station, dx, dz, facing } beside a workstation,
//              { x, z, facing } in the world, or { loop: [radius, angle, points] }
//              for a walk around the square
//   persona    who they are, for typed chat (Claude answers in their voice)
//   dialogue   the reply tree (see src/game/dialogue.js for the format)
//
// Dialogue nodes: { say: [lines], options: [...], do: effect, next: 'node' }, or a
// list of branches [{ if: condition, go: 'node' }] where the first that holds wins.
// A line is a string (the NPC speaks), { narrate } or { me }. Options are
// { text, if, go, do, end }. Conditions: { quest: [id, stage] }, { questFrom },
// { questBefore }, { done: id }, { has: [item, n] }, { lacks: item },
// { level: [skill, n] }, { not: condition }, { any: [conditions] }.
// Effects: { quest: [id, stage] }, { complete: id }, { give / take: [[item, n]] },
// { shop: id }, { bank: true }.

const bye = { text: 'Goodbye.', end: true };

export const PEOPLE = [
  {
    id: 'aldwyn', name: 'Aldwyn', role: 'banker',
    look: { outfit: 'male_peasant', body: 'male', hair: 'hair_buzzed', beard: 'hair_beard', eyebrows: 'eyebrows_regular' },
    idle: 'Idle_FoldArms_Loop', at: { place: 'bank', x: 0, z: -2.6 },
    persona: `Aldwyn runs the Bank of Ashford, a stone building on the north side of the square.
Precise, dry, quietly proud that nothing has gone missing from his vaults in forty years (bar one goat, which he will not discuss further).
Speaks formally and briefly, with a very dry wit. Keeps careful accounts of everyone's business but is discreet about it.`,
    dialogue: {
      start: {
        say: ['Good day. Your coin and goods are safe with the Bank of Ashford. Shall I open your account?'],
        options: [
          { text: 'Yes, open my bank.', do: { bank: true } },
          { text: 'How safe is safe?', go: 'safe' },
          bye,
        ],
      },
      safe: {
        say: ['Stone walls, iron locks, and me. Nothing has gone missing in forty years, bar one goat.', 'We do not talk about the goat.'],
        options: [{ text: 'Open my bank, then.', do: { bank: true } }, bye],
      },
    },
  },

  {
    id: 'maren', name: 'Maren', role: 'shopkeeper',
    look: { outfit: 'female_peasant', body: 'female', hair: 'hair_buns', eyebrows: 'eyebrows_female' },
    at: { place: 'store', x: 0, z: -1.9 },
    persona: `Maren keeps the general store on the west side of the square: axes, pickaxes, hammers, knives, nets and a few weapons. She buys almost anything.
Cheerful, chatty and practical, the first person newcomers ask for advice. Knows what each tool is for and where to use it.`,
    dialogue: {
      start: {
        say: ["Welcome to Maren's! Tools, nets, knives, whatever you need to get started. I'll buy most things too."],
        options: [
          { text: "Let's trade.", do: { shop: 'general' } },
          { text: 'Where should I start?', go: 'advice' },
          bye,
        ],
      },
      advice: {
        say: [
          'Grab an axe and try the trees along the road, or take a pickaxe to the quarry up the north-west road.',
          'Brom will show you the furnace once you have ore, and Old Tam at the lake can always use a hand.',
        ],
        options: [{ text: "Let's trade.", do: { shop: 'general' } }, bye],
      },
    },
  },

  {
    id: 'brom', name: 'Brom', role: 'smith',
    look: { outfit: 'male_peasant', body: 'male', hair: 'hair_buzzed', beard: 'hair_beard', eyebrows: 'eyebrows_regular' },
    idle: 'Idle_FoldArms_Loop', at: { place: 'smithy', x: -2.0, z: -0.2 },
    persona: `Brom is Ashford's smith: huge, soot-stained, blunt, and proud of his craft. His smithy is on the east side of the square, with a furnace and an anvil.
He teaches anyone willing: copper and tin smelt into bronze, iron takes a steadier hand, steel needs coal as well as iron ore. Bars plus a hammer at the anvil make weapons, armour and arrowtips.
Few words, gruff humour, soft spot for Old Tam, low opinion of Garrow's guarding. Lately furious that his iron ore carts from the quarry keep vanishing on the road.`,
    dialogue: {
      start: [
        { if: { quest: ['ledger', 5], has: ['ore_strongbox'] }, go: 'ledger_return' },
        { if: { quest: ['gnasher', 1], has: ['bronze_bar'] }, go: 'hook_forge' },
        { if: { quest: ['gnasher', 1] }, go: 'hook_needbar' },
        { if: { quest: ['gnasher', 2], lacks: 'heavy_hook', has: ['bronze_bar'] }, go: 'hook_again' },
        { if: { questFrom: ['ledger', 1], questBefore: ['ledger', 6] }, go: 'ledger_progress' },
        { go: 'hello' },
      ],
      hello: {
        say: [{ if: { questBefore: ['ledger', 1] }, text: "Copper and tin make bronze. Iron wants a steadier hand. And I'd be making a lot more of it if my iron would ever turn up." }, { if: { questFrom: ['ledger', 1] }, text: 'Copper and tin make bronze. Iron wants a steadier hand, and steel wants coal. What will it be?' }],
        options: [
          { text: 'What can I make at the anvil?', go: 'anvil' },
          { text: "Let's trade.", do: { shop: 'smithy' } },
          { text: "What's this about your iron?", if: { questBefore: ['ledger', 1] }, go: 'ledger_offer' },
          bye,
        ],
      },
      anvil: {
        say: ['Daggers and swords to begin, then helmets, shields and plate as your arm improves. Arrowtips too, if you shoot.', 'Bring bars and a hammer. The anvil does not care who you are, only how you swing.'],
        options: [{ text: "Let's trade.", do: { shop: 'smithy' } }, bye],
      },
      hook_needbar: {
        say: ["A hook for Tam? For that fish? Ha! Aye, I'll forge one.", 'Bring me a bronze bar. Copper and tin from the quarry, melted together in my furnace.'],
        options: [{ text: 'How do I make a bronze bar?', go: 'smelt' }, bye],
      },
      smelt: {
        say: ['Copper ore and tin ore in your pack, stand at the furnace, pick the bar. The furnace does the rest. Mostly.', 'Pickaxes are at Maren\'s if you need one.'],
        options: [bye],
      },
      hook_forge: {
        do: { take: [['bronze_bar', 1]], give: [['heavy_hook', 1]], quest: ['gnasher', 2] },
        say: ['That will do nicely. Hold this.', { narrate: 'Brom hammers the bar into a hook as thick as your thumb, quenches it with a hiss and hands it over.' }, 'There. Tell Tam if that fish bends this, I will eat my apron.'],
        options: [{ text: 'Thanks, Brom.', end: true }],
      },
      hook_again: {
        do: { take: [['bronze_bar', 1]], give: [['heavy_hook', 1]] },
        say: ['Lost it already? Give me that bar.', { narrate: 'Brom forges another heavy hook, muttering.' }],
        options: [bye],
      },
      ledger_offer: {
        say: ['Three carts of iron ore from the quarry. Three! Not one of them reached me.', 'The carter swears he was ambushed. Garrow is meant to keep the roads safe, but all he does is lean on things.'],
        options: [
          { text: "I'll find out what happened.", do: { quest: ['ledger', 1] }, go: 'ledger_start' },
          { text: 'Sounds like trouble.', end: true },
        ],
      },
      ledger_start: {
        say: ['You will? Then start with Garrow. East side of the square, by the road. Leaning on something, I expect.'],
        options: [{ text: "I'll talk to him.", end: true }],
      },
      ledger_progress: [
        { if: { quest: ['ledger', 1] }, go: 'lp1' },
        { if: { quest: ['ledger', 2] }, go: 'lp2' },
        { if: { quest: ['ledger', 3] }, go: 'lp3' },
        { if: { quest: ['ledger', 4] }, go: 'lp4' },
        { go: 'lp5' },
      ],
      lp1: { say: ['Talked to Garrow yet? He will be by the east road, leaning.'], options: [{ text: "Let's trade.", do: { shop: 'smithy' } }, bye] },
      lp2: { say: ["The wreck's out on the east road, past the farms. See what you can find."], options: [{ text: "Let's trade.", do: { shop: 'smithy' } }, bye] },
      lp3: { say: ['Bandits? Then it is their captain you want. Mind yourself; he fights dirty.'], options: [{ text: "Let's trade.", do: { shop: 'smithy' } }, bye] },
      lp4: { say: ['Under the hill? With the goblins? My ore?', 'If my strongbox is down there, bring it back. The quarry\'s pay for the whole season is in it.'], options: [{ text: "Let's trade.", do: { shop: 'smithy' } }, bye] },
      lp5: { say: ['You found it? Then where is it? Go and fetch it from wherever you put it!'], options: [bye] },
      ledger_return: {
        do: { take: [['ore_strongbox', 1]], complete: 'ledger' },
        say: ["That's my strongbox! My mark's on the lid, see? The anvil.", 'The ore is long melted into goblin trinkets, I would wager. But this is the quarry\'s pay for the whole season.', "You've done Ashford a real service. I'll stock steel again, and here's something for your trouble."],
        options: [{ text: 'Glad to help.', end: true }],
      },
    },
  },

  {
    id: 'tam', name: 'Old Tam', role: 'fisher',
    look: { outfit: 'male_ranger', body: 'male', hair: 'hair_long', beard: 'hair_beard', eyebrows: 'eyebrows_regular' },
    at: { x: -50.5, z: 171.5, facing: 2.6 },
    persona: `Old Tam has fished the lake south of the village for sixty years and sells nets, fly rods and feathers from the end of the lake road, by the jetty.
Gruff, weathered, fond of tall tales that he insists are true. Short, salty sentences. Calls people "young'un".
Knows fishing well: nets catch shrimp and anchovies by the jetty; fly rods with feathers catch trout (fishing level 20) and salmon (level 30) on the river east of the village.
Obsessed with Old Gnasher, a pike as long as a rowboat that lives in the deep hole off the end of the jetty and stole his grandfather's silver lure.`,
    dialogue: {
      start: [
        { if: { quest: ['gnasher', 3], has: ['old_gnasher'] }, go: 'gnasher_return' },
        { if: { quest: ['gnasher', 1] }, go: 'wait_hook' },
        { if: { quest: ['gnasher', 2] }, go: 'wait_fish' },
        { if: { quest: ['gnasher', 3] }, go: 'fetch_fish' },
        { if: { done: 'gnasher' }, go: 'after' },
        { go: 'hello' },
      ],
      hello: {
        say: ['Hrmph. Sixty years I have fished this lake, and one fish has the beating of me.'],
        options: [
          { text: 'Which fish?', go: 'story' },
          { text: "Show me what you've got.", do: { shop: 'tackle' } },
          bye,
        ],
      },
      story: {
        say: [
          'Old Gnasher. A pike as long as a rowboat, with a jaw like a bear trap. Lives in the deep hole off the end of the jetty.',
          "Last spring he took my line, my hook and my grandad's silver lure along with them. Snapped the line like cotton.",
          "My hands aren't what they were. But you've young arms...",
        ],
        options: [
          { text: "I'll catch him for you.", do: { quest: ['gnasher', 1] }, go: 'start_quest' },
          { text: 'A fish that big? Sounds like a tall tale.', go: 'doubt' },
          { text: 'Not today.', end: true },
        ],
      },
      doubt: {
        say: ['Tall? I have never told a tall tale in my life. Well. Not about fish. Not about THIS fish.'],
        options: [{ text: "All right, I'll catch him.", do: { quest: ['gnasher', 1] }, go: 'start_quest' }, bye],
      },
      start_quest: {
        say: ['Ha! Good. First thing: my hooks bend like willow in his jaw. You will want a heavy hook.', 'Brom at the smithy could forge one from a bronze bar. Bring him copper and tin, smelt a bar, and ask nicely. He likes nicely. Does not get much of it.'],
        options: [{ text: "I'll go and see Brom.", end: true }],
      },
      wait_hook: {
        say: ['Got that heavy hook yet? Brom is the man. A bronze bar is all he will need.'],
        options: [{ text: "Show me what you've got.", do: { shop: 'tackle' } }, bye],
      },
      wait_fish: {
        say: [
          { if: { has: ['heavy_hook'] }, text: "That's a proper hook! Bait it with a raw shrimp, he's partial to shrimp, and cast from the very end of the jetty." },
          { if: { lacks: 'heavy_hook' }, text: 'Where is that hook Brom made you? No hook, no Gnasher. Brom will make another for a bronze bar.' },
        ],
        options: [
          { text: 'How do I land him?', go: 'strike' },
          { text: 'Where do I get shrimp?', go: 'shrimp' },
          { text: "Show me what you've got.", do: { shop: 'tackle' } },
          bye,
        ],
      },
      fetch_fish: {
        say: ['You caught him? Then where is he? Go and fetch him, before he wriggles off!'],
        options: [bye],
      },
      strike: {
        say: ['When your line goes taut, you strike. Quick, mind. Hesitate and he will have the bait off you, and laugh about it.'],
        options: [bye],
      },
      shrimp: {
        say: ['Net fishing, right along this shore. Small fishing net, which I happen to sell. Cheap. Ish.'],
        options: [{ text: "Show me what you've got.", do: { shop: 'tackle' } }, bye],
      },
      gnasher_return: {
        do: { take: [['old_gnasher', 1]], complete: 'gnasher' },
        say: [
          'By the deep... that is him. That is Old Gnasher! Look at the teeth on him!',
          { narrate: 'Tam slits the great pike open with a practised flick. Something silver glints inside.' },
          "Grandad's lure! Sixty years, young'un. You have done an old man proud.",
          'Take these. You will be wanting trout next, and trout want a fly rod.',
        ],
        options: [{ text: 'Enjoy your lure, Tam.', end: true }],
      },
      after: {
        say: [{ pick: ['The lake has gone quiet without Gnasher to curse at. Almost miss the brute.', "Grandad's lure hangs over my door now. Brings luck, that does.", 'Bess wants Gnasher stuffed and hung over the bar. Over my dead body. Or his. Well, his.'] }],
        options: [{ text: "Show me what you've got.", do: { shop: 'tackle' } }, bye],
      },
    },
  },

  {
    id: 'ysolde', name: 'Ysolde', role: 'potter',
    look: { outfit: 'female_ranger', body: 'female', hair: 'hair_long', eyebrows: 'eyebrows_female' },
    at: { station: 'potter', dx: 1.2, dz: -1.0, facing: -0.8 },
    persona: `Ysolde is the village potter and spinner, working at the crafting corner on the west side of the square: a spinning wheel, a potter's wheel and a kiln.
Calm, patient, a little dreamy, speaks in unhurried sentences and notices small beautiful things.
Crafting: dig clay at the quarry, soften it with water from the well, shape pots and bowls on the potter's wheel, fire them in the kiln. Flax from the field east of the river spins into bow string on the spinning wheel (crafting level 10).`,
    dialogue: {
      start: {
        say: ['Dig clay at the quarry, soften it at the well, shape it on my wheel and fire it in the kiln.', 'Flax from the east field spins into bow string on that wheel there. Fletchers always want more.'],
        options: [bye],
      },
    },
  },

  {
    id: 'garrow', name: 'Garrow', role: 'guard',
    look: { outfit: 'male_ranger', body: 'male', hair: 'hair_buzzed', eyebrows: 'eyebrows_regular' },
    idle: 'Idle_FoldArms_Loop', at: { x: 22, z: 10, facing: 1.2 },
    persona: `Garrow is Ashford's only guard, posted where the east road leaves the square. Twenty years on the job, dutiful in his own slow way, tired, defensive about how much he leans on things.
Knows the roads: north-west to the quarry and mine, east over the bridge past the farms to the bandit woods, south to the lake. Bandits camp in the eastern woods under a captain with a fancy blade and a worse temper. Goblins camp in the woods north-west of the village.`,
    dialogue: {
      start: [
        { if: { quest: ['ledger', 1] }, go: 'brief' },
        { if: { quest: ['ledger', 2] }, go: 'cart' },
        { if: { quest: ['ledger', 3] }, go: 'captain' },
        { if: { questFrom: ['ledger', 4], questBefore: ['ledger', 6] }, go: 'warren' },
        { if: { done: 'ledger' }, go: 'after' },
        { go: 'hello' },
      ],
      hello: {
        say: ['Keep your wits about you east of the river. Bandits have been camping in the woods past the farms.'],
        options: [{ text: 'Tell me about the bandits.', go: 'bandits' }, { text: 'Any other trouble?', go: 'goblins' }, bye],
      },
      bandits: {
        say: ['A dozen, maybe, and a captain with a fancy blade and a worse temper. They hit carts, not towns. So far.'],
        options: [bye],
      },
      goblins: {
        say: ['Goblins in the woods north-west of here. Mostly they steal chickens. And there is something in the old mine. The miners say it snores.'],
        options: [bye],
      },
      brief: {
        do: { quest: ['ledger', 2] },
        say: ['Brom sent you? About his carts? Hmph.', 'I have been meaning to look into it. The last cart was found smashed on the east road, past the farms, where the woods start.', 'Take a look. You have younger eyes than mine.'],
        options: [{ text: "I'll take a look.", end: true }],
      },
      cart: {
        say: ['The wreck is on the east road, past the farms, by the edge of the woods. Look for the broken wheel.'],
        options: [bye],
      },
      captain: {
        say: ['Bandit cloth, eh? I knew it. Their captain will have the answers. He is not the talking sort, mind.'],
        options: [bye],
      },
      warren: {
        say: ['The Warren King? Goblins buying ore from bandits. This valley gets stranger every year.'],
        options: [bye],
      },
      after: {
        say: ['Quiet roads for once. Brom is even smiling. It is unsettling.'],
        options: [bye],
      },
    },
  },

  {
    id: 'bess', name: 'Bess', role: 'innkeeper',
    look: { outfit: 'female_peasant', body: 'female', hair: 'hair_long', eyebrows: 'eyebrows_female' },
    at: { place: 'inn', x: -0.9, z: -4.7 },
    persona: `Bess keeps the Crooked Pike, the inn on the south-east side of the square. Warm, loud, quick to laugh, and the valley's best source of gossip.
Sells bread and ale. Knows everyone's business and loves to share it, kindly. Has already named her inn after Old Tam's legendary fish.`,
    dialogue: {
      start: {
        say: ['Welcome to the Crooked Pike! Warm bread, cold ale, and all the news that is fit to whisper.'],
        options: [
          { text: 'What have you got?', do: { shop: 'inn' } },
          { text: 'Heard any rumours?', go: 'rumour' },
          bye,
        ],
      },
      rumour: {
        say: [{ pick: [
          { if: { questBefore: ['gnasher', 1] }, text: 'Old Tam has been muttering about a fish again. Says it is as long as a rowboat. It grows every time he tells it.' },
          { if: { questBefore: ['ledger', 1] }, text: 'Brom is in a foul mood. Something about his iron going missing on the road from the quarry.' },
          { if: { done: 'gnasher' }, text: "Tam's been buying rounds all week. Says you caught Old Gnasher! I've half a mind to name the inn after that fish. Oh wait. I did." },
          { if: { done: 'ledger' }, text: 'They say you went under the hill and came back with Brom\'s strongbox. Drinks are on the house. Well, the first one.' },
          'They say something big snores under the quarry hill. Goblins, the miners reckon. A king of them.',
          'Garrow has been on guard for twenty years. Asleep for about twelve of them.',
          'Maren will buy anything. Anything. Somebody sold her a bucket of bones last week.',
        ] }],
        options: [{ text: 'Another rumour?', go: 'rumour' }, { text: 'What have you got?', do: { shop: 'inn' } }, bye],
      },
    },
  },

  {
    id: 'wenna', name: 'Wenna', role: 'villager',
    look: { outfit: 'female_peasant', body: 'female', hair: 'hair_long', eyebrows: 'eyebrows_female' },
    at: { loop: [9, 0, 6] }, speed: 1.0,
    persona: `Wenna is a villager who walks her rounds of the square every day, basket on her arm. Friendly, a little nosy, loves the weather and her cat.`,
    dialogue: {
      start: {
        say: [{ pick: ['Lovely day for it.', 'Have you seen the size of the pike in that lake? Neither have I, but Tam has. Apparently.', 'My cat caught a goblin once. Well. It caught a goblin\'s hat.'] }],
        options: [bye],
      },
    },
  },

  {
    id: 'hob', name: 'Hob', role: 'villager',
    look: { outfit: 'male_peasant', body: 'male', hair: 'hair_simpleparted', eyebrows: 'eyebrows_regular' },
    at: { loop: [11.5, Math.PI, 7], reverse: true }, speed: 1.15,
    persona: `Hob is a farmhand from the fields east of the river who spends more time in the village square than in the fields. Easygoing, lazy, full of opinions about everything.`,
    dialogue: {
      start: {
        say: [{ pick: ["Mind the well, it's deeper than it looks.", 'Flax field is east, past the bridge. Pick all you like, it grows back. Unlike my patience.', 'Brom shouted at me today. Mind you, Brom shouts at everyone lately.'] }],
        options: [bye],
      },
    },
  },
];
