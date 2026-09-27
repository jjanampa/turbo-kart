import * as THREE from 'three';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function noiseFill(ctx, w, h, base, dots, dark, light) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < dots; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = 1 + Math.random() * 2.5;
    ctx.fillStyle = Math.random() < 0.5 ? dark : light;
    ctx.globalAlpha = 0.16 + Math.random() * 0.22;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function asphaltTexture() {
  return canvasTex(256, 256, (ctx, w, h) => noiseFill(ctx, w, h, '#4b4b53', 2200, '#2e2e36', '#6a6a74'));
}

export function dirtTexture() {
  return canvasTex(128, 128, (ctx, w, h) => noiseFill(ctx, w, h, '#8f7350', 900, '#6b543a', '#ab8f68'));
}

export function grassTexture(color) {
  const col = new THREE.Color(color);
  return canvasTex(256, 256, (ctx, w, h) => {
    noiseFill(ctx, w, h, '#' + col.getHexString(), 2600, '#' + col.clone().multiplyScalar(0.72).getHexString(), '#' + col.clone().lerp(new THREE.Color(0xffffff), 0.22).getHexString());
  });
}

export function stripeTexture(a, b) {
  return canvasTex(64, 64, (ctx, w, h) => {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, w, h / 2);
    ctx.fillStyle = b;
    ctx.fillRect(0, h / 2, w, h / 2);
  });
}

export function checkerTexture() {
  return canvasTex(128, 128, (ctx, w, h) => {
    const n = 8;
    const s = w / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#191c22' : '#f2f2f2';
        ctx.fillRect(x * s, y * s, s, s);
      }
    }
  });
}

export function questionTexture() {
  return canvasTex(128, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ffd45c');
    g.addColorStop(1, '#f09c1e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(60,40,0,0.55)';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(10, 10, w - 20, 16);
    ctx.font = '900 84px Avenir Next, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#5b3a00';
    ctx.fillText('?', w / 2, h / 2 + 6);
  });
}

export function chevronTexture() {
  return canvasTex(64, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ffd45c';
    ctx.lineWidth = 11;
    ctx.lineCap = 'round';
    for (let k = 0; k < 2; k++) {
      const y0 = 26 + k * 50;
      ctx.beginPath();
      ctx.moveTo(10, y0 + 22);
      ctx.lineTo(w / 2, y0);
      ctx.lineTo(w - 10, y0 + 22);
      ctx.stroke();
    }
  });
}

export function barrierTexture() {
  return canvasTex(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#e8e8ee';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c9332a';
    ctx.fillRect(0, 0, w, 14);
    ctx.fillRect(0, 50, w, 14);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, 22, w, 6);
    ctx.fillRect(0, 36, w, 6);
  });
}

export function crowdTexture() {
  return canvasTex(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#20242e';
    ctx.fillRect(0, 0, w, h);
    const cols = ['#e23b2e', '#f2c438', '#3fbf6f', '#2f9fe0', '#9a5fe0', '#f07a24', '#e8e8ee'];
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = cols[Math.floor(Math.random() * cols.length)];
      const x = Math.random() * w;
      const y = Math.random() * h;
      ctx.fillRect(x, y, 3, 5);
    }
  });
}

