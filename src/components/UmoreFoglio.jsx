import { UMORI } from '../constants';

/* «Come ti senti oggi?» — il check-in che sostituisce il tasto grande.
   Una domanda, quattro risposte enormi, niente altro sullo schermo.
   Ogni risposta porta da qualche parte: chi sta bene conferma la giornata,
   chi ha voglia finisce dritto nella schermata del craving. */
export default function UmoreFoglio({ onScegli, onChiudi }) {
  return (
    <div className="umore-velo" onClick={(e) => { if (e.target === e.currentTarget) onChiudi(); }}>
      <div className="umore-foglio" role="dialog" aria-modal="true" aria-label="Come ti senti oggi">
        <div className="umore-maniglia" />
        <h2 className="titolo-schermata" style={{ marginBottom: 0 }}>Come ti senti oggi?</h2>
        <p className="testo" style={{ marginTop: 8 }}>Non c'è una risposta giusta. Serve solo a capire cosa ti serve adesso.</p>

        <div className="umore-lista">
          {UMORI.map((u) => (
            <button key={u.id} className="umore-scelta" onClick={() => onScegli(u.id)}>
              <span className="umore-faccia" aria-hidden="true">{u.faccia}</span>
              <span className="card-riga-corpo">
                <span className="umore-testo">{u.testo}</span>
                <span className="umore-sub" style={{ display: 'block' }}>{u.sub}</span>
              </span>
            </button>
          ))}
        </div>

        <button className="btn btn-testo btn-testo-tenue btn-testo-centro" style={{ marginTop: 12 }} onClick={onChiudi}>
          Non adesso
        </button>
      </div>
    </div>
  );
}
