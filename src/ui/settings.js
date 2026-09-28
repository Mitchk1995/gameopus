// Settings panel: visual comfort options, saved with your progress.
export const DEFAULT_SETTINGS = { fx: 'medium', glow: 'medium', shake: 'on', numbers: 'all' };

const OPTIONS = [
  { key: 'fx', label: 'Effect brightness', hint: 'How bright spells, sparks and explosions are.', choices: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] },
  { key: 'glow', label: 'Glow', hint: 'The bloom halo around bright things.', choices: [['off', 'Off'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] },
  { key: 'shake', label: 'Screen shake', choices: [['off', 'Off'], ['on', 'On']] },
  { key: 'numbers', label: 'Damage numbers', choices: [['off', 'Off'], ['crits', 'Crits only'], ['all', 'All']] },
];

const FX_GAIN = { low: 0.45, medium: 0.72, high: 1 };
const GLOW = { off: 0, low: 0.22, medium: 0.4, high: 0.6 };

export function applySettings(game) {
  const s = game.settings;
  game.particles.gain = FX_GAIN[s.fx] ?? 0.72;
  game.fx.gain = FX_GAIN[s.fx] ?? 0.72;
  const glow = GLOW[s.glow] ?? 0.4;
  game.gfx.bloom.enabled = glow > 0;
  game.gfx.bloom.strength = glow;
  game.shakeScale = s.shake === 'off' ? 0 : 1;
}

export class SettingsUI {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.panel = document.createElement('section');
    this.panel.className = 'panel settings';
    this.panel.hidden = true;
    this.panel.setAttribute('aria-label', 'Settings');
    document.getElementById('app').appendChild(this.panel);
    this.panel.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-k]');
      if (b) {
        game.settings[b.dataset.k] = b.dataset.v;
        game.save.settings = game.settings;
        applySettings(game);
        game.persist();
        game.audio.play('click');
        this.render();
      }
      if (e.target.closest('.x')) this.toggle(false);
    });
  }

  toggle(force) {
    this.open = force ?? !this.open;
    this.panel.hidden = !this.open;
    if (this.open) {
      this.game.inventory.toggle(false);
      this.game.inventory.toggleCodex(false);
      this.render();
    }
  }

  render() {
    const s = this.game.settings;
    const rows = OPTIONS.map((o) => `
      <div class="opt">
        <div><div class="ol">${o.label}</div>${o.hint ? `<div class="oh">${o.hint}</div>` : ''}</div>
        <div class="seg" role="group" aria-label="${o.label}">${o.choices
          .map(([v, l]) => `<button type="button" data-k="${o.key}" data-v="${v}" aria-pressed="${s[o.key] === v}">${l}</button>`)
          .join('')}</div>
      </div>`).join('');
    this.panel.innerHTML = `<header><h2>Settings</h2><button class="x" type="button" aria-label="Close settings">✕</button></header>
      <div class="opts">${rows}</div>
      <p class="foot">Press O to open this panel. M toggles sound.</p>`;
  }
}
