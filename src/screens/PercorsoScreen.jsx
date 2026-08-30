import { Flag, X, ListPlus } from 'lucide-react';
import { ORE_TOLLERANZA } from '../constants';
import { eur, eur0, eurUnitario, tempoVita, dec, durata, ora, etichettaGiorno } from '../utils/format';
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
  giorniPercorso, sezione, setSezione, onElimina, onTante, mancante, onVaiAlProfilo,
  rif, giorniSenza, copertoOra, inAstinenza,
}) {
  /* Un trattino non è un fallimento: è quello che si scrive quando il
     numero non esiste ancora. Le proiezioni a un anno valgono null
     finché non c'è nemmeno un giorno pieno alle spalle, perché una
     proiezione a dodici mesi costruita su mezza giornata è un'invenzione. */
  const forse = (v, come) => (v == null ? '—' : come(v));

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
                Ogni settimana togli il 15% alla media della precedente, e comunque almeno una
                sigaretta al giorno: sotto le sette al giorno è quest&apos;ultima regola a comandare,
                quindi il calo diventa più ripido. Il piano si ricalcola sui numeri veri, non su
                questa previsione.
              </p>
            </div>
          )}

          <h2 className="titolo-sezione stacco">Cosa sta recuperando il corpo</h2>
          {/* «Sei a X dall'ultima» era falso in due casi su tre: per chi ha
              dichiarato di aver smesso senza aver mai registrato una
              sigaretta l'ultima non esiste, e dopo un buco di copertura il
              riferimento è l'inizio del tratto certificato, non l'ultima
              sigaretta. Il conto è sempre quello del riferimento (D4): qui
              si dice quello che il numero misura davvero. */}
          <p className="testo-piccolo" style={{ marginTop: 8 }}>
            {rif === null
              ? 'Il conto parte dalla prima cosa che registri.'
              : <>Il conto riparte da ogni sigaretta. Sono {durata(Math.max(0, now - rif))} che
                il corpo lavora senza interruzioni.</>}
          </p>
          <Timeline tappe={tappe} />
        </>
      )}

      {/* ============================== NUMERI ============================== */}
      {sezione === 'numeri' && (
        <>
          {/* Due mancanze diverse, due risposte diverse: il prezzo si scrive
              in dieci secondi, il ritmo di partenza o lo dichiari o va
              misurato. Prima qui compariva sempre «manca il prezzo», anche
              a chi il prezzo l'aveva messo. */}
          {!conti && mancante === 'prezzo' && (
            <div className="vuoto">
              <div className="vuoto-titolo">Manca il prezzo del pacchetto</div>
              <p className="vuoto-testo">Scrivilo nel Profilo e da lì in poi ogni conto si popola da solo.</p>
              <button className="btn btn-secondario btn-piccolo" onClick={onVaiAlProfilo}>Vai al Profilo</button>
            </div>
          )}

          {!conti && mancante === 'ritmo' && (
            <div className="vuoto">
              <div className="vuoto-titolo">Manca il ritmo da cui parti</div>
              <p className="vuoto-testo">
                Senza sapere quante ne fumavi prima non posso dirti quante non ne hai fumate: sarebbe
                un numero inventato. Scrivilo nel Profilo e i conti partono subito, oppure continua a
                registrare e lo ricavo dalla tua prima settimana piena.
              </p>
              <button className="btn btn-secondario btn-piccolo" onClick={onVaiAlProfilo}>
                Dimmi quante ne fumavi
              </button>
            </div>
          )}

          {/* Perché i conti possono fermarsi, detto dove si guardano i conti.
              Durante la riduzione il tempo che nessuno ha certificato non
              produce risparmio: dieci giorni di silenzio valevano 200
              sigarette «evitate» e 60 € mai risparmiati. */}
          {conti && !copertoOra && !inAstinenza && (
            <div className="card">
              <div className="etichetta">I conti sono in pausa</div>
              <p className="testo-piccolo" style={{ marginTop: 8 }}>
                L&apos;ultima cosa che mi hai detto risale a più di {ORE_TOLLERANZA} ore fa. Da lì in avanti non
                so cosa è successo, quindi non conto quel tempo come risparmio: sarebbe come dare
                per scontato che non hai fumato. Registra una sigaretta, conferma che sei a zero,
                oppure dimmi che hai smesso — e da quel momento riparte.
              </p>
            </div>
          )}

          {conti && (
            <>
              <div className={`eroe-card ${conti.inRosso && !conti.inPari ? 'eroe-spento' : ''}`}>
                {/* `inPari` viene prima: con uno scarto di −0,2 sigarette il
                    numero è 0,00 € e l'etichetta diceva «Sopra il ritmo di
                    partenza» mentre la riga sotto, nella stessa card,
                    diceva «sei in pari». */}
                <div className="etichetta">
                  {conti.inPari ? 'In pari col ritmo di partenza'
                    : conti.inRosso ? 'Sopra il ritmo di partenza' : 'Risparmiato finora'}
                </div>
                {/* Mai «−12,40 € risparmiati»: lo scarto dal ritmo ha un
                    segno, i soldi no. Sono due numeri diversi e tutti e due
                    positivi, ed è l'etichetta a dire quale dei due stai
                    guardando. */}
                <div className="eroe-val num">{eur(conti.inRosso ? conti.spesoInPiu : conti.risparmiato)}</div>
                {/* eurUnitario e non eur: un pacchetto da 6,50 € fa 0,325 € a
                    sigaretta, e scrivendo «0,33 €» la card dichiarava una
                    catena che non tornava — su 367 sigarette chi
                    moltiplicava trovava 1,83 € in più del totale scritto
                    due righe sopra. */}
                <p className="eroe-sub">
                  {conti.inPari ? (
                    <>sei in pari col ritmo da cui sei partito ({dec(conti.baseline)} al giorno)</>
                  ) : conti.inRosso ? (
                    <>sei <b>{dec(conti.scartoMostrato)}</b> sigarette sopra il ritmo da cui sei
                      partito ({dec(conti.baseline)} al giorno), a {eurUnitario(conti.unitario)} l&apos;una.
                      Il numero torna verde appena scendi.</>
                  ) : (
                    <>sono <b>{dec(conti.scartoMostrato)}</b> sigarette che non hai fumato rispetto
                      al ritmo da cui sei partito ({dec(conti.baseline)} al giorno), a{' '}
                      {eurUnitario(conti.unitario)} l&apos;una.</>
                  )}
                  {conti.baselineDichiarata === false && (
                    <> Il ritmo di partenza è la media della tua prima settimana piena.</>
                  )}
                </p>
                <CurvaRisparmio punti={conti.curva} />
                <div className="eroe-riga">
                  <div>
                    <span className={`num ${conti.spesoOggi > 0 ? 'spento' : ''}`}>{eur(conti.spesoOggi > 0 ? conti.spesoOggi : conti.risparmioOggi)}</span>
                    <small>{conti.spesoOggi > 0 ? 'oggi, in più' : 'oggi'}</small>
                  </div>
                  <div>
                    <span className={`num ${conti.spesoSett > 0 ? 'spento' : ''}`}>{eur(conti.spesoSett > 0 ? conti.spesoSett : conti.risparmioSett)}</span>
                    <small>{conti.spesoSett > 0 ? 'in settimana, in più' : 'questa settimana'}</small>
                  </div>
                  <div>
                    <span className={`num ${conti.spesoAnno > 0 ? 'spento' : ''}`}>{forse(conti.spesoAnno > 0 ? conti.spesoAnno : conti.risparmioAnno, eur0)}</span>
                    <small>in un anno così</small>
                  </div>
                </div>
              </div>

              <div className="card stacco">
                <div className="etichetta">
                  {conti.inPari ? 'In pari, anche in tempo'
                    : conti.inRosso ? 'Vita bruciata in più' : 'Vita non bruciata'}
                </div>
                <div className={`eroe-val num ${conti.inRosso && !conti.inPari ? 'spento' : ''}`}>{tempoVita(conti.inRosso ? conti.vitaPersaInPiu : conti.vitaTenuta)}</div>
                <p className="eroe-sub">
                  Le stesse sigarette della card qui sopra, contate in tempo invece che in
                  euro: {conti.minutiPer} minuti l&apos;una. {conti.inRosso
                    ? 'È il tempo che stai perdendo oltre a quello che perdevi già prima.'
                    : 'Sono i minuti che ti sei tenuto rispetto al ritmo da cui sei partito.'}
                </p>
                {/* Stessi tre periodi della card dei soldi, stessa natura di
                    numero: le due card devono potersi leggere una accanto
                    all'altra senza che i conti si contraddicano. */}
                <div className="eroe-riga">
                  <div>
                    <span className={`num ${conti.vitaPersaOggi > 0 ? 'spento' : ''}`}>{tempoVita(conti.vitaPersaOggi > 0 ? conti.vitaPersaOggi : conti.vitaOggi)}</span>
                    <small>{conti.vitaPersaOggi > 0 ? 'oggi, in più' : 'oggi'}</small>
                  </div>
                  <div>
                    <span className={`num ${conti.vitaPersaSett > 0 ? 'spento' : ''}`}>{tempoVita(conti.vitaPersaSett > 0 ? conti.vitaPersaSett : conti.vitaSett)}</span>
                    <small>{conti.vitaPersaSett > 0 ? 'in settimana, in più' : 'questa settimana'}</small>
                  </div>
                  <div>
                    <span className={`num ${conti.vitaPersaAnno > 0 ? 'spento' : ''}`}>{forse(conti.vitaPersaAnno > 0 ? conti.vitaPersaAnno : conti.vitaAnno, tempoVita)}</span>
                    <small>in un anno così</small>
                  </div>
                </div>
                {/* Il costo pieno del fumo è un'altra cosa dal risparmio, e
                    infatti sta fuori dalla riga: metterlo lì dentro era il
                    bug — «in un anno così» voleva dire risparmiati nella
                    card dei soldi e persi in questa. */}
                <p className="eroe-sub" style={{ marginTop: 16 }}>
                  Quello che il fumo ti costa comunque: <b>{tempoVita(conti.minutiPersiTotali)}</b> da
                  quando hai cominciato, <b>{tempoVita(conti.minutiPersiOggi)}</b> oggi, e{' '}
                  <b>{forse(conti.minutiAnnoRitmo, tempoVita)}</b> all&apos;anno se resti al passo di adesso.
                </p>
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
                  <span className="stat-val num">{s.media7 == null ? '—' : dec(s.media7)}</span>
                  <span className="stat-lab">media dei 7 giorni pieni</span>
                </div>
                <div className="stat">
                  <span className="stat-val stat-val-verde num">{s.resistSett}</span>
                  <span className="stat-lab">voglie superate in settimana</span>
                </div>
                {/* Due statistiche diverse per due fasi diverse, mai
                    insieme: in astinenza dichiarata il tempo si conta da
                    solo e non ha il tetto dei trenta giorni; in riduzione si
                    contano solo i giorni completi e certificati, altrimenti
                    sparire sarebbe il modo più veloce per collezionarli. */}
                {inAstinenza ? (
                  <div className="stat">
                    <span className="stat-val stat-val-verde num">{giorniSenza ?? '—'}</span>
                    <span className="stat-lab">giorni senza fumare</span>
                  </div>
                ) : mese && (
                  <div className="stat">
                    <span className="stat-val stat-val-verde num">{mese.giorniZero}</span>
                    <span className="stat-lab">giorni a zero, confermati</span>
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
              ) : s.mediaPrec == null ? (
                /* La settimana scorsa non è coperta abbastanza per farci
                   una media: un obiettivo costruito su giorni in cui
                   l'app non sapeva niente sarebbe un numero inventato, e
                   per giunta irraggiungibile. */
                <p className="testo-piccolo" style={{ marginTop: 8 }}>
                  Della settimana scorsa non so abbastanza per darti un obiettivo: sono passati
                  troppi giorni senza che mi dicessi com&apos;era andata. Registra qualcosa oggi e
                  la prossima settimana riparte il conto.
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
                  <p className="testo-piccolo" style={{ marginTop: 8 }}>
                    Settimane di giorni pieni: oggi non c&apos;è ancora, perché mezza giornata
                    divisa per sette farebbe sembrare un calo quello che è solo l&apos;ora.
                  </p>
                  <Barre dati={mese.perSettimana} budget={null} evidenzia={mese.perSettimana.length - 1} />
                  {/* Prima questa frase compariva solo col segno positivo:
                      chi stava sopra il proprio ritmo di partenza non
                      leggeva niente, e la stessa quantità che nelle due
                      card qui sopra viene detta in tutte e due le
                      direzioni qui spariva in una sola. */}
                  {mese.risparmiate != null && mese.risparmiate !== 0 && (
                    <p className="testo-piccolo" style={{ marginTop: 16 }}>
                      Rispetto al ritmo da cui sei partito, in questo mese hai fumato{' '}
                      <b>
                        {Math.abs(mese.risparmiate)} sigarette
                        {mese.risparmiate > 0 ? ' in meno' : ' in più'}
                      </b>.
                    </p>
                  )}
                </>
              )}

              {s.topTrigger && (
                <div className="card card-tenue stacco">
                  <p className="testo-piccolo">
                    <b>{s.topTrigger[0]}</b> ha innescato {s.topTrigger[1]} sigarette su {s.taggateSett} a
                    cui hai dato un nome questa settimana. Scrivi il tuo se–allora per quella
                    situazione: lo trovi in Aiuto.
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
