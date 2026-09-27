import * as THREE from 'three';
import { charById } from '/shared/constants.js';

function makeNameSprite(name, colorHex) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = '900 34px Avenir Next, Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(8,10,16,0.9)';
  ctx.strokeText(name, 128, 34);
  const col = new THREE.Color(colorHex);
  ctx.fillStyle = '#' + col.getHexString();
  ctx.fillText(name, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(6.4, 1.6, 1);
  spr.position.y = 3.15;
  spr.renderOrder = 5;
  return spr;
}

export function buildKart(charId, opts = {}) {
  const ch = charById(charId);
  const baseColor = new THREE.Color(opts.color !== undefined ? opts.color : ch.color);
  const trimColor = new THREE.Color(ch.trim);
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  const body = new THREE.Group();
  group.add(body);

  const mChassis = new THREE.MeshLambertMaterial({ color: baseColor });
  const mChassisDark = new THREE.MeshLambertMaterial({ color: baseColor.clone().multiplyScalar(0.72) });
  const mTrim = new THREE.MeshLambertMaterial({ color: trimColor });
  const mDark = new THREE.MeshLambertMaterial({ color: 0x22242a });
  const mSkin = new THREE.MeshLambertMaterial({ color: 0xf0c39a });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.34, 2.4), mChassis);
  chassis.position.y = 0.42;
  chassis.castShadow = true;
  body.add(chassis);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.22, 0.72), mChassisDark);
  nose.position.set(0, 0.35, 1.36);
  nose.castShadow = true;
  body.add(nose);

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.24), mTrim);
  bumper.position.set(0, 0.28, 1.75);
  body.add(bumper);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.36, 0.7), mDark);
  seat.position.set(0, 0.64, -0.32);
  seat.castShadow = true;
  body.add(seat);

  for (const s of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 1.5), mTrim);
    pod.position.set(s * 0.68, 0.4, -0.05);
    pod.castShadow = true;
    body.add(pod);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 8), mDark);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(s * 0.42, 0.52, -1.3);
    body.add(pipe);
  }

  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.09, 0.36), mTrim);
  spoiler.position.set(0, 0.96, -1.14);
  spoiler.castShadow = true;
  body.add(spoiler);
  const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.38, 0.1), mDark);
  strut.position.set(0, 0.74, -1.12);
  body.add(strut);

  const driver = new THREE.Group();
  driver.position.set(0, 0.6, -0.16);
  body.add(driver);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.3, 5, 10), mChassis);
  torso.position.y = 0.36;
  torso.castShadow = true;
  driver.add(torso);

  const arms = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.12, 0.12), mChassis);
  arms.position.set(0, 0.5, 0.28);
  driver.add(arms);

  const headGeo =
    ch.shape === 'bolt'
      ? new THREE.BoxGeometry(0.54, 0.54, 0.54)
      : ch.shape === 'drop'
        ? new THREE.ConeGeometry(0.4, 0.74, 12)
        : ch.shape === 'star'
          ? new THREE.IcosahedronGeometry(0.38, 0)
          : new THREE.SphereGeometry(0.34, 14, 12);
  const head = new THREE.Mesh(headGeo, mSkin);
  head.position.y = 0.92;
  head.castShadow = true;
  driver.add(head);

  const helmetR = ch.shape === 'round' ? 0.36 : 0.3;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(helmetR, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), mChassis);
  helmet.position.y = 0.95;
  driver.add(helmet);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.08), mDark);
  visor.position.set(0, 0.9, helmetR * 0.86);
  driver.add(visor);

  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.32, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.35, 8);
  hubGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  const wheelPos = [[-1, 1, true], [1, 1, true], [-1, -1, false], [1, -1, false]];
  for (const [sx, sz, front] of wheelPos) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.8, 0.38, sz * 0.92);
    const w = new THREE.Mesh(wheelGeo, mDark);
    w.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, mTrim);
    pivot.add(w);
    pivot.add(hub);
    body.add(pivot);
    wheels.push({ pivot, front });
  }

  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x66ccff,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const flames = [];
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.95, 8), flameMat);
    f.rotation.x = -Math.PI / 2;
    f.position.set(s * 0.42, 0.5, -1.65);
    f.visible = false;
    body.add(f);
    flames.push(f);
  }

  const bubbleMat = new THREE.MeshBasicMaterial({
    color: 0x6fd4ff,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(1.75, 18, 12), bubbleMat);
  bubble.position.y = 0.75;
  bubble.visible = false;
  group.add(bubble);

  let nameSprite = null;
  if (opts.name) {
    nameSprite = makeNameSprite(opts.name, opts.nameColor !== undefined ? opts.nameColor : baseColor.getHex());
    group.add(nameSprite);
  }

  return {
    group,
    body,
    wheels,
    flames,
    bubble,
    nameSprite,
    lean: 0,
    spinAngle: 0,
    wheelSpin: 0
  };
}

export function animateKart(kv, st, dt, steerVis = 0) {
  const hop = st.hopT > 0 ? Math.sin((1 - st.hopT / 0.18) * Math.PI) * 0.35 : 0;
  kv.group.position.set(st.x, st.y + hop, st.z);
  kv.group.rotation.y = st.heading;
  const drifting = st.drifting || (st.flags & 1);
  const targetLean = drifting ? (st.driftDir || 1) * 0.1 : 0;
  kv.lean += (targetLean - kv.lean) * Math.min(1, dt * 9);
  kv.group.rotation.z = kv.lean;
  const spin = st.spinT > 0 || (st.flags & 4);
  if (spin) kv.spinAngle += dt * 13;
  else kv.spinAngle *= Math.max(0, 1 - dt * 5);
  kv.body.rotation.y = kv.spinAngle;
  const sq = st.squashT > 0 ? 1 + st.squashT * 0.45 : 1;
  kv.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
  kv.wheelSpin += (st.speed || 0) * dt / 0.38;
  for (const w of kv.wheels) {
    w.pivot.rotation.x = kv.wheelSpin;
    if (w.front && steerVis) w.pivot.rotation.y = -steerVis * 0.42;
  }
  const boosting = st.boostT > 0 || (st.flags & 2);
  for (const f of kv.flames) {
    f.visible = boosting;
    if (boosting) f.scale.set(0.9 + Math.random() * 0.3, 0.7 + Math.random() * 0.8, 0.9 + Math.random() * 0.3);
  }
  if (kv.bubble) kv.bubble.visible = !!(st.shieldT > 0 || (st.flags & 8));
  if (kv.nameSprite) kv.nameSprite.position.y = 3.15 + hop;
}
