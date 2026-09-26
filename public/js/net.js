import { buildTrack } from '/shared/track.js';
import { applySpin } from '/shared/physics.js';

export class RemoteKart {
  constructor(info) {
    this.id = info.id;
    this.name = info.name;
    this.charId = info.charId;
    this.bot = info.bot;
    this.buf = [];
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.heading = 0;
    this.speed = 0;
    this.flags = 0;
    this.seen = false;
    this.item = null;
  }

  push(x, z, heading, speed, flags, at) {
    this.buf.push({ x, z, heading, speed, flags, at });
    if (this.buf.length > 24) this.buf.shift();
    this.seen = true;
  }

  update(nowMs) {
    const buf = this.buf;
    if (!buf.length) return;
    const rip = 0.12;
    let a = buf[0];
    let b = buf[0];
    for (let i = 0; i < buf.length - 1; i++) {
      if (nowMs - buf[i + 1].at <= rip * 1000) {
        b = buf[i + 1];
        a = buf[i];
        break;
      }
      a = buf[i];
      b = buf[i + 1];
    }
    const span = Math.max(1, b.at - a.at);
    const t = Math.max(0, Math.min(1, (nowMs - rip * 1000 - a.at) / span));
    this.x = a.x + (b.x - a.x) * t;
    this.z = a.z + (b.z - a.z) * t;
    this.speed = a.speed + (b.speed - a.speed) * t;
    this.flags = b.flags;
    let dh = b.heading - a.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.heading = a.heading + dh * t;
  }
}

export function kartFlags(k) {
  let fl = 0;
  if (k.drifting) fl |= 1;
  if (k.boostT > 0) fl |= 2;
  if (k.spinT > 0) fl |= 4;
  if (k.shieldT > 0) fl |= 8;
  if (k.offroad) fl |= 16;
  if (k.finished) fl |= 32;
  if (k.item) fl |= 64;
  return fl;
}

export class NetSession {
  constructor(handlers) {
    this.mode = 'net';
    this.h = handlers;
    this.offset = 0;
    this.latency = 0;
    this.id = null;
    this.ws = null;
    this.connected = false;
    this.room = null;
    this.track = null;
    this.laps = 3;
    this.startAt = 0;
    this.state = 'connecting';
    this.time = 0;
    this.remotes = new Map();
    this.boxStates = new Map();
    this.hazards = new Map();
    this.hazardMeshes = new Map();
    this.rankIds = [];
    this.myKart = null;
    this._lastSend = 0;
    this._pingTimer = null;
  }

