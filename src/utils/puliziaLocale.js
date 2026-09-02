/* ------------------------------------------------------------------ */
/*  DIMENTICARE UN UTENTE SU QUESTO DISPOSITIVO                        */
/*                                                                     */
/*  `delete_me()` cancella l'account e le righe sul database. Non tocca */
/*  la copia locale — ed è lì che stanno, in chiaro, `smetto:log:<uid>` */
/*  e `smetto:seen:<uid>`: quante sigarette, a che ora, dopo cosa, e    */
/*  quanto è durata ogni ricaduta. Sono dati di salute. Restavano sul   */
/*  telefono dopo il messaggio «Account eliminato.», cioè esattamente   */
/*  il danno che quella cancellazione doveva evitare, con in più la     */
/*  convinzione dell'utente che non ci fossero più.                     */
/*                                                                     */
/*  CINQUE REGOLE.                                                     */
/*                                                                     */
/*  1. SI TOCCA SOLO QUELLO CHE È SUO. Il dispositivo è uno, gli        */
/*     account che ci sono passati possono essere tanti: chi sia il     */
/*     proprietario di una chiave lo dice `uidDaChiave`, non un         */
/*     prefisso. Cancellare per prefisso vorrebbe dire portarsi via il  */
/*     registro di chi presta il telefono.                              */
/*                                                                     */
/*  2. SI PASSA DALLA COPIA LOCALE, NON DA `window.storage`. Quella     */
/*     cancella anche in rete, e a questo punto la sessione è già       */
/*     chiusa: `sincronizza.js` accoderebbe una cancellazione           */
/*     attribuita a un utente che non esiste più. Cioè lascerebbe       */
/*     indietro, in coda, proprio la voce che stiamo togliendo.         */
/*                                                                     */
/*  3. ANCHE LA CODA È UNA COPIA. Una scrittura non ancora consegnata   */
/*     contiene il registro per intero: pulire le chiavi e lasciare la  */
/*     coda vuol dire lasciare il registro.                             */
/*                                                                     */
/*  4. NON SI CREDE A UNA SCRITTURA, SI RILEGGE. È la correzione di     */
/*     questa revisione, e nasce da un difetto vero: `set` e `delete`   */
/*     possono RISOLVERE SENZA PERSISTERE — quota superata, storage in  */
/*     sola lettura, navigazione privata su Safari, un adattatore che   */
/*     ingoia. La versione precedente restituiva `ok: true` subito      */
/*     dopo la scrittura, e la verifica finale saltava proprio la       */
/*     chiave della coda: risultato, «Account eliminato.» con una voce  */
/*     di quell'utente ancora lì, pronta a rimettere in circolo i suoi  */
/*     dati al riavvio successivo. Adesso ogni modifica della coda      */
/*     viene RILETTA, e il verdetto lo dà quello che si trova, non      */
/*     quello che è stato chiesto.                                      */
/*                                                                     */
/*  5. QUELLO CHE NON SI CAPISCE NON È PULITO. Una coda illeggibile o   */
/*     malformata — `[null]`, una riga che non è una coppia, un JSON    */
/*     rotto — non si può dichiarare priva dei dati di nessuno. Non si  */
/*     butta via (dentro può esserci roba di un altro account) e non si */
/*     dà per buona: si dice che è rimasta.                             */
/* ------------------------------------------------------------------ */

