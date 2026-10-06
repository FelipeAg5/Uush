/* ¡Uush! — app de seguimiento (un solo delegado maneja el celular).
   No guarda historial: la partida en curso solo sobrevive a una recarga accidental
   (sessionStorage) y se borra al cerrar la pestaña o al empezar una nueva. */
(function () {
'use strict';

// ---------------------------------------------------------------- datos
const CARDS = {};
(window.UUSH_CARDS || []).forEach(([n, cat, lvl, text]) => { CARDS[n] = { n, cat, lvl, text }; });
const MAX_CARD = Math.max(...Object.keys(CARDS).map(Number));
const COLORS = ['#E8A33D', '#4FA3C7', '#7BC47F', '#D9789B', '#B39DDB', '#F28B6C', '#5FC4B8', '#E3D26F', '#9FB4C7', '#C98F5A'];
const LEVEL_NAME = { 1: 'tranquilo', 2: 'moderado', 3: 'subido de tono' };
const MAX_POWER = 2;

const POWERS = {
  abogado:  { name: 'Abogado del diablo', when: 'Después del ¡Uush!', stage: 'post', target: 'any',
              help: t => `${t || 'El jugador que escojas'} debe defender la postura contraria a la que votó en esta ronda.` },
  adivina:  { name: 'Adivina', when: 'Antes del ¡Uush!', stage: 'pre',
              help: () => 'Antes de revelar, cada uno dirá cuántos votaron A FAVOR. Quien acierte gana una carta de poder.' },
  revancha: { name: 'Revancha', when: 'Al final del debate', stage: 'post',
              help: () => 'Todos vuelven a votar desde cero. Cuenta el segundo voto.' },
  veto:     { name: 'Veto', when: 'Justo después de leer', stage: 'card',
              help: () => 'Se descarta esta carta y se lee otra. La ronda no cuenta.' },
  yusted:   { name: '¿Y usted qué?', when: 'Al empezar el debate', stage: 'post', target: 'any',
              help: t => `${t || 'El jugador que escojas'} habla primero: un minuto sin que nadie lo interrumpa.` },
  silencio: { name: 'Silencio', when: 'Al empezar el debate', stage: 'post', target: 'any',
              help: t => `${t || 'El jugador que escojas'} no puede hablar en el debate de esta ronda. Solo vota.` },
  ultima:   { name: 'Última palabra', when: 'Al final del debate', stage: 'post',
              help: () => 'Cierras tú el debate y nadie te puede responder.' },
  doble:    { name: 'Voto doble', when: 'Antes del ¡Uush!', stage: 'pre',
              help: () => 'Tu voto cuenta por dos al calcular la mayoría de esta ronda.' },
  fichaje:  { name: 'Fichaje', when: 'Durante el debate', stage: 'post', target: 'opposite',
              help: t => `Tienes 30 segundos para convencer a ${t || 'alguien del bando contrario'}. Si se pasa, cuenta como convencer.` },
  robo:     { name: 'Robo', when: 'En tu turno', stage: 'any', target: 'haspower',
              help: t => `Le quitas una carta de poder a ${t || 'otro jugador'}.` }
};
const POWER_ORDER = ['abogado', 'adivina', 'revancha', 'veto', 'yusted', 'silencio', 'ultima', 'doble', 'fichaje', 'robo'];

// ---------------------------------------------------------------- estado
const KEY = 'uush-partida';
let S = load() || fresh();
function fresh() {
  return { phase: 'home', mode: 'grupo', players: [], levels: [1, 2, 3], delegate: null, predict: false,
           rounds: [], cur: null, undo: [], sheet: null, modal: null, seq: 1 };
}
function load() { try { const s = JSON.parse(sessionStorage.getItem(KEY)); return s && s.phase && s.phase !== 'home' ? s : null; } catch (e) { return null; } }
function save() { try { if (S.phase === 'home') sessionStorage.removeItem(KEY); else sessionStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

const inGame = () => ['card', 'vote', 'result', 'summary'].includes(S.phase);
const P = id => S.players.find(p => p.id === id);
const nm = id => (P(id) || {}).name || '¿?';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const opp = v => (v === 'f' ? 'c' : 'f');
const vName = v => (v === 'f' ? 'A FAVOR' : 'EN CONTRA');

// ---------------------------------------------------------------- iconos
const ICON = {
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5l5 5L20 6" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  talk: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v10H9l-5 4z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>',
  swap: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16M7 4L3 8M7 4l4 4M17 20V4M17 20l-4-4M17 20l4-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a3 3 0 013 3v6a3 3 0 01-6 0V6a3 3 0 013-3zM6 11a6 6 0 0012 0M12 17v4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="#C9A15A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};
const gavel = w => `<svg viewBox="0 0 220 140" width="${w}" height="${Math.round(w * 140 / 220)}" aria-hidden="true">
<rect x="6" y="112" width="128" height="11" rx="2.5" fill="#C9A15A"/><rect x="0" y="124" width="140" height="13" rx="2.5" fill="#F4EAD5"/>
<g transform="rotate(-42 100 58)"><rect x="93" y="70" width="14" height="88" rx="7" fill="#C9A15A"/><rect x="58" y="36" width="84" height="44" rx="5" fill="#F4EAD5"/>
<rect x="58" y="36" width="84" height="12" rx="5" fill="#fff" opacity=".35"/><rect x="48" y="29" width="15" height="58" rx="5" fill="#C9A15A"/>
<rect x="137" y="29" width="15" height="58" rx="5" fill="#C9A15A"/><rect x="96" y="36" width="8" height="44" fill="#3A0710" opacity=".18"/></g></svg>`;
const catImg = (lvl, size) => lvl ? `<span class="cat n${lvl}" style="width:${size}px;height:${size}px"><img src="img/gato${lvl}.png" alt="Nivel ${lvl}"></span>` : '';
const avatar = (id, sm) => { const p = P(id) || { name: '?', color: '#999' }; return `<span class="avatar${sm ? ' sm' : ''}" style="background:${p.color}" aria-hidden="true">${esc(p.name.trim()[0] || '?').toUpperCase()}</span>`; };
const bang = '<span class="bang">!</span>';

// ---------------------------------------------------------------- lógica de rondas
function newRound() { return { id: S.seq++, n: null, blankText: '', blankLvl: 0, vetoed: false, votes: {}, votes1: null, changes: {}, best: null,
  uses: [], double: null, adivina: null, preds: {}, first: null, silenced: null, devil: null, last: null, fichaje: null, ended: false }; }
const cardOf = r => (r && r.n ? CARDS[r.n] : null);
const cardText = r => { const c = cardOf(r); return c ? (c.lvl === 0 ? (r.blankText || 'Carta en blanco') : c.text) : ''; };
const cardLvl = r => { const c = cardOf(r); return c ? (c.lvl || r.blankLvl || 0) : 0; };
const finalVote = (r, id) => (r.changes[id] ? opp(r.votes[id]) : r.votes[id]);
const allRounds = () => S.rounds.concat(S.cur && S.cur.n ? [S.cur] : []);
const playedRounds = () => S.rounds.filter(r => !r.vetoed && Object.keys(r.votes).length);

function tally(r) {
  let f = 0, c = 0, nf = 0, nc = 0;
  S.players.forEach(p => { const v = finalVote(r, p.id); if (!v) return; const w = r.double === p.id ? 2 : 1;
    if (v === 'f') { f += w; nf++; } else { c += w; nc++; } });
  return { f, c, nf, nc };
}
function verdict(r) {
  const t = tally(r), ids = S.players.map(p => p.id);
  const favor = ids.filter(id => finalVote(r, id) === 'f'), contra = ids.filter(id => finalVote(r, id) === 'c');
  if (S.mode === 'pareja') return { key: favor.length === 2 || contra.length === 2 ? 'agree' : 'disagree', t, favor, contra, minority: [] };
  if (!contra.length) return { key: 'allf', t, favor, contra, minority: [] };
  if (!favor.length) return { key: 'allc', t, favor, contra, minority: [] };
  if (favor.length === 1 && ids.length >= 3) return { key: 'alone', t, favor, contra, minority: favor };
  if (contra.length === 1 && ids.length >= 3) return { key: 'alone', t, favor, contra, minority: contra };
  if (t.f === t.c) return { key: 'tie', t, favor, contra, minority: [] };
  return t.f > t.c ? { key: 'majf', t, favor, contra, minority: contra } : { key: 'majc', t, favor, contra, minority: favor };
}
const VERDICT = {
  allf: { suit: 'check', big: 'TODOS A FAVOR', sub: () => 'Ni un solo valiente en contra.' },
  allc: { suit: 'x', big: 'TODOS EN CONTRA', sub: () => 'La mesa entera dijo que no.' },
  tie:  { suit: 'q', big: 'MESA PARTIDA', sub: () => 'Empate perfecto: aquí hay debate para rato.' },
  alone:{ suit: 'bang', big: 'UNO CONTRA TODOS', sub: v => `${nm(v.minority[0])} se quedó sin compañía. Toca defenderse.` },
  majf: { suit: 'check', big: 'GANA A FAVOR', sub: () => 'Pero la minoría tiene la palabra.' },
  majc: { suit: 'x', big: 'GANA EN CONTRA', sub: () => 'Pero la minoría tiene la palabra.' },
  agree:{ suit: 'check', big: 'PIENSAN IGUAL', sub: () => 'En esta están en la misma página.' },
  disagree: { suit: 'bang', big: 'NO COINCIDEN', sub: () => 'Que empiece la discusión.' }
};
function speaksFirst(r, v) {
  if (r.first) return `${nm(r.first)} (¿Y usted qué?)`;
  if (v.key === 'allf' || v.key === 'allc') return 'Nadie en contra: si alguien quiere, que haga de abogado del diablo';
  if (S.mode === 'pareja') return v.key === 'agree' ? 'Coinciden: cuenten por qué piensan así' : 'Empieza quien votó EN CONTRA';
  if (v.key === 'alone') return `${nm(v.minority[0])} (está en minoría)`;
  if (v.key === 'tie') return 'El bando EN CONTRA (empate)';
  return `El bando ${v.key === 'majf' ? 'EN CONTRA' : 'A FAVOR'} (minoría)`;
}

// cartas de poder: se calculan repasando la partida, así cualquier corrección queda bien.
function awardsOf(r) {
  if (r.vetoed) return [];
  const out = [];
  const conv = [...new Set(Object.values(r.changes).map(c => c.by).filter(Boolean))];
  conv.forEach(id => out.push({ id, why: 'convencer' }));
  if (S.mode === 'grupo' && r.best) out.push({ id: r.best, why: 'mejor defensa' });
  if (r.adivina && r.adivina.done) adivinaWinners(r).forEach(id => out.push({ id, why: 'adivinar' }));
  return out;
}
function adivinaWinners(r) { const real = S.players.filter(p => r.votes1 ? r.votes1[p.id] === 'f' : r.votes[p.id] === 'f').length;
  return Object.entries(r.adivina.guesses || {}).filter(([, g]) => g === real).map(([id]) => id); }
function powerState(includeCurGains) {
  const cnt = {}, gained = {}, used = {}; S.players.forEach(p => { cnt[p.id] = 0; gained[p.id] = 0; used[p.id] = 0; });
  const list = S.rounds.slice(); if (S.cur) list.push(S.cur);
  list.forEach(r => {
    r.uses.forEach(u => { cnt[u.pid] = Math.max(0, cnt[u.pid] - 1); used[u.pid]++;
      if (u.power === 'robo' && u.target && cnt[u.target] > 0) { cnt[u.target]--; cnt[u.pid] = Math.min(MAX_POWER, cnt[u.pid] + 1); } });
    if (r === S.cur && !includeCurGains) return;
    awardsOf(r).forEach(a => { if (cnt[a.id] === undefined) return; gained[a.id]++; cnt[a.id] = Math.min(MAX_POWER, cnt[a.id] + 1); });
  });
  return { cnt, gained, used };
}
const powerTotal = () => Object.values(powerState(true).cnt).reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------- render
const $app = document.getElementById('app');
const $sheet = document.getElementById('sheet-root');
let lastView = '';
function render() {
  save();
  const view = S.phase + ':' + (S.cur ? S.cur.id + ':' + (S.cur.votes1 ? 2 : 1) : '') + ':' + (S.sheet ? S.sheet.type : '') + ':' + (S.modal ? S.modal.type : '');
  const animate = view !== lastView; lastView = view;
  const fn = { home: vHome, setup: vSetup, card: vCard, vote: vVote, result: vResult, summary: vSummary }[S.phase];
  $app.innerHTML = fn();
  $sheet.innerHTML = S.modal ? vModal() : (S.sheet ? vSheet() : '');
  if (!animate) document.querySelectorAll('.pop').forEach(e => e.classList.remove('pop'));
  afterRender();
}
function afterRender() {
  if (S.phase === 'card') { const i = document.getElementById('cardnum'); if (i && !S.sheet && !S.modal && !S.cur.n) i.focus({ preventScroll: true }); updateCardInfo(); }
}
function topbar(title, opts = {}) {
  const left = opts.menu ? `<button class="iconbtn" data-a="menu" aria-label="Menú">${ICON.menu}</button>`
                         : `<button class="iconbtn" data-a="${opts.back || 'back'}" aria-label="Atrás">${ICON.back}</button>`;
  const right = opts.power ? `<button class="powerpill" data-a="powers-view" aria-label="Cartas de poder en juego">${bang}${powerTotal()}</button>` : '';
  return `<div class="topbar">${left}<h1>${title}</h1><div class="topright">${right}</div></div>`;
}
const suitIcon = (s, size) => s === 'check' || s === 'x' ? `<span style="display:inline-block;width:${size}px;height:${size}px;color:inherit">${ICON[s]}</span>`
  : `<span class="suit-txt" style="font-size:${size * 1.05}px;line-height:${size}px">${s === 'bang' ? '!' : '?'}</span>`;

function vHome() {
  return `<div class="home">${gavel(190)}<div class="logo-word">¡Uush!</div>
  <p>Lean, voten en silencio y que empiece el debate.</p>
  <div class="suits" aria-hidden="true">${suitIcon('check', 26)}${suitIcon('bang', 26)}${suitIcon('q', 26)}${suitIcon('x', 26)}</div></div>
  <div class="screen" style="flex:none"><div class="foot">
  <button class="btn" data-a="new">Nueva partida</button>
  <button class="btn ghost" data-a="rules">Cómo se juega</button>
  <p class="note center" style="margin:4px 0 0">No se guarda nada: cada partida empieza de cero.</p></div></div>`;
}

function vSetup() {
  const pareja = S.mode === 'pareja';
  const list = S.players.map(p => `<div class="player">${avatar(p.id)}<span class="name">${esc(p.name)}</span>
    ${S.delegate === p.id ? '<span class="tag">DELEGADO</span>' : `<button class="chipbtn" data-a="delegate" data-v="${p.id}">Delegado</button>`}
    <button class="iconbtn" style="width:36px;height:36px;border:none" data-a="rmplayer" data-v="${p.id}" aria-label="Quitar a ${esc(p.name)}">${ICON.x}</button></div>`).join('');
  const full = pareja ? S.players.length >= 2 : S.players.length >= 10;
  const need = pareja ? 2 : 3;
  const ok = (pareja ? S.players.length === 2 : S.players.length >= 3) && S.levels.length && S.delegate;
  const why = S.players.length < need ? `Faltan ${need - S.players.length} jugador${need - S.players.length > 1 ? 'es' : ''}` :
    (pareja && S.players.length > 2 ? 'En pareja son exactamente 2' : (!S.levels.length ? 'Elige al menos un nivel' : (!S.delegate ? 'Marca quién es el delegado' : '')));
  return `<div class="screen">${topbar('Nueva partida', { back: 'home' })}<div class="scroll">
  <div><p class="label">Modo</p><div class="seg" role="group" aria-label="Modo de juego">
    <button data-a="mode" data-v="pareja" aria-pressed="${pareja}">En pareja</button>
    <button data-a="mode" data-v="grupo" aria-pressed="${!pareja}">En grupo</button></div></div>
  <div><p class="label">Jugadores · ${S.players.length}${pareja ? ' de 2' : ' (3 a 10)'}</p><div class="col" style="gap:8px">${list}
    ${full ? '' : `<form class="addrow" data-form="add"><label for="pname" class="sr" style="position:absolute;width:1px;height:1px;overflow:hidden">Nombre del jugador</label>
    <input id="pname" maxlength="14" placeholder="Nombre del jugador" autocomplete="off" enterkeyhint="done">
    <button class="addbtn" type="submit" aria-label="Agregar jugador">+</button></form>`}</div></div>
  <div><p class="label">Niveles en juego</p><div class="levels">${[1, 2, 3].map(n => `<button class="lvl" data-a="level" data-v="${n}" aria-pressed="${S.levels.includes(n)}">
    ${catImg(n, 46)}<b>Nivel ${n}</b><small>${LEVEL_NAME[n]}</small></button>`).join('')}</div></div>
  ${pareja ? `<div class="switch"><div><b>Variante de predicción</b><div class="note">Antes del ¡Uush!, cada uno dice qué votará el otro.</div></div>
    <button data-a="predict" aria-pressed="${S.predict}" aria-label="Variante de predicción"></button></div>` : ''}
  </div><div class="foot">${why ? `<p class="note center" style="margin:0">${why}</p>` : ''}
  <button class="btn" data-a="start" ${ok ? '' : 'disabled'}>Empezar ¡Uush!</button></div></div>`;
}

function roundNo() { return S.rounds.filter(r => !r.vetoed).length + 1; }
function vCard() {
  const r = S.cur;
  return `<div class="screen wide">${topbar('Ronda ' + roundNo(), { menu: true, power: true })}<div class="scroll">
  <div class="col"><div><p class="label">¿Qué carta leyeron?</p>
  <div class="numbox"><input id="cardnum" inputmode="numeric" pattern="[0-9]*" maxlength="3" placeholder="—" aria-label="Número de carta" value="${r.n || ''}"></div></div>
  <div id="cardstatus" class="status"></div></div>
  <div class="col" id="cardpreview"></div></div>
  <div class="foot"><div class="row"><button class="btn ghost" data-a="power" id="b-power">Usar carta de poder</button></div>
  <button class="btn" data-a="tovote" id="b-vote" disabled>Registrar votos</button></div></div>`;
}
function cardCheck(n) {
  if (!n) return { kind: 'none' };
  const c = CARDS[n];
  if (!c) return { kind: 'err', msg: `La carta ${n} no existe (van de 1 a ${MAX_CARD}).` };
  const prev = S.rounds.find(r => r.n === n);
  if (prev) return { kind: 'err', msg: `Esa carta ya salió en esta partida${prev.vetoed ? ' (la vetaron)' : ''}. Lean otra.` };
  if (c.lvl && !S.levels.includes(c.lvl)) return { kind: 'warn', msg: `Ojo: es de nivel ${c.lvl} y ese nivel no está en juego. Pueden usarla igual.` };
  if (!c.lvl) return { kind: 'warn', msg: 'Carta en blanco: escriban la afirmación para que quede registrada.' };
  return { kind: 'ok', msg: 'Carta disponible.' };
}
function cardPreview(r, editable) {
  const c = cardOf(r); if (!c) return '';
  const lvl = cardLvl(r);
  const blank = c.lvl === 0;
  return `<div class="card pop"><div class="head"><span class="meta">${esc(c.cat)} · Nº ${c.n}</span>
    <span class="lv">${lvl ? 'NIVEL ' + lvl + ' ' + catImg(lvl, 30) : ''}</span></div>
    ${blank && editable ? `<textarea id="blanktext" maxlength="140" placeholder="Escriban aquí la afirmación…" aria-label="Afirmación de la carta en blanco">${esc(r.blankText)}</textarea>
      <div class="levels" style="margin-top:10px;position:relative">${[1, 2, 3].map(n => `<button class="lvl" data-a="blanklvl" data-v="${n}" aria-pressed="${r.blankLvl === n}" style="padding:6px 4px">${catImg(n, 30)}<b>Nivel ${n}</b></button>`).join('')}</div>`
      : `<div class="txt">${esc(cardText(r))}</div>`}</div>`;
}
function updateCardInfo() {
  const r = S.cur, chk = cardCheck(r.n);
  const st = document.getElementById('cardstatus'), pv = document.getElementById('cardpreview'), bv = document.getElementById('b-vote');
  if (!st) return;
  st.className = 'status ' + (chk.kind === 'ok' ? 'ok' : chk.kind === 'warn' ? 'warn' : chk.kind === 'err' ? 'err' : '');
  st.innerHTML = chk.msg ? `${chk.kind === 'ok' ? `<span style="width:18px;height:18px;display:inline-block">${ICON.check}</span>` : ''}<span>${esc(chk.msg)}</span>` : '';
  const valid = chk.kind === 'ok' || chk.kind === 'warn';
  const want = valid ? r.n : null;
  if (pv.dataset.n !== String(want)) { pv.dataset.n = String(want); pv.innerHTML = valid ? cardPreview(r, true) +
    `<div class="panel note" style="margin-top:12px">Lean la carta en voz alta. Nadie comenta: cada uno decide en silencio y pone la paleta contra el pecho.</div>` : ''; }
  const blankOk = !valid || CARDS[r.n].lvl !== 0 || (r.blankText.trim().length > 3);
  bv.disabled = !(valid && blankOk);
}

function voteBtns(id, cur, kind) {
  const a = kind === 'pred' ? 'pred' : 'vote';
  return `<div class="vbtns"><button class="vbtn f" data-a="${a}" data-p="${id}" data-v="f" aria-pressed="${cur === 'f'}">${ICON.check} A FAVOR</button>
  <button class="vbtn c" data-a="${a}" data-p="${id}" data-v="c" aria-pressed="${cur === 'c'}">${ICON.x} EN CONTRA</button></div>`;
}
function vVote() {
  const r = S.cur, missing = S.players.filter(p => !r.votes[p.id]).length;
  const predOn = S.mode === 'pareja' && S.predict;
  const predMissing = predOn ? S.players.filter(p => !r.preds[p.id]).length : 0;
  const rows = S.players.map(p => `<div class="vote"><div class="who">${avatar(p.id, true)}<span>${esc(p.name)}</span><span class="badges">
    ${r.double === p.id ? '<span class="badge">VOTO DOBLE</span>' : ''}</span></div>${voteBtns(p.id, r.votes[p.id])}</div>`).join('');
  const preds = predOn ? `<div><p class="label">Predicción · ¿qué votará el otro?</p><div class="col" style="gap:8px">${S.players.map(p => {
    const other = S.players.find(o => o.id !== p.id);
    return `<div class="vote"><div class="who">${avatar(p.id, true)}<span>${esc(p.name)} cree que ${esc(other.name)} votará…</span></div>${voteBtns(p.id, r.preds[p.id], 'pred')}</div>`; }).join('')}</div></div>` : '';
  const left = missing + predMissing;
  return `<div class="screen wide">${topbar('Ronda ' + roundNo(), { back: 'tocard', power: true })}<div class="scroll">
  <div class="col"><div class="mini">${catImg(cardLvl(r), 34)}<div><b>Nº ${r.n}</b> · ${esc(cardText(r))}</div></div>
  ${r.votes1 ? '<div class="panel note"><b style="color:var(--oro)">Revancha:</b> voten de nuevo desde cero. Cuenta este segundo voto.</div>' : ''}
  ${r.adivina && !r.adivina.done ? `<div class="panel note"><b style="color:var(--oro)">Adivina</b> (la jugó ${esc(nm(r.adivina.by))}): al revelar, cada uno dirá cuántos votaron A FAVOR.</div>` : ''}
  ${preds}</div>
  <div class="col"><div class="allbtns"><button class="a af" data-a="voteall" data-v="f">Todos a favor</button><button class="a ac" data-a="voteall" data-v="c">Todos en contra</button>
  <button class="iconbtn" data-a="undo" aria-label="Deshacer" ${S.undo.length ? '' : 'disabled style="opacity:.4"'}>${ICON.undo}</button></div>${rows}</div></div>
  <div class="foot"><p class="note center" style="margin:0">${left ? `Falta${left > 1 ? 'n' : ''} ${left} ${left > 1 ? 'respuestas' : 'respuesta'}` : 'Todos votaron'}</p>
  <div class="row"><button class="btn ghost" data-a="power">Usar carta de poder</button></div>
  <button class="btn" data-a="reveal" ${left ? 'disabled' : ''}>¡Uush! Revelar</button></div></div>`;
}

function vResult() {
  const r = S.cur, v = verdict(r), V = VERDICT[v.key];
  const rows = S.players.map(p => {
    const ch = r.changes[p.id], fv = finalVote(r, p.id), isMin = v.minority.includes(p.id) && v.minority.length === 1;
    const old = ch ? `<span class="vt ${r.votes[p.id]} old">${vName(r.votes[p.id])}</span>${ICON.arrow}` : '';
    const flags = [isMin ? 'SOLO' : '', r.best === p.id ? 'MEJOR DEFENSA' : '', r.double === p.id ? 'VOTO DOBLE' : '', r.silenced === p.id ? 'EN SILENCIO' : '',
      r.devil === p.id ? 'ABOGADO DEL DIABLO' : '', ch && ch.by ? 'LO CONVENCIÓ ' + nm(ch.by).toUpperCase() : ''].filter(Boolean);
    return `<div class="res">${avatar(p.id, true)}<span class="name">${esc(p.name)}${flags.length ? `<br><span class="flag">${esc(flags.join(' · '))}</span>` : ''}</span>${old}<span class="vt ${fv}">${vName(fv)}</span></div>`;
  }).join('');
  const notes = [];
  if (r.first) notes.push(`<b>¿Y usted qué?</b> ${esc(nm(r.first))} habla primero, un minuto sin interrupciones.`);
  if (r.silenced) notes.push(`<b>Silencio:</b> ${esc(nm(r.silenced))} no puede hablar en este debate.`);
  if (r.devil) notes.push(`<b>Abogado del diablo:</b> ${esc(nm(r.devil))} defiende la postura contraria a la que votó.`);
  if (r.fichaje) notes.push(`<b>Fichaje:</b> ${esc(nm(r.fichaje.by))} tiene 30 segundos para convencer a ${esc(nm(r.fichaje.target))}.`);
  if (r.last) notes.push(`<b>Última palabra:</b> ${esc(nm(r.last))} cierra el debate y nadie le responde.`);
  if (r.adivina && r.adivina.done) { const w = adivinaWinners(r); notes.push(`<b>Adivina:</b> ${w.length ? esc(w.map(nm).join(', ')) + ' acertó y gana una carta de poder.' : 'nadie acertó.'}`); }
  if (S.mode === 'pareja' && S.predict) notes.push(S.players.map(p => { const o = S.players.find(x => x.id !== p.id);
    return `${esc(p.name)} ${r.preds[p.id] === r.votes[o.id] ? 'acertó' : 'falló'} su predicción`; }).join(' · '));
  return `<div class="screen wide">${topbar('Ronda ' + roundNo(), { back: 'tovote2', power: true })}<div class="scroll">
  <div class="col"><div class="verdict pop"><div style="display:flex;justify-content:center;color:var(--oro)">${suitIcon(V.suit, 40)}</div>
    <div class="big">${V.big}</div><div class="sub">${esc(V.sub(v))}</div>
    <div class="score"><div><div class="n" style="color:var(--verde-cl)">${v.t.f}</div><div class="lbl">A FAVOR</div></div><div class="note">vs</div>
    <div><div class="n" style="color:var(--rojo-cl)">${v.t.c}</div><div class="lbl">EN CONTRA</div></div></div></div>
  <div class="speak">${ICON.talk}<span>Habla primero: ${esc(speaksFirst(r, v))}</span></div>
  ${notes.length ? `<div class="panel note">${notes.join('<br>')}</div>` : ''}
  <div class="mini">${catImg(cardLvl(r), 30)}<div><b>Nº ${r.n}</b> · ${esc(cardText(r))}</div></div></div>
  <div class="col">${rows}<div class="row"><button class="btn ghost" data-a="changes">${ICON.swap.replace('<svg', '<svg width="18" height="18" style="vertical-align:-3px;margin-right:6px"')}Cambio de opinión</button>
  ${S.mode === 'grupo' ? `<button class="btn ghost" data-a="best">${ICON.mic.replace('<svg', '<svg width="18" height="18" style="vertical-align:-3px;margin-right:6px"')}${r.best ? esc(nm(r.best)) : 'Mejor defensa'}</button>` : ''}</div>
  <button class="btn ghost" data-a="power">Usar carta de poder</button></div></div>
  <div class="foot"><button class="btn" data-a="next">Siguiente ronda</button></div></div>`;
}

// ---------------------------------------------------------------- hojas (paneles inferiores)
function vSheet() {
  const s = S.sheet;
  const body = { power: shPower, changes: shChanges, best: shBest, adivina: shAdivina, powersView: shPowersView }[s.type]();
  return `<div class="backdrop" data-a="closesheet"><div class="sheet pop" role="dialog" aria-modal="true" data-stop>
  <div class="grab"></div>${body}</div></div>`;
}
function stageNow() { return S.phase === 'card' ? 'card' : S.phase === 'vote' ? 'pre' : 'post'; }
function powerAllowed(key) {
  const st = POWERS[key].stage, now = stageNow(), r = S.cur;
  if (key === 'veto') return now === 'card' && !!r.n && ['ok', 'warn'].includes(cardCheck(r.n).kind);
  if (st === 'any') return true;
  if (st === 'pre') return (now === 'card' && !!r.n) || now === 'pre';
  if (key === 'revancha') return now === 'post' && !r.votes1;
  return now === st;
}
function shPower() {
  const s = S.sheet, ps = powerState(false), r = S.cur;
  const usedNow = new Set(r.uses.map(u => u.pid));
  const pick = S.players.map(p => { const n = ps.cnt[p.id], dis = n < 1 || usedNow.has(p.id);
    return `<button data-a="sp-player" data-v="${p.id}" aria-pressed="${s.pid === p.id}" ${dis ? 'disabled' : ''}>${avatar(p.id, true)}<span>${esc(p.name)}</span>
    <span class="dots">${[0, 1].map(k => `<i class="${k < n ? 'on' : ''}"></i>`).join('')}</span></button>`; }).join('');
  const taken = { adivina: !!r.adivina, doble: !!r.double, yusted: !!r.first, silencio: !!r.silenced, abogado: !!r.devil, ultima: !!r.last, fichaje: !!r.fichaje };
  const grid = POWER_ORDER.map(k => { const ok = powerAllowed(k) && !taken[k];
    return `<button class="pcard" data-a="sp-power" data-v="${k}" aria-pressed="${s.power === k}" ${ok ? '' : 'disabled'}><b>${POWERS[k].name}</b><small>${POWERS[k].when}</small></button>`; }).join('');
  let targets = '';
  const def = s.power && POWERS[s.power];
  if (def && def.target && s.pid) {
    const v = S.phase === 'result' ? verdict(r) : null;
    const cand = S.players.filter(p => p.id !== s.pid && (def.target !== 'haspower' || ps.cnt[p.id] > 0) &&
      (def.target !== 'opposite' || !v || finalVote(r, p.id) !== finalVote(r, s.pid)));
    targets = `<p class="label" style="margin-top:14px">¿A quién?</p><div class="chips">${cand.length ? cand.map(p => `<button data-a="sp-target" data-v="${p.id}" aria-pressed="${s.target === p.id}">${avatar(p.id, true)}${esc(p.name)}</button>`).join('')
      : '<span class="note">No hay a quién aplicarla ahora.</span>'}</div>`;
  }
  const ready = s.pid && s.power && (!def.target || s.target);
  const explain = def ? `<div class="explain"><b>${def.name}:</b> ${esc(def.help(s.target ? nm(s.target) : null))}${s.pid && s.power === 'doble' ? ` El voto de ${esc(nm(s.pid))} contará por dos.` : ''}</div>` : '';
  const anyone = S.players.some(p => ps.cnt[p.id] > 0 && !usedNow.has(p.id));
  return `<h2><span class="suit-txt" style="color:var(--oro)">!</span>Cartas de poder</h2>
  <div class="sub">Máximo ${MAX_POWER} por jugador · una por jugador por ronda · las ganadas en esta ronda se usan desde la siguiente.</div>
  ${anyone ? `<p class="label">¿Quién la usa?</p><div class="pick">${pick}</div><p class="label">¿Cuál carta?</p><div class="pgrid">${grid}</div>${targets}${explain}
  <div class="row" style="margin-top:14px"><button class="btn ghost" style="flex:0 0 120px" data-a="closesheet">Cancelar</button>
  <button class="btn" data-a="sp-use" ${ready ? '' : 'disabled'}>${s.power ? 'Usar ' + esc(POWERS[s.power].name) : 'Usar'}</button></div>`
  : `<div class="panel note">Nadie tiene cartas de poder disponibles todavía. Se ganan con la mejor defensa o convenciendo a alguien de cambiar de bando.</div>
  <button class="btn ghost" style="margin-top:14px" data-a="closesheet">Cerrar</button>`}`;
}
function shPowersView() {
  const ps = powerState(true);
  return `<h2><span class="suit-txt" style="color:var(--oro)">!</span>Cartas de poder en la mano</h2><div class="sub">Lo que cada jugador debería tener en la mano ahora.</div>
  <div class="col" style="gap:8px">${S.players.map(p => `<div class="res">${avatar(p.id, true)}<span class="name">${esc(p.name)}</span>
  <span class="dots">${[0, 1].map(k => `<i class="${k < ps.cnt[p.id] ? 'on' : ''}"></i>`).join('')}</span></div>`).join('')}</div>
  <div class="row" style="margin-top:14px"><button class="btn ghost" data-a="closesheet">Cerrar</button>
  ${['card', 'vote', 'result'].includes(S.phase) ? '<button class="btn" data-a="power">Usar una</button>' : ''}</div>`;
}
function shChanges() {
  const s = S.sheet, r = S.cur;
  const rows = S.players.map(p => {
    const c = s.draft[p.id], v = r.votes[p.id];
    if (!c) return `<div class="chg"><div class="top">${avatar(p.id, true)}<span class="name">${esc(p.name)}</span><span class="vt ${v}">${vName(v)}</span>
      <button class="chipbtn" data-a="ch-toggle" data-v="${p.id}">Cambió</button></div></div>`;
    const others = S.players.filter(o => o.id !== p.id);
    return `<div class="chg on"><div class="top">${avatar(p.id, true)}<span class="name">${esc(p.name)}</span><span class="vt ${v} old">${vName(v)}</span>${ICON.arrow}<span class="vt ${opp(v)}">${vName(opp(v))}</span>
      <button class="iconbtn" style="width:36px;height:36px;border:none" data-a="ch-toggle" data-v="${p.id}" aria-label="Deshacer cambio de ${esc(p.name)}">${ICON.x}</button></div>
      <p class="label" style="margin:10px 0 2px">¿Quién lo convenció?</p><div class="chips">${others.map(o => `<button data-a="ch-by" data-p="${p.id}" data-v="${o.id}" aria-pressed="${c.by === o.id}">${avatar(o.id, true)}${esc(o.name)}</button>`).join('')}
      <button data-a="ch-by" data-p="${p.id}" data-v="" aria-pressed="${c.by === null}">Nadie / solo</button></div></div>`;
  }).join('');
  const tmp = Object.assign({}, r, { changes: s.draft }), v = verdict(tmp);
  const conv = [...new Set(Object.values(s.draft).map(c => c.by).filter(Boolean))];
  const missingBy = Object.values(s.draft).some(c => c.by === undefined);
  return `<h2><span style="width:26px;height:26px;color:var(--oro);display:inline-block">${ICON.swap}</span>¿Alguien cambió de opinión?</h2>
  <div class="sub">Toca «Cambió» y elige quién lo convenció.</div><div class="col" style="gap:8px">${rows}</div>
  <div class="explain">Nuevo resultado: <b>${v.t.f} a favor · ${v.t.c} en contra</b> → ${VERDICT[v.key].big.toLowerCase()}.
  ${conv.length ? '<br>Ganan carta de poder por convencer: <b>' + esc(conv.map(nm).join(', ')) + '</b> (máximo una por ronda cada uno).' : ''}</div>
  <div class="row" style="margin-top:14px"><button class="btn ghost" style="flex:0 0 120px" data-a="closesheet">Cancelar</button>
  <button class="btn" data-a="ch-save" ${missingBy ? 'disabled' : ''}>Guardar cambios</button></div>`;
}
function shBest() {
  const r = S.cur;
  return `<h2><span style="width:26px;height:26px;color:var(--oro);display:inline-block">${ICON.mic}</span>Mejor defensa</h2>
  <div class="sub">A la cuenta de tres, todos señalan. Toca al más señalado (si hay empate, decide el lector).</div>
  <div class="pick">${S.players.map(p => `<button data-a="best-pick" data-v="${p.id}" aria-pressed="${r.best === p.id}">${avatar(p.id)}<span>${esc(p.name)}</span></button>`).join('')}</div>
  <div class="row"><button class="btn ghost" data-a="best-pick" data-v="">Nadie</button><button class="btn" data-a="closesheet">Listo</button></div>`;
}
function shAdivina() {
  const s = S.sheet, n = S.players.length;
  return `<h2><span class="suit-txt" style="color:var(--oro)">!</span>Adivina</h2>
  <div class="sub">Antes de revelar: ¿cuántos votaron A FAVOR? Cada uno dice su número.</div>
  ${S.players.map(p => `<div class="guess">${avatar(p.id, true)}<span class="name">${esc(p.name)}</span><div class="step">
    <button data-a="ad-step" data-p="${p.id}" data-v="-1" aria-label="Menos">−</button><span>${s.guesses[p.id]}</span>
    <button data-a="ad-step" data-p="${p.id}" data-v="1" aria-label="Más">+</button></div></div>`).join('')}
  <p class="note">De 0 a ${n}.</p><button class="btn" data-a="ad-save">¡Uush! Revelar</button>`;
}

// ---------------------------------------------------------------- modales
function vModal() {
  const m = S.modal;
  if (m.type === 'rules') return `<div class="modal" data-a="closemodal"><div class="box" role="dialog" aria-modal="true" data-stop><h2>Cómo se juega</h2>
  <ol><li><b>Leer:</b> el lector lee el número, la categoría y la afirmación. Nadie comenta.</li>
  <li><b>Votar en secreto:</b> cada uno pone su paleta contra el pecho. No se vale «depende».</li>
  <li><b>¡Uush!:</b> a la cuenta de tres, todos gritan «¡Uush!» y levantan la paleta. El delegado registra los votos.</li>
  <li><b>Debatir:</b> empieza la minoría; si hay empate, EN CONTRA.</li>
  <li><b>Cambios de opinión:</b> quien se convenció voltea la paleta y dice quién lo convenció: esa persona gana una carta de poder.</li>
  <li><b>Mejor defensa:</b> todos señalan al que mejor argumentó; gana una carta de poder.</li></ol>
  <p>Cartas de poder: máximo 2 en la mano y una por jugador por ronda. Si una carta incomoda, se salta sin explicaciones.</p>
  <button class="btn" data-a="closemodal">Entendido</button></div></div>`;
  if (m.type === 'menu') return `<div class="modal" data-a="closemodal"><div class="box" role="dialog" aria-modal="true" data-stop><h2>Menú</h2>
  <div class="col" style="gap:10px"><button class="btn ghost" data-a="rules">Cómo se juega</button>
  <button class="btn ghost" data-a="fullscreen">${document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa (TV o PC)'}</button>
  <button class="btn ghost" data-a="end">Terminar y ver resumen</button>
  <button class="btn ghost" data-a="quit">Salir sin resumen</button>
  <button class="btn" data-a="closemodal">Seguir jugando</button></div></div></div>`;
  if (m.type === 'confirm') return `<div class="modal"><div class="box" role="alertdialog" aria-modal="true"><h2>${esc(m.title)}</h2><p>${esc(m.text)}</p>
  <div class="row" style="margin-top:14px"><button class="btn ghost" data-a="closemodal">${esc(m.no || 'Cancelar')}</button><button class="btn" data-a="confirm-yes">${esc(m.yes)}</button></div></div></div>`;
  return '';
}
let confirmFn = null;
function confirmBox(title, text, yes, fn, no) { confirmFn = fn; S.modal = { type: 'confirm', title, text, yes, no }; render(); }

let toastTimer = null;
function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200); }

// ---------------------------------------------------------------- acciones
function gainToasts(before, after) {
  const msgs = [];
  S.players.forEach(p => { if (after.gained[p.id] > before.gained[p.id]) msgs.push(before.cnt[p.id] >= MAX_POWER
    ? `${p.name} ya tiene ${MAX_POWER} cartas: devuelve una al fondo del mazo` : `${p.name} gana una carta de poder`); });
  if (msgs.length) toast(msgs.join(' · '));
}
function startRound() { S.cur = newRound(); S.undo = []; S.phase = 'card'; S.sheet = null; }
function pushUndo() { S.undo.push(JSON.stringify(S.cur.votes)); if (S.undo.length > 40) S.undo.shift(); }

const A = {
  new() { S = fresh(); S.phase = 'setup'; S.players = []; armBack(); },
  home() { S = fresh(); },
  rules() { S.modal = { type: 'rules' }; },
  closemodal() { S.modal = null; },
  'confirm-yes'() { S.modal = null; const f = confirmFn; confirmFn = null; f && f(); },
  menu() { S.modal = { type: 'menu' }; },
  mode(v) { S.mode = v; if (v === 'pareja' && S.players.length > 2) toast('En pareja son 2: quita a los demás jugadores'); },
  level(v) { v = +v; S.levels = S.levels.includes(v) ? S.levels.filter(x => x !== v) : S.levels.concat(v).sort(); },
  predict() { S.predict = !S.predict; },
  delegate(v) { S.delegate = v; },
  rmplayer(v) { S.players = S.players.filter(p => p.id !== v); if (S.delegate === v) S.delegate = S.players[0] ? S.players[0].id : null; },
  start() { startRound(); },
  back() {},
  tocard() { S.phase = 'card'; },
  tovote2() { confirmBox('¿Corregir los votos?', 'Vuelves a la votación de esta ronda. Los cambios de opinión se mantienen.', 'Corregir', () => { S.phase = 'vote'; render(); }); return false; },
  blanklvl(v) { S.cur.blankLvl = +v; },
  tovote() { const r = S.cur; if (cardOf(r).lvl === 0 && !r.blankLvl) { toast('Elijan el nivel de la carta en blanco'); return false; } S.phase = 'vote'; },
  vote(v, el) { pushUndo(); S.cur.votes[el.dataset.p] = v; },
  pred(v, el) { S.cur.preds[el.dataset.p] = v; },
  voteall(v) { pushUndo(); S.players.forEach(p => { S.cur.votes[p.id] = v; }); },
  undo() { if (S.undo.length) S.cur.votes = JSON.parse(S.undo.pop()); },
  reveal() {
    const r = S.cur;
    if (r.adivina && !r.adivina.done) { const g = {}; S.players.forEach(p => { g[p.id] = 0; }); S.sheet = { type: 'adivina', guesses: g }; return; }
    S.phase = 'result';
  },
  'ad-step'(v, el) { const g = S.sheet.guesses, id = el.dataset.p; g[id] = Math.max(0, Math.min(S.players.length, g[id] + Number(v))); },
  'ad-save'() { const before = powerState(true); S.cur.adivina.guesses = Object.assign({}, S.sheet.guesses); S.cur.adivina.done = true; S.sheet = null; S.phase = 'result'; gainToasts(before, powerState(true)); },
  power() { S.modal = null; S.sheet = { type: 'power', pid: null, power: null, target: null }; },
  'powers-view'() { S.sheet = { type: 'powersView' }; },
  'sp-player'(v) { S.sheet.pid = v; S.sheet.target = null; },
  'sp-power'(v) { S.sheet.power = v; S.sheet.target = null; },
  'sp-target'(v) { S.sheet.target = v; },
  'sp-use'() {
    const s = S.sheet, r = S.cur, key = s.power;
    r.uses.push({ pid: s.pid, power: key, target: s.target || null, stage: stageNow() });
    S.sheet = null;
    const who = nm(s.pid);
    if (key === 'veto') { r.vetoed = true; S.rounds.push(r); startRound(); toast(`${who} vetó la carta. Lean otra.`); return; }
    if (key === 'doble') r.double = s.pid;
    if (key === 'adivina') r.adivina = { by: s.pid, guesses: {}, done: false };
    if (key === 'yusted') r.first = s.target;
    if (key === 'silencio') r.silenced = s.target;
    if (key === 'abogado') r.devil = s.target;
    if (key === 'ultima') r.last = s.pid;
    if (key === 'fichaje') r.fichaje = { by: s.pid, target: s.target };
    if (key === 'revancha') { r.votes1 = r.votes; r.votes = {}; r.changes = {}; S.undo = []; S.phase = 'vote'; }
    toast(key === 'robo' ? `${who} le robó una carta de poder a ${nm(s.target)}` : `${who} usó ${POWERS[key].name}`);
  },
  changes() { const d = {}; Object.entries(S.cur.changes).forEach(([k, c]) => { d[k] = Object.assign({}, c); }); S.sheet = { type: 'changes', draft: d }; },
  'ch-toggle'(v) { const d = S.sheet.draft; if (d[v]) delete d[v]; else d[v] = { by: undefined }; },
  'ch-by'(v, el) { S.sheet.draft[el.dataset.p].by = v || null; },
  'ch-save'() { const before = powerState(true); S.cur.changes = S.sheet.draft; S.sheet = null; gainToasts(before, powerState(true)); },
  best() { S.sheet = { type: 'best' }; },
  'best-pick'(v) { const before = powerState(true); S.cur.best = v || null; gainToasts(before, powerState(true)); if (!v) S.sheet = null; },
  closesheet() { S.sheet = null; },
  next() { S.cur.ended = true; S.rounds.push(S.cur); startRound(); },
  end() {
    S.modal = null;
    if (S.phase === 'result') { S.rounds.push(S.cur); S.cur = null; }
    else { S.cur = null; }
    if (!playedRounds().length) { confirmBox('Todavía no hay rondas', 'Jueguen al menos una ronda completa para ver el resumen.', 'Seguir jugando', () => { startRound(); render(); }); return false; }
    S.phase = 'summary'; window.scrollTo(0, 0);
  },
  quit() { S.modal = null; confirmBox('¿Salir sin resumen?', 'Se borra toda la partida.', 'Salir', () => { S = fresh(); render(); }); return false; },
  fullscreen() { S.modal = null; if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => toast('Este navegador no permite pantalla completa')); },
  share() { shareImage(); return false; },
  again() { confirmBox('¿Nueva partida?', 'Se borra esta partida y su resumen.', 'Nueva partida', () => { const keep = S.players, mode = S.mode, lv = S.levels, del = S.delegate, pr = S.predict;
    S = fresh(); Object.assign(S, { phase: 'setup', players: keep, mode, levels: lv, delegate: del, predict: pr }); render(); }); return false; },
  sumhome() { confirmBox('¿Salir al inicio?', 'Se borra esta partida y su resumen.', 'Salir', () => { S = fresh(); render(); }); return false; }
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const stop = e.target.closest('[data-stop]');
  if (stop && !stop.contains(el)) return;   // clic dentro del panel: no cerrar por el fondo
  const fn = A[el.dataset.a]; if (!fn) return;
  const res = fn(el.dataset.v, el);
  if (res !== false) render();
});
document.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.dataset.form === 'add') {
    const inp = document.getElementById('pname'), name = inp.value.trim().replace(/\s+/g, ' ');
    if (!name) return;
    if (S.players.some(p => p.name.toLowerCase() === name.toLowerCase())) { toast('Ya hay un jugador con ese nombre'); return; }
    const used = S.players.map(p => p.color), color = COLORS.find(c => !used.includes(c)) || COLORS[S.players.length % COLORS.length];
    const p = { id: 'p' + (S.seq++), name, color }; S.players.push(p); if (!S.delegate) S.delegate = p.id;
    render(); const i = document.getElementById('pname'); if (i) i.focus();
  }
});
document.addEventListener('input', e => {
  if (e.target.id === 'cardnum') { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 3); S.cur.n = e.target.value ? Number(e.target.value) : null; S.cur.blankText = ''; S.cur.blankLvl = 0; save(); updateCardInfo(); }
  if (e.target.id === 'blanktext') { S.cur.blankText = e.target.value; save(); const bv = document.getElementById('b-vote'); if (bv) bv.disabled = e.target.value.trim().length <= 3; }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'cardnum') { const b = document.getElementById('b-vote'); if (b && !b.disabled) b.click(); }
  if (e.key === 'Escape' && (S.sheet || S.modal)) { S.sheet = null; S.modal = null; render(); }
});

