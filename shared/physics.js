import { PHYS, kartParams, clamp, driftTier, tierBoost } from './constants.js';

export function makeKartState(opts) {
  return {
    id: opts.id,
    name: opts.name || 'Jugador',
    charId: opts.charId || 'turbo',
    color: opts.color === undefined ? 0xffffff : opts.color,
    bot: !!opts.bot,
    skill: opts.skill === undefined ? 1 : opts.skill,
    x: 0, y: 0, z: 0, heading: 0, vx: 0, vz: 0, speed: 0, slip: 0,
    steer: 0, throttle: 0, brake: 0,
    drifting: false, driftDir: 1, driftCharge: 0, driftTier: 0, hopT: 0,
    boostT: 0, boostPower: 0, spinT: 0, spinDir: 1, invulnT: 0, shieldT: 0, squashT: 0,
    item: null, itemT: 0, padCd: 0, wallT: 0, rubber: 1,
    s: 0, u: 0, hw: 8, beta: 0, kappa: 0, projIdx: -1, onRoad: true, offroad: false,
    lap: 0, count: 0, finished: false, finishTime: 0, rank: 1, botPhase: 0, botStuck: 0, botUnstuckT: 0, botItemAt: 0,
    params: kartParams(opts.charId || 'turbo')
  };
}

export function resetKart(k, track, s, u) {
  const p = track.worldAt(s, u, 0);
  k.x = p.x;
  k.y = p.y;
  k.z = p.z;
  k.heading = track.headingAt(s);
  k.vx = 0; k.vz = 0; k.speed = 0; k.slip = 0;
  k.steer = 0; k.throttle = 0; k.brake = 0;
  k.drifting = false; k.driftCharge = 0; k.driftTier = 0; k.hopT = 0;
  k.boostT = 0; k.boostPower = 0; k.spinT = 0; k.invulnT = 0; k.shieldT = 0; k.squashT = 0;
  k.item = null; k.itemT = 0; k.padCd = 0; k.wallT = 0; k.rubber = 1;
  k.finished = false; k.finishTime = 0; k.lap = 0; k.count = 0;
  k.botStuck = 0; k.botUnstuckT = 0; k.botItemAt = 0;
  const pr = track.project(k.x, k.z, -1);
  k.projIdx = pr.i; k.s = pr.s; k.u = pr.u; k.hw = pr.hw; k.beta = pr.beta; k.y = pr.y; k.kappa = pr.kappa;
  k.offroad = Math.abs(pr.u) > pr.hw + 0.9;
  k.onRoad = !k.offroad;
}

export function applyBoost(k, dur, power) {
  if (k.boostT <= 0 || power >= k.boostPower) k.boostPower = power;
  k.boostT = Math.max(k.boostT, dur);
  k.hopT = Math.max(k.hopT, 0.12);
}

export function applySpin(k, dur, dir) {
  if (k.finished) return 'immune';
  if (k.invulnT > 0) return 'immune';
  if (k.shieldT > 0) {
    k.shieldT = 0;
    k.invulnT = 1.0;
    k.squashT = 0.3;
    return 'block';
  }
  k.spinT = dur;
  k.spinDir = dir || (Math.random() < 0.5 ? -1 : 1);
  k.invulnT = dur + 0.8;
  k.drifting = false;
  k.driftCharge = 0;
  k.driftTier = 0;
  k.squashT = 0.4;
  return 'hit';
}

export function applyShield(k, dur) {
  k.shieldT = Math.max(k.shieldT, dur);
}

