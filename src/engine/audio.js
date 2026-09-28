// Procedural sound: every effect is synthesised with WebAudio (noise bursts, filtered
// sweeps, inharmonic metal partials), so there are no files to load. Sounds placed in
// the world are panned and quietened with distance from the listener.

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.7;
    this.listener = { x: 0, z: 0, yaw: 0 };
  }

  // Browsers only allow sound after a click or key press.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    this.noise = this.#noiseBuffer();
    this.#ambience();
  }

  setListener(x, z, yaw) {
    this.listener.x = x;
    this.listener.z = z;
    this.listener.yaw = yaw;
  }

  #noiseBuffer() {
    const len = this.ctx.sampleRate * 1.5;
    const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // An output node for a sound at a world position (or none for UI sounds).
  #out(at, gain = 1) {
    const g = this.ctx.createGain();
    let vol = gain;
    let node = g;
    if (at) {
      const dx = at.x - this.listener.x, dz = at.z - this.listener.z, d = Math.hypot(dx, dz);
      vol *= 1 / (1 + d * 0.12);
      if (d > 40) return null;
      if (this.ctx.createStereoPanner) {
        const p = this.ctx.createStereoPanner();
        // Camera right is (cos yaw, -sin yaw).
        const right = (dx * Math.cos(this.listener.yaw) - dz * Math.sin(this.listener.yaw)) / Math.max(1, d);
        p.pan.value = Math.max(-0.8, Math.min(0.8, right));
        g.connect(p);
        p.connect(this.master);
      } else g.connect(this.master);
    } else g.connect(this.master);
    g.gain.value = vol;
    return node;
  }

  #noise(out, { t = 0, dur = 0.2, type = 'bandpass', f0 = 1000, f1 = f0, q = 1, gain = 1, attack = 0.005 }) {
    const c = this.ctx, now = c.currentTime + t;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, now);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(f).connect(g).connect(out);
    src.start(now, Math.random() * 1.0);
    src.stop(now + dur + 0.05);
  }

  #tone(out, { t = 0, dur = 0.3, freq = 440, freq1 = freq, type = 'sine', gain = 0.5, attack = 0.004 }) {
    const c = this.ctx, now = c.currentTime + t;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, now);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq1), now + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(out);
    o.start(now);
    o.stop(now + dur + 0.05);
  }

  play(name, at = null, gain = 1) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const out = this.#out(at, gain);
    if (!out) return;
    const r = () => 0.9 + Math.random() * 0.2;
    switch (name) {
      case 'swing':
        this.#noise(out, { dur: 0.22, type: 'bandpass', f0: 700 * r(), f1: 2600, q: 1.2, gain: 0.5, attack: 0.05 });
        break;
      case 'heavy':
        this.#noise(out, { dur: 0.38, type: 'bandpass', f0: 380 * r(), f1: 1500, q: 1.1, gain: 0.7, attack: 0.1 });
        break;
      case 'hit':
        this.#noise(out, { dur: 0.16, type: 'lowpass', f0: 2200, f1: 300, q: 0.8, gain: 0.9 });
        this.#tone(out, { dur: 0.14, freq: 140 * r(), freq1: 60, type: 'sine', gain: 0.8 });
        break;
      case 'crit':
        this.#noise(out, { dur: 0.22, type: 'lowpass', f0: 3000, f1: 250, q: 0.8, gain: 1 });
        this.#tone(out, { dur: 0.2, freq: 110, freq1: 45, type: 'sine', gain: 1 });
        this.#metal(out, 1300, 0.35, 0.3);
        break;
      case 'block':
        this.#metal(out, 900 * r(), 0.28, 0.5);
        this.#noise(out, { dur: 0.08, type: 'highpass', f0: 3000, q: 0.7, gain: 0.35 });
        break;
      case 'parry':
        this.#metal(out, 1500 * r(), 0.9, 0.7);
        this.#tone(out, { dur: 0.6, freq: 2400, freq1: 2300, type: 'sine', gain: 0.25 });
        break;
      case 'miss':
        this.#noise(out, { dur: 0.12, type: 'bandpass', f0: 1800, f1: 3000, q: 2, gain: 0.25 });
        break;
      case 'hurt':
        this.#tone(out, { dur: 0.18, freq: 220 * r(), freq1: 120, type: 'triangle', gain: 0.35 });
        this.#noise(out, { dur: 0.12, type: 'lowpass', f0: 1500, f1: 200, gain: 0.6 });
        break;
      case 'roll':
        this.#noise(out, { dur: 0.35, type: 'lowpass', f0: 900, f1: 200, q: 0.6, gain: 0.35, attack: 0.04 });
        break;
      case 'chop':
        this.#tone(out, { dur: 0.09, freq: 320 * r(), freq1: 180, type: 'triangle', gain: 0.6 });
        this.#noise(out, { dur: 0.1, type: 'bandpass', f0: 1200, f1: 600, q: 2, gain: 0.5 });
        break;
      case 'mine':
        this.#metal(out, 2100 * r(), 0.22, 0.45);
        this.#noise(out, { dur: 0.08, type: 'highpass', f0: 2500, q: 0.7, gain: 0.3 });
        break;
      case 'splash':
        this.#noise(out, { dur: 0.45, type: 'bandpass', f0: 1800, f1: 500, q: 0.7, gain: 0.45, attack: 0.02 });
        break;
      case 'hammer':
        this.#metal(out, 1200 * r(), 0.35, 0.55);
        break;
      case 'sizzle':
        this.#noise(out, { dur: 0.7, type: 'highpass', f0: 4000, f1: 6000, q: 0.5, gain: 0.25, attack: 0.05 });
        break;
      case 'pickup':
        this.#tone(out, { dur: 0.12, freq: 660, freq1: 880, type: 'triangle', gain: 0.25 });
        break;
      case 'coins':
        for (let i = 0; i < 3; i++) this.#metal(out, 3000 + Math.random() * 1500, 0.12, 0.15, i * 0.05);
        break;
      case 'click':
        this.#tone(out, { dur: 0.05, freq: 900, freq1: 700, type: 'triangle', gain: 0.15 });
        break;
      case 'levelup':
        [0, 4, 7, 12].forEach((n, i) => this.#tone(out, { t: i * 0.11, dur: 0.5, freq: 523.25 * Math.pow(2, n / 12), type: 'triangle', gain: 0.3 }));
        [0, 7, 12].forEach((n) => this.#tone(out, { t: 0.45, dur: 1.1, freq: 523.25 * Math.pow(2, n / 12), type: 'sine', gain: 0.18 }));
        break;
      case 'death':
        this.#tone(out, { dur: 1.2, freq: 196, freq1: 98, type: 'triangle', gain: 0.4 });
        this.#tone(out, { t: 0.1, dur: 1.2, freq: 233, freq1: 116, type: 'sine', gain: 0.25 });
        break;
      case 'tell':
        this.#tone(out, { dur: 0.25, freq: 1800, freq1: 2600, type: 'sine', gain: 0.18 });
        break;
      case 'fire':
        this.#noise(out, { dur: 0.5, type: 'bandpass', f0: 600, f1: 1400, q: 0.8, gain: 0.5, attack: 0.05 });
        this.#tone(out, { dur: 0.4, freq: 180, freq1: 90, type: 'sawtooth', gain: 0.08 });
        break;
      case 'draw':
        // The creak of a bow coming to full draw.
        this.#noise(out, { dur: 0.55, type: 'bandpass', f0: 380, f1: 900, q: 6, gain: 0.18, attack: 0.25 });
        break;
      case 'bow':
        this.#tone(out, { dur: 0.16, freq: 190 * r(), freq1: 150, type: 'triangle', gain: 0.45 });
        this.#noise(out, { dur: 0.18, type: 'bandpass', f0: 2600, f1: 900, q: 1.4, gain: 0.35, attack: 0.01 });
        break;
      case 'thunk':
        this.#tone(out, { dur: 0.08, freq: 260 * r(), freq1: 120, type: 'triangle', gain: 0.4 });
        this.#noise(out, { dur: 0.06, type: 'lowpass', f0: 1400, f1: 300, gain: 0.35 });
        break;
      case 'charge':
        this.#tone(out, { dur: 0.45, freq: 320, freq1: 780, type: 'sine', gain: 0.12, attack: 0.2 });
        this.#noise(out, { dur: 0.45, type: 'bandpass', f0: 1500, f1: 4200, q: 3, gain: 0.12, attack: 0.2 });
        break;
      case 'cast':
        this.#tone(out, { dur: 0.3, freq: 880 * r(), freq1: 330, type: 'sine', gain: 0.22 });
        this.#noise(out, { dur: 0.35, type: 'bandpass', f0: 3200, f1: 700, q: 1.6, gain: 0.35, attack: 0.02 });
        break;
      case 'zap':
        this.#noise(out, { dur: 0.3, type: 'highpass', f0: 2500, f1: 800, q: 0.8, gain: 0.4 });
        this.#tone(out, { dur: 0.2, freq: 520 * r(), freq1: 180, type: 'square', gain: 0.05 });
        break;
      case 'step':
        this.#noise(out, { dur: 0.07, type: 'lowpass', f0: 700 * r(), f1: 200, q: 0.5, gain: 0.12 });
        break;
      default:
        break;
    }
  }

  // Struck metal: a few inharmonic partials with a quick decay.
  #metal(out, f, dur, gain, t = 0) {
    for (const [k, a] of [[1, 1], [2.76, 0.5], [5.4, 0.3], [8.93, 0.15]]) this.#tone(out, { t, dur: dur / Math.sqrt(k), freq: f * k, type: 'sine', gain: gain * a * 0.4, attack: 0.002 });
  }

  // Wind and the odd bird, very quietly, so the world isn't silent.
  #ambience() {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 380;
    const g = c.createGain();
    g.gain.value = 0.035;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = c.createGain();
    lg.gain.value = 0.02;
    lfo.connect(lg).connect(g.gain);
    src.connect(f).connect(g).connect(this.master);
    src.start();
    lfo.start();
    const bird = () => {
      if (this.ctx.state === 'running' && !this.indoors) {
        const out = this.ctx.createGain();
        out.gain.value = 0.05 + Math.random() * 0.05;
        out.connect(this.master);
        const base = 2400 + Math.random() * 1600;
        const n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) this.#tone(out, { t: i * (0.09 + Math.random() * 0.05), dur: 0.08, freq: base * (1 + Math.random() * 0.3), freq1: base * (0.8 + Math.random() * 0.5), type: 'sine', gain: 0.5 });
      }
      setTimeout(bird, 3000 + Math.random() * 9000);
    };
    setTimeout(bird, 4000);
  }
}
