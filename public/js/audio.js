const midi = m => 440 * Math.pow(2, (m - 69) / 12);

export class AudioMan {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineNodes = null;
    this.loops = null;
    this.musicOn = false;
    this._step = 0;
    this._next = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.6;
    this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.2;
    this.musicGain.connect(this.master);
    const len = this.ctx.sampleRate * 1.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  }

  setMuted(v) {
    this.muted = v;
    if (this.master) this.master.gain.value = v ? 0 : 0.9;
    return v;
  }

  toy(type, freq, at, dur, vol, dest) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g);
    g.connect(dest || this.sfxGain);
    o.start(at);
    o.stop(at + dur + 0.05);
    return o;
  }

  blip(freq, dur = 0.12, type = 'square', vol = 0.3, slide = 0) {
    if (!this.ctx) return;
    const at = this.ctx.currentTime;
    const o = this.toy(type, freq, at, dur, vol);
    if (o && slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), at + dur);
  }

  noise(dur = 0.2, freq = 1200, vol = 0.3, type = 'bandpass', q = 1.2, slide = 0) {
    if (!this.ctx) return;
    const at = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, at);
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, slide), at + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    src.start(at);
    src.stop(at + dur + 0.05);
  }

  startEngine() {
    this.init();
    if (!this.ctx || this.engineNodes) return;
    const o1 = this.ctx.createOscillator();
    o1.type = 'sawtooth';
    const o2 = this.ctx.createOscillator();
    o2.type = 'square';
    o2.detune.value = 14;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 800;
    filt.Q.value = 2.5;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    o1.connect(filt);
    o2.connect(filt);
    filt.connect(g);
    g.connect(this.sfxGain);
    o1.start();
    o2.start();
    this.engineNodes = { o1, o2, filt, g };

    const screechSrc = this.ctx.createBufferSource();
    screechSrc.buffer = this.noiseBuf;
    screechSrc.loop = true;
    const screechF = this.ctx.createBiquadFilter();
    screechF.type = 'bandpass';
    screechF.frequency.value = 1300;
    screechF.Q.value = 7;
    const screechG = this.ctx.createGain();
    screechG.gain.value = 0;
    screechSrc.connect(screechF);
    screechF.connect(screechG);
    screechG.connect(this.sfxGain);
    screechSrc.start();
    this.loops = { screechG, screechF };
  }

  engineUpdate(ratio, throttle, drifting, boosting) {
    const n = this.engineNodes;
    if (!n || !this.ctx) return;
    const t = this.ctx.currentTime;
    const rpm = 0.12 + ratio * 0.88;
    n.o1.frequency.setTargetAtTime(46 + rpm * 155, t, 0.05);
    n.o2.frequency.setTargetAtTime(23 + rpm * 78, t, 0.05);
    n.filt.frequency.setTargetAtTime(420 + rpm * 2300, t, 0.06);
    n.g.gain.setTargetAtTime(0.035 + throttle * 0.05 + ratio * 0.028, t, 0.09);
    if (this.loops) {
      const target = drifting && ratio > 0.25 ? 0.16 : 0;
      this.loops.screechG.gain.setTargetAtTime(target, t, 0.08);
      this.loops.screechF.frequency.setTargetAtTime(900 + ratio * 1300, t, 0.1);
    }
  }

  stopEngine() {
    if (this.engineNodes) {
      try {
        this.engineNodes.o1.stop();
        this.engineNodes.o2.stop();
      } catch {}
      this.engineNodes = null;
    }
    if (this.loops) {
      try {
        this.loops.screechG.disconnect();
      } catch {}
      this.loops = null;
    }
  }

  countdown(n) {
    this.blip(n === 0 ? 880 : 440, n === 0 ? 0.5 : 0.14, 'square', 0.35);
  }

  go() {
    this.blip(660, 0.1, 'square', 0.4);
    setTimeout(() => this.blip(990, 0.35, 'square', 0.4), 90);
  }

  itemGet() {
    this.blip(720, 0.07, 'square', 0.28);
    setTimeout(() => this.blip(1080, 0.12, 'square', 0.28), 70);
  }

  itemUse(kind) {
    if (kind === 'turbo') this.noise(0.55, 400, 0.35, 'lowpass', 1, 3000);
    else if (kind === 'shield') this.blip(300, 0.4, 'sine', 0.3, 900);
    else if (kind === 'banana') this.blip(220, 0.14, 'triangle', 0.3, 120);
    else if (kind === 'bolt') this.noise(0.3, 2400, 0.3, 'highpass', 1, 600);
    else if (kind === 'seeker') this.noise(0.4, 300, 0.3, 'lowpass', 1, 1800);
  }

  hit() {
    this.noise(0.35, 900, 0.4, 'lowpass', 1, 90);
    this.blip(180, 0.3, 'sawtooth', 0.25, 60);
  }

  block() {
    this.blip(1400, 0.18, 'sine', 0.3, 400);
    this.noise(0.2, 2000, 0.2, 'highpass');
  }

  boost() {
    this.noise(0.5, 500, 0.3, 'lowpass', 1, 3800);
  }

  wall() {
    this.noise(0.22, 500, 0.32, 'lowpass', 1, 120);
  }

  lap() {
    this.blip(880, 0.1, 'square', 0.3);
    setTimeout(() => this.blip(1320, 0.2, 'square', 0.3), 100);
  }

  finish() {
    const seq = [523, 659, 784, 1047];
    seq.forEach((f, i) => setTimeout(() => this.blip(f, 0.28, 'square', 0.32), i * 130));
  }

  click() {
    this.blip(600, 0.06, 'square', 0.18);
  }

  horn() {
    this.blip(370, 0.18, 'square', 0.3);
    this.blip(466, 0.18, 'square', 0.28);
  }

  startMusic() {
    this.init();
    this.musicOn = true;
    this._next = 0;
  }

  stopMusic() {
    this.musicOn = false;
  }

  tickMusic() {
    if (!this.ctx || !this.musicOn || this.muted) return;
    const t = this.ctx.currentTime;
    if (!this._next || this._next < t) this._next = t + 0.06;
    const spb = 60 / 126 / 2;
    while (this._next < t + 0.3) {
      const i = this._step;
      const bar = Math.floor(i / 8) % 4;
      const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
      const bass = [45, 41, 36, 43][bar];
      if (i % 2 === 0) this.toy('triangle', midi(bass), this._next, 0.24, 0.5, this.musicGain);
      const deg = [0, 1, 2, 1, 0, 2, 1, 2][i % 8];
      this.toy('square', midi(chords[bar][deg] + 12), this._next, 0.12, 0.16, this.musicGain);
      if (i % 2 === 1) this.hat(this._next);
      if (i % 8 === 0) this.kick(this._next);
      this._next += spb;
      this._step++;
    }
  }

  hat(at) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.1, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.04);
    src.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    src.start(at);
    src.stop(at + 0.05);
  }

  kick(at) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, at);
    o.frequency.exponentialRampToValueAtTime(45, at + 0.1);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.14);
    o.connect(g);
    g.connect(this.musicGain);
    o.start(at);
    o.stop(at + 0.16);
  }
}
