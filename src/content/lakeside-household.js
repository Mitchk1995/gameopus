import { LAKESIDE_HOME, homePoint } from '../world/lakeside-plan.js';

// A small household's daytime round. Waypoints keep both people in the open
// approach and the cottage's clear central aisle; work stops last long enough
// for a visitor to find them doing something, rather than constantly pacing.
const point = (id, x, z, wait = 0, facing = 0, idle = 'Idle_Loop', door = false) => ({
  id, ...homePoint(x, z), wait, facing: facing + LAKESIDE_HOME.rot, idle, door,
});
const approach = () => point('front path', 0.1, 6.2);
const threshold = (door = false) => point('doorstep', 0.1, 4.2, 0, 0, 'Idle_Loop', door);
const bye = { text: 'See you later.', end: true };

export const LAKESIDE_HOUSEHOLD = [
  {
    id: 'rowan', name: 'Rowan', role: 'net-mender', speed: 0.95,
    look: {
      outfit: 'male_peasant', body: 'male', hair: 'hair_buzzed', beard: 'hair_beard', eyebrows: 'eyebrows_regular',
      hairColor: 'chestnut', beardColor: 'brown', skin: 'weathered',
      dye: { torso: 0x687478, arms: 0xc9bda1, legs: 0x514d40, feet: 0x493c2d }, build: 1.04,
    },
    at: { routine: [
      point('mending nets', 2, 4.8, 45, Math.PI, 'Fixing_Kneeling'),
      approach(), threshold(), point('inside aisle', 0.1, 1, 0, 0, 'Idle_Loop', true),
      point('worktable', 1, 1, 45, Math.PI / 2, 'Interact'),
      point('inside aisle', 0.1, 1), threshold(true), approach(),
      point('lake path bend', 1.5, 8.5), point('watching the lake', 9, 10, 35, 0.6, 'Idle_FoldArms_Loop'),
      point('lake path bend', 1.5, 8.5), approach(),
    ] },
    persona: `Rowan mends fishing nets and shares the stone cottage west of the lake jetty with his partner Elin. He moves between the net basket beside the porch, the indoor worktable and the lake path. His hands are usually busy, his manner easy and unhurried. Elin tends the garden. They welcome a visitor who knocks the mud off their boots. Rowan needs three ordinary logs for the hearth and offers two cooked trout and 25 coins in thanks. He knows Old Tam at the jetty and suggests visiting him after the household job.`,
    dialogue: {
      start: [
        { if: { quest: ['kindling', 1], has: ['logs', 3] }, go: 'return' },
        { if: { quest: ['kindling', 1] }, go: 'waiting' },
        { if: { done: 'kindling' }, go: 'after' },
        { go: 'hello' },
      ],
      hello: {
        say: ['Mind the net. It catches boots rather better than fish at the moment. I am Rowan; Elin is usually somewhere among the cabbages.'],
        options: [
          { text: 'Could you use a hand?', go: 'offer' },
          { text: 'Is this your home?', go: 'home' },
          bye,
        ],
      },
      home: {
        say: ['Ours, yes. You are welcome inside. Elin keeps the garden; I keep promising to mend that chair.', 'Follow the little path east and you will find the jetty. Old Tam is there most days, arguing with the lake.'],
        options: [{ text: 'Could you use a hand?', go: 'offer' }, bye],
      },
      offer: {
        say: ['We are short of dry wood for the hearth. Three ordinary logs would see us through supper.', 'There are ordinary trees along the lake road. Your axe will do. Bring the logs here and I will send you away with two cooked trout and a little coin.'],
        options: [
          { text: 'I will bring three logs.', do: { quest: ['kindling', 1] }, go: 'accepted' },
          { text: 'Perhaps another time.', end: true },
        ],
      },
      accepted: {
        say: ['Thank you. Keep the axe in your pack, face an ordinary tree and use it. Oak is tougher work; plain logs are all we need.', 'You will find me by the nets, at the worktable or down the little path. No hurry.'],
        options: [bye],
      },
      waiting: {
        say: ['Three ordinary logs, whenever you have them. Elin has put the kettle on, so you need not stand on ceremony.'],
        options: [{ text: 'Where should I look?', go: 'trees' }, bye],
      },
      trees: {
        say: ['Try the ordinary trees beside the lake road. Keep your axe with you, look at the trunk and use it. Chopping yields logs.', 'Oak and mountain pine can wait until your arm has had more practice.'],
        options: [bye],
      },
      return: {
        do: { take: [['logs', 3]], complete: 'kindling' },
        say: ['That is just the thing. Dry wood, and enough of it.', 'Here are your trout and 25 coins. Keep the fish for when you are hurt. A warm meal is better in your pack than a brave story.', 'If you are staying a while, say hello to Tam at the jetty. He always has something on his mind. Usually with teeth.'],
        options: [{ text: 'Glad to help.', end: true }],
      },
      after: {
        say: [{ pick: ['The hearth is burning nicely, thanks to you.', 'One net mended, two more to go. The fish are getting ambitious.', 'Elin says we should have you round for supper. That means she likes you.'] }],
        options: [{ text: 'Remind me where Tam is?', go: 'tam' }, bye],
      },
      tam: {
        say: ['Follow our little path east to the jetty. You will hear him grumbling before you see him.'],
        options: [{ text: 'I will look for him.', do: { track: 'gnasher' }, end: true }, bye],
      },
    },
  },
  {
    id: 'elin', name: 'Elin', role: 'gardener', speed: 0.9,
    look: {
      outfit: 'female_peasant', body: 'female', hair: 'hair_buns', eyebrows: 'eyebrows_female',
      hairColor: 'darkbrown', skin: 'olive',
      dye: { torso: 0x8d7558, arms: 0xd2c6a9, legs: 0x4f5b49, feet: 0x4c3b2c }, scale: 0.98, build: 0.97,
    },
    at: { routine: [
      point('tending the garden', -4.7, 6, 60, -Math.PI / 2, 'Fixing_Kneeling'),
      approach(), threshold(), point('inside aisle', 0.1, -0.5, 0, 0, 'Idle_Loop', true),
      point('tending the hearth', -2.05, -0.5, 40, -Math.PI / 2, 'Interact'),
      point('inside aisle', 0.1, -0.5), threshold(true), approach(),
      point('lake path bend', 1.5, 8.5), point('resting by the lake', 10.5, 10.65, 50, 0.3, 'Idle_FoldArms_Loop'),
      point('lake path bend', 1.5, 8.5), approach(),
    ] },
    persona: `Elin tends the little vegetable garden beside the stone cottage she shares with Rowan, west of the lake jetty. Her daytime round takes her from the garden to their hearth and then the lake path. Practical, observant and gently amused by Rowan's never-ending repairs. She welcomes visitors and appreciates simple useful work. Rowan's three-log job is the household's only request. She knows that cooked food heals injuries and that the inn in Ashford has a communal cooking fire.`,
    dialogue: {
      start: [
        { if: { done: 'kindling' }, go: 'thanks' },
        { if: { quest: ['kindling', 1] }, go: 'wood' },
        { go: 'hello' },
      ],
      hello: {
        say: ['Hello there. Take the path, if you would; the little green things are next week\'s supper.', 'I am Elin. Rowan is the one with the nets and the optimistic view of that broken chair. Make yourself at home.'],
        options: [{ text: 'Anything that needs doing?', go: 'help' }, { text: 'I am new to Ashford.', go: 'advice' }, bye],
      },
      help: {
        say: ['Rowan mentioned we were short of firewood. Have a word with him. I would offer you cabbages for the trouble, but he says that puts people off.'],
        options: [bye],
      },
      wood: {
        say: ['You are finding wood for us? That is kind. Rowan will take the three logs when you have them.'],
        options: [{ text: 'I am new to Ashford.', go: 'advice' }, bye],
      },
      thanks: {
        say: ['Thank you for the wood. There is something pleasant about a hearth you do not have to worry about.'],
        options: [{ text: 'I am new to Ashford.', go: 'advice' }, bye],
      },
      advice: {
        say: ['Start small. Gather what you can use, learn your way around, and keep a meal in your pack.', 'Tam can show you the fishing at the jetty. Bring your catch inside; you are welcome to cook at our hearth. Bess also keeps a cooking fire outside her inn in Ashford.', 'The roads will still be there when you are ready to wander.'],
        options: [bye],
      },
    },
  },
];
