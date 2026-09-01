/* ------------------------------------------------------------------ */
/* canaleAuth.js — src/utils/canaleAuth.js                             */
/*                                                                     */
/* Il logout deve arrivare SUBITO a tutte le schede dello stesso        */
/* browser. Non è una comodità: su un computer o un telefono condiviso, */
/* una scheda rimasta indietro è l'account di qualcun altro aperto      */
/* sotto gli occhi di chi si siede dopo.                                */
/*                                                                     */
/* Perché non basta quello che c'era. `@supabase/auth-js` un canale ce  */
/* l'ha — apre una `BroadcastChannel` sulla chiave della sessione — ma  */
/* se non riesce ad aprirla si limita a scriverlo in console:           */
/*                                                                     */
/*   catch (e) { console.error('Failed to create a new BroadcastChannel,*/
/*   multi-tab state changes will not be available', e) }               */
/*                                                                     */
/* e non ha nessun ripiego: in tutta la libreria non esiste un solo     */
/* ascoltatore dell'evento `storage`. Dove `BroadcastChannel` manca o   */
/* fallisce — Safari in navigazione privata è il caso classico — le     */
/* altre schede non sanno niente finché non vengono ricaricate.         */
/*                                                                     */
/* Qui il canale è dell'app, e ha tutte e due le strade. `storage` non  */
/* è un ripiego che si accende solo se l'altro manca: si aggancia       */
/* SEMPRE, perché `BroadcastChannel` può esistere e fallire in silenzio */
/* al momento dell'invio. Se arrivano tutti e due, il messaggio si      */
/* riconosce e si esegue una volta sola.                                */
/* ------------------------------------------------------------------ */

export const CHIAVE_CANALE = 'smetto:auth';

/* Ogni scheda ha il suo identificativo, e serve a due cose: non
   rispondere al proprio annuncio — un logout che si richiama da solo è
   un anello — e riconoscere il doppione quando lo stesso messaggio
   arriva da tutte e due le strade. */
function nuovoId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function creaCanaleAuth({ onLogout, ambiente = globalThis } = {}) {
  const id = nuovoId();
  const chiusure = [];
  let canale = null;
  let contatore = 0;
  let ultimoVisto = null;

  const ricevi = (dato) => {
    if (!dato || dato.tipo !== 'logout') return;
    if (dato.da === id) return;                  // il proprio annuncio non si ascolta
    const marca = `${dato.da}:${dato.quando}:${dato.n}`;
    if (marca === ultimoVisto) return;           // già arrivato dall'altra strada
    ultimoVisto = marca;
    onLogout?.(dato);
  };

  if (typeof ambiente.BroadcastChannel === 'function') {
    try {
      canale = new ambiente.BroadcastChannel(CHIAVE_CANALE);
      canale.onmessage = (e) => ricevi(e?.data);
      chiusure.push(() => canale.close());
    } catch {
      canale = null;                             // si va avanti con `storage`
    }
  }

  if (typeof ambiente.addEventListener === 'function') {
    const suStorage = (e) => {
      if (!e || e.key !== CHIAVE_CANALE || !e.newValue) return;
      try { ricevi(JSON.parse(e.newValue)); } catch { /* messaggio illeggibile */ }
    };
    ambiente.addEventListener('storage', suStorage);
    chiusure.push(() => ambiente.removeEventListener('storage', suStorage));
  }

  return {
    id,

    /* `n` cresce a ogni annuncio, e non è un vezzo: riscrivere in
       `localStorage` lo STESSO valore non fa scattare l'evento `storage`
       nelle altre schede. Due logout di fila senza un valore diverso
       sarebbero un logout solo. */
    annunciaLogout() {
      contatore += 1;
      const messaggio = { tipo: 'logout', da: id, quando: Date.now(), n: contatore };
      try { canale?.postMessage(messaggio); } catch { /* canale già chiuso */ }
      try {
        ambiente.localStorage?.setItem(CHIAVE_CANALE, JSON.stringify(messaggio));
      } catch { /* storage pieno o negato: resta l'altra strada */ }
      return messaggio;
    },

    chiudi() {
      chiusure.forEach((f) => { try { f(); } catch { /* già chiuso */ } });
      chiusure.length = 0;
      canale = null;
    },
  };
}

