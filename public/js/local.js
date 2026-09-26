import { buildTrack } from '/shared/track.js';
import { makeKartState, resetKart, stepKart, resolveKartCollisions } from '/shared/physics.js';
import { newProgress, updateProgress } from '/shared/race.js';
import { rollItem, CHARACTERS, MAX_KARTS, ITEM_BOX_RESPAWN, clamp } from '/shared/constants.js';
import { useItem } from '/shared/items.js';
import { stepHazards } from '/shared/hazards.js';
import { makeBot, botInput, botItemChoice } from '/shared/bots.js';

const BOT_NAMES = ['Nitro', 'Rex', 'Luna', 'Pixel', 'Vega', 'Tornado', 'Cometa'];

export class LocalSession {
  constructor(handlers) {
    this.mode = 'local';
    this.h = handlers || {};
    this.state = 'racing';
    this.offset = 0;
    this.latency = 0;
    this.time = 0;
    this.bots = [];
    this.hazards = [];
    this.myKart = null;
  }

  serverNow() {
    return Date.now();
  }

  others() {
    return this.bots;
  }

  start({ name, charId, trackId, laps, bots, demo }) {
    this.track = buildTrack(trackId);
    this.laps = laps;
    this.state = 'racing';
    this.time = 0;
    this.boxes = this.track.boxes.map(b => ({ id: b.id, availAt: 0 }));
    this.hazards = [];
    this.bots = [];
    this.firstFinish = 0;
    this.resultsSent = false;
    const usedChars = new Set();
    let slot = 0;
    this.myKart = null;
    this.myProg = newProgress();
    if (!demo) {
      this.myKart = makeKartState({ id: 'me', charId, name });
      const g = this.track.gridSlot(0);
      resetKart(this.myKart, this.track, g.s, g.u);
      usedChars.add(charId);
      slot = 1;
    }
    const nBots = Math.min(bots, MAX_KARTS - slot);
    for (let i = 0; i < nBots; i++) {
      const avail = CHARACTERS.filter(c => !usedChars.has(c.id));
      const cid = avail.length ? avail[Math.floor(Math.random() * avail.length)].id : CHARACTERS[i % CHARACTERS.length].id;
      usedChars.add(cid);
      const b = makeBot('bot' + (i + 1), cid, clamp(0.72 + i * 0.045, 0.7, 0.99), BOT_NAMES[i % BOT_NAMES.length]);
      const g = this.track.gridSlot(slot + i);
      resetKart(b, this.track, g.s, g.u);
      b.prog = newProgress();
      b.boxCd = 0;
      this.bots.push(b);
    }
  }

  getBoxAvailArray() {
    if (!this.track) return null;
    const now = this.time * 1000;
    return this.track.boxes.map(b => {
      const st = this.boxes.find(x => x.id === b.id);
      return !st || st.availAt <= now;
    });
  }

  boxAvail(id) {
    const st = this.boxes.find(x => x.id === id);
    return !st || st.availAt <= this.time * 1000;
  }

