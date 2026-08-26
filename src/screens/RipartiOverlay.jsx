import { DAY, MANTRA } from '../constants';
import { durata } from '../utils/format';

export default function RipartiOverlay({ pausa, frase, ripartenze, onChiudi }) {
  const giorni = Math.floor(pausa / DAY);
  return (
    <div className="riparti">
      <div className="riparti-body">
        <div className="eyebrow-row eyebrow-center"><span>REGISTRATA</span></div>

        <div className="riparti-tempo num">{durata(pausa)}</div>
        <p className="riparti-label">
          {giorni >= 1
            ? 'è quanto avevi tenuto prima di questa'
            : 'è quanto sei riuscito a stare senza'}
        </p>

        <div className="riparti-frase">{frase}</div>

        <div className="motto motto-scuro">
          <span className="motto-testo">{MANTRA}</span>
          <span className="motto-coda">Se ricadi, riprova.</span>
        </div>

        {ripartenze > 1 && (
          <p className="riparti-conta num">
            È la {ripartenze}ª volta che riparti. Chi smette davvero ci prova in media più volte:
            ogni tentativo conta.
          </p>
        )}
      </div>

      <button className="btn btn-foglia btn-block" onClick={onChiudi}>Riparto adesso</button>
    </div>
  );
}