/* ------------------------------------------------------------------ */
/* LA SCHEDA CHE DORMIVA                                               */
/*                                                                     */
/* Il canale qui sopra copre il caso normale: due schede sveglie, il    */
/* messaggio arriva, la seconda si pulisce. Su iPhone non basta, ed è   */
/* questo il motivo per cui la scheda B continuava a funzionare.        */
/*                                                                     */
/* Safari su iOS sospende le schede di sfondo. Una pagina congelata non */
/* riceve né i messaggi di `BroadcastChannel` né gli eventi `storage`,  */
/* e nessuno dei due viene riconsegnato al risveglio: sono avvisi in    */
/* tempo reale, e per una scheda ferma quel tempo non passa. L'annuncio */
/* del logout, semplicemente, non arriva mai.                           */
/*                                                                     */
/* E `auth-js` non tappa il buco, anche se sembrerebbe di sì. Al        */
/* ritorno in primo piano chiama `_recoverAndRefresh()`, che rilegge la */
/* sessione da localStorage; ma quando non la trova più (l'ha tolta     */
/* l'altra scheda) fa così:                                             */
/*                                                                     */
/*   if (!this._isValidSession(currentSession)) {                       */
/*     if (currentSession !== null) { await this._removeSession(); }    */
/*     return;                                                          */
/*   }                                                                  */
/*                                                                      */
/* `currentSession` È null, quindi salta `_removeSession()` — che è     */
/* l'unico posto da cui esce `SIGNED_OUT` — e torna in silenzio.        */
/* Nessun evento, `onAuthChange` muto, e la scheda resta a schermo con  */
/* i dati di un account da cui si è già usciti.                         */
/*                                                                     */
/* Da qui questa guardia: al risveglio la scheda non aspetta che        */
/* qualcuno le dica com'è andata, va a guardare da sé. `haSessione()`   */
/* legge da localStorage e risponde anche senza rete, quindi il         */
/* controllo non introduce nessuna dipendenza dal collegamento.         */
/*                                                                     */
/* `pageshow` oltre a `visibilitychange` perché su Safari il ritorno da */
/* bfcache può ripristinare la pagina senza passare da un cambio di     */
/* visibilità. Se scattano tutti e due, `suSessioneAssente` è la stessa */
/* sequenza protetta dalla guardia `inCorso`: un reset solo.            */
/* ------------------------------------------------------------------ */

export function creaGuardiaRisveglio({
  ambiente = globalThis,
  documento = ambiente?.document,
  dentro,
  haSessione,
  suSessioneAssente,
} = {}) {
  const chiusure = [];
  let vivo = true;

  const controlla = async () => {
    if (!vivo) return 'spento';
    if (dentro && !dentro()) return 'già fuori';       // non c'è niente da difendere
    let presente;
    try {
      presente = await haSessione();
    } catch {
      /* Il controllo non è riuscito: non si butta fuori nessuno per un
         dubbio. Meglio restare come si è che far ripartire da capo chi
         è legittimamente dentro. */
      return 'incerto';
    }
    if (!vivo) return 'spento';
    if (presente) return 'sessione presente';
    await suSessioneAssente?.();
    return 'ripulita';
  };

  if (typeof ambiente.addEventListener === 'function') {
    const suPageshow = () => { controlla(); };
    ambiente.addEventListener('pageshow', suPageshow);
    chiusure.push(() => ambiente.removeEventListener('pageshow', suPageshow));
  }

  if (documento && typeof documento.addEventListener === 'function') {
    const suVisibilita = () => {
      if (documento.visibilityState === 'hidden') return;
      controlla();
    };
    documento.addEventListener('visibilitychange', suVisibilita);
    chiusure.push(() => documento.removeEventListener('visibilitychange', suVisibilita));
  }

  return {
    controlla,
    chiudi() {
      vivo = false;
      chiusure.forEach((f) => { try { f(); } catch { /* già staccato */ } });
      chiusure.length = 0;
    },
  };
}
