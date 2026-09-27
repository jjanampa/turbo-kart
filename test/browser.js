import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const PORT = Number(process.env.TK_BROWSER_PORT || 4901);
const BASE = process.env.TK_BASE || 'http://localhost:' + PORT;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const cdpErrors = [];

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

async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE + '/health');
      if (r.ok) return true;
    } catch {}
    await sleep(150);
  }
  return false;
}

const up = await waitServer();
assert(up, 'servidor arriba para el navegador');
if (!up) {
  if (proc) proc.kill();
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
page.on('console', m => {
  const t = m.text();
  if (m.type() === 'error') cdpErrors.push(t);
});
page.on('pageerror', e => cdpErrors.push('pageerror: ' + e.message));

await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 45000 });
await sleep(2500);
assert(!!(await page.$('#menu')), 'menu principal presente');
const menuVisible = await page.$eval('#menu', el => !el.classList.contains('hidden'));
assert(menuVisible, 'menu visible');

const hasCanvasPixels = await page.evaluate(() => {
  const c = document.getElementById('game');
  return c && c.width > 100 && c.height > 100;
});
assert(hasCanvasPixels, 'canvas de juego dimensionado');

await page.click('#btnSolo');
await sleep(1000);
const raceReady = await (async () => {
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const st = await page.evaluate(() => (window.__tk && window.__tk.race ? window.__tk.race.state : null));
    if (st === 'racing') return true;
    await sleep(500);
  }
  return false;
})();
assert(raceReady, 'carrera iniciada (estado racing)');
const hudVisible = await page.$eval('#hud', el => !el.classList.contains('hidden'));
assert(hudVisible, 'HUD visible tras iniciar carrera solo');
const touchHidden = await page.$eval('#touch', el => el.classList.contains('hidden'));
assert(touchHidden, 'controles tactiles ocultos en desktop');

await page.keyboard.down('KeyW');
const accelerated = await (async () => {
  const t0 = Date.now();
  while (Date.now() - t0 < 25000) {
    const v = Number(await page.$eval('#speedNum', el => el.textContent));
    if (v > 25) return v;
    await sleep(400);
  }
  return Number(await page.$eval('#speedNum', el => el.textContent));
})();
assert(accelerated > 25, 'el kart acelera y el velocimetro marca (' + accelerated + ' km/h)');

await page.evaluate(() => {
  window.__h0 = window.__tk.race.myKart.heading;
  window.__dh = () => {
    let d = window.__tk.race.myKart.heading - window.__h0;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  };
});
await page.keyboard.down('KeyD');
await sleep(800);
const dhRight = await page.evaluate(() => window.__dh());
await page.keyboard.up('KeyD');
assert(dhRight < -0.02, 'tecla D gira a la derecha (delta ' + dhRight.toFixed(3) + ' rad)');
await page.keyboard.down('KeyA');
await sleep(800);
const dhLeft = await page.evaluate(() => window.__dh());
await page.keyboard.up('KeyA');
assert(dhLeft > dhRight, 'tecla A gira a la izquierda (delta ' + dhLeft.toFixed(3) + ' rad)');

await page.keyboard.down('Space');
await page.keyboard.down('KeyA');
await sleep(1200);
await page.keyboard.up('KeyA');
await page.keyboard.up('Space');
await sleep(800);
await page.keyboard.up('KeyW');

const posText = await page.$eval('#posNum', el => el.textContent);
assert(posText !== '-', 'posicion en carrera calculada (' + posText + ')');
const lapText = await page.$eval('#lapTxt', el => el.textContent);
assert(/Vuelta|Última/.test(lapText), 'texto de vuelta visible (' + lapText + ')');
const miniPix = await page.evaluate(() => {
  const c = document.getElementById('minimap');
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++;
  return n;
});
assert(miniPix > 2000, 'minimapa dibujado (' + miniPix + ' px)');
const standingsCount = await page.$$eval('#standings .srow', els => els.length);
assert(standingsCount >= 6, 'clasificacion listada (' + standingsCount + ' filas)');

const glOk = await page.evaluate(() => {
  const c = document.getElementById('game');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  return !!gl && !gl.isContextLost();
});
assert(glOk, 'contexto WebGL activo');

const banana = await page.evaluate(() => {
  const app = window.__tk;
  app.race.onItemGranted('banana');
  const roulette = app.race.myKart.item;
  const before = app.session.hazards.length;
  app.race.myKart.itemT = 0;
  app.race.myKart.spinT = 0;
  app.race.myKart.invulnT = 0;
  app.race.tryUseItem();
  return { roulette, item: app.race.myKart.item, before, after: app.session.hazards.length };
});
assert(banana.roulette === 'banana', 'item recibido en el HUD (' + banana.roulette + ')');
assert(banana.item === null, 'item consumido al usarlo');
assert(banana.after > banana.before, 'el uso crea un proyectil en la sesion (' + banana.before + '->' + banana.after + ')');
await page.evaluate(() => {
  const app = window.__tk;
  const k = app.race.myKart;
  app.session.hazards.push({
    id: 'test-banana',
    type: 'banana',
    ownerId: 'nadie',
    targetId: null,
    x: k.x + 45,
    z: k.z + 45,
    heading: 0,
    speed: 0,
    born: app.session.time * 1000,
    bounces: 0,
    dead: false,
    s: k.s,
    u: k.u,
    projIdx: -1,
    y: k.y + 0.35
  });
});
await sleep(600);
const bananaMeshes = await page.evaluate(() => window.__tk.race.hazardMeshes.size);
assert(bananaMeshes > 0, 'el cliente dibuja los proyectiles de la sesion (' + bananaMeshes + ')');
const bolt = await page.evaluate(() => {
  const app = window.__tk;
  app.race.onItemGranted('bolt');
  app.race.myKart.itemT = 0;
  app.race.myKart.spinT = 0;
  app.race.myKart.invulnT = 0;
  const before = app.session.hazards.length;
  app.race.tryUseItem();
  return { before, after: app.session.hazards.length, item: app.race.myKart.item };
});
assert(bolt.item === null && bolt.after > bolt.before, 'rayo lanzado (' + bolt.before + '->' + bolt.after + ')');
await sleep(1500);
const hazardOk = await page.evaluate(() => {
  const app = window.__tk;
  return [...app.race.hazardMeshes.values()].every(
    h => isFinite(h.built.group.position.x) && isFinite(h.built.group.position.z) && isFinite(h.built.group.position.y)
  );
});
assert(hazardOk, 'proyectiles con posiciones validas tras 1.5s');

const errFiltered = cdpErrors.filter(e => !/favicon|AudioContext|Deprecat/i.test(e));
assert(errFiltered.length === 0, 'sin errores de consola' + (errFiltered.length ? ': ' + errFiltered.slice(0, 3).join(' | ') : ''));

await page.screenshot({ path: 'test/screenshot-race.png' });
await page.click('#btnHelp');
await sleep(300);
const helpVisible = await page.$eval('#help', el => !el.classList.contains('hidden'));
assert(helpVisible, 'ayuda se abre');
await page.click('#btnHelpClose');
await sleep(200);

await page.evaluate(() => document.getElementById('btnMenu')?.click());

await browser.close();
if (proc) proc.kill();
if (failures) {
  console.error('\n' + failures + ' fallos');
  process.exit(1);
}
console.log('\nBROWSER OK');
process.exit(0);
