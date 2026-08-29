import { useState } from 'react';
import { DAY, TRIGGER } from '../constants';
import { durata } from '../utils/format';
import { Pianta } from '../components';

/* ------------------------------------------------------------------ */
/*  RIPARTIAMO DA QUI                                                  */
/*                                                                     */
/*  Nessun rosso. Nessuno «STREAK PERSA». Nessuno zero grande in       */
/*  faccia. Il numero grande di questa schermata è il tempo che la     */
/*  persona AVEVA TENUTO — cioè la cosa che ha fatto bene — e la       */
/*  pianta accanto è la prova visiva che il percorso non si è azzerato.*/
/*                                                                     */
/*  Poi una domanda sola: cosa è successo? La risposta non è una       */
/*  confessione: finisce nelle etichette del registro, quindi torna    */
/*  fuori come «lo stress ti ha innescato 6 sigarette» e come suggeri- */
/*  mento di scrivere il se–allora giusto. La ricaduta diventa un dato.*/
/* ------------------------------------------------------------------ */

export default function RicadutaOverlay({ pausa, frase, ripartenze, giorniPercorso, onCausa, onChiudi }) {
  const [scelta, setScelta] = useState(null);
  const giorni = Math.floor(pausa / DAY);

  const rispondi = (causa) => {
    setScelta(causa);
    onCausa(causa);
  };

  return (
    <div className="ricaduta">
      <div className="ricaduta-corpo">
        <h1 className="ricaduta-titolo">Va bene.<br />Ripartiamo da qui.</h1>
        <p className="ricaduta-sub">
          {giorni >= 1
            ? (giorni === 1 ? 'Quel giorno non è andato perso.' : `Quei ${giorni} giorni non sono andati persi.`)
            : 'Il tempo che hai tenuto non è andato perso.'}
        </p>

        <div className="ricaduta-tenuto">
          <Pianta giorni={giorniPercorso} dimensione={92} mostraStadio={false} />
          <div className="card-riga-corpo">
            <div className="ricaduta-tenuto-val num">{durata(pausa)}</div>
            <div className="ricaduta-tenuto-lab">
              è quanto sei riuscito a stare senza. Il tuo percorso è al giorno {giorniPercorso + 1}
              {' '}e da lì continua.
            </div>
          </div>
        </div>

        <p className="ricaduta-frase">{frase}</p>

        <div className="ricaduta-domanda">
          <h2 className="titolo-sezione">Cosa è successo?</h2>
          <p className="testo-piccolo" style={{ margin: '8px 0 16px' }}>
            Saperlo serve: torna fuori nel Percorso e diventa il se–allora da scrivere.
          </p>
          <div className="pastiglie">
            {TRIGGER.map((t) => (
              <button
                key={t} className={`pastiglia ${scelta === t ? 'pastiglia-on' : ''}`}
                onClick={() => rispondi(t)}
              >
                {t}
              </button>
            ))}
            <button
              className={`pastiglia ${scelta === '—' ? 'pastiglia-on' : ''}`}
              onClick={() => rispondi('—')}
            >
              preferisco non dirlo
            </button>
          </div>
        </div>

        {ripartenze > 1 && (
          <p className="ricaduta-conta">
            È la {ripartenze}ª volta che riparti. Chi smette davvero ci prova in media più volte:
            ogni tentativo conta, compreso questo.
          </p>
        )}
      </div>

      <div className="ricaduta-azioni">
        <button className="btn btn-primario btn-blocco" onClick={onChiudi}>Riparto adesso</button>
      </div>
    </div>
  );
}
