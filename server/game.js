// Logica di gioco pura: nessun I/O, il caso arriva come parametro (rnd) così i test sono ripetibili.
//
// Regole: in ogni round c'è una frase nascosta sul tabellone. Le squadre giocano a turno: il capitano
// della squadra di turno gira la ruota (valore in spritz per lettera, oppure «Passa») e chiama una lettera.
// Se c'è, scopre tutte le sue occorrenze (valore × occorrenze) e la squadra continua con un nuovo giro;
// se non c'è, il turno passa. Il capitano può anche tentare di risolvere la frase:
// se indovina il round finisce con un bonus, altrimenti il turno passa. Il tempo (set.secs) è per turno.

export const TEAMS = ['Squadra verde', 'Squadra blu', 'Squadra rossa'];
export const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const SECS_OPTIONS = [15, 30, 45, 60, 90];
// Ruota del turno: 0 = «Passa» (si perde il turno), -1 = «Bancarotta» (si perde il turno e gli spritz
// guadagnati nel round). I punteggi sono in spritz.
export const TURN_WHEEL = [3, 5, 8, 2, 0, 10, -1];
export const SOLVE_BONUS = 30;
export const HIDDEN_BONUS = 3;
export const PASS_DELAY = 7; // secondi di attesa dopo «Passa», il tempo del giro

export const LIMITS = { name: 24, chat: 200, cat: 18, t: 140, board: 50, anec: 240, prize: 36, rounds: 6 };

const LETTER = /\p{L}/u;

// Lettera base: senza accento e maiuscola (À conta come A).
export const base = (c) => c.normalize('NFD').replace(/\p{M}/gu, '').toLocaleUpperCase('it');
const lettersOf = (str) => Array.from(str).filter((c) => LETTER.test(c)).map(base).join('');

export function defaultRounds() {
  // cat = titolo visibile sopra il tabellone; bd = descrizione nascosta da scoprire lettera per lettera.
  return [
    { cat: 'Melito Irpino', t: 'Che cos’è per Pio?', bd: 'PAESE D’ORIGINE DI 2000 ABITANTI', an: 'Un paesino in provincia di Avellino, sud Italia.' },
    { cat: 'Learningverse', t: 'Che cos’è?', bd: 'STARTUP: PRODOTTO IN REALTÀ VIRTUALE', an: 'Un’app in realtà virtuale per imparare le lingue, nata all’università.' },
    { cat: 'Haggis', t: 'Che cos’è?', bd: 'PIATTO SCOZZESE A BASE DI INTERIORA DI PECORA', an: 'Lo ha assaggiato a Glasgow durante l’Erasmus: il più schifoso mai provato, fino a oggi.' },
    { cat: 'Atleta ibrido', t: 'Che cosa fa?', bd: 'CORSA, CALISTHENICS E NUOTO', an: 'Lo sport è il suo hobby: si allena con corsa e calisthenics, e va anche in piscina.' },
    { cat: 'Otino', t: 'Che cos’è?', bd: 'IL PRIMO VERO NOME DI PIO', an: 'Il suo primo vero nome è Otino, non Pio.' },
  ];
}

export function defaultSet() {
  return {
    secs: 45,
    rig: true,
    wheel: ['Un viaggio a Tokyo', 'Mille euro in contanti', 'Il caffè per tutta la squadra', 'Un weekend alle Maldive', 'Una pizza per due', 'Un giorno di ferie'],
  };
}

export function genCode(rnd, taken) {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += ALPHABET[Math.floor(rnd() * ALPHABET.length)];
    if (!taken.has(c)) return c;
  }
}

export function newSession(code, hostKey, now) {
  return {
    code, hostKey, createdAt: now, lastActivity: now, e: 0,
    ph: 'lobby', players: [], captains: [null, null, null], rounds: defaultRounds(), set: defaultSet(),
    ri: 0, scores: [0, 0, 0], el: 0, turn: 0, phrase: '', called: [], gain: [0, 0, 0], la: null, spin: null, sid: 0,
    rv: null, win: [], w: null, wid: 0,
  };
}

export const bump = (s) => { s.e++; };
export const cap = (str) => { const a = Array.from(str); return a.length ? a[0].toLocaleUpperCase('it') + a.slice(1).join('') : ''; };

