import { useEffect, useState } from 'react';
import Wheel from './Wheel.jsx';

const SPRITZ = '🍹';

export const TEAMS = ['Squadra verde', 'Squadra blu', 'Squadra rossa'];
export const COLORS = ['#34d27b', '#5aa9ff', '#ff7a45'];

export function Entry({ onJoin, onCreate, onResume, canResume, error, initialCode }) {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [code, setCode] = useState(initialCode);
  const [local, setLocal] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (!first.trim() || !last.trim()) return setLocal('Inserisci nome e cognome.');
    if (code.trim().length !== 4) return setLocal('Il codice ha 4 caratteri.');
    setLocal('');
    return onJoin(first.trim(), last.trim(), code.trim().toUpperCase());
  };
  return (
    <>
      <form className="panel" onSubmit={submit}>
        <h2>Entra in partita</h2>
        <div className="field"><label htmlFor="first">Nome</label><input id="first" value={first} maxLength={24} autoComplete="given-name" onChange={(e) => setFirst(e.target.value)} /></div>
        <div className="field"><label htmlFor="last">Cognome</label><input id="last" value={last} maxLength={24} autoComplete="family-name" onChange={(e) => setLast(e.target.value)} /></div>
        <div className="field"><label htmlFor="code">Codice sessione</label><input id="code" value={code} maxLength={4} autoCapitalize="characters" autoComplete="off" spellCheck={false} onChange={(e) => setCode(e.target.value.toUpperCase())} /></div>
        <div className="err" role="alert">{local || error}</div>
        <button className="btn gold" type="submit">Entra</button>
      </form>
      <div className="panel">
        <h3>Sei Pio?</h3>
        <div className="row">
          <button className="btn" type="button" onClick={onCreate}>Nuova sessione</button>
          {canResume && <button className="btn" type="button" onClick={onResume}>Riprendi sessione</button>}
        </div>
      </div>
    </>
  );
}

