import { useState, useMemo } from 'react';
import { Minus, Plus } from 'lucide-react';
import { finestre } from '../utils/arretrate';
import { ora } from '../utils/format';

/* ------------------------------------------------------------------ */
/*  NE HO FUMATE PIÙ DI UNA                                            */
/*                                                                     */
/*  Due domande e basta: quante, e quando all'incirca. Sotto, una riga  */
/*  che dice a che ora finiranno nel registro — perché la persona deve  */
/*  poter vedere cosa sta per succedere prima che succeda, e perché     */
/*  quel dettaglio spiega da solo perché chiediamo il «quando».         */
/*                                                                     */
/*  Il tono resta quello del resto dell'app: chi apre questo foglio ha  */
/*  appena passato mezza giornata senza segnare, e lo sa già. Non serve */
/*  ricordarglielo.                                                     */
/* ------------------------------------------------------------------ */

const SCORCIATOIE = [2, 3, 5, 10];

export default function AggiungiTante({ now, onConferma, onChiudi }) {
  const disponibili = useMemo(() => finestre(now), [now]);
  const [quante, setQuante] = useState(2);
  const [quando, setQuando] = useState(disponibili[0]?.id ?? 'ora');

  const finestra = disponibili.find((f) => f.id === quando) || disponibili[0];
  const anteprima = finestra
    ? `dalle ${ora(finestra.da + (finestra.a - finestra.da) / quante / 2)} alle ${ora(finestra.a - (finestra.a - finestra.da) / quante / 2)}`
    : '';

  return (
    <div className="umore-velo" onClick={(e) => { if (e.target === e.currentTarget) onChiudi(); }}>
      <div className="umore-foglio" role="dialog" aria-modal="true" aria-label="Aggiungi più sigarette">
        <div className="umore-maniglia" />

        <h2 className="titolo-schermata" style={{ marginBottom: 0 }}>Quante ne hai fumate?</h2>
        <p className="testo" style={{ marginTop: 8 }}>
          Succede di non aprire l&apos;app per mezza giornata. Segnale adesso: contano uguale.
        </p>

        <div className="contatore">
          <button
            className="contatore-btn" onClick={() => setQuante((q) => Math.max(1, q - 1))}
            disabled={quante <= 1} aria-label="Una in meno"
          >
            <Minus size={22} />
          </button>
          <span className="contatore-val num" aria-live="polite">{quante}</span>
          <button
            className="contatore-btn" onClick={() => setQuante((q) => Math.min(30, q + 1))}
            disabled={quante >= 30} aria-label="Una in più"
          >
            <Plus size={22} />
          </button>
        </div>

        <div className="pastiglie" style={{ justifyContent: 'center' }}>
          {SCORCIATOIE.map((n) => (
            <button
              key={n} className={`pastiglia ${quante === n ? 'pastiglia-on' : ''}`}
              onClick={() => setQuante(n)}
            >
              {n}
            </button>
          ))}
        </div>

        <h3 className="titolo-sezione stacco">Quando, all&apos;incirca?</h3>
        <p className="testo-piccolo" style={{ margin: '8px 0 14px' }}>
          Non serve l&apos;ora esatta. Serve a non far finire tutte le sigarette
          nello stesso minuto, che falserebbe le tue medie.
        </p>
        <div className="pastiglie">
          {disponibili.map((f) => (
            <button
              key={f.id} className={`pastiglia ${quando === f.id ? 'pastiglia-on' : ''}`}
              onClick={() => setQuando(f.id)}
            >
              {f.testo}
            </button>
          ))}
        </div>

        {finestra && (
          <p className="nota">
            Finiranno nel registro {anteprima}, distanziate fra loro.
          </p>
        )}

        <div className="pila" style={{ marginTop: 24 }}>
          <button
            className="btn btn-primario btn-blocco"
            disabled={!finestra}
            onClick={() => onConferma(quante, finestra)}
          >
            Aggiungi {quante} {quante === 1 ? 'sigaretta' : 'sigarette'}
          </button>
          <button className="btn btn-testo btn-testo-tenue btn-testo-centro" onClick={onChiudi}>
            Lascia perdere
          </button>
        </div>
      </div>
    </div>
  );
}
