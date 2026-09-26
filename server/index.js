import express from 'express';
import compression from 'compression';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { buildTrack } from '../shared/track.js';
import { TICK, ITEM_BOX_RESPAWN, LAPS_OPTIONS, DEFAULT_LAPS, MAX_KARTS, CHARACTERS, rollItem, clamp, charById } from '../shared/constants.js';
import { makeKartState, resetKart, stepKart, resolveKartCollisions, applySpin, applyShield, applyBoost } from '../shared/physics.js';
import { newProgress, updateProgress } from '../shared/race.js';
import { useItem } from '../shared/items.js';
import { stepHazards } from '../shared/hazards.js';
import { botInput, botItemChoice, makeBot } from '../shared/bots.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 4321);

const app = express();
app.disable('x-powered-by');
app.use(compression());
app.use(express.static(path.join(root, 'public')));
app.use('/shared', express.static(path.join(root, 'shared')));
app.get('/vendor/:file', (req, res) => {
  const f = req.params.file;
  if (!/^[\w.-]+\.js$/.test(f)) return res.status(400).end();
  res.sendFile(path.join(root, 'node_modules', 'three', 'build', f));
});
app.get('/health', (req, res) => {
  res.json({ ok: true, rooms: rooms.size, uptime: Math.round(process.uptime()) });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BOT_NAMES = ['Nitro', 'Rex', 'Luna', 'Pixel', 'Vega', 'Tornado', 'Cometa', 'Chispa'];

function makeCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  } while (rooms.has(code));
  return code;
}

function sanitizeName(name) {
  const s = String(name || '').replace(/[<>&"'`\u0000-\u001f]/g, '').trim().slice(0, 16);
  return s || 'Jugador';
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {}
  }
}

function roomSnapshot(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    state: room.state,
    trackId: room.trackId,
    laps: room.laps,
    botCount: room.botCount,
    players: [...room.players.values()].map(p => ({
      id: p.id,
      name: p.name,
      charId: p.charId,
      ready: p.ready,
      bot: false
    }))
  };
}

function broadcast(room, msg, exceptId) {
  const data = JSON.stringify(msg);
  for (const p of room.players.values()) {
    if (p.id === exceptId) continue;
    if (p.ws && p.ws.readyState === 1) {
      try {
        p.ws.send(data);
      } catch {}
    }
  }
}

function makePlayer(id, ws) {
  return {
    id,
    ws,
    name: 'Jugador',
    charId: CHARACTERS[0].id,
    ready: false,
    connected: true,
    kart: null,
    prog: newProgress(),
    rank: 1,
    lastStateAt: 0,
    lastBoxAt: 0,
    lastUseAt: 0,
    item: null,
    finishSent: false,
    stateCount: 0,
    msgCount: 0,
    msgWindow: 0
  };
}

function makePlayerKart(p, slot, track) {
  const g = track.gridSlot(slot);
  const k = makeKartState({ id: p.id, charId: p.charId, name: p.name });
  k.bot = false;
  k.x = g.x;
  k.z = g.z;
  k.y = g.y;
  k.heading = g.heading;
  k.vx = 0;
  k.vz = 0;
  k.speed = 0;
  const pr = track.project(k.x, k.z, -1);
  k.projIdx = pr.i;
  k.s = pr.s;
  k.u = pr.u;
  k.y = pr.y;
  return k;
}

function startRace(room) {
  const track = buildTrack(room.trackId);
  room.track = track;
  const humans = [...room.players.values()];
  humans.forEach((p, i) => {
    p.slot = i;
    p.prog = newProgress();
    p.finishSent = false;
    p.item = null;
    p.kart = makePlayerKart(p, i, track);
  });
  const bots = [];
  const usedChars = new Set(humans.map(p => p.charId));
  for (let i = 0; i < room.botCount && humans.length + bots.length < MAX_KARTS; i++) {
    const slot = humans.length + i;
    const avail = CHARACTERS.filter(c => !usedChars.has(c.id));
    const charId = avail.length ? avail[Math.floor(Math.random() * avail.length)].id : CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].id;
    usedChars.add(charId);
    const bot = makeBot('bot' + (i + 1), charId, clamp(0.72 + i * 0.045, 0.7, 0.99), BOT_NAMES[i % BOT_NAMES.length]);
    resetKart(bot, track, track.gridSlot(slot).s, track.gridSlot(slot).u);
    bot.slot = slot;
    bot.prog = newProgress();
    bot.boxCd = 0;
    bots.push(bot);
  }
  const startAt = Date.now() + 3800;
  room.bots = bots;
  room.race = {
    track,
    startAt,
    startedAt: 0,
    boxes: track.boxes.map(b => ({ id: b.id, availAt: 0 })),
    hazards: [],
    now: startAt,
    time: 0,
    firstFinishAt: 0,
    ended: false,
    results: null,
    snapshotAt: 0
  };
  room.state = 'countdown';
  const grid = {};
  humans.forEach(p => (grid[p.id] = p.slot));
  bots.forEach(b => (grid[b.id] = b.slot));
  broadcast(room, {
    t: 'start',
    trackId: room.trackId,
    laps: room.laps,
    startAt,
    serverNow: Date.now(),
    grid,
    karts: [
      ...humans.map(p => ({ id: p.id, name: p.name, charId: p.charId, bot: false, slot: p.slot })),
      ...bots.map(b => ({ id: b.id, name: b.name, charId: b.charId, bot: true, slot: b.slot }))
    ]
  });
}

