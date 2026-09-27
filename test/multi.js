import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const PORT = Number(process.env.TK_MULTI_PORT || 4907);
const BASE = process.env.TK_BASE || 'http://localhost:' + PORT;
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

let proc = null;
if (!process.env.TK_BASE) {
  proc = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  proc.stderr.on('data', d => console.error('[server] ' + d.toString().trim()));
}

for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(BASE + '/health');
    if (r.ok) break;
  } catch {}
  await sleep(150);
}

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: [
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion'
  ]
});

const errors = [];
async function makePage(width, height) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !/favicon/i.test(m.text())) errors.push('console: ' + m.text());
  });
  return page;
}

async function click(page, sel) {
  await page.evaluate(s => {
    const el = document.querySelector(s);
    if (el) el.click();
  }, sel);
}

async function waitFor(fn, timeout = 30000, step = 400) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try {
      if (await fn()) return true;
    } catch {}
    await sleep(step);
  }
  return false;
}

async function pump(page, ms) {
  await page.bringToFront();
  await sleep(ms);
}

const host = await makePage(900, 620);
await host.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 45000 });
await sleep(2500);
await click(host, '#btnCreate');
const gotLobby = await waitFor(async () => host.$eval('#lobby', el => !el.classList.contains('hidden')), 20000);
assert(gotLobby, 'anfitrion en sala');
const codeOk = await waitFor(async () => {
  const c = await host.$eval('#roomCode', el => el.textContent.trim());
  return /^[A-Z0-9]{4}$/.test(c);
}, 20000);
const code = await host.$eval('#roomCode', el => el.textContent.trim());
assert(codeOk && /^[A-Z0-9]{4}$/.test(code), 'anfitrion crea sala ' + code);

const guest = await makePage(900, 620);
await guest.goto(BASE + '/?room=' + code, { waitUntil: 'networkidle2', timeout: 45000 });
await sleep(2000);
const prefilled = await guest.$eval('#inpCode', el => el.value);
assert(prefilled === code, 'enlace de invitacion prellena el codigo');
await click(guest, '#btnJoin');
const bothIn = await waitFor(async () => {
  const n = await host.$$eval('#lobbyPlayers .prow', els => els.length);
  return n === 2;
}, 20000);
assert(bothIn, 'anfitrion ve 2 jugadores');
const guestRows = await guest.$$eval('#lobbyPlayers .prow', els => els.length);
assert(guestRows === 2, 'invitado ve 2 jugadores');
const guestHasStart = await guest.$eval('#btnStart', el => !el.classList.contains('hidden'));
assert(!guestHasStart, 'invitado no puede iniciar');

await click(guest, '#btnReady');
await sleep(800);
await click(host, '#btnStart');
const bothRacing = await waitFor(async () => {
  const h = await host.$eval('#hud', el => !el.classList.contains('hidden'));
  const g = await guest.$eval('#hud', el => !el.classList.contains('hidden'));
  return h && g;
}, 40000);
assert(bothRacing, 'ambos entran en carrera');
await sleep(4500);

let hostSpeed = 0;
let guestSpeed = 0;
const t0 = Date.now();
while (Date.now() - t0 < 120000) {
  await pump(host, 1200);
  await host.evaluate(() => window.__tk.input.keys.add('KeyW'));
  await pump(host, 2200);
  hostSpeed = await host.evaluate(() => Math.round((window.__tk.race?.myKart?.speed || 0) * 3.6));
  await host.evaluate(() => window.__tk.input.keys.delete('KeyW'));
  await pump(guest, 1200);
  await guest.evaluate(() => window.__tk.input.keys.add('KeyW'));
  await pump(guest, 2200);
  guestSpeed = await guest.evaluate(() => Math.round((window.__tk.race?.myKart?.speed || 0) * 3.6));
  await guest.evaluate(() => window.__tk.input.keys.delete('KeyW'));
  if (hostSpeed > 15 && guestSpeed > 15) break;
}
assert(hostSpeed > 15 && guestSpeed > 15, 'ambos karts aceleran (' + hostSpeed + ' / ' + guestSpeed + ' km/h)');

let standHostRows = 0;
let standGuestRows = 0;
const t1 = Date.now();
while (Date.now() - t1 < 40000) {
  await pump(host, 1500);
  standHostRows = await host.$$eval('#standings .srow', els => els.length);
  await pump(guest, 1500);
  standGuestRows = await guest.$$eval('#standings .srow', els => els.length);
  if (standHostRows >= 5 && standGuestRows >= 5) break;
}
assert(standHostRows >= 5 && standGuestRows >= 5, 'clasificacion con bots y jugadores (' + standHostRows + '/' + standGuestRows + ')');

await pump(host, 1500);
const hostPos = await host.$eval('#posNum', el => el.textContent);
const hostNet = await host.$eval('#netInfo', el => el.textContent);
await pump(guest, 1500);
const guestPos = await guest.$eval('#posNum', el => el.textContent);
assert(hostPos !== '-' && guestPos !== '-', 'posiciones calculadas (' + hostPos + ', ' + guestPos + ')');
assert(/ms/.test(hostNet), 'latencia visible en HUD (' + hostNet + ')');

await pump(host, 1200);
await host.screenshot({ path: 'test/multi-host.png' });
await pump(guest, 1200);
await guest.screenshot({ path: 'test/multi-guest.png' });

assert(errors.length === 0, 'sin errores en ningun cliente' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));

await browser.close();
if (proc) proc.kill();
if (failures) {
  console.error('\n' + failures + ' fallos');
  process.exit(1);
}
console.log('\nMULTI OK');
process.exit(0);