export function Lobby({ st, host, pid, hostSend, onEdit, toast }) {
  const copy = () => {
    const url = `${location.origin}/?c=${st.c}`;
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('Link copiato.'), () => toast(url));
  };
  return (
    <>
      {host && (
        <div className="panel">
          <div className="code" aria-label="Codice sessione">{st.c}</div>
          <div className="row">
            <button className="btn" type="button" onClick={copy}>Copia link</button>
            <button className="btn" type="button" onClick={() => hostSend('host:shuffle')}>Mescola squadre</button>
            <button className="btn" type="button" onClick={onEdit}>Round e premi</button>
            <button className="btn gold" type="button" disabled={!st.p.length} onClick={() => hostSend('host:start')}>Avvia il gioco</button>
          </div>
          <p className="muted">Ogni squadra ha un capitano (★): è l’unico che sceglie le lettere. Gli altri parlano in chat o a voce.</p>
        </div>
      )}
      <div className="panel">
        <h2>Squadre</h2>
        <div className="teams">
          {TEAMS.map((n, t) => {
            const mem = st.p.filter((p) => p[2] === t);
            return (
              <div className="team" key={t} style={{ '--tc': COLORS[t] }}>
                <h3>{n} ({mem.length})</h3>
                <ul>
                  {mem.map((p) => (
                    <li key={p[0]}>
                      <span className={p[0] === pid ? 'me' : ''}>{st.cap[t] === p[0] ? '★ ' : ''}{p[1]}</span>
                      {host && (
                        <span className="row tight">
                          {st.cap[t] !== p[0] && <button className="btn sm" type="button" aria-label={`Rendi ${p[1]} capitano`} onClick={() => hostSend('host:captain', { pid: p[0] })}>★</button>}
                          <button className="btn sm" type="button" aria-label={`Sposta ${p[1]} nella squadra successiva`} onClick={() => hostSend('host:move', { pid: p[0] })}>→</button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        {!host && <p className="muted">In attesa che Pio avvii il gioco…</p>}
      </div>
    </>
  );
}

const KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function lastAction(la, st) {
  if (!la) return null;
  const who = TEAMS[la.team];
  switch (la.kind) {
    case 'hit': return `${who}: la ${la.l} c’è ${la.n} ${la.n > 1 ? 'volte' : 'volta'} (+${la.pts} ${SPRITZ})`;
    case 'miss': return `${who}: la ${la.l} non c’è`;
    case 'solve': return `${who} ha risolto la frase! (+${la.pts} ${SPRITZ})`;
    case 'complete': return `${who} ha scoperto l’ultima lettera! (+${la.pts} ${SPRITZ})`;
    case 'bankrupt': return `${who}: BANCAROTTA! Perde ${la.lost} ${SPRITZ} e il turno`;
    case 'pass': return `${who}: la ruota dice Passa!`;
    case 'fail': return `${who}: la frase non è questa`;
    case 'timeout': return `${who}: tempo scaduto`;
    default: return st && null;
  }
}

// Classifica con la squadra in testa e i nomi di ogni squadra (★ = capitano, ▶ = di turno).
export function Scoreboard({ st, pid }) {
  const max = Math.max(...st.sc);
  const order = [0, 1, 2].sort((x, y) => st.sc[y] - st.sc[x] || x - y);
  return (
    <div className="board-stats" aria-label="Classifica">
      {order.map((t) => {
        const mem = st.p.filter((p) => p[2] === t);
        const lead = max > 0 && st.sc[t] === max;
        return (
          <div key={t} className={`stat${lead ? ' lead' : ''}${st.turn === t && st.ph === 'q' ? ' turn-now' : ''}`} style={{ '--tc': COLORS[t] }}>
            <div className="stat-head">
              <b>{st.turn === t && st.ph === 'q' ? '▶ ' : ''}{lead ? '👑 ' : ''}{TEAMS[t]}</b>
              <span className="stat-score">{st.sc[t]} {SPRITZ}</span>
            </div>
            <div className="stat-names">
              {mem.length ? mem.map((p, i) => (
                <span key={p[0]} className={p[0] === pid ? 'me' : ''}>{i ? ', ' : ''}{st.cap[t] === p[0] ? '★' : ''}{p[1]}</span>
              )) : '—'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Question({ st, tick, host, pid, up, onGuess, onSolve, onSpin, onSpinResult, hostSend }) {
  const [attempt, setAttempt] = useState('');
  const [ready, setReady] = useState(false);
  const spinId = st.sp ? st.sp.id : 0;
  useEffect(() => { setReady(false); }, [spinId, st.turn, st.ri]);
  const r = tick ? tick.r : st.r;
  const captainId = st.cap[st.turn];
  const captain = st.p.find((p) => p[0] === captainId);
  const mine = !host && captainId === pid;
  const labels = st.tw.map((v) => (v > 0 ? `${v} spritz` : v === 0 ? 'Passa' : 'Bancarotta'));
  const sp = st.sp ? { id: st.sp.id, tg: st.sp.tg, jt: st.sp.jt, l: labels } : { id: 0, tg: 0, jt: 0, l: labels };
  const canPick = mine && up && st.sp && st.sp.v > 0 && ready;
  const used = new Map(st.called.map((c) => [c[0], c[1]]));
  const msg = lastAction(st.la, st);
  const submit = (e) => {
    e.preventDefault();
    if (!attempt.trim()) return;
    onSolve(attempt.trim());
    setAttempt('');
  };
  return (
    <>
      <div className="qhead"><span>Round {st.ri + 1} di {st.n}</span><span>{r} s</span></div>
      <div className="timebar"><i style={{ width: `${(100 * r) / st.tot}%` }} /></div>
      <div className="question">{st.q.t}</div>
      <div className="turn" style={{ '--tc': COLORS[st.turn] }} role="status" aria-live="polite">
        <strong>Tocca a {TEAMS[st.turn]}</strong>
        <span>{mine ? (st.sp ? (canPick ? 'Capitano: scegli una lettera.' : 'La ruota gira…') : 'Capitano: premi la ruota per girare.') : captain ? `Capitano: ${captain[1]}` : ''}</span>
      </div>
      {msg && <div className="la" style={{ '--tc': COLORS[st.la.team] }} aria-live="polite">{msg}</div>}
      <Wheel w={sp} variant="turn" idle={!st.sp} onDone={() => { setReady(true); if (st.sp) onSpinResult(st.sp.v, st.turn, mine); }}
        onPress={mine && !st.sp && up ? onSpin : undefined} pressLabel="Premi per girare" />
      {!st.sp && !mine && <p className="muted center">{captain ? `${captain[1]} deve girare la ruota…` : 'In attesa della ruota…'}</p>}
      {(!mine || canPick) && <div className="keys" role="group" aria-label="Lettere">
        {KEYS.map((k) => {
          const by = used.get(k);
          return (
            <button key={k} type="button" className={`key${by !== undefined ? ' used' : ''}`} style={by !== undefined ? { '--tc': COLORS[by] } : undefined}
              disabled={!canPick || by !== undefined} onClick={() => onGuess(k)}>{k}</button>
          );
        })}
      </div>}
      {mine && (
        <form className="panel solve" onSubmit={submit}>
          <label htmlFor="solve">Sai la frase? Prova a risolverla (se sbagli perdi il turno)</label>
          <div className="row">
            <input id="solve" value={attempt} maxLength={80} autoComplete="off" onChange={(e) => setAttempt(e.target.value)} />
            <button className="btn gold" type="submit" disabled={!up}>Risolvi</button>
          </div>
        </form>
      )}
      {!mine && !host && <p className="muted">Discutete con la squadra in chat o a voce: il capitano gira la ruota e sceglie le lettere per tutti.</p>}
      <Scoreboard st={st} pid={pid} />
      {host && <button className="btn gold" type="button" onClick={() => hostSend('host:close')}>Chiudi il round</button>}
    </>
  );
}

function Standings({ st }) {
  const order = [0, 1, 2].sort((a, b) => st.sc[b] - st.sc[a]);
  return (
    <ul className="stand">
      {order.map((t) => <li key={t} className={(st.win || []).includes(t) ? 'win' : ''} style={{ '--tc': COLORS[t] }}><span>{TEAMS[t]}</span><span>{st.sc[t]} {SPRITZ}</span></li>)}
    </ul>
  );
}

export function Reveal({ st, host, hostSend }) {
  const by = st.rv.by;
  const last = st.ri + 1 >= st.n;
  return (
    <>
      <div className="next-bar">
        {host
          ? <button className="btn gold big-btn" type="button" onClick={() => hostSend('host:next')}>{last ? 'Fine partita' : 'Round successivo ▶'}</button>
          : <p className="muted center">{last ? 'In attesa che Pio chiuda la partita…' : 'In attesa che Pio passi al round successivo…'}</p>}
      </div>
      <div className="question">{st.q.t}</div>
      <div className="panel">
        <h2>{by >= 0 ? `${TEAMS[by]} ha risolto il round` : 'Round chiuso'}</h2>
        <div className="res">
          {TEAMS.map((n, t) => (
            <div key={t} style={{ '--tc': COLORS[t] }}><span><b>{n}</b></span><span className="pts">+{st.rv.tr[t]} {SPRITZ}</span></div>
          ))}
        </div>
        {st.rv.an && <p>{st.rv.an}</p>}
      </div>
      <div className="panel"><h2>Classifica</h2><Standings st={st} /></div>
    </>
  );
}

// Finale: classifica, ruota dei premi (la gira il capitano della squadra vincitrice) e riscatto del premio.
export function Final({ st, host, pid, up, hostSend, onSpin, onClaim }) {
  const [ready, setReady] = useState(false);
  const spinId = st.w ? st.w.id : 0;
  useEffect(() => { setReady(false); }, [spinId]);
  const me = st.p.find((p) => p[0] === pid);
  const mine = !!me && st.win.includes(me[2]);
  const winCaps = st.win.map((t) => st.p.find((p) => p[0] === st.cap[t])).filter(Boolean);
  const iAmCap = !host && winCaps.some((c) => c[0] === pid);
  const w = st.w || { id: 0, tg: 0, jt: 0, l: st.pw };
  const title = st.win.length ? `${st.win.length > 1 ? 'Pari merito: ' : 'Vince la '}${st.win.map((t) => TEAMS[t].toLowerCase()).join(', ')}` : 'Partita finita';
  return (
    <>
      <div className="panel"><div className="big">{title}</div><Standings st={st} /></div>
      <Wheel w={w} winners={st.win} teams={TEAMS} idle={!st.w} onDone={() => setReady(true)}
        onPress={iAmCap && !st.w && up ? onSpin : undefined} pressLabel="Premi per girare" />
      {!st.w && !iAmCap && (
        <p className="muted center">{winCaps.length ? `${winCaps.map((c) => c[1]).join(' o ')} deve girare la ruota dei premi…` : 'In attesa della ruota dei premi…'}</p>
      )}
      {st.w && ready && mine && !st.w.cl && (
        <button className="btn gold big-btn" type="button" disabled={!up} onClick={onClaim}>Riscatta il premio</button>
      )}
      {st.w && ready && !mine && !st.w.cl && <p className="muted center">{host ? 'In attesa che i vincitori riscattino il premio…' : 'Il premio spetta alla squadra vincitrice.'}</p>}
      {st.w && st.w.cl && (
        <div className="panel voucher">
          <strong>✔ Premio riscattato</strong>
          <span className="voucher-prize">{st.w.l[st.w.tg]}</span>
          <span>da {st.w.cl.name} ({TEAMS[st.w.cl.team]})</span>
          <small>{mine || host ? 'Mostra questa schermata a Pio per ritirare il premio.' : ''}</small>
        </div>
      )}
      {host && (
        <div className="row">
          {st.w && <button className="btn" type="button" disabled={!ready} onClick={() => hostSend('host:spin')}>Gira ancora</button>}
          {!st.w && <button className="btn" type="button" onClick={() => hostSend('host:spin')}>Gira la ruota (host)</button>}
          <button className="btn" type="button" onClick={() => hostSend('host:reset')}>Nuova partita</button>
        </div>
      )}
    </>
  );
}
