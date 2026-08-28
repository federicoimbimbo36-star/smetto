import { useState } from 'react';
import { X, Wind, Anchor, Shuffle, MessageCircle, Phone, Users, RefreshCw } from 'lucide-react';
import { CONSIGLI, ATTESA } from '../constants';
import { eur } from '../utils/format';

/* ------------------------------------------------------------------ */
/*  HAI VOGLIA DI FUMARE                                               */
/*                                                                     */
/*  La schermata che decide tutto, e l'unica che è di un altro colore: */
/*  azzurro, non verde. Il verde è il percorso, l'azzurro è il momento */
/*  difficile — e quando arriva, l'app cambia stanza.                  */
/*                                                                     */
/*  Prima domanda, quattro strade, niente altro: nessun contatore,     */
/*  nessuna statistica, nessun conto alla rovescia che metta fretta.   */
/*  I dettagli arrivano SOLO dentro la strada che uno sceglie.         */
/*                                                                     */
/*  «Ho fumato lo stesso» resta sempre visibile e non è mai scritto    */
/*  come una sconfitta: se registrare costa vergogna, la gente smette  */
/*  di registrare e l'app perde l'unico dato che ha.                   */
/* ------------------------------------------------------------------ */

const SCELTE = [
  { id: 'respira', Icona: Wind, testo: 'Respira con me' },
  { id: 'aiuto', Icona: Anchor, testo: 'Aiutami a superarlo' },
  { id: 'distrai', Icona: Shuffle, testo: 'Distrai la mia attenzione' },
  { id: 'parla', Icona: MessageCircle, testo: 'Voglio parlarne' },
];

export default function CravingOverlay({
  motivo, piano, minuti, costo, gruppi, onRespira, onApriGruppo,
  onCeLHoFatta, onHoFumato, onChiudi,
}) {
  const [vista, setVista] = useState('scelta');
  const [consiglio, setConsiglio] = useState(() => Math.floor(Math.random() * CONSIGLI.length));

  const altraIdea = () => setConsiglio((c) => (c + 1 + Math.floor(Math.random() * (CONSIGLI.length - 1))) % CONSIGLI.length);

  const scegli = (id) => {
    if (id === 'respira') { onRespira(); return; }
    setVista(id);
  };

  return (
    <div className="craving">
      <button className="btn-icona craving-chiudi" onClick={onChiudi} aria-label="Chiudi">
        <X size={22} />
      </button>

      <div className="craving-corpo">
        {vista === 'scelta' && (
          <>
            <h1 className="craving-titolo">Hai voglia di fumare?</h1>
            <p className="craving-sub">
              Non devi superare tutta la giornata. Superiamo insieme questi prossimi minuti.
            </p>
            <div className="craving-scelte">
              {SCELTE.map(({ id, Icona, testo }) => (
                <button key={id} className="craving-scelta" onClick={() => scegli(id)}>
                  <span className="craving-scelta-icona"><Icona size={22} /></span>
                  {testo}
                </button>
              ))}
            </div>
          </>
        )}

        {vista === 'aiuto' && (
          <>
            <h1 className="craving-titolo">Ecco perché hai cominciato</h1>
            {motivo ? (
              <div className="craving-motivo">
                <p className="craving-motivo-testo">“{motivo}”</p>
              </div>
            ) : (
              <p className="craving-sub">
                Non hai ancora scritto il tuo motivo. Quando lo farai, comparirà qui — è la cosa
                che funziona meglio in questo momento preciso.
              </p>
            )}

            {piano && (
              <div className="craving-piano">
                <b>Il piano che ti eri scritto</b>
                {piano}
              </div>
            )}

            <div className="craving-posta">
              <div>
                <div className="craving-posta-val num">{minuti} min</div>
                <div className="craving-posta-lab">di vita che ti tieni</div>
              </div>
              <div>
                <div className="craving-posta-val num">{costo ? eur(costo) : '—'}</div>
                <div className="craving-posta-lab">che restano in tasca</div>
              </div>
            </div>
          </>
        )}

        {vista === 'distrai' && (
          <>
            <h1 className="craving-titolo">Prova questa</h1>
            <p className="craving-consiglio" style={{ fontSize: 19, fontWeight: 600, color: 'var(--t1)' }}>
              {CONSIGLI[consiglio]}
            </p>
            <button className="btn btn-calmo" style={{ marginTop: 24 }} onClick={altraIdea}>
              <RefreshCw size={17} /> Un'altra idea
            </button>
            <p className="craving-consiglio">
              La voglia sale, tocca un picco e scende: quasi sempre in meno di {ATTESA / 60} minuti.
              Non cresce all'infinito, anche se in questo momento sembra di sì.
            </p>
          </>
        )}

        {vista === 'parla' && (
          <>
            <h1 className="craving-titolo">Dirlo a voce alta la sgonfia</h1>
            <p className="craving-sub">
              Non è un modo di dire: raccontare la voglia a qualcuno mentre ce l'hai è una delle
              cose che funzionano meglio.
            </p>
            <div className="craving-scelte">
              {gruppi?.length > 0 && (
                <button className="craving-scelta" onClick={onApriGruppo}>
                  <span className="craving-scelta-icona"><Users size={22} /></span>
                  Scrivi al tuo gruppo
                </button>
              )}
              <a className="craving-scelta" href="tel:800554088" style={{ textDecoration: 'none' }}>
                <span className="craving-scelta-icona"><Phone size={22} /></span>
                <span>
                  Telefono Verde contro il Fumo
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--t2)', marginTop: 2 }}>
                    800 554 088 · gratuito
                  </span>
                </span>
              </a>
            </div>
          </>
        )}
      </div>

      <div className="pila">
        {vista !== 'scelta' && (
          <button className="btn btn-calmo btn-blocco" onClick={() => setVista('scelta')}>
            Prova qualcos'altro
          </button>
        )}
        <button className="btn btn-primario btn-blocco" onClick={onCeLHoFatta}>Ce l'ho fatta</button>
        <button className="btn btn-testo btn-testo-tenue btn-testo-centro craving-cedi" onClick={onHoFumato}>
          Ho fumato lo stesso — registrala
        </button>
      </div>
    </div>
  );
}
