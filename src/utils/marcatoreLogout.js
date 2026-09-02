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
   o `null` se non si è potuto scrivere — chi chiama può dirlo.

   IL DEPOSITO SI CONTROLLA PRIMA, e non si passa da `?.`. Il difetto
   corretto qui stava tutto in una riga:

     deposito(ambiente)?.setItem(CHIAVE_MARCATORE, …);

   Con `ambiente` privo di `localStorage` — o con `localStorage: null` —
   `deposito` risponde `null`, l'optional chaining salta la chiamata
   SENZA lanciare, e la funzione arrivava lo stesso a `return marcatore`:
   annunciava un marcatore scritto dove non era stato scritto niente.
   `ispezionaMarcatore` sullo stesso ambiente rispondeva `assente`, ed
   erano le due metà della stessa bugia. Un `?.` è il modo giusto di
   dire «se non c'è, lascia perdere» e il modo sbagliato di dire «se non
   c'è, dillo»: qui serviva il secondo.

   Il valore di ritorno non cambia niente nel flusso di uscita —
   `eseguiLogout` chiama `marca?.()` e non ne guarda l'esito, di
   proposito, perché il canale e l'annuncio restano anche senza
   marcatore — ma è quello che dice a chi guarda se il logout è stato
   scritto o solo tentato, ed è il fatto su cui si regge il logout fra
   schede su iOS. Un contratto che mente su questo non serve a niente.

   L'ambiente davvero senza `localStorage` resta `assente` per
   `ispezionaMarcatore`, e va bene così: lì il marcatore non può essere
   esistito, quindi non c'è nessun residuo da annunciare. Quello che non
   deve più succedere è che la scrittura affermi il contrario. */
export function scriviMarcatore(userId, { ambiente = globalThis } = {}) {
  if (!userId) return null;

  /* Stesso accesso di `rimuoviMarcatore`, per non avere due criteri: il
     `try` dentro `deposito` copre il caso in cui leggere la proprietà
     stessa lancia — succede quando i cookie sono bloccati. */
  const dove = deposito(ambiente);
  if (!dove || typeof dove.setItem !== 'function') return null;

  const marcatore = {
    tipo: 'logout',
    userId,
    quando: Date.now(),
    id: nuovoId(),
  };
  try {
    dove.setItem(CHIAVE_MARCATORE, JSON.stringify(marcatore));
  } catch {
    return null;                       // storage pieno o negato
  }
  return marcatore;
}

/* LA LETTURA STRETTA — TRE STATI, E SERVE SOLO ALLA PULIZIA.

   `leggiMarcatore`, qui sotto, ne ha due: o c'è un marcatore valido, o
   `null`. Per l'autenticazione va bene ed è voluto — «non l'ho potuto
   leggere» e «non c'è» portano tutti e due a LASCIAR PASSARE, che è la
   scelta giusta quando il dubbio riguarda se buttare fuori qualcuno.

   Per la cancellazione dell'account la stessa fusione è un difetto, ed è
   quello che questa revisione corregge. Lì il `null` veniva letto come
   «non c'è nessun marcatore di questo utente» e la pulizia rispondeva
   `ok: true`: con `getItem` negato — storage in sola lettura, Safari in
   navigazione privata, permessi tolti al sito — l'app scriveva «Account
   eliminato.» senza aver mai potuto guardare se `smetto:uscito` fosse
   ancora lì. Una conferma data senza verifica, cioè esattamente la cosa
   che questo giro di correzioni esiste per togliere.

   Quindi qui i casi si separano:

    · `assente`     — il posto si legge, e dentro non c'è niente. Nessun
                      residuo, nessuno da togliere.
    · `letto`       — c'è un marcatore ben formato: si sa DI CHI è.
    · `illeggibile` — lo storage non risponde, il valore non è una
                      stringa, il JSON è rotto, o la forma non è quella
                      di un marcatore. Non si sa se ci sia un residuo, e
                      soprattutto non si sa di chi sia.

   L'ultimo stato ha una conseguenza che non è ovvia: NON SI CANCELLA.
   `smetto:uscito` è una chiave sola per tutto il dispositivo e porta
   scritto dentro il nome del proprietario; se quel nome non si riesce a
   leggere, toglierla può voler dire togliere il «sei uscito» di un'altra
   persona, e la sua scheda congelata tornerebbe a fidarsi di una
   sessione chiusa. Fra dichiarare un residuo che forse non c'è e
   rimettere in piedi il difetto che questo file esiste per chiudere, si
   dichiara il residuo.

   Da usare SOLO nella pulizia. Avvio, risveglio e `sessioneAmmessa`
   continuano a passare da `leggiMarcatore`: se prendessero da qui lo
   stato `illeggibile`, un JSON rotto in `smetto:uscito` diventerebbe un
   modo elaborato di non far entrare più nessuno. */
