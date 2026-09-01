/* ------------------------------------------------------------------ */
/* marcatoreLogout.js — src/utils/marcatoreLogout.js                   */
/*                                                                     */
/* PERCHÉ ESISTE QUESTO FILE                                           */
/*                                                                     */
/* Sono tre i tentativi che non sono bastati, e vale la pena dire       */
/* perché, perché ognuno spiega un pezzo del problema.                  */
/*                                                                     */
/*  1. `BroadcastChannel` — non arriva a una scheda che iOS ha          */
/*     congelato, e non viene riconsegnato al risveglio.                */
/*  2. l'evento `storage` — stessa cosa: è un avviso in tempo reale, e  */
/*     per una scheda ferma quel tempo non passa.                       */
/*  3. il controllo al risveglio su `getSession()` — e qui sta l'errore */
/*     vero: dava per scontato che, dopo il logout della scheda A, la   */
/*     scheda B non trovasse più una sessione. Sull'iPhone la trova.    */
/*                                                                     */
/* Il punto 3 è il difetto che restava. Il ragionamento era: lo storage */
/* è condiviso, A cancella la chiave, quindi B non la vede più. Sul     */
/* browser è vero. Su Safari iOS non lo è in modo affidabile: una       */
/* scheda ripristinata dal congelamento riparte con lo stato che aveva  */
/* — compresa la sessione che il suo client `auth-js` teneva in         */
/* memoria — e può riscriverla nello storage prima o dopo che qualcuno  */
/* la legga. Il risultato provato sul telefono è che B, anche           */
/* RICARICATA, restava autenticata.                                     */
/*                                                                     */
/* Quindi si smette di dedurre lo stato dall'assenza di qualcosa e si   */
/* scrive una cosa che c'è: un marcatore.                               */
/*                                                                     */
/* LA REGOLA                                                            */
/*                                                                     */
/* «L'utente X è uscito da questo dispositivo» è un fatto, e i fatti si */
/* scrivono. Il marcatore sta in `localStorage`, in una chiave TUTTA    */
/* SUA, separata dalla sessione Supabase: non lo tocca `auth-js`, non   */
/* lo cancella un `signOut`, non lo ripristina il congelamento di una   */
/* scheda. Sopravvive al ricaricamento, ed è quello che serve.          */
/*                                                                     */
/* Non è un evento: è uno stato. Si LEGGE — all'avvio, al risveglio, al */
/* ritorno da bfcache — invece di aspettare che qualcuno lo consegni.   */
/* Il canale e l'evento `storage` restano, ma solo per fare le cose     */
/* subito quando si può: la correttezza non dipende più da loro.        */
/*                                                                     */
/* PORTA CON SÉ L'UTENTE, e non è un dettaglio. Un marcatore senza      */
/* nome butterebbe fuori chiunque si trovi a passare da questo browser: */
/* esco io dal telefono di casa, e la persona che entra dopo con il suo */
/* account viene sbattuta fuori da un logout che non è il suo. Il       */
/* marcatore vale solo per l'utente che vi è scritto.                   */
/*                                                                     */
/* SI CANCELLA SOLO CON UN ACCESSO RIUSCITO. Non allo scadere di un     */
/* tempo, non alla prima lettura: finché nessuno ha davvero rifatto     */
/* l'accesso, quel «sei uscito» resta vero e va riletto tutte le volte. */
/* Toglierlo prima vorrebbe dire rimettere in piedi esattamente il      */
/* difetto: una scheda che al secondo risveglio non trova più niente e  */
/* torna a fidarsi della sessione.                                      */
/* ------------------------------------------------------------------ */

export const CHIAVE_MARCATORE = 'smetto:uscito';

/* Identificativo del singolo logout. Serve a distinguere due uscite
   consecutive dello stesso utente — riscrivere in `localStorage` lo
   stesso identico valore non fa scattare l'evento `storage` nelle altre
   schede, e due logout di fila diventerebbero uno. */
function nuovoId() {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const deposito = (ambiente) => {
  try {
    return ambiente?.localStorage ?? null;
  } catch {
    return null;                       // storage negato: si va avanti senza
  }
};

/* Scrive «l'utente X è uscito da qui». Restituisce il marcatore scritto,
   o `null` se non si è potuto scrivere — chi chiama può dirlo. */
export function scriviMarcatore(userId, { ambiente = globalThis } = {}) {
  if (!userId) return null;
  const marcatore = {
    tipo: 'logout',
    userId,
    quando: Date.now(),
    id: nuovoId(),
  };
  try {
    deposito(ambiente)?.setItem(CHIAVE_MARCATORE, JSON.stringify(marcatore));
  } catch {
    return null;                       // storage pieno o negato
  }
  return marcatore;
}

/* Legge il marcatore, o `null` se non c'è o è illeggibile. Un marcatore
   rotto vale come assente: non si butta fuori nessuno per un JSON
   malformato, sarebbe un modo elaborato di non far entrare la gente. */
export function leggiMarcatore({ ambiente = globalThis } = {}) {
  let grezzo;
  try {
    grezzo = deposito(ambiente)?.getItem(CHIAVE_MARCATORE);
  } catch {
    return null;
  }
  if (!grezzo) return null;
  let m;
  try {
    m = JSON.parse(grezzo);
  } catch {
    return null;
  }
  if (!m || m.tipo !== 'logout' || typeof m.userId !== 'string' || !m.userId) return null;
  return m;
}

export function rimuoviMarcatore({ ambiente = globalThis } = {}) {
  try {
    deposito(ambiente)?.removeItem(CHIAVE_MARCATORE);
  } catch { /* niente da togliere */ }
}

/* «Questo marcatore riguarda l'utente che sto per far entrare?»
   Il confronto è sull'identificativo, non sulla presenza: è la riga che
   impedisce al logout di una persona di buttare fuori un'altra. */
export function marcatoreRiguarda(marcatore, userId) {
  return Boolean(marcatore && userId && marcatore.userId === userId);
}

/* IL CONTROLLO, in un posto solo.

   Lo usano l'avvio dell'app e il risveglio della scheda, e deve essere
   la stessa funzione in tutti e due i casi: una sessione ammessa
   all'avvio e rifiutata al risveglio (o il contrario) sarebbe un'app che
   si contraddice a seconda di come la si apre.

   Restituisce la sessione se è buona, `null` se l'utente di quella
   sessione risulta uscito da questo dispositivo. */
export function sessioneAmmessa(sessione, { ambiente = globalThis } = {}) {
  const id = sessione?.user?.id;
  if (!id) return null;
  return marcatoreRiguarda(leggiMarcatore({ ambiente }), id) ? null : sessione;
}
