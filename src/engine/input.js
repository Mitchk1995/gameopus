// Keyboard and mouse state with pointer lock. The game reads it once per frame.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.buttons = new Set();
    this.clicked = new Set();
    this.tapped = new Set();
    this.downAt = new Map();
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.locked = false;
    this.onLockChange = null;

    addEventListener('keydown', (e) => {
      // Typing in a text box (talking to someone) doesn't move you; Esc still works.
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.repeat || (typing && e.code !== 'Escape')) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      this.downAt.set(e.code, performance.now());
      if (this.locked && ['Space', 'Tab', 'KeyQ', 'KeyE', 'KeyF', 'ShiftLeft', 'ControlLeft'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => {
      // Let go within a fifth of a second and it counts as a tap.
      if (this.keys.has(e.code) && performance.now() - (this.downAt.get(e.code) ?? 0) < 220) this.tapped.add(e.code);
      this.keys.delete(e.code);
    });
    addEventListener('blur', () => {
      this.keys.clear();
      this.buttons.clear();
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.buttons.add(e.button);
      this.clicked.add(e.button);
    });
    addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    canvas.addEventListener('wheel', (e) => {
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) {
        this.buttons.clear();
        this.keys.clear();
      }
      this.onLockChange?.(this.locked);
    });
  }

  lock() {
    this.canvas.requestPointerLock?.({ unadjustedMovement: true })?.catch?.(() => this.canvas.requestPointerLock());
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) {
    return this.keys.has(code);
  }

  hit(code) {
    return this.pressed.has(code);
  }

  endFrame() {
    this.pressed.clear();
    this.clicked.clear();
    this.tapped.clear();
    this.dx = this.dy = 0;
    this.wheel = 0;
  }
}
