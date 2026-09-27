import { makeKartState } from './physics.js';
import { clamp, wrapPI } from './constants.js';
import { findTargetAhead } from './items.js';

export function makeBot(id, charId, skill, name) {
  const k = makeKartState({ id, charId, bot: true, skill, name });
  k.botPhase = Math.random() * Math.PI * 2;
  return k;
}

export function botInput(k, world, dt) {
  const track = world.track;
  if (k.botUnstuckT > 0) {
    k.botUnstuckT -= dt;
    return { steer: -(k.lastSteer || 1), throttle: 0, brake: 1, drift: false };
  }
  const look = 10 + Math.abs(k.speed) * 0.6 * (0.7 + k.skill * 0.4);
  const sT = k.s + look;
  const kappa = track.kappaAt(sT);
  const hw = track.hwAt(sT);
  const offset =
    clamp(kappa * 260, -hw * 0.8, hw * 0.8) * (0.55 + k.skill * 0.5) +
    Math.sin(world.time * 0.6 + k.botPhase) * 1.4;
  const p = track.worldAt(sT, offset, 0);
  const desired = Math.atan2(p.x - k.x, p.z - k.z);
  const diff = wrapPI(desired - k.heading);
  let steer = clamp(-diff * (1.7 + k.skill * 0.8), -1, 1);
  let throttle = 1;
  let brake = 0;
  if (Math.abs(diff) > 1.7 && Math.abs(k.speed) > 16) {
    throttle = 0.3;
    brake = 0.7;
  } else if (Math.abs(diff) > 0.9) {
    throttle = 0.75;
  }
  if (k.speed < -1) {
    throttle = 0;
    brake = 0;
    steer = -steer;
  }
  const drift = Math.abs(kappa) > 0.0068 && Math.abs(k.speed) > 16 && Math.abs(diff) < 0.5;
  if (Math.abs(k.speed) < 1.2) k.botStuck += dt;
  else k.botStuck = Math.max(0, k.botStuck - dt * 0.5);
  if (k.botStuck > 2.2) {
    k.botUnstuckT = 1.1;
    k.botStuck = 0;
  }
  k.lastSteer = steer;
  return { steer, throttle, brake, drift };
}

export function botItemChoice(k, world, now) {
  if (!k.item || k.itemT > 0) return null;
  if (!k.botItemAt) k.botItemAt = now;
  const waited = now - k.botItemAt;
  const item = k.item;
  if (item === 'shield') return waited > 0.4 ? item : null;
  if (item === 'turbo') {
    const kappa = Math.abs(world.track.kappaAt(k.s + 25));
    return kappa < 0.006 || waited > 4 ? item : null;
  }
  if (item === 'banana') return waited > 1.5 ? item : null;
  if (item === 'bolt' || item === 'seeker') {
    const t = findTargetAhead(world, k, 120);
    return t && waited > 0.8 ? item : null;
  }
  return null;
}

export function stepBots(karts, world, dt) {
  const skillNames = ['Nitro', 'Rex', 'Luna', 'Pixel', 'Vega', 'Tornado', 'Cometa'];
  for (const k of karts) {
    if (!k.bot) continue;
    const inp = botInput(k, world, dt);
    world.stepKart(k, inp, dt);
    const pick = botItemChoice(k, world, world.now);
    if (pick) {
      world.useItem(k, pick);
      k.botItemAt = 0;
    }
  }
}
