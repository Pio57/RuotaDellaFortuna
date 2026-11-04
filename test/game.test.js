import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.js';
import { validConfig } from '../server/validate.js';

let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const mk = (n = 0) => {
  const s = G.newSession('ABCD', 'k', 0);
  for (let i = 0; i < n; i++) G.addPlayer(s, 'p' + i, 't' + i, 'Nome' + i, 'Cognome');
  return s;
};
const spin = (s, val = 5) => { s.spin = { id: 1, tg: 0, jt: 0, val, at: s.el }; };
const capOf = (s, t = s.turn) => s.captains[t];

test('40 giocatori: squadre differiscono al massimo di uno', () => {
  const s = mk(40);
  const n = G.teamSizes(s);
  assert.ok(Math.max(...n) - Math.min(...n) <= 1);
  G.shuffleTeams(s, rnd);
  const m = G.teamSizes(s);
  assert.ok(Math.max(...m) - Math.min(...m) <= 1);
});

test('nomi doppi e cognomi mai nello stato', () => {
  const s = G.newSession('ABCD', 'k', 0);
  G.addPlayer(s, 'a', 't', 'marco', 'Rossi');
  G.addPlayer(s, 'b', 't', 'Marco', 'Verdi');
  G.addPlayer(s, 'c', 't', 'Anna', 'Bianchi');
  const names = G.displayNames(s);
  assert.equal(names.a, 'Marco R.');
  assert.equal(names.b, 'Marco V.');
  assert.equal(names.c, 'Anna');
  const json = JSON.stringify([G.snapshot(s, 'a'), G.snapshot(s, null)]);
  for (const l of ['Rossi', 'Verdi', 'Bianchi']) assert.ok(!json.includes(l));
});

test('capitano: uno per squadra, scelto dall\'host, sostituito se cambia squadra', () => {
  const s = mk(6);
  assert.deepEqual(s.captains, ['p0', 'p1', 'p2']);
  assert.equal(G.setCaptain(s, 'p3'), true); // p3 è nella squadra 0
  assert.equal(s.captains[0], 'p3');
  G.movePlayer(s, 'p3');
  assert.equal(s.captains[0], 'p0');
  assert.equal(G.setCaptain(s, 'sconosciuto'), false);
});

test('all\'inizio del round il tabellone è tutto nascosto e il turno parte dalla squadra del round', () => {
  const s = mk(3);
  G.startRound(s);
  assert.ok(!G.board(s).replace(/[_ ]/g, ''));
  assert.equal(s.turn, 0);
  s.ri = 1; G.startRound(s);
  assert.equal(s.turn, 1);
});

test('lettera presente: scopre le occorrenze, valore × 3 volte la I, la squadra continua e rigira', () => {
  const s = mk(3);
  G.startRound(s); // MELITO IRPINO
  spin(s, 5);
  const r = G.guess(s, capOf(s), 'i');
  assert.ok(r.ok);
  assert.equal(Array.from(G.board(s)).filter((c) => c === 'I').length, 3);
  assert.equal(s.scores[0], 15);
  assert.equal(s.turn, 0);
  assert.equal(s.spin, null);
});

test('lettera assente: il turno passa alla squadra successiva', () => {
  const s = mk(3);
  G.startRound(s);
  spin(s);
  assert.ok(G.guess(s, capOf(s), 'z').ok);
  assert.equal(s.scores[0], 0);
  assert.equal(s.turn, 1);
});

test('accenti: A scopre anche À', () => {
  const s = mk(3);
  s.rounds[0].bd = 'REALTÀ';
  G.startRound(s);
  spin(s);
  G.guess(s, capOf(s), 'a');
  assert.equal(G.board(s), '__A__À');
});

test('solo il capitano della squadra di turno può giocare; lettere ripetute o non valide rifiutate', () => {
  const s = mk(6);
  G.startRound(s);
  spin(s);
  assert.ok(G.guess(s, 'p3', 'a').err); // compagno non capitano
  assert.ok(G.guess(s, 'p1', 'a').err); // capitano di un'altra squadra
  assert.ok(G.guess(s, 'sconosciuto', 'a').err);
  assert.ok(G.guess(s, 'p0', 'ab').err);
  assert.ok(G.guess(s, 'p0', '7').err);
  assert.ok(G.guess(s, 'p0', 'e').ok);
  spin(s);
  assert.ok(G.guess(s, 'p0', 'E').err); // già chiamata
});

test('risolvere: giusta → bonus e fine round; sbagliata → turno passa', () => {
  const s = mk(3);
  G.startRound(s);
  spin(s);
  G.guess(s, 'p0', 'i'); // +15
  assert.ok(G.solve(s, 'p0', 'Melito  Irpino').ok);
  assert.equal(s.ph, 'rev');
  assert.ok(s.scores[0] > 15 + 30); // 15 + bonus 30 + 3 per ogni lettera ancora nascosta
  assert.equal(s.rv.by, 0);
  const t = mk(3);
  G.startRound(t);
  G.solve(t, 'p0', 'sbagliata');
  assert.equal(t.ph, 'q');
  assert.equal(t.turn, 1);
});

