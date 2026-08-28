import { Check } from 'lucide-react';
import Progresso from './Progresso';

/* La timeline del Percorso: una linea, dei punti, molto spazio.
   Niente livelli, niente XP, niente badge — ogni tappa è una cosa che
   sta succedendo al corpo, non un premio che si sblocca. */
export default function Timeline({ tappe }) {
  return (
    <ol className="timeline" style={{ listStyle: 'none', padding: '0 0 0 34px', margin: 0 }}>
      {tappe.map((t) => (
        <li
          key={t.titolo}
          className={`tappa ${t.raggiunta ? 'tappa-ok' : t.corrente ? 'tappa-ora' : 'tappa-futura'}`}
        >
          <span className="tappa-punto">{t.raggiunta && <Check size={11} strokeWidth={3.4} />}</span>
          <div className="tappa-quando">{t.quando}</div>
          <h3 className="tappa-titolo">{t.titolo}</h3>
          {(t.raggiunta || t.corrente) && <p className="tappa-testo">{t.testo}</p>}
          {t.corrente && (
            <>
              <div className="tappa-barra"><Progresso valore={t.progresso} sottile /></div>
              {t.manca && <div className="tappa-manca num">tra {t.manca}</div>}
            </>
          )}
        </li>
      ))}
    </ol>
  );
}