  tick(dt, input, locked) {
    if (this.state !== 'racing') return [];
    const events = [];
    this.time += dt;
    const nowMs = this.time * 1000;
    const world = { track: this.track, karts: [], events, now: nowMs, time: this.time, stepKart: null, useItem: null };
    world.stepKart = (k, inp, d) => stepKart(k, inp, world, d);
    world.useItem = (k, item) => useItem(world, k, item);
    const idle = { steer: input ? input.steer : 0, throttle: 0, brake: 0, drift: false };
    if (this.myKart) world.stepKart(this.myKart, locked ? idle : input, dt);
    world.karts = [this.myKart, ...this.bots].filter(Boolean);
    for (const bot of this.bots) {
      if (bot.prog.finished) continue;
      const inp = locked ? idle : botInput(bot, world, dt);
      world.stepKart(bot, inp, dt);
      if (locked) continue;
      bot.boxCd = Math.max(0, bot.boxCd - dt);
      if (!bot.item && bot.boxCd <= 0) {
        for (const box of this.track.boxes) {
          const st = this.boxes.find(x => x.id === box.id);
          if (!st || st.availAt > nowMs) continue;
          const dx = bot.x - box.x;
          const dz = bot.z - box.z;
          if (dx * dx + dz * dz < 3.4 * 3.4) {
            const rank = this.standings().findIndex(r => r.id === bot.id) + 1;
            bot.item = rollItem(rank || 1, this.bots.length + (this.myKart ? 1 : 0));
            bot.itemT = 1.2;
            bot.botItemAt = 0;
            st.availAt = nowMs + ITEM_BOX_RESPAWN * 1000;
            bot.boxCd = 1.5;
            events.push({ kind: 'botPickup', id: bot.id, x: bot.x, z: bot.z });
            break;
          }
        }
      }
      const pick = botItemChoice(bot, world, nowMs);
      if (pick) {
        const out = world.useItem(bot, pick);
        if (out && out.hazard) this.hazards.push(out.hazard);
        bot.botItemAt = 0;
      }
      const evs = updateProgress(bot.prog, bot.s, this.track, this.laps, this.time, 0, dt);
      if (evs) {
        for (const e of evs) if (e.kind === 'finish') events.push({ kind: 'botFinish', id: bot.id, time: e.time });
      }
    }
    resolveKartCollisions(this.bots);
    if (this.myKart && !locked && !this.myKart.item && !this.myKart.finished && this.myKart.itemT <= 0) {
      for (const box of this.track.boxes) {
        const st = this.boxes.find(x => x.id === box.id);
        if (!st || st.availAt > nowMs) continue;
        const dx = this.myKart.x - box.x;
        const dz = this.myKart.z - box.z;
        if (dx * dx + dz * dz < 3.4 * 3.4) {
          const rank = this.standings().findIndex(r => r.id === 'me') + 1;
          const total = this.bots.length + 1;
          const item = rollItem(rank || 1, total);
          this.myKart.item = item;
          this.myKart.itemT = 1.2;
          st.availAt = nowMs + ITEM_BOX_RESPAWN * 1000;
          events.push({ kind: 'item', id: 'me', item });
          events.push({ kind: 'pickup', id: 'me', x: this.myKart.x, z: this.myKart.z, boxId: box.id });
          break;
        }
      }
    }
    if (!locked) {
      stepHazards(this.hazards, world, dt);
    }
    if (this.myKart) {
      const evs = updateProgress(this.myProg, this.myKart.s, this.track, this.laps, this.time, 0, dt);
      if (evs) {
        for (const e of evs) {
          if (e.kind === 'lap') events.push({ kind: 'myLap', lap: e.lap });
          if (e.kind === 'finish') events.push({ kind: 'myFinish', time: e.time });
        }
      }
    }
    if (!this.resultsSent && !locked) {
      const all = [this.myKart, ...this.bots].filter(Boolean);
      const fin = all.filter(k => this.isFinished(k)).length;
      if (fin > 0 && !this.firstFinish) this.firstFinish = this.time;
      if (fin === all.length || (this.firstFinish && this.time - this.firstFinish > 45)) {
        this.resultsSent = true;
        this.state = 'results';
        events.push({ kind: 'raceEnd', list: this.results() });
      }
    }
    return events;
  }

  isFinished(k) {
    return k === this.myKart ? this.myProg.finished : k.prog.finished;
  }

  progressOf(k) {
    return k === this.myKart ? this.myProg.progress : k.prog.progress;
  }

  standings() {
    const arr = [];
    if (this.myKart) arr.push({ id: 'me', progress: this.myProg.progress });
    for (const b of this.bots) arr.push({ id: b.id, progress: b.prog.progress });
    arr.sort((a, b) => b.progress - a.progress);
    return arr;
  }

  results() {
    const rows = [];
    if (this.myKart) {
      rows.push({
        id: 'me',
        name: this.myKart.name,
        charId: this.myKart.charId,
        bot: false,
        finished: this.myProg.finished,
        time: this.myProg.finishTime,
        progress: this.myProg.progress
      });
    }
    for (const b of this.bots) {
      rows.push({
        id: b.id,
        name: b.name,
        charId: b.charId,
        bot: true,
        finished: b.prog.finished,
        time: b.prog.finishTime,
        progress: b.prog.progress
      });
    }
    rows.sort((a, b) => {
      if (a.finished && b.finished) return a.time - b.time;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.progress - a.progress;
    });
    rows.forEach((r, i) => (r.place = i + 1));
    return rows;
  }

  useOwnItem(item) {
    const events = [];
    if (!this.myKart || !this.myKart.item || this.myKart.itemT > 0) return events;
    const world = { track: this.track, karts: [this.myKart, ...this.bots], events, now: this.time * 1000, time: this.time };
    const out = useItem(world, this.myKart, item);
    if (out.hazard) this.hazards.push(out.hazard);
    return events;
  }

  sendState() {}
  sendHorn() {}
  sendChat() {}
  requestBox() {}
  sendReady() {}
  sendSettings() {}
  sendStart() {}
  sendAgain() {}
  sendLobby() {}
  close() {}
}