/* Una riga di coda ben formata è `[chiave, valore]` con la chiave che è
   una stringa. Tutto il resto non si sa a chi appartenga, e una coda in
   cui non si sa a chi appartenga una voce non si può dichiarare pulita.
   Il controllo sta qui e non dentro il filtro perché serve PRIMA di
   toccare qualsiasi cosa: `voci.filter(([k, v]) => …)` su `[null]`
   lancia un TypeError durante il destructuring, e un'eccezione che
   scappa da questa funzione lascia la cancellazione a metà senza dirlo
   a nessuno.

   LUNGHEZZA ESATTA 2, e non «almeno 1». È la correzione di questa
   revisione, e i due modi di sbagliare erano diversi:

    · `[["smetto:log:utente-A"]]` — una riga senza valore. Il codice
      leggeva `r[1]` come `undefined`, attribuiva la riga ad A tramite la
      chiave e la portava via insieme al resto: una coda che nessuno sa
      come sia finita in quello stato veniva CANCELLATA, e la pulizia
      dichiarata riuscita. Una coda che non si capisce non si butta —
      dentro può esserci la scrittura di un altro account — e non si dà
      per buona.

    · `[["smetto:log:utente-B", {uid:"utente-B",…}, {uid:"utente-A",…}]]`
      — una riga con un elemento in più. Il codice guardava solo i primi
      due, concludeva «è di B», la teneva, e diceva che di A non era
      rimasto niente: il dato di A stava nel terzo elemento, sul disco,
      sotto la scritta «Account eliminato.». Questo è il più grave dei
      due, perché qui il residuo resta E viene dichiarato assente.

   Il formato lo scrive `salvaCoda` con `[...inCoda.entries()]`, che
   produce solo coppie: una riga di lunghezza diversa da 2 non l'ha
   scritta questa app, e su una riga che questa app non ha scritto non si
   può affermare niente — né che sia di A, né che non lo sia. */
const rigaValida = (r) => Array.isArray(r) && r.length === 2 && typeof r[0] === 'string';

/* Il proprietario di una voce di coda. Il formato nuovo se lo porta
   scritto dentro; quello vecchio — `[chiave, valore]` — no, e allora si
   ricava dalla chiave, che è l'unica prova rimasta. Stessa regola di
   `normalizzaVoce` in sincronizza.js: se le due divergessero, la
   cancellazione salterebbe proprio le voci più vecchie. */
const proprietarioVoce = (key, v, uidDaChiave) => (
  v && typeof v === 'object' && Object.hasOwn(v, 'value')
    ? (v.uid ?? uidDaChiave(key) ?? null)
    : (uidDaChiave(key) ?? null)
);

/* Tre stati e non due: «non c'è» e «non si capisce» portano a decisioni
   opposte, e tenerli insieme è il modo di sbagliarle entrambe. */
async function leggiCoda(locale, chiaveCoda) {
  let grezzo;
  try {
    grezzo = (await locale.get(chiaveCoda))?.value;
  } catch {
    return { stato: 'illeggibile' };
  }
  if (grezzo == null) return { stato: 'assente', voci: [] };

  let voci;
  try { voci = JSON.parse(grezzo); } catch { return { stato: 'illeggibile' }; }
  if (!Array.isArray(voci) || !voci.every(rigaValida)) return { stato: 'illeggibile' };
  return { stato: 'letta', voci };
}

/* Toglie dalla coda SUL DISCO le voci di un utente e lascia le altre
   dove sono. Non le consegna e non le fonde: l'account non c'è più, non
   c'è nessun posto dove consegnarle. */
async function ripuliscilaCoda({ uid, locale, uidDaChiave, chiaveCoda }) {
  const sua = (r) => proprietarioVoce(r[0], r[1], uidDaChiave) === uid;

  const prima = await leggiCoda(locale, chiaveCoda);
  if (prima.stato === 'illeggibile') return { ok: false, tolte: 0, motivo: 'coda' };
  if (prima.stato === 'assente') return { ok: true, tolte: 0, motivo: null };

  const tenute = prima.voci.filter((r) => !sua(r));
  if (tenute.length === prima.voci.length) return { ok: true, tolte: 0, motivo: null };

  /* L'errore NON è il verdetto: si prova a scrivere e poi si va a
     vedere com'è finita. Una `set` che lancia può aver scritto lo
     stesso, e — molto più spesso — una `set` che risolve può non aver
     scritto niente. L'unica cosa che conta è cosa c'è dopo. */
  try {
    if (tenute.length) await locale.set(chiaveCoda, JSON.stringify(tenute));
    else await locale.delete(chiaveCoda);
  } catch { /* si verifica lo stesso, sotto */ }

  const dopo = await leggiCoda(locale, chiaveCoda);
  if (dopo.stato === 'illeggibile') return { ok: false, tolte: 0, motivo: 'coda' };
  if (dopo.stato === 'letta' && dopo.voci.some(sua)) {
    return { ok: false, tolte: 0, motivo: 'coda' };
  }
  return { ok: true, tolte: prima.voci.length - tenute.length, motivo: null };
}

