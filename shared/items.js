import { applyBoost, applyShield } from './physics.js';
import { makeHazard } from './hazards.js';
import { wrapPI } from './constants.js';

export function findTargetAhead(world, kart, maxDist = 130) {
  let best = null;
  let bd = Infinity;
  for (const other of world.karts) {
    if (other.id === kart.id || other.finished) continue;
    let ds = other.s - kart.s;
    if (ds < -world.track.length / 2) ds += world.track.length;
    if (ds <= 0 || ds > maxDist) continue;
    const dx = other.x - kart.x;
    const dz = other.z - kart.z;
    const dist = Math.hypot(dx, dz);
    if (dist > maxDist) continue;
    const ang = Math.abs(wrapPI(Math.atan2(dx, dz) - kart.heading));
    if (ang > 0.6) continue;
    const score = dist + ds * 0.3;
    if (score < bd) {
      bd = score;
      best = other;
    }
  }
  return best;
}

export function useItem(world, kart, item) {
  const track = world.track;
  const now = world.now;
  const events = world.events || (world.events = []);
  const out = { used: item, hazard: null, target: null };
  const fx = Math.sin(kart.heading);
  const fz = Math.cos(kart.heading);
  if (item === 'turbo') {
    applyBoost(kart, 1.5, 0.36);
    events.push({ kind: 'useTurbo', id: kart.id, x: kart.x, z: kart.z });
  } else if (item === 'shield') {
    applyShield(kart, 9);
    events.push({ kind: 'useShield', id: kart.id, x: kart.x, z: kart.z });
  } else if (item === 'banana') {
    const p = track.worldAt(kart.s - 4.5, kart.u, 0);
    out.hazard = makeHazard('banana', kart.id, p.x, p.z, kart.heading, now, track);
    events.push({ kind: 'drop', id: kart.id, x: p.x, z: p.z });
  } else if (item === 'bolt') {
    const px = kart.x + fx * 2.6;
    const pz = kart.z + fz * 2.6;
    out.hazard = makeHazard('bolt', kart.id, px, pz, kart.heading, now, track);
    events.push({ kind: 'shoot', id: kart.id, item, x: px, z: pz });
  } else if (item === 'seeker') {
    const target = findTargetAhead(world, kart);
    out.target = target ? target.id : null;
    const px = kart.x + fx * 2.6;
    const pz = kart.z + fz * 2.6;
    out.hazard = makeHazard('seeker', kart.id, px, pz, kart.heading, now, track, target ? target.id : null);
    events.push({ kind: 'shoot', id: kart.id, item, x: px, z: pz });
  }
  kart.item = null;
  kart.itemT = 0;
  return out;
}
