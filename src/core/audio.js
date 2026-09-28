// Every sound in the game is synthesized here. No audio files.
export class Sound {
  constructor() {
    this.ctx = null;
    this.last = Object.create(null);
    this.muted = false;
  }

  init() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 5;
    this.master.connect(comp).connect(ctx.destination);

    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);

    // Generated reverb impulse: a dark stone hall.
    const len = ctx.sampleRate * 2.8;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    this.verb = ctx.createConvolver();
    this.verb.buffer = ir;
    this.verbIn = ctx.createGain();
    this.verbIn.gain.value = 0.9;
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.35;
    this.verbIn.connect(this.verb).connect(verbOut).connect(this.master);

    const nlen = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;

    this.#ambience();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  gate(name, gap) {
    if (!this.ctx) return false;
    const t = this.ctx.currentTime;
    if (this.last[name] !== undefined && t - this.last[name] < gap) return false;
    this.last[name] = t;
    return true;
  }

  #out(node, verb) {
    node.connect(this.sfx);
    if (verb > 0) {
      const s = this.ctx.createGain();
      s.gain.value = verb;
      node.connect(s).connect(this.verbIn);
    }
  }

  tone({ type = 'sine', f0 = 440, f1 = f0, dur = 0.2, vol = 0.2, attack = 0.004, verb = 0, delay = 0, detune = 0 }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.detune.value = detune;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    o.connect(g);
    this.#out(g, verb);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  noiseBurst({ filter = 'bandpass', f0 = 1000, f1 = f0, q = 1, dur = 0.15, vol = 0.2, attack = 0.003, verb = 0, delay = 0 }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    src.connect(f).connect(g);
    this.#out(g, verb);
    src.start(t, Math.random() * 0.5);
    src.stop(t + attack + dur + 0.05);
  }

  play(name, opt = {}) {
    if (!this.ctx || this.muted) return;
    const fn = SOUNDS[name];
    if (fn) fn(this, opt);
  }

  // Slow generative drone + distant bells in a minor mode.
  #ambience() {
    const ctx = this.ctx;
    const pad = ctx.createGain();
    pad.gain.value = 0.0;
    pad.gain.linearRampToValueAtTime(0.11, ctx.currentTime + 6);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    lp.Q.value = 3;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 140;
    lfo.connect(lfoAmt).connect(lp.frequency);
    lfo.start();
    for (const [f, d] of [[55, -7], [55, 6], [82.4, 0], [110, 3]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = d;
      o.connect(lp);
      o.start();
    }
    lp.connect(pad);
    pad.connect(this.master);
    const s = ctx.createGain();
    s.gain.value = 0.4;
    pad.connect(s).connect(this.verbIn);

    const scale = [220, 261.6, 293.7, 329.6, 392, 440, 523.3];
    const bell = () => {
      if (!this.muted && document.visibilityState === 'visible') {
        const f = scale[Math.floor(Math.random() * scale.length)] * (Math.random() < 0.3 ? 0.5 : 1);
        this.tone({ type: 'sine', f0: f, dur: 3.5, vol: 0.035, attack: 0.02, verb: 1.2 });
        this.tone({ type: 'sine', f0: f * 2.76, dur: 1.4, vol: 0.01, attack: 0.02, verb: 1.2 });
      }
      setTimeout(bell, 2500 + Math.random() * 6000);
    };
    setTimeout(bell, 3000);
  }
}

