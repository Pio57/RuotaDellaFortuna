import { useEffect, useRef, useState } from 'react';

export const WEDGES = ['#e4261c', '#ffd100', '#1c6fd1', '#2fa84f', '#8a2f9c', '#ff7a00'];
const DARK_TEXT = [false, true, false, false, false, false];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const polar = (a, r) => [160 + r * Math.sin((a * Math.PI) / 180), 160 - r * Math.cos((a * Math.PI) / 180)];

function wrap(text, width = 13, max = 3) {
  const out = [];
  let line = '';
  for (const w of text.split(' ')) {
    if (line && (line + ' ' + w).length > width) { out.push(line); line = w; } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  if (out.length > max) { out.length = max; out[max - 1] = out[max - 1].slice(0, width - 1) + '…'; }
  return out;
}

// Ruota a 6 spicchi con bulbi sul bordo; l'angolo finale arriva già calcolato dal server (tg, jt).
export default function Wheel({ w, winners, teams, onDone, variant = 'prize' }) {
  const rotor = useRef(null);
  const last = useRef(null);
  const [spinning, setSpinning] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (last.current === w.id) return undefined;
    last.current = w.id;
    setSpinning(true); setDone(false);
    const dur = reduced() ? 800 : 6000;
    const angle = 360 * 6 + ((360 - (w.tg * 60 + 30)) % 360) + w.jt;
    const el = rotor.current;
    el.style.transition = 'none';
    el.style.transform = 'rotate(0deg)';
    void el.getBoundingClientRect();
    el.style.transition = `transform ${dur}ms cubic-bezier(.12,.6,.1,1)`;
    el.style.transform = `rotate(${angle}deg)`;
    const t = setTimeout(() => { setSpinning(false); setDone(true); onDone?.(); }, dur + 100);
    return () => clearTimeout(t);
  }, [w.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = `Ruota con 6 premi: ${w.l.map((l, i) => `${i + 1} ${l}`).join(', ')}`;
  return (
    <div className="wheel-stage">
      <div className={`wheelbox${spinning ? ' spinning' : ''}${variant === 'turn' ? ' compact' : ''}`}>
        <div className="flapper" />
        <svg viewBox="0 0 320 320" role="img" aria-label={label}>
          <circle cx="160" cy="160" r="158" fill="#7a5a00" />
          <circle cx="160" cy="160" r="154" fill="url(#gold)" />
          <defs>
            <radialGradient id="gold" cx="50%" cy="35%"><stop offset="0" stopColor="#fff2a8" /><stop offset="1" stopColor="#c8920a" /></radialGradient>
            <radialGradient id="hub" cx="40%" cy="35%"><stop offset="0" stopColor="#fff6c2" /><stop offset="1" stopColor="#b8860b" /></radialGradient>
          </defs>
          <g ref={rotor} style={{ transformOrigin: '160px 160px' }}>
            {w.l.map((txt, i) => {
              const [x1, y1] = polar(i * 60, 140); const [x2, y2] = polar(i * 60 + 60, 140);
              const lines = wrap(txt);
              return (
                <g key={i}>
                  <path d={`M160 160 L${x1} ${y1} A140 140 0 0 1 ${x2} ${y2} Z`} fill={WEDGES[i]} stroke="#fff" strokeWidth="2" />
                  <g transform={`rotate(${i * 60 + 30} 160 160)`}>
                    <text transform="translate(160 160) rotate(-90)" textAnchor="end" fill={DARK_TEXT[i] ? '#1a1a1a' : '#fff'} fontFamily="Barlow Condensed, sans-serif" fontWeight="700" fontSize="15">
                      {lines.map((ln, k) => <tspan key={k} x="128" y={(k - (lines.length - 1) / 2) * 15 + 5}>{ln.toUpperCase()}</tspan>)}
                    </text>
                  </g>
                </g>
              );
            })}
            {[0, 1, 2, 3, 4, 5].map((i) => { const [x, y] = polar(i * 60, 140); return <circle key={i} cx={x} cy={y} r="5" fill="#fff" stroke="#8a6a00" />; })}
          </g>
          {Array.from({ length: 18 }, (_, i) => { const [x, y] = polar(i * 20, 149); return <circle key={i} className="bulb" style={{ animationDelay: `${(i % 2) * 0.25}s` }} cx={x} cy={y} r="3.2" />; })}
          <circle cx="160" cy="160" r="22" fill="url(#hub)" stroke="#7a5a00" strokeWidth="3" />
        </svg>
      </div>
      {done && variant === 'turn' && (
        <div className="prize small" aria-live="polite">
          <small>La ruota dice</small>
          <strong>{w.l[w.tg]}</strong>
        </div>
      )}
      {done && variant !== 'turn' && (
        <div className="prize" aria-live="polite">
          <small>Hai vinto</small>
          <strong>{w.l[w.tg]}</strong>
          <span>{winners.length ? winners.map((t) => teams[t]).join(' · ') : '—'}</span>
        </div>
      )}
    </div>
  );
}