function endRace(room) {
  const race = room.race;
  if (!race || race.ended) return;
  race.ended = true;
  room.state = 'results';
  const entries = [];
  for (const p of room.players.values()) {
    entries.push({
      id: p.id,
      name: p.name,
      charId: p.charId,
      bot: false,
      finished: p.prog.finished,
      time: p.prog.finishTime,
      progress: p.prog.progress
    });
  }
  for (const b of room.bots) {
    entries.push({
      id: b.id,
      name: b.name,
      charId: b.charId,
      bot: true,
      finished: b.prog.finished,
      time: b.prog.finishTime,
      progress: b.prog.progress
    });
  }
  entries.sort((a, b) => {
    if (a.finished && b.finished) return a.time - b.time;
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return b.progress - a.progress;
  });
  entries.forEach((e, i) => (e.place = i + 1));
  room.race.results = entries;
  broadcast(room, { t: 'results', list: entries, laps: room.laps });
}

function tickRoom(room) {
  const now = Date.now();
  if (room.state === 'countdown') {
    if (now >= room.race.startAt) {
      room.state = 'racing';
      room.race.startedAt = now;
      broadcast(room, { t: 'go', serverNow: now });
    }
    return;
  }
  if (room.state !== 'racing') return;
  const race = room.race;
  const dt = TICK;
  race.now = now;
  race.time = (now - race.startedAt) / 1000;
  const events = [];
  const world = {
    track: race.track,
    karts: [...room.bots, ...[...room.players.values()].map(p => p.kart).filter(Boolean)],
    events,
    now,
    time: race.time,
    stepKart: null,
    useItem: null
  };
  world.stepKart = (k, inp, d) => stepKart(k, inp, world, d);
  world.useItem = (k, item) => useItem(world, k, item);

  for (const p of room.players.values()) {
    const k = p.kart;
    if (!k) continue;
    k.itemT = Math.max(0, k.itemT - dt);
    k.invulnT = Math.max(0, k.invulnT - dt);
    k.shieldT = Math.max(0, k.shieldT - dt);
    k.boostT = Math.max(0, k.boostT - dt);
    k.spinT = Math.max(0, k.spinT - dt);
    k.squashT = Math.max(0, k.squashT - dt);
    k.padCd = Math.max(0, k.padCd - dt);
  }

  for (const bot of room.bots) {
    if (bot.prog.finished) continue;
    const inp = botInput(bot, world, dt);
    world.stepKart(bot, inp, dt);
    bot.boxCd = Math.max(0, (bot.boxCd || 0) - dt);
    if (!bot.item && bot.boxCd <= 0) {
      for (const box of race.track.boxes) {
        const st = race.boxes.find(b => b.id === box.id);
        if (!st || st.availAt > now) continue;
        const dx = bot.x - box.x;
        const dz = bot.z - box.z;
        if (dx * dx + dz * dz < 3.2 * 3.2) {
          const ranks = standings(room);
          const rank = ranks.findIndex(r => r.id === bot.id) + 1;
          bot.item = rollItem(rank || 1, ranks.length);
          bot.itemT = 1.2;
          bot.botItemAt = 0;
          st.availAt = now + ITEM_BOX_RESPAWN * 1000;
          bot.boxCd = 1.5;
          broadcast(room, { t: 'box', id: box.id, at: st.availAt });
          events.push({ kind: 'pickup', id: bot.id, x: bot.x, z: bot.z, boxId: box.id });
          break;
        }
      }
    }
    const pick = botItemChoice(bot, world, now);
    if (pick) {
      world.useItem(bot, pick);
      bot.botItemAt = 0;
    }
    const evs = updateProgress(bot.prog, bot.s, race.track, room.laps, now, race.startedAt, dt);
    if (evs) for (const e of evs) {
      if (e.kind === 'finish') {
        broadcast(room, { t: 'finish', id: bot.id, time: e.time });
        if (!race.firstFinishAt) race.firstFinishAt = now;
      }
    }
  }
  world.karts = [...room.bots, ...[...room.players.values()].map(p => p.kart).filter(Boolean)];
  resolveKartCollisions(room.bots);

  const hzEvents = stepHazards(race.hazards, world, dt);
  for (const e of hzEvents.slice()) {
    if (e.kind === 'hit' || e.kind === 'block') {
      const victim = e.victim;
      const isPlayer = room.players.has(victim);
      if (isPlayer) {
        broadcast(room, { t: 'hit', id: victim, dur: e.hazard === 'seeker' ? 2.0 : 1.6, x: e.x, z: e.z, hazard: e.hazard });
        const p = room.players.get(victim);
        if (p && p.item) {
          p.item = null;
          if (p.kart) p.kart.item = null;
          send(p.ws, { t: 'item', item: null });
        }
      } else {
        broadcast(room, { t: 'fx', kind: e.kind, id: victim, x: e.x, z: e.z });
        if (e.kind === 'hit') {
          const b = room.bots.find(b => b.id === victim);
          if (b) {
            b.item = null;
            events.push({ kind: 'hit', id: victim, x: e.x, z: e.z });
          }
        }
      }
    } else {
      broadcast(room, { t: 'fx', kind: e.kind, x: e.x, z: e.z });
    }
  }

  const ranks = standings(room);
  ranks.forEach((r, i) => {
    r.rank = i + 1;
    if (room.players.has(r.id)) room.players.get(r.id).rank = i + 1;
  });
  const leader = ranks.length ? ranks[0].progress : 0;
  for (const bot of room.bots) {
    if (bot.prog.finished) continue;
    if (bot.prog.progress < leader - 140) bot.rubber = 1.07;
    else if (bot.prog.progress > leader + 90) bot.rubber = 0.95;
    else bot.rubber = 1;
  }

  for (const p of room.players.values()) {
    if (!p.kart) continue;
    const evs = updateProgress(p.prog, p.kart.s, race.track, room.laps, now, race.startedAt, dt);
    if (evs) for (const e of evs) {
      if (e.kind === 'finish' && !p.finishSent) {
        p.finishSent = true;
        broadcast(room, { t: 'finish', id: p.id, time: e.time });
        if (!race.firstFinishAt) race.firstFinishAt = now;
      }
    }
    if (p.prog.finished) p.kart.finished = true;
  }

  const allKarts = [...room.bots, ...[...room.players.values()].map(p => p.kart).filter(Boolean)];
  const alive = allKarts.filter(k => !k.prog || !k.prog.finished);
  let anyFinished = allKarts.some(k => (k.prog && k.prog.finished));
  if (anyFinished && !race.firstFinishAt) race.firstFinishAt = now;
  if (
    room.state === 'racing' &&
    (alive.length === 0 || (race.firstFinishAt && now - race.firstFinishAt > 45000))
  ) {
    endRace(room);
    return;
  }

  const list = allKarts.map(k => {
    let fl = 0;
    if (k.drifting) fl |= 1;
    if (k.boostT > 0) fl |= 2;
    if (k.spinT > 0) fl |= 4;
    if (k.shieldT > 0) fl |= 8;
    if (k.offroad) fl |= 16;
    if (k.prog && k.prog.finished) fl |= 32;
    if (k.item) fl |= 64;
    return [k.id, Math.round(k.x * 100) / 100, Math.round(k.z * 100) / 100, Math.round(k.heading * 1000) / 1000, Math.round(k.speed * 100) / 100, fl];
  });
  broadcast(room, { t: 'st', list, time: Math.round(race.time * 1000) / 1000, ranks: ranks.map(r => r.id) });

  if (now - race.snapshotAt > 100) {
    race.snapshotAt = now;
    broadcast(room, {
      t: 'hz',
      list: race.hazards.map(h => [h.id, h.type, h.ownerId, h.targetId || '', Math.round(h.x * 100) / 100, Math.round(h.z * 100) / 100, Math.round(h.heading * 1000) / 1000])
    });
  }
  if (events.length) broadcast(room, { t: 'fx', kind: 'batch', list: events });
}

