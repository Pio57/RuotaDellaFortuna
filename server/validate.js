// Tutto ciò che arriva dalla rete è non fidato: tipi, lunghezze, intervalli, caratteri di controllo.
import { ALPHABET, LIMITS, SECS_OPTIONS } from './game.js';

const BAD = /[\u0000-\u001f\u007f-\u009f<>]/g;

export function clean(v, max, { min = 0 } = {}) {
  if (typeof v !== 'string') return null;
  const s = v.replace(BAD, ' ').replace(/\s+/g, ' ').trim();
  if (s.length < min || s.length > max) return null;
  return s;
}

export const validName = (v) => clean(v, LIMITS.name, { min: 1 });
export const validChat = (v) => clean(v, LIMITS.chat, { min: 1 });

export function validCode(v) {
  if (typeof v !== 'string') return null;
  const c = v.trim().toUpperCase();
  return c.length === 4 && [...c].every((ch) => ALPHABET.includes(ch)) ? c : null;
}

export const validPid = (v) => (typeof v === 'string' && /^[a-f0-9]{8}$/.test(v) ? v : null);
export const validToken = (v) => (typeof v === 'string' && /^[a-f0-9]{32}$/.test(v) ? v : null);

export function parse(raw) {
  try {
    const m = JSON.parse(raw.toString());
    return m && typeof m === 'object' && !Array.isArray(m) && typeof m.t === 'string' ? m : null;
  } catch {
    return null;
  }
}

// Ritorna { rounds, set } pulito oppure null.
export function validConfig(msg) {
  const rs = msg.rounds;
  const set = msg.set;
  if (!Array.isArray(rs) || rs.length < 1 || rs.length > LIMITS.rounds) return null;
  if (!set || typeof set !== 'object') return null;
  const rounds = [];
  for (const r of rs) {
    if (!r || typeof r !== 'object') return null;
    const cat = clean(r.cat, LIMITS.cat, { min: 1 });
    const t = clean(r.t, LIMITS.t, { min: 1 });
    const bd = clean(r.bd, LIMITS.board, { min: 1 });
    const an = clean(r.an ?? '', LIMITS.anec);
    if (!cat || !t || !bd || an === null || !/\p{L}/u.test(bd)) return null;
    rounds.push({ cat, t, bd, an });
  }
  if (!SECS_OPTIONS.includes(set.secs) || typeof set.rig !== 'boolean') return null;
  if (!Array.isArray(set.wheel) || set.wheel.length !== 6) return null;
  const wheel = set.wheel.map((x) => clean(x, LIMITS.prize, { min: 1 }));
  if (wheel.includes(null)) return null;
  return { rounds, set: { secs: set.secs, rig: set.rig, wheel } };
}
