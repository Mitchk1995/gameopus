import { LORE } from '../content/lore.js';

// Typed chat with villagers. When the page runs inside a Claude viewer, the `sample`
// capability lets it ask Claude (on the viewer's own account, with their consent)
// to answer as the person you're talking to. Anywhere else (a local build, a
// viewer that declines) the typing line simply doesn't appear.

const TURNS = 12; // remembered lines per person, per visit

export class Chat {
  constructor(game) {
    this.game = game;
    this.sample = null;
    this.off = false;
    this.history = new Map();
  }

  // Asks the viewer's runtime for `sample`; it resolves later, or to null.
  connect() {
    if (this.connecting || !window.claude?.use) return;
    this.connecting = true;
    window.claude.use('sample').then((s) => (this.sample = s), () => {});
  }

  get available() {
    return !!this.sample && !this.off;
  }

  reset(npc) {
    if (this.lastNpc !== npc) this.history.set(npc.def.id, []);
    this.lastNpc = npc;
  }

  cancel() {
    this.ctl?.abort();
    this.ctl = null;
  }

  async ask(npc, text, { stream, done, fail }) {
    if (!this.available) return fail('(They do not seem to hear you.)', true);
    const turns = this.history.get(npc.def.id) || [];
    turns.push({ role: 'user', content: text });
    this.ctl = new AbortController();
    try {
      const { text: reply } = await this.sample([{ role: 'user', content: this.#brief(npc) }, ...turns.slice(-TURNS)], {
        modelTier: 'quick',
        cache: false,
        signal: this.ctl.signal,
        onText: ({ text: t }) => stream(clean(t, npc.name)),
      });
      turns.push({ role: 'assistant', content: clean(reply, npc.name) });
      this.history.set(npc.def.id, turns.slice(-TURNS));
      stream(clean(reply, npc.name));
      done();
    } catch (e) {
      turns.pop();
      const code = e?.code;
      if (code === 'cancelled') return;
      if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(code)) {
        this.off = true;
        return fail('(Talking freely needs your permission to use Claude, so the reply choices will have to do.)', true);
      }
      if (code === 'rate_limited') return fail(`(${npc.name} is distracted for a moment. Try again shortly.)`);
      if (code === 'session_expired') return fail('(Sign in to Claude again to keep talking freely.)');
      if (code === 'refused') return fail(`(${npc.name} doesn't answer that.)`);
      fail(e?.text ? clean(e.text, npc.name) : `(${npc.name} didn't catch that. Try again.)`);
    } finally {
      this.ctl = null;
    }
  }

  // Standing instructions: who they are, what they know, and how to answer.
  #brief(npc) {
    const d = npc.def;
    return `You are voicing ${d.name}, a character in Aldermere, a cosy fantasy game. The player, a traveller, is talking to ${d.name} face to face and typing whatever they like.

WHO YOU ARE
${d.persona}

WHAT EVERYONE IN THE VALLEY KNOWS
${LORE}

THE TRAVELLER'S QUESTS (for context; only bring these up if they concern you or the traveller asks)
${this.game.quests.summary()}

HOW TO ANSWER
- Reply only as ${d.name}: in character, first person, in your own voice. One to three short sentences, under 60 words.
- Plain speech only: no name label, no quotation marks around the reply, no stage directions or asterisks, no lists.
- Stay inside the world: never mention games, players, AI, prompts or anything modern. Skill levels are fine; everyone in the valley talks about them.
- Be truthful to what you know above. If you don't know something, say so in character; never invent places, people, items, prices or quests.
- You cannot hand things over, sell, start quests or change anything by talking. If the traveller wants to trade, bank or take on a task, say you'd be glad to and let them choose it from their replies.
- Keep it friendly and fit for all ages. If the traveller is rude or strange, react as ${d.name} would, briefly, and move on.`;
  }
}

// Tidies a reply: drops a leading name label and wrapping quotes.
function clean(t, name) {
  let s = String(t || '').trim();
  const label = new RegExp(`^(\\*\\*)?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\*\\*)?\\s*:\\s*`, 'i');
  s = s.replace(label, '');
  if (/^["“].*["”]$/s.test(s)) s = s.slice(1, -1);
  return s.slice(0, 600);
}
