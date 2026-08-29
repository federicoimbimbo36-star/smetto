import { ArrowLeft, Plus, Copy, Check, Users, Sparkles, Link2 } from 'lucide-react';
import { durata, relativeTime } from '../utils/format';
import { AvatarCircle } from '../components';

/* ------------------------------------------------------------------ */
/*  GRUPPO                                                             */
/*                                                                     */
/*  Sotto-schermata di Aiuto: si arriva qui dalla card «chi ci sta     */
/*  provando con te», e si torna indietro. Non è una scheda della      */
/*  barra in basso perché la barra ha quattro voci e questa è una      */
/*  forma di aiuto, non una sezione a sé.                              */
/*                                                                     */
/*  Niente medaglie e niente podio: il primo posto è verde, gli altri  */
/*  sono neri. Chi non registra da un giorno esce dalla classifica e   */
/*  si spegne — non viene barrato, non diventa rosso, non «perde».     */
/* ------------------------------------------------------------------ */

export default function GruppoScreen(props) {
  const {
    gruppi, attivo, setAttivo, membri, me, step, setStep, nome, setNome,
    codiceInput, setCodiceInput, joinError, joinPreview, onCrea, onVerifica,
    onConfermaJoin, onEsci, onCopia, classifica, ordine, setOrdine,
    periodo, setPeriodo, feed, ultimoSync, ioAttivo, onIndietro,
  } = props;

  const gruppo = gruppi.find((g) => g.code === attivo) || null;
  const attivi = classifica.filter((m) => m.attivo);
  const inAggiunta = step === 'crea' || step === 'entra' || step === 'aggiungi';

  /* ------------------------- creazione / ingresso ------------------------- */
  if (inAggiunta || gruppi.length === 0) {
    return (
      <div className="screen">
        <button className="btn-indietro" onClick={() => (step === 'menu' ? onIndietro() : setStep('menu'))}>
          <ArrowLeft size={18} /> {step === 'menu' ? 'Aiuto' : 'Indietro'}
        </button>

        {(step === 'menu' || step === 'aggiungi') && (
          <>
            <h1 className="titolo-schermata">
              {gruppi.length === 0 ? 'Smettere da soli è più difficile' : 'Aggiungi un gruppo'}
            </h1>
            <p className="sotto-schermata">
              Chi ha qualcuno che lo guarda molla molto meno. Bastano due persone che ci stanno
              provando insieme.
            </p>

            <div className="pila">
              <button className="aiuto-grande" style={{ background: 'var(--verde-velo)' }} onClick={() => setStep('crea')}>
                <span className="aiuto-grande-icona"><Sparkles size={22} /></span>
                <span className="card-riga-corpo">
                  <span className="aiuto-grande-titolo" style={{ display: 'block' }}>Crea un gruppo</span>
                  <span className="aiuto-grande-sub" style={{ display: 'block' }}>Scegli il nome e invita col codice</span>
                </span>
              </button>
              <button className="aiuto-grande" style={{ background: 'var(--verde-velo)' }} onClick={() => setStep('entra')}>
                <span className="aiuto-grande-icona"><Link2 size={22} /></span>
                <span className="card-riga-corpo">
                  <span className="aiuto-grande-titolo" style={{ display: 'block' }}>Entra con un codice</span>
                  <span className="aiuto-grande-sub" style={{ display: 'block' }}>Qualcuno ti ha già invitato</span>
                </span>
              </button>
            </div>

            <p className="nota">
              Puoi stare in più gruppi insieme — gli amici, la famiglia, i colleghi — e non devono
              conoscersi tra loro. Ma la dichiarazione è una sola: gli stessi numeri arrivano
              identici a tutti.
            </p>
          </>
        )}

        {step === 'crea' && (
          <>
            <h1 className="titolo-schermata">Come si chiama?</h1>
            <p className="sotto-schermata">Un nome che riconoscano tutti quando arriva la notifica.</p>
            <div className="campo">
              <input
                className="campo-input" placeholder="Es. Quelli che smettono" value={nome}
                onChange={(e) => setNome(e.target.value)} autoFocus
              />
            </div>
            <button className="btn btn-primario btn-blocco" disabled={!nome.trim()} onClick={onCrea}>
              Crea il gruppo
            </button>
          </>
        )}

        {step === 'entra' && (
          <>
            <h1 className="titolo-schermata">Il codice invito</h1>
            <p className="sotto-schermata">Sei lettere e numeri, te li ha mandati chi ha creato il gruppo.</p>
            <div className="campo">
              <input
                className="campo-input" placeholder="Es. K7RQ2M" value={codiceInput}
                onChange={(e) => setCodiceInput(e.target.value.toUpperCase())} autoFocus
                style={{ letterSpacing: '.14em', fontWeight: 700 }}
              />
              {joinError && <p className="campo-errore">{joinError}</p>}
            </div>
            {!joinPreview && (
              <button className="btn btn-primario btn-blocco" disabled={!codiceInput.trim()} onClick={onVerifica}>
                Verifica il codice
              </button>
            )}
            {joinPreview && (
              <div className="card">
                <div className="titolo-sezione">{joinPreview.name}</div>
                <p className="testo-piccolo" style={{ margin: '6px 0 16px' }}>
                  {joinPreview.memberCount} {joinPreview.memberCount === 1 ? 'persona' : 'persone'}
                </p>
                <button className="btn btn-primario btn-blocco" onClick={onConfermaJoin}>Unisciti</button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  /* ------------------------------ il gruppo ------------------------------ */
  return (
    <div className="screen">
      <button className="btn-indietro" onClick={onIndietro}>
        <ArrowLeft size={18} /> Aiuto
      </button>

      {gruppi.length > 1 && (
        <div className="gruppo-pills">
          {gruppi.map((g) => (
            <button
              key={g.code} className={`gruppo-pill ${g.code === attivo ? 'gruppo-pill-on' : ''}`}
              onClick={() => setAttivo(g.code)}
            >
              {g.name}
            </button>
          ))}
          <button
            className="gruppo-pill gruppo-pill-piu" onClick={() => setStep('aggiungi')}
            aria-label="Aggiungi un gruppo"
          >
            <Plus size={16} />
          </button>
        </div>
      )}

      <h1 className="titolo-schermata">{gruppo?.name}</h1>
      <p className="sotto-schermata">
        {membri.length} {membri.length === 1 ? 'persona' : 'persone'} · primo chi fuma meno
        {ultimoSync && <> · aggiornato {relativeTime(ultimoSync)}</>}
      </p>

      {!ioAttivo && (
        <div className="avviso">
          <b>Sei fuori dalla classifica.</b> Non dichiari la giornata da più di un giorno: per
          rientrare basta segnare una sigaretta o confermare che oggi sei a zero.
        </div>
      )}

      <div className="segmenti" role="tablist">
        {/* «7 giorni» e «30 giorni», non «Settimana» e «Mese»: sono finestre
            mobili che finiscono oggi, non la settimana o il mese di
            calendario, e il 3 del mese «Mese» comprendeva ancora quasi
            tutto il mese precedente. */}
        {[['giorno', 'Oggi'], ['settimana', '7 giorni'], ['mese', '30 giorni']].map(([id, label]) => (
          <button
            key={id} role="tab" aria-selected={periodo === id}
            className={`segmento ${periodo === id ? 'segmento-on' : ''}`}
            onClick={() => setPeriodo(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="pastiglie" style={{ marginBottom: 8 }}>
        <button className={`pastiglia ${ordine === 'meno' ? 'pastiglia-on' : ''}`} onClick={() => setOrdine('meno')}>
          Meno sigarette
        </button>
        <button className={`pastiglia ${ordine === 'calo' ? 'pastiglia-on' : ''}`} onClick={() => setOrdine('calo')}>
          Più in calo
        </button>
      </div>

      <div className="classifica">
        {classifica.map((m, i) => (
          <div
            key={m.id}
            className={`classifica-riga ${m.id === me.id ? 'classifica-io' : ''} ${m.attivo ? '' : 'classifica-fuori'}`}
          >
            <span className="classifica-pos num">{m.attivo ? i + 1 : '—'}</span>
            <AvatarCircle name={m.name} color={m.attivo ? m.color : '#B4BEBA'} size={38} />
            <div className="classifica-nome">
              {m.name}{m.id === me.id ? ' (tu)' : ''}
              <div className="classifica-sub num">
                {!m.attivo
                  ? (m.lastAttivita ? `non registra da ${durata(Date.now() - m.lastAttivita)}` : 'non ha ancora registrato')
                  : m.giorniPeriodo > 1
                    ? `${m.dichiarati} giorni su ${m.giorniPeriodo} dichiarati`
                    : (m.resists > 0 ? `${m.resists} voglie superate` : 'nessuna voglia registrata')}
              </div>
            </div>
            <div className="classifica-punti num">
              {ordine === 'meno' ? m.n : (m.calo === null ? '—' : `${m.calo > 0 ? '−' : '+'}${Math.abs(m.calo)}%`)}
            </div>
          </div>
        ))}
      </div>

      <p className="nota">
        {ordine === 'meno'
          ? 'Conteggio grezzo del periodo scelto. A parità di sigarette passa avanti chi ha superato più voglie.'
          : 'Calo della media rispetto ai primi 7 giorni registrati: premia chi partiva da lontano.'}
        {' '}Un giorno conta come dichiarato se ci sono sigarette registrate oppure se hai confermato
        che eri a zero: uno zero costruito sul silenzio non vale come uno zero detto.
        {classifica.length > attivi.length && (
          <> Chi non dichiara né oggi né ieri esce dalla classifica.</>
        )}
      </p>

      <h2 className="titolo-sezione stacco">Cosa è successo</h2>
      <div className="feed">
        {feed.length === 0 && <p className="testo-piccolo" style={{ marginTop: 12 }}>Ancora niente.</p>}
        {feed.map((e) => (
          <div key={`${e.id}-${e.ts}-${e.tipo}`} className="feed-riga">
            <AvatarCircle name={e.name} color={e.color} size={32} />
            <div className="feed-testo">
              {e.tipo === 'cig'
                ? <span><b>{e.name}</b> ha registrato una sigaretta</span>
                : <span><b>{e.name}</b> ha superato una voglia</span>}
              <div className="feed-meta num">{relativeTime(e.ts)} · {e.oggi} oggi</div>
            </div>
          </div>
        ))}
      </div>

      <h2 className="titolo-sezione stacco">Invita qualcuno</h2>
      <div className="codice-box">
        <span className="codice num">{gruppo?.code}</span>
        <button className="btn btn-calmo btn-piccolo" onClick={onCopia}><Copy size={16} /> Copia</button>
      </div>

      <h2 className="titolo-sezione stacco"><Users size={16} /> Chi c'è ({gruppo?.members.length})</h2>
      <div className="feed">
        {gruppo?.members.map((m) => (
          <div key={m.id} className="feed-riga">
            <AvatarCircle name={m.name} color={m.color} size={32} />
            <span className="feed-testo">
              <b>{m.name}</b>{m.id === gruppo.ownerId ? ' · ha creato il gruppo' : ''}{m.id === me.id ? ' (tu)' : ''}
            </span>
            {membri.some((x) => x.id === m.id) && <Check size={17} color="var(--verde)" />}
          </div>
        ))}
      </div>

      <p className="nota">
        Ognuno registra solo le proprie sigarette: nessuno può aggiungerne a nome di un altro.
        Se sei in più gruppi, ricevono tutti gli stessi identici numeri.
      </p>

      <button className="btn btn-spento btn-blocco" style={{ marginTop: 24 }} onClick={onEsci}>
        Esci da {gruppo?.name}
      </button>
    </div>
  );
}