export function cloudTexture() {
  return canvasTex(256, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const x = 30 + Math.random() * (w - 60);
      const y = 40 + Math.random() * (h - 60);
      const r = 14 + Math.random() * 30;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function makeGlowTexture(color) {
  const c = new THREE.Color(color);
  return canvasTex(256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, '#' + c.getHexString());
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

const glowCache = new Map();

export function glowTexture(color) {
  const key = String(color);
  if (!glowCache.has(key)) glowCache.set(key, makeGlowTexture(color));
  return glowCache.get(key);
}

export function disposeObject(obj, disposeTextures = false) {
  obj.traverse(o => {
    if (o.isSprite) {
      if (o.material) {
        if (disposeTextures && o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
      return;
    }
    if (!o.isMesh && !o.isPoints && !o.isInstancedMesh) return;
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      if (disposeTextures && m.map) m.map.dispose();
      m.dispose();
    }
  });
}

export function bannerTexture(text, accent) {
  return canvasTex(512, 96, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#232838');
    g.addColorStop(1, '#141824');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, w, 7);
    ctx.fillRect(0, h - 7, w, 7);
    ctx.font = '900 52px Avenir Next, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, w / 2, h / 2 + 3);
  });
}

function ribbonGeometry(track, uFnA, uFnB, yFn, uvScale) {
  const n = track.n;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= n; i++) {
    const ii = i % n;
    const s = i * track.step;
    const ua = uFnA(s);
    const ub = uFnB(s);
    const pa = track.worldAt(s, ua, 0);
    const pb = track.worldAt(s, ub, 0);
    const ya = yFn ? yFn(s, ua) : pa.y;
    const yb = yFn ? yFn(s, ub) : pb.y;
    pos.push(pa.x, ya, pa.z, pb.x, yb, pb.z);
    uv.push(ua / uvScale, s / uvScale, ub / uvScale, s / uvScale);
  }
  for (let i = 0; i < n; i++) {
    const o = i * 2;
    idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function wallGeometry(track, side, height, uvScale) {
  const n = track.n;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= n; i++) {
    const ii = i % n;
    const s = i * track.step;
    const u = side * (track.hwAt(s) + 5.8);
    const p = track.worldAt(s, u, 0);
    const gy = track.terrainY(s, u);
    pos.push(p.x, gy, p.z, p.x, gy + height, p.z);
    uv.push(s / uvScale, 0, s / uvScale, height / uvScale);
  }
  for (let i = 0; i < n; i++) {
    const o = i * 2;
    idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const DECO_DEFS = {
  palm: {
    parts: [
      { geo: () => new THREE.CylinderGeometry(0.24, 0.34, 4.4, 7).translate(0, 2.2, 0), color: 'trunk' },
      { geo: () => { const g = new THREE.SphereGeometry(1.75, 9, 7); g.scale(1, 0.72, 1); g.translate(0, 4.7, 0); return g; }, color: 'leaf' }
    ]
  },
  pine: {
    parts: [
      { geo: () => new THREE.CylinderGeometry(0.22, 0.32, 2.4, 7).translate(0, 1.2, 0), color: 'trunk' },
      { geo: () => new THREE.ConeGeometry(2.3, 3.0, 9).translate(0, 3.2, 0), color: 'leaf' },
      { geo: () => new THREE.ConeGeometry(1.7, 2.5, 9).translate(0, 4.9, 0), color: 'leaf' },
      { geo: () => new THREE.ConeGeometry(1.1, 2.0, 9).translate(0, 6.3, 0), color: 'leaf' }
    ]
  },
  bush: {
    parts: [
      { geo: () => { const g = new THREE.SphereGeometry(1.35, 8, 6); g.scale(1, 0.8, 1); g.translate(0, 0.7, 0); return g; }, color: 'leaf' }
    ]
  },
  rock: {
    parts: [
      { geo: () => new THREE.IcosahedronGeometry(1.4, 0).translate(0, 0.62, 0), color: 'rock', shadow: true }
    ]
  },
  tire: {
    parts: [
      { geo: () => new THREE.TorusGeometry(0.72, 0.34, 6, 10).rotateX(Math.PI / 2).translate(0, 0.4, 0), color: 'tire', shadow: true }
    ]
  },
  deadtree: {
    parts: [
      { geo: () => new THREE.CylinderGeometry(0.26, 0.5, 3.4, 6).translate(0, 1.7, 0), color: 'trunk' },
      { geo: () => new THREE.CylinderGeometry(0.12, 0.2, 1.9, 5).rotateZ(0.9).translate(0.7, 3.7, 0), color: 'trunk' },
      { geo: () => new THREE.CylinderGeometry(0.1, 0.18, 1.6, 5).rotateZ(-1.1).translate(-0.6, 3.9, 0), color: 'trunk' }
    ]
  }
};

export class World {
  constructor(scene, track, opts = {}) {
    this.scene = scene;
    this.track = track;
    this.palette = track.palette;
    this.quality = opts.quality || 'high';
    this.group = new THREE.Group();
    scene.add(this.group);
    this.disposables = [];
    this.time = 0;
    scene.fog = new THREE.Fog(this.palette.fog, 180, 1250);
    this.sunDir = new THREE.Vector3(0.5, 0.62, 0.34).normalize();
    this.buildSky();
    this.buildLights();
    this.buildSurfaces();
    this.buildWalls();
    this.buildStartArea();
    this.buildBoxes();
    this.buildPads();
    this.buildDecor();
    this.buildClouds();
    this.buildMountains();
    if (track.def.embers) this.buildEmbers();
  }

  trackTex(tex) {
    this.disposables.push(tex);
    return tex;
  }

  buildSky() {
    const p = this.palette;
    const geo = new THREE.SphereGeometry(1700, 32, 16);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color(p.skyTop) },
        bottom: { value: new THREE.Color(p.skyBottom) }
      },
      vertexShader: 'varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vW; void main(){ float h = normalize(vW).y; float f = pow(max(h + 0.14, 0.0), 0.62); gl_FragColor = vec4(mix(bottom, top, clamp(f, 0.0, 1.0)), 1.0); }',
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    });
    const sky = new THREE.Mesh(geo, mat);
    sky.frustumCulled = false;
    this.group.add(sky);
    this.disposables.push(geo, mat);

    const glow = makeGlowTexture(p.sun);
    this.trackTex(glow);
    const sunMat = new THREE.SpriteMaterial({ map: glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const sun = new THREE.Sprite(sunMat);
    sun.position.copy(this.sunDir).multiplyScalar(1250);
    sun.scale.set(340, 340, 1);
    this.group.add(sun);
    this.disposables.push(sunMat);
  }

  buildLights() {
    const p = this.palette;
    const hemi = new THREE.HemisphereLight(p.hemiSky, p.hemiGround, 0.85);
    this.group.add(hemi);
    const amb = new THREE.AmbientLight(0xffffff, p.ambient * 0.35);
    this.group.add(amb);
    const dir = new THREE.DirectionalLight(p.sunLight, 1.75);
    const size = this.quality === 'high' ? 2048 : 1024;
    dir.castShadow = true;
    dir.shadow.mapSize.set(size, size);
    const sc = dir.shadow.camera;
    sc.left = -75;
    sc.right = 75;
    sc.top = 75;
    sc.bottom = -75;
    sc.near = 20;
    sc.far = 700;
    dir.shadow.bias = -0.0006;
    dir.shadow.normalBias = 0.7;
    this.group.add(dir);
    this.group.add(dir.target);
    this.sun = dir;
    this.disposables.push(hemi, amb, dir);
  }

  buildSurfaces() {
    const t = this.track;
    const p = this.palette;
    const asphalt = this.trackTex(asphaltTexture());
    const dirt = this.trackTex(dirtTexture());
    const grass = this.trackTex(grassTexture(p.grass));
    const kerbTex = this.trackTex(stripeTexture('#' + new THREE.Color(p.kerbA).getHexString(), '#' + new THREE.Color(p.kerbB).getHexString()));

    const mk = (geo, map, extra) => {
      const mat = new THREE.MeshLambertMaterial({ map, side: THREE.DoubleSide, ...extra });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.disposables.push(geo, mat);
      return mesh;
    };

    mk(ribbonGeometry(t, s => t.hwAt(s), s => -t.hwAt(s), null, 8), asphalt);
    mk(ribbonGeometry(t, s => t.hwAt(s), s => t.hwAt(s) + 1.3, null, 3), kerbTex);
    mk(ribbonGeometry(t, s => -t.hwAt(s), s => -t.hwAt(s) - 1.3, null, 3), kerbTex);
    const yTerrain = (s, u) => t.terrainY(s, u);
    mk(ribbonGeometry(t, s => t.hwAt(s) + 1.3, s => t.hwAt(s) + 5.8, yTerrain, 6), dirt);
    mk(ribbonGeometry(t, s => -t.hwAt(s) - 1.3, s => -t.hwAt(s) - 5.8, yTerrain, 6), dirt);
    mk(ribbonGeometry(t, s => t.hwAt(s) + 5.8, s => t.hwAt(s) + 40, yTerrain, 8), grass);
    mk(ribbonGeometry(t, s => -t.hwAt(s) - 5.8, s => -t.hwAt(s) - 40, yTerrain, 8), grass);

    const groundTex = grass.clone();
    groundTex.needsUpdate = true;
    groundTex.repeat.set(380, 380);
    this.trackTex(groundTex);
    const groundGeo = new THREE.PlaneGeometry(4200, 4200);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshLambertMaterial({ map: groundTex });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -0.42;
    ground.receiveShadow = true;
    this.group.add(ground);
    this.disposables.push(groundGeo, groundMat);
  }

  buildWalls() {
    const t = this.track;
    const tex = this.trackTex(barrierTexture());
    const postGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.15, 6);
    const postMat = new THREE.MeshLambertMaterial({ color: 0x30343e });
    this.disposables.push(postGeo, postMat);
    for (const side of [1, -1]) {
      const geo = wallGeometry(t, side, 1.05, 1.25);
      const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
      const wall = new THREE.Mesh(geo, mat);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.group.add(wall);
      this.disposables.push(geo, mat);
      const count = Math.floor(t.n / 5);
      const posts = new THREE.InstancedMesh(postGeo, postMat, count);
      posts.frustumCulled = false;
      posts.castShadow = true;
      const d = new THREE.Object3D();
      for (let i = 0; i < count; i++) {
        const s = (i * 5) * t.step;
        const u = side * (t.hwAt(s) + 5.8);
        const p = t.worldAt(s, u, 0);
        d.position.set(p.x, t.terrainY(s, u) + 0.55, p.z);
        d.rotation.set(0, 0, 0);
        d.scale.set(1, 1, 1);
        d.updateMatrix();
        posts.setMatrixAt(i, d.matrix);
      }
      posts.instanceMatrix.needsUpdate = true;
      this.group.add(posts);
      this.disposables.push(posts);
    }
  }

  buildStartArea() {
    const t = this.track;
    const p = this.palette;
    const arch = t.arch;
    const g = new THREE.Group();
    g.position.set(arch.x, arch.y, arch.z);
    g.rotation.y = arch.rot;
    const hw = arch.hw;
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0x2a2f3c });
    const pillarGeo = new THREE.BoxGeometry(1.3, 7.6, 1.3);
    for (const s of [-1, 1]) {
      const pl = new THREE.Mesh(pillarGeo, pillarMat);
      pl.position.set(s * (hw + 1.5), 3.8, 0);
      pl.castShadow = true;
      g.add(pl);
    }
    const bannerTex = this.trackTex(bannerTexture('TURBO KART', '#' + new THREE.Color(p.kerbA).getHexString()));
    const bannerMat = new THREE.MeshLambertMaterial({ map: bannerTex });
    const sideMat = new THREE.MeshLambertMaterial({ color: 0x1b2030 });
    const bannerGeo = new THREE.BoxGeometry(hw * 2 + 4.3, 1.75, 0.45);
    const banner = new THREE.Mesh(bannerGeo, [sideMat, sideMat, sideMat, sideMat, bannerMat, bannerMat]);
    banner.position.y = 6.5;
    banner.castShadow = true;
    g.add(banner);
    const topGeo = new THREE.BoxGeometry(hw * 2 + 4.3, 0.35, 0.6);
    const top = new THREE.Mesh(topGeo, pillarMat);
    top.position.y = 7.6;
    g.add(top);
    const checkTex = this.trackTex(checkerTexture());
    checkTex.repeat.set(4, 1);
    const lineGeo = new THREE.PlaneGeometry(hw * 2 + 3.2, 3.2);
    lineGeo.rotateX(-Math.PI / 2);
    const lineMat = new THREE.MeshBasicMaterial({ map: checkTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.position.y = 0.04;
    g.add(line);
    this.group.add(g);
    this.disposables.push(g, pillarGeo, pillarMat, bannerGeo, bannerMat, sideMat, topGeo, lineGeo, lineMat);

    const crowdTex = this.trackTex(crowdTexture());
    const standBase = new THREE.MeshLambertMaterial({ map: crowdTex });
    const standDark = new THREE.MeshLambertMaterial({ color: 0x232838 });
    for (const st of t.stands) {
      const sg = new THREE.Group();
      sg.position.set(st.x, st.y, st.z);
      sg.rotation.y = st.rot;
      const tiers = [
        { w: 6.6, x: 0, y: 0.5, h: 1.0 },
        { w: 4.8, x: -1.3, y: 1.5, h: 1.0 },
        { w: 3.0, x: -2.3, y: 2.5, h: 1.0 }
      ];
      for (const tier of tiers) {
        const geo = new THREE.BoxGeometry(tier.w, tier.h, 17);
        const mesh = new THREE.Mesh(geo, standBase);
        mesh.position.set(tier.x, tier.y, 0);
        mesh.castShadow = true;
        sg.add(mesh);
        this.disposables.push(geo);
      }
      const wallGeo = new THREE.BoxGeometry(0.4, 3.6, 17.4);
      const wall = new THREE.Mesh(wallGeo, standDark);
      wall.position.set(-3.6, 1.8, 0);
      wall.castShadow = true;
      sg.add(wall);
      this.group.add(sg);
      this.disposables.push(sg, wallGeo);
    }
    this.disposables.push(standBase, standDark);
  }

  buildBoxes() {
    const t = this.track;
    const tex = this.trackTex(questionTexture());
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const geo = new THREE.BoxGeometry(0.95, 0.95, 0.95, 1, 1, 1);
    this.boxMesh = new THREE.InstancedMesh(geo, mat, t.boxes.length);
    this.boxMesh.frustumCulled = false;
    this.boxDummy = new THREE.Object3D();
    this.group.add(this.boxMesh);
    this.disposables.push(this.boxMesh, geo, mat);
  }

  updateBoxes(avail, now) {
    const t = this.track;
    const d = this.boxDummy;
    for (let i = 0; i < t.boxes.length; i++) {
      const b = t.boxes[i];
      if (avail && !avail[i]) {
        d.position.set(b.x, b.y, b.z);
        d.scale.set(0.0001, 0.0001, 0.0001);
        d.rotation.set(0, 0, 0);
      } else {
        d.position.set(b.x, b.y + Math.sin(now * 2.2 + i) * 0.13, b.z);
        d.rotation.set(0, now * 1.8 + i, 0);
        d.scale.set(1, 1, 1);
      }
      d.updateMatrix();
      this.boxMesh.setMatrixAt(i, d.matrix);
    }
    this.boxMesh.instanceMatrix.needsUpdate = true;
  }

  buildPads() {
    const t = this.track;
    const tex = this.trackTex(chevronTexture());
    tex.repeat.set(1, 1);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.92 });
    const geo = new THREE.PlaneGeometry(3.1, 4.2);
    geo.rotateX(Math.PI / 2);
    this.padMat = mat;
    const pads = new THREE.InstancedMesh(geo, mat, t.pads.length);
    pads.frustumCulled = false;
    const d = new THREE.Object3D();
    for (let i = 0; i < t.pads.length; i++) {
      const pad = t.pads[i];
      d.position.set(pad.x, pad.y + 0.07, pad.z);
      d.rotation.set(0, t.headingAt(pad.s), 0);
      d.scale.set(1, 1, 1);
      d.updateMatrix();
      pads.setMatrixAt(i, d.matrix);
    }
    pads.instanceMatrix.needsUpdate = true;
    this.group.add(pads);
    this.disposables.push(pads, geo, mat);
  }

  buildDecor() {
    const t = this.track;
    const p = this.palette;
    const colors = {
      trunk: p.trunk,
      leaf: p.leaf,
      rock: p.mountain,
      tire: 0x282a30
    };
    const byType = {};
    for (const deco of t.deco) {
      (byType[deco.type] = byType[deco.type] || []).push(deco);
    }
    for (const type in byType) {
      const def = DECO_DEFS[type];
      if (!def) continue;
      const list = byType[type];
      for (const part of def.parts) {
        const geo = part.geo();
        const mat = new THREE.MeshLambertMaterial({ color: colors[part.color] });
        const mesh = new THREE.InstancedMesh(geo, mat, list.length);
        mesh.frustumCulled = false;
        mesh.castShadow = part.shadow !== false;
        const d = new THREE.Object3D();
        for (let i = 0; i < list.length; i++) {
          const deco = list[i];
          d.position.set(deco.x, deco.y, deco.z);
          d.rotation.set(0, deco.rot, 0);
          d.scale.set(deco.scale, deco.scale, deco.scale);
          d.updateMatrix();
          mesh.setMatrixAt(i, d.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        this.group.add(mesh);
        this.disposables.push(mesh, geo, mat);
      }
    }
  }

  buildClouds() {
    const tex = this.trackTex(cloudTexture());
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false, fog: false });
    this.disposables.push(mat);
    this.clouds = [];
    for (let i = 0; i < 16; i++) {
      const spr = new THREE.Sprite(mat);
      const a = Math.random() * Math.PI * 2;
      const r = 250 + Math.random() * 650;
      spr.position.set(Math.cos(a) * r, 90 + Math.random() * 140, Math.sin(a) * r);
      const sc = 120 + Math.random() * 180;
      spr.scale.set(sc, sc * 0.45, 1);
      this.group.add(spr);
      this.clouds.push({ spr, speed: 1.5 + Math.random() * 2.5 });
    }
  }

  buildMountains() {
    const p = this.palette;
    const mat = new THREE.MeshLambertMaterial({ color: p.mountain });
    this.disposables.push(mat);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + Math.random() * 0.25;
      const r = 780 + Math.random() * 480;
      const h = 80 + Math.random() * 150;
      const rad = 80 + Math.random() * 110;
      const geo = new THREE.ConeGeometry(rad, h, 5);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(Math.cos(a) * r, h * 0.5 - 14, Math.sin(a) * r);
      m.rotation.y = Math.random() * Math.PI;
      this.group.add(m);
      this.disposables.push(geo);
    }
  }

  buildEmbers() {
    const count = 220;
    const pos = new Float32Array(count * 3);
    const bounds = this.track.bounds;
    this.emberSeed = [];
    for (let i = 0; i < count; i++) {
      const x = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
      const z = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
      const y = Math.random() * 30;
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      this.emberSeed.push({ x, z, y, speed: 1.5 + Math.random() * 3 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xff8a4d, size: 0.5, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending });
    this.embers = new THREE.Points(geo, mat);
    this.embers.frustumCulled = false;
    this.group.add(this.embers);
    this.disposables.push(this.embers, geo, mat);
  }

  update(dt, focus) {
    this.time += dt;
    if (this.padMat) this.padMat.map.offset.y = (-(this.time * 0.75) % 1 + 1) % 1;
    if (this.clouds) {
      for (const c of this.clouds) {
        c.spr.position.x += c.speed * dt;
        if (c.spr.position.x > 950) c.spr.position.x = -950;
      }
    }
    if (this.embers) {
      const arr = this.embers.geometry.attributes.position.array;
      for (let i = 0; i < this.emberSeed.length; i++) {
        const e = this.emberSeed[i];
        e.y += e.speed * dt;
        if (e.y > 42) e.y = 0;
        arr[i * 3 + 1] = e.y;
      }
      this.embers.geometry.attributes.position.needsUpdate = true;
    }
    if (focus && this.sun) {
      this.sun.position.copy(focus).addScaledVector(this.sunDir, 300);
      this.sun.target.position.copy(focus);
      this.sun.target.updateMatrixWorld();
    }
  }

  dispose() {
    this.scene.remove(this.group);
    disposeObject(this.group, true);
    this.disposables = [];
  }
}

