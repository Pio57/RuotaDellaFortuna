import { useCallback, useEffect, useRef, useState } from 'react';
import { Net } from './net.js';
import Board from './Board.jsx';
import Chat from './Chat.jsx';
import Editor from './Editor.jsx';
const SPRITZ = '🍹';

import { Entry, Lobby, Question, Reveal, End, WheelScreen, TEAMS, COLORS } from './Screens.jsx';

const get = (s, k) => { try { return JSON.parse(s.getItem(k)); } catch { return null; } };
const put = (s, k, v) => { try { s.setItem(k, JSON.stringify(v)); } catch { /* storage non disponibile */ } };
const del = (s, k) => { try { s.removeItem(k); } catch { /* idem */ } };

function Popup({ p, onClose }) {
  if (!p) return null;
  return (
    <div className="popup-wrap" onClick={onClose}>
      <div className={`popup ${p.tone}`} role="alert" key={p.key}>
        <strong>{p.title}</strong>
        {p.text && <span>{p.text}</span>}
      </div>
    </div>
  );
}

export default function App() {
  const [st, setSt] = useState(null);
  const [tick, setTick] = useState(null);
  const [up, setUp] = useState(false);
  const [role, setRole] = useState('none'); // none | player | host
  const [pid, setPid] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [proj, setProj] = useState(false);
  const [chat, setChat] = useState({ t: [], a: [] });
  const [unread, setUnread] = useState({ t: 0, a: 0 });
  const [msg, setMsg] = useState('');
  const [popup, setPopup] = useState(null);
  const popTimer = useRef(null);
  const lastLa = useRef(undefined);
  const net = useRef(null);
  const roleRef = useRef('none');
  const toastTimer = useRef(null);
  const setRoleBoth = (r) => { roleRef.current = r; setRole(r); };

  const toast = useCallback((m) => {
    setMsg(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setMsg(''), 3500);
  }, []);

  const pop = useCallback((p, ms = 3000) => {
    setPopup({ ...p, key: Date.now() });
    clearTimeout(popTimer.current);
    popTimer.current = setTimeout(() => setPopup(null), ms);
  }, []);

  useEffect(() => {
    const onMessage = (m) => {
      switch (m.t) {
        case 'joined':
          setRoleBoth('player'); setPid(m.pid);
          put(sessionStorage, 'pio', { ...(get(sessionStorage, 'pio') || {}), pid: m.pid, token: m.token });
          break;
        case 'created':
          setRoleBoth('host'); setPid(null);
          put(localStorage, 'pioHost', { code: m.code, key: m.key });
          put(sessionStorage, 'pioRole', 'host');
          break;
        case 'state':
          if (m.h && roleRef.current !== 'host') { setRoleBoth('host'); put(sessionStorage, 'pioRole', 'host'); }
          setSt(m); setTick({ r: m.r, b: m.b });
          break;
        case 'tick': setTick({ r: m.r, b: m.b }); break;
        case 'chat': {
          const k = m.s === 't' ? 't' : 'a';
          setChat((c) => ({ ...c, [k]: [...c[k], m].slice(-200) }));
          setUnread((u) => ({ ...u, [k]: u[k] + 1 }));
          break;
        }
        case 'error':
          if (roleRef.current === 'none') {
            if (m.code === 'forbidden' || m.code === 'bad_code') { del(sessionStorage, 'pio'); del(sessionStorage, 'pioRole'); }
            setError(m.msg);
          }
          toast(m.msg);
          break;
        default: break;
      }
    };
    const n = new Net({
      onMessage,
      onStatus: setUp,
      onOpen: () => {
        const p = get(sessionStorage, 'pio');
        const hk = get(localStorage, 'pioHost');
        if (get(sessionStorage, 'pioRole') === 'host' && hk) n.send({ t: 'host:resume', code: hk.code, key: hk.key });
        else if (p) n.send({ t: 'join', code: p.code, first: p.first, last: p.last, pid: p.pid, token: p.token });
      },
    });
    net.current = n;
    return () => n.close();
  }, [toast]);

  const hostSend = useCallback((t, extra = {}) => {
    const hk = get(localStorage, 'pioHost');
    if (hk && !net.current.send({ t, key: hk.key, ...extra })) toast('Connessione assente.');
  }, [toast]);

  const host = role === 'host';
  const me = st && st.p.find((p) => p[0] === pid);
  const inRound = st && (st.ph === 'q' || st.ph === 'rev');
  const params = new URLSearchParams(location.search);

  // Pop-up per gli eventi di gioco: lettera trovata, frase indovinata, bancarotta.
  const laId = st && st.la ? st.la.id : null;
  useEffect(() => {
    if (lastLa.current === undefined) { lastLa.current = laId; return; }
    if (!laId || laId === lastLa.current) return;
    lastLa.current = laId;
    const la = st.la;
    const mineTeam = me && me[2] === la.team;
    const who = TEAMS[la.team];
    if (la.kind === 'hit') pop({ tone: 'good', title: `+${la.pts} ${SPRITZ}`, text: `${who}: la ${la.l} c’è ${la.n} ${la.n > 1 ? 'volte' : 'volta'}` }, 2500);
    else if (la.kind === 'solve' || la.kind === 'complete') {
      const total = st.rv ? st.rv.tr[la.team] : la.pts;
      pop({ tone: 'win', title: mineTeam ? 'Bravissimi, avete vinto!' : `Bravi ${who}, hanno indovinato!`, text: `${mineTeam ? 'La tua squadra ha' : who + ' ha'} guadagnato ${total} ${SPRITZ} in questo round` }, 5000);
    } else if (la.kind === 'bankrupt') pop({ tone: 'bad', title: 'Bancarotta!', text: `${who} perde ${la.lost} ${SPRITZ} e il turno` }, 3500);
  }, [laId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSpinResult = useCallback((v, turn, isMine) => {
    const who = TEAMS[turn];
    if (v > 0) pop({ tone: 'good', title: `${v} spritz!`, text: isMine ? 'Ora scegli una lettera' : `${who}: ${v} spritz per ogni lettera giusta` }, 2800);
    else if (v === 0) pop({ tone: 'bad', title: 'Passa!', text: `${who} perde il turno` }, 2800);
    else pop({ tone: 'bad', title: 'Bancarotta!', text: 'Si perdono il turno e gli spritz del round' }, 2800);
  }, [pop]);

  let body;
  if (!st || role === 'none') {
    body = (
      <Entry
        initialCode={(params.get('c') || '').toUpperCase().slice(0, 4)}
        error={error}
        canResume={!!get(localStorage, 'pioHost')}
        onCreate={() => net.current.send({ t: 'host:create' })}
        onResume={() => { const k = get(localStorage, 'pioHost'); if (k) net.current.send({ t: 'host:resume', code: k.code, key: k.key }); }}
        onJoin={(first, last, code) => {
          put(sessionStorage, 'pio', { code, first, last });
          setError('');
          if (!net.current.send({ t: 'join', code, first, last })) setError('Connessione assente, riprova tra poco.');
        }}
      />
    );
  } else if (st.ph === 'lobby') body = <Lobby st={st} host={host} pid={pid} hostSend={hostSend} onEdit={() => setEditing(true)} toast={toast} />;
  else if (st.ph === 'q') body = <Question st={st} tick={tick} host={host} pid={pid} up={up} hostSend={hostSend} onGuess={(l) => net.current.send({ t: 'guess', l })} onSolve={(a) => net.current.send({ t: 'solve', a })} onSpin={() => net.current.send({ t: 'spin' })} onSpinResult={onSpinResult} />;
  else if (st.ph === 'rev') body = <Reveal st={st} host={host} hostSend={hostSend} />;
  else if (st.ph === 'end') body = <End st={st} host={host} hostSend={hostSend} />;
  else body = <WheelScreen st={st} host={host} hostSend={hostSend} />;

  return (
    <div className={`app${proj && host ? ' proj' : ''}`}>
      <header className="top">
        <h1><span>Chi è</span> Pio?</h1>
        <div className="row">
          {st && role !== 'none' && <span className="badge" style={me ? { borderColor: COLORS[me[2]] } : undefined}>{host ? `Host · ${st.c}` : me ? `${st.cap[me[2]] === pid ? '★ ' : ''}${TEAMS[me[2]]} · ${st.c}` : st.c}</span>}
          {host && <button className="btn sm" type="button" onClick={() => setProj(!proj)}>Proiettore</button>}
          {!up && <span className="badge off" role="status">Connessione assente</span>}
        </div>
      </header>
      {inRound && role !== 'none' && <Board key={`${st.c}:${st.ri}`} str={st.ph === 'q' && tick ? tick.b : st.b} />}
      <main>{body}</main>
      {st && role !== 'none' && (
        <Chat chat={chat} unread={unread} setUnread={setUnread} host={host} up={up} teams={TEAMS} colors={COLORS}
          onSend={(tab, m) => (host ? hostSend('host:chat', { m }) : net.current.send({ t: 'chat', s: tab, m }))} />
      )}
      {editing && host && st.cfg && <Editor cfg={st.cfg} onClose={() => setEditing(false)} onSave={(c) => hostSend('host:config', c)} />}
      <Popup p={popup} onClose={() => setPopup(null)} />
      <div id="toast" className={msg ? 'on' : ''} role="status" aria-live="polite">{msg}</div>
    </div>
  );
}
