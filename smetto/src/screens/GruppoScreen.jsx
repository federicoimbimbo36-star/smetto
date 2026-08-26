import { ArrowLeft, Plus, Copy, Users, Check, LogOut } from 'lucide-react';
import { durata, relativeTime } from '../utils/format';
import { AvatarCircle } from '../components';

export default function GruppoScreen(props) {
  const {
    gruppi, attivo, setAttivo, membri, me, step, setStep, nome, setNome,
    codiceInput, setCodiceInput, joinError, joinPreview, onCrea, onVerifica,
    onConfermaJoin, onEsci, onCopia, classifica, ordine, setOrdine,
    periodo, setPeriodo, feed, ultimoSync, ioAttivo,
  } = props;

  const medaglie = ['🥇', '🥈', '🥉'];
  const gruppo = gruppi.find((g) => g.code === attivo) || null;
  const attivi = classifica.filter((m) => m.attivo);

  /* 'menu' è lo stato a riposo: con almeno un gruppo mostra la classifica.
     Per crearne o aggiungerne un altro serve uno stato a parte ('aggiungi'),
     altrimenti il pulsante "+" non porta da nessuna parte e tutta la parte
     multi-gruppo diventa irraggiungibile. */
  const inAggiunta = step === 'crea' || step === 'entra' || step === 'aggiungi';

  if (inAggiunta || gruppi.length === 0) {
    return (
      <div className="screen">
        {step !== 'menu' && (
          <button className="back-row" onClick={() => setStep('menu')}><ArrowLeft size={18} /> <span>Indietro</span></button>
        )}

        {(step === 'menu' || step === 'aggiungi') && (
          <>
            <h1 className="screen-title">
              {gruppi.length === 0 ? 'Smettere da soli è più difficile' : 'Aggiungi un altro gruppo'}
            </h1>
            <p className="screen-sub">
              Chi ha qualcuno che lo guarda molla molto meno. Crea un gruppo con altri che ci stanno
              provando: si vede chi fuma meno, e ogni sigaretta registrata avvisa gli altri.
            </p>
            <button className="big-choice-card" onClick={() => setStep('crea')}>
              <div className="big-choice-emoji">✨</div>
              <div>
                <div className="big-choice-title">Crea un gruppo</div>
                <div className="big-choice-sub">Scegli il nome e invita gli amici col codice</div>
              </div>
            </button>
            <button className="big-choice-card" onClick={() => setStep('entra')}>
              <div className="big-choice-emoji">🔗</div>
              <div>
                <div className="big-choice-title">Entra con un codice</div>
                <div className="big-choice-sub">Qualcuno ti ha già invitato</div>
              </div>
            </button>
            <p className="policy-note">
              Puoi stare in più gruppi insieme — gli amici, la famiglia, i colleghi — e non devono
              conoscersi tra loro. Ma la dichiarazione è una sola: gli stessi numeri arrivano
              identici a tutti.
            </p>
          </>
        )}

        {step === 'crea' && (
          <>
            <h1 className="screen-title">Come si chiama il gruppo?</h1>
            <input className="text-input" placeholder="Es. Quelli che smettono" value={nome}
              onChange={(e) => setNome(e.target.value)} autoFocus />
            <button className="btn btn-primary btn-block" disabled={!nome.trim()} onClick={onCrea}>Crea il gruppo</button>
          </>
        )}

        {step === 'entra' && (
          <>
            <h1 className="screen-title">Inserisci il codice invito</h1>
            <input className="text-input" placeholder="Es. K7RQ2M" value={codiceInput}
              onChange={(e) => setCodiceInput(e.target.value.toUpperCase())} autoFocus />
            {joinError && <p className="field-error">{joinError}</p>}
            {!joinPreview && (
              <button className="btn btn-primary btn-block" disabled={!codiceInput.trim()} onClick={onVerifica}>Verifica codice</button>
            )}
            {joinPreview && (
              <div className="join-preview-card">
                <div className="join-preview-title">{joinPreview.name}</div>
                <div className="join-preview-sub">{joinPreview.memberCount} membri</div>
                <button className="btn btn-primary btn-block" onClick={onConfermaJoin}>Unisciti al gruppo</button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="gruppi-switch">
        {gruppi.map((g) => (
          <button key={g.code} className={`gruppo-pill ${g.code === attivo ? 'gruppo-pill-on' : ''}`}
            onClick={() => setAttivo(g.code)}>
            {g.name}
          </button>
        ))}
        <button className="gruppo-pill gruppo-pill-add" onClick={() => setStep('aggiungi')} aria-label="Aggiungi un gruppo">
          <Plus size={15} />
        </button>
      </div>

      <h1 className="screen-title">{gruppo?.name}</h1>
      <p className="screen-sub">
        {membri.length} {membri.length === 1 ? 'membro' : 'membri'} · primo chi fuma meno
        {ultimoSync && <span className="faint"> · aggiornato {relativeTime(ultimoSync)}</span>}
      </p>

      {!ioAttivo && (
        <div className="avviso-inattivo">
          <b>Sei fuori dalla classifica.</b> Non registri da più di un giorno: per rientrare basta
          segnare una sigaretta o confermare che oggi sei a zero.
        </div>
      )}

      <div className="segmented">
        {['giorno', 'settimana', 'mese'].map((p) => (
          <button key={p} className={periodo === p ? 'segmented-item active' : 'segmented-item'} onClick={() => setPeriodo(p)}>
            {p === 'giorno' ? 'Oggi' : p === 'settimana' ? 'Settimana' : 'Mese'}
          </button>
        ))}
      </div>

      <div className="order-row">
        <button className={`order-btn ${ordine === 'meno' ? 'order-active' : ''}`} onClick={() => setOrdine('meno')}>Meno sigarette</button>
        <button className={`order-btn ${ordine === 'calo' ? 'order-active' : ''}`} onClick={() => setOrdine('calo')}>Più in calo</button>
      </div>

      <div className="leaderboard">
        {classifica.map((m, i) => (
          <div key={m.id} className={`leaderboard-row ${m.id === me.id ? 'leaderboard-me' : ''} ${m.attivo ? '' : 'leaderboard-fuori'}`}>
            <div className="leaderboard-rank">
              {m.attivo ? (medaglie[i] || `#${i + 1}`) : '—'}
            </div>
            <AvatarCircle name={m.name} color={m.attivo ? m.color : '#4A4640'} size={38} />
            <div className="leaderboard-name">
              {m.name}{m.id === me.id ? ' (tu)' : ''}
              <div className="leaderboard-sub num">
                {m.attivo
                  ? (m.resists > 0 ? `${m.resists} voglie superate` : 'nessuna voglia registrata')
                  : (m.lastAttivita ? `non registra da ${durata(Date.now() - m.lastAttivita)}` : 'non ha ancora registrato')}
              </div>
            </div>
            <div className={`leaderboard-points num ${m.attivo ? '' : 'leaderboard-nulli'}`}>
              {ordine === 'meno' ? m.n : (m.calo === null ? '—' : `${m.calo > 0 ? '−' : '+'}${Math.abs(m.calo)}%`)}
            </div>
          </div>
        ))}
      </div>

      <p className="micro-hint">
        {ordine === 'meno'
          ? 'Conteggio grezzo del periodo scelto. A parità di sigarette passa avanti chi ha superato più voglie.'
          : 'Calo della media rispetto ai primi 7 giorni registrati: premia chi partiva da lontano.'}
        {classifica.length > attivi.length && (
          <> Chi non registra da 24 ore esce dalla classifica e perde la posizione: senza dati il confronto non significa niente.</>
        )}
      </p>

      <h2 className="section-title">Attività del gruppo</h2>
      <div className="activity-feed">
        {feed.length === 0 && <p className="muted-line">Nessuna attività ancora.</p>}
        {feed.map((e) => (
          <div key={`${e.id}-${e.ts}-${e.tipo}`} className="activity-row">
            <AvatarCircle name={e.name} color={e.color} size={30} />
            <div className="activity-text">
              {e.tipo === 'cig'
                ? <span><b>{e.name}</b> ha registrato una sigaretta</span>
                : <span><b>{e.name}</b> ha superato una voglia</span>}
              <div className="activity-meta">{relativeTime(e.ts)} · {e.oggi} oggi</div>
            </div>
          </div>
        ))}
      </div>

      <div className="divider" />

      <h2 className="section-title">Codice invito</h2>
      <div className="invite-code-box">
        <div className="invite-code">{gruppo?.code}</div>
        <button className="btn btn-ghost" onClick={onCopia}><Copy size={16} /> Copia</button>
      </div>

      <h2 className="section-title"><Users size={15} /> Membri ({gruppo?.members.length})</h2>
      <div className="member-join-list">
        {gruppo?.members.map((m) => (
          <div key={m.id} className="member-join-row">
            <AvatarCircle name={m.name} color={m.color} size={34} />
            <span>{m.name}{m.id === gruppo.ownerId ? ' · owner' : ''}{m.id === me.id ? ' (tu)' : ''}</span>
            {membri.some((x) => x.id === m.id) && <Check size={16} color="#F0A23C" style={{ marginLeft: 'auto' }} />}
          </div>
        ))}
      </div>

      <p className="policy-note">
        Ognuno registra solo le proprie sigarette: nessuno può aggiungerne a nome di un altro.
        Se sei in più gruppi, ricevono tutti gli stessi identici numeri.
      </p>

      <button className="btn btn-danger btn-block" onClick={onEsci}><LogOut size={16} /> Esci da {gruppo?.name}</button>
    </div>
  );
}
