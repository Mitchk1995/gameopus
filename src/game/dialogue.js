// Runs the dialogue trees in src/content/people.js: picks the node whose conditions
// hold, pages through its lines, runs its effects, and offers its replies. When the
// viewer can use Claude, a typing line lets you say anything, and the person
// answers in character (see chat.js); the reply options stay underneath.

export class Dialogue {
  constructor(game) {
    this.game = game;
    this.npc = null;
  }

  open(npc) {
    this.npc = npc;
    this.game.chat.reset(npc);
    this.#go('start');
  }

  close() {
    this.npc = null;
    this.game.chat.cancel();
  }

  // Follows branch lists to the node that applies.
  #resolve(id) {
    const tree = this.npc.def.dialogue;
    let node = tree[id];
    for (let guard = 0; Array.isArray(node) && guard < 12; guard++) {
      const b = node.find((br) => this.game.quests.check(br.if));
      if (!b) return null;
      node = tree[b.go];
    }
    return node || null;
  }

  #go(id) {
    const node = this.#resolve(id);
    if (!node) return this.game.endTalk();
    if (node.do && this.#effect(node.do)) return;
    this.node = node;
    this.pages = this.#lines(node.say);
    this.page = 0;
    this.#show();
  }

  // Expands a node's lines: conditional lines, random picks, narration.
  #lines(say = []) {
    const Q = this.game.quests;
    const out = [];
    for (const line of [say].flat()) {
      if (typeof line === 'string') out.push({ text: line, kind: 'say' });
      else if (line.pick) {
        const pool = line.pick.filter((l) => typeof l === 'string' || Q.check(l.if));
        const p = pool[Math.floor(Math.random() * pool.length)];
        if (p) out.push({ text: typeof p === 'string' ? p : p.text, kind: 'say' });
      } else if (line.narrate) out.push({ text: line.narrate, kind: 'narrate' });
      else if (line.me) out.push({ text: line.me, kind: 'me' });
      else if (line.text && Q.check(line.if)) out.push({ text: line.text, kind: 'say' });
    }
    return out.length ? out : [{ text: '...', kind: 'say' }];
  }

  #show() {
    const line = this.pages[this.page];
    const last = this.page >= this.pages.length - 1;
    const options = last ? this.#options() : [{ label: 'Continue.', run: () => (this.page++, this.#show()) }];
    this.game.talk.show(this.npc.name, line.text, options, { kind: line.kind, onSay: this.game.chat.available ? (t) => this.#type(t) : null });
  }

  #options() {
    const n = this.node;
    if (n.options) {
      const opts = n.options.filter((o) => this.game.quests.check(o.if));
      return opts.map((o) => ({ label: o.text, run: () => this.#choose(o) }));
    }
    if (n.next) return [{ label: 'Continue.', run: () => this.#go(n.next) }];
    return [{ label: 'Goodbye.', run: () => this.game.endTalk() }];
  }

  #choose(o) {
    if (o.do && this.#effect(o.do)) return;
    if (o.go) return this.#go(o.go);
    this.game.endTalk();
  }

  // Runs an effect; true when it took over (a shop or the bank opened).
  #effect(d) {
    const g = this.game;
    g.quests.apply(d);
    if (d.shop) {
      g.endTalk(false);
      g.openShop(d.shop);
      return true;
    }
    if (d.bank) {
      g.endTalk(false);
      g.openBank();
      return true;
    }
    return false;
  }

  // Typed chat: the answer streams into the box; the reply options stay.
  #type(text) {
    const npc = this.npc, talk = this.game.talk;
    if (!npc) return;
    talk.you(text);
    talk.said('...', { thinking: true });
    talk.setBusy(true);
    this.game.chat.ask(npc, text, {
      stream: (t) => this.npc === npc && talk.said(t),
      done: () => this.npc === npc && talk.setBusy(false),
      fail: (msg, hide) => {
        if (this.npc !== npc) return;
        talk.said(msg, { kind: 'narrate' });
        talk.setBusy(false);
        if (hide) talk.hideTyping();
      },
    });
  }
}
