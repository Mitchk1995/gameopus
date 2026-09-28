import './hud.css';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

const CONTROLS = [
  ['W A S D', 'Move'], ['Mouse', 'Look'],
  ['Shift', 'Sprint'], ['Space', 'Roll'],
  ['E', 'Use / talk'], ['Z', 'Walk toggle'],
  ['Wheel', 'Zoom'], ['Esc', 'Free the mouse'],
];

// The screen overlay: loading, the pause card, crosshair and the "E to ..." prompt.
export class Hud {
  constructor() {
    this.root = el('div', 'hud');
    this.cross = el('div', 'crosshair');
    this.prompt = el('div', 'prompt');
    this.toastEl = el('div', 'toast');
    this.root.append(this.cross, this.prompt, this.toastEl);
    document.body.append(this.root);

    this.loading = el('div', 'screen loading', `<div class="card">
      <h1 class="title">Aldermere</h1>
      <p class="subtitle">The valley of Ashford</p>
      <div class="bar"><i></i></div>
      <div class="status">Loading</div></div>`);
    document.body.append(this.loading);

    this.pause = el('div', 'screen hidden', `<div class="card">
      <h1 class="title">Aldermere</h1>
      <p class="subtitle">The valley of Ashford</p>
      <button class="play">Enter the world</button>
      <div class="controls">${CONTROLS.map(([k, v]) => `<span class="key">${k}</span><span>${v}</span>`).join('')}</div></div>`);
    document.body.append(this.pause);
    this.playButton = this.pause.querySelector('.play');
    this.lastPrompt = '';
  }

  progress(f, text) {
    this.loading.querySelector('.bar > i').style.width = `${Math.round(f * 100)}%`;
    if (text) this.loading.querySelector('.status').textContent = text;
  }

  ready() {
    this.loading.classList.add('hidden');
    setTimeout(() => this.loading.remove(), 400);
  }

  setPaused(paused, label) {
    this.pause.classList.toggle('hidden', !paused);
    if (label) this.playButton.textContent = label;
  }

  // target: { verb, noun, level?, locked? } or null
  setPrompt(target) {
    const key = target ? `${target.verb}|${target.noun}|${target.level || ''}` : '';
    if (key === this.lastPrompt) return;
    this.lastPrompt = key;
    this.cross.classList.toggle('live', !!target);
    this.prompt.classList.toggle('show', !!target);
    if (!target) return;
    const lvl = target.level ? ` <span class="lvl">(needs ${target.level})</span>` : '';
    this.prompt.innerHTML = `<span class="key">E</span><span class="verb">${target.verb}</span> <span class="noun">${target.noun}</span>${lvl}`;
  }

  toast(title, sub = '', ms = 2600) {
    this.toastEl.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }
}
