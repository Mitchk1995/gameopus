import './hud.css';
import { el } from './dom.js';

const CONTROLS = [
  ['W A S D', 'Move (jog)'], ['Mouse', 'Look'],
  ['Shift', 'Hold to run, tap to dodge roll'], ['Space', 'Jump'],
  ['LMB', 'Attack (chain 3); hold to draw a bow or cast'], ['F', 'Heavy attack'],
  ['RMB', 'Block, tap to parry; steady your aim'], ['Q', 'Lock on'],
  ['E', 'Use / talk'], ['Tab', 'Pack'],
  ['K', 'Skills'], ['J', 'Quests'],
  ['C', 'Collection log'], ['Esc', 'Free the mouse'],
];

// The screen overlay: loading, the pause card, crosshair and the "E to ..." prompt.
export class Hud {
  constructor() {
    this.root = el('div', 'hud');
    this.cross = el('div', 'crosshair');
    this.ring = el('div', 'aimring');
    this.ring.hidden = true;
    this.ammoEl = el('div', 'ammo');
    this.ammoEl.hidden = true;
    this.prompt = el('div', 'prompt');
    this.toastEl = el('div', 'toast');
    this.root.append(this.cross, this.ring, this.ammoEl, this.prompt, this.toastEl);
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
      <div class="controls">${CONTROLS.map(([k, v]) => `<span class="key">${k}</span><span>${v}</span>`).join('')}</div>
      <div class="settings">
        <label>Graphics <span class="seg" role="radiogroup">
          <button data-q="high">High</button><button data-q="medium">Medium</button><button data-q="low">Low</button></span></label>
        <label for="sens">Mouse <input id="sens" type="range" min="0.3" max="2.5" step="0.05"></label>
      </div></div>`);
    document.body.append(this.pause);
    this.playButton = this.pause.querySelector('.play');
    this.pause.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => this.onQuality?.(b.dataset.q)));
    this.sens = this.pause.querySelector('#sens');
    this.sens.addEventListener('input', () => this.onSensitivity?.(+this.sens.value));
    this.lastPrompt = '';
  }

  showSettings({ quality, sensitivity }) {
    this.pause.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.q === quality)));
    this.sens.value = sensitivity;
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

  // Aiming a bow or a staff: the ring tightens as the shot is drawn.
  setAim(a) {
    this.ring.hidden = this.ammoEl.hidden = !a;
    if (!a) return;
    const k = a.draw;
    this.ring.style.transform = `translate(-50%, -50%) scale(${(1.9 - k * 0.9).toFixed(3)})`;
    this.ring.classList.toggle('full', k >= 1);
    this.ring.classList.toggle('staff', a.style === 'staff');
    if (this.ammoEl.textContent !== a.label) this.ammoEl.textContent = a.label;
  }

  // target: { verb, noun, level? } or null
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

  // A quick fade to black and back, for going underground.
  fade(on) {
    if (!this.fadeEl) {
      this.fadeEl = el('div', 'fader');
      document.body.append(this.fadeEl);
    }
    this.fadeEl.classList.toggle('on', on);
  }

  toast(title, sub = '', ms = 2600) {
    this.toastEl.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }
}
