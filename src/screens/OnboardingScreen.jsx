import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { MOTIVI, MINUTI_PER_SIGARETTA } from '../constants';
import { eur0, eurUnitario, tempoVita, dec } from '../utils/format';
import { BrandMark, Pianta } from '../components';

/* ------------------------------------------------------------------ */
/*  ONBOARDING                                                         */
/*                                                                     */
/*  Cinque schermate, una domanda per schermata, e nessuna che chieda  */
/*  due cose insieme. L'ordine non è casuale: prima il PERCHÉ, poi i   */
/*  numeri. Chi arriva qui ha già deciso qualcosa — chiedergli il      */
/*  prezzo del pacchetto come prima cosa lo tratta come un foglio      */
/*  Excel, e il motivo scritto di suo pugno è esattamente ciò che      */
/*  ricomparirà nel momento in cui starà per accendere.                */
/*                                                                     */
/*  Il permesso alle notifiche è nell'ultima schermata, con un solo    */
/*  interruttore: era un passo intero, e un passo intero per un        */
/*  permesso di sistema è un passo di troppo.                          */
/* ------------------------------------------------------------------ */

const PASSI = 5;

export default function OnboardingScreen({ iniziale, onFine, onChiediPermesso }) {
  const [passo, setPasso] = useState(0);
  const [motivo, setMotivo] = useState(iniziale?.motivo || '');
  const [motivoScelto, setMotivoScelto] = useState(null);
  const [baseline, setBaseline] = useState(iniziale?.baseline ? String(iniziale.baseline) : '');
  const [sesso, setSesso] = useState(iniziale?.sesso || 'non_detto');
  const [prezzo, setPrezzo] = useState(
    iniziale?.prezzoPacchetto ? String(iniziale.prezzoPacchetto).replace('.', ',') : '',
  );
  const [perPacchetto, setPerPacchetto] = useState(String(iniziale?.perPacchetto || 20));
  const [avvisi, setAvvisi] = useState(true);

  const nPrezzo = Number(String(prezzo).replace(',', '.'));
  const nPer = Number(perPacchetto) || 20;
  const nBase = Number(String(baseline).replace(',', '.'));
  const unitario = nPrezzo > 0 ? nPrezzo / nPer : 0;

  const avanti = () => setPasso((p) => Math.min(PASSI - 1, p + 1));
  const indietro = () => setPasso((p) => Math.max(0, p - 1));

  async function concludi() {
    if (avvisi) await onChiediPermesso();
    onFine({
      prezzoPacchetto: nPrezzo > 0 ? nPrezzo : null,
      perPacchetto: nPer,
      baseline: nBase > 0 ? nBase : null,
      sesso,
      motivo: motivo.trim(),
    }, avvisi);
  }

  return (
    <div className="screen onb">
      {passo > 0 && (
        <button className="btn-indietro" onClick={indietro}>
          <ArrowLeft size={18} /> Indietro
        </button>
      )}

      <div className="onb-passi" role="progressbar" aria-valuenow={passo + 1} aria-valuemin={1} aria-valuemax={PASSI}>
        {Array.from({ length: PASSI }, (_, i) => (
          <span key={i} className={`onb-passo ${i <= passo ? 'onb-passo-on' : ''}`} />
        ))}
      </div>

      <div className="onb-corpo">
        {/* -------------------- 1. benvenuto -------------------- */}
        {passo === 0 && (
          <div className="onb-finale">
            <div className="marchio-riga" style={{ marginBottom: 8 }}>
              <BrandMark size={40} />
              <div>
                <div className="marchio-nome">Smetto</div>
                <div className="marchio-claim">Meno di ieri</div>
              </div>
            </div>

            <Pianta giorni={0} dimensione={200} mostraStadio={false} />

            <h1 className="titolo-schermata" style={{ marginTop: 24 }}>
              Vuoi iniziare una vita senza fumo?
            </h1>
            <p className="testo">
              Non ti chiederò di smettere domani mattina. Ti chiederò di scendere un po' ogni
              settimana, e di non mollare quando ricadi — perché ricadere fa parte del percorso.
            </p>
          </div>
        )}

        {/* -------------------- 2. il motivo -------------------- */}
        {passo === 1 && (
          <>
            <h1 className="titolo-schermata">Perché vuoi smettere?</h1>
            <p className="sotto-schermata">
              Te lo rimetto davanti agli occhi nel momento in cui starai per accendere.
            </p>
            <div className="onb-scelte">
              {MOTIVI.map((m) => (
                <button
                  key={m.id}
                  className={`onb-scelta ${motivoScelto === m.id ? 'onb-scelta-on' : ''}`}
                  onClick={() => { setMotivoScelto(m.id); setMotivo(m.frase); }}
                >
                  <span className="onb-scelta-icona" aria-hidden="true">{m.icona}</span>
                  {m.testo}
                </button>
              ))}
            </div>
            <div className="campo" style={{ marginTop: 24 }}>
              <label className="campo-label" htmlFor="onb-motivo">Scrivilo come lo diresti a voce</label>
              <input
                id="onb-motivo" className="campo-input" value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Es. Voglio rincorrere mio figlio senza fermarmi"
              />
            </div>
          </>
        )}

        {/* -------------------- 3. quanto fumi -------------------- */}
        {passo === 2 && (
          <>
            <h1 className="titolo-schermata">Quanto fumi oggi?</h1>
            <p className="sotto-schermata">
              Una stima basta. Serve a sapere da quale ritmo stai scendendo: dalla settimana
              prossima uso i numeri veri che avrai registrato.
            </p>
            <div className="campo">
              <label className="campo-label" htmlFor="onb-base">Sigarette al giorno</label>
              {/* inputMode="decimal": più sotto il valore viene letto con
                  Number(String(baseline).replace(',', '.')), cioè la
                  virgola è prevista — ma un input numerico non la fa
                  nemmeno digitare, e chi fuma «un pacchetto e mezzo» non
                  poteva scrivere 12,5. */}
              <input
                id="onb-base" className="campo-input" inputMode="decimal"
                placeholder="Es. 15" value={baseline}
                onChange={(e) => setBaseline(e.target.value)} autoFocus
              />
            </div>
            <div className="pastiglie">
              {[5, 10, 15, 20, 30].map((n) => (
                <button
                  key={n} className={`pastiglia ${Number(baseline) === n ? 'pastiglia-on' : ''}`}
                  onClick={() => setBaseline(String(n))}
                >
                  {n}
                </button>
              ))}
            </div>

            <div className="campo" style={{ marginTop: 32 }}>
              <label className="campo-label">Per il calcolo dei minuti di vita</label>
              <div className="pastiglie">
                {[['uomo', 'uomo · 17 min'], ['donna', 'donna · 22 min'], ['non_detto', 'non lo dico · 20 min']].map(([k, l]) => (
                  <button
                    key={k} className={`pastiglia ${sesso === k ? 'pastiglia-on' : ''}`}
                    onClick={() => setSesso(k)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <p className="nota">
                Lo studio UCL del 2024 stima 17 minuti di vita persi per sigaretta negli uomini e
                22 nelle donne. Se preferisci non rispondere uso la media di 20.
              </p>
            </div>
          </>
        )}

        {/* -------------------- 4. quanto costa -------------------- */}
        {passo === 3 && (
          <>
            <h1 className="titolo-schermata">Quanto costa un pacchetto?</h1>
            <p className="sotto-schermata">
              Da qui in poi ogni sigaretta che <b>non</b> fumi diventa un numero che vedi crescere.
            </p>
            <div className="riga">
              <div className="campo">
                <label className="campo-label" htmlFor="onb-prezzo">Prezzo</label>
                <input
                  id="onb-prezzo" className="campo-input" inputMode="decimal" placeholder="6,00"
                  value={prezzo} onChange={(e) => setPrezzo(e.target.value)} autoFocus
                />
              </div>
              <div className="campo">
                <label className="campo-label" htmlFor="onb-per">Quante ne contiene</label>
                <input
                  id="onb-per" className="campo-input" type="number" inputMode="numeric"
                  value={perPacchetto} onChange={(e) => setPerPacchetto(e.target.value)}
                />
              </div>
            </div>
            {unitario > 0 && (
              <div className="onb-eco">
                Una sigaretta ti costa <b>{eurUnitario(unitario)}</b>.
                {nBase > 0 && (
                  /* «A quindici al giorno» era scritto a mano: chi aveva
                     dichiarato trenta leggeva "quindici" accanto a un
                     numero calcolato su trenta. */
                  <> A <b>{dec(nBase)}</b> al giorno di ritmo attuale sono <b>{eur0(nBase * unitario * 365)}</b> all&apos;anno,
                    e ogni giorno se ne vanno <b>{tempoVita(nBase * MINUTI_PER_SIGARETTA[sesso])}</b> di vita attesa.</>
                )}
              </div>
            )}
          </>
        )}

        {/* -------------------- 5. si parte -------------------- */}
        {passo === 4 && (
          <div className="onb-finale">
            <Pianta giorni={0} dimensione={210} mostraStadio={false} />
            <h1 className="titolo-schermata" style={{ marginTop: 16 }}>Il tuo percorso inizia oggi.</h1>
            <p className="testo">
              {motivo
                ? <>Il tuo motivo: <b style={{ color: 'var(--t1)' }}>“{motivo}”</b>. Te lo rimetto davanti quando servirà.</>
                : 'Puoi scrivere in qualsiasi momento il tuo motivo dalla scheda Aiuto.'}
            </p>

            <button
              className="interruttore card" style={{ marginTop: 28, padding: 20 }}
              onClick={() => setAvvisi((a) => !a)} aria-pressed={avvisi}
            >
              <div className="card-riga-corpo">
                <div className="interruttore-titolo">Avvisami quando il corpo cambia</div>
                <div className="interruttore-sub">
                  Battito, ossigeno, gusto, respiro: cose che stanno succedendo davvero mentre non fumi.
                  Non sono promemoria.
                </div>
              </div>
              <span className={`interruttore-pill ${avvisi ? 'interruttore-on' : ''}`}>
                <span className="interruttore-knob" />
              </span>
            </button>
          </div>
        )}
      </div>

      <div className="onb-piede pila">
        {passo < PASSI - 1 ? (
          <button
            className="btn btn-primario btn-blocco" onClick={avanti}
            disabled={passo === 3 && !(nPrezzo > 0)}
          >
            {passo === 0 ? 'Cominciamo' : 'Continua'}
          </button>
        ) : (
          <button className="btn btn-primario btn-blocco" onClick={concludi}>
            Comincia il mio percorso
          </button>
        )}

        {passo === 1 && (
          <button className="btn btn-testo btn-testo-tenue btn-testo-centro" onClick={avanti}>
            Lo faccio dopo
          </button>
        )}
        {/* Il ritmo di partenza si può ancora saltare, ma dicendo cosa
            costa: senza, i contatori non partono per una settimana. Prima
            il bottone diceva solo «Lo faccio dopo» e l'app riempiva il
            buco con una stima che si misurava da sola. */}
        {passo === 2 && (
          <button className="btn btn-testo btn-testo-tenue btn-testo-centro" onClick={avanti}>
            {nBase > 0 ? 'Lo faccio dopo' : 'Non lo so — ricavalo dalla prima settimana'}
          </button>
        )}
      </div>
    </div>
  );
}
