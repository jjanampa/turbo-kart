import { fmtTime, KMH, ITEM_NAMES } from '/shared/constants.js';

const byId = id => document.getElementById(id);
const hex = n => '#' + (n >>> 0).toString(16).padStart(6, '0');

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawItemIcon(ctx, item, size) {
  const s = size;
  ctx.clearRect(0, 0, s, s);
  ctx.save();
  ctx.lineWidth = s * 0.07;
  if (item === 'turbo') {
    ctx.fillStyle = '#ff8a1e';
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.1);
    ctx.quadraticCurveTo(s * 0.86, s * 0.42, s * 0.78, s * 0.66);
    ctx.quadraticCurveTo(s * 0.72, s * 0.86, s * 0.5, s * 0.9);
    ctx.quadraticCurveTo(s * 0.28, s * 0.86, s * 0.22, s * 0.66);
    ctx.quadraticCurveTo(s * 0.14, s * 0.42, s * 0.5, s * 0.1);
    ctx.fill();
    ctx.fillStyle = '#ffe27a';
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.38);
    ctx.quadraticCurveTo(s * 0.66, s * 0.56, s * 0.6, s * 0.72);
    ctx.quadraticCurveTo(s * 0.54, s * 0.82, s * 0.5, s * 0.82);
    ctx.quadraticCurveTo(s * 0.46, s * 0.82, s * 0.4, s * 0.72);
    ctx.quadraticCurveTo(s * 0.34, s * 0.56, s * 0.5, s * 0.38);
    ctx.fill();
  } else if (item === 'banana') {
    ctx.strokeStyle = '#f2c438';
    ctx.lineWidth = s * 0.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.52, s * 0.3, Math.PI * 0.15, Math.PI * 0.95);
    ctx.stroke();
    ctx.strokeStyle = '#a8761c';
    ctx.lineWidth = s * 0.1;
    ctx.beginPath();
    ctx.moveTo(s * 0.24, s * 0.4);
    ctx.lineTo(s * 0.28, s * 0.22);
    ctx.stroke();
  } else if (item === 'bolt') {
    ctx.fillStyle = '#49e05c';
    ctx.beginPath();
    ctx.moveTo(s * 0.62, s * 0.08);
    ctx.lineTo(s * 0.28, s * 0.54);
    ctx.lineTo(s * 0.47, s * 0.54);
    ctx.lineTo(s * 0.38, s * 0.92);
    ctx.lineTo(s * 0.74, s * 0.42);
    ctx.lineTo(s * 0.53, s * 0.42);
    ctx.closePath();
    ctx.fill();
  } else if (item === 'seeker') {
    ctx.fillStyle = '#e23b2e';
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.06);
    ctx.quadraticCurveTo(s * 0.7, s * 0.35, s * 0.66, s * 0.66);
    ctx.lineTo(s * 0.34, s * 0.66);
    ctx.quadraticCurveTo(s * 0.3, s * 0.35, s * 0.5, s * 0.06);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(s * 0.34, s * 0.66);
    ctx.lineTo(s * 0.24, s * 0.86);
    ctx.lineTo(s * 0.44, s * 0.78);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(s * 0.66, s * 0.66);
    ctx.lineTo(s * 0.76, s * 0.86);
    ctx.lineTo(s * 0.56, s * 0.78);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.moveTo(s * 0.44, s * 0.72);
    ctx.lineTo(s * 0.56, s * 0.72);
    ctx.lineTo(s * 0.5, s * 0.95);
    ctx.closePath();
    ctx.fill();
  } else if (item === 'shield') {
    ctx.fillStyle = '#35a7ff';
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.08);
    ctx.lineTo(s * 0.82, s * 0.24);
    ctx.quadraticCurveTo(s * 0.84, s * 0.62, s * 0.5, s * 0.92);
    ctx.quadraticCurveTo(s * 0.16, s * 0.62, s * 0.18, s * 0.24);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = s * 0.05;
    ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    roundRect(ctx, s * 0.12, s * 0.12, s * 0.76, s * 0.76, s * 0.18);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = `900 ${s * 0.55}px Avenir Next, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', s * 0.5, s * 0.55);
  }
  ctx.restore();
}

export class Hud {
  constructor() {
    this.hud = byId('hud');
    this.posNum = byId('posNum');
    this.posOf = byId('posOf');
    this.lapTxt = byId('lapTxt');
    this.timeTxt = byId('timeTxt');
    this.speedNum = byId('speedNum');
    this.itemCanvas = byId('itemCanvas');
    this.itemCtx = this.itemCanvas.getContext('2d');
    this.standings = byId('standings');
    this.big = byId('bigMsg');
    this.wrong = byId('wrongWay');
    this.mini = byId('minimap');
    this.miniCtx = this.mini.getContext('2d');
    this.net = byId('netInfo');
    this.chatLog = byId('chatLog');
    this.item = null;
    this.roulette = false;
    this.rouletteT = 0;
    this._iconT = 0;
    this._msgTimer = null;
    this._standKey = '';
    this.miniPath = null;
    this.miniBounds = null;
  }

  show(v) {
    this.hud.classList.toggle('hidden', !v);
  }

  setTrack(track) {
    const t = track;
    const pts = [];
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    const left = [];
    const right = [];
    for (let i = 0; i <= t.n; i += 2) {
      const ii = i % t.n;
      const s = i * t.step;
      const u = t.hwAt(s) + 5;
      const a = t.worldAt(s, u, 0);
      const b = t.worldAt(s, -u, 0);
      left.push([a.x, a.z]);
      right.push([b.x, b.z]);
      minX = Math.min(minX, a.x, b.x);
      maxX = Math.max(maxX, a.x, b.x);
      minZ = Math.min(minZ, a.z, b.z);
      maxZ = Math.max(maxZ, a.z, b.z);
    }
    const pad = 12;
    this.miniBounds = { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
    this.miniPath = { left, right };
  }

  mmap(x, z) {
    const b = this.miniBounds;
    const w = this.mini.width;
    const h = this.mini.height;
    const scale = Math.min(w / (b.maxX - b.minX), h / (b.maxZ - b.minZ));
    const ox = (w - (b.maxX - b.minX) * scale) / 2;
    const oy = (h - (b.maxZ - b.minZ) * scale) / 2;
    return [ox + (x - b.minX) * scale, oy + (z - b.minZ) * scale];
  }

  drawMinimap(karts, myId) {
    if (!this.miniPath) return;
    const ctx = this.miniCtx;
    const w = this.mini.width;
    const h = this.mini.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.fillStyle = 'rgba(8,11,18,0.55)';
    roundRect(ctx, 2, 2, w - 4, h - 4, 22);
    ctx.fill();
    ctx.beginPath();
    const { left, right } = this.miniPath;
    for (let i = 0; i < left.length; i++) {
      const [x, y] = this.mmap(left[i][0], left[i][1]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = right.length - 1; i >= 0; i--) {
      const [x, y] = this.mmap(right[i][0], right[i][1]);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(230,235,245,0.22)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    for (const k of karts) {
      const [x, y] = this.mmap(k.x, k.z);
      ctx.beginPath();
      ctx.arc(x, y, k.me ? 5.5 : 4.2, 0, Math.PI * 2);
      ctx.fillStyle = k.color;
      ctx.fill();
      ctx.lineWidth = k.me ? 2.4 : 1.4;
      ctx.strokeStyle = k.me ? '#ffffff' : 'rgba(0,0,0,0.5)';
      ctx.stroke();
    }
    ctx.restore();
  }

  setPos(p, total) {
    this.posNum.textContent = p || '-';
    this.posOf.textContent = '/' + total;
  }

  setLap(l, total) {
    this.lapTxt.textContent = l >= total ? '¡Última vuelta!' : 'Vuelta ' + Math.min(l + 1, total) + '/' + total;
  }

  setTime(sec) {
    this.timeTxt.textContent = fmtTime(sec * 1000);
  }

  setSpeed(mps) {
    this.speedNum.textContent = Math.max(0, Math.round(Math.abs(mps) * KMH));
  }

  setItem(item, roulette) {
    this.item = item;
    this.roulette = roulette;
    if (roulette) this.rouletteT = 0;
    this.drawItem();
  }

  drawItem(force) {
    const ctx = this.itemCtx;
    if (this.roulette) {
      const list = ['turbo', 'banana', 'bolt', 'seeker', 'shield'];
      const i = Math.floor(this.rouletteT * 14) % list.length;
      drawItemIcon(ctx, list[i], this.itemCanvas.width);
      return;
    }
    if (this.item) drawItemIcon(ctx, this.item, this.itemCanvas.width);
    else drawItemIcon(ctx, null, this.itemCanvas.width);
  }

  tick(dt, speedRatio, boosting) {
    if (this.roulette) {
      this.rouletteT += dt;
      this._iconT += dt;
      if (this._iconT > 0.07) {
        this._iconT = 0;
        this.drawItem();
      }
    }
  }

  message(text, secs = 1.4, small = false) {
    this.big.textContent = text;
    this.big.classList.toggle('small', small);
    this.big.classList.add('show');
    if (this._msgTimer) clearTimeout(this._msgTimer);
    if (secs > 0) {
      this._msgTimer = setTimeout(() => this.big.classList.remove('show'), secs * 1000);
    }
  }

  clearMessage() {
    this.big.classList.remove('show');
  }

  setWrong(v) {
    this.wrong.classList.toggle('hidden', !v);
  }

  setNet(text) {
    this.net.textContent = text;
  }

  chat(name, text) {
    const div = document.createElement('div');
    div.className = 'chatline';
    div.innerHTML = '<b></b> ';
    div.firstChild.textContent = name;
    div.appendChild(document.createTextNode(text));
    this.chatLog.appendChild(div);
    while (this.chatLog.children.length > 4) this.chatLog.removeChild(this.chatLog.firstChild);
    setTimeout(() => div.remove(), 5000);
  }

  setStandings(list) {
    const key = list.map(e => (e.place || '') + e.name + (e.me ? '*' : '')).join('|');
    if (key === this._standKey) return;
    this._standKey = key;
    this.standings.innerHTML = '';
    for (const e of list) {
      const row = document.createElement('div');
      row.className = 'srow' + (e.me ? ' me' : '');
      const dot = document.createElement('span');
      dot.className = 'sd';
      dot.style.background = e.color;
      const name = document.createElement('span');
      name.className = 'sn';
      name.textContent = (e.place ? e.place + '. ' : '') + e.name;
      row.appendChild(dot);
      row.appendChild(name);
      this.standings.appendChild(row);
    }
  }
}