export function stepKart(k, inp, world, dt) {
  const track = world.track;
  const events = world.events;
  const P = k.params;
  k.steer = clamp(inp.steer || 0, -1, 1);
  k.throttle = clamp(inp.throttle || 0, 0, 1);
  k.brake = clamp(inp.brake || 0, 0, 1);
  const wantDrift = !!inp.drift;

  k.spinT = Math.max(0, k.spinT - dt);
  k.invulnT = Math.max(0, k.invulnT - dt);
  k.shieldT = Math.max(0, k.shieldT - dt);
  k.boostT = Math.max(0, k.boostT - dt);
  k.itemT = Math.max(0, k.itemT - dt);
  k.squashT = Math.max(0, k.squashT - dt);
  k.padCd = Math.max(0, k.padCd - dt);
  k.hopT = Math.max(0, k.hopT - dt);
  k.wallT = Math.max(0, k.wallT - dt);
  if (k.boostT <= 0) k.boostPower = 0;

  if (k.spinT > 0) {
    k.drifting = false;
    k.driftCharge = 0;
    k.driftTier = 0;
  }

  if (k.spinT <= 0 && !k.finished) {
    if (wantDrift && !k.drifting && k.speed > 10) {
      k.drifting = true;
      k.driftDir = Math.abs(k.steer) > 0.15 ? Math.sign(k.steer) : Math.abs(k.slip) > 0.5 ? Math.sign(k.slip) : 1;
      k.driftCharge = 0;
      k.driftTier = 0;
      k.hopT = 0.18;
      if (events) events.push({ kind: 'hop', id: k.id, x: k.x, z: k.z });
    }
    if (k.drifting) {
      if (!wantDrift) {
        const t = driftTier(k.driftCharge);
        if (t > 0) {
          const b = tierBoost(t);
          applyBoost(k, b.dur, b.power);
          if (events) events.push({ kind: 'miniturbo', id: k.id, tier: t, x: k.x, z: k.z });
        }
        k.drifting = false;
        k.driftCharge = 0;
        k.driftTier = 0;
      } else {
        const steerIn = k.steer * k.driftDir;
        k.driftCharge += dt * (0.55 + Math.max(0, steerIn) * 1.15);
        const t = driftTier(k.driftCharge);
        if (t !== k.driftTier && events) events.push({ kind: 'driftTier', id: k.id, tier: t });
        k.driftTier = t;
      }
    }
  }

  const fx = Math.sin(k.heading);
  const fz = Math.cos(k.heading);
  const lx = fz;
  const lz = -fx;
  let vf = k.vx * fx + k.vz * fz;
  let vl = k.vx * lx + k.vz * lz;
  const boosting = k.boostT > 0;
  const maxSpeed = P.maxSpeed * (boosting ? 1 + k.boostPower : 1) * (k.offroad ? 0.55 : 1) * k.rubber;
  const accel = P.accel * (boosting ? 1.9 : 1);

  let a = 0;
  if (k.spinT <= 0 && !k.finished) {
    if (k.throttle > 0) {
      if (vf < 0) a += PHYS.brake * k.throttle;
      else a += accel * k.throttle * Math.max(0, 1 - Math.pow(vf / Math.max(4, maxSpeed), 1.6));
    }
    if (k.brake > 0) {
      if (vf > 0.4) a -= PHYS.brake * k.brake;
      else a -= accel * 0.5 * k.brake * (1 - Math.min(1, -vf / PHYS.reverseMax));
    }
  }
  const dragA = (PHYS.coast * (k.throttle > 0.05 ? 0.15 : 1) + PHYS.drag * vf * vf) * Math.sign(vf);
  a -= dragA;
  vf += a * dt;
  if (k.throttle < 0.05 && k.brake < 0.05 && Math.abs(vf) < 0.4) vf = 0;
  if (k.spinT > 0) vf *= Math.max(0, 1 - 3.0 * dt);
  vf = clamp(vf, -PHYS.reverseMax, maxSpeed);
  k.speed = vf;

  let steer = k.steer;
  if (k.drifting) {
    const steerIn = k.steer * k.driftDir;
    steer = k.driftDir * clamp(0.55 + 0.6 * steerIn, -0.45, 1);
  }
  const speedFactor = 1 / (1 + Math.abs(vf) * PHYS.steerTaper);
  let yaw;
  if (k.spinT > 0) {
    yaw = k.spinDir * 13 * clamp(k.spinT / 0.7, 0.25, 1);
  } else {
    yaw = steer * PHYS.steerPower * speedFactor * (k.drifting ? PHYS.driftTurn : 1) * (vf < -0.5 ? -1 : 1);
    if (vf * vf < 0.05) yaw = 0;
  }
  k.heading += yaw * dt;

  const grip = k.drifting ? PHYS.gripDrift : k.offroad ? PHYS.gripOffroad : P.grip;
  vl *= Math.exp(-grip * dt);
  k.slip = vl;

  k.vx = fx * vf + lx * vl;
  k.vz = fz * vf + lz * vl;
  k.x += k.vx * dt;
  k.z += k.vz * dt;

  const pr = track.project(k.x, k.z, k.projIdx);
  k.projIdx = pr.i;
  k.s = pr.s;
  k.u = pr.u;
  k.hw = pr.hw;
  k.beta = pr.beta;
  k.kappa = pr.kappa;
  k.y = pr.y;
  k.offroad = Math.abs(pr.u) > pr.hw + 0.9;
  k.onRoad = !k.offroad;

  const wallB = pr.hw + PHYS.shoulderW;
  if (Math.abs(pr.u) > wallB) {
    const sgn = Math.sign(pr.u);
    k.x = pr.cx + pr.lx * wallB * sgn;
    k.z = pr.cz + pr.lz * wallB * sgn;
    const nlx = pr.lx * sgn;
    const nlz = pr.lz * sgn;
    const vn = k.vx * nlx + k.vz * nlz;
    if (vn > 0) {
      k.vx -= nlx * vn * (1 + PHYS.wallBounce);
      k.vz -= nlz * vn * (1 + PHYS.wallBounce);
      k.vx *= 0.86;
      k.vz *= 0.86;
      k.wallT = 0.25;
      k.squashT = 0.25;
      if (events && vn > 3) events.push({ kind: 'wall', id: k.id, x: k.x, z: k.z, v: vn });
    }
    const pr2 = track.project(k.x, k.z, pr.i);
    k.projIdx = pr2.i;
    k.u = pr2.u;
    k.s = pr2.s;
    k.y = pr2.y;
  }

  if (k.padCd <= 0 && !k.finished) {
    for (const pad of track.pads) {
      let ds = Math.abs(pad.s - k.s);
      ds = Math.min(ds, track.length - ds);
      if (ds < 2.3 && Math.abs(pad.u - k.u) < 2.4) {
        applyBoost(k, 1.05, 0.32);
        k.padCd = 1.2;
        if (events) events.push({ kind: 'pad', id: k.id, x: k.x, z: k.z });
        break;
      }
    }
  }

  if (k.offroad && Math.abs(vf) > 8 && events && Math.random() < dt * 14) {
    events.push({ kind: 'dust', id: k.id, x: k.x, z: k.z });
  }
  return k;
}

export function resolveKartCollisions(karts) {
  const r = PHYS.kartRadius * 1.15;
  const d2max = (2 * r) * (2 * r);
  for (let i = 0; i < karts.length; i++) {
    const a = karts[i];
    for (let j = i + 1; j < karts.length; j++) {
      const b = karts[j];
      if (a.finished || b.finished) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > d2max || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const nz = dz / d;
      const push = (2 * r - d) / 2;
      a.x -= nx * push;
      a.z -= nz * push;
      b.x += nx * push;
      b.z += nz * push;
      const rvx = b.vx - a.vx;
      const rvz = b.vz - a.vz;
      const vn = rvx * nx + rvz * nz;
      if (vn < 0) {
        const imp = -vn * 0.55;
        a.vx -= nx * imp;
        a.vz -= nz * imp;
        b.vx += nx * imp;
        b.vz += nz * imp;
      }
    }
  }
}
