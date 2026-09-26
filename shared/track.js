import { mulberry32 } from './rng.js';
import { CP_COUNT, clamp } from './constants.js';

export const TRACKS = [
  {
    id: 'sunset',
    name: 'Circuito Atardecer',
    seed: 1337,
    radius: 128,
    wobble: [[26, 3, 0.6], [15, 2, 2.1], [5, 7, 1.3]],
    width: [8.6, 1.1, 5, 0.4],
    elev: [[2.6, 2, 1.1], [1.4, 3, 0.4]],
    bank: 22,
    deco: [['palm', 0.42], ['bush', 0.22], ['rock', 0.18], ['tire', 0.18]],
    palette: {
      skyTop: 0x1b2a5e, skyBottom: 0xff9d5c, sun: 0xfff0b8, fog: 0xe8a06b,
      grass: 0x6fae4a, dirt: 0x9a7a4a, road: 0x4a4a52, kerbA: 0xe23b2e, kerbB: 0xf2f2f2,
      trunk: 0x6b4a2f, leaf: 0x2f8f4e, mountain: 0x7a6a8f, hemiSky: 0xffc9a0, hemiGround: 0x4a6a3a,
      sunLight: 0xffd9a0, ambient: 0.62
    }
  },
  {
    id: 'forest',
    name: 'Bosque Mistito',
    seed: 9042,
    radius: 114,
    wobble: [[30, 3, 2.4], [13, 2, 0.2], [6, 5, 3.0]],
    width: [7.9, 1.0, 4, 1.7],
    elev: [[3.2, 2, 0.7], [1.8, 3, 2.2]],
    bank: 24,
    deco: [['pine', 0.5], ['bush', 0.26], ['rock', 0.14], ['tire', 0.1]],
    palette: {
      skyTop: 0x14304d, skyBottom: 0x9fd8c8, sun: 0xfff8e0, fog: 0xa9c9bd,
      grass: 0x2f7a44, dirt: 0x6b5a3a, road: 0x45464e, kerbA: 0xe23b2e, kerbB: 0xf2f2f2,
      trunk: 0x4a3524, leaf: 0x1f5c38, mountain: 0x6c8f86, hemiSky: 0xd8f0e8, hemiGround: 0x2a4a34,
      sunLight: 0xf0f8ff, ambient: 0.66
    }
  },
  {
    id: 'volcano',
    name: 'Cráter Ardiente',
    seed: 5150,
    radius: 138,
    wobble: [[22, 2, 0.9], [18, 3, 3.6], [4, 7, 0.5]],
    width: [9.2, 1.2, 6, 2.2],
    elev: [[3.6, 2, 1.9], [2.2, 3, 0.3]],
    bank: 20,
    deco: [['rock', 0.44], ['deadtree', 0.22], ['bush', 0.14], ['tire', 0.2]],
    embers: true,
    palette: {
      skyTop: 0x2a0f1e, skyBottom: 0xff6b3d, sun: 0xffd0a0, fog: 0xa04a35,
      grass: 0x5a4a44, dirt: 0x4a3a34, road: 0x3c3a40, kerbA: 0xe23b2e, kerbB: 0xf2f2f2,
      trunk: 0x3a2a24, leaf: 0x6a4a3a, mountain: 0x3a2c31, hemiSky: 0xffb090, hemiGround: 0x3a2a28,
      sunLight: 0xffc9a0, ambient: 0.58
    }
  }
];

const STEP = 2;
const DECO_COUNT = 150;
const SKIRT_W = 40;

export function trackById(id) {
  return TRACKS.find(t => t.id === id) || TRACKS[0];
}

