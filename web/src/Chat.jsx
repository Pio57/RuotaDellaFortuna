import { useEffect, useRef, useState } from 'react';

export default function Chat({ chat, unread, setUnread, host, up, onSend, teams, colors }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(host ? 'a' : 't');
  const [text, setText] = useState('');
  const log = useRef(null);
  const total = unread.t + unread.a;

  useEffect(() => { if (open && log.current) log.current.scrollTop = log.current.scrollHeight; }, [open, tab, chat]);
  useEffect(() => { if (open && unread[tab]) setUnread((u) => ({ ...u, [tab]: 0 })); }, [open, tab, unread, setUnread]);

  const submit = (e) => {
    e.preventDefault();
    const m = text.trim();
    if (!m || !up) return;
    onSend(tab, m);
    setText('');
  };

  return (
    <div className="dock">
      {open && (
        <div className="chat">
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 't'} onClick={() => setTab('t')}>Squadra{unread.t ? ` (${unread.t})` : ''}</button>
            <button type="button" role="tab" aria-selected={tab === 'a'} onClick={() => setTab('a')}>Tutti{unread.a ? ` (${unread.a})` : ''}</button>
          </div>
          <div className="log" role="log" aria-live="polite" aria-label="Messaggi" ref={log}>
            {chat[tab].map((m, i) => (
              <div className="msg" key={i}>
                <b style={m.team >= 0 ? { color: colors[m.team] } : undefined}>{m.team >= 0 ? `${m.n} (${teams[m.team]})` : m.n}: </b>{m.m}
              </div>
            ))}
          </div>
          {host && tab === 't' && <p className="muted hint">Qui leggi i messaggi di tutte le squadre. Per scrivere usa la scheda «Tutti».</p>}
          {!(host && tab === 't') && (
            <form onSubmit={submit}>
              <input value={text} maxLength={200} onChange={(e) => setText(e.target.value)} disabled={!up} aria-label="Scrivi un messaggio" autoComplete="off" />
              <button className="btn gold" type="submit" disabled={!up}>Invia</button>
            </form>
          )}
        </div>
      )}
      <button className="btn gold toggle" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        Chat{total && !open ? <span className="n">{total}</span> : null}
      </button>
    </div>
  );
}