// ---------------------------------------------------------------- protección: atrás y recarga
function armBack() { try { history.pushState({ uush: 1 }, ''); } catch (e) {} }
window.addEventListener('popstate', () => {
  if (S.phase === 'home') return;
  armBack();
  if (S.sheet || S.modal) { S.sheet = null; S.modal = null; render(); return; }
  if (S.phase === 'setup') { S = fresh(); render(); return; }
  S.modal = { type: 'menu' }; render();
});
window.addEventListener('beforeunload', e => { if (inGame() && S.phase !== 'summary') { e.preventDefault(); e.returnValue = ''; } });

// ---------------------------------------------------------------- resumen
function stats() {
  const R = playedRounds(), ids = S.players.map(p => p.id);
  const st = {}; ids.forEach(id => { st[id] = { f: 0, c: 0, alone: 0, minority: 0, withMaj: 0, changed: 0, convinced: 0, best: 0, n: 0 }; });
  R.forEach(r => {
    const v = verdict(r);
    ids.forEach(id => { const fv = finalVote(r, id); if (!fv) return; const s = st[id]; s.n++; s[fv]++;
      if (v.minority.includes(id)) { s.minority++; if (v.minority.length === 1) s.alone++; } else if (!['tie', 'agree', 'disagree'].includes(v.key)) s.withMaj++;
      if (r.changes[id]) s.changed++; });
    Object.values(r.changes).forEach(c => { if (c.by) st[c.by].convinced++; });
    if (r.best) st[r.best].best++;
  });
  const ps = powerState(true);
  ids.forEach(id => { st[id].gained = ps.gained[id]; st[id].used = ps.used[id]; });
  const pairs = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j]; let same = 0, tot = 0;
    R.forEach(r => { const x = finalVote(r, a), y = finalVote(r, b); if (x && y) { tot++; if (x === y) same++; } });
    pairs.push({ a, b, pct: tot ? Math.round(same * 100 / tot) : 0, tot });
  }
  pairs.sort((x, y) => y.pct - x.pct);
  const group = pairs.length ? Math.round(pairs.reduce((s, p) => s + p.pct, 0) / pairs.length) : 0;
  // por categoría
  const cats = {};
  R.forEach(r => { const c = cardOf(r).cat; (cats[c] = cats[c] || []).push(r); });
  return { R, st, pairs, group, cats, ids };
}
const pctF = s => (s.n ? Math.round(s.f * 100 / s.n) : 0);
function pickU(ids, key, st, min = 1) { const b = pick(ids, key, st, min); if (!b) return null; return ids.filter(id => st[id][key] === st[b][key]).length > 1 ? null : b; }
function pick(ids, key, st, min = 1) { let best = null; ids.forEach(id => { if (st[id][key] >= min && (!best || st[id][key] > st[best][key])) best = id; }); return best; }
function groupLabel(g) {
  if (g < 30) return ['Caos total', 'Casi no coincidieron en nada. El debate fue el juego.'];
  if (g < 50) return ['Mesa picante', 'Cada uno vino con su opinión y la defendió.'];
  if (g < 75) return ['Diferencias sanas', 'Piensan parecido, pero hay temas que los parten.'];
  return ['Mismo parche, misma mente', 'Coincidieron muchísimo… ¿o nadie se atrevió a llevar la contraria?'];
}
function archetype(id, X) {
  const s = X.st[id], ids = X.ids;
  if (!s.n) return ['El Observador', 'Casi no alcanzó a votar.'];
  const topBest = pick(ids, 'best', X.st), topConv = pick(ids, 'convinced', X.st), topChg = pick(ids, 'changed', X.st), topAlone = pick(ids, 'alone', X.st);
  if (id === topBest && s.best >= 2) return ['El Abogado', 'La mesa lo eligió como el mejor para argumentar.'];
  if (id === topConv && s.convinced >= 2) return ['El Encantador', 'Hizo cambiar de opinión a más de uno.'];
  if (id === topChg && s.changed >= 2) return ['La Veleta', 'Escucha, se deja convencer y cambia sin pena.'];
  if (id === topAlone && s.alone >= 2) return ['El Rebelde', 'Se quedó solo más de una vez y lo sostuvo.'];
  const f = pctF(s);
  if (f >= 70) return ['El Positivo', 'Le dijo que sí a casi todo.'];
  if (f <= 30) return ['El Desconfiado', 'Le dijo que no a casi todo.'];
  if (s.n && s.withMaj / s.n >= .8) return ['El de la Corriente', 'Casi siempre votó con la mayoría.'];
  return ['El Diplomático', 'Ni tanto que queme al santo, ni tan poco que no lo alumbre.'];
}
function logros(X) {
  const out = [], R = X.R;
  if (R.some(r => ['allf', 'allc'].includes(verdict(r).key))) out.push(['Todos de acuerdo', 'Una ronda con los votos iguales.']);
  if (R.some(r => verdict(r).key === 'tie')) out.push(['Mesa partida', 'Un empate perfecto.']);
  if (X.ids.some(id => X.st[id].alone >= 3)) out.push(['Rebelde sin causa', 'Alguien se quedó solo 3 veces o más.']);
  if (X.ids.some(id => X.st[id].changed >= 3)) out.push(['Veleta oficial', 'Alguien cambió de opinión 3 veces o más.']);
  if (X.ids.some(id => X.st[id].convinced >= 3)) out.push(['Pico de oro', 'Alguien convenció a 3 personas o más.']);
  if (R.length >= 15) out.push(['Maratón', '15 rondas o más.']);
  if (X.pairs.length > 1 && X.group < 30) out.push(['Caos total', 'Menos del 30 % de compatibilidad.']);
  if (X.pairs.some(p => p.tot >= 5 && p.pct >= 90)) out.push(['Almas gemelas', 'Un dúo coincidió en el 90 % o más.']);
  if (X.ids.some(id => X.st[id].used >= 3)) out.push(['Poder absoluto', 'Alguien usó 3 cartas de poder o más.']);
  if (S.rounds.some(r => r.vetoed)) out.push(['Censurado', 'Vetaron al menos una carta.']);
  return out;
}
function story(X) {
  const lines = [], R = X.R, q = r => `«${esc(cardText(r).replace(/\.$/, ''))}»`;
  const lonely = R.filter(r => verdict(r).key === 'alone');
  if (lonely.length) { const r = lonely[lonely.length - 1], v = verdict(r), id = v.minority[0];
    lines.push(`<b>${esc(nm(id))}</b> se quedó sin compañía votando ${vName(finalVote(r, id))} en ${q(r)}${r.best === id ? ', y aun así se llevó la mejor defensa' : ''}.`); }
  const ch = R.filter(r => Object.keys(r.changes).length).sort((a, b) => Object.keys(b.changes).length - Object.keys(a.changes).length)[0];
  if (ch) { const who = Object.keys(ch.changes), by = [...new Set(who.map(w => ch.changes[w].by).filter(Boolean))];
    lines.push(`${q(ch)} hizo cambiar de opinión a <b>${esc(who.map(nm).join(', '))}</b>${by.length ? ` gracias a ${esc(by.map(nm).join(' y '))}` : ''}.`); }
  const una = R.filter(r => ['allf', 'allc'].includes(verdict(r).key));
  if (una.length) { const r = una[0]; lines.push(`En ${q(r)} todos votaron ${verdict(r).key === 'allf' ? 'A FAVOR' : 'EN CONTRA'}: cero debate.`); }
  const tie = R.find(r => verdict(r).key === 'tie');
  if (tie) lines.push(`${q(tie)} partió la mesa exactamente por la mitad.`);
  const conv = pick(X.ids, 'convinced', X.st);
  if (conv && X.st[conv].convinced >= 2) lines.push(`<b>${esc(nm(conv))}</b> convenció a ${X.st[conv].convinced} personas en toda la partida.`);
  if (S.mode === 'pareja' && R.length) { const p = X.pairs[0]; lines.push(`Coincidieron en ${p.pct} % de las cartas.`); }
  return lines.slice(0, 4);
}
function catLines(X) {
  const out = [];
  Object.entries(X.cats).forEach(([cat, rs]) => {
    if (rs.length < 2) return;
    let best = null, bp = -1;
    X.ids.forEach(id => { let f = 0, n = 0; rs.forEach(r => { const v = finalVote(r, id); if (v) { n++; if (v === 'f') f++; } }); const p = n ? Math.round(f * 100 / n) : 0; if (p > bp) { bp = p; best = id; } });
    out.push({ cat, id: best, pct: bp, n: rs.length });
  });
  return out;
}
function pairCatInsight(X) {
  if (X.ids.length < 2) return '';
  let bestTxt = '', bestGap = -1;
  X.pairs.forEach(p => {
    const per = Object.entries(X.cats).filter(([, rs]) => rs.length >= 2).map(([cat, rs]) => {
      let s = 0, t = 0; rs.forEach(r => { const a = finalVote(r, p.a), b = finalVote(r, p.b); if (a && b) { t++; if (a === b) s++; } }); return { cat, pct: t ? s * 100 / t : 0 }; });
    if (per.length < 2) return;
    per.sort((x, y) => y.pct - x.pct); const hi = per[0], lo = per[per.length - 1];
    if (hi.pct - lo.pct > bestGap) { bestGap = hi.pct - lo.pct; bestTxt = `<b>${esc(nm(p.a))}</b> y <b>${esc(nm(p.b))}</b> piensan igual en ${esc(hi.cat)}, pero en ${esc(lo.cat)} no se ponen de acuerdo.`; }
  });
  return bestGap >= 50 ? bestTxt : '';
}
function ring(pct) { const r = 36, c = 2 * Math.PI * r;
  return `<div class="ring"><svg viewBox="0 0 84 84"><circle cx="42" cy="42" r="${r}" fill="none" stroke="rgba(244,234,213,.15)" stroke-width="8"/>
  <circle cx="42" cy="42" r="${r}" fill="none" stroke="#C9A15A" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c * pct / 100} ${c}"/></svg><span>${pct}%</span></div>`; }