  join({ name, charId, room }) {
    const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    this.ws = new WebSocket(proto + location.host + '/ws');
    this.ws.onopen = () => {
      this.connected = true;
      this.send({ t: 'join', name, charId, room: room || null });
      this._pingTimer = setInterval(() => this.send({ t: 'ping', ts: Date.now() }), 2000);
    };
    this.ws.onmessage = ev => {
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      this.handle(m);
    };
    this.ws.onclose = () => {
      this.connected = false;
      clearInterval(this._pingTimer);
      this.h.onClose && this.h.onClose();
    };
    this.ws.onerror = () => {};
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  close() {
    clearInterval(this._pingTimer);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
  }

  serverNow() {
    return Date.now() + this.offset;
  }

  handle(m) {
    switch (m.t) {
      case 'welcome':
        this.id = m.id;
        this.offset = m.serverNow - Date.now();
        this.h.onWelcome && this.h.onWelcome(m);
        break;
      case 'pong': {
        const rtt = Date.now() - m.ts;
        this.latency = rtt;
        this.offset = m.now - (m.ts + rtt / 2);
        this.h.onPong && this.h.onPong(rtt);
        break;
      }
      case 'room':
        this.room = m.room;
        this.state = m.room.state;
        this.h.onRoom && this.h.onRoom(m.room);
        break;
      case 'start':
        this.beginRace(m);
        this.h.onStart && this.h.onStart(m);
        break;
      case 'go':
        this.state = 'racing';
        this.h.onGo && this.h.onGo(m);
        break;
      case 'st':
        this.applyStates(m.list, m.time, m.ranks);
        break;
      case 'hz':
        this.applyHazards(m.list);
        break;
      case 'box':
        this.boxStates.set(m.id, m.at);
        this.h.onBox && this.h.onBox(m.id, m.at);
        break;
      case 'item':
        this.h.onItem && this.h.onItem(m.item);
        break;
      case 'hit':
        this.applyHit(m);
        this.h.onHit && this.h.onHit(m);
        break;
      case 'fx':
        if (m.kind === 'batch') {
          for (const e of m.list) this.h.onFx && this.h.onFx(e);
        } else {
          this.h.onFx && this.h.onFx(m);
        }
        break;
      case 'finish':
        this.h.onFinish && this.h.onFinish(m);
        break;
      case 'results':
        this.state = 'results';
        this.h.onResults && this.h.onResults(m.list, m.laps);
        break;
      case 'error':
        this.h.onError && this.h.onError(m);
        break;
      case 'sys':
        this.h.onSys && this.h.onSys(m.text);
        break;
      case 'chat':
        this.h.onChat && this.h.onChat(m);
        break;
      case 'st_reset':
        if (this.myKart) {
          this.myKart.x = m.x;
          this.myKart.z = m.z;
          this.myKart.heading = m.h;
          this.myKart.vx = 0;
          this.myKart.vz = 0;
          this.myKart.projIdx = -1;
          const pr = this.track.project(m.x, m.z, -1);
          this.myKart.projIdx = pr.i;
          this.myKart.s = pr.s;
          this.myKart.u = pr.u;
        }
        break;
    }
  }

  beginRace(m) {
    this.state = 'countdown';
    this.startAt = m.startAt;
    this.laps = m.laps;
    this.raceTime0 = m.startAt;
    this.track = buildTrack(m.trackId);
    this.remotes = new Map();
    this.boxStates = new Map();
    for (const b of this.track.boxes) this.boxStates.set(b.id, 0);
    this.hazards = new Map();
    this.kartInfos = m.karts;
    for (const k of m.karts) {
      if (k.id === this.id) continue;
      this.remotes.set(k.id, new RemoteKart(k));
    }
  }

  applyStates(list, time, ranks) {
    this.time = time;
    this.rankIds = ranks || this.rankIds;
    const now = Date.now();
    for (const row of list) {
      const [id, x, z, h, sp, fl] = row;
      const rk = this.remotes.get(id);
      if (rk) {
        rk.push(x, z, h, sp, fl, now);
        if (fl & 64) {
          if (rk.item === null) rk.item = '?';
        } else rk.item = null;
      } else if (id === this.id && this.myKart) {
        this.myKart.speedServer = sp;
      }
    }
    if (this.h.onStates) this.h.onStates(list, time, ranks);
  }

  applyHazards(list) {
    const seen = new Set();
    for (const [id, type, owner, target, x, z, heading] of list) {
      seen.add(id);
      let h = this.hazards.get(id);
      if (!h) {
        h = { id, type, owner, target, x, z, heading, tx: x, tz: z, speed: type === 'seeker' ? 40 : type === 'bolt' ? 46 : 0, mesh: null };
        this.hazards.set(id, h);
        this.h.onHazardSpawn && this.h.onHazardSpawn(h);
      }
      h.tx = x;
      h.tz = z;
      h.heading = heading;
    }
    for (const [id, h] of this.hazards) {
      if (!seen.has(id) && this.h.onHazardRemove) {
        this.h.onHazardRemove(h);
        this.hazards.delete(id);
      }
    }
  }

  applyHit(m) {
    const k = this.myKart;
    if (!k || k.id !== m.id) return;
    applySpin(k, m.dur || 1.6);
  }

  updateOthers(dt) {
    const now = Date.now();
    for (const rk of this.remotes.values()) rk.update(now);
    for (const h of this.hazards.values()) {
      const f = 1 - Math.exp(-14 * dt);
      h.x += (h.tx - h.x) * f;
      h.z += (h.tz - h.z) * f;
    }
  }

  others() {
    return [...this.remotes.values()].filter(r => r.seen);
  }

  boxAvail(id) {
    return (this.boxStates.get(id) || 0) <= this.serverNow();
  }

  getBoxAvailArray() {
    return this.track ? this.track.boxes.map(b => this.boxAvail(b.id)) : null;
  }

  sendState(k, nowMs) {
    if (!this.connected || this.state !== 'racing') return;
    if (nowMs - this._lastSend < 50) return;
    this._lastSend = nowMs;
    this.send({
      t: 'st',
      x: Math.round(k.x * 100) / 100,
      z: Math.round(k.z * 100) / 100,
      h: Math.round(k.heading * 1000) / 1000,
      sp: Math.round(k.speed * 100) / 100,
      fl: kartFlags(k),
      s: Math.round(k.s * 100) / 100
    });
  }

  requestBox(boxId) {
    this.send({ t: 'box', id: boxId });
  }

  useOwnItem(item) {
    this.send({ t: 'use', item });
  }

  sendReady(v) {
    this.send({ t: 'ready', v });
  }

  sendSettings(s) {
    this.send({ t: 'settings', ...s });
  }

  sendStart() {
    this.send({ t: 'start' });
  }

  sendAgain() {
    this.send({ t: 'again' });
  }

  sendLobby() {
    this.send({ t: 'lobby' });
  }

  sendChat(text) {
    this.send({ t: 'chat', text });
  }

  sendHorn() {
    this.send({ t: 'horn' });
  }
}