function shuffled(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function teamSizes(s) {
  const n = [0, 0, 0];
  for (const p of s.players) n[p.team]++;
  return n;
}

// Un capitano per squadra: resta quello scelto dall'host finché è nella squadra, altrimenti il primo membro.
export function assignCaptains(s) {
  for (let t = 0; t < 3; t++) {
    const cur = s.players.find((p) => p.pid === s.captains[t] && p.team === t);
    s.captains[t] = cur ? cur.pid : (s.players.find((p) => p.team === t) || {}).pid || null;
  }
}

export function setCaptain(s, pid) {
  const p = s.players.find((x) => x.pid === pid);
  if (!p || s.ph !== 'lobby') return false;
  s.captains[p.team] = pid;
  return true;
}

export function addPlayer(s, pid, token, first, last) {
  const n = teamSizes(s);
  const team = n.indexOf(Math.min(...n));
  const p = { pid, token, first: cap(first), last: cap(last), team };
  s.players.push(p);
  assignCaptains(s);
  return p;
}

// Nome da mostrare: solo il nome; se coincide con un altro (senza maiuscole) si aggiunge l'iniziale del cognome.
export function displayNames(s) {
  const cnt = {};
  for (const p of s.players) { const k = p.first.toLocaleLowerCase('it'); cnt[k] = (cnt[k] || 0) + 1; }
  const m = {};
  for (const p of s.players) {
    m[p.pid] = cnt[p.first.toLocaleLowerCase('it')] > 1 ? `${p.first} ${Array.from(p.last)[0].toLocaleUpperCase('it')}.` : p.first;
  }
  return m;
}

export function shuffleTeams(s, rnd) {
  if (s.ph !== 'lobby') return false;
  shuffled(s.players, rnd).forEach((p, i) => { p.team = i % 3; });
  assignCaptains(s);
  return true;
}

export function movePlayer(s, pid) {
  if (s.ph !== 'lobby') return false;
  const p = s.players.find((x) => x.pid === pid);
  if (!p) return false;
  p.team = (p.team + 1) % 3;
  assignCaptains(s);
  return true;
}

const live = (s) => [0, 1, 2].filter((t) => s.players.some((p) => p.team === t));
function nextLive(s, from) {
  const l = live(s);
  if (!l.length) return 0;
  for (let k = 0; k < 3; k++) { const t = (from + k) % 3; if (l.includes(t)) return t; }
  return l[0];
}

export function startRound(s) {
  const r = s.rounds[s.ri];
  assignCaptains(s);
  s.ph = 'q';
  s.el = 0;
  s.called = [];
  s.gain = [0, 0, 0];
  s.la = null;
  s.hold = 0;
  s.spin = null;
  s.rv = null;
  s.phrase = r.bd.toLocaleUpperCase('it');
  s.turn = nextLive(s, s.ri % 3);
}

const hiddenCount = (s) => {
  const called = new Set(s.called.map((c) => c[0]));
  return Array.from(s.phrase).filter((c) => LETTER.test(c) && !called.has(base(c))).length;
};

export function board(s) {
  if (s.ph === 'rev') return s.phrase;
  const called = new Set(s.called.map((c) => c[0]));
  return Array.from(s.phrase).map((c) => (LETTER.test(c) && !called.has(base(c)) ? '_' : c)).join('');
}

function passTurn(s) {
  s.turn = nextLive(s, s.turn + 1);
  s.el = 0;
  s.hold = 0;
  s.spin = null;
}

function finish(s, team, bonus) {
  if (team >= 0) { s.scores[team] += bonus; s.gain[team] += bonus; }
  s.rv = { an: s.rounds[s.ri].an, by: team, tr: s.gain.slice() };
  s.ph = 'rev';
}

// Solo il capitano della squadra di turno può giocare. Ritorna un messaggio d'errore o null.
function gate(s, pid) {
  if (s.ph !== 'q') return 'Il round non è in corso.';
  const p = s.players.find((x) => x.pid === pid);
  if (!p) return 'Giocatore sconosciuto.';
  if (p.team !== s.turn) return 'Non è il turno della tua squadra.';
  if (s.captains[p.team] !== pid) return 'Solo il capitano può giocare.';
  return null;
}

export function guess(s, pid, l) {
  const err = gate(s, pid);
  if (err) return { err };
  if (!s.spin) return { err: 'Gira prima la ruota.' };
  if (s.spin.val <= 0) return { err: s.spin.val < 0 ? 'La ruota ha detto «Bancarotta».' : 'La ruota ha detto «Passa».' };
  const ch = typeof l === 'string' ? Array.from(l.trim()) : [];
  if (ch.length !== 1 || !LETTER.test(ch[0])) return { err: 'Lettera non valida.' };
  const b = base(ch[0]);
  if (s.called.some((c) => c[0] === b)) return { err: 'Lettera già chiamata.' };
  const team = s.turn;
  s.called.push([b, team]);
  const n = Array.from(s.phrase).filter((c) => LETTER.test(c) && base(c) === b).length;
  if (n > 0) {
    const pts = n * s.spin.val;
    s.scores[team] += pts;
    s.gain[team] += pts;
    s.el = 0;
    s.hold = 0;
    s.spin = null; // dopo ogni lettera giusta si rigira
    s.la = { id: (s.lid = (s.lid || 0) + 1), team, kind: 'hit', l: b, n, pts };
    if (hiddenCount(s) === 0) { s.la.kind = 'complete'; finish(s, team, SOLVE_BONUS); }
  } else {
    s.la = { id: (s.lid = (s.lid || 0) + 1), team, kind: 'miss', l: b, n: 0, pts: 0 };
    passTurn(s);
  }
  return { ok: true };
}

export function solve(s, pid, attempt) {
  const err = gate(s, pid);
  if (err) return { err };
  if (typeof attempt !== 'string' || !lettersOf(attempt)) return { err: 'Scrivi la frase.' };
  const team = s.turn;
  if (lettersOf(attempt) === lettersOf(s.phrase)) {
    const bonus = SOLVE_BONUS + HIDDEN_BONUS * hiddenCount(s);
    s.la = { id: (s.lid = (s.lid || 0) + 1), team, kind: 'solve', pts: bonus };
    finish(s, team, bonus);
  } else {
    s.la = { id: (s.lid = (s.lid || 0) + 1), team, kind: 'fail' };
    passTurn(s);
  }
  return { ok: true };
}

export function spinTurn(s, pid, rnd) {
  const err = gate(s, pid);
  if (err) return { err };
  if (s.spin) return { err: 'Hai già girato la ruota.' };
  const tg = Math.floor(rnd() * TURN_WHEEL.length);
  s.sid++;
  s.spin = { id: s.sid, tg, jt: Math.round(rnd() * 36) - 18, val: TURN_WHEEL[tg], at: s.el };
  if (s.spin.val > 0) { s.el = 0; s.spin.at = 0; s.hold = PASS_DELAY; } // il timer riparte da capo a ruota ferma
  return { ok: true };
}

// Dopo «Passa» o «Bancarotta» il turno cambia quando il giro è finito.
export function passIfDue(s) {
  if (s.ph !== 'q' || !s.spin || s.spin.val > 0 || s.el - s.spin.at < PASS_DELAY) return false;
  const team = s.turn;
  if (s.spin.val < 0) {
    const lost = s.gain[team];
    s.scores[team] -= lost;
    s.gain[team] = 0;
    s.la = { id: (s.lid = (s.lid || 0) + 1), team, kind: 'bankrupt', lost };
  } else s.la = { id: (s.lid = (s.lid || 0) + 1), team, kind: 'pass' };
  passTurn(s);
  return true;
}

// Un secondo di gioco. Il timer del turno resta fermo mentre la ruota gira (s.hold).
// Ritorna true se è cambiato qualcosa che va inviato (turno scaduto, Passa/Bancarotta).
export function tick(s) {
  if (s.hold > 0) { s.hold--; return false; }
  s.el++;
  if (s.el >= s.set.secs) { timeoutTurn(s); return true; }
  return passIfDue(s);
}

export function timeoutTurn(s) {
  s.la = { id: (s.lid = (s.lid || 0) + 1), team: s.turn, kind: 'timeout' };
  passTurn(s);
}

// Chiusura decisa dall'host: nessun bonus.
export function closeRound(s) {
  if (s.ph !== 'q') return false;
  finish(s, -1, 0);
  return true;
}

export function winners(s) {
  const n = teamSizes(s);
  const l = [0, 1, 2].filter((t) => n[t] > 0);
  if (!l.length) return [];
  const m = Math.max(...l.map((t) => s.scores[t]));
  return l.filter((t) => s.scores[t] === m);
}

export function nextRound(s) {
  if (s.ph !== 'rev') return false;
  if (s.ri + 1 < s.rounds.length) { s.ri++; startRound(s); } else { s.ph = 'end'; s.win = winners(s); }
  return true;
}

export function spin(s, rnd) {
  if (s.ph !== 'end' && s.ph !== 'wheel') return false;
  let tg = s.set.rig ? s.set.wheel.findIndex((x) => x.toLocaleLowerCase('it').includes('caff')) : -1;
  if (tg < 0) tg = Math.floor(rnd() * 6);
  const jt = Math.round(rnd() * 36) - 18;
  s.wid++;
  s.w = { tg, jt, id: s.wid, cl: null };
  s.ph = 'wheel';
  return true;
}

// Finale: la ruota dei premi la gira il capitano di una squadra vincitrice, una volta sola.
export function finalSpin(s, pid, rnd) {
  if (s.ph !== 'end') return { err: 'La ruota è già stata girata.' };
  const p = s.players.find((x) => x.pid === pid);
  if (!p || !s.win.includes(p.team)) return { err: 'La ruota tocca alla squadra vincitrice.' };
  if (s.captains[p.team] !== pid) return { err: 'Solo il capitano può girare la ruota.' };
  spin(s, rnd);
  return { ok: true };
}

// Riscatto del premio: un membro di una squadra vincitrice, una volta sola.
export function claim(s, pid) {
  if (s.ph !== 'wheel' || !s.w) return { err: 'Nessun premio da riscattare.' };
  const p = s.players.find((x) => x.pid === pid);
  if (!p || !s.win.includes(p.team)) return { err: 'Il premio spetta alla squadra vincitrice.' };
  if (s.w.cl) return { err: 'Il premio è già stato riscattato.' };
  s.w.cl = { name: displayNames(s)[pid], team: p.team };
  return { ok: true };
}

export function reset(s) {
  s.ph = 'lobby';
  s.scores = [0, 0, 0];
  s.ri = 0;
  s.el = 0;
  s.called = [];
  s.gain = [0, 0, 0];
  s.la = null;
  s.spin = null;
  s.rv = null;
  s.win = [];
  s.w = null;
  s.phrase = '';
  return true;
}

// Stato inviato ai client. Mai: cognomi, hostKey, rig, frase intera prima di rev.
// viewerPid = null → host (vede anche la configurazione).
export function snapshot(s, viewerPid) {
  const names = displayNames(s);
  const host = viewerPid === null;
  const inRound = s.ph === 'q' || s.ph === 'rev';
  const out = {
    c: s.code, e: s.e, ph: s.ph,
    p: s.players.map((p) => [p.pid, names[p.pid], p.team]),
    cap: s.captains.slice(),
    n: s.rounds.length, ri: s.ri, sc: s.scores.slice(),
    tot: s.set.secs,
  };
  if (inRound) {
    const r = s.rounds[s.ri];
    out.q = { cat: r.cat, t: r.t };
    out.b = board(s);
    out.r = s.ph === 'q' ? Math.max(0, s.set.secs - s.el) : 0;
    out.turn = s.turn;
    out.called = s.called.map((c) => c.slice());
    out.la = s.la;
    out.tw = TURN_WHEEL;
    out.sp = s.spin ? { id: s.spin.id, tg: s.spin.tg, jt: s.spin.jt, v: s.spin.val } : null;
  }
  if (s.ph === 'rev') out.rv = s.rv;
  if (s.ph === 'end' || s.ph === 'wheel') { out.win = s.win; out.pw = s.set.wheel.slice(); }
  if (s.ph === 'wheel') out.w = { l: s.set.wheel.slice(), tg: s.w.tg, id: s.w.id, jt: s.w.jt, cl: s.w.cl || null };
  if (host) { out.h = 1; out.cfg = { rounds: s.rounds, set: s.set }; }
  return out;
}
