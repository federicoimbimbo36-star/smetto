/* ------------------------------------------------------------------ */
/*  IL MOTORE DI SINCRONIZZAZIONE                                      */
/*                                                                     */
/*  Sta qui e non dentro installStorage.js per una ragione sola: dentro */
/*  installStorage.js era attaccato al client Supabase e al browser,    */
/*  quindi NON SI POTEVA VERIFICARE. E la parte che decide se una       */
/*  sigaretta sopravvive a un timeout, a due dispositivi o a un refresh */
/*  è esattamente quella che non ci si può permettere di verificare a   */
/*  occhio.                                                            */
/*                                                                     */
/*  Qui dentro non si nomina né Supabase né window: la copia locale e   */
/*  il database arrivano da fuori come due oggetti con quattro metodi.  */
/*  In produzione glieli passa installStorage.js; nei controlli glieli  */
/*  passa un database finto che sa fare tutti i dispetti veri —         */
/*  rispondere in ritardo, non rispondere, rispondere quando ormai      */
/*  qualcun altro ha scritto.                                          */
/*                                                                     */
/*  LE DUE REGOLE:                                                     */
/*                                                                     */
/*  1. NON SI SCEGLIE, SI FONDE. Locale e remoto non sono due candidati */
/*     fra cui prendere il più recente: sono due parti della stessa     */
/*     storia. La fusione arriva da fuori (utils/fusione.js) ed è       */
/*     commutativa e idempotente, quindi l'ordine con cui le            */
/*     sincronizzazioni arrivano non cambia il risultato.               */
/*                                                                     */
/*  2. SI SCRIVE DICHIARANDO DA DOVE SI PARTE. «Aggiorna solo se sei    */
/*     ancora alla revisione che ho letto io.» Se non lo è, qualcun     */
/*     altro ha scritto nel frattempo: si rilegge, si rifonde, si       */
/*     riprova. È questo che fa uscire 102 e non 101 quando due         */
/*     telefoni registrano una sigaretta ciascuno.                      */
/* ------------------------------------------------------------------ */

export const SCADUTA = Symbol('scaduta');
export const CHIAVE_CODA = '__coda__';

export const analizza = (testo) => {
  try { return testo == null ? null : JSON.parse(testo); } catch { return null; }
};

/* Una promise che non rigetta mai: un errore torna come { error }, come
   farebbe il client del database. Chi chiama non deve avvolgere tutto in
   try/catch, e soprattutto un rigetto non può più far saltare la coda. */
export const promessaVera = (p) => Promise.resolve(p).then((r) => r, (e) => ({ error: e }));

export function conScadenza(promessa, ms, timer = setTimeout) {
  if (!(ms > 0)) return Promise.resolve(promessa);
  return Promise.race([
    promessa,
    new Promise((resolve) => { timer(() => resolve(SCADUTA), ms); }),
  ]);
}

/* ------------------------------------------------------------------ */
/*  `locale`  — la copia sul dispositivo                               */
/*     get(key) → { key, value } | null                                */
/*     set(key, value) / delete(key) / list(prefix)                    */
/*                                                                     */
/*  `remoto`  — il database                                            */
/*     utente()                        → uid | null                    */
/*     leggi(uid, key)                 → { data: { value, rev } | null }*/
/*     aggiorna(uid, key, val, rev)    → { data: [{ rev }] } | { error }*/
/*     inserisci(uid, key, val)        → { data: [{ rev }] } | { error }*/
/*     cancella(uid, key)              → { } | { error }               */
/*     elenca(uid, prefix)             → { data: [{ key }] }           */
/* ------------------------------------------------------------------ */
/*  `uidDaChiave(key)` → l'utente a cui una chiave appartiene, o null.
    Serve in due casi soli, e in nessuno dei due c'è una sessione da cui
    leggerlo: le voci di coda scritte dalla versione precedente (che
    l'utente non lo salvavano) e le scritture fatte mentre la sessione è
    scaduta. Arriva da fuori perché questo file non deve sapere come sono
    fatte le chiavi dell'app: lo sa installStorage.js, che le compone. */
