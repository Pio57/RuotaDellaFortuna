import { useCallback, useEffect, useRef, useState } from 'react';
import { Net } from './net.js';
import Board from './Board.jsx';
import Chat from './Chat.jsx';
import Editor from './Editor.jsx';
import { Entry, Lobby, Question, Reveal, End, WheelScreen, TEAMS, COLORS } from './Screens.jsx';

const get = (s, k) => { try { return JSON.parse(s.getItem(k)); } catch { return null; } };
const put = (s, k, v) => { try { s.setItem(k, JSON.stringify(v)); } catch { /* storage non disponibile */ } };
const del = (s, k) => { try { s.removeItem(k); } catch { /* idem */ } };

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
  const net = useRef(null);
  const roleRef = useRef('none');
  const toastTimer = useRef(null);
  const setRoleBoth = (r) => { roleRef.current = r; setRole(r); };

  const toast = useCallback((m) => {
    setMsg(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setMsg(''), 3500);
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
  else if (st.ph === 'q') body = <Question st={st} tick={tick} host={host} pid={pid} up={up} hostSend={hostSend} onGuess={(l) => net.current.send({ t: 'guess', l })} onSolve={(a) => net.current.send({ t: 'solve', a })} />;
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
      <div id="toast" className={msg ? 'on' : ''} role="status" aria-live="polite">{msg}</div>
    </div>
  );
}
