import { DAY } from '../constants';

/* Dove sei nella disassuefazione. Non è una barra dei progressi: è
   informazione clinica utile proprio quando uno crede di aver finito e
   molla la guardia (la maggior parte delle ricadute è nelle prime due
   settimane). Il tono resta quello del resto dell'app: constata, non spaventa. */
export function faseStop(ms) {
  const g = ms / DAY;
  if (g < 3) return { fase: 'Il picco è adesso', testo: 'I primi tre giorni sono i più duri: l\u2019astinenza fisica tocca il massimo e poi cala.' };
  if (g < 14) return { fase: 'Le due settimane che contano', testo: 'È qui che avviene la maggior parte delle ricadute. Non è ancora automatico: continua a segnare.' };
  if (g < 90) return { fase: 'Fuori dal peggio', testo: 'La parte fisica è passata, restano le abitudini. È qui che serve il tuo se\u2013allora.' };
  if (g < 365) return { fase: 'Tre mesi superati', testo: 'Il rischio è molto più basso, ma non è zero fino all\u2019anno. Chi continua a monitorarsi ricade meno.' };
  return { fase: 'Oltre l\u2019anno', testo: 'Dopo un anno le ricadute diventano rare. Segnare i giorni a zero costa dieci secondi e tiene vivo il conto.' };
}

export default function FaseStop({ ms }) {
  const { fase, testo } = faseStop(ms);
  return (
    <div className="card card-tenue stacco">
      <h3 className="titolo-sezione">{fase}</h3>
      <p className="testo-piccolo" style={{ marginTop: 8 }}>{testo}</p>
    </div>
  );
}
