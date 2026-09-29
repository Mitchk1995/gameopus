import { item } from './items.js';

// A fixed number of slots holding { id, n }. Stackable items share one slot; anything
// else takes a slot each. Listeners hear about every change so the UI can redraw.
export class Container {
  constructor(size, saved = null, { alwaysStack = false } = {}) {
    this.size = size;
    this.alwaysStack = alwaysStack;
    this.slots = new Array(size).fill(null);
    if (saved) saved.forEach((s, i) => { if (s && i < size) this.slots[i] = { id: s.id, n: s.n }; });
    this.listeners = new Set();
  }

  changed() {
    for (const l of this.listeners) l(this);
  }

  stacks(id) {
    return this.alwaysStack || item(id).stack;
  }

  count(id) {
    return this.slots.reduce((t, s) => t + (s && s.id === id ? s.n : 0), 0);
  }

  has(id, n = 1) {
    return this.count(id) >= n;
  }

  free() {
    return this.slots.filter((s) => !s).length;
  }

  // How many of an item would fit right now.
  room(id) {
    if (this.stacks(id)) return this.slots.some((s) => s?.id === id) || this.free() > 0 ? Infinity : 0;
    return this.free();
  }

  // Adds up to n; returns how many were added.
  add(id, n = 1) {
    if (n <= 0) return 0;
    let added = 0;
    if (this.stacks(id)) {
      let slot = this.slots.findIndex((s) => s?.id === id);
      if (slot < 0) slot = this.slots.indexOf(null);
      if (slot < 0) return 0;
      this.slots[slot] = { id, n: (this.slots[slot]?.n || 0) + n };
      added = n;
    } else {
      while (added < n) {
        const slot = this.slots.indexOf(null);
        if (slot < 0) break;
        this.slots[slot] = { id, n: 1 };
        added++;
      }
    }
    if (added) this.changed();
    return added;
  }

  // Removes up to n, preferring the given slot first; returns how many were removed.
  remove(id, n = 1, prefer = -1) {
    let left = n;
    const order = prefer >= 0 ? [prefer, ...this.slots.keys()] : [...this.slots.keys()];
    for (const i of order) {
      if (left <= 0) break;
      const s = this.slots[i];
      if (!s || s.id !== id) continue;
      const take = Math.min(left, s.n);
      s.n -= take;
      left -= take;
      if (s.n <= 0) this.slots[i] = null;
    }
    if (left !== n) this.changed();
    return n - left;
  }

  // Commit a whole trade only if every input exists and every output fits after
  // those inputs leave. Listeners never see a half-finished inventory change.
  exchange(take = [], give = [], prefer = -1) {
    const next = new Container(this.size, this.slots, { alwaysStack: this.alwaysStack });
    for (const [id, n] of take) {
      if (!Number.isInteger(n) || n < 0 || next.count(id) < n) return false;
      next.remove(id, n, prefer);
    }
    for (const [id, n] of give) {
      if (!Number.isInteger(n) || n < 0 || next.add(id, n) !== n) return false;
    }
    this.slots = next.slots;
    this.changed();
    return true;
  }

  swap(a, b) {
    [this.slots[a], this.slots[b]] = [this.slots[b], this.slots[a]];
    this.changed();
  }

  // Squeezes gaps out (for the bank, which keeps items packed).
  compact() {
    const items = this.slots.filter(Boolean);
    this.slots = [...items, ...new Array(this.size - items.length).fill(null)];
  }

  toJSON() {
    return this.slots.map((s) => (s ? { id: s.id, n: s.n } : null));
  }
}