export function creaKvSincronizzato({
  locale,
  remoto,
  fondi,
  attesa = 3500,
  tentativi = 5,
  timer = setTimeout,
  uidDaChiave = () => null,
}) {
  /* Da quale revisione remota parte la prossima scrittura di questa
     chiave. Sta in memoria perché è solo un'ottimizzazione: se è
     sbagliata la scrittura non passa, si rilegge e si riprova — che è
     esattamente quello che deve succedere. */
  const revNota = new Map();

  /* LA CODA STA SUL DISPOSITIVO. Prima viveva in una Map e basta:
     bastava un refresh, o il sistema che chiude l'app in background,
     perché una scrittura fatta offline non partisse mai. E siccome la
     lettura preferiva il remoto, al rientro online il registro tornava
     indietro — cioè la sigaretta registrata in ascensore spariva.

     E ADESSO SA ANCHE DI CHI È. Prima teneva chiave → valore e basta, e
     al momento di consegnare usava l'utente di ADESSO. Su un telefono
     condiviso questo bastava:

       A registra offline  → la scrittura va in coda
       A esce, entra B     → onAuthStateChange svuota la coda
       → il registro di A finiva scritto sotto l'account di B.

     Verificato, non temuto. E la RLS non poteva farci niente: la policy
     controlla `user_id`, non la chiave, e B stava scrivendo righe sue.
     La difesa deve stare qui. Ogni voce è { uid, value }: allo
     svuotamento si consegna solo quello che appartiene a chi è entrato,
     e il resto NON si tocca — resta lì, in attesa del suo proprietario. */
  const inCoda = new Map();
  let codaCaricata = null;      // la promessa della prima lettura, condivisa
  let svuotamentoInCorso = false;
  let timerCoda = null;

  const ascoltatori = new Set();
  const avvisa = (key) => ascoltatori.forEach((fn) => { try { fn(key); } catch { /* */ } });

  const attendi = (p) => conScadenza(p, attesa, timer);

  async function salvaCoda() {
    try { await locale.set(CHIAVE_CODA, JSON.stringify([...inCoda.entries()])); }
    catch { /* la copia in memoria resta valida */ }
  }

  /* LA MIGRAZIONE DELLA CODA, che non può perdere niente.
     Sul disco di chi aggiorna c'è ancora il formato vecchio, `[chiave,
     valore]`, dove il valore è la stringa del registro oppure `null` per
     una cancellazione. Quelle voci un proprietario non ce l'hanno
     scritto, ma ce l'hanno implicito: le chiavi dell'app contengono
     l'identificativo dell'utente, e `uidDaChiave` sa tirarlo fuori. È
     l'unico momento in cui la chiave viene usata come prova di
     proprietà, e solo perché è l'unica prova rimasta. Una voce che non
     si riesce ad attribuire non viene buttata: resta in coda, in attesa,
     e intanto il suo valore è comunque sulla copia locale. */
  const normalizzaVoce = (key, v) => (
    v && typeof v === 'object' && Object.hasOwn(v, 'value')
      ? { uid: v.uid ?? uidDaChiave(key) ?? null, value: v.value }
      : { uid: uidDaChiave(key) ?? null, value: v }
  );

  /* UNA PROMESSA, NON UN BOOLEANO.

     Prima la bandiera si alzava PRIMA della lettura del disco:

       caricaCoda()  → codaCaricata = true, e si mette ad aspettare il disco
       set()         → `await caricaCoda()` torna SUBITO, la mappa è vuota
                     → accoda() → salvaCoda() riscrive la coda con la sola
                       voce nuova
       il disco risponde → e rilegge la coda che è già stata troncata

     Le scritture offline che stavano lì in attesa sparivano dal disco E
     dalla memoria. Non è una gara stretta: `installStorage.js` chiama
     `caricaCoda()` SENZA await al caricamento del modulo, quindi ogni
     scrittura fatta nei primi millisecondi dell'app cade esattamente lì.

     Con la promessa condivisa chi arriva secondo aspetta la stessa lettura
     invece di scavalcarla. Se la lettura fallisce la promessa resta
     comunque risolta: il `try` sta dentro, e una coda mai scritta non è un
     errore. */
  function caricaCoda() {
    if (codaCaricata) return codaCaricata;
    codaCaricata = (async () => {
      try {
        const voci = analizza((await locale.get(CHIAVE_CODA))?.value);
        if (Array.isArray(voci)) {
          voci.forEach(([k, v]) => { if (!inCoda.has(k)) inCoda.set(k, normalizzaVoce(k, v)); });
        }
      } catch { /* coda mai scritta */ }
    })();
    return codaCaricata;
  }

  function accoda(key, value, uid) {
    inCoda.set(key, { uid: uid ?? uidDaChiave(key) ?? null, value });
    salvaCoda();
    if (!timerCoda) {
      timerCoda = timer(() => { timerCoda = null; svuota(); }, 5000);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  SCRITTURA CON CONTROLLO DI CONCORRENZA                          */
  /* ---------------------------------------------------------------- */
  /* ---------------------------------------------------------------- */
  /*  LA CANCELLAZIONE, CHE NON PUÒ ESSERE CIECA                       */
  /* ---------------------------------------------------------------- */
  /* `aggiorna` dichiara da quale revisione parte; `cancella` no, e
     faceva un DELETE secco sulla riga. Cioè: la scrittura era protetta e
     la cancellazione, che distrugge di più, non lo era.

       A legge la revisione 10
       B modifica il registro          → revisione 11
       A cancella, convinta di essere alla 10
       → spariva anche il lavoro di B, che A non aveva mai visto.

     Adesso la cancellazione dichiara la revisione come tutto il resto. Se
     nel frattempo qualcuno ha scritto, la riga non viene toccata e la
     cancellazione viene ABBANDONATA — non ritentata contro la revisione
     nuova, perché quella conterrebbe dati che chi ha chiesto di cancellare
     non ha mai visto, e ritentare sarebbe di nuovo un delete cieco, solo
     più lento.

     È volutamente diverso dal ramo della scrittura: là si può fondere,
     perché due modifiche si sommano; qui no, perché «cancella tutto» e
     «aggiungi una sigaretta» non si sommano, si contraddicono. Fra le due
     vince quella che non perde dati.

     L'operazione risulta comunque conclusa (`ok`), altrimenti la coda la
     ritenterebbe ogni venti secondi per sempre. Il dispositivo viene
     avvisato, e alla prima lettura si riallinea con quello che c'è. */
  async function cancellaRemoto(uid, key) {
    /* Senza revisione nota non si cancella alla cieca: prima si guarda a
       che punto è la riga. */
    if (!revNota.has(key)) {
      const letto = await attendi(promessaVera(remoto.leggi(uid, key)));
      if (letto === SCADUTA || letto?.error) return { ok: false };
      if (!letto.data) { revNota.delete(key); return { ok: true }; }  // già non c'è
      revNota.set(key, letto.data.rev ?? 0);
    }

    const rev = revNota.get(key);
    const esito = await attendi(promessaVera(remoto.cancella(uid, key, rev)));
    if (esito === SCADUTA || esito?.error) return { ok: false };

    /* `data` assente vuol dire che il database non sa dire quante righe ha
       toccato: si accetta, perché è il comportamento di un adattatore che
       non supporta la condizione, e non c'è modo di fare di meglio. */
    if (!Array.isArray(esito.data) || esito.data.length >= 1) {
      revNota.delete(key);
      return { ok: true };
    }

    // zero righe: o non c'era già più, o qualcuno ha scritto nel frattempo
    const letto = await attendi(promessaVera(remoto.leggi(uid, key)));
    if (letto === SCADUTA || letto?.error) return { ok: false };
    if (!letto.data) { revNota.delete(key); return { ok: true }; }

    revNota.set(key, letto.data.rev ?? 0);
    return { ok: true, annullata: true };
  }

  async function scriviRemoto(uid, key, valoreTesto) {
    if (valoreTesto === null) return cancellaRemoto(uid, key);

    let testo = valoreTesto;

    for (let giro = 0; giro < tentativi; giro += 1) {
      const attesaRev = revNota.has(key) ? revNota.get(key) : null;

      if (attesaRev !== null) {
        const esito = await attendi(promessaVera(
          remoto.aggiorna(uid, key, analizza(testo), attesaRev),
        ));
        // scaduta: la rete c'è ma non risponde. Non si insiste, si accoda.
        if (esito === SCADUTA) return { ok: false, value: testo };
        if (!esito?.error && esito?.data?.length === 1) {
          revNota.set(key, esito.data[0].rev);
          return { ok: true, value: testo };
        }
      }

      /* O non sapevamo da dove partire, o qualcuno ha scritto prima di
         noi. Si guarda cosa c'è davvero e si FONDE: non si sceglie, e
         soprattutto non si sovrascrive. */
      const letto = await attendi(promessaVera(remoto.leggi(uid, key)));
      if (letto === SCADUTA || letto?.error) return { ok: false, value: testo };

      if (!letto.data) {
        const nato = await attendi(promessaVera(remoto.inserisci(uid, key, analizza(testo))));
        if (nato === SCADUTA) return { ok: false, value: testo };
        if (!nato?.error && nato?.data?.length === 1) {
          revNota.set(key, nato.data[0].rev);
          return { ok: true, value: testo };
        }
        // qualcuno ha inserito nel frattempo: al giro dopo lo si troverà
        revNota.delete(key);
        continue;
      }

      const fuso = fondi(key, analizza(testo), letto.data.value);
      testo = JSON.stringify(fuso);
      await locale.set(key, testo);        // il dispositivo vede subito il fuso
      revNota.set(key, letto.data.rev);
    }

    return { ok: false, value: testo };
  }

  async function svuota() {
    await caricaCoda();
    if (!inCoda.size || svuotamentoInCorso) return;
    const uid = await remoto.utente();
    if (!uid) return;
    svuotamentoInCorso = true;
    let miePendenti = false;
    try {
      for (const [key, voce] of [...inCoda.entries()]) {
        /* NON È ROBA DI CHI È ENTRATO ADESSO: si salta, e soprattutto
           non si consuma. La voce resta in coda finché non torna il suo
           proprietario, che è l'unico a cui possa essere consegnata. */
        if (voce.uid !== uid) continue;
        const esito = await scriviRemoto(uid, key, voce.value);
        /* Si confronta il VALORE e non la voce: durante lo svuotamento
           l'utente può aver registrato un'altra sigaretta, e quella
           scrittura ha rimpiazzato la voce in coda con un oggetto nuovo.
           Cancellandola alla cieca si buttava via la versione PIÙ NUOVA —
           il modo più stupido di perdere un dato, e succedeva. */
        const attuale = inCoda.get(key);
        if (esito.ok && attuale && attuale.value === voce.value) inCoda.delete(key);
        else if (!esito.ok) miePendenti = true;
        // se lo svuotamento ha fuso — o ha abbandonato una cancellazione —
        // l'app in memoria è rimasta indietro
        if (esito.ok && ((esito.value && esito.value !== voce.value) || esito.annullata)) avvisa(key);
      }
      await salvaCoda();
    } finally {
      svuotamentoInCorso = false;
    }
    /* Si riprova solo se è rimasto in sospeso qualcosa DI QUESTO UTENTE:
       ritentare ogni venti secondi per una voce che appartiene a un
       account che non è entrato sarebbe un timer che non finisce mai. */
    if (miePendenti && !timerCoda) {
      timerCoda = timer(() => { timerCoda = null; svuota(); }, 20000);
    }
  }

  return {
    async get(key) {
      const copia = await locale.get(key);
      const uid = await remoto.utente();
      if (!uid) return copia;

      /* La promise si materializza UNA VOLTA e poi si riusa: i query
         builder sono thenable pigri, e chiamare .then() due volte manda
         due richieste. Qui serve sia alla gara col timeout sia al ramo
         che riallinea dopo. */
      const lettura = promessaVera(remoto.leggi(uid, key));
      const esito = await attendi(lettura);

      if (esito === SCADUTA) {
        /* IL PUNTO PIÙ DELICATO. Il database ci ha messo troppo: si
           parte con la copia sul dispositivo. La risposta arriverà, ed è
           nata PRIMA di tutto quello che l'utente sta facendo adesso:
           qui dentro non può SCRIVERE, può solo FONDERE. Prima faceva
           `locale.set(risposta)` e cancellava la sigaretta registrata nel
           frattempo — con la beffa che al refresh successivo l'app
           ripartiva da un registro più vecchio di quello che l'utente
           aveva davanti trenta secondi prima. */
        lettura.then(async (r) => {
          if (!r || r.error || !r.data) return;
          const adesso = await locale.get(key);
          const fuso = fondi(key, analizza(adesso?.value), r.data.value);
          revNota.set(key, r.data.rev ?? 0);
          await locale.set(key, JSON.stringify(fuso));
          avvisa(key);
        });
        return copia;
      }

      if (esito?.error || !esito?.data) return copia;   // offline: vale la copia locale

      revNota.set(key, esito.data.rev ?? 0);

      /* NON «il remoto vince». Il dispositivo può avere cose che il
         database non ha ancora visto: tutto quello che è stato
         registrato offline, e tutto quello che è rimasto in coda dopo un
         refresh. */
      const fuso = fondi(key, analizza(copia?.value), esito.data.value);
      const testo = JSON.stringify(fuso);
      await locale.set(key, testo);

      /* Se dalla fusione è uscito qualcosa che il database non ha,
         glielo si porta: altrimenti resterebbe su un dispositivo solo
         fino alla prossima modifica, che potrebbe non arrivare mai. */
      if (JSON.stringify(esito.data.value) !== testo) accoda(key, testo, uid);

      return { key, value: testo };
    },

    async set(key, value) {
      /* PRIMA IL LOCALE, SEMPRE. È la durabilità: se l'app viene chiusa,
         sospesa o uccisa un istante dopo, la registrazione è già sul
         dispositivo e la coda la porterà al database più tardi. */
      await locale.set(key, value);
      const uid = await remoto.utente();
      await caricaCoda();

      /* SESSIONE ASSENTE NON VUOL DIRE «CONSEGNATO».
         Prima qui si usciva e basta: la scrittura restava sulla copia
         locale e non entrava in coda, quindi `inSospeso()` diceva zero
         mentre due sigarette non erano partite. Il recupero c'era, ma
         passava solo dalla lettura successiva, cioè da un riavvio
         dell'app con la rete. Adesso si accoda, attribuita al
         proprietario della chiave: quando l'utente rientra, la coda
         riconosce che è sua e gliela consegna. */
      if (!uid) {
        accoda(key, value, uidDaChiave(key));
        return { key, value };
      }

      /* LA SESSIONE NON È LA PROVA DI PROPRIETÀ.

         La coda è blindata (sopra), ma la scrittura diretta non lo era: si
         prendeva `uid` dalla sessione e si scriveva, qualunque chiave
         fosse. E le due cose non cambiano nello stesso istante — la chiave
         la compone `installStorage.js` dallo stato dell'app, `uid` arriva
         da `remoto.utente()`, cioè dalla sessione Supabase. Basta un cambio
         di account mentre una scrittura è in volo:

           set('smetto:log:A', …) parte  →  la sessione diventa B
           → il registro di A finiva scritto sotto l'account di B.

         La RLS non poteva farci niente: la policy guarda `user_id`, e B
         stava scrivendo righe sue. La difesa sta qui, ed è la stessa regola
         dello svuotamento: se la chiave ha un proprietario e non è chi è
         entrato adesso, non si scrive — si accoda, e ci penserà lui quando
         rientra. Le chiavi senza proprietario riconoscibile passano come
         prima: `uidDaChiave` torna null e non c'è niente da confrontare. */
      const proprietario = uidDaChiave(key);
      if (proprietario && proprietario !== uid) {
        accoda(key, value, proprietario);
        return { key, value };
      }

      const esito = await scriviRemoto(uid, key, value);
      const finale = esito.value || value;
      if (!esito.ok) accoda(key, finale, uid);
      else if (inCoda.get(key)?.value === value) { inCoda.delete(key); salvaCoda(); }

      /* SE LA SCRITTURA HA DOVUTO FONDERE, CHI HA CHIAMATO DEVE SAPERLO.

         Senza questa riga il difetto è vero e grave, e l'ha trovato la
         verifica sull'identità degli eventi: `scriviRemoto` trova sul
         database la sigaretta dell'altro dispositivo, la fonde e scrive
         il risultato — ma l'app in memoria continua ad avere lo stato di
         prima, quello che quella sigaretta non l'ha mai vista. Il
         salvataggio SUCCESSIVO parte da lì, la revisione è aggiornata
         quindi la scrittura passa senza fondere niente, e la sigaretta
         dell'altro sparisce dal database.

         Non è un caso di laboratorio: succede ogni volta che uno registra
         qualcosa offline e poi, rientrato, cancella o modifica qualcosa. */
      if (finale !== value) avvisa(key);
      return { key, value: finale };
    },

    async delete(key) {
      await locale.delete(key);
      const uid = await remoto.utente();
      // stessa regola della scrittura: senza sessione si accoda, non si
      // fa finta che sia stato fatto
      if (!uid) {
        await caricaCoda();
        accoda(key, null, uidDaChiave(key));
        return { key, deleted: true };
      }
      /* Stessa regola della scrittura: cancellare la riga di un altro
         account è peggio che scriverla, quindi vale a maggior ragione. */
      const proprietario = uidDaChiave(key);
      if (proprietario && proprietario !== uid) {
        await caricaCoda();
        accoda(key, null, proprietario);
        return { key, deleted: true };
      }
      const esito = await scriviRemoto(uid, key, null);
      if (!esito.ok) accoda(key, null, uid);
      /* Cancellazione abbandonata: sul database c'è qualcosa di più
         recente di quello che si voleva cancellare, e il dispositivo ha
         appena buttato via la sua copia. Va avvisato, così alla prima
         lettura si riprende quello che c'è invece di restare vuoto. */
      if (esito.annullata) avvisa(key);
      return { key, deleted: !esito.annullata, annullata: Boolean(esito.annullata) };
    },

    async list(prefix = '') {
      const locali = (await locale.list(prefix)).keys.filter((k) => k !== CHIAVE_CODA);
      const uid = await remoto.utente();
      if (!uid) return { keys: locali, prefix };
      const esito = await attendi(promessaVera(remoto.elenca(uid, prefix)));
      if (esito === SCADUTA || esito?.error || !esito?.data) return { keys: locali, prefix };
      return { keys: [...new Set([...locali, ...esito.data.map((r) => r.key)])], prefix };
    },

    /* Chi vuole sapere quando qualcosa è cambiato fuori da questa
       scheda. Restituisce la funzione per smettere di ascoltare. */
    onCambioEsterno(fn) { ascoltatori.add(fn); return () => ascoltatori.delete(fn); },

    /* Quante scritture non sono ancora arrivate al database. */
    inSospeso: () => inCoda.size,

    // usati da installStorage.js per agganciare gli eventi del browser
    svuotaCoda: svuota,
    caricaCoda,
    avvisa,
  };
}