class Pool {
  constructor(scene, max, size, blending, opacity) {
    this.max = max;
    this.particles = [];
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setDrawRange(0, 0);
    const mat = new THREE.PointsMaterial({
      size,
      vertexColors: true,
      transparent: true,
      opacity,
      depthWrite: false,
      blending
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.geo = geo;
    this.mat = mat;
  }

  spawn(x, y, z, vx, vy, vz, life, r, g, b, gravity = -10, size = 1) {
    if (this.particles.length >= this.max) this.particles.shift();
    this.particles.push({ x, y, z, vx, vy, vz, life, max: life, r, g, b, gravity, size });
  }

  update(dt) {
    const p = this.particles;
    for (let i = p.length - 1; i >= 0; i--) {
      const q = p[i];
      q.life -= dt;
      if (q.life <= 0) {
        p.splice(i, 1);
        continue;
      }
      q.vy += q.gravity * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.z += q.vz * dt;
    }
    for (let i = 0; i < p.length; i++) {
      const q = p[i];
      this.pos[i * 3] = q.x;
      this.pos[i * 3 + 1] = q.y;
      this.pos[i * 3 + 2] = q.z;
      const f = Math.max(0, q.life / q.max);
      this.col[i * 3] = q.r * f;
      this.col[i * 3 + 1] = q.g * f;
      this.col[i * 3 + 2] = q.b * f;
    }
    this.geo.setDrawRange(0, p.length);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene) {
    this.spark = new Pool(scene, 700, 0.55, THREE.AdditiveBlending, 0.95);
    this.dust = new Pool(scene, 600, 0.95, THREE.NormalBlending, 0.5);
    this.conf = new Pool(scene, 900, 0.6, THREE.NormalBlending, 1);
    this.boost = new Pool(scene, 400, 0.7, THREE.AdditiveBlending, 0.9);
  }

  sparks(x, y, z, n = 10, color = 0xffcc55, spread = 4) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      this.spark.spawn(
        x, y, z,
        (Math.random() - 0.5) * spread,
        Math.random() * spread * 0.8 + 0.5,
        (Math.random() - 0.5) * spread,
        0.4 + Math.random() * 0.4,
        c.r, c.g, c.b,
        -16
      );
    }
  }

