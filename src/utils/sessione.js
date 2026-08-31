/* ------------------------------------------------------------------ */
/* sessione.js — src/utils/sessione.js                                 */
/*                                                                     */
/* Caricare un account non è un'operazione sola: si legge la sessione,  */
/* si applica il profilo, si carica il registro — che a sua volta legge */
/* il disco e interroga il database. Fra un'attesa e l'altra la         */
/* sessione può cambiare: logout da un'altra scheda, accesso con un     */
/* altro account. Il caricamento vecchio arrivava comunque in fondo e   */
/* chiamava `setIsAuthenticated(true)`, ripopolando i dati di chi era    */
/* appena uscito.                                                       */
/*                                                                     */
/* Sta qui e non dentro App.jsx per la stessa ragione di `costruisciLotto`*/
/* in arretrate.js: una regola scritta dentro un componente React non   */
/* si può eseguire in un banco di prova, e una gara che non si può      */
/* eseguire non si può nemmeno dimostrare chiusa.                        */
/* ------------------------------------------------------------------ */

/* IL GETTONE.

   Ogni sequenza asincrona ne prende uno prima di partire e lo
   ricontrolla dopo ogni `await`, subito prima di toccare lo stato.
   `brucia()` lo fa salire: da quel momento tutto quello che era in volo
   è scaduto e si ritira senza scrivere niente. Si brucia a ogni logout,
   a ogni cambio di account e allo smontaggio. */
export function creaSequenza() {
  let corrente = 1;
  return {
    apri: () => corrente,
    brucia: () => { corrente += 1; },
    scaduto: (gettone) => gettone !== corrente,
  };
}

/* LA SEQUENZA DI CARICAMENTO, con i controlli al posto giusto.

   Restituisce come è andata, e serve soprattutto al banco di prova:
   `'entrato'`, `'nessuna'` (nessuna sessione), `'scaduta'` (superata da
   un logout o da un cambio account), `'errore'`.

   I due controlli non sono ridondanti. Il primo copre il caso in cui la
   sessione se ne va mentre si legge; il secondo copre il caso peggiore,
   cioè che nel frattempo sia entrato QUALCUN ALTRO: lì il gettone può
   anche essere ancora valido — l'ha appena preso il caricamento nuovo —
   ma l'utente corrente non è più quello per cui si stava caricando, e
   `autentica()` renderebbe autenticato l'account sbagliato. */
/* IL REGISTRO SI PREPARA E SI APPLICA IN DUE MOMENTI DIVERSI.

   `preparaRegistro` deve LEGGERE E BASTA: niente stato, niente notifiche,
   niente riferimenti condivisi. Restituisce quello che servirà.
   `applicaRegistro` fa le scritture, e viene chiamata solo qui sotto,
   dopo i controlli.

   È la differenza fra fermare una sequenza vecchia e fermarla in tempo.
   Prima il controllo c'era già, ma arrivava dopo che il caricamento aveva
   scritto per conto suo: si impediva a una sequenza superata di dichiarare
   autenticato l'account sbagliato, e intanto le si lasciava mettere i dati
   di A sulla schermata di B.

   Fra l'ultimo controllo e `applicaRegistro` non c'è nessun `await`, e
   questo è il punto: nessun altro codice può girare in mezzo, quindi non
   esiste un istante in cui la sessione cambi a metà scrittura. */
export async function caricaSessione(seq, {
  leggiSessione,
  applicaProfilo,
  preparaRegistro,
  applicaRegistro,
  utenteAdesso,
  autentica,
  finito,
  errore,
}) {
  const mio = seq.apri();
  try {
    const sessione = await leggiSessione();
    if (seq.scaduto(mio)) return 'scaduta';

    if (!sessione?.user) {
      finito?.();
      return 'nessuna';
    }

    const uid = sessione.user.id;
    applicaProfilo(sessione.user);
    const preparato = await preparaRegistro(uid);
    if (seq.scaduto(mio)) return 'scaduta';
    if (utenteAdesso && utenteAdesso() !== uid) return 'scaduta';

    // da qui in giù nessuna attesa, fino in fondo
    applicaRegistro?.(preparato);
    autentica();
    finito?.();
    return 'entrato';
  } catch (e) {
    /* Anche l'errore va zittito se la sequenza è scaduta: mostrare la
       schermata di accesso «perché il caricamento è fallito» mentre un
       altro account sta entrando è un altro modo di scrivere sopra
       qualcosa che non ci riguarda più. */
    if (seq.scaduto(mio)) return 'scaduta';
    errore?.(e);
    finito?.(e);
    return 'errore';
  }
}
