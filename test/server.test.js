import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createServer } from '../server/index.js';

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pio-')), 'sessions.json');

class Client {
  constructor(port, origin = `http://127.0.0.1:${port}`) {
    this.msgs = [];
    this.waiters = [];
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin });
    this.ws.on('message', (d) => {
      const m = JSON.parse(d);
      this.msgs.push(m);
      this.waiters = this.waiters.filter((w) => !w(m));
    });
    this.opened = new Promise((res, rej) => { this.ws.on('open', res); this.ws.on('error', rej); });
    this.closed = new Promise((res) => this.ws.on('close', res));
  }
  send(o) { this.ws.send(typeof o === 'string' ? o : JSON.stringify(o)); }
  wait(pred, ms = 3000) {
    const hit = this.msgs.find(pred);
    if (hit) return Promise.resolve(hit);
    return new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error('timeout')), ms);
      this.waiters.push((m) => { if (pred(m)) { clearTimeout(to); res(m); return true; } return false; });
    });
  }
  // aspetta uno state nuovo (scarta quelli già visti) che soddisfa pred
  state(pred = () => true) {
    const hit = [...this.msgs].reverse().find((m) => m.t === 'state' && pred(m));
    if (hit) return Promise.resolve(hit);
    return this.wait((m) => m.t === 'state' && pred(m));
  }
  last(t) { return [...this.msgs].reverse().find((m) => m.t === t); }
}