  driftSparks(x, y, z, tier) {
    const colors = [0x8fd8ff, 0xffb347, 0xd08bff];
    this.sparks(x, y, z, 3, colors[Math.min(2, Math.max(0, tier - 1))], 2.4);
  }

  dustPuff(x, y, z, n = 5) {
    for (let i = 0; i < n; i++) {
      this.dust.spawn(
        x + (Math.random() - 0.5) * 1.6, y + 0.2, z + (Math.random() - 0.5) * 1.6,
        (Math.random() - 0.5) * 2.4, 0.8 + Math.random() * 1.6, (Math.random() - 0.5) * 2.4,
        0.7 + Math.random() * 0.5,
        0.62, 0.55, 0.44,
        -1.6
      );
    }
  }

  boostBurst(x, y, z, n = 12) {
    for (let i = 0; i < n; i++) {
      this.boost.spawn(
        x + (Math.random() - 0.5) * 1.2, y + 0.5 + Math.random(), z + (Math.random() - 0.5) * 1.2,
        (Math.random() - 0.5) * 5, 1 + Math.random() * 3.5, (Math.random() - 0.5) * 5,
        0.35 + Math.random() * 0.3,
        0.45, 0.8, 1.0,
        -6
      );
    }
  }

  explosion(x, y, z, color = 0xff9a4d) {
    const c = new THREE.Color(color);
    for (let i = 0; i < 26; i++) {
      this.spark.spawn(
        x, y + 0.6, z,
        (Math.random() - 0.5) * 9, Math.random() * 8 + 1, (Math.random() - 0.5) * 9,
        0.5 + Math.random() * 0.5,
        c.r, c.g, c.b,
        -18
      );
    }
    this.dustPuff(x, y, z, 10);
  }

