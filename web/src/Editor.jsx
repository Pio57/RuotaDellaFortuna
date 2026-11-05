import { useState } from 'react';

const blank = () => ({ cat: '', t: '', bd: '', an: '' });

function Field({ label, children }) {
  return <div className="field"><label>{label}{children}</label></div>;
}

// Editor di round e premi (solo host). Lo stato è locale: i messaggi del server non lo toccano.
export default function Editor({ cfg, onSave, onClose }) {
  const [rounds, setRounds] = useState(() => JSON.parse(JSON.stringify(cfg.rounds)));
  const [secs, setSecs] = useState(cfg.set.secs);
  const [rig, setRig] = useState(cfg.set.rig);
  const [wheel, setWheel] = useState(cfg.set.wheel.slice());
  const [err, setErr] = useState('');

  const upd = (i, patch) => setRounds((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const save = () => {
    const bad = rounds.findIndex((r) => !r.cat.trim() || !r.t.trim() || !/\p{L}/u.test(r.bd));
    if (bad >= 0) return setErr(`Round ${bad + 1}: categoria, indizio e frase da indovinare (con almeno una lettera) sono obbligatori.`);
    if (wheel.some((p) => !p.trim())) return setErr('Servono sei premi.');
    onSave({ rounds, set: { secs: Number(secs), rig, wheel } });
    return onClose();
  };

  return (
    <div className="editor" role="dialog" aria-modal="true" aria-label="Round e premi">
      <div className="in">
        <h2>Round e premi</h2>
        <fieldset>
          <legend>Impostazioni</legend>
          <Field label="Tempo per turno">
            <select value={secs} onChange={(e) => setSecs(e.target.value)}>{[15, 30, 45, 60, 90].map((n) => <option key={n} value={n}>{n} secondi</option>)}</select>
          </Field>
          <label className="row"><input type="checkbox" checked={rig} onChange={(e) => setRig(e.target.checked)} /> La ruota si ferma sul caffè (rig)</label>
        </fieldset>
        <fieldset>
          <legend>Premi della ruota (6)</legend>
          {wheel.map((p, i) => (
            <div className="field" key={i}><input value={p} maxLength={36} aria-label={`Premio ${i + 1}`} onChange={(e) => setWheel(wheel.map((x, k) => (k === i ? e.target.value : x)))} /></div>
          ))}
        </fieldset>
        {rounds.map((r, i) => (
          <fieldset key={i}>
            <legend>Round {i + 1}</legend>
            <Field label="Titolo sopra il tabellone (max 18)"><input value={r.cat} maxLength={18} onChange={(e) => upd(i, { cat: e.target.value })} /></Field>
            <Field label="Indizio / domanda (max 140)"><textarea rows={3} value={r.t} maxLength={140} onChange={(e) => upd(i, { t: e.target.value })} /></Field>
            <Field label="Frase nascosta sul tabellone (max 50)"><input value={r.bd} maxLength={50} onChange={(ev) => upd(i, { bd: ev.target.value })} /></Field>
            <Field label="Aneddoto (max 240)"><textarea rows={3} value={r.an} maxLength={240} onChange={(e) => upd(i, { an: e.target.value })} /></Field>
            {rounds.length > 1 && <button className="btn" type="button" onClick={() => setRounds(rounds.filter((_, k) => k !== i))}>Elimina round</button>}
          </fieldset>
        ))}
        <button className="btn" type="button" onClick={() => (rounds.length < 6 ? setRounds([...rounds, blank()]) : setErr('Massimo 6 round.'))}>Aggiungi round</button>
        <div className="err" role="alert">{err}</div>
        <div className="row">
          <button className="btn gold" type="button" onClick={save}>Salva</button>
          <button className="btn" type="button" onClick={onClose}>Annulla</button>
        </div>
      </div>
    </div>
  );
}
