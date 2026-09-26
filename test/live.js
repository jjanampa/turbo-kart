import WebSocket from 'ws';
const BASE = process.env.TK_BASE || 'https://turbo-kart.vexio.dev';
const WSS = BASE.replace(/^http/, 'ws') + '/ws';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FALLO: ' + m); } else console.log('ok  ' + m); };

function client() {
  const ws = new WebSocket(WSS);
  const msgs = [];
  const waiters = [];
  ws.on('message', d => {
    const m = JSON.parse(d);
    msgs.push(m);
    for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i].pred(m)) { waiters.splice(i, 1)[0].resolve(m); }
  });
  return {
    ws, msgs,
    send: o => ws.send(JSON.stringify(o)),
    open: () => new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); }),
    wait: (t, timeout = 8000) => new Promise((resolve, reject) => {
      const f = msgs.find(m => m.t === t);
      if (f) return resolve(f);
      const timer = setTimeout(() => reject(new Error('timeout ' + t)), timeout);
      waiters.push({ pred: m => m.t === t, resolve: m => { clearTimeout(timer); resolve(m); } });
    })
  };
}

const a = client();
await a.open();
a.send({ t: 'join', name: 'Ana', charId: 'turbo' });
const wA = await a.wait('welcome');
assert(/^[A-Z0-9]{4}$/.test(wA.room.code), 'WSS: sala creada ' + wA.room.code);
const b = client();
await b.open();
b.send({ t: 'join', name: 'Beto', charId: 'bolt', room: wA.room.code });
const wB = await b.wait('welcome');
assert(wB.room.code === wA.room.code, 'WSS: segundo jugador entra por enlace');
b.send({ t: 'ready', v: true });
a.send({ t: 'settings', bots: 2, laps: 1, trackId: 'volcano' });
await sleep(200);
a.send({ t: 'start' });
const st = await a.wait('start');
assert(st.karts.length === 4, 'WSS: carrera con 4 karts (2 humanos + 2 bots)');
await a.wait('go', 8000);
assert(true, 'WSS: senal GO recibida');
await sleep(6000);
const states = b.msgs.filter(m => m.t === 'st');
assert(states.length > 40, 'WSS: estados fluyen (' + states.length + ' en 6s)');
a.send({ t: 'ping', ts: Date.now() });
const pong = await a.wait('pong');
assert(typeof pong.now === 'number', 'WSS: ping/pong sincroniza reloj (rtt ' + (Date.now() - pong.ts) + 'ms)');
a.ws.close(); b.ws.close();
if (failures) { console.error(failures + ' fallos'); process.exit(1); }
console.log('\nLIVE WS OK');
process.exit(0);
