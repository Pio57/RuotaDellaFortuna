import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import * as G from './game.js';
import * as V from './validate.js';
import { saveSessions, loadSessions } from './persist.js';

export const MAX_SESSIONS = 5;
export const MAX_PLAYERS = 60;
export const MAX_MSG = 4096;
export const MAX_CONFIG_MSG = 16384;
const TTL = 12 * 3600 * 1000;
const CHAT_GAP = 700;
const FLUSH_DELAY = 120;

const MSG = {
  bad_code: 'Codice sessione non valido.',
  bad_name: 'Inserisci nome e cognome (al massimo 24 caratteri ciascuno).',
  forbidden: 'Operazione non consentita.',
  full: 'Non c’è più posto.',
  rate_limit: 'Stai scrivendo troppo in fretta.',
  bad_input: 'Richiesta non valida.',
};

const same = (a, b) => {
  const h = (x) => createHash('sha256').update(String(x)).digest();
  return timingSafeEqual(h(a), h(b));
};

export class Manager {
  constructor({ file, rnd = Math.random, now = Date.now, log = () => {} } = {}) {
    this.file = file;
    this.rnd = rnd;
    this.now = now;
    this.log = log;
    this.sessions = new Map();
    this.clients = new Map(); // codice → Set di connessioni
    this.timers = new Map(); // codice → timeout del flush di state
    this.lastChat = new Map(); // pid → ms
    this.intervals = [];
    if (file) for (const s of loadSessions(file)) this.sessions.set(s.code, s);
  }

  // Una connessione è { send(obj), close() } più lo stato di binding.
  conn(send, close = () => {}) {
    return { send: (o) => { try { send(o); } catch { /* socket chiuso */ } }, close, code: null, pid: null, host: false };
  }

  start() {
    this.intervals.push(setInterval(() => this.tickAll(), 1000));
    this.intervals.push(setInterval(() => { this.save(); this.sessions.forEach((s) => this.sendStates(s)); }, 5000));
    this.intervals.push(setInterval(() => this.cleanup(), 60000));
  }

  stop() {
    this.intervals.forEach(clearInterval);
    this.intervals = [];
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.save();
  }

  save() {
    if (!this.file) return;
    try { saveSessions(this.file, this.sessions); } catch (err) { this.log('-', 'save_error', 0); console.error(err.code || 'save_error'); }
  }

  cleanup() {
    const t = this.now();
    for (const s of [...this.sessions.values()]) {
      if (t - s.lastActivity < TTL) continue;
      this.clients.get(s.code)?.forEach((c) => c.close());
      this.clients.delete(s.code);
      this.sessions.delete(s.code);
      this.log(s.code, 'expired', s.players.length);
    }
  }

  err(conn, code, msg = MSG[code]) { conn.send({ t: 'error', code, msg }); }

  bind(conn, s) {
    this.unbind(conn);
    conn.code = s.code;
    if (!this.clients.has(s.code)) this.clients.set(s.code, new Set());
    this.clients.get(s.code).add(conn);
  }

  unbind(conn) {
    if (conn.code) this.clients.get(conn.code)?.delete(conn);
  }

  onClose(conn) { this.unbind(conn); }

  touch(s) { s.lastActivity = this.now(); G.bump(s); this.dirty(s); }

  dirty(s) {
    if (this.timers.has(s.code)) return;
    this.timers.set(s.code, setTimeout(() => { this.timers.delete(s.code); this.sendStates(s); }, FLUSH_DELAY));
  }

  sendStates(s) {
    for (const c of this.clients.get(s.code) || []) {
      c.send({ t: 'state', ...G.snapshot(s, c.host ? null : c.pid) });
    }
  }

  tickAll() {
    for (const s of this.sessions.values()) {
      if (s.ph !== 'q') continue;
      s.el++;
      s.lastActivity = this.now();
      if (s.el >= s.set.secs) {
        G.timeoutTurn(s);
        G.bump(s);
        this.sendStates(s);
        continue;
      }
      const m = { t: 'tick', r: s.set.secs - s.el, b: G.board(s) };
      this.clients.get(s.code)?.forEach((c) => c.send(m));
    }
  }

  // Punto d'ingresso: raw = testo JSON ricevuto dal socket.
  onMessage(conn, raw) {
    const bytes = Buffer.byteLength(raw);
    const msg = V.parse(raw);
    if (!msg) return;
    if (bytes > MAX_MSG && msg.t !== 'host:config') { this.err(conn, 'bad_input'); conn.close(1009); return; }
    this.handle(conn, msg);
  }

  handle(conn, msg) {
    switch (msg.t) {
      case 'ping': conn.send({ t: 'pong' }); return;
      case 'join': return this.join(conn, msg);
      case 'guess':
      case 'solve': return this.play(conn, msg);
      case 'chat': return this.playerChat(conn, msg);
      case 'host:create': return this.create(conn);
      case 'host:resume': return this.resume(conn, msg);
      default:
        if (msg.t.startsWith('host:')) return this.hostAction(conn, msg);
    }
  }

