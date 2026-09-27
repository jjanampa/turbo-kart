import * as THREE from 'three';
import { makeKartState, resetKart, stepKart } from '/shared/physics.js';
import { newProgress, updateProgress } from '/shared/race.js';
import { charById, clamp } from '/shared/constants.js';
import { buildKart, animateKart } from './kart.js';
import { buildHazardMesh, disposeObject } from './render.js';

const V3 = () => new THREE.Vector3();

export class Race {
  constructor(app, session, opts = {}) {
    this.app = app;
    this.session = session;
    this.opts = opts;
    this.demo = !!opts.demo;
    this.track = session.track;
    this.laps = session.laps;
    this.myId = session.mode === 'local' ? 'me' : session.id;
    this.state = 'countdown';
    this.startAt = session.mode === 'net' ? session.startAt : Date.now() + 3800;
    this.startedAt = this.startAt;
    this.progress = newProgress();
    this.lastLap = 0;
    this.finishedShown = false;
    this.lastCount = -1;
    this.meshes = new Map();
    this.hazardMeshes = new Map();
    this.camPos = V3();
    this.camLook = V3();
    this.camInit = false;
    this.camFov = 62;
    this.shake = 0;
    this.standTimer = 0;
    this.boxReqCd = 0;
    this.itemSoundCd = 0;
    this.dustCd = 0;
    this.boostFxCd = 0;
    this.demoTime = 0;
    this.myKart = session.myKart;
    if (!this.myKart && session.mode === 'net') {
      const info = session.kartInfos.find(k => k.id === session.id);
      const kart = makeKartState({ id: session.id, charId: info.charId, name: info.name });
      const g = this.track.gridSlot(info.slot);
      resetKart(kart, this.track, g.s, g.u);
      this.myKart = kart;
      session.myKart = kart;
    }
    if (!this.demo) {
      this.myVisual = buildKart(this.myKart.charId, { name: null });
      this.app.scene.add(this.myVisual.group);
    }
  }

  gy(x, z) {
    return this.track.project(x, z, -1).y;
  }

  updateWorldBoxes(nowMs) {
    if (!this.app.world || !this.session.getBoxAvailArray) return;
    const avail = this.session.getBoxAvailArray();
    if (avail) this.app.world.updateBoxes(avail, nowMs / 1000);
  }

  update(dt, input) {
    const session = this.session;
    const nowMs = session.serverNow ? session.serverNow() : Date.now();
    this.updateWorldBoxes(nowMs);
    if (this.state === 'countdown') {
      const remain = this.startAt - nowMs;
      const n = Math.max(0, Math.min(3, Math.ceil(remain / 1000)));
      if (n !== this.lastCount && remain > -200) {
        this.lastCount = n;
        if (!this.demo) this.app.onCountdown(n);
      }
      if (remain <= 0) {
        this.state = 'racing';
        this.startedAt = nowMs;
        if (!this.demo) this.app.onGo();
      }
      const idle = { steer: input.steer, throttle: 0, brake: 0, drift: false };
      if (session.mode === 'local') {
        const evs = session.tick(dt, idle, true);
        this.handleEvents(evs);
      } else {
        const world = { track: this.track, events: [] };
        stepKart(this.myKart, idle, world, dt);
      }
      this.animateOwn(dt, input, true);
      this.updateCamera(dt, input);
      this.updateHud(dt, nowMs);
      return;
    }
    if (this.state === 'racing' || this.state === 'finishing') {
      if (session.mode === 'local') {
        const evs = session.tick(dt, input, false);
        this.handleEvents(evs);
      } else {
        session.updateOthers(dt);
        const world = { track: this.track, events: [] };
        stepKart(this.myKart, input, world, dt);
        this.handleEvents(world.events);
        session.sendState(this.myKart, Date.now());
        this.checkBoxes(dt);
      }
      if (!this.demo && this.app.input.consumeItem()) this.tryUseItem();
      if (!this.demo && this.app.input.consumeHorn()) {
        this.app.audio.horn();
        session.sendHorn();
      }
      const raceTime = (nowMs - this.startedAt) / 1000;
      if (!this.demo) {
        const evs = updateProgress(this.progress, this.myKart.s, this.track, this.laps, raceTime, 0, dt);
        if (evs) {
          for (const e of evs) {
            if (e.kind === 'lap' && e.lap <= this.laps) {
              this.app.hud.message(e.lap === this.laps ? '¡Última vuelta!' : 'Vuelta ' + (e.lap + 1), 1.5, true);
              this.app.audio.lap();
            }
            if (e.kind === 'finish') this.onOwnFinish();
          }
        }
      }
      if (!this.demo) {
        this.collideOthers();
        this.ownEffects(dt);
      }
      this.animateOwn(dt, input, false);
      this.syncOthers(dt);
      this.syncHazards(dt);
      this.updateCamera(dt, input);
      this.updateHud(dt, nowMs);
    } else if (this.state === 'results') {
      if (session.mode === 'local') session.tick(dt, input, false);
      else session.updateOthers(dt);
      this.animateOwn(dt, input, false);
      this.syncOthers(dt);
      this.syncHazards(dt);
      this.updateDemoCamera(dt);
    }
  }

