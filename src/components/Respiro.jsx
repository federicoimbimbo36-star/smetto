import { useState, useEffect, useRef } from 'react';

/* ------------------------------------------------------------------ */
/*  RESPIRA CON ME                                                     */
/*                                                                     */
/*  Niente statistiche, niente menu, niente contatori di soldi: qui    */
/*  c'è solo il respiro. Il ritmo è 4–2–6, con l'espirazione più lunga */
/*  dell'inspirazione: è quella che abbassa davvero la frequenza       */
/*  cardiaca, mentre respirare veloce la alza.                         */
/*                                                                     */
/*  Il cerchio non è decorazione: è l'istruzione. Cresce mentre devi   */
/*  inspirare, si ferma mentre trattieni, cala mentre espiri — anche   */
/*  a occhi socchiusi si capisce cosa fare.                            */
/* ------------------------------------------------------------------ */

const FASI = [
  { nome: 'Inspira', secondi: 4, scala: 1 },
  { nome: 'Trattieni', secondi: 2, scala: 1 },
  { nome: 'Espira', secondi: 6, scala: 0.58 },
];

export default function Respiro({ onFine, onHoFumato }) {
  const [fase, setFase] = useState(0);
  const [restano, setRestano] = useState(FASI[0].secondi);
  const [cicli, setCicli] = useState(0);
  const faseRef = useRef(0);

  useEffect(() => {
    const i = setInterval(() => {
      setRestano((r) => {
        if (r > 1) return r - 1;
        const prossima = (faseRef.current + 1) % FASI.length;
        faseRef.current = prossima;
        setFase(prossima);
        if (prossima === 0) setCicli((c) => c + 1);
        return FASI[prossima].secondi;
      });
    }, 1000);
    return () => clearInterval(i);
  }, []);

  const attuale = FASI[fase];

  return (
    <div className="respiro-schermo">
      <div className="respiro-cerchio-wrap">
        <span
          className="respiro-alone"
          style={{ transform: `scale(${attuale.scala})`, transitionDuration: `${attuale.secondi}s` }}
        />
        <span
          className="respiro-cerchio"
          style={{ transform: `scale(${attuale.scala})`, transitionDuration: `${attuale.secondi}s` }}
        />
        <div className="respiro-dentro">
          <div className="respiro-fase">{attuale.nome}</div>
          <div className="respiro-conta num" aria-hidden="true">{restano}</div>
        </div>
      </div>

      <p className="respiro-cicli num">
        {cicli === 0 ? 'Segui il cerchio' : `${cicli} ${cicli === 1 ? 'respiro completo' : 'respiri completi'}`}
      </p>

      <div className="respiro-fine pila">
        <button className="btn btn-primario btn-blocco" onClick={onFine}>
          {cicli >= 3 ? 'Sto meglio' : 'Ho finito'}
        </button>
        <button className="btn btn-testo btn-testo-tenue btn-testo-centro" onClick={onHoFumato}>
          Ho fumato lo stesso — registrala
        </button>
      </div>
    </div>
  );
}
