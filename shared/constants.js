export const TICK_RATE = 30;
export const TICK = 1 / TICK_RATE;
export const CP_COUNT = 14;
export const MAX_KARTS = 8;
export const ITEM_BOX_RESPAWN = 4;
export const HAZARD_LIFETIME_MS = 20000;
export const LAPS_OPTIONS = [1, 3, 5];
export const DEFAULT_LAPS = 3;
export const KMH = 3.6;

export const CHARACTERS = [
  { id: 'turbo', name: 'Turbo', color: 0xe23b2e, trim: 0xffd166, shape: 'round', stats: { speed: 4, accel: 3, grip: 3 } },
  { id: 'bolt', name: 'Bolt', color: 0xf2c438, trim: 0x2d2d2d, shape: 'bolt', stats: { speed: 5, accel: 2, grip: 2 } },
  { id: 'mint', name: 'Mint', color: 0x3fbf6f, trim: 0xffffff, shape: 'round', stats: { speed: 3, accel: 4, grip: 4 } },
  { id: 'aqua', name: 'Aqua', color: 0x2f9fe0, trim: 0xffffff, shape: 'drop', stats: { speed: 3, accel: 3, grip: 5 } },
  { id: 'nova', name: 'Nova', color: 0x9a5fe0, trim: 0xffe066, shape: 'star', stats: { speed: 4, accel: 4, grip: 2 } },
  { id: 'blaze', name: 'Blaze', color: 0xf07a24, trim: 0x3a2a1a, shape: 'bolt', stats: { speed: 5, accel: 3, grip: 1 } },
  { id: 'frost', name: 'Frost', color: 0xbfe8f5, trim: 0x2f6f9f, shape: 'drop', stats: { speed: 2, accel: 5, grip: 4 } },
  { id: 'shadow', name: 'Shadow', color: 0x4a4f5c, trim: 0xb0b8c8, shape: 'star', stats: { speed: 4, accel: 2, grip: 3 } }
];

export function charById(id) {
  return CHARACTERS.find(c => c.id === id) || CHARACTERS[0];
}

export const ITEM_NAMES = {
  turbo: 'Turbo',
  banana: 'Platano',
  bolt: 'Rayo',
  seeker: 'Misil',
  shield: 'Escudo'
};

export const PHYS = {
  maxSpeed: 33.5,
  accel: 14,
  brake: 27,
  coast: 2.0,
  drag: 0.004,
  reverseMax: 9,
  steerPower: 3.4,
  steerTaper: 0.045,
  gripNormal: 7.5,
  gripDrift: 1.25,
  gripOffroad: 4.4,
  driftTurn: 1.55,
  wallBounce: 0.35,
  shoulderW: 5.5,
  kartRadius: 1.35,
  spinTime: 1.7
};

const TIERS = [
  { at: 1.2, dur: 0.9, power: 0.3 },
  { at: 2.4, dur: 1.5, power: 0.38 },
  { at: 3.4, dur: 2.1, power: 0.46 }
];

export function driftTier(charge) {
  let n = 0;
  for (let i = 0; i < TIERS.length; i++) if (charge >= TIERS[i].at) n = i + 1;
  return n;
}

export function tierBoost(n) {
  return TIERS[Math.max(0, Math.min(TIERS.length, n) - 1)];
}

export function kartParams(charId) {
  const s = charById(charId).stats;
  return {
    maxSpeed: PHYS.maxSpeed + (s.speed - 3) * 1.8,
    accel: PHYS.accel + (s.accel - 3) * 1.6,
    grip: PHYS.gripNormal + (s.grip - 3) * 0.6
  };
}

export function rollItem(rank, total) {
  let w;
  const frontCut = Math.max(1, Math.round(total * 0.28));
  const midCut = Math.max(frontCut + 1, Math.round(total * 0.62));
  if (rank <= frontCut) w = { banana: 32, shield: 24, bolt: 26, turbo: 8, seeker: 10 };
  else if (rank <= midCut) w = { banana: 14, shield: 16, bolt: 24, turbo: 26, seeker: 20 };
  else w = { banana: 6, shield: 10, bolt: 18, turbo: 36, seeker: 30 };
  let sum = 0;
  for (const k in w) sum += w[k];
  let r = Math.random() * sum;
  for (const k in w) {
    r -= w[k];
    if (r <= 0) return k;
  }
  return 'turbo';
}

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function wrapPI(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function fmtTime(ms) {
  if (!isFinite(ms) || ms <= 0) return '--:--.--';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