/* Il marcatore di logout (`smetto:uscito`) non sta nella copia locale ma
   in `localStorage`, e ha una regola sua: porta scritto DI CHI è, e
   quello di un'altra persona non si tocca — toglierlo rimetterebbe in
   piedi il difetto che quel file esiste per chiudere. Arriva da fuori
   come funzione per la stessa ragione di `uidDaChiave`: qui dentro non
   si nomina né window né localStorage. */
const provaMarcatore = async (togliMarcatore, uid) => {
  if (typeof togliMarcatore !== 'function') return { ok: true, chiave: null };
  try {
    const e = await togliMarcatore(uid);
    if (!e || typeof e !== 'object') return { ok: false, chiave: null };
    return { ok: e.ok === true, chiave: e.chiave || null };
  } catch {
    return { ok: false, chiave: null };
  }
};

/* `locale` è la copia sul dispositivo: get / set / delete / list, la
   stessa forma che `sincronizza.js` riceve da fuori. Arriva come
   parametro perché qui dentro non si nomina né window né Capacitor, e
   quindi la sequenza si può provare per intero — compreso il caso in
   cui fallisce, che è quello che conta. */
export async function dimenticaUtenteSulDispositivo({
  uid, locale, uidDaChiave, chiaveCoda, togliMarcatore,
}) {
  if (!uid) return { ok: false, rimosse: [], rimaste: [], motivo: 'utente' };

  const suo = (key) => key !== chiaveCoda && uidDaChiave(key) === uid;

  let elenco;
  try {
    elenco = (await locale.list(''))?.keys || [];
  } catch {
    /* Senza l'elenco non si sa nemmeno cosa c'è: non si cancella niente
       e non si promette niente. */
    return { ok: false, rimosse: [], rimaste: [], motivo: 'elenco' };
  }

  const sue = elenco.filter(suo);
  for (const key of sue) {
    // l'esito della singola cancellazione non fa testo: fa testo la rilettura
    try { await locale.delete(key); } catch { /* si verifica sotto */ }
  }

  const coda = await ripuliscilaCoda({ uid, locale, uidDaChiave, chiaveCoda });
  const marcatore = await provaMarcatore(togliMarcatore, uid);

  /* LA VERIFICA, e su TUTTO. Le cancellazioni possono dire di essere
     riuscite e lasciare la chiave dov'era. `rimosse` e `rimaste` si
     ricavano da qui — da quello che il dispositivo risponde adesso — e
     non da quello che le singole chiamate hanno detto di aver fatto. */
  let dopo;
  try {
    dopo = (await locale.list(''))?.keys || [];
  } catch {
    return { ok: false, rimosse: [], rimaste: sue, motivo: 'verifica' };
  }

  const rimaste = dopo.filter(suo);
  const rimosse = sue.filter((k) => !rimaste.includes(k));

  /* Una coda ancora sporca è un residuo come gli altri, e va NOMINATA:
     prima non compariva da nessuna parte, perché la verifica sulle
     chiavi salta di proposito la chiave della coda — quella non
     appartiene a nessuno e non si giudica per nome, si giudica per
     contenuto. */
  if (!coda.ok) rimaste.push(chiaveCoda);
  if (!marcatore.ok && marcatore.chiave) rimaste.push(marcatore.chiave);

  if (rimaste.length) {
    const motivo = (dopo.filter(suo).length && 'chiavi') || coda.motivo || 'marcatore';
    return { ok: false, rimosse, rimaste, motivo };
  }
  if (!marcatore.ok) return { ok: false, rimosse, rimaste: [], motivo: 'marcatore' };
  return { ok: true, rimosse, rimaste: [], motivo: null };
}

export default dimenticaUtenteSulDispositivo;
