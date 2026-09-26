import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const PORT = Number(process.env.TK_BROWSER_PORT || 4901);
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

const proc = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe']
});
proc.stderr.on('data', d => console.error('[server] ' + d.toString().trim()));

async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://localhost:' + PORT + '/health');
      if (r.ok) return true;
    } catch {}
    await sleep(150);
  }
  return false;
}

const up = await waitServer();
assert(up, 'servidor arriba para el navegador');
if (!up) {
  proc.kill();
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

await page.goto('http://localhost:' + PORT + '/', { waitUntil: 'networkidle2', timeout: 30000 });
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
await sleep(5200);
const hudVisible = await page.$eval('#hud', el => !el.classList.contains('hidden'));
assert(hudVisible, 'HUD visible tras iniciar carrera solo');
const touchHidden = await page.$eval('#touch', el => el.classList.contains('hidden'));
assert(touchHidden, 'controles tactiles ocultos en desktop');

await page.keyboard.down('KeyW');
await sleep(3500);
await page.keyboard.down('Space');
await page.keyboard.down('KeyA');
await sleep(1500);
await page.keyboard.up('KeyA');
await page.keyboard.up('Space');
await sleep(1500);
await page.keyboard.up('KeyW');
const speedText = await page.$eval('#speedNum', el => el.textContent);
assert(Number(speedText) > 20, 'el kart acelera y el velocimetro marca (' + speedText + ' km/h)');

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
proc.kill();
if (failures) {
  console.error('\n' + failures + ' fallos');
  process.exit(1);
}
console.log('\nBROWSER OK');
process.exit(0);
