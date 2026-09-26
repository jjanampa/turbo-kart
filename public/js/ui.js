import { CHARACTERS, LAPS_OPTIONS, charById, fmtTime, DEFAULT_LAPS } from '/shared/constants.js';
import { TRACKS } from '/shared/track.js';

const byId = id => document.getElementById(id);
const hex = n => '#' + (n >>> 0).toString(16).padStart(6, '0');

export class Ui {
  constructor(cbs) {
    this.cbs = cbs;
    this.selChar = localStorage.getItem('tk_char') || 'turbo';
    if (!CHARACTERS.some(c => c.id === this.selChar)) this.selChar = 'turbo';
    this.name = localStorage.getItem('tk_name') || '';
    this.solo = {
      trackId: localStorage.getItem('tk_track') || TRACKS[0].id,
      laps: Number(localStorage.getItem('tk_laps')) || DEFAULT_LAPS,
      bots: Number(localStorage.getItem('tk_bots') ?? 5)
    };
    this.room = null;
    this.myId = null;
    this.myReady = false;
    this.buildChars();
    this.buildSoloCfg();
    this.wire();
  }

  profile() {
    const name = (byId('inpName').value || 'Jugador').trim().slice(0, 16) || 'Jugador';
    localStorage.setItem('tk_name', name);
    localStorage.setItem('tk_char', this.selChar);
    return { name, charId: this.selChar };
  }

  buildChars() {
    const grid = byId('charGrid');
    grid.innerHTML = '';
    for (const ch of CHARACTERS) {
      const card = document.createElement('div');
      card.className = 'charcard' + (ch.id === this.selChar ? ' sel' : '');
      card.dataset.id = ch.id;
      const sw = document.createElement('div');
      sw.className = 'swatch';
      sw.style.background = hex(ch.color);
      const nm = document.createElement('div');
      nm.className = 'cname';
      nm.textContent = ch.name;
      card.appendChild(sw);
      card.appendChild(nm);
      card.addEventListener('click', () => {
        this.selChar = ch.id;
        for (const c of grid.children) c.classList.toggle('sel', c.dataset.id === ch.id);
        this.updateStats();
        this.cbs.onClick && this.cbs.onClick();
      });
      grid.appendChild(card);
    }
    byId('inpName').value = this.name || 'Jugador';
    this.updateStats();
  }

  updateStats() {
    const ch = charById(this.selChar);
    const box = byId('statBox');
    box.innerHTML = '';
    const labels = { speed: 'Velocidad', accel: 'Aceleración', grip: 'Agarre' };
    for (const key of ['speed', 'accel', 'grip']) {
      const st = document.createElement('div');
      st.className = 'st';
      const t = document.createElement('div');
      t.textContent = labels[key];
      const bars = document.createElement('div');
      bars.className = 'bars';
      for (let i = 1; i <= 5; i++) {
        const b = document.createElement('i');
        if (i <= ch.stats[key]) b.className = 'on';
        bars.appendChild(b);
      }
      st.appendChild(t);
      st.appendChild(bars);
      box.appendChild(st);
    }
  }

  optRow(parent, label, options, current, cb) {
    const row = document.createElement('div');
    row.className = 'optrow';
    const lbl = document.createElement('div');
    lbl.className = 'lbl';
    lbl.textContent = label;
    const opts = document.createElement('div');
    opts.className = 'opts';
    for (const o of options) {
      const b = document.createElement('button');
      b.className = 'optbtn' + (o.value === current ? ' sel' : '');
      b.textContent = o.label;
      b.addEventListener('click', () => {
        cb(o.value);
        this.cbs.onClick && this.cbs.onClick();
      });
      opts.appendChild(b);
    }
    row.appendChild(lbl);
    row.appendChild(opts);
    parent.appendChild(row);
  }