  confetti(x, y, z, n = 90) {
    const cols = [[1, 0.24, 0.18], [1, 0.8, 0.22], [0.25, 0.75, 0.44], [0.18, 0.62, 0.9], [0.6, 0.37, 0.9], [1, 1, 1]];
    for (let i = 0; i < n; i++) {
      const c = cols[Math.floor(Math.random() * cols.length)];
      this.conf.spawn(
        x + (Math.random() - 0.5) * 4, y + 2 + Math.random() * 3, z + (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 7, 4 + Math.random() * 6, (Math.random() - 0.5) * 7,
        1.4 + Math.random() * 1.4,
        c[0], c[1], c[2],
        -7
      );
    }
  }

  update(dt) {
    this.spark.update(dt);
    this.dust.update(dt);
    this.conf.update(dt);
    this.boost.update(dt);
  }
}

export function buildHazardMesh(type) {
  const g = new THREE.Group();
  if (type === 'banana') {
    const m = new THREE.MeshLambertMaterial({ color: 0xf2c438 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.46, 10, 8), m);
    body.scale.set(1, 0.66, 1);
    body.position.y = 0.34;
    body.castShadow = true;
    g.add(body);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.26, 6), new THREE.MeshLambertMaterial({ color: 0x6b4a2f }));
    tip.position.y = 0.7;
    g.add(tip);
    return { group: g, spin: 0.9 };
  }
  if (type === 'bolt') {
    const m = new THREE.MeshBasicMaterial({ color: 0x49e05c });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.44, 1), m);
    core.position.y = 0.7;
    g.add(core);
    const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: 0xeaffe9 }));
    inner.position.y = 0.7;
    g.add(inner);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(0x49e05c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.75 }));
    glow.position.y = 0.7;
    glow.scale.set(3, 3, 1);
    g.add(glow);
    return { group: g, spin: 6 };
  }
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xe23b2e });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.85, 8), bodyMat);
  body.rotation.x = Math.PI / 2;
  body.position.y = 0.7;
  body.castShadow = true;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 8), new THREE.MeshLambertMaterial({ color: 0xffd166 }));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.7, 0.6);
  g.add(nose);
  for (const s of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 4), bodyMat);
    fin.rotation.x = -Math.PI / 2;
    fin.position.set(s * 0.24, 0.7, -0.5);
    g.add(fin);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(0xff6b4d), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }));
  glow.position.y = 0.7;
  glow.scale.set(2.6, 2.6, 1);
  g.add(glow);
  return { group: g, spin: 3 };
}