const host = async (port) => {
  const h = new Client(port);
  await h.opened;
  h.send({ t: 'host:create' });
  const { code, key } = await h.wait((m) => m.t === 'created');
  return { h, code, key, cmd: (t, x = {}) => h.send({ t, key, ...x }) };
};
const player = async (port, code, first, last, extra = {}) => {
  const c = new Client(port);
  await c.opened;
  c.send({ t: 'join', code, first, last, ...extra });
  return c;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('partita completa', async () => {
  const srv = await createServer({ port: 0, file: tmp(), timers: false });
  const { h, code, cmd } = await host(srv.port);
  const ps = [];
  for (const n of ['Anna', 'Bruno', 'Carla']) ps.push(await player(srv.port, code, n, 'Test'));
  const ids = await Promise.all(ps.map((p) => p.wait((m) => m.t === 'joined').then((m) => m.pid)));
  await h.state((m) => m.p.length === 3);
  cmd('host:start');
  const phrases = ['MELITO IRPINO', 'GLASGOW', 'LINGUE IN REALTÀ VIRTUALE', 'ATLETA IBRIDO', 'COMPUTER VISION'];
  for (let r = 0; r < 5; r++) {
    const st = await h.state((m) => m.ph === 'q' && m.ri === r);
    assert.ok(!st.b.replace(/[_ ]/g, ''));
    const who = ids.indexOf(st.cap[st.turn]);
    ps[who].send({ t: 'solve', a: phrases[r].toLowerCase() });
    const rev = await h.state((m) => m.ph === 'rev' && m.ri === r);
    assert.equal(rev.b, phrases[r]);
    assert.equal(rev.rv.by, st.turn);
    cmd('host:next');
  }
  await h.state((m) => m.ph === 'end');
  cmd('host:spin');
  const w = await ps[1].state((m) => m.ph === 'wheel');
  assert.equal(w.w.tg, 2);
  assert.ok(!JSON.stringify(w).includes('"rig"'));
  cmd('host:reset');
  const l = await h.state((m) => m.ph === 'lobby' && m.sc[0] === 0 && m.e > w.e);
  assert.equal(l.p.length, 3);
  await srv.close();
});

test('lettere: ruota, solo il capitano di turno, turno che passa; capitano scelto dall’host', async () => {
  const srv = await createServer({ port: 0, file: tmp(), timers: false, rnd: () => 0.5 });
  const { h, code, cmd } = await host(srv.port);
  const ps = [];
  for (const n of ['Anna', 'Bruno', 'Carla', 'Dino']) ps.push(await player(srv.port, code, n, 'T'));
  const ids = await Promise.all(ps.map((p) => p.wait((m) => m.t === 'joined').then((m) => m.pid)));
  cmd('host:captain', { pid: ids[3] }); // Dino al posto di Anna (squadra 0)
  await h.state((m) => m.cap[0] === ids[3]);
  cmd('host:start');
  const st = await h.state((m) => m.ph === 'q');
  assert.equal(st.turn, 0);
  ps[0].send({ t: 'guess', l: 'e' }); // Anna non è più capitano
  assert.equal((await ps[0].wait((m) => m.t === 'error')).code, 'bad_input');
  ps[1].send({ t: 'guess', l: 'e' }); // capitano di un'altra squadra, non è il suo turno
  assert.equal((await ps[1].wait((m) => m.t === 'error')).code, 'bad_input');
  ps[3].send({ t: 'guess', l: 'e' }); // prima va girata la ruota
  assert.equal((await ps[3].wait((m) => m.t === 'error')).msg, 'Gira prima la ruota.');
  ps[3].send({ t: 'spin' });
  const sp = await h.state((m) => m.sp);
  assert.equal(sp.sp.v, 2);
  ps[3].send({ t: 'guess', l: 'e' });
  const hit = await h.state((m) => m.ph === 'q' && m.called.length === 1);
  assert.equal(hit.la.kind, 'hit');
  assert.equal(hit.turn, 0);
  assert.equal(hit.sp, null);
  ps[3].send({ t: 'spin' });
  await h.state((m) => m.sp);
  ps[3].send({ t: 'guess', l: 'z' });
  const miss = await h.state((m) => m.called?.length === 2);
  assert.equal(miss.la.kind, 'miss');
  assert.equal(miss.turn, 1);
  await srv.close();
});

test('timer del turno: scaduto il tempo passa la mano', async () => {
  const srv = await createServer({ port: 0, file: tmp(), timers: false });
  const { h, code, cmd } = await host(srv.port);
  const a = await player(srv.port, code, 'Anna', 'R');
  await a.wait((m) => m.t === 'joined');
  cmd('host:start');
  await h.state((m) => m.ph === 'q');
  for (let i = 0; i < 45; i++) srv.manager.tickAll();
  const st = await h.state((m) => m.la?.kind === 'timeout');
  assert.equal(st.r, 45);
  await srv.close();
});

test('rientro giocatore: con token sì, senza token no', async () => {
  const srv = await createServer({ port: 0, file: tmp(), timers: false, rnd: () => 0.5 });
  const { h, code, cmd } = await host(srv.port);
  const a = await player(srv.port, code, 'Anna', 'Rossi');
  const b = await player(srv.port, code, 'Bruno', 'Verdi');
  const j = await a.wait((m) => m.t === 'joined');
  await b.wait((m) => m.t === 'joined');
  cmd('host:start');
  await a.state((m) => m.ph === 'q');
  a.send({ t: 'spin' });
  await a.state((m) => m.sp);
  a.send({ t: 'guess', l: 'e' });
  await a.state((m) => m.ph === 'q' && m.called.length === 1);
  a.ws.terminate();
  const bad = await player(srv.port, code, 'Anna', 'Rossi', { pid: j.pid, token: '0'.repeat(32) });
  assert.equal((await bad.wait((m) => m.t === 'error')).code, 'forbidden');
  const back = await player(srv.port, code, 'Anna', 'Rossi', { pid: j.pid, token: j.token });
  const st = await back.state((m) => m.p.length === 2 && m.ph === 'q');
  assert.equal(st.called.length, 1);
  assert.equal(st.cap[0], j.pid);
  assert.equal((await back.wait((m) => m.t === 'joined')).pid, j.pid);
  await h.state(() => true);
  await srv.close();
});

test('host ricaricato con la chiave; chiave sbagliata rifiutata', async () => {
  const srv = await createServer({ port: 0, file: tmp(), timers: false });
  const { h, code, key, cmd } = await host(srv.port);
  const a = await player(srv.port, code, 'Anna', 'Rossi');
  const b = await player(srv.port, code, 'Bruno', 'Verdi');
  await a.wait((m) => m.t === 'joined');
  await b.wait((m) => m.t === 'joined');
  cmd('host:start');
  await h.state((m) => m.ph === 'q');
  srv.manager.tickAll();
  srv.manager.tickAll();
  h.ws.terminate();
  const h2 = new Client(srv.port);
  await h2.opened;
  h2.send({ t: 'host:resume', code, key: 'x'.repeat(24) });
  assert.equal((await h2.wait((m) => m.t === 'error')).code, 'forbidden');
  h2.send({ t: 'host:resume', code, key });
  const st = await h2.state((m) => m.ph === 'q');
  assert.equal(st.r, 43);
  a.send({ t: 'host:close', key });
  assert.equal((await a.wait((m) => m.t === 'error')).code, 'forbidden');
  await srv.close();
});

test('chat di squadra: solo compagni e host; testo ripulito', async () => {
  const srv = await createServer({ port: 0, file: tmp(), timers: false });
  const { h, code } = await host(srv.port);
  const ps = [];
  for (const n of ['Anna', 'Bruno', 'Carla', 'Dino']) ps.push(await player(srv.port, code, n, 'T'));
  await Promise.all(ps.map((p) => p.wait((m) => m.t === 'joined')));
  // Anna e Dino sono nella squadra 0
  ps[0].send({ t: 'chat', s: 't', m: 'ciao <b>team' });
  const got = await ps[3].wait((m) => m.t === 'chat');
  await h.wait((m) => m.t === 'chat');
  assert.ok(!got.m.includes('<') && !got.m.includes('>'));
  assert.equal(got.team, 0);
  await sleep(150);
  assert.equal(ps[1].last('chat'), undefined);
  assert.equal(ps[2].last('chat'), undefined);
  ps[0].send({ t: 'chat', s: 'a', m: 'a tutti' }); // troppo presto → rate_limit
  assert.equal((await ps[0].wait((m) => m.t === 'error')).code, 'rate_limit');
  await srv.close();
});

test('limiti: sessioni, giocatori, dimensione, origine', async () => {
  const srv = await createServer({ port: 0, file: tmp(), timers: false });
  const hs = [];
  for (let i = 0; i < 5; i++) hs.push(await host(srv.port));
  const x = new Client(srv.port);
  await x.opened;
  x.send({ t: 'host:create' });
  assert.equal((await x.wait((m) => m.t === 'error')).code, 'full');

  const s = srv.manager.sessions.get(hs[0].code);
  for (let i = 0; i < 60; i++) s.players.push({ pid: 'f' + i, token: 't', first: 'F' + i, last: 'L', team: i % 3 });
  const late = await player(srv.port, hs[0].code, 'Tardi', 'Uno');
  assert.equal((await late.wait((m) => m.t === 'error')).code, 'full');

  const big = new Client(srv.port);
  await big.opened;
  big.send(JSON.stringify({ t: 'chat', s: 'a', m: 'a'.repeat(5000) }));
  await big.closed;

  const bad = new Client(srv.port, 'http://evil.example');
  await assert.rejects(bad.opened);
  await srv.close();
});

test('riavvio a metà round: la sessione torna con il tempo salvato', async () => {
  const file = tmp();
  const a = await createServer({ port: 0, file, timers: false });
  const { h, code, cmd } = await host(a.port);
  const p = await player(a.port, code, 'Anna', 'R');
  await p.wait((m) => m.t === 'joined');
  cmd('host:start');
  await h.state((m) => m.ph === 'q');
  for (let i = 0; i < 12; i++) a.manager.tickAll();
  await a.close();
  const b = await createServer({ port: 0, file, timers: false });
  const s = b.manager.sessions.get(code);
  assert.equal(s.ph, 'q');
  assert.equal(s.el, 12);
  await b.close();
});
