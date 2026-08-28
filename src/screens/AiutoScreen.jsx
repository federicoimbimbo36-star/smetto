import { useState } from 'react';
import { Wind, Users, Phone, ChevronRight, Heart } from 'lucide-react';
import { TRIGGER } from '../constants';

/* ------------------------------------------------------------------ */
/*  AIUTO                                                              */
/*                                                                     */
/*  Risponde a: «come supero questo momento?».                         */
/*                                                                     */
/*  Il gruppo vive qui dentro e non in una quinta scheda, perché è     */
/*  esattamente cosa fa: è la forma di aiuto che funziona meglio di    */
/*  tutte le altre. Chi ha qualcuno che lo guarda molla meno.          */
/*                                                                     */
/*  Le due azioni in cima devono essere raggiungibili col pollice a    */
/*  occhi socchiusi: sono quelle che si cercano quando si sta male.    */
/* ------------------------------------------------------------------ */

export default function AiutoScreen({
  motivo, plans, gruppi, nonLetti, onCraving, onRespira, onApriGruppo,
  onSalvaPiano, onModificaMotivo,
}) {
  const [aperto, setAperto] = useState(null);
  const [bozza, setBozza] = useState('');

  const apri = (t) => { setAperto(t); setBozza(plans?.[t] || ''); };
  const conferma = () => { onSalvaPiano(aperto, bozza.trim()); setAperto(null); };

  return (
    <div className="screen">
      <h1 className="titolo-schermata">Aiuto</h1>
      <p className="sotto-schermata">
        Non devi superare tutta la giornata. Solo i prossimi minuti.
      </p>

      <div className="pila">
        <button className="aiuto-grande" onClick={onCraving}>
          <span className="aiuto-grande-icona"><Heart size={24} /></span>
          <span className="card-riga-corpo">
            <span className="aiuto-grande-titolo" style={{ display: 'block' }}>Ho voglia di fumare</span>
            <span className="aiuto-grande-sub" style={{ display: 'block' }}>Superiamo insieme questo momento</span>
          </span>
          <ChevronRight size={20} color="var(--t2)" />
        </button>

        <button className="aiuto-grande" onClick={onRespira}>
          <span className="aiuto-grande-icona"><Wind size={24} /></span>
          <span className="card-riga-corpo">
            <span className="aiuto-grande-titolo" style={{ display: 'block' }}>Respira con me</span>
            <span className="aiuto-grande-sub" style={{ display: 'block' }}>Due minuti, solo il respiro</span>
          </span>
          <ChevronRight size={20} color="var(--t2)" />
        </button>
      </div>

      {/* ---- il gruppo ---- */}
      <h2 className="titolo-sezione stacco">Chi ci sta provando con te</h2>
      <button className="card card-tocco" style={{ marginTop: 12 }} onClick={onApriGruppo}>
        <div className="card-riga">
          <span className="banner-icona banner-icona-tenue"><Users size={17} /></span>
          <span className="card-riga-corpo">
            <span className="banner-titolo" style={{ display: 'block' }}>
              {gruppi.length === 0 ? 'Crea o entra in un gruppo'
                : gruppi.length === 1 ? gruppi[0].name
                  : `${gruppi.length} gruppi`}
            </span>
            <span className="banner-testo" style={{ display: 'block' }}>
              {gruppi.length === 0
                ? 'Smettere da soli è più difficile. Bastano due persone.'
                : 'Classifica, attività e codice invito'}
            </span>
          </span>
          {nonLetti > 0 && <span className="nav-pallino" style={{ position: 'static' }}>{nonLetti > 9 ? '9+' : nonLetti}</span>}
          <ChevronRight size={20} color="var(--t2)" />
        </div>
      </button>

      {/* ---- il motivo ---- */}
      <h2 className="titolo-sezione stacco">Perché lo stai facendo</h2>
      {motivo ? (
        <button className="card card-tocco card-tenue" style={{ marginTop: 12 }} onClick={onModificaMotivo}>
          <p style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.4, margin: 0, color: 'var(--t1)' }}>
            “{motivo}”
          </p>
          <span className="nota" style={{ display: 'block' }}>Tocca per cambiarlo</span>
        </button>
      ) : (
        <button className="btn btn-secondario btn-blocco" style={{ marginTop: 12 }} onClick={onModificaMotivo}>
          Scrivi il tuo motivo
        </button>
      )}

      {/* ---- i se–allora ---- */}
      <h2 className="titolo-sezione stacco">I tuoi se–allora</h2>
      <p className="testo-piccolo" style={{ marginTop: 8 }}>
        Decidere prima cosa farai al posto della sigaretta funziona molto meglio che resistere
        sul momento. Scrivilo per le situazioni che ti fregano più spesso.
      </p>
      <div className="piano-se">
        {TRIGGER.map((t) => (
          <div key={t} className="piano-se-riga">
            <div className="piano-se-trigger">se {t}</div>
            {aperto === t ? (
              <div className="piano-se-edit">
                <input
                  className="campo-input" autoFocus value={bozza}
                  onChange={(e) => setBozza(e.target.value)}
                  placeholder="allora… esco a fare due passi"
                  onKeyDown={(e) => { if (e.key === 'Enter') conferma(); }}
                />
                <button className="btn btn-primario btn-piccolo" onClick={conferma}>Salva</button>
              </div>
            ) : (
              <button className="piano-se-valore" onClick={() => apri(t)}>
                {plans?.[t] ? `allora ${plans[t]}` : <span className="piano-se-nulla">tocca per scriverlo</span>}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* ---- l'aiuto vero ---- */}
      <div className="card stacco">
        <h2 className="titolo-sezione">Non sei obbligato a farlo a mani nude</h2>
        <p className="testo-piccolo" style={{ marginTop: 10 }}>
          Cerotti, gomme e farmaci su prescrizione raddoppiano le probabilità di riuscirci
          rispetto alla sola forza di volontà, e i centri antifumo pubblici sono gratuiti.
          Parlane col medico o in farmacia: usare un aiuto non è barare.
        </p>
        <div className="numero-verde">
          <span className="banner-icona"><Phone size={17} /></span>
          <div className="card-riga-corpo">
            <div className="numero-verde-cifra num">800 554 088</div>
            <div className="testo-piccolo">Telefono Verde contro il Fumo · gratuito</div>
          </div>
        </div>
      </div>
    </div>
  );
}