function award(k, id, sub) { return id ? `<div class="award"><div class="k">${k}</div><div class="v">${avatar(id, true)}${esc(nm(id))}</div><small>${esc(sub)}</small></div>` : ''; }
function vSummary() {
  const X = stats(), [gT, gS] = groupLabel(X.group), ids = X.ids, st = X.st;
  const pareja = S.mode === 'pareja';
  const bD = pickU(ids, 'best', st), cV = pickU(ids, 'convinced', st), pW = pickU(ids, 'gained', st), pO = pickU(ids, 'alone', st) || pickU(ids, 'minority', st),
        mF = pickU(ids, 'f', st), mC = pickU(ids, 'c', st), mCh = pickU(ids, 'changed', st), vt = (() => { const cnt = {}; S.rounds.forEach(r => r.uses.forEach(u => { if (u.power === 'veto') cnt[u.pid] = (cnt[u.pid] || 0) + 1; }));
          let b = null, n = 0; Object.entries(cnt).forEach(([id, c]) => { if (c > n) { n = c; b = id; } }); return b ? [b, n] : null; })();
  const awards = [
    !pareja && award('MEJOR DEFENSA', bD, bD ? `${st[bD].best} ${st[bD].best > 1 ? 'veces' : 'vez'} la más señalada` : ''),
    award('MÁS CONVINCENTE', cV, cV ? `Convenció a ${st[cV].convinced} ${st[cV].convinced > 1 ? 'personas' : 'persona'}` : ''),
    award('MÁS PODEROSO', pW, pW ? `Ganó ${st[pW].gained} ${st[pW].gained > 1 ? 'cartas' : 'carta'} de poder` : ''),
    !pareja && award('MÁS POLÉMICO', pO, pO ? `En minoría ${st[pO].minority} ${st[pO].minority > 1 ? 'veces' : 'vez'}` : ''),
    award('MÁS A FAVOR', mF, mF ? `${pctF(st[mF])} % de sus votos` : ''),
    award('MÁS EN CONTRA', mC, mC ? `${100 - pctF(st[mC])} % de sus votos` : ''),
    award('MÁS CAMBIANTE', mCh, mCh ? `Cambió ${st[mCh].changed} ${st[mCh].changed > 1 ? 'veces' : 'vez'}` : ''),
    vt && award('EL QUE MÁS VETÓ', vt[0], `${vt[1]} ${vt[1] > 1 ? 'vetos' : 'veto'}`)
  ].filter(Boolean).join('');
  const lines = story(X), ins = pairCatInsight(X), cl = catLines(X), lg = logros(X);
  const divided = pareja ? [] : X.R.filter(r => !['allf', 'allc'].includes(verdict(r).key)).sort((a, b) => { const ta = tally(a), tb = tally(b); return Math.abs(ta.f - ta.c) - Math.abs(tb.f - tb.c); }).slice(0, 3);
  const pairBlock = pareja ? (() => { const R = X.R, [a, b] = ids;
      const agree = R.filter(r => finalVote(r, a) === finalVote(r, b)), dis = R.filter(r => finalVote(r, a) !== finalVote(r, b));
      const predTxt = S.predict ? ids.map(id => { const o = ids.find(x => x !== id); const ok = R.filter(r => r.preds[id] && r.preds[id] === r.votes[o]).length; return `${esc(nm(id))} adivinó ${ok} de ${R.length}`; }).join(' · ') : '';
      return `<div><p class="label">Coinciden en</p><ul class="list note">${agree.slice(0, 5).map(r => `<li>${esc(cardText(r))}</li>`).join('') || '<li>Ninguna carta todavía.</li>'}</ul></div>
      <div><p class="label">Para charlar con calma</p><ul class="list note">${dis.slice(0, 5).map(r => `<li>${esc(cardText(r))}</li>`).join('') || '<li>No hubo diferencias.</li>'}</ul></div>
      ${predTxt ? `<div class="panel"><p class="label">Predicción</p>${predTxt}</div>` : ''}`; })()
    : `<div><p class="label">Compatibilidad entre pares</p><div class="pairs">${X.pairs.map(p => `<div class="pair">${avatar(p.a, true)}${avatar(p.b, true)}<span>${esc(nm(p.a))} y ${esc(nm(p.b))}</span><span class="pct">${p.pct}%</span></div>`).join('')}</div></div>`;
  return `<div class="screen summary">${topbar('Resumen', { back: 'sumhome' })}<div class="scroll">
  <div class="col">
  <div class="hero pop">${ring(X.group)}<div><div class="label" style="margin:0">${pareja ? 'Compatibilidad entre los dos' : 'Compatibilidad grupal'}</div><div class="t">${esc(gT)}</div>
    <div class="note">${S.players.length} jugadores · ${X.R.length} rondas${S.rounds.some(r => r.vetoed) ? ' · ' + S.rounds.filter(r => r.vetoed).length + ' vetadas' : ''}</div><div class="note">${esc(gS)}</div></div></div>
  ${lines.length || ins ? `<div><p class="label">Lo que pasó en la mesa</p><div class="story">${lines.map(l => `<p>${l}</p>`).join('')}${ins ? `<p>${ins}</p>` : ''}</div></div>` : ''}
  <div><p class="label">Premios</p><div class="awards">${awards}</div></div>
  ${lg.length ? `<div><p class="label">Logros</p><div class="logros">${lg.map(([t, d]) => `<div class="logro"><b>${esc(t)}</b>${esc(d)}</div>`).join('')}</div></div>` : ''}
  </div><div class="col">
  <div><p class="label">Arquetipos</p><div class="col" style="gap:8px">${ids.map(id => { const [t, d] = archetype(id, X); return `<div class="arch">${avatar(id)}<div><div class="t">${esc(nm(id))} · ${esc(t)}</div><small>${esc(d)}</small></div></div>`; }).join('')}</div></div>
  ${cl.length ? `<div><p class="label">Por categoría · el más a favor</p><div class="bars">${cl.map(c => `<div class="bar"><span class="c">${esc(c.cat)}</span><span class="track"><span class="fill" style="display:block;width:${c.pct}%;background:${P(c.id).color}"></span></span><span class="r">${esc(nm(c.id))} · ${c.pct} %</span></div>`).join('')}</div></div>` : ''}
  ${pairBlock}
  ${divided.length ? `<div><p class="label">Las cartas que más dividieron</p><div class="rounds">${divided.map(r => { const t = tally(r); return `<div class="rround"><span class="num">${r.n}</span><span class="t">${esc(cardText(r))}</span><span class="sc">${t.f}–${t.c}</span></div>`; }).join('')}</div></div>` : ''}
  <div><p class="label">Ronda a ronda</p><div class="rounds">${S.rounds.map((r, i) => { if (r.vetoed) return `<div class="rround"><span class="num">${r.n}</span><span class="t" style="opacity:.6">Vetada</span></div>`;
    const t = tally(r), v = verdict(r); return `<div class="rround"><span class="num">${r.n}</span><span class="t">${esc(cardText(r))}</span><span class="sc" style="color:${v.key === 'allf' || v.key === 'majf' ? 'var(--verde-cl)' : v.key === 'allc' || v.key === 'majc' ? 'var(--rojo-cl)' : 'var(--oro)'}">${t.f}–${t.c}</span></div>`; }).join('')}</div></div>
  </div></div>
  <div class="foot"><button class="btn ghost" data-a="share">Imagen para WhatsApp</button><button class="btn" data-a="again">Nueva partida</button></div></div>`;
}

