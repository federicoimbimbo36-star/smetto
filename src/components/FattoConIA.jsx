import { useState } from 'react';
import { X } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  FATTO DA UNA PERSONA, CON L'IA                                     */
/*                                                                     */
/*  Nota di trasparenza sotto l'accesso: si tocca e si apre l'elenco   */
/*  degli assistenti usati per costruire l'app.                        */
/*                                                                     */
/*  PERCHÉ QUI NON CI SONO I LOGHI. I marchi di Anthropic, Google,     */
/*  Moonshot e OpenAI sono registrati, e le rispettive linee guida     */
/*  vietano di usarli in modo che suggerisca un rapporto o             */
/*  un'approvazione che non c'è. Un'app pubblicata sugli store che     */
/*  mostra quattro loghi altrui in una schermata intitolata «fatto     */
/*  con» sta esattamente lì. Citare i NOMI invece è uso nominativo e   */
/*  non ha lo stesso problema: dice la stessa cosa e non espone a      */
/*  niente. Le sigle nei cerchi sono disegnate col carattere di        */
/*  Smetto, quindi non assomigliano a nessun marchio.                  */
/*                                                                     */
/*  Se vuoi comunque i loghi veri, vanno scaricati dai press kit       */
/*  ufficiali e usati secondo le loro regole: è una decisione tua, non */
/*  una cosa che si improvvisa da qui.                                 */
/* ------------------------------------------------------------------ */

/* La riga che si vede. L'app è tutta in italiano e una frase in inglese
   sull'unica schermata che vedono tutti stona: la versione italiana è
   qui sotto, si cambia una costante. */
export const FRASE = 'Created by a man using AI';
// export const FRASE = "Fatto da una persona, con l'aiuto dell'IA";

/* CONTROLLA E CORREGGI QUESTI RUOLI prima di pubblicare: sono ricostruiti
   da come è andata finora, e sei l'unico a sapere davvero chi ha fatto
   cosa. Una nota di trasparenza che dice cose imprecise vale meno di
   nessuna nota. */
const STRUMENTI = [
  { sigla: 'C', nome: 'Claude', ruolo: 'Codice, design system e verifiche' },
  { sigla: 'G', nome: 'ChatGPT', ruolo: 'La direzione del redesign' },
  { sigla: 'K', nome: 'Kimi', ruolo: 'Riletture critiche del codice' },
  { sigla: 'M', nome: 'Gemini', ruolo: 'Confronto su testi e soluzioni' },
];

export default function FattoConIA() {
  const [aperto, setAperto] = useState(false);

  return (
    <>
      <button className="ia-riga" onClick={() => setAperto(true)}>
        {FRASE}
      </button>

      {aperto && (
        <div className="umore-velo" onClick={(e) => { if (e.target === e.currentTarget) setAperto(false); }}>
          <div className="umore-foglio" role="dialog" aria-modal="true" aria-label="Come è stata fatta questa app">
            <div className="umore-maniglia" />
            <div className="intestazione">
              <h2 className="titolo-sezione">Come è fatta questa app</h2>
              <button className="btn-icona" onClick={() => setAperto(false)} aria-label="Chiudi">
                <X size={20} />
              </button>
            </div>

            <p className="testo">
              Smetto è stata pensata, decisa e controllata da una persona. Il codice, la grafica
              e i testi sono stati scritti con l&apos;aiuto di questi assistenti.
            </p>

            <div className="ia-lista">
              {STRUMENTI.map((s) => (
                <div key={s.nome} className="ia-voce">
                  <span className="ia-sigla" aria-hidden="true">{s.sigla}</span>
                  <span className="card-riga-corpo">
                    <span className="ia-nome">{s.nome}</span>
                    <span className="ia-ruolo">{s.ruolo}</span>
                  </span>
                </div>
              ))}
            </div>

            {/* Il punto che conta davvero per chi usa un'app sulla salute:
                dentro non gira nessuna IA, quindi le sue sigarette non
                finiscono in nessun modello. */}
            <div className="card card-tenue" style={{ marginTop: 24 }}>
              <p className="testo-piccolo">
                <b>Dentro l&apos;app non c&apos;è nessuna intelligenza artificiale.</b> Questi
                assistenti sono serviti a costruirla, non la fanno funzionare: quello che registri
                resta fra il tuo telefono e il tuo account, e non viene mandato a nessuno di loro.
              </p>
            </div>

            <p className="nota">
              Questa nota è una scelta, non un obbligo: il regolamento europeo sull&apos;IA riguarda
              i sistemi di IA messi sul mercato, non i programmi scritti con il loro aiuto.
            </p>

            <button
              className="btn btn-secondario btn-blocco" style={{ marginTop: 20 }}
              onClick={() => setAperto(false)}
            >
              Ho capito
            </button>
          </div>
        </div>
      )}
    </>
  );
}
