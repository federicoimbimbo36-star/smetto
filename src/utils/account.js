/* ------------------------------------------------------------------ */
/*  ELIMINARE L'ACCOUNT                                                */
/*                                                                     */
/*  Sta qui e non dentro App.jsx per la stessa ragione di               */
/*  `tappeDaRiavviare` e `togliLotto`: è una sequenza con degli esiti,  */
/*  e gli esiti vanno provati.                                         */
/*                                                                     */
/*  «ACCOUNT ELIMINATO.» SI DICE SOLO SE È SUCCESSO DAVVERO.           */
/*                                                                     */
/*  Prima l'esito non veniva letto: senza rete la cancellazione         */
/*  falliva, l'app faceva comunque il logout e mostrava la conferma, e  */
/*  l'utente restava convinto di non esistere più mentre account,       */
/*  registro e sessione erano tutti ancora lì. Su un'app che tratta     */
/*  dati di salute è la peggiore delle bugie possibili.                 */
/*                                                                     */
/*  Una transazione non c'è e non la si inventa: l'architettura non la  */
/*  sostiene. Si procede in ordine, ci si ferma al primo passo che non  */
/*  riesce, e si RESTITUISCE cosa è riuscito — così chi chiama può      */
/*  rimettere in ordine lo stato locale invece di lasciarlo a metà.     */
/*                                                                     */
/*  L'ordine non è casuale: prima si esce dai gruppi, poi si cancella,  */
/*  poi — e solo allora — si toglie quello che è rimasto sul            */
/*  dispositivo. Se l'uscita non riesce non si prova nemmeno a          */
/*  cancellare, perché resterebbe una riga di classifica di un account  */
/*  che non c'è più; e se la cancellazione non riesce non si tocca la   */
/*  copia locale, perché quell'account esiste ancora e quei dati sono   */
/*  ancora suoi.                                                       */
/*                                                                     */
/*  IL DATABASE NON È L'UNICO POSTO DOVE STANNO I DATI. `delete_me()`   */
/*  cancella account e righe remote; registro e «già visti» restavano   */
/*  in chiaro nella copia locale, insieme alle scritture ancora in      */
/*  coda. Sono dati di salute su un telefono che può cambiare mano, e   */
/*  l'utente aveva appena letto «Account eliminato.». Adesso la         */
/*  pulizia fa parte della sequenza e, come tutto il resto qui dentro,  */
/*  RESTITUISCE il suo esito: se non riesce, non lo si dice riuscito.   */
/* ------------------------------------------------------------------ */

/* `leave` e `deleteAccount` normalmente tornano { error }, ma sotto c'è
   una chiamata di rete: se lancia, un'eccezione qui dentro diventerebbe
   una promise non gestita e l'utente non vedrebbe succedere niente. Un
   fallimento è un fallimento, comunque si presenti. */
const prova = async (lavoro) => {
  try { return (await lavoro()) || {}; } catch (e) { return { error: e?.message || 'errore' }; }
};

/* La pulizia del dispositivo, normalizzata. Vale la stessa regola di
   `prova`: un'eccezione è un fallimento, e un fallimento non può
   diventare silenzio. `non-tentata` non è un dettaglio burocratico — chi
   chiama senza `pulisci` sul dispositivo ha lasciato tutto, e non deve
   ricevere il messaggio di chi non ha lasciato niente. */
const provaPulizia = async (pulisci, uid) => {
  if (typeof pulisci !== 'function') {
    return { ok: false, rimosse: [], rimaste: [], motivo: 'non-tentata' };
  }
  try {
    const e = await pulisci(uid);
    if (!e || typeof e !== 'object') {
      return { ok: false, rimosse: [], rimaste: [], motivo: 'senza-esito' };
    }
    return {
      ok: e.ok === true,
      rimosse: e.rimosse || [],
      rimaste: e.rimaste || [],
      motivo: e.motivo || null,
    };
  } catch (e) {
    return { ok: false, rimosse: [], rimaste: [], motivo: e?.message || 'errore' };
  }
};

export async function eliminaAccount({
  codici = [], uid, groups, auth, pulisci, primaDiPulire,
}) {
  const rimasti = [];
  for (const code of codici) {
    const uscita = await prova(() => groups.leave(code, uid));
    if (uscita.error) rimasti.push(code);
  }
  if (rimasti.length) return { ok: false, rimasti, motivo: 'gruppi' };

  const esito = await prova(() => auth.deleteAccount(uid));
  /* NIENTE PULIZIA SE LA CANCELLAZIONE NON È PASSATA. L'account è ancora
     vivo: portargli via registro e «già visti» dal telefono sarebbe una
     perdita di dati secca, per giunta a un utente che l'app sta per
     invitare a riprovare. */
  if (esito.error) return { ok: false, rimasti, motivo: esito.error };

  /* Da qui in poi l'account remoto non c'è più, e la sessione l'ha
     chiusa `deleteAccount`. `primaDiPulire` è il momento in cui chi
     chiama azzera il proprio stato: serve che succeda ADESSO, prima
     delle cancellazioni, altrimenti una sequenza rimasta in volo
     riscrive le chiavi un istante dopo che sono state tolte. Se
     esplode non ferma niente: la pulizia è più importante del
     rimettere in ordine una schermata. */
  try { primaDiPulire?.(); } catch { /* lo stato lo sistema chi chiama */ }

  const pulizia = await provaPulizia(pulisci, uid);
  return { ok: true, rimasti: [], pulizia };
}

/* ------------------------------------------------------------------ */
/*  COSA SI DICE, ALLA FINE                                            */
/*                                                                     */
/*  Tre esiti, tre frasi, e nessuna che prometta più di quello che è    */
/*  successo. Il caso di mezzo è quello che prima non esisteva:         */
/*  l'account è stato cancellato davvero, ma qualcosa è rimasto su      */
/*  questo dispositivo. Dire «Account eliminato.» e basta sarebbe       */
/*  tecnicamente vero e praticamente una bugia — l'utente chiuderebbe   */
/*  l'app convinto che sul telefono non ci sia più niente di suo.       */
/*                                                                     */
/*  Le frasi stanno qui e non in App.jsx perché sono la conclusione di  */
/*  questa sequenza: separarle vorrebbe dire poterle far divergere dagli*/
/*  esiti senza che nessun controllo se ne accorga.                     */
/* ------------------------------------------------------------------ */
export const MESSAGGI = {
  eliminato: 'Account eliminato.',
  eliminatoConResidui: 'Account eliminato. Alcuni dati potrebbero essere rimasti su questo '
    + 'dispositivo: per toglierli svuota i dati del sito o disinstalla l’app.',
  nonEliminato: 'Non è stato possibile eliminare l’account. Controlla la rete e riprova.',
};

export function messaggioEliminazione(esito) {
  if (esito?.ok !== true) return MESSAGGI.nonEliminato;
  return esito.pulizia?.ok === true ? MESSAGGI.eliminato : MESSAGGI.eliminatoConResidui;
}

export default eliminaAccount;
