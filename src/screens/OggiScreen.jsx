import { Check, X, Plus, Sparkles, Undo2, ListPlus } from 'lucide-react';
import { DAY, TRIGGER, FRASI } from '../constants';
import { eur, eur0, eurSegno, durata, ora } from '../utils/format';
import { Pianta, FaseStop, Motto } from '../components';

const ORA = 3600000;

/* ------------------------------------------------------------------ */
/*  OGGI — la home                                                     */
/*                                                                     */
/*  Risponde a UNA domanda: «come sta andando il mio percorso?».       */
/*  Gerarchia, dall'alto: saluto → il numero → la frase → la pianta →  */
/*  due sole cifre → cosa posso fare adesso.                           */
/*                                                                     */
/*  Il numero grande è il TEMPO SENZA FUMARE, non i giorni liberi:     */
/*  Smetto è un'app di riduzione graduale, e chi fuma ancora quindici  */
/*  sigarette al giorno avrebbe uno zero fisso in faccia ogni mattina. */
/*  Le ore fra una sigaretta e l'altra invece sono la prima cosa che   */
/*  cresce davvero quando si comincia a scendere: la stessa metrica    */
/*  premia chi ha smesso del tutto (giorni) e chi sta ancora tagliando */
/*  (ore).                                                             */
/*                                                                     */
/*  La pianta, al contrario, cresce sui GIORNI DI PERCORSO e non torna */
/*  mai indietro: una ricaduta azzera il contatore in alto, non la     */
/*  cosa che sta crescendo.                                            */
/* ------------------------------------------------------------------ */

function saluto(now) {
  const h = new Date(now).getHours();
  if (h < 5) return 'Buonanotte';
  if (h < 13) return 'Buongiorno';
  if (h < 18) return 'Buon pomeriggio';
  return 'Buonasera';
}

function eroeDa(senza) {
  if (senza === null) return { n: '—', unita: null, label: 'il percorso inizia col primo tocco' };
  if (senza < ORA) return { n: Math.floor(senza / 60000), unita: 'min', label: 'senza fumare' };
  if (senza < DAY) return { n: Math.floor(senza / ORA), unita: 'ore', label: 'senza fumare' };
  const g = Math.floor(senza / DAY);
  return { n: g, unita: null, label: g === 1 ? 'giorno senza fumare' : 'giorni senza fumare' };
}

