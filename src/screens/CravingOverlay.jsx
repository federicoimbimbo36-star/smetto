import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { ATTESA, CONSIGLI } from '../constants';
import { mmss, eur } from '../utils/format';

export default function CravingOverlay({ motivo, piano, minuti, costo, onCeLHoFatta, onHoFumato, onChiudi }) {
  const [restano, setRestano] = useState(ATTESA);
  const [consiglio, setConsiglio] = useState(() => Math.floor(Math.random() * CONSIGLI.length));

  useEffect(() => {
    const i = setInterval(() => setRestano((r) => (r > 0 ? r - 1 : 0)), 1000);
    return () => clearInterval(i);
  }, []);
  useEffect(() => {
    const i = setInterval(() => setConsiglio((c) => (c + 1) % CONSIGLI.length), 20000);
    return () => clearInterval(i);
  }, []);

  const trascorsi = ATTESA - restano;
  const fase = trascorsi % 14 < 4 ? 'inspira' : trascorsi % 14 < 8 ? 'trattieni' : 'espira';
  const finito = restano === 0;

  return (
    <div className="craving">
      <button className="craving-close" onClick={onChiudi} aria-label="Chiudi"><X size={20} /></button>

      <div className="craving-body">
        <div className="eyebrow-row eyebrow-center"><span>{finito ? 'È PASSATA' : 'ASPETTA PRIMA DI ACCENDERE'}</span></div>

        <div className="respiro-wrap">
          <div className="respiro" />
          <div className="respiro-inner">
            <div className="respiro-time num">{mmss(restano)}</div>
            <div className="respiro-fase">{finito ? 'ce l\u2019hai fatta' : fase}</div>
          </div>
        </div>

        <div className="craving-posta">
          <div className="craving-posta-cell">
            <div className="craving-posta-val num">{minuti} min</div>
            <div className="craving-posta-lab">di vita che ti tieni</div>
          </div>
          <div className="craving-posta-sep" />
          <div className="craving-posta-cell">
            <div className="craving-posta-val num">{costo ? eur(costo) : '—'}</div>
            <div className="craving-posta-lab">che restano in tasca</div>
          </div>
        </div>

        {motivo && (
          <div className="craving-motivo">
            <div className="eyebrow-row eyebrow-center"><span>IL TUO MOTIVO</span></div>
            <p className="craving-motivo-testo">“{motivo}”</p>
          </div>
        )}

        {piano && <div className="craving-piano"><b>Il tuo piano:</b> {piano}</div>}

        <p className="craving-consiglio">{CONSIGLI[consiglio]}</p>
      </div>

      <div className="craving-actions">
        <button className="btn btn-foglia btn-block" onClick={onCeLHoFatta}>
          {finito ? 'Ce l\u2019ho fatta' : 'È passata, ce l\u2019ho fatta'}
        </button>
        <button className="link-btn craving-cedi" onClick={onHoFumato}>Ho fumato lo stesso — registrala</button>
      </div>
    </div>
  );
}