// ---------------------------------------------------------------- imagen para compartir
async function shareImage() {
  const X = stats(), [gT] = groupLabel(X.group), ids = X.ids, st = X.st;
  try { await document.fonts.load('40px "Alfa Slab One"'); await document.fonts.load('800 20px Archivo'); } catch (e) {}
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  g.fillStyle = '#7A1225'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 3; for (let i = -H; i < W; i += 28) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke(); g.beginPath(); g.moveTo(i + H, 0); g.lineTo(i, H); g.stroke(); }
  g.strokeStyle = '#C9A15A'; g.lineWidth = 6; g.strokeRect(36, 36, W - 72, H - 72); g.lineWidth = 2; g.strokeRect(52, 52, W - 104, H - 104);
  g.textAlign = 'center'; g.fillStyle = '#F4EAD5'; g.font = '140px "Alfa Slab One", serif'; g.fillText('¡Uush!', W / 2, 230);
  g.font = '800 30px Archivo, sans-serif'; g.fillStyle = '#C9A15A'; g.fillText(`${S.players.length} JUGADORES · ${X.R.length} RONDAS`, W / 2, 290);
  g.beginPath(); g.arc(W / 2, 470, 120, 0, Math.PI * 2); g.fillStyle = '#1A1414'; g.fill(); g.lineWidth = 18; g.strokeStyle = 'rgba(244,234,213,.15)'; g.stroke();
  g.beginPath(); g.arc(W / 2, 470, 120, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * X.group / 100); g.strokeStyle = '#C9A15A'; g.lineCap = 'round'; g.stroke();
  g.fillStyle = '#F4EAD5'; g.font = '72px "Alfa Slab One", serif'; g.fillText(X.group + '%', W / 2, 497);
  g.font = '44px "Alfa Slab One", serif'; g.fillText(gT, W / 2, 660);
  const lines = [];
  const add = (k, id, extra) => { if (id) lines.push([k, nm(id) + (extra ? ' · ' + extra : '')]); };
  if (S.mode === 'grupo') add('MEJOR DEFENSA', pickU(ids, 'best', st));
  add('MÁS CONVINCENTE', pickU(ids, 'convinced', st));
  if (S.mode === 'grupo') add('MÁS POLÉMICO', pickU(ids, 'alone', st) || pickU(ids, 'minority', st));
  add('MÁS PODEROSO', pickU(ids, 'gained', st));
  add('MÁS CAMBIANTE', pickU(ids, 'changed', st));
  add('MÁS A FAVOR', pickU(ids, 'f', st)); add('MÁS EN CONTRA', pickU(ids, 'c', st));
  if (X.pairs.length > 1) { const a = X.pairs[0], z = X.pairs[X.pairs.length - 1]; lines.push(['DÚO COMPATIBLE', `${nm(a.a)} y ${nm(a.b)} · ${a.pct}%`]); lines.push(['DÚO OPUESTO', `${nm(z.a)} y ${nm(z.b)} · ${z.pct}%`]); }
  let y = 740; lines.slice(0, 6).forEach(([k, v]) => { g.fillStyle = 'rgba(0,0,0,.22)'; roundRect(g, 120, y - 50, W - 240, 76, 18); g.fill();
    g.textAlign = 'left'; g.fillStyle = '#C9A15A'; g.font = '800 24px Archivo, sans-serif'; g.fillText(k, 150, y - 4);
    g.textAlign = 'right'; g.fillStyle = '#F4EAD5'; g.font = '800 32px Archivo, sans-serif'; g.fillText(v, W - 150, y); y += 86; });
  g.textAlign = 'center'; g.fillStyle = '#C9A15A'; g.font = '800 26px Archivo, sans-serif'; g.fillText('EL JUEGO DE CARTAS DE DEBATE', W / 2, H - 78);
  const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
  const file = new File([blob], 'uush-resumen.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: '¡Uush!', text: 'Así quedó nuestra partida de ¡Uush!' }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'uush-resumen.png'; document.body.appendChild(a); a.click(); a.remove();
  toast('Imagen descargada: compártela por WhatsApp');
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// ---------------------------------------------------------------- inicio
if (S.phase !== 'home') armBack();
render();
window.__uush = { get state() { return S; } };  // para pruebas
})();
