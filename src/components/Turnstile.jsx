import { useEffect, useRef, useState } from 'react';
import { creaGestore } from '../utils/captcha';

/* ------------------------------------------------------------------ */
/*  TURNSTILE — la verifica anti-bot davanti ad accesso, registrazione */
/*  e cambio password.                                                 */
/*                                                                     */
/*  Lo script arriva da `index.html`, non da qui: è una riga sola,      */
/*  serve un'unica volta per pagina, e caricarlo da un componente       */
/*  vorrebbe dire riscrivere a mano il pezzo di codice che evita di     */
/*  inserirlo due volte. In cambio questo componente deve saper         */
/*  aspettare: `async defer` significa che al primo render             */
/*  `window.turnstile` può ancora non esserci.                          */
/*                                                                     */
/*  Render ESPLICITO (`?render=explicit` nello script): senza, Turnstile */
/*  cerca da solo gli elementi `.cf-turnstile` appena si carica, e con  */
/*  React finirebbe per disegnare dentro un nodo che il render          */
/*  successivo ha già sostituito — widget fantasma, nessun token.       */
/*                                                                     */
/*  Tre stati, e servono tutti e tre:                                   */
/*   · attesa  — lo script non è ancora arrivato. Nessun messaggio: il  */
/*               caso normale dura qualche centinaio di millisecondi e  */
/*               un avviso che lampeggia sembra un guasto.              */
/*   · pronto  — è arrivato un token.                                   */
/*   · errore  — script mai arrivato entro il tempo massimo, oppure     */
/*               sfida fallita. QUI il messaggio ci vuole, altrimenti   */
/*               la persona vede un riquadro vuoto e non sa cosa fare.  */
/*                                                                     */
/*  La SCADENZA (i token durano pochi minuti) e il timeout riportano il */
/*  token a stringa vuota: meglio nessun token, che l'app sa gestire,   */
/*  di un token morto che il server rifiuta.                            */
/*                                                                     */
/*  Senza sitekey non disegna niente e non aspetta niente. È il         */
/*  comportamento voluto finché la protezione è spenta su Supabase.     */
/* ------------------------------------------------------------------ */

/* 200 ms per 50 tentativi = 10 secondi. Oltre, lo script non arriva più:
   rete caduta, blocco di un'estensione, dominio irraggiungibile. Meglio
   dirlo che lasciare un rettangolo vuoto a tempo indeterminato. */
const PASSO_ATTESA = 200;
const TENTATIVI_MAX = 50;

export default function Turnstile({ sitekey, azione, alToken, azzeramenti = 0 }) {
  const nodo = useRef(null);
  const gestore = useRef(null);
  const [stato, setStato] = useState('attesa');

  /* La richiamata passa da un riferimento, non dalle dipendenze
     dell'effetto: chi ci arriva è quasi sempre una funzione ricreata a
     ogni render, e metterla fra le dipendenze rimonterebbe il widget di
     continuo — una sfida nuova a ogni tasto premuto. */
  const alTokenRef = useRef(alToken);
  useEffect(() => { alTokenRef.current = alToken; }, [alToken]);

  useEffect(() => {
    if (!sitekey) return undefined;

    let vivo = true;
    let tentativi = 0;
    let timer = null;
    const avvisa = (t) => { if (vivo && typeof alTokenRef.current === 'function') alTokenRef.current(t); };

    const prova = () => {
      if (!vivo) return;
      const api = typeof window === 'undefined' ? null : window.turnstile;
      if (!api || !nodo.current) {
        tentativi += 1;
        if (tentativi > TENTATIVI_MAX) { setStato('errore'); return; }
        timer = setTimeout(prova, PASSO_ATTESA);
        return;
      }
      gestore.current = creaGestore(api);
      const id = gestore.current.monta(nodo.current, {
        sitekey,
        azione,
        alToken: (t) => { setStato('pronto'); avvisa(t); },
        alloScadere: () => { setStato('attesa'); avvisa(''); },
        alErrore: () => { setStato('errore'); avvisa(''); },
      });
      if (id === null) setStato('errore');
    };

    prova();

    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
      if (gestore.current) { gestore.current.smonta(); gestore.current = null; }
    };
  }, [sitekey, azione]);

  /* L'azzeramento arriva come CONTATORE e non come funzione esposta
     all'esterno: un numero che cresce è un fatto che React sa propagare da
     sé, mentre un riferimento imperativo passato all'insù è una cosa in
     più che può restare appesa a un componente smontato. Si parte da 0 e
     il primo giro non azzera niente: il widget si è appena montato. */
  useEffect(() => {
    if (azzeramenti > 0 && gestore.current) gestore.current.azzera();
  }, [azzeramenti]);

  if (!sitekey) return null;

  return (
    <div className="captcha">
      <div className="captcha-riquadro" ref={nodo} />
      {stato === 'errore' && (
        <p className="captcha-nota">
          Verifica anti-bot non caricata. Controlla la connessione e ricarica la pagina.
        </p>
      )}
    </div>
  );
}