  create(conn) {
    if (this.sessions.size >= MAX_SESSIONS) return this.err(conn, 'full');
    const code = G.genCode(this.rnd, this.sessions);
    const key = randomBytes(18).toString('base64url'); // 24 caratteri
    const s = G.newSession(code, key, this.now());
    this.sessions.set(code, s);
    this.bind(conn, s);
    conn.host = true;
    conn.pid = null;
    conn.send({ t: 'created', code, key });
    this.log(code, 'created', 0);
    this.save();
    this.sendStates(s);
  }

  resume(conn, msg) {
    const code = V.validCode(msg.code);
    const s = code && this.sessions.get(code);
    if (!s) return this.err(conn, 'bad_code');
    if (typeof msg.key !== 'string' || !same(msg.key, s.hostKey)) return this.err(conn, 'forbidden');
    this.bind(conn, s);
    conn.host = true;
    conn.pid = null;
    s.lastActivity = this.now();
    this.log(code, 'host_resume', s.players.length);
    this.sendStates(s);
  }

  join(conn, msg) {
    const code = V.validCode(msg.code);
    const s = code && this.sessions.get(code);
    if (!s) return this.err(conn, 'bad_code');
    const first = V.validName(msg.first);
    const last = V.validName(msg.last);
    if (!first || !last) return this.err(conn, 'bad_name');
    const pid = V.validPid(msg.pid);
    let p = pid && s.players.find((x) => x.pid === pid);
    if (p) {
      if (typeof msg.token !== 'string' || !same(msg.token, p.token)) return this.err(conn, 'forbidden');
    } else {
      if (s.players.length >= MAX_PLAYERS) return this.err(conn, 'full');
      p = G.addPlayer(s, randomBytes(4).toString('hex'), randomBytes(16).toString('hex'), first, last);
    }
    this.bind(conn, s);
    conn.host = false;
    conn.pid = p.pid;
    conn.send({ t: 'joined', pid: p.pid, token: p.token });
    this.log(code, 'join', s.players.length);
    this.touch(s);
  }

  session(conn) { return conn.code ? this.sessions.get(conn.code) : null; }

  play(conn, msg) {
    const s = this.session(conn);
    if (!s || conn.host || !conn.pid) return;
    const res = msg.t === 'guess' ? G.guess(s, conn.pid, msg.l) : G.solve(s, conn.pid, V.clean(msg.a, 36));
    if (res.err) return this.err(conn, 'bad_input', res.err);
    if (s.ph === 'rev') { this.log(s.code, 'round_end', s.players.length); this.save(); }
    this.touch(s);
  }

  playerChat(conn, msg) {
    const s = this.session(conn);
    if (!s || conn.host || !conn.pid) return;
    const m = V.validChat(msg.m);
    if (!m || (msg.s !== 't' && msg.s !== 'a')) return this.err(conn, 'bad_input');
    const t = this.now();
    if (t - (this.lastChat.get(conn.pid) || 0) < CHAT_GAP) return this.err(conn, 'rate_limit');
    this.lastChat.set(conn.pid, t);
    const p = s.players.find((x) => x.pid === conn.pid);
    if (!p) return;
    const out = { t: 'chat', s: msg.s, m, n: G.displayNames(s)[p.pid], team: p.team };
    s.lastActivity = t;
    for (const c of this.clients.get(s.code) || []) {
      if (msg.s === 'a' || c.host) { c.send(out); continue; }
      const q = s.players.find((x) => x.pid === c.pid);
      if (q && q.team === p.team) c.send(out);
    }
  }

  hostAction(conn, msg) {
    const s = this.session(conn);
    if (!s || !conn.host || typeof msg.key !== 'string' || !same(msg.key, s.hostKey)) return this.err(conn, 'forbidden');
    const rnd = this.rnd;
    let ok = false;
    switch (msg.t) {
      case 'host:shuffle': ok = G.shuffleTeams(s, rnd); break;
      case 'host:move': ok = typeof msg.pid === 'string' && G.movePlayer(s, msg.pid); break;
      case 'host:config': {
        const cfg = s.ph === 'lobby' && V.validConfig(msg);
        if (!cfg) return this.err(conn, 'bad_input');
        s.rounds = cfg.rounds; s.set = cfg.set; ok = true; break;
      }
      case 'host:start': ok = s.ph === 'lobby' && s.players.length > 0; if (ok) { s.ri = 0; G.startRound(s); } break;
      case 'host:captain': ok = typeof msg.pid === 'string' && G.setCaptain(s, msg.pid); break;
      case 'host:close': ok = G.closeRound(s); break;
      case 'host:next': ok = G.nextRound(s); break;
      case 'host:spin': ok = G.spin(s, rnd); break;
      case 'host:reset': ok = G.reset(s); break;
      case 'host:chat': {
        const m = V.validChat(msg.m);
        if (!m) return this.err(conn, 'bad_input');
        const out = { t: 'chat', s: 'a', m, n: 'Pio', team: -1 };
        this.clients.get(s.code)?.forEach((c) => c.send(out));
        s.lastActivity = this.now();
        return;
      }
      default: return;
    }
    if (!ok) return this.err(conn, 'bad_input');
    this.log(s.code, msg.t, s.players.length);
    this.save();
    this.touch(s);
  }
}
