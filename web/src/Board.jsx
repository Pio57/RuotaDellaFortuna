import { useEffect, useRef } from 'react';

const COLS = 14;
const ROWS = 4;
const isLetter = (c) => c === '_' || /\p{L}/u.test(c);

// Dispone la frase sul tabellone come in TV: righe da 14 caselle, parole mai spezzate (se ci stanno).
export function layout(str) {
  const chars = Array.from(str);
  const words = [];
  let cur = [];
  chars.forEach((c, i) => {
    if (c === ' ') { if (cur.length) words.push(cur); cur = []; } else cur.push(i);
  });
  if (cur.length) words.push(cur);
  const rows = [];
  let row = [];
  for (const w of words) {
    for (let k = 0; k < w.length; k += COLS) {
      const chunk = w.slice(k, k + COLS);
      if (row.length && row.length + 1 + chunk.length > COLS) { rows.push(row); row = []; }
      row = row.length ? [...row, -1, ...chunk] : chunk;
    }
  }
  if (row.length) rows.push(row);
  const top = Math.max(0, Math.floor((ROWS - rows.length) / 2));
  const grid = Array.from({ length: Math.max(ROWS, rows.length) }, () => Array(COLS).fill(-2));
  rows.forEach((r, ri) => {
    const left = Math.floor((COLS - r.length) / 2);
    r.forEach((v, ci) => { grid[top + ri][left + ci] = v; });
  });
  return grid;
}

// -2 = casella spenta, -1 = spazio tra parole (spenta), altrimenti indice del carattere.
export default function Board({ str }) {
  const prev = useRef(null);
  const flipped = useRef(new Map()); // indice → ritardo: la classe resta, così i ridisegni non interrompono l'animazione
  const chars = Array.from(str);
  const old = prev.current;
  const fresh = [];
  if (old && old.length === chars.length) chars.forEach((c, i) => { if (old[i] === '_' && c !== '_') fresh.push(i); });
  fresh.forEach((v, k) => { if (!flipped.current.has(v)) flipped.current.set(v, k * 160); });
  useEffect(() => { prev.current = chars; });
  const label = `Tabellone: ${chars.map((c) => (c === '_' ? 'lettera nascosta' : c)).join(' ')}`;
  return (
    <div className="board" role="img" aria-label={label}>
      {layout(str).map((row, r) => (
        <div className="brow" key={r}>
          {row.map((v, c) => {
            if (v < 0) return <i className="cell off" key={c} />;
            const ch = chars[v];
            if (!isLetter(ch)) return <i className="cell shown" key={c}>{ch}</i>;
            // carta a due facce: dorso verde (lettera nascosta) e fronte bianca con la lettera
            if (ch === '_') return <i className="cell card hid" key={c}><span className="inner"><span className="face back" /><span className="face front" /></span></i>;
            const delay = flipped.current.get(v);
            const k = delay === undefined ? -1 : 1;
            return (
              <i className="cell card" key={c}>
                <span className={`inner${k >= 0 ? ' flip' : ''}`} style={k >= 0 ? { animationDelay: `${delay}ms` } : undefined}>
                  <span className="face back" /><span className="face front">{ch}</span>
                </span>
              </i>
            );
          })}
        </div>
      ))}
    </div>
  );
}
