import { Check } from 'lucide-react';
import { DAY } from '../constants';
import { durata } from '../utils/format';

/* Quanto è "vero" uno stop: la ricaduta resta possibile per mesi, e dirlo
   serve a tenere la persona in app proprio quando crede di aver finito. */
function faseStop(ms) {
  const g = ms / DAY;
  if (g < 3) return { fase: 'Il picco è adesso', testo: 'I primi tre giorni sono i più duri: l\u2019astinenza fisica tocca il massimo e poi cala.' };
  if (g < 14) return { fase: 'Fase critica', testo: 'La maggior parte delle ricadute avviene in queste due settimane. Non è ancora fatta: continua a segnare.' };
  if (g < 90) return { fase: 'Fuori dal peggio', testo: 'La parte fisica è passata, restano le abitudini. È qui che serve il tuo se–allora.' };
  if (g < 365) return { fase: 'Tre mesi superati', testo: 'Il rischio è molto più basso, ma non è zero fino all\u2019anno. Chi continua a monitorarsi ricade meno.' };
  return { fase: 'Oltre l\u2019anno', testo: 'Dopo un anno le ricadute diventano rare. Segnare i giorni a zero costa dieci secondi e tiene il conto vivo.' };
}

export default function StrisciaStop({ ms, record, checkedIn, onCheckin }) {
  const { fase, testo } = faseStop(ms);
  return (
    <div className="stop-card">
      <div className="stop-eyebrow">SENZA FUMARE</div>
      <div className="stop-val num">{durata(ms)}</div>
      {record > 0 && <div className="stop-record num">record personale: {durata(record)}</div>}
      <div className="stop-fase">{fase}</div>
      <p className="stop-testo">{testo}</p>
      {checkedIn ? (
        <div className="stop-fatto"><Check size={15} /> Oggi confermato a zero</div>
      ) : (
        <button className="btn btn-foglia btn-block" onClick={onCheckin}>Confermo: oggi zero</button>
      )}
    </div>
  );
}