function standings(room) {
  const arr = [];
  for (const p of room.players.values()) {
    if (!p.kart || !p.prog) continue;
    arr.push({ id: p.id, progress: p.prog.progress, rank: p.rank });
  }
  for (const b of room.bots) {
    if (!b.prog) continue;
    arr.push({ id: b.id, progress: b.prog.progress, rank: b.rank });
  }
  arr.sort((a, b) => b.progress - a.progress);
  return arr;
}

setInterval(() => {
  for (const room of rooms.values()) {
    try {
      tickRoom(room);
    } catch (err) {
      console.error('tick error', room.code, err);
    }
  }
}, TICK * 1000);

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const empty = [...room.players.values()].every(p => !p.connected);
    if (empty && now - room.lastActivity > 60000) rooms.delete(code);
  }
}, 15000);

wss.on('connection', ws => {
  let room = null;
  let player = null;
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', raw => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== 'string') return;
    if (player) {
      player.msgCount++;
      if (Date.now() - player.msgWindow > 1000) {
        player.msgWindow = Date.now();
        player.msgCount = 1;
      }
      if (player.msgCount > 150) return;
    }
    if (msg.t === 'ping') {
      send(ws, { t: 'pong', ts: msg.ts, now: Date.now() });
      return;
    }
    if (!player) {
      if (msg.t !== 'join') return;
      const id = 'p' + Math.random().toString(36).slice(2, 8);
      player = makePlayer(id, ws);
      player.name = sanitizeName(msg.name);
      player.charId = charById(msg.charId).id;
      player.msgWindow = Date.now();
      let code = typeof msg.room === 'string' ? msg.room.toUpperCase().slice(0, 4) : null;
      if (code) {
        const r = rooms.get(code);
        if (!r) {
          send(ws, { t: 'error', code: 'notfound', msg: 'Sala no encontrada' });
          return;
        }
        if (r.state !== 'lobby') {
          send(ws, { t: 'error', code: 'busy', msg: 'La carrera ya empezo en esa sala' });
          return;
        }
        room = r;
      } else {
        code = makeCode();
        room = {
          code,
          hostId: player.id,
          state: 'lobby',
          trackId: 'sunset',
          laps: DEFAULT_LAPS,
          botCount: 3,
          players: new Map(),
          bots: [],
          race: null,
          lastActivity: Date.now()
        };
        rooms.set(code, room);
      }
      room.players.set(player.id, player);
      room.lastActivity = Date.now();
      send(ws, {
        t: 'welcome',
        id: player.id,
        serverNow: Date.now(),
        room: roomSnapshot(room),
        tracks: [],
        maxKarts: MAX_KARTS
      });
      broadcast(room, { t: 'room', room: roomSnapshot(room) }, player.id);
      broadcast(room, { t: 'sys', text: player.name + ' entro a la sala' }, player.id);
      return;
    }
    room.lastActivity = Date.now();
    if (!room) return;

    if (msg.t === 'st') {
      const k = player.kart;
      if (!k || room.state !== 'racing') return;
      if (typeof msg.x !== 'number' || typeof msg.z !== 'number' || !isFinite(msg.x) || !isFinite(msg.z)) return;
      const dx = msg.x - k.x;
      const dz = msg.z - k.z;
      if (dx * dx + dz * dz > 400) {
        send(ws, { t: 'st_reset', x: k.x, z: k.z, h: k.heading });
        return;
      }
      k.x = msg.x;
      k.z = msg.z;
      k.heading = typeof msg.h === 'number' ? msg.h : k.heading;
      k.speed = typeof msg.sp === 'number' ? msg.sp : 0;
      k.vx = Math.sin(k.heading) * k.speed;
      k.vz = Math.cos(k.heading) * k.speed;
      const pr = room.track.project(k.x, k.z, k.projIdx);
      k.projIdx = pr.i;
      k.s = pr.s;
      k.u = pr.u;
      k.y = pr.y;
      k.offroad = Math.abs(pr.u) > pr.hw + 0.9;
      const fl = typeof msg.fl === 'number' ? msg.fl : 0;
      k.drifting = !!(fl & 1);
      k.boostT = fl & 2 ? Math.max(k.boostT, 0.06) : 0;
      k.spinT = fl & 4 ? Math.max(k.spinT, 0.06) : 0;
      k.shieldT = fl & 8 ? Math.max(k.shieldT, 0.06) : 0;
      k.lastStateAt = Date.now();
      return;
    }

    if (msg.t === 'box') {
      const k = player.kart;
      if (!k || room.state !== 'racing' || player.item) return;
      const now = Date.now();
      if (now - player.lastBoxAt < 700) return;
      const box = room.track.boxes.find(b => b.id === msg.id);
      const st = room.race.boxes.find(b => b.id === msg.id);
      if (!box || !st || st.availAt > now) return;
      const dx = k.x - box.x;
      const dz = k.z - box.z;
      if (dx * dx + dz * dz > 3.4 * 3.4) return;
      player.lastBoxAt = now;
      const rank = player.rank || 1;
      const total = room.players.size + room.bots.length;
      player.item = rollItem(rank, total);
      k.item = player.item;
      k.itemT = 1.2;
      st.availAt = now + ITEM_BOX_RESPAWN * 1000;
      broadcast(room, { t: 'box', id: box.id, at: st.availAt });
      send(ws, { t: 'item', item: player.item });
      broadcast(room, { t: 'fx', kind: 'pickup', id: player.id, x: k.x, z: k.z }, player.id);
      return;
    }

    if (msg.t === 'use') {
      const k = player.kart;
      if (!k || room.state !== 'racing') return;
      const now = Date.now();
      if (now - player.lastUseAt < 400) return;
      if (!player.item || player.item !== msg.item || k.itemT > 0) {
        send(ws, { t: 'item', item: player.item });
        return;
      }
      player.lastUseAt = now;
      const world = {
        track: room.track,
        karts: [...room.bots, ...[...room.players.values()].map(p => p.kart).filter(Boolean)],
        events: [],
        now,
        time: room.race.time
      };
      const out = useItem(world, k, msg.item);
      if (out.hazard) room.race.hazards.push(out.hazard);
      for (const e of world.events) broadcast(room, { t: 'fx', ...e });
      player.item = null;
      send(ws, { t: 'item', item: null });
      return;
    }

    if (msg.t === 'settings') {
      if (player.id !== room.hostId || room.state !== 'lobby') return;
      if (typeof msg.trackId === 'string' && ['sunset', 'forest', 'volcano'].includes(msg.trackId)) room.trackId = msg.trackId;
      if (typeof msg.laps === 'number' && LAPS_OPTIONS.includes(msg.laps)) room.laps = msg.laps;
      if (typeof msg.bots === 'number') room.botCount = clamp(Math.round(msg.bots), 0, MAX_KARTS - 1);
      broadcast(room, { t: 'room', room: roomSnapshot(room) });
      return;
    }

    if (msg.t === 'ready') {
      if (room.state !== 'lobby') return;
      player.ready = !!msg.v;
      broadcast(room, { t: 'room', room: roomSnapshot(room) });
      return;
    }

    if (msg.t === 'start') {
      if (player.id !== room.hostId || room.state !== 'lobby') return;
      startRace(room);
      return;
    }

    if (msg.t === 'again') {
      if (player.id !== room.hostId || room.state !== 'results') return;
      startRace(room);
      return;
    }

    if (msg.t === 'lobby') {
      if (player.id !== room.hostId) return;
      room.state = 'lobby';
      room.race = null;
      room.bots = [];
      for (const p of room.players.values()) {
        p.kart = null;
        p.prog = newProgress();
        p.ready = false;
        p.item = null;
      }
      broadcast(room, { t: 'room', room: roomSnapshot(room) });
      return;
    }

    if (msg.t === 'chat') {
      const text = String(msg.text || '').slice(0, 60).replace(/[<>&]/g, '');
      if (text) broadcast(room, { t: 'chat', id: player.id, name: player.name, text });
      return;
    }

    if (msg.t === 'horn') {
      broadcast(room, { t: 'fx', kind: 'horn', id: player.id, x: player.kart ? player.kart.x : 0, z: player.kart ? player.kart.z : 0 }, player.id);
      return;
    }
  });

  ws.on('close', () => {
    if (!player || !room) return;
    player.connected = false;
    room.players.delete(player.id);
    room.lastActivity = Date.now();
    if (room.players.size === 0) {
      room.state = 'lobby';
      return;
    }
    if (room.hostId === player.id) {
      const next = [...room.players.values()].find(p => p.connected);
      if (next) room.hostId = next.id;
    }
    broadcast(room, { t: 'room', room: roomSnapshot(room) });
    broadcast(room, { t: 'sys', text: player.name + ' salio de la sala' });
    if (room.state === 'racing') {
      broadcast(room, { t: 'fx', kind: 'left', id: player.id });
    }
  });
});

setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 20000);

server.listen(PORT, () => {
  console.log('Turbo Kart escuchando en http://localhost:' + PORT);
});
