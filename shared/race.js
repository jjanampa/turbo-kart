import { CP_COUNT } from './constants.js';

const ORDER = [];
for (let i = 1; i < CP_COUNT; i++) ORDER.push(i);
ORDER.push(0);

export function newProgress() {
  return { count: 0, lap: 0, sPrev: -1, finished: false, finishTime: 0, negT: 0, progress: 0, wrongWay: false };
}

export function updateProgress(prog, s, track, totalLaps, now, startTime, dt) {
  const L = track.length;
  if (prog.sPrev < 0) {
    prog.sPrev = s;
    prog.progress = prog.lap * L + s;
    return null;
  }
  const sPrev = prog.sPrev;
  let events = null;
  let guard = 0;
  while (guard++ < CP_COUNT) {
    const nextCp = ORDER[prog.count % CP_COUNT];
    let crossed = false;
    if (nextCp === 0) crossed = sPrev > L * 0.7 && s < L * 0.3;
    else crossed = s > sPrev && sPrev < track.cpS[nextCp] && s >= track.cpS[nextCp];
    if (!crossed) break;
    prog.count++;
    if (nextCp === 0) {
      prog.lap++;
      events = events || [];
      events.push({ kind: 'lap', lap: prog.lap });
      if (prog.lap >= totalLaps && !prog.finished) {
        prog.finished = true;
        prog.finishTime = now - startTime;
        events.push({ kind: 'finish', time: prog.finishTime });
      }
    }
  }
  let ds = s - sPrev;
  if (ds > L / 2) ds -= L;
  if (ds < -L / 2) ds += L;
  if (ds < -0.35) prog.negT += dt;
  else prog.negT = Math.max(0, prog.negT - dt * 2);
  prog.wrongWay = prog.negT > 0.7 && !prog.finished;
  prog.sPrev = s;
  prog.progress = prog.lap * L + s;
  return events;
}
