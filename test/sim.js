import { buildTrack, TRACKS } from '../shared/track.js';
import { makeBot, botInput, botItemChoice } from '../shared/bots.js';
import { resetKart, resolveKartCollisions, stepKart, makeKartState } from '../shared/physics.js';
import { newProgress, updateProgress } from '../shared/race.js';
import { rollItem, TICK } from '../shared/constants.js';
import { useItem } from '../shared/items.js';
import { stepHazards, makeHazard } from '../shared/hazards.js';
import { LocalSession } from '../public/js/local.js';

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

function steerTest() {
  const track = buildTrack('sunset');
  const mk = id => {
    const k = makeKartState({ id, charId: 'turbo' });
    resetKart(k, track, 120, 0);
    return k;
  };
  const world = { track, events: [], stepKart: null, useItem: null };
  world.stepKart = (k, inp, d) => stepKart(k, inp, world, d);

  const right = mk('right');
  const lx = Math.cos(right.heading);
  const lz = -Math.sin(right.heading);
  const x0 = right.x;
  const z0 = right.z;
  for (let i = 0; i < 40; i++) world.stepKart(right, { steer: 1, throttle: 1, brake: 0, drift: false }, 1 / 30);
  const latR = (right.x - x0) * lx + (right.z - z0) * lz;
  assert(latR < -1, 'tecla derecha gira a la derecha (lateral ' + latR.toFixed(2) + 'm)');

  const left = mk('left');
  const lx2 = Math.cos(left.heading);
  const lz2 = -Math.sin(left.heading);
  const x1 = left.x;
  const z1 = left.z;
  for (let i = 0; i < 40; i++) world.stepKart(left, { steer: -1, throttle: 1, brake: 0, drift: false }, 1 / 30);
  const latL = (left.x - x1) * lx2 + (left.z - z1) * lz2;
  assert(latL > 1, 'tecla izquierda gira a la izquierda (lateral ' + latL.toFixed(2) + 'm)');

  const dr = mk('drift');
  const lx3 = Math.cos(dr.heading);
  const lz3 = -Math.sin(dr.heading);
  const x2 = dr.x;
  const z2 = dr.z;
  for (let i = 0; i < 40; i++) world.stepKart(dr, { steer: 1, throttle: 1, brake: 0, drift: true }, 1 / 30);
  const latD = (dr.x - x2) * lx3 + (dr.z - z2) * lz3;
  assert(latD < -1 && dr.driftDir === 1, 'derrape hacia la derecha mantiene la direccion (lateral ' + latD.toFixed(2) + 'm, dir ' + dr.driftDir + ')');
}
steerTest();

function hazardTest() {
  const track = buildTrack('sunset');
  const shooter = makeKartState({ id: 'me', charId: 'turbo' });
  resetKart(shooter, track, 100, 0);
  const target = makeKartState({ id: 'botX', charId: 'bolt' });
  resetKart(target, track, 115, 0);

  const world = { track, karts: [shooter, target], events: [], now: 0, time: 0 };
  const out = useItem(world, shooter, 'bolt');
  const list = [out.hazard];
  let hit = null;
  for (let i = 0; i < 120 && !hit; i++) {
    world.now += 1000 / 30;
    const evs = stepHazards(list, world, 1 / 30);
    for (const e of evs) if (e.kind === 'hit') hit = e;
  }
  assert(!!hit && hit.victim === 'botX', 'el rayo viaja y golpea al kart de adelante');
  assert(list.length === 0, 'el rayo se consume al impactar');
  assert(target.spinT > 0, 'la victima queda girando por el impacto');

  const world2 = { track, karts: [], events: [], now: 0, time: 0 };
  const banana = makeHazard('banana', 'me', shooter.x, shooter.z, 0, 0, track);
  const list2 = [banana];
  for (let i = 0; i < 150; i++) {
    world2.now += 1000 / 30;
    stepHazards(list2, world2, 1 / 30);
  }
  assert(list2.length === 1, 'el platano permanece en pista 5 segundos');

  const world3 = { track, karts: [shooter], events: [], now: 0, time: 0 };
  const seeker = useItem(world3, (() => {
    const s2 = makeKartState({ id: 'me2', charId: 'turbo' });
    resetKart(s2, track, 100, 0);
    return s2;
  })(), 'seeker');
  assert(!!seeker.hazard && seeker.hazard.speed > 0, 'el misil nace con velocidad');
  const sawMotion = (() => {
    const list3 = [seeker.hazard];
    const x0 = seeker.hazard.x;
    for (let i = 0; i < 30; i++) {
      world3.now += 1000 / 30;
      stepHazards(list3, world3, 1 / 30);
    }
    return Math.hypot(seeker.hazard.x - x0, seeker.hazard.z - 0) > 5 || list3.length === 0;
  })();
  assert(sawMotion, 'el misil avanza tras 1 segundo');
}
hazardTest();

async function localRaceTest() {
  const session = new LocalSession(null);
  session.start({ name: 'Test', charId: 'turbo', trackId: 'forest', laps: 1, bots: 3 });
  let ended = null;
  let eventCount = 0;
  let guard = 0;
  const dt = TICK;
  while (session.state === 'racing' && guard++ < 30 * 260) {
    const world = { track: session.track, time: session.time };
    const inp = session.myProg.finished
      ? { steer: 0, throttle: 0, brake: 0, drift: false }
      : botInput(session.myKart, world, dt);
    const evs = session.tick(dt, inp, false);
    eventCount += evs.length;
    for (const e of evs) if (e.kind === 'raceEnd') ended = e.list;
  }
  assert(!!ended, 'carrera local termina y emite resultados');
  if (ended) {
    assert(ended.length === 4, 'resultados con 4 participantes (' + ended.length + ')');
    assert(ended[0].place === 1 && ended[3].place === 4, 'puestos ordenados 1..4');
    assert(ended.filter(r => r.finished).length >= 3, 'al menos 3 terminan (' + ended.filter(r => r.finished).length + ')');
    const me = ended.find(r => r.id === 'me');
    assert(me && me.time > 0 && me.place >= 1, 'mi tiempo y puesto registrados (' + (me ? me.place : '?') + ')');
  }
  assert(eventCount > 10, 'eventos de carrera emitidos (' + eventCount + ')');
}
await localRaceTest();

if (failures) {
  console.error('\n' + failures + ' fallos');
  process.exit(1);
} else {
  console.log('\nSIM OK');
}
