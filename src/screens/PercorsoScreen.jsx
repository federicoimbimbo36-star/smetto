import { Flag, X, ListPlus } from 'lucide-react';
import { eurSegno, eur0, tempoVita, dec, durata, ora, etichettaGiorno } from '../utils/format';
import { Timeline, Barre, CurvaRisparmio, Pianta } from '../components';

/* ------------------------------------------------------------------ */
/*  PERCORSO                                                           */
/*                                                                     */
/*  Risponde a: «quanto sono arrivato lontano?».                       */
/*                                                                     */
/*  Tiene insieme le due vecchie schede Piano e Recap. Erano cinque    */
/*  livelli di navigazione (due tab principali per tre periodi ciascuna)*/
/*  per gli stessi dati: adesso sono tre sezioni piatte, e i grafici   */
/*  della settimana e del mese stanno uno sotto l'altro invece che     */
/*  dietro a un selettore che nessuno tocca.                           */
/* ------------------------------------------------------------------ */

export default function PercorsoScreen({
  s, mese, registro, tags, now, conti, tappe, piano, record,
  giorniPercorso, sezione, setSezione, onElimina, onTante,
}) {
  return (
    <div className="screen">
      <h1 className="titolo-schermata">Il tuo percorso</h1>

      <div className="segmenti" role="tablist">
        {[['traguardi', 'Traguardi'], ['numeri', 'Numeri'], ['registro', 'Registro']].map(([id, label]) => (
          <button
            key={id} role="tab" aria-selected={sezione === id}
            className={`segmento ${sezione === id ? 'segmento-on' : ''}`}
            onClick={() => setSezione(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ============================= TRAGUARDI ============================= */}
      {sezione === 'traguardi' && (
        <>
          <Pianta giorni={giorniPercorso} dimensione={190} />
          <p className="testo" style={{ textAlign: 'center', marginTop: 4 }}>
            Giorno {giorniPercorso + 1} del tuo percorso. Questa cresce coi giorni, e non torna
            mai indietro — nemmeno dopo una ricaduta.
          </p>

          {piano && (
            <div className="card stacco">
              <div className="traguardo">
                <span className="traguardo-icona"><Flag size={20} /></span>
                <div className="card-riga-corpo">
                  <div className="etichetta">Sigaretta zero prevista</div>
                  <div className="traguardo-data">{piano.dataZero}</div>
                  <div className="testo-piccolo num" style={{ marginTop: 4 }}>
                    tra {piano.settimaneRestanti} settimane, se tieni questo passo
                  </div>
                </div>
              </div>

              <div className="piano-lista">
                {piano.righe.map((r) => (
                  <div key={r.n} className={`piano-riga ${r.corrente ? 'piano-ora' : ''}`}>
                    <span className="piano-n num">S{r.n}</span>
                    <span className="piano-data">{r.data}</span>
                    <div className="piano-barra"><div className="piano-barra-fill" style={{ width: `${r.perc}%` }} /></div>
                    <span className="piano-val num">{r.media < 0.5 ? '0' : dec(r.media)}</span>
                  </div>
                ))}
              </div>
              <p className="nota">
                Ogni settimana togli il 15% alla media della precedente. Il piano si ricalcola
                sui numeri veri, non su questa previsione.
              </p>
            </div>
          )}

          <h2 className="titolo-sezione stacco">Cosa sta recuperando il corpo</h2>
          <p className="testo-piccolo" style={{ marginTop: 8 }}>
            Il conto riparte da ogni sigaretta. Sei a {s?.ultima ? durata(now - s.ultima) : '—'} dall'ultima.
          </p>
          <Timeline tappe={tappe} />
        </>
      )}

      {/* ============================== NUMERI ============================== */}
      {sezione === 'numeri' && (
        <>
          {!conti && (
            <div className="vuoto">
              <div className="vuoto-titolo">Manca il prezzo del pacchetto</div>
              <p className="vuoto-testo">Scrivilo nel Profilo e da lì in poi ogni conto si popola da solo.</p>
            </div>
          )}

          {conti && (
            <>
              <div className={`eroe-card ${conti.inRosso ? 'eroe-spento' : ''}`}>
                <div className="etichetta">{conti.inRosso ? 'Sopra il ritmo di partenza' : 'Risparmiato finora'}</div>
                <div className="eroe-val num">{eurSegno(conti.risparmiato)}</div>
                <p className="eroe-sub">
                  {conti.evitate >= 1 ? (
                    <>sono <b>{Math.floor(conti.evitate)}</b> sigarette che non hai fumato rispetto
                      al ritmo da cui sei partito ({dec(conti.baseline)} al giorno)</>
                  ) : conti.evitate <= -1 ? (
                    <>sei <b>{Math.abs(Math.ceil(conti.evitate))}</b> sigarette sopra il ritmo da cui
                      sei partito ({dec(conti.baseline)} al giorno). Il numero torna verde appena scendi.</>
                  ) : (
                    <>sei in pari col ritmo da cui sei partito ({dec(conti.baseline)} al giorno)</>
                  )}
                </p>
                <CurvaRisparmio punti={conti.curva} />
                <div className="eroe-riga">
                  <div><span className={`num ${conti.oggiRisparmio < 0 ? 'spento' : ''}`}>{eurSegno(conti.oggiRisparmio)}</span><small>oggi</small></div>
                  <div><span className={`num ${conti.settimana < 0 ? 'spento' : ''}`}>{eurSegno(conti.settimana)}</span><small>questa settimana</small></div>
                  <div><span className={`num ${conti.annoProiezione < 0 ? 'spento' : ''}`}>{eur0(conti.annoProiezione)}</span><small>in un anno così</small></div>
                </div>
              </div>

              <div className="card stacco">
                <div className="etichetta">{conti.inRosso ? 'Vita bruciata in più' : 'Vita non bruciata'}</div>
                <div className={`eroe-val num ${conti.inRosso ? 'spento' : ''}`}>{tempoVita(conti.minutiSalvati)}</div>
                <p className="eroe-sub">
                  A {conti.minutiPer} minuti per sigaretta, {conti.inRosso
                    ? 'è il tempo che stai perdendo oltre a quello che perdevi già prima.'
                    : 'sono i minuti che ti sei tenuto rispetto al ritmo da cui sei partito.'}
                </p>
                <div className="eroe-riga">
                  <div><span className="num">{tempoVita(conti.minutiPersiTotali)}</span><small>persi in totale</small></div>
                  <div><span className="num">{tempoVita(conti.minutiPersiOggi)}</span><small>persi oggi</small></div>
                  <div><span className="num">{tempoVita(conti.minutiAnnoRitmo)}</span><small>in un anno così</small></div>
                </div>
                <p className="fonte">
                  Stima da Jackson, Jarvis e West, <i>The price of a cigarette: 20 minutes of life?</i>,
                  Addiction 2024 (UCL): 17 minuti per gli uomini, 22 per le donne. È una media di
                  popolazione, non una previsione sulla tua vita.
                </p>
              </div>
            </>
          )}

          {!s && <p className="testo stacco">Registra la prima sigaretta e qui compaiono i tuoi numeri.</p>}

          {s && (
            <>
              <div className="stat-griglia">
                <div className="stat">
                  <span className="stat-val num">{dec(s.media7)}</span>
                  <span className="stat-lab">media degli ultimi 7 giorni</span>
                </div>
                <div className="stat">
                  <span className="stat-val stat-val-verde num">{s.resistSett}</span>
                  <span className="stat-lab">voglie superate in settimana</span>
                </div>
                {mese && (
                  <div className="stat">
                    <span className="stat-val stat-val-verde num">{mese.giorniZero}</span>
                    <span className="stat-lab">giorni a zero nell'ultimo mese</span>
                  </div>
                )}
                <div className="stat">
                  <span className="stat-val num">{record?.piuLungo ? durata(record.piuLungo) : '—'}</span>
                  <span className="stat-lab">il tuo record senza fumare</span>
                </div>
                <div className="stat">
                  <span className="stat-val num">{s.intervalloMedio ? durata(s.intervalloMedio) : '—'}</span>
                  <span className="stat-lab">intervallo medio, oggi</span>
                </div>
                <div className="stat">
                  <span className="stat-val" style={{ fontSize: 21 }}>{s.fasciaTop ? s.fasciaTop.label : '—'}</span>
                  <span className="stat-lab">la fascia in cui ti frega di più</span>
                </div>
              </div>

              <h2 className="titolo-sezione stacco">Questa settimana</h2>
              {s.sett === 0 ? (
                <p className="testo-piccolo" style={{ marginTop: 8 }}>
                  Settimana di misura: nessun limite. Serve a sapere da dove parti — l'obiettivo
                  arriva fra {Math.max(0, 7 - s.giorniTrascorsi)} giorni.
                </p>
              ) : (
                <p className="testo-piccolo" style={{ marginTop: 8 }}>
                  Obiettivo: {s.obiettivo < 0.5 ? 'zero sigarette' : `massimo ${dec(s.obiettivo)} al giorno`}.
                  La settimana scorsa eri a {dec(s.mediaPrec)}.
                </p>
              )}
              <Barre dati={s.perGiorno} budget={s.budget} evidenzia={s.indiceOggi} />

              <h2 className="titolo-sezione stacco">Come si distribuisce la giornata</h2>
              <Barre dati={s.perFascia} budget={null} evidenzia={s.fasciaTopIndex} />

              {mese && (
                <>
                  <h2 className="titolo-sezione stacco">Media per settimana</h2>
                  <Barre dati={mese.perSettimana} budget={null} evidenzia={mese.perSettimana.length - 1} />
                  {mese.risparmiate > 0 && (
                    <p className="testo-piccolo" style={{ marginTop: 16 }}>
                      Rispetto al ritmo da cui sei partito, in questo mese hai fumato{' '}
                      <b>{mese.risparmiate} sigarette in meno</b>.
                    </p>
                  )}
                </>
              )}

              {s.topTrigger && (
                <div className="card card-tenue stacco">
                  <p className="testo-piccolo">
                    <b>{s.topTrigger[0]}</b> ha innescato {s.topTrigger[1]} sigarette su {s.settTot} questa
                    settimana. Scrivi il tuo se–allora per quella situazione: lo trovi in Aiuto.
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ============================= REGISTRO ============================= */}
      {sezione === 'registro' && (
        <>
          {registro.length === 0 ? (
            <div className="vuoto">
              <div className="vuoto-titolo">Ancora niente qui</div>
              <p className="vuoto-testo">
                Ogni sigaretta compare qui con l'ora e con quanto tempo era passato dalla precedente.
              </p>
            </div>
          ) : (
            <p className="testo-piccolo">
              Le ultime due settimane. Se hai segnato una sigaretta per sbaglio, toglila da qui.
            </p>
          )}

          {/* È qui che uno si accorge del buco: «ieri ne mancano quattro». */}
          <button className="btn btn-secondario btn-blocco" style={{ marginTop: 20 }} onClick={onTante}>
            <ListPlus size={18} /> Aggiungi sigarette che non hai segnato
          </button>

          {registro.map(([giorno, lista]) => (
            <div key={giorno} className="registro-giorno">
              <div className="registro-testa">
                <span className="registro-nome">{etichettaGiorno(giorno, now)}</span>
                <span className="registro-tot num">{lista.length}</span>
              </div>
              {lista.map((t, i) => {
                const prec = lista[i + 1];
                return (
                  <div className="registro-riga" key={t}>
                    <span className="registro-ora num">{ora(t)}</span>
                    <span className="registro-meta">
                      {tags[t] && <span>{tags[t]}</span>}
                      {tags[t] && prec && ' · '}
                      {prec && <span className="num">{durata(t - prec)} dopo</span>}
                    </span>
                    <button
                      className="registro-canc" onClick={() => onElimina(t)}
                      aria-label={`Togli la sigaretta delle ${ora(t)}`}
                    >
                      <X size={17} />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