export function ispezionaMarcatore({ ambiente = globalThis } = {}) {
  let dove;
  try {
    dove = ambiente?.localStorage ?? null;
  } catch {
    return { stato: 'illeggibile', motivo: 'storage' };
  }
  /* Nessun `localStorage` non è un guasto: è una piattaforma senza quel
     deposito, dove `scriviMarcatore` non ha mai potuto scrivere niente.
     Residuo impossibile, e non si annuncia. Diverso dal caso qui sopra,
     dove il deposito c'è e l'accesso viene rifiutato. */
  if (!dove) return { stato: 'assente' };
  if (typeof dove.getItem !== 'function') return { stato: 'illeggibile', motivo: 'storage' };

  let grezzo;
  try {
    grezzo = dove.getItem(CHIAVE_MARCATORE);
  } catch {
    return { stato: 'illeggibile', motivo: 'storage' };
  }
  if (grezzo == null || grezzo === '') return { stato: 'assente' };
  if (typeof grezzo !== 'string') return { stato: 'illeggibile', motivo: 'valore' };

  let m;
  try {
    m = JSON.parse(grezzo);
  } catch {
    return { stato: 'illeggibile', motivo: 'json' };
  }
  if (!m || typeof m !== 'object' || m.tipo !== 'logout'
    || typeof m.userId !== 'string' || !m.userId) {
    return { stato: 'illeggibile', motivo: 'forma' };
  }
  return { stato: 'letto', marcatore: m };
}

/* Legge il marcatore, o `null` se non c'è o è illeggibile. Un marcatore
   rotto vale come assente: non si butta fuori nessuno per un JSON
   malformato, sarebbe un modo elaborato di non far entrare la gente.

   Costruita SOPRA `ispezionaMarcatore` e non accanto, per una ragione
   sola: due letture separate potrebbero divergere, e una divergenza qui
   vorrebbe dire che l'accesso e la cancellazione non stanno guardando lo
   stesso marcatore. Il comportamento pubblico non cambia di una virgola
   — tutto quello che non è `letto` resta `null`. */
export function leggiMarcatore({ ambiente = globalThis } = {}) {
  const esito = ispezionaMarcatore({ ambiente });
  return esito.stato === 'letto' ? esito.marcatore : null;
}

export function rimuoviMarcatore({ ambiente = globalThis } = {}) {
  try {
    deposito(ambiente)?.removeItem(CHIAVE_MARCATORE);
  } catch { /* niente da togliere */ }
}

/* TOGLIERE IL MARCATORE DI UNA PERSONA SOLA.
   Lo usa la cancellazione dell'account: `smetto:uscito` è un residuo
   locale associato a un utente, e se quell'utente non esiste più non ha
   motivo di restare. Ma è UNA chiave per tutto il dispositivo, quindi
   `rimuoviMarcatore` da sola qui sarebbe pericolosa: cancellerebbe
   anche il «sei uscito» di un'altra persona che ha usato questo
   telefono, e la sua scheda congelata tornerebbe a fidarsi di una
   sessione che non deve più valere — cioè rimetterebbe in piedi il
   difetto che questo file esiste per chiudere.

   Restituisce un esito e non niente, perché `removeItem` può fallire
   silenziosamente e chi chiama deve poterlo dire: si rilegge, e vale
   quello che si trova.

   E si legge STRETTO. Qui stava il secondo difetto di questa revisione:
   la lettura passava da `leggiMarcatore`, che risponde `null` sia
   quando il marcatore non c'è sia quando non si è potuto leggere, e il
   `null` veniva trattato come «non è di questo utente, non c'è niente da
   fare» → `ok: true`. Con lo storage negato la cancellazione dichiarava
   quindi la pulizia locale riuscita senza aver verificato niente.

   Adesso i tre stati portano a tre risposte diverse:
    · assente     → non c'è residuo: `ok: true`, `tolto: false`;
    · letto       → si sa di chi è, e si decide sul nome;
    · illeggibile → `ok: false` e NON si cancella. Chi chiama nominerà
                    `smetto:uscito` fra i possibili residui, che è meno
                    grave sia di una conferma falsa sia di buttare via il
                    marcatore di un altro account. */
export function rimuoviMarcatoreDi(userId, { ambiente = globalThis } = {}) {
  if (!userId) return { ok: true, tolto: false, chiave: CHIAVE_MARCATORE };

  const prima = ispezionaMarcatore({ ambiente });
  if (prima.stato === 'illeggibile') {
    return { ok: false, tolto: false, chiave: CHIAVE_MARCATORE, motivo: prima.motivo };
  }
  if (prima.stato === 'assente' || !marcatoreRiguarda(prima.marcatore, userId)) {
    return { ok: true, tolto: false, chiave: CHIAVE_MARCATORE };
  }

  rimuoviMarcatore({ ambiente });

  /* La rilettura, e con lo stesso metro: un marcatore diventato
     illeggibile DOPO il `removeItem` non dice che è stato tolto, dice
     che non si sa più cosa ci sia. */
  const dopo = ispezionaMarcatore({ ambiente });
  if (dopo.stato === 'illeggibile') {
    return { ok: false, tolto: false, chiave: CHIAVE_MARCATORE, motivo: dopo.motivo };
  }
  if (dopo.stato === 'letto' && marcatoreRiguarda(dopo.marcatore, userId)) {
    return { ok: false, tolto: false, chiave: CHIAVE_MARCATORE, motivo: 'resta' };
  }
  return { ok: true, tolto: true, chiave: CHIAVE_MARCATORE };
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
