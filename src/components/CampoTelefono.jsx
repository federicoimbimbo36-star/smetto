import { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { PREFISSI, cercaPrefissi } from '../data/prefissi';

/* I prefissi più lunghi per primi: +1809 (Rep. Dominicana) deve vincere
   su +1 (Stati Uniti), altrimenti un numero dominicano incollato fa
   selezionare il paese sbagliato. */
const PER_LUNGHEZZA = [...PREFISSI].sort((a, b) => b.prefisso.length - a.prefisso.length);

/* ------------------------------------------------------------------ */
/*  CAMPO TELEFONO                                                     */
/*                                                                     */
/*  Bandiera e prefisso a sinistra, numero a destra: la forma che tutti */
/*  hanno già visto e che quindi nessuno deve imparare.                 */
/*                                                                     */
/*  Prima il campo era uno solo e il codice metteva +39 a chiunque.     */
/*  Per un'app italiana sembra ragionevole finché non ci prova un       */
/*  rumeno o un albanese — e sono, nell'ordine, le due comunità         */
/*  straniere più numerose in Italia: si registravano con un numero     */
/*  sbagliato senza che niente lo segnalasse, e al primo recupero       */
/*  password l'account era irraggiungibile.                             */
/*                                                                     */
/*  Il numero digitato NON viene riformattato mentre si scrive: farlo   */
/*  significa spostare il cursore sotto le dita di chi sta scrivendo,   */
/*  ed è lo stesso genere di bug che rendeva impossibile inserire il    */
/*  prezzo del pacchetto con la virgola.                                */
/* ------------------------------------------------------------------ */

export default function CampoTelefono({
  paese, setPaese, numero, setNumero, disabled, onInvio, autoFocus,
}) {
  const [aperto, setAperto] = useState(false);
  const [query, setQuery] = useState('');
  const ricerca = useRef(null);

  const risultati = useMemo(() => cercaPrefissi(query), [query]);

  useEffect(() => {
    if (aperto) {
      setQuery('');
      // il tempo di far salire il foglio, altrimenti su iOS la tastiera
      // apre mentre l'animazione è a metà e il foglio salta
      const t = setTimeout(() => ricerca.current?.focus(), 320);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [aperto]);

  const scegli = (p) => { setPaese(p); setAperto(false); };

  /* Incollare «+40 721 234 567» deve cambiare il paese da solo e lasciare
     nel campo solo il numero locale: è quello che fa la gente quando copia
     il numero dalla rubrica, ed è l'unico momento in cui riscrivere il
     campo sotto le dita è giusto — perché l'utente non stava scrivendo,
     stava incollando. */
  const scrivi = (valore) => {
    const pulito = valore.replace(/[^0-9+ ]/g, '');
    const cifre = pulito.replace(/[^0-9+]/g, '');
    if (cifre.startsWith('+') && cifre.length > 2) {
      const trovato = PER_LUNGHEZZA.find((p) => cifre.startsWith(p.prefisso));
      if (trovato) {
        if (trovato.iso !== paese.iso) setPaese(trovato);
        setNumero(cifre.slice(trovato.prefisso.length));
        return;
      }
    }
    setNumero(valore);
  };

  return (
    <>
      <div className="tel">
        <button
          type="button" className="tel-paese" onClick={() => setAperto(true)} disabled={disabled}
          aria-label={`Prefisso: ${paese.nome} ${paese.prefisso}. Tocca per cambiare paese`}
        >
          <span className="tel-bandiera" aria-hidden="true">{paese.bandiera}</span>
          <span className="tel-prefisso num">{paese.prefisso}</span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
        <input
          className="campo-input tel-numero num" type="tel" inputMode="tel"
          placeholder={paese.iso === 'IT' ? '333 123 4567' : 'Il tuo numero'}
          value={numero} onChange={(e) => scrivi(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && onInvio) onInvio(); }}
          autoComplete="tel-national" disabled={disabled} autoFocus={autoFocus}
        />
      </div>

      {aperto && (
        <div className="umore-velo" onClick={(e) => { if (e.target === e.currentTarget) setAperto(false); }}>
          <div className="umore-foglio tel-foglio" role="dialog" aria-modal="true" aria-label="Scegli il paese">
            <div className="umore-maniglia" />
            <div className="intestazione">
              <h2 className="titolo-sezione">In che paese sei?</h2>
              <button className="btn-icona" onClick={() => setAperto(false)} aria-label="Chiudi">
                <X size={20} />
              </button>
            </div>

            <div className="tel-ricerca">
              <Search size={18} aria-hidden="true" />
              <input
                ref={ricerca} className="tel-ricerca-input" type="search"
                placeholder="Cerca il paese o il prefisso" value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && risultati.length) scegli(risultati[0]); }}
              />
            </div>

            <div className="tel-lista">
              {risultati.length === 0 && (
                <p className="testo-piccolo" style={{ padding: '24px 4px' }}>
                  Nessun paese con questo nome o prefisso. Prova a scrivere solo le prime lettere.
                </p>
              )}
              {risultati.map((p) => (
                <button
                  key={`${p.iso}-${p.prefisso}`}
                  className={`tel-riga ${p.iso === paese.iso ? 'tel-riga-on' : ''}`}
                  onClick={() => scegli(p)}
                >
                  <span className="tel-bandiera" aria-hidden="true">{p.bandiera}</span>
                  <span className="tel-nome">{p.nome}</span>
                  <span className="tel-prefisso num">{p.prefisso}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export { PREFISSI };