  tryUseItem() {
    const k = this.myKart;
    if (!k || !k.item || k.itemT > 0 || k.spinT > 0) return;
    const item = k.item;
    this.app.audio.itemUse(item);
    if (this.session.mode === 'local') {
      const evs = this.session.useOwnItem(item);
      this.handleEvents(evs);
      this.app.hud.setItem(null);
    } else {
      this.session.useOwnItem(item);
      k.item = null;
      k.itemT = 0;
      this.app.hud.setItem(null);
    }
  }

  onItemGranted(item) {
    if (item) {
      this.myKart.item = item;
      this.myKart.itemT = 1.2;
      this.app.hud.setItem(item, true);
      this.app.audio.itemGet();
    } else {
      this.myKart.item = null;
      this.app.hud.setItem(null);
    }
  }

  onHitMe(m) {
    this.shake = Math.min(0.5, this.shake + 0.35);
    this.app.audio.hit();
    this.app.effects.explosion(this.myKart.x, this.myKart.y, this.myKart.z);
  }

  onOwnFinish() {
    if (this.finishedShown) return;
    this.finishedShown = true;
    this.app.hud.clearMessage();
    this.app.hud.message('¡Terminaste!', 2.2);
    this.app.audio.finish();
    this.app.effects.confetti(this.myKart.x, this.myKart.y, this.myKart.z, 110);
  }

  checkBoxes(dt) {
    this.boxReqCd = Math.max(0, this.boxReqCd - dt);
    const k = this.myKart;
    if (!k || k.item || k.itemT > 0 || k.finished || this.boxReqCd > 0) return;
    for (const box of this.track.boxes) {
      if (!this.session.boxAvail(box.id)) continue;
      const dx = k.x - box.x;
      const dz = k.z - box.z;
      if (dx * dx + dz * dz < 3.4 * 3.4) {
        this.session.requestBox(box.id);
        this.boxReqCd = 0.4;
        break;
      }
    }
  }