export default function OggiScreen({
  nome, s, conti, now, giorniPercorso, ultimoTs, gruppi, tappaBanner, onChiudiBanner,
  checkedIn, lotto, onFuma, onUmore, onTante, onAnnullaLotto, onVediRegistro,
  onAnnulla, onTag, onSkipTag, onVaiAlPercorso,
}) {
  const senza = s?.ultima ? now - s.ultima : null;
  const eroe = eroeDa(senza);
  const inStop = senza !== null && senza >= 12 * ORA;
  const frase = FRASI[giorniPercorso % FRASI.length];

  /* Arrotondato, non troncato: qui la cifra sta accanto agli euro e chi
     moltiplica deve trovarsi. Il valore con un decimale sta nel Percorso,
     dove c'è lo spazio per dichiarare anche il prezzo unitario. */
  const evitate = conti ? Math.round(conti.evitateMostrate) : null;

  return (
    <div className="screen">
      <header>
        <h1 className="oggi-saluto">{saluto(now)}{nome ? `, ${nome}` : ''} 👋</h1>
        <p className="oggi-invito">
          {gruppi.length > 0
            ? `Continua il tuo percorso · ${gruppi.length === 1 ? gruppi[0].name : `${gruppi.length} gruppi`}`
            : 'Continua il tuo percorso.'}
        </p>
      </header>

      {tappaBanner && (
        <div className="banner banner-pesca">
          <span className="banner-icona"><Sparkles size={17} /></span>
          <div className="banner-corpo">
            <div className="banner-titolo">{tappaBanner.avviso}</div>
            <p className="banner-testo">{tappaBanner.avvisoTesto}</p>
          </div>
          <button className="btn-icona" onClick={onChiudiBanner} aria-label="Chiudi l'avviso">
            <X size={18} />
          </button>
        </div>
      )}

      {/* ---- il numero ---- */}
      <div className="oggi-eroe">
        <div className="oggi-eroe-num">
          <span className="cifra-eroe">{eroe.n}</span>
          {eroe.unita && <span className="oggi-eroe-unita">{eroe.unita}</span>}
        </div>
        <div className="etichetta oggi-eroe-label">{eroe.label}</div>
        <p className="oggi-frase">{frase}</p>
      </div>

      {/* ---- la cosa che cresce ---- */}
      <Pianta giorni={giorniPercorso} dimensione={210} />

      {/* ---- due sole cifre, il resto sta nel Percorso ---- */}
      {conti && (
        <button
          className={`oggi-cifre ${conti.inRosso ? 'oggi-cifre-spente' : ''}`}
          onClick={onVaiAlPercorso}
          aria-label="Vedi tutte le statistiche nel Percorso"
        >
          <span className="oggi-cifra">
            <span className="oggi-cifra-val num">{evitate}</span>
            <span className="oggi-cifra-lab">
              {conti.inRosso ? 'sigarette sopra il tuo ritmo' : 'sigarette non fumate'}
            </span>
          </span>
          <span className="oggi-cifra">
            <span className="oggi-cifra-val num">{eurSegno(conti.risparmiato)}</span>
            <span className="oggi-cifra-lab">{conti.inRosso ? 'spesi in più' : 'risparmiati'}</span>
          </span>
        </button>
      )}

      {/* ---- la giornata, in una riga ---- */}
      {s && (s.oggi > 0 || checkedIn) && (
        <div className="oggi-conteggio">
          <span className={`oggi-conteggio-num num ${s.oggi === 0 ? 'etichetta-verde' : ''}`}>{s.oggi}</span>
          <div className="oggi-conteggio-corpo">
            <div className="oggi-conteggio-testo">
              {s.oggi === 0
                ? 'oggi, confermato'
                : <>oggi{s.budget !== null && <> · il tuo massimo è {s.budget}</>}
                  {conti && <> · {eur(s.oggi * conti.unitario)}</>}</>}
            </div>
            {s.oggi > 0 && (
              <div className="oggi-segni" aria-hidden="true">
                {Array.from({ length: Math.max(s.oggi, s.budget ?? 0) }, (_, i) => (
                  <span
                    key={i}
                    className={`segno ${i >= s.oggi ? 'segno-vuoto' : (s.budget !== null && i >= s.budget ? 'segno-oltre' : '')}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- cosa posso fare adesso ---- */}
      {lotto ? (
        <div className="card stacco">
          <div className="card-riga">
            <span className="banner-icona banner-icona-tenue"><Check size={17} /></span>
            <div className="card-riga-corpo">
              <div className="banner-titolo">
                {lotto.quante} {lotto.quante === 1 ? 'sigaretta aggiunta' : 'sigarette aggiunte'}
              </div>
              <p className="banner-testo">
                Distribuite {lotto.quando}, dalle {ora(lotto.ts[0])} alle {ora(lotto.ts[lotto.ts.length - 1])}.
              </p>
            </div>
          </div>
          <div className="riga" style={{ marginTop: 16 }}>
            <button className="btn btn-secondario btn-piccolo" onClick={onAnnullaLotto}>
              <Undo2 size={16} /> Annulla
            </button>
            <button className="btn btn-secondario btn-piccolo" onClick={onVediRegistro}>
              Vedi nel registro
            </button>
          </div>
        </div>
      ) : ultimoTs ? (
        <div className="card stacco">
          <div className="intestazione">
            <h2 className="titolo-sezione">Cos'era?</h2>
            <button className="btn-testo" onClick={onAnnulla}>Annulla</button>
          </div>
          <p className="testo-piccolo" style={{ marginBottom: 16 }}>
            Registrata alle {ora(ultimoTs)}. Dirlo adesso serve a capire dove ti frega più spesso.
          </p>
          <div className="pastiglie">
            {TRIGGER.map((t) => (
              <button key={t} className="pastiglia" onClick={() => onTag(ultimoTs, t)}>{t}</button>
            ))}
            <button className="pastiglia" onClick={onSkipTag}>non lo so</button>
          </div>
        </div>
      ) : (
        <div className="oggi-azioni">
          <button className="btn btn-primario btn-blocco" onClick={onUmore}>Come ti senti oggi?</button>
          <button className="btn btn-secondario btn-blocco" onClick={onFuma}>
            <Plus size={19} /> Ho fumato una sigaretta
          </button>
          {/* Chi non apre l'app per mezza giornata non deve toccare venti
              volte lo stesso bottone: da qui se ne segnano diverse insieme,
              collocate nell'ora in cui sono state fumate davvero. */}
          <button className="btn btn-testo btn-testo-tenue btn-testo-centro" onClick={onTante}>
            <ListPlus size={17} /> Ne ho fumate più di una
          </button>
        </div>
      )}

      {inStop && !ultimoTs && <FaseStop ms={senza} />}

      {s && s.prossimaTappa && !ultimoTs && (
        <button className="card card-tocco stacco" onClick={onVaiAlPercorso}>
          <div className="card-riga">
            <span className="banner-icona banner-icona-tenue"><Check size={16} /></span>
            <span className="card-riga-corpo">
              <span className="banner-titolo" style={{ display: 'block' }}>{s.prossimaTappa.titolo}</span>
              <span className="banner-testo" style={{ display: 'block' }}>
                tra {durata(s.prossimaTappa.mancano)} · {s.prossimaTappa.testo}
              </span>
            </span>
          </div>
        </button>
      )}

      {conti && conti.annoProiezione > 0 && !ultimoTs && (
        <p className="nota" style={{ textAlign: 'center', marginTop: 32 }}>
          Di questo passo, in un anno: {eur0(conti.annoProiezione)}.
        </p>
      )}

      <Motto />
    </div>
  );
}