test('completare l\'ultima lettera chiude il round con bonus', () => {
  const s = mk(3);
  s.rounds[0].bd = 'AB';
  G.startRound(s);
  spin(s); G.guess(s, 'p0', 'a');
  spin(s); G.guess(s, 'p0', 'b');
  assert.equal(s.ph, 'rev');
  assert.equal(s.rv.by, 0);
  assert.equal(s.scores[0], 5 + 5 + 30);
});

test('scadenza del turno: passa alla squadra successiva; squadre vuote saltate', () => {
  const s = mk(2); // solo squadre 0 e 1
  G.startRound(s);
  G.timeoutTurn(s);
  assert.equal(s.turn, 1);
  G.timeoutTurn(s);
  assert.equal(s.turn, 0);
});

test('pareggio tra squadre: vincono tutte; squadra senza membri esclusa', () => {
  const s = mk(3);
  s.scores = [100, 100, 100];
  assert.deepEqual(G.winners(s), [0, 1, 2]);
  const e = mk(2);
  e.scores = [0, 0, 500];
  assert.deepEqual(G.winners(e), [0, 1]);
});

test('ruota: rig cade su "caff", senza rig escono tutti gli spicchi', () => {
  const s = mk(3);
  s.ph = 'end';
  for (let i = 0; i < 50; i++) { G.spin(s, rnd); assert.equal(s.w.tg, 2); assert.ok(Math.abs(s.w.jt) <= 18); }
  s.set.rig = false;
  const seen = new Set();
  for (let i = 0; i < 300; i++) { G.spin(s, rnd); seen.add(s.w.tg); }
  assert.equal(seen.size, 6);
});

test('lo stato non rivela la frase prima di rev, né rig, né cognomi', () => {
  const s = mk(3);
  G.startRound(s);
  const p = JSON.stringify(G.snapshot(s, 'p0'));
  assert.ok(!p.includes('MELITO') && !p.includes('"rig"') && !p.includes('Cognome') && !p.includes('"bd"'));
  G.closeRound(s);
  assert.equal(G.snapshot(s, 'p0').b, 'MELITO IRPINO');
  s.ph = 'end'; G.spin(s, rnd);
  assert.ok(!JSON.stringify(G.snapshot(s, 'p0')).includes('"rig"'));
  assert.ok(G.snapshot(s, null).cfg);
  assert.ok(!G.snapshot(s, 'p0').cfg);
});

test('round predefiniti validi; configurazione senza frase rifiutata', () => {
  const s = mk(0);
  assert.ok(validConfig({ rounds: s.rounds, set: s.set }));
  assert.equal(validConfig({ rounds: [{ cat: 'a', t: 'b', bd: '', an: '' }], set: s.set }), null);
  assert.equal(validConfig({ rounds: [{ cat: 'a', t: 'b', bd: '123', an: '' }], set: s.set }), null);
});

test('ruota del turno: prima si gira, una volta sola, solo il capitano', () => {
  const s = mk(6);
  G.startRound(s);
  assert.equal(G.guess(s, 'p0', 'e').err, 'Gira prima la ruota.');
  assert.ok(G.spinTurn(s, 'p3', rnd).err); // compagno non capitano
  assert.ok(G.spinTurn(s, 'p1', rnd).err); // non è il suo turno
  assert.ok(G.spinTurn(s, 'p0', () => 0.5).ok);
  assert.equal(s.spin.val, 2); // spicchio 3 della ruota
  assert.ok(G.spinTurn(s, 'p0', rnd).err); // già girata
  assert.ok(G.guess(s, 'p0', 'e').ok);
});

test('«Passa»: nessuna lettera, il turno cambia a giro finito', () => {
  const s = mk(3);
  G.startRound(s);
  assert.ok(G.spinTurn(s, 'p0', () => 0.7).ok); // spicchio 4 = Passa
  assert.equal(s.spin.val, 0);
  assert.ok(G.guess(s, 'p0', 'e').err);
  s.el = G.PASS_DELAY - 1;
  assert.equal(G.passIfDue(s), false);
  s.el = G.PASS_DELAY;
  assert.equal(G.passIfDue(s), true);
  assert.equal(s.turn, 1);
  assert.equal(s.la.kind, 'pass');
  assert.equal(s.spin, null);
});

test('«Bancarotta»: si perdono gli spritz del round e il turno, a giro finito', () => {
  const s = mk(3);
  G.startRound(s);
  spin(s, 5);
  G.guess(s, 'p0', 'i'); // +15
  assert.equal(s.scores[0], 15);
  assert.ok(G.spinTurn(s, 'p0', () => 0.99).ok); // ultimo spicchio
  assert.equal(s.spin.val, -1);
  assert.ok(G.guess(s, 'p0', 'e').err);
  assert.equal(s.scores[0], 15); // per ora non cambia: il giro è in corso
  s.el = G.PASS_DELAY;
  assert.ok(G.passIfDue(s));
  assert.equal(s.scores[0], 0);
  assert.equal(s.la.kind, 'bankrupt');
  assert.equal(s.la.lost, 15);
  assert.equal(s.turn, 1);
});
