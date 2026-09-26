import { buildTrack, TRACKS } from '../shared/track.js';
import { makeBot, botInput, botItemChoice } from '../shared/bots.js';
import { resetKart, resolveKartCollisions, stepKart } from '../shared/physics.js';
import { newProgress, updateProgress } from '../shared/race.js';
import { rollItem, TICK } from '../shared/constants.js';
import { useItem } from '../shared/items.js';
import { stepHazards } from '../shared/hazards.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    failures++;
    console.error('FALLO: ' + msg);
  } else {
    console.log('ok  ' + msg);
  }
}

for (const def of TRACKS) {
  const track = buildTrack(def.id);
  assert(track.length > 550 && track.length < 1100, def.id + ' longitud ' + track.length.toFixed(0) + 'm');
  let mono = true;
  for (let i = 1; i < track.cpS.length; i++) if (track.cpS[i] <= track.cpS[i - 1]) mono = false;
  assert(mono, def.id + ' checkpoints ordenados');
  assert(track.boxes.length >= 20, def.id + ' cajas de items: ' + track.boxes.length);
  assert(track.pads.length >= 6, def.id + ' pads de turbo: ' + track.pads.length);
  assert(track.deco.length > 80, def.id + ' decoraciones: ' + track.deco.length);

  let worstS = 0;
  let worstU = 0;
  for (let s = 0; s < track.length; s += 13) {
    for (const u of [-6, -2, 0, 3.5, 6.5]) {
      const p = track.worldAt(s, u, 0);
      const pr = track.project(p.x, p.z, -1);
      let ds = Math.abs(pr.s - s);
      ds = Math.min(ds, track.length - ds);
      if (ds > worstS) worstS = ds;
      const du = Math.abs(pr.u - u);
      if (du > worstU) worstU = du;
    }
  }
  assert(worstS < 2.5, def.id + ' proyeccion s ok (err ' + worstS.toFixed(2) + 'm)');
  assert(worstU < 0.6, def.id + ' proyeccion u ok (err ' + worstU.toFixed(2) + 'm)');
}

async function raceSim(trackId, laps) {
  const track = buildTrack(trackId);
  const bots = [];
  for (let i = 0; i < 6; i++) {
    const bot = makeBot('b' + i, TRACKS[i % TRACKS.length].id === trackId ? 'turbo' : 'bolt', 0.75 + i * 0.04, 'Bot' + i);
    resetKart(bot, track, track.gridSlot(i).s, track.gridSlot(i).u);
    bot.prog = newProgress();
    bot.boxCd = 0;
    bots.push(bot);
  }
  const dt = TICK;
  const boxes = track.boxes.map(b => ({ id: b.id, availAt: 0 }));
  const hazards = [];
  let now = 0;
  let finished = 0;
  let maxSpeed = 0;
  let steps = 0;
  const maxSteps = Math.round(180 / dt);
  while (now < 180 && finished < bots.length && steps < maxSteps) {
    now += dt;
    steps++;
    const events = [];
    const world = {
      track,
      karts: bots,
      events,
      now,
      time: now,
      stepKart: null,
      useItem: null
    };
    world.stepKart = (k, inp, d) => stepKart(k, inp, world, d);
    world.useItem = (k, item) => useItem(world, k, item);
    for (const bot of bots) {
      if (bot.prog.finished) continue;
      const inp = botInput(bot, world, dt);
      world.stepKart(bot, inp, dt);
      bot.boxCd = Math.max(0, bot.boxCd - dt);
      if (!bot.item && bot.boxCd <= 0) {
        for (const box of track.boxes) {
          const st = boxes.find(b => b.id === box.id);
          if (!st || st.availAt > now) continue;
          const dx = bot.x - box.x;
          const dz = bot.z - box.z;
          if (dx * dx + dz * dz < 3.2 * 3.2) {
            bot.item = rollItem(1, bots.length);
            bot.itemT = 1.2;
            bot.botItemAt = 0;
            st.availAt = now + 4000;
            bot.boxCd = 1.5;
            break;
          }
        }
      }
      const pick = botItemChoice(bot, world, now);
      if (pick) {
        const out = world.useItem(bot, pick);
        if (out && out.hazard) hazards.push(out.hazard);
        bot.botItemAt = 0;
      }
      maxSpeed = Math.max(maxSpeed, Math.abs(bot.speed));
      if (!isFinite(bot.x) || !isFinite(bot.z) || !isFinite(bot.heading)) {
        throw new Error('estado no finito en ' + bot.id);
      }
      updateProgress(bot.prog, bot.s, track, laps, now, 0, dt);
      if (bot.prog.finished) finished++;
    }
    resolveKartCollisions(bots);
    stepHazards(hazards, world, dt);
  }
  return { finished, secs: now, maxSpeed, steps };
}

for (const trackId of ['sunset', 'forest', 'volcano']) {
  const r = await raceSim(trackId, 1);
  assert(r.finished >= 5, trackId + ': terminaron ' + r.finished + '/6 bots en ' + r.secs.toFixed(1) + 's');
  assert(r.maxSpeed > 20, trackId + ': velocidad maxima ' + r.maxSpeed.toFixed(1) + ' m/s');
}

if (failures) {
  console.error('\n' + failures + ' fallos');
  process.exit(1);
} else {
  console.log('\nSIM OK');
}