  buildSoloCfg() {
    const box = byId('soloCfg');
    box.innerHTML = '';
    const render = () => {
      box.innerHTML = '';
      this.optRow(box, 'Pista', TRACKS.map(t => ({ value: t.id, label: t.name })), this.solo.trackId, v => {
        this.solo.trackId = v;
        localStorage.setItem('tk_track', v);
        render();
      });
      this.optRow(box, 'Vueltas', LAPS_OPTIONS.map(n => ({ value: n, label: String(n) })), this.solo.laps, v => {
        this.solo.laps = v;
        localStorage.setItem('tk_laps', String(v));
        render();
      });
      this.optRow(box, 'Rivales bot', [0, 1, 2, 3, 4, 5, 6, 7].map(n => ({ value: n, label: String(n) })), this.solo.bots, v => {
        this.solo.bots = v;
        localStorage.setItem('tk_bots', String(v));
        render();
      });
    };
    render();
    this.renderSolo = render;
  }

  wire() {
    const click = () => this.cbs.onClick && this.cbs.onClick();
    byId('btnSolo').addEventListener('click', () => this.cbs.onSolo({ ...this.solo, ...this.profile() }));
    byId('btnCreate').addEventListener('click', () => this.cbs.onCreate({ ...this.profile(), settings: { ...this.solo } }));
    byId('btnJoin').addEventListener('click', () => {
      const code = (byId('inpCode').value || '').trim().toUpperCase();
      if (code.length !== 4) return this.setMenuHint('Escribe un código de 4 letras');
      this.cbs.onJoin({ ...this.profile(), room: code });
    });
    byId('inpCode').addEventListener('input', e => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
    byId('inpCode').addEventListener('keydown', e => {
      if (e.key === 'Enter') byId('btnJoin').click();
    });
    byId('btnReady').addEventListener('click', () => this.cbs.onReady(!this.myReady));
    byId('btnStart').addEventListener('click', () => this.cbs.onStart());
    byId('btnLeave').addEventListener('click', () => this.cbs.onLeave());
    byId('btnCopy').addEventListener('click', () => this.copyLink());
    byId('btnAgain').addEventListener('click', () => this.cbs.onAgain());
    byId('btnToLobby').addEventListener('click', () => this.cbs.onToLobby());
    byId('btnMenu').addEventListener('click', () => this.cbs.onMenu());
    byId('btnHelp').addEventListener('click', () => {
      byId('help').classList.remove('hidden');
    });
    byId('btnHelpClose').addEventListener('click', () => {
      byId('help').classList.add('hidden');
    });
    for (const b of document.querySelectorAll('button')) b.addEventListener('click', click);
  }

  copyLink() {
    const code = this.room ? this.room.code : '';
    const url = location.origin + '/?room=' + code;
    const done = () => {
      byId('btnCopy').textContent = '¡Enlace copiado!';
      setTimeout(() => (byId('btnCopy').textContent = 'Copiar enlace de invitación'), 1800);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done).catch(done);
    else done();
  }

  setMenuHint(t) {
    byId('menuHint').textContent = t || '';
  }

  setLobbyHint(t) {
    byId('lobbyHint').textContent = t || '';
  }

  showMenu() {
    byId('menu').classList.remove('hidden');
    byId('lobby').classList.add('hidden');
    byId('results').classList.add('hidden');
    byId('touch').classList.add('hidden');
  }

  showLobby() {
    byId('menu').classList.add('hidden');
    byId('lobby').classList.remove('hidden');
    byId('results').classList.add('hidden');
    byId('touch').classList.add('hidden');
  }

  showResults() {
    byId('menu').classList.add('hidden');
    byId('lobby').classList.add('hidden');
    byId('results').classList.remove('hidden');
    byId('touch').classList.add('hidden');
  }

  hideOverlays() {
    byId('menu').classList.add('hidden');
    byId('lobby').classList.add('hidden');
    byId('results').classList.add('hidden');
    byId('touch').classList.toggle('hidden', !('ontouchstart' in window));
  }

  setRoom(room, myId) {
    this.room = room;
    this.myId = myId;
    const isHost = room.hostId === myId;
    this.isHost = isHost;
    byId('roomCode').textContent = room.code;
    const list = byId('lobbyPlayers');
    list.innerHTML = '';
    for (const p of room.players) {
      const row = document.createElement('div');
      row.className = 'prow';
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = hex(charById(p.charId).color);
      const nm = document.createElement('span');
      nm.className = 'pn';
      nm.textContent = p.name;
      row.appendChild(dot);
      row.appendChild(nm);
      const tags = [];
      if (p.id === myId) tags.push(['you', 'Tú']);
      if (p.id === room.hostId) tags.push(['host', 'Anfitrión']);
      if (p.ready) tags.push(['ready', 'Listo']);
      for (const [cls, txt] of tags) {
        const pill = document.createElement('span');
        pill.className = 'tagpill ' + cls;
        pill.textContent = txt;
        row.appendChild(pill);
      }
      list.appendChild(row);
      if (p.id === myId) this.myReady = p.ready;
    }
    const total = room.players.length + room.botCount;
    const info = document.createElement('p');
    info.className = 'hint';
    info.style.color = 'var(--dim)';
    info.textContent = `${room.players.length} jugador(es) + ${room.botCount} bot(s) = ${total}/8 en pista`;
    list.appendChild(info);

    const set = byId('lobbySettings');
    set.innerHTML = '';
    const trackLabel = TRACKS.find(t => t.id === room.trackId);
    if (isHost) {
      const render = () => {
        set.innerHTML = '';
        this.optRow(set, 'Pista', TRACKS.map(t => ({ value: t.id, label: t.name })), room.trackId, v => {
          room.trackId = v;
          this.cbs.onSettings({ trackId: v, laps: room.laps, bots: room.botCount });
          render();
        });
        this.optRow(set, 'Vueltas', LAPS_OPTIONS.map(n => ({ value: n, label: String(n) })), room.laps, v => {
          room.laps = v;
          this.cbs.onSettings({ trackId: room.trackId, laps: v, bots: room.botCount });
          render();
        });
        this.optRow(set, 'Bots', [0, 1, 2, 3, 4, 5, 6, 7].map(n => ({ value: n, label: String(n) })), room.botCount, v => {
          room.botCount = v;
          this.cbs.onSettings({ trackId: room.trackId, laps: room.laps, bots: v });
          render();
        });
      };
      render();
    } else {
      const p = document.createElement('div');
      p.className = 'hint';
      p.style.color = 'var(--text)';
      p.style.fontSize = '15px';
      p.textContent = `${trackLabel.name} · ${room.laps} vuelta(s) · ${room.botCount} bots`;
      set.appendChild(p);
    }

    byId('btnStart').classList.toggle('hidden', !isHost);
    byId('btnReady').textContent = this.myReady ? 'Quitar listo' : 'Estoy listo';
    for (const el of document.querySelectorAll('.host-only')) el.classList.toggle('hidden', !isHost);
    byId('btnStart').classList.toggle('hidden', !isHost);
    byId('lobbyHint').textContent = isHost
      ? 'Comparte el enlace o el código. Cuando todos estén listos, pulsa Iniciar carrera.'
      : 'Esperando a que el anfitrión inicie la carrera...';
    this.showLobby();
  }

  setResults(list, myId, isHost) {
    const table = byId('resTable');
    table.innerHTML = '';
    const head = document.createElement('tr');
    for (const h of ['#', 'Piloto', 'Tiempo']) {
      const th = document.createElement('th');
      th.textContent = h;
      head.appendChild(th);
    }
    table.appendChild(head);
    for (const e of list) {
      const tr = document.createElement('tr');
      if (e.id === myId) tr.className = 'me';
      const td1 = document.createElement('td');
      td1.className = 'medal';
      td1.textContent = e.place;
      const td2 = document.createElement('td');
      const dot = document.createElement('span');
      dot.style.cssText = `display:inline-block;width:11px;height:11px;border-radius:50%;margin-right:8px;background:${hex(charById(e.charId).color)}`;
      td2.appendChild(dot);
      td2.appendChild(document.createTextNode(e.name + (e.bot ? ' (bot)' : '') + (e.id === myId ? ' — tú' : '')));
      const td3 = document.createElement('td');
      td3.textContent = e.finished ? fmtTime(e.time) : 'Sin terminar';
      tr.appendChild(td1);
      tr.appendChild(td2);
      tr.appendChild(td3);
      table.appendChild(tr);
    }
    for (const el of document.querySelectorAll('.host-only')) el.classList.toggle('hidden', !isHost);
    byId('resHint').textContent = isHost ? 'Puedes repetir la carrera o volver a la sala.' : 'Esperando al anfitrión...';
    this.showResults();
  }
}
