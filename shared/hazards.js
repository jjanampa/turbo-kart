import { HAZARD_LIFETIME_MS, PHYS, clamp, wrapPI } from './constants.js';
import { applySpin } from './physics.js';

export function makeHazard(type, ownerId, x, z, heading, now, track, targetId = null) {
  const pr = track.project(x, z, -1);
  return {
    id: type[0] + Math.floor(Math.random() * 1e9).toString(36),
    type,
    ownerId,
    targetId,
    x,
    z,
    heading,
    speed: type === 'seeker' ? 40 : type === 'bolt' ? 46 : 0,
    born: now,
    bounces: 0,
    dead: false,
    s: pr.s,
    u: pr.u,
    projIdx: pr.i,
    y: pr.y + (type === 'banana' ? 0.35 : 0.8)
  };
}

export function stepHazards(hazards, world, dt) {
  const track = world.track;
  const events = world.events || (world.events = []);
  for (const h of hazards) {
    if (h.dead) continue;
    if (world.now - h.born > HAZARD_LIFETIME_MS) {
      h.dead = true;
      continue;
    }
    if (h.speed > 0) {
      if (h.type === 'seeker') {
        const target = world.karts.find(k => k.id === h.targetId);
        if (target) {
          const desired = Math.atan2(target.x - h.x, target.z - h.z);
          const diff = wrapPI(desired - h.heading);
          h.heading += clamp(diff, -3.4 * dt, 3.4 * dt);
        }
      }
      h.x += Math.sin(h.heading) * h.speed * dt;
      h.z += Math.cos(h.heading) * h.speed * dt;
      const pr = track.project(h.x, h.z, h.projIdx);
      h.projIdx = pr.i;
      h.s = pr.s;
      h.u = pr.u;
      h.y = pr.y + 0.8;
      const wallB = pr.hw + PHYS.shoulderW + 0.6;
      if (Math.abs(pr.u) > wallB) {
        const sgn = Math.sign(pr.u);
        h.x = pr.cx + pr.lx * wallB * sgn;
        h.z = pr.cz + pr.lz * wallB * sgn;
        const nx = pr.lx * sgn;
        const nz = pr.lz * sgn;
        const vx = Math.sin(h.heading);
        const vz = Math.cos(h.heading);
        const dot = vx * nx + vz * nz;
        h.heading = Math.atan2(vx - 2 * dot * nx, vz - 2 * dot * nz);
        h.bounces++;
        events.push({ kind: 'bounce', x: h.x, z: h.z });
        if (h.bounces > 3) h.dead = true;
      }
    }
    for (const k of world.karts) {
      if (k.finished) continue;
      if (k.id === h.ownerId && world.now - h.born < 0.45) continue;
      if (h.type === 'seeker' && h.targetId && k.id !== h.targetId && world.now - h.born < 0.3) continue;
      const dx = k.x - h.x;
      const dz = k.z - h.z;
      const rr = k.id === h.targetId ? 2.4 : 2.0;
      if (dx * dx + dz * dz < rr * rr) {
        const res = applySpin(k, h.type === 'seeker' ? 2.0 : 1.6);
        events.push({
          kind: res === 'block' ? 'block' : 'hit',
          victim: k.id,
          hazard: h.type,
          owner: h.ownerId,
          x: k.x,
          z: k.z
        });
        h.dead = true;
        break;
      }
    }
  }
  for (let i = hazards.length - 1; i >= 0; i--) if (hazards[i].dead) hazards.splice(i, 1);
  return events;
}
