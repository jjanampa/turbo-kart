import { clamp } from '/shared/constants.js';

export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = { left: false, right: false, brake: false, drift: false };
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.itemFlag = false;
    this.hornFlag = false;
    this.gpSteer = 0;
    this.gpThrottle = 0;
    this.gpBrake = 0;
    this.gpDrift = false;
    this.gpPrev = { item: false, horn: false };
    this.disabled = false;
    window.addEventListener('keydown', e => {
      this.keys.add(e.code);
      if (e.code === 'KeyE' || e.code === 'KeyK' || e.code === 'ControlLeft') this.itemFlag = true;
      if (e.code === 'KeyH') this.hornFlag = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  bindTouch(root) {
    for (const btn of root.querySelectorAll('[data-k]')) {
      const key = btn.dataset.k;
      const on = e => {
        e.preventDefault();
        if (key === 'item') this.itemFlag = true;
        else this.touch[key] = true;
      };
      const off = e => {
        e.preventDefault();
        this.touch[key] = false;
      };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('pointerleave', off);
    }
  }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && pads[0];
    if (!gp) {
      this.gpSteer = 0;
      this.gpThrottle = 0;
      this.gpBrake = 0;
      this.gpDrift = false;
      return;
    }
    const ax = gp.axes[0] || 0;
    this.gpSteer = Math.abs(ax) > 0.16 ? ax : 0;
    this.gpThrottle = gp.buttons[7] ? gp.buttons[7].value : 0;
    this.gpBrake = gp.buttons[6] ? gp.buttons[6].value : 0;
    this.gpDrift = !!(gp.buttons[2] && gp.buttons[2].pressed);
    const item = !!(gp.buttons[0] && gp.buttons[0].pressed);
    const horn = !!(gp.buttons[9] && gp.buttons[9].pressed);
    if (item && !this.gpPrev.item) this.itemFlag = true;
    if (horn && !this.gpPrev.horn) this.hornFlag = true;
    this.gpPrev.item = item;
    this.gpPrev.horn = horn;
  }

  get() {
    this.pollGamepad();
    const k = this.keys;
    const left = k.has('ArrowLeft') || k.has('KeyA') || this.touch.left;
    const right = k.has('ArrowRight') || k.has('KeyD') || this.touch.right;
    let steer = (right ? 1 : 0) - (left ? 1 : 0);
    if (this.gpSteer) steer = clamp(steer + this.gpSteer, -1, 1);
    let throttle = k.has('ArrowUp') || k.has('KeyW') ? 1 : 0;
    let brake = k.has('ArrowDown') || k.has('KeyS') || this.touch.brake ? 1 : 0;
    if (this.gpThrottle > 0.1) throttle = Math.max(throttle, this.gpThrottle);
    if (this.gpBrake > 0.1) brake = Math.max(brake, this.gpBrake);
    if (this.isTouch && !this.touch.brake) throttle = 1;
    const drift = k.has('Space') || this.touch.drift || this.gpDrift;
    const lookBack = k.has('KeyB');
    return { steer, throttle, brake, drift, lookBack };
  }

  consumeItem() {
    const v = this.itemFlag;
    this.itemFlag = false;
    return v;
  }

  consumeHorn() {
    const v = this.hornFlag;
    this.hornFlag = false;
    return v;
  }
}