const SOUNDS = {
  swing(s) {
    if (!s.gate('swing', 0.05)) return;
    s.noiseBurst({ filter: 'bandpass', f0: 2600, f1: 500, q: 1.4, dur: 0.14, vol: 0.2 });
  },
  hit(s, { crit }) {
    if (!s.gate('hit', 0.035)) return;
    s.tone({ type: 'sine', f0: crit ? 240 : 170, f1: 45, dur: 0.12, vol: crit ? 0.45 : 0.3 });
    s.noiseBurst({ filter: 'highpass', f0: 2500, dur: 0.05, vol: crit ? 0.25 : 0.12 });
  },
  kill(s) {
    if (!s.gate('kill', 0.045)) return;
    s.tone({ type: 'triangle', f0: 130, f1: 38, dur: 0.2, vol: 0.28 });
    s.noiseBurst({ filter: 'lowpass', f0: 1400, f1: 180, dur: 0.22, vol: 0.2 });
  },
  bolt(s) {
    if (!s.gate('bolt', 0.05)) return;
    s.tone({ type: 'sawtooth', f0: 1100, f1: 260, dur: 0.14, vol: 0.06, verb: 0.3 });
    s.tone({ type: 'sine', f0: 700, f1: 1400, dur: 0.1, vol: 0.06 });
  },
  boltHit(s) {
    if (!s.gate('boltHit', 0.05)) return;
    s.noiseBurst({ filter: 'bandpass', f0: 1800, f1: 600, q: 2, dur: 0.09, vol: 0.14 });
  },
  nova(s) {
    s.noiseBurst({ filter: 'lowpass', f0: 6000, f1: 250, dur: 0.7, vol: 0.4, verb: 0.6 });
    s.tone({ type: 'sine', f0: 1600, f1: 300, dur: 0.6, vol: 0.08, verb: 0.8 });
    s.tone({ type: 'triangle', f0: 90, f1: 40, dur: 0.4, vol: 0.3 });
  },
  zap(s) {
    if (!s.gate('zap', 0.06)) return;
    for (let i = 0; i < 3; i++) s.noiseBurst({ filter: 'highpass', f0: 3500 + i * 1200, dur: 0.05, vol: 0.18, delay: i * 0.03 });
    s.tone({ type: 'square', f0: 110, f1: 60, dur: 0.12, vol: 0.05 });
  },
  dash(s) {
    s.noiseBurst({ filter: 'bandpass', f0: 350, f1: 2400, q: 1.2, dur: 0.2, vol: 0.2 });
  },
  fire(s) {
    if (!s.gate('fire', 0.12)) return;
    s.noiseBurst({ filter: 'lowpass', f0: 900, f1: 300, dur: 0.3, vol: 0.12 });
  },
  gold(s) {
    if (!s.gate('gold', 0.04)) return;
    const b = 2000 + Math.random() * 400;
    s.tone({ type: 'sine', f0: b, dur: 0.07, vol: 0.06 });
    s.tone({ type: 'sine', f0: b * 1.5, dur: 0.12, vol: 0.05, delay: 0.045 });
  },
  shard(s) {
    if (!s.gate('shard', 0.05)) return;
    s.tone({ type: 'triangle', f0: 1318, dur: 0.18, vol: 0.05, verb: 0.4 });
  },
  orb(s) {
    s.tone({ type: 'sine', f0: 300, f1: 700, dur: 0.25, vol: 0.12, verb: 0.3 });
  },
  dropMagic(s) {
    if (!s.gate('dropMagic', 0.06)) return;
    s.tone({ type: 'sine', f0: 880, dur: 0.3, vol: 0.09, verb: 0.4 });
  },
  dropRare(s) {
    if (!s.gate('dropRare', 0.08)) return;
    s.tone({ type: 'sine', f0: 659, dur: 0.35, vol: 0.12, verb: 0.5 });
    s.tone({ type: 'sine', f0: 988, dur: 0.5, vol: 0.12, verb: 0.5, delay: 0.09 });
  },
  dropUnique(s, { ascendant }) {
    // Rising shimmer, then a bell chord with a low boom under it.
    s.noiseBurst({ filter: 'bandpass', f0: 300, f1: 5000, q: 3, dur: 0.45, vol: 0.12, verb: 0.6 });
    const root = ascendant ? 392 : 523.25;
    const partials = [1, 2.76, 5.4, 8.93];
    const chord = ascendant ? [1, 1.189, 1.498, 2] : [1, 1.26, 1.5, 2];
    chord.forEach((c, i) => {
      partials.forEach((p, j) => {
        s.tone({ type: 'sine', f0: root * c * p, dur: 2.6 - j * 0.5, vol: 0.07 / (j + 1), delay: 0.42 + i * 0.07, verb: 1 });
      });
    });
    s.tone({ type: 'sine', f0: 75, f1: 32, dur: 1.4, vol: 0.55, delay: 0.42 });
    s.noiseBurst({ filter: 'highpass', f0: 7000, dur: 1.6, vol: 0.05, delay: 0.42, verb: 1 });
    if (ascendant) {
      for (const f of [196, 233, 294, 392]) s.tone({ type: 'sawtooth', f0: f, dur: 3, vol: 0.02, attack: 0.6, delay: 0.5, verb: 1.2, detune: 8 });
    }
  },
  levelUp(s) {
    [523, 659, 784, 1047, 1319].forEach((f, i) => s.tone({ type: 'triangle', f0: f, dur: 0.5, vol: 0.12, delay: i * 0.08, verb: 0.7 }));
  },
  hurt(s) {
    if (!s.gate('hurt', 0.18)) return;
    s.noiseBurst({ filter: 'lowpass', f0: 700, f1: 200, dur: 0.18, vol: 0.3 });
    s.tone({ type: 'sine', f0: 110, f1: 60, dur: 0.15, vol: 0.2 });
  },
  potion(s) {
    for (let i = 0; i < 4; i++) s.tone({ type: 'sine', f0: 300 + i * 120, f1: 500 + i * 160, dur: 0.1, vol: 0.08, delay: i * 0.06 });
  },
  equip(s) {
    s.noiseBurst({ filter: 'bandpass', f0: 3200, q: 3, dur: 0.05, vol: 0.12 });
    s.tone({ type: 'triangle', f0: 380, f1: 300, dur: 0.1, vol: 0.1 });
  },
  click(s) {
    s.tone({ type: 'sine', f0: 1200, dur: 0.03, vol: 0.04 });
  },
  salvage(s) {
    s.noiseBurst({ filter: 'bandpass', f0: 1200, f1: 4000, q: 2, dur: 0.15, vol: 0.12 });
    s.tone({ type: 'triangle', f0: 1568, dur: 0.25, vol: 0.05, delay: 0.05, verb: 0.5 });
  },
  thunderclap(s) {
    s.tone({ type: 'sine', f0: 95, f1: 30, dur: 0.6, vol: 0.6 });
    s.noiseBurst({ filter: 'lowpass', f0: 3000, f1: 120, dur: 0.6, vol: 0.4, verb: 0.7 });
    SOUNDS.zap(s);
  },
  implode(s) {
    if (!s.gate('implode', 0.07)) return;
    s.tone({ type: 'sine', f0: 200, f1: 900, dur: 0.18, vol: 0.1, verb: 0.5 });
    s.tone({ type: 'triangle', f0: 70, f1: 35, dur: 0.3, vol: 0.25, delay: 0.12 });
  },
  enemyShoot(s) {
    if (!s.gate('enemyShoot', 0.12)) return;
    s.tone({ type: 'square', f0: 330, f1: 140, dur: 0.12, vol: 0.035, verb: 0.3 });
  },
  slam(s) {
    s.tone({ type: 'sine', f0: 70, f1: 28, dur: 0.5, vol: 0.5 });
    s.noiseBurst({ filter: 'lowpass', f0: 900, f1: 100, dur: 0.4, vol: 0.3 });
  },
  depth(s) {
    s.tone({ type: 'sine', f0: 55, dur: 3.5, vol: 0.4, attack: 0.3, verb: 1 });
    s.tone({ type: 'sawtooth', f0: 110, dur: 3, vol: 0.05, attack: 0.8, verb: 1, detune: 12 });
    [220, 207.65].forEach((f, i) => s.tone({ type: 'sine', f0: f, dur: 2.5, vol: 0.08, delay: 0.5 + i * 0.6, verb: 1.2 }));
  },
  elite(s) {
    [146.8, 138.6].forEach((f, i) => s.tone({ type: 'sawtooth', f0: f, dur: 1.2, vol: 0.06, delay: i * 0.25, verb: 0.9 }));
  },
  death(s) {
    s.tone({ type: 'sine', f0: 220, f1: 55, dur: 2.5, vol: 0.3, verb: 1 });
    s.noiseBurst({ filter: 'lowpass', f0: 1200, f1: 80, dur: 2, vol: 0.2, verb: 1 });
  },
};