export class Track {
  constructor(def) {
    this.id = def.id;
    this.name = def.name;
    this.def = def;
    this.palette = def.palette;
    const rand = mulberry32(def.seed);

    const rAt = th => def.radius + def.wobble.reduce((a, w) => a + w[0] * Math.sin(w[1] * th + w[2]), 0);
    const yAt = th => def.elev.reduce((a, w) => a + w[0] * Math.sin(w[1] * th + w[2]), 0);
    const wAt = th => def.width[0] + def.width[1] * Math.sin(def.width[2] * th + def.width[3]);

    const N0 = 3000;
    const dense = [];
    let acc = 0;
    for (let k = 0; k <= N0; k++) {
      const th = (k / N0) * Math.PI * 2;
      const r = rAt(th);
      const x = r * Math.cos(th);
      const z = r * Math.sin(th);
      if (k > 0) {
        const dx = x - dense[k - 1].x;
        const dz = z - dense[k - 1].z;
        acc += Math.hypot(dx, dz);
      }
      dense.push({ th, x, z, s: acc });
    }
    const L = acc;
    const n = Math.max(64, Math.floor(L / STEP));

    const px = new Float64Array(n);
    const py = new Float64Array(n);
    const pz = new Float64Array(n);
    const sx = new Float64Array(n);
    const sArr = new Float64Array(n);
    const thArr = new Float64Array(n);
    const hwArr = new Float64Array(n);
    const betaArr = new Float64Array(n);
    const kapArr = new Float64Array(n);

    let di = 0;
    const thetaAt = s => {
      const target = ((s % L) + L) % L;
      while (di < N0 && dense[di + 1].s < target) di++;
      while (di > 0 && dense[di].s > target) di--;
      const a = dense[di];
      const b = dense[Math.min(N0, di + 1)];
      const span = Math.max(1e-6, b.s - a.s);
      const f = clamp((target - a.s) / span, 0, 1);
      let th = a.th + (b.th - a.th) * f;
      if (th < 0) th += Math.PI * 2;
      return th;
    };

    for (let i = 0; i < n; i++) {
      const s = i * STEP;
      const th = thetaAt(s);
      const r = rAt(th);
      px[i] = r * Math.cos(th);
      pz[i] = r * Math.sin(th);
      py[i] = yAt(th);
      thArr[i] = th;
      hwArr[i] = wAt(th);
      sArr[i] = s;
    }

    const leftx = new Float64Array(n);
    const leftz = new Float64Array(n);
    const sz = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n;
      const b = (i + 1) % n;
      let tx = px[b] - px[a];
      let tz = pz[b] - pz[a];
      const len = Math.hypot(tx, tz) || 1;
      tx /= len;
      tz /= len;
      sx[i] = tx;
      sz[i] = tz;
      leftx[i] = tz;
      leftz[i] = -tx;
    }
    this.leftx = leftx;
    this.leftz = leftz;
    this.sz = sz;

    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n;
      const b = (i + 1) % n;
      const f1 = Math.atan2(sx[a], sz[a]);
      const f2 = Math.atan2(sx[b], sz[b]);
      let d = f2 - f1;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      kapArr[i] = d / (2 * STEP);
    }
    for (let i = 0; i < n; i++) {
      betaArr[i] = -clamp(kapArr[i] * def.bank, -0.24, 0.24);
    }

    this.n = n;
    this.step = STEP;
    this.length = L;
    this.px = px;
    this.py = py;
    this.pz = pz;
    this.tx = sx;
    this.sArr = sArr;
    this.thArr = thArr;
    this.hwArr = hwArr;
    this.betaArr = betaArr;
    this.kapArr = kapArr;
    this.shoulderW = 5.5;
    this.skirtW = SKIRT_W;

    this.cpS = [];
    for (let k = 0; k < CP_COUNT; k++) this.cpS.push((k * L) / CP_COUNT);

    this.boxes = [];
    let id = 0;
    for (let s = 42; s < L - 20; s += 48) {
      const us = id % 2 === 0 ? [-4.2, 0, 4.2] : [-2.1, 2.1];
      for (const u of us) {
        const p = this.worldAt(s, u, 0);
        this.boxes.push({ id: id++, s, u, x: p.x, y: p.y + 1.05, z: p.z });
      }
    }

    this.pads = [];
    let lastPadS = -1e9;
    for (let i = 0; i < n; i++) {
      if (Math.abs(kapArr[i]) < 0.004 && sArr[i] - lastPadS > 150) {
        for (const u of [-3, 0, 3]) {
          const p = this.worldAt(sArr[i], u, 0);
          this.pads.push({ s: sArr[i], u, x: p.x, y: p.y + 0.06, z: p.z });
        }
        lastPadS = sArr[i];
      }
    }

    this.deco = [];
    const pickType = () => {
      let r = rand();
      for (const [type, w] of def.deco) {
        r -= w;
        if (r <= 0) return type;
      }
      return def.deco[0][0];
    };
    let guard = 0;
    while (this.deco.length < DECO_COUNT && guard++ < DECO_COUNT * 12) {
      const i = Math.floor(rand() * n);
      const side = rand() < 0.5 ? -1 : 1;
      const off = hwArr[i] + 8 + rand() * (SKIRT_W - 12);
      const u = side * off;
      const p = this.worldAt(sArr[i], u, 0);
      const gy = this.terrainY(sArr[i], u);
      if (gy < -1.4) continue;
      let ok = true;
      for (const d of this.deco) {
        const dx = d.x - p.x;
        const dz = d.z - p.z;
        if (dx * dx + dz * dz < 18 * 18) { ok = false; break; }
      }
      if (!ok) continue;
      this.deco.push({ type: pickType(), x: p.x, y: gy, z: p.z, scale: 0.75 + rand() * 0.8, rot: rand() * Math.PI * 2 });
    }
    this.stands = [];
    for (const side of [-1, 1]) {
      const s = 34;
      const u = side * (this.hwAt(s) + 11);
      const p = this.worldAt(s, u, 0);
      const y = this.terrainY(s, u);
      this.stands.push({ x: p.x, y, z: p.z, rot: this.headingAt(s) + (side > 0 ? 0 : Math.PI) });
    }
    const archP = this.worldAt(0, 0, 0);
    this.arch = { x: archP.x, y: archP.y, z: archP.z, rot: Math.atan2(this.tx[0], this.sz[0]), hw: this.hwAt(0) };
    this.bounds = this.computeBounds();
  }

  computeBounds() {
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (let i = 0; i < this.n; i++) {
      minX = Math.min(minX, this.px[i]);
      maxX = Math.max(maxX, this.px[i]);
      minZ = Math.min(minZ, this.pz[i]);
      maxZ = Math.max(maxZ, this.pz[i]);
    }
    const pad = 30;
    return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
  }

  sampleIndexAt(s) {
    const target = ((s % this.length) + this.length) % this.length;
    let i = Math.floor(target / this.step);
    if (i >= this.n) i = this.n - 1;
    return i;
  }

  kappaAt(s) {
    return this.kapArr[this.sampleIndexAt(s)];
  }

  hwAt(s) {
    return this.hwArr[this.sampleIndexAt(s)];
  }

  tangentAt(s) {
    const i = this.sampleIndexAt(s);
    return { x: this.tx[i], z: this.sz[i] };
  }

  headingAt(s) {
    const i = this.sampleIndexAt(s);
    return Math.atan2(this.tx[i], this.sz[i]);
  }

  worldAt(s, u, h = 0) {
    const L = this.length;
    const target = ((s % L) + L) % L;
    const i = this.sampleIndexAt(target);
    const i2 = (i + 1) % this.n;
    const f = clamp((target - i * this.step) / this.step, 0, 1);
    const x0 = this.px[i] + (this.px[i2] - this.px[i]) * f;
    const z0 = this.pz[i] + (this.pz[i2] - this.pz[i]) * f;
    const y0 = this.py[i] + (this.py[i2] - this.py[i]) * f;
    const beta = this.betaArr[i] + (this.betaArr[i2] - this.betaArr[i]) * f;
    const lx = this.leftx[i] + (this.leftx[i2] - this.leftx[i]) * f;
    const lz = this.leftz[i] + (this.leftz[i2] - this.leftz[i]) * f;
    const ll = Math.hypot(lx, lz) || 1;
    return {
      x: x0 + (lx / ll) * u,
      y: y0 + u * Math.sin(beta) + h,
      z: z0 + (lz / ll) * u
    };
  }

  terrainY(s, u) {
    const hw = this.hwAt(s);
    const au = Math.abs(u);
    const p = this.worldAt(s, u, 0);
    const edge = hw + 1.2;
    if (au <= edge) return p.y;
    const t = clamp((au - edge) / (SKIRT_W - edge), 0, 1);
    const smooth = t * t * (3 - 2 * t);
    const pEdge = this.worldAt(s, Math.sign(u) * edge, 0);
    return pEdge.y * (1 - smooth) + -0.3 * smooth;
  }

  project(x, z, hint = -1) {
    const n = this.n;
    let best = 0;
    let bd = Infinity;
    if (hint >= 0) {
      for (let k = -70; k <= 70; k++) {
        const i = ((hint + k) % n + n) % n;
        const dx = x - this.px[i];
        const dz = z - this.pz[i];
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
    } else {
      for (let i = 0; i < n; i++) {
        const dx = x - this.px[i];
        const dz = z - this.pz[i];
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
    }
    let bestU = 0, bestS = 0, bt = 0, bestI = best, bestD = Infinity;
    for (const i of [(best - 1 + n) % n, best]) {
      const j = (i + 1) % n;
      const dx = this.px[j] - this.px[i];
      const dz = this.pz[j] - this.pz[i];
      const len2 = dx * dx + dz * dz || 1;
      let t = ((x - this.px[i]) * dx + (z - this.pz[i]) * dz) / len2;
      t = clamp(t, 0, 1);
      const cx = this.px[i] + dx * t;
      const cz = this.pz[i] + dz * t;
      const ddx = x - cx;
      const ddz = z - cz;
      const d = ddx * ddx + ddz * ddz;
      if (d < bestD) {
        bestD = d;
        bestI = i;
        bt = t;
        bestU = ddx * this.leftx[i] + ddz * this.leftz[i];
        bestS = this.sArr[i] + t * STEP;
      }
    }
    const i2 = (bestI + 1) % n;
    const hw = this.hwArr[bestI] + (this.hwArr[i2] - this.hwArr[bestI]) * bt;
    const beta = this.betaArr[bestI] + (this.betaArr[i2] - this.betaArr[bestI]) * bt;
    const cy = this.py[bestI] + (this.py[i2] - this.py[bestI]) * bt;
    const kappa = this.kapArr[bestI] + (this.kapArr[i2] - this.kapArr[bestI]) * bt;
    return {
      i: bestI,
      t: bt,
      s: ((bestS % this.length) + this.length) % this.length,
      u: bestU,
      hw,
      beta,
      cy,
      y: cy + bestU * Math.sin(beta),
      kappa,
      cx: this.px[bestI] + (this.px[i2] - this.px[bestI]) * bt,
      cz: this.pz[bestI] + (this.pz[i2] - this.pz[bestI]) * bt,
      lx: this.leftx[bestI],
      lz: this.leftz[bestI],
      tx: this.tx[bestI],
      tz: this.sz[bestI]
    };
  }

  gridSlot(slot) {
    const row = Math.floor(slot / 2);
    const col = slot % 2;
    const s = this.length - 16 - row * 7;
    const u = col ? 3.0 : -3.0;
    const p = this.worldAt(s, u, 0);
    return { s, u, x: p.x, y: p.y, z: p.z, heading: this.headingAt(s) };
  }
}

export function buildTrack(id) {
  return new Track(trackById(id));
}
