import * as THREE from 'three';
import { Input } from './input.js';
import { AudioMan } from './audio.js';
import { Hud } from './hud.js';
import { Ui } from './ui.js';
import { World, Effects } from './render.js';
import { LocalSession } from './local.js';
import { NetSession } from './net.js';
import { Race } from './game.js';
import { buildTrack } from '/shared/track.js';

const app = {
  renderer: null,
  scene: null,
  camera: null,
  world: null,
  race: null,
  session: null,
  effects: null,
  audio: new AudioMan(),
  input: new Input(),
  hud: null,
  ui: null,
  mode: 'boot',
  last: 0,
  lastLocalOpts: null,
  quality: 'high',

  boot() {
    const canvas = document.getElementById('game');
    this.quality = this.input.isTouch ? 'low' : 'high';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.input.isTouch ? 1.5 : 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 4200);
    this.effects = new Effects(this.scene);
    this.hud = new Hud();
    this.ui = new Ui({
      onClick: () => {
        this.audio.init();
        this.audio.click();
      },
      onSolo: opts => this.startLocal(opts),
      onCreate: opts => this.startNet(opts, null, opts.settings),
      onJoin: opts => this.startNet(opts, opts.room, null),
      onReady: v => this.session && this.session.sendReady(v),
      onSettings: s => this.session && this.session.sendSettings(s),
      onStart: () => this.session && this.session.sendStart(),
      onLeave: () => this.showMenu(),
      onAgain: () => this.again(),
      onToLobby: () => this.toLobby(),
      onMenu: () => this.showMenu()
    });
    this.input.bindTouch(document.getElementById('touch'));
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    const params = new URLSearchParams(location.search);
    const room = (params.get('room') || '').toUpperCase().slice(0, 4);
    if (room) {
      if (/^[A-Z0-9]{4}$/.test(room)) {
        document.getElementById('inpCode').value = room;
        this.ui.setMenuHint('Tienes una invitación a la sala ' + room + '. Pulsa "Unirse a sala" para entrar.');
      } else {
        this.ui.setMenuHint('Código de sala inválido: ' + room);
      }
    }
    this.showMenu();
    requestAnimationFrame(this.loop.bind(this));
  },

  stopRace() {
    this.disposeScene();
    if (this.session && this.session.mode === 'net') this.session.close();
    this.session = null;
    this.audio.stopEngine();
  },

  disposeScene() {
    if (this.race) {
      this.race.dispose();
      this.race = null;
    }
    if (this.world) {
      this.world.dispose();
      this.world = null;
    }
  },

  showMenu() {
    this.stopRace();
    this.mode = 'menu';
    this.hud.show(false);
    this.hud.clearMessage();
    this.ui.showMenu();
    this.world = new World(this.scene, buildTrack('sunset'), { quality: this.quality });
    this.session = new LocalSession(null);
    this.session.start({ trackId: 'sunset', laps: 1, bots: 6, demo: true });
    this.race = new Race(this, this.session, { demo: true });
    this.audio.startMusic();
  },

  startLocal(opts) {
    this.stopRace();
    this.mode = 'race';
    this.lastLocalOpts = opts;
    const track = buildTrack(opts.trackId);
    this.world = new World(this.scene, track, { quality: this.quality });
    this.hud.setTrack(track);
    this.session = new LocalSession(null);
    this.session.start(opts);
    this.race = new Race(this, this.session, {});
    this.ui.hideOverlays();
    this.hud.show(true);
    this.audio.init();
    this.audio.startEngine();
    this.audio.startMusic();
  },

  startNet(profile, roomCode, settings) {
    this.stopRace();
    this.mode = 'net';
    this.session = new NetSession({
      onWelcome: m => {
        this.ui.setRoom(m.room, m.id);
        if (m.room.state === 'lobby') this.ui.setLobbyHint('Comparte el código de 4 letras con tus amigos.');
      },
      onRoom: room => {
        this.ui.setRoom(room, this.session.id);
        if (room.state === 'lobby' && this.mode !== 'net-race') {
          this.ui.showLobby();
          this.hud.show(false);
        }
      },
      onStart: m => this.beginNetRace(m),
      onGo: () => {},
      onItem: item => this.race && this.race.onItemGranted(item),
      onHit: m => {
        if (!this.race) return;
        if (m.id === this.session.id) this.race.onHitMe(m);
        else {
          this.audio.hit();
          this.effects.explosion(m.x, this.race.gy(m.x, m.z) + 0.5, m.z);
        }
      },
      onFx: e => this.race && this.race.handleEvents([e]),
      onFinish: m => {
        const info = (this.session.kartInfos || []).find(k => k.id === m.id);
        this.hud.message((info ? info.name : 'Piloto') + ' cruzó la meta', 1.3, true);
      },
      onResults: list => this.showResults(list),
      onError: m => {
        this.showMenu();
        this.ui.setMenuHint(m.msg || 'Error de conexión');
      },
      onClose: () => {
        if (this.mode === 'net' || this.mode === 'net-race') {
          this.showMenu();
          this.ui.setMenuHint('Se perdió la conexión con el servidor');
        }
      },
      onSys: text => this.hud.chat('', text),
      onChat: m => this.hud.chat(m.name + ': ', m.text)
    });
    this.session.join(profile);
    this.ui.showLobby();
    this.ui.setLobbyHint('Conectando al servidor...');
    this.hud.show(false);
    if (settings) {
      this.pendingSettings = settings;
      setTimeout(() => {
        if (this.session && this.pendingSettings) {
          this.session.sendSettings(this.pendingSettings);
          this.pendingSettings = null;
        }
      }, 600);
    }
  },

  beginNetRace(m) {
    this.mode = 'net-race';
    this.disposeScene();
    const track = this.session.track;
    this.world = new World(this.scene, track, { quality: this.quality });
    this.hud.setTrack(track);
    this.race = new Race(this, this.session, {});
    this.ui.hideOverlays();
    this.hud.show(true);
    this.audio.init();
    this.audio.startEngine();
    this.audio.startMusic();
  },

  onCountdown(n) {
    if (n > 0) {
      this.hud.message(String(n), 0.85);
      this.audio.countdown(n);
    } else {
      this.hud.message('¡YA!', 1.1);
      this.audio.go();
    }
  },

  onGo() {},

  onRaceEnd(list) {
    if (this.race && this.race.demo) {
      this.race.restartDemo();
      return;
    }
    if (this.mode === 'race') this.showResults(list);
  },

  showResults(list) {
    this.mode = 'results';
    this.hud.show(false);
    const isHost = this.session.mode === 'net' ? this.session.room && this.session.room.hostId === this.session.id : true;
    this.ui.setResults(list, this.session.mode === 'net' ? this.session.id : 'me', isHost);
    this.audio.stopMusic();
  },

  again() {
    if (this.mode === 'net' || this.mode === 'net-race' || (this.session && this.session.mode === 'net')) {
      this.disposeScene();
      this.hud.show(false);
      this.ui.showLobby();
      this.session.sendAgain();
    } else if (this.lastLocalOpts) {
      this.startLocal(this.lastLocalOpts);
    }
  },

  toLobby() {
    if (this.session && this.session.mode === 'net') {
      this.disposeScene();
      this.hud.show(false);
      this.session.sendLobby();
      this.ui.showLobby();
    } else {
      this.showMenu();
    }
  },

  quickChat(i) {
    const msgs = ['¡Vamos!', '¡Buena!', '¡Uy!', '¡Toma!'];
    if (this.mode !== 'net-race' || !this.session) return;
    this.session.sendChat(msgs[i] || msgs[0]);
  },

  loop(t) {
    requestAnimationFrame(this.loop.bind(this));
    const dt = Math.min(0.05, Math.max(0.001, (t - this.last) / 1000 || 0.016));
    this.last = t;
    if (this.race) {
      const input = this.input.get();
      this.race.update(dt, input);
      if (this.mode === 'net-race' || this.mode === 'race') {
        const ci = this.input.consumeChat();
        if (ci >= 0) this.quickChat(ci);
      }
    }
    if (this.world) this.world.update(dt, this.camera.position);
    this.effects.update(dt);
    this.audio.tickMusic();
    this.renderer.render(this.scene, this.camera);
  }
};

window.addEventListener('keydown', e => {
  if (e.code === 'KeyM') app.audio.setMuted(!app.audio.muted);
});

app.boot();
window.__tk = app;