  collideOthers() {
    const k = this.myKart;
    if (!k || k.finished) return;
    const others = this.session.others();
    const r = 2.5;
    for (const o of others) {
      const dx = k.x - o.x;
      const dz = k.z - o.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > r * r || d2 < 1e-5) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const nz = dz / d;
      const push = r - d;
      k.x += nx * push;
      k.z += nz * push;
      const vn = k.vx * nx + k.vz * nz;
      if (vn < 0) {
        k.vx -= nx * vn * 1.4;
        k.vz -= nz * vn * 1.4;
        this.shake = Math.min(0.3, this.shake + 0.08);
      }
    }
  }

  ownEffects(dt) {
    const k = this.myKart;
    if (!k) return;
    const fx = Math.sin(k.heading);
    const fz = Math.cos(k.heading);
    const rx = -fz;
    const rz = fx;
    if (k.drifting && k.driftCharge > 0.3 && Math.abs(k.speed) > 6) {
      const tier = k.driftTier;
      for (const s of [-1, 1]) {
        const x = k.x - fx * 1.1 + rx * (s * 0.85);
        const z = k.z - fz * 1.1 + rz * (s * 0.85);
        this.app.effects.driftSparks(x, k.y + 0.15, z, tier);
      }
    }
    this.dustCd -= dt;
    if (k.offroad && Math.abs(k.speed) > 7 && this.dustCd <= 0) {
      this.dustCd = 0.09;
      this.app.effects.dustPuff(k.x - fx * 1, k.y, k.z - fz * 1, 3);
    }
    this.boostFxCd -= dt;
    if (k.boostT > 0 && this.boostFxCd <= 0) {
      this.boostFxCd = 0.07;
      this.app.effects.boostBurst(k.x - fx * 1.6, k.y + 0.2, k.z - fz * 1.6, 5);
    }
    if (this.app.audio) {
      const ratio = Math.min(1, Math.abs(k.speed) / 40);
      this.app.audio.engineUpdate(ratio, k.throttle, k.drifting, k.boostT > 0);
    }
  }

  animateOwn(dt, input, locked) {
    if (this.demo || !this.myVisual) return;
    const k = this.myKart;
    animateKart(this.myVisual, k, dt, locked ? 0 : input.steer);
  }

  syncOthers(dt) {
    const seen = new Set();
    const net = this.session.mode === 'net';
    for (const o of this.session.others()) {
      seen.add(o.id);
      let entry = this.meshes.get(o.id);
      if (!entry) {
        const kv = buildKart(o.charId, { name: o.name, color: charById(o.charId).color });
        this.app.scene.add(kv.group);
        entry = { kv, hint: -1, y: o.y || 0 };
        this.meshes.set(o.id, entry);
      }
      let st = o;
      if (net) {
        const pr = this.track.project(o.x, o.z, entry.hint);
        entry.hint = pr.i;
        entry.y = pr.y;
        st = {
          x: o.x,
          y: entry.y,
          z: o.z,
          heading: o.heading,
          speed: o.speed,
          flags: o.flags,
          drifting: !!(o.flags & 1),
          boostT: o.flags & 2 ? 1 : 0,
          spinT: o.flags & 4 ? 1 : 0,
          shieldT: o.flags & 8 ? 1 : 0,
          hopT: 0,
          squashT: 0
        };
      }
      animateKart(entry.kv, st, dt, 0);
      if (entry.kv.nameSprite) {
        const d = this.app.camera.position.distanceTo(entry.kv.group.position);
        const s = clamp(d * 0.052, 3, 8.5);
        entry.kv.nameSprite.scale.set(s, s * 0.25, 1);
      }
    }
    for (const [id, entry] of this.meshes) {
      if (!seen.has(id)) {
        this.app.scene.remove(entry.kv.group);
        this.meshes.delete(id);
      }
    }
  }

  syncHazards(dt) {
    if (this.session.mode === 'net') this.syncHazardsNet(dt);
    else this.syncHazardsLocal(dt);
  }

  syncHazardsLocal(dt) {
    const seen = new Set();
    for (const h of this.session.hazards || []) {
      seen.add(h.id);
      let entry = this.hazardMeshes.get(h.id);
      if (!entry) {
        const built = buildHazardMesh(h.type);
        this.app.scene.add(built.group);
        entry = { built, hint: -1 };
        this.hazardMeshes.set(h.id, entry);
      }
      entry.built.group.position.set(h.x, h.y !== undefined ? h.y : this.gy(h.x, h.z), h.z);
      entry.built.group.rotation.y = h.heading;
      entry.built.group.rotation.x = h.type === 'banana' ? 0 : 0.12;
      this.spinHazard(entry, h, dt);
    }
    for (const [id, entry] of this.hazardMeshes) {
      if (!seen.has(id)) {
        this.app.scene.remove(entry.built.group);
        disposeObject(entry.built.group, false);
        this.hazardMeshes.delete(id);
      }
    }
  }

  syncHazardsNet(dt) {
    const seen = new Set();
    for (const h of this.session.hazards.values()) {
      seen.add(h.id);
      let entry = this.hazardMeshes.get(h.id);
      if (!entry) {
        const built = buildHazardMesh(h.type);
        this.app.scene.add(built.group);
        entry = { built, hint: -1 };
        this.hazardMeshes.set(h.id, entry);
      }
      const pr = this.track.project(h.x, h.z, entry.hint);
      entry.hint = pr.i;
      entry.built.group.position.set(h.x, pr.y + (h.type === 'banana' ? 0.35 : 0.8), h.z);
      entry.built.group.rotation.y = h.heading;
      entry.built.group.rotation.x = h.type === 'banana' ? 0 : 0.12;
      this.spinHazard(entry, h, dt);
    }
    for (const [id, entry] of this.hazardMeshes) {
      if (!seen.has(id)) {
        this.app.scene.remove(entry.built.group);
        disposeObject(entry.built.group, false);
        this.hazardMeshes.delete(id);
      }
    }
  }

  spinHazard(entry, h, dt) {
    const core = entry.built.group.children[0];
    if (!core) return;
    core.rotation.y += dt * (h.type === 'bolt' ? 9 : h.type === 'seeker' ? 4 : 1.4);
  }

  handleEvents(list) {
    const audio = this.app.audio;
    const effects = this.app.effects;
    for (const e of list || []) {
      const own = e.id === this.myId || e.victim === this.myId;
      switch (e.kind) {
        case 'wall':
          if (own) audio.wall();
          effects.sparks(e.x, this.gy(e.x, e.z) + 0.6, e.z, Math.min(14, 4 + (e.v || 3)), 0xffcc55, 3);
          break;
        case 'dust':
          effects.dustPuff(e.x, this.gy(e.x, e.z), e.z, 3);
          break;
        case 'pad':
          if (own) audio.boost();
          effects.boostBurst(e.x, this.gy(e.x, e.z) + 0.3, e.z, 8);
          break;
        case 'miniturbo':
          if (own) audio.boost();
          effects.boostBurst(e.x, this.gy(e.x, e.z) + 0.4, e.z, 14);
          break;
        case 'driftTier':
          if (own && e.tier > 0) audio.blip(500 + e.tier * 240, 0.07, 'square', 0.22);
          break;
        case 'useTurbo':
          audio.itemUse('turbo');
          effects.boostBurst(e.x, this.gy(e.x, e.z) + 0.5, e.z, 16);
          break;
        case 'useShield':
          audio.block();
          effects.sparks(e.x, this.gy(e.x, e.z) + 1.2, e.z, 14, 0x6fd4ff, 5);
          break;
        case 'shoot':
        case 'drop':
          audio.itemUse(e.kind === 'drop' ? 'banana' : e.item || 'bolt');
          effects.sparks(e.x, this.gy(e.x, e.z) + 0.8, e.z, 8, 0xfff0a0, 4);
          break;
        case 'hit':
          audio.hit();
          effects.explosion(e.x, this.gy(e.x, e.z), e.z, e.hazard === 'seeker' ? 0xff6b4d : 0xffb347);
          if (own) this.shake = Math.min(0.5, this.shake + 0.3);
          break;
        case 'block':
          audio.block();
          effects.sparks(e.x, this.gy(e.x, e.z) + 1, e.z, 18, 0x6fd4ff, 6);
          break;
        case 'bounce':
          effects.sparks(e.x, this.gy(e.x, e.z) + 0.8, e.z, 4, 0x49e05c, 2);
          break;
        case 'pickup':
          effects.sparks(e.x, this.gy(e.x, e.z) + 0.9, e.z, 12, 0xffd45c, 5);
          audio.itemGet();
          break;
        case 'item':
          this.myKart.item = e.item;
          this.myKart.itemT = 1.2;
          this.app.hud.setItem(e.item, true);
          audio.itemGet();
          break;
        case 'horn':
          audio.horn();
          break;
        case 'left': {
          const entry = this.meshes.get(e.id);
          if (entry) {
            this.app.scene.remove(entry.kv.group);
            this.meshes.delete(e.id);
          }
          break;
        }
        case 'raceEnd':
          this.state = 'results';
          this.app.onRaceEnd(e.list);
          break;
        default:
          break;
      }
    }
  }

  updateCamera(dt, input) {
    if (this.demo) return this.updateDemoCamera(dt);
    const k = this.myKart;
    const cam = this.app.camera;
    const speed = Math.abs(k.speed);
    const back = input.lookBack ? -1 : 1;
    const fx = Math.sin(k.heading) * back;
    const fz = Math.cos(k.heading) * back;
    const dist = 7.4 + speed * 0.075;
    const height = 3.1 + speed * 0.02;
    const target = V3().set(k.x - fx * dist, this.gy(k.x, k.z) + height, k.z - fz * dist);
    if (!this.camInit) {
      this.camPos.copy(target);
      this.camInit = true;
    }
    const f = 1 - Math.exp(-dt * 6.5);
    this.camPos.lerp(target, f);
    const lookTarget = V3().set(k.x + fx * 7, k.y + 1.5, k.z + fz * 7);
    this.camLook.lerp(lookTarget, f);
    cam.position.copy(this.camPos);
    this.applyShake(cam);
    cam.lookAt(this.camLook);
    const targetFov = 62 + (k.boostT > 0 ? 13 : 0);
    this.camFov += (targetFov - this.camFov) * Math.min(1, dt * 4.5);
    cam.fov = this.camFov;
    cam.updateProjectionMatrix();
  }

  updateDemoCamera(dt) {
    const cam = this.app.camera;
    this.demoTime += dt;
    const standings = this.session.standings ? this.session.standings() : [];
    const leaderId = standings.length ? standings[0].id : null;
    const kart = this.session.others().find(o => o.id === leaderId) || this.session.others()[0];
    if (!kart) return;
    const gy = this.session.mode === 'net' ? this.gy(kart.x, kart.z) : kart.y;
    const a = this.demoTime * 0.22;
    const dist = 15 + Math.sin(this.demoTime * 0.3) * 4;
    const side = Math.sin(a) * 8;
    const fx = Math.sin(kart.heading);
    const fz = Math.cos(kart.heading);
    const rx = -fz;
    const rz = fx;
    const target = V3().set(
      kart.x - fx * dist + rx * side,
      gy + 6 + Math.sin(this.demoTime * 0.5) * 1.2,
      kart.z - fz * dist + rz * side
    );
    if (!this.camInit) {
      this.camPos.copy(target);
      this.camInit = true;
    }
    this.camPos.lerp(target, 1 - Math.exp(-dt * 2.2));
    cam.position.copy(this.camPos);
    this.camLook.lerp(V3().set(kart.x, gy + 1, kart.z), 1 - Math.exp(-dt * 3));
    cam.lookAt(this.camLook);
    if (this.camFov !== 60) {
      this.camFov += (60 - this.camFov) * Math.min(1, dt * 3);
      cam.fov = this.camFov;
      cam.updateProjectionMatrix();
    }
  }

  applyShake(cam) {
    if (this.shake > 0.001) {
      cam.position.x += (Math.random() - 0.5) * this.shake;
      cam.position.y += (Math.random() - 0.5) * this.shake;
      this.shake *= 0.9;
    }
  }

  updateHud(dt, nowMs) {
    if (this.demo) return;
    const hud = this.app.hud;
    const k = this.myKart;
    hud.setSpeed(k.speed);
    const raceTime = this.session.mode === 'net' ? this.session.time || 0 : Math.max(0, (nowMs - this.startedAt) / 1000);
    hud.setTime(raceTime);
    hud.setWrong(this.progress.wrongWay);
    hud.setLap(this.progress.lap, this.laps);
    if (k.item && k.itemT <= 0 && this._hudRoulette !== false) {
      hud.setItem(k.item, false);
      this._hudRoulette = false;
    }
    if (k.item && k.itemT > 0 && this._hudRoulette !== true) {
      hud.setItem(k.item, true);
      this._hudRoulette = true;
    }
    if (!k.item && this._hudRoulette !== 'none') {
      hud.setItem(null);
      this._hudRoulette = 'none';
    }
    hud.tick(dt);
    this.standTimer -= dt;
    if (this.standTimer <= 0) {
      this.standTimer = 0.4;
      const list = this.standingsList();
      hud.setStandings(list);
      const me = list.find(e => e.me);
      hud.setPos(me ? me.place : 1, list.length);
    }
    const karts = [{ x: k.x, z: k.z, color: '#' + charById(k.charId).color.toString(16).padStart(6, '0'), me: true }];
    for (const o of this.session.others()) {
      karts.push({ x: o.x, z: o.z, color: '#' + charById(o.charId).color.toString(16).padStart(6, '0') });
    }
    hud.drawMinimap(karts, this.myId);
    const lat = this.session.mode === 'net' ? this.session.latency : 0;
    const total = this.session.others().length + 1;
    hud.setNet(`${total} en pista` + (lat ? ` · ${lat} ms` : ''));
  }

  standingsList() {
    const session = this.session;
    if (session.mode === 'net') {
      const infos = new Map(session.kartInfos.map(k => [k.id, k]));
      const order = session.rankIds.length ? session.rankIds : [...infos.keys()];
      return order.map((id, i) => {
        const info = infos.get(id);
        return {
          id,
          place: i + 1,
          name: info ? info.name : id,
          color: '#' + charById(info ? info.charId : 'turbo').color.toString(16).padStart(6, '0'),
          me: id === session.id,
          bot: info ? info.bot : false
        };
      });
    }
    return session.standings().map((r, i) => {
      const k = r.id === 'me' ? session.myKart : session.bots.find(b => b.id === r.id);
      return {
        id: r.id,
        place: i + 1,
        name: k ? k.name : r.id,
        color: '#' + charById(k ? k.charId : 'turbo').color.toString(16).padStart(6, '0'),
        me: r.id === 'me',
        bot: r.id !== 'me'
      };
    });
  }

  restartDemo() {
    this.session.start(this.opts);
    this.progress = newProgress();
    this.state = 'countdown';
    this.startAt = Date.now() + 2000;
    this.startedAt = this.startAt;
    this.lastCount = -1;
  }

  dispose() {
    if (this.myVisual) {
      this.app.scene.remove(this.myVisual.group);
      disposeObject(this.myVisual.group, true);
    }
    for (const entry of this.meshes.values()) {
      this.app.scene.remove(entry.kv.group);
      disposeObject(entry.kv.group, true);
    }
    for (const entry of this.hazardMeshes.values()) {
      this.app.scene.remove(entry.built.group);
      disposeObject(entry.built.group, false);
    }
    this.meshes.clear();
    this.hazardMeshes.clear();
  }
}
