import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
const PORT = 4906;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const proc = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
for (let i = 0; i < 40; i++) { try { const r = await fetch('http://localhost:' + PORT + '/health'); if (r.ok) break; } catch {} await sleep(150); }
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', e => console.log('[pageerror] ' + (e.stack || e.message)));
await page.setViewport({ width: 1280, height: 800 });
await page.goto('http://localhost:' + PORT + '/', { waitUntil: 'networkidle2' });
await sleep(3500);
await page.screenshot({ path: 'test/tour-menu.png' });
for (const trackId of ['sunset', 'forest', 'volcano']) {
  await page.evaluate(id => {
    window.__tk.startLocal({ trackId: id, laps: 3, bots: 5, name: 'Tú', charId: 'turbo' });
  }, trackId);
  await sleep(4200);
  await page.keyboard.down('KeyW');
  await sleep(5000);
  await page.keyboard.up('KeyW');
  await sleep(600);
  await page.screenshot({ path: 'test/tour-' + trackId + '.png' });
}
await browser.close(); proc.kill(); process.exit(0);
