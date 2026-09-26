import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import { buildTrack } from '../shared/track.js';

const PORT = Number(process.env.TK_TEST_PORT || 4899);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;

function assert(cond, msg) {
  if (!cond) {
    failures++;
    console.error('FALLO: ' + msg);
  } else {
    console.log('ok  ' + msg);
  }
}

async function waitFor(fn, timeout = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try {
      if (await fn()) return true;
    } catch {}
    await sleep(120);
  }
  return false;
}

function connect() {
  const ws = new WebSocket('ws://localhost:' + PORT + '/ws');
  const client = {
    ws,
    msgs: [],
    waiters: [],
    send: obj => ws.send(JSON.stringify(obj)),
    push(m) {
      this.msgs.push(m);
      for (let i = this.waiters.length - 1; i >= 0; i--) {
        const w = this.waiters[i];
        if (w.pred(m)) {
          this.waiters.splice(i, 1);
          w.resolve(m);
        }
      }
    },
    wait(type, timeout = 8000) {
      const found = this.msgs.find(m => m.t === type);
      if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const i = this.waiters.indexOf(w);
          if (i >= 0) this.waiters.splice(i, 1);
          reject(new Error('timeout esperando ' + type));
        }, timeout);
        const w = {
          pred: m => m.t === type,
          resolve: m => {
            clearTimeout(timer);
            resolve(m);
          }
        };
        this.waiters.push(w);
      });
    },
    all(type) {
      return this.msgs.filter(m => m.t === type);
    }
  };
  ws.on('message', data => {
    try {
      client.push(JSON.parse(data));
    } catch {}
  });
  return client;
}

const proc = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe']
});
proc.stderr.on('data', d => console.error('[server] ' + d.toString().trim()));
proc.stdout.on('data', d => console.log('[server] ' + d.toString().trim()));

const ok = await waitFor(async () => {
  const r = await fetch('http://localhost:' + PORT + '/health');
  return r.ok;
}, 8000);
assert(ok, 'servidor HTTP responde /health');
if (!ok) {
  proc.kill();
  process.exit(1);
}

const a = connect();
await new Promise(r => a.ws.on('open', r));
a.send({ t: 'join', name: 'Ana', charId: 'aqua' });
const wA = await a.wait('welcome');
const code = wA.room.code;
assert(/^[A-Z0-9]{4}$/.test(code), 'sala creada con codigo ' + code);
assert(wA.room.players.length === 1, 'Ana en la sala');

const b = connect();
await new Promise(r => b.ws.on('open', r));
b.send({ t: 'join', name: 'Beto', charId: 'bolt', room: code });
const wB = await b.wait('welcome');
assert(wB.room.code === code, 'Beto entra a la misma sala');

const roomMsg = await a.wait('room');
assert(roomMsg.room.players.length === 2, 'broadcast de sala con 2 jugadores');

a.send({ t: 'ready', v: true });
b.send({ t: 'ready', v: true });
a.send({ t: 'settings', bots: 3, laps: 1, trackId: 'sunset' });
await sleep(150);
a.send({ t: 'start' });
const st = await a.wait('start', 5000);
assert(st.karts.length === 5, 'carrera inicia con 5 karts (2 humanos + 3 bots)');
assert(st.laps === 1, 'vueltas configuradas a 1');

const goMsg = await a.wait('go', 6000);
assert(!!goMsg, 'senal GO recibida');

const track = buildTrack('sunset');
const grid = track.gridSlot(0);
a.send({ t: 'st', x: grid.x, z: grid.z, h: grid.heading, sp: 0, fl: 0, s: grid.s });
await sleep(120);

const box = track.boxes[0];
let curS = grid.s;
const targetS = box.s;
let guard = 0;
while (guard++ < 120) {
  let ds = targetS - curS;
  if (ds < -track.length / 2) ds += track.length;
  if (ds > track.length / 2) ds -= track.length;
  if (Math.abs(ds) < 6) break;
  const stepS = curS + Math.sign(ds) * Math.min(14, Math.abs(ds));
  const p = track.worldAt(stepS, 0, 0);
  curS = ((stepS % track.length) + track.length) % track.length;
  a.send({ t: 'st', x: p.x, z: p.z, h: track.headingAt(curS), sp: 0, fl: 0, s: curS });
  await sleep(60);
}
await sleep(200);
const boxPos = track.worldAt(box.s, box.u, 0);
a.send({ t: 'st', x: boxPos.x, z: boxPos.z, h: 0, sp: 0, fl: 0, s: box.s });
await sleep(150);
a.send({ t: 'box', id: box.id });
const itemMsg = await a.wait('item', 3000);
assert(!!itemMsg.item, 'item recibido de la caja: ' + itemMsg.item);
await sleep(1500);
a.send({ t: 'use', item: itemMsg.item });
await sleep(500);
const itemAfter = a.all('item').filter(m => m.item === null);
assert(itemAfter.length >= 1, 'servidor confirma el uso del item');

const t0 = Date.now();
await sleep(6000);
const statesA = a.all('st');
const statesB = b.all('st');
assert(statesA.length > 60, 'estados recibidos a ritmo (' + statesA.length + ' en ~6s)');
const botRows = statesB.filter(m => m.list.some(r => String(r[0]).startsWith('bot')));
let maxBotMove = 0;
const botFirst = new Map();
const botLast = new Map();
for (const m of botRows) {
  for (const row of m.list) {
    if (!String(row[0]).startsWith('bot')) continue;
    if (!botFirst.has(row[0])) botFirst.set(row[0], row);
    botLast.set(row[0], row);
  }
}
for (const [id, first] of botFirst) {
  const last = botLast.get(id);
  const d = Math.hypot(last[1] - first[1], last[2] - first[2]);
  maxBotMove = Math.max(maxBotMove, d);
}
assert(maxBotMove > 15, 'los bots se mueven en pista (' + maxBotMove.toFixed(1) + 'm)');
const hasA = statesB.some(m => m.list.some(r => r[0] === wA.id));
assert(hasA, 'Beto ve el kart de Ana en los estados');
assert(Date.now() - t0 < 9000, 'prueba en tiempo razonable');

proc.kill();
if (failures) {
  console.error('\n' + failures + ' fallos');
  process.exit(1);
}
console.log('\nWS OK');
process.exit(0);
