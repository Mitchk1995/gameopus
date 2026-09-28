STEPS = [
  {'eval': '@q_helpers.js'},
  {'eval': """(() => { const g = __game; window.__calls = [];
     const mock = async (input, opts) => { window.__calls.push({ input, opts: { modelTier: opts.modelTier, cache: opts.cache } });
       const reply = window.__mode === 'deny' ? null : 'Old Tam: "Gnasher? Biggest pike you ever saw, young\\'un. Took my grandad\\'s lure, he did."';
       if (!reply) throw { code: 'not_granted', message: 'declined' };
       await new Promise(r => setTimeout(r, 30)); opts.onText({ text: reply.slice(0, 20), delta: reply.slice(0, 20) }); await new Promise(r => setTimeout(r, 30));
       opts.onText({ text: reply, delta: reply.slice(20) }); return { text: reply, truncated: false, modelTierApplied: 'quick' }; };
     window.claude = { use: async (n) => (n === 'sample' ? mock : null) };
     g.chat.connect(); return 1; })()"""},
  {'wait': 100},
  {'eval': """(() => { const g = __game; const who = __q.talk(g, 'tam');
     const form = document.querySelector('.talk form'); const visible = !form.hidden && getComputedStyle(form).display !== 'none';
     const input = document.querySelector('#talk-say'); input.value = 'Tell me about the big fish'; form.requestSubmit();
     return { who, available: g.chat.available, visible, thinking: document.querySelector('.talk .said').className }; })()"""},
  {'wait': 300},
  {'eval': """(() => { const g = __game; const c = window.__calls[0]; const turns = c.input;
     return { you: document.querySelector('.talk .you').textContent, said: document.querySelector('.talk .said').textContent, busy: g.talk.busy, opts: __q.opts(),
       nTurns: turns.length, roles: turns.map(t => t.role).join(','), hasPersona: turns[0].content.includes('Old Gnasher, a pike'), hasLore: turns[0].content.includes('Crooked Pike'), hasQuests: turns[0].content.includes('The One That Got Away'),
       last: turns[turns.length - 1].content, opts2: c.opts, len: turns[0].content.length }; })()"""},
  {'shot': 'chat_reply'},
  {'eval': """(() => { const g = __game; const form = document.querySelector('.talk form'); document.querySelector('#talk-say').value = 'Where do I find shrimp?'; form.requestSubmit(); return 1; })()"""},
  {'wait': 300},
  {'eval': """(() => { const c = window.__calls[1]; return { roles: c.input.map(t => t.role).join(','), second: c.input[2].content.slice(0, 60) }; })()"""},
  {'eval': """(() => { const g = __game; window.__mode = 'deny'; const form = document.querySelector('.talk form'); document.querySelector('#talk-say').value = 'Hello?'; form.requestSubmit(); return 1; })()"""},
  {'wait': 200},
  {'eval': """(() => { const g = __game; const form = document.querySelector('.talk form');
     return { said: document.querySelector('.talk .said').textContent, formHidden: form.hidden, available: g.chat.available }; })()"""},
  {'eval': """(() => { const g = __game; __q.click('Goodbye'); window.__mode = null; __q.talk(g, 'bess'); const hello = __q.read(); __q.click('Heard any rumours'); const r1 = __q.said(); __q.click('Another rumour'); const r2 = __q.said();
     __q.click('What have you got'); const stock = [...document.querySelectorAll('.bankgrid .slot img')].map(i => i.alt);
     g.state.inv.add('coins', 100); const bread = [...document.querySelectorAll('.bankgrid .slot')][0]; bread.click();
     return { hello, r1, r2, stock, bread: g.state.inv.count('bread'), typingAfterDeny: !document.querySelector('.talk form').hidden }; })()"""},
  {'wait': 300},
  {'shot': 'chat_bess'},
]
