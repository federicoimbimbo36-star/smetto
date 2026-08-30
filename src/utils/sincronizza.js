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
export function creaKvSincronizzato({
  locale,
  remoto,
  fondi,
  attesa = 3500,
  tentativi = 5,
  timer = setTimeout,
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
     indietro — cioè la sigaretta registrata in ascensore spariva. */
  const inCoda = new Map();
  let codaCaricata = false;
  let svuotamentoInCorso = false;
  let timerCoda = null;

  const ascoltatori = new Set();
  const avvisa = (key) => ascoltatori.forEach((fn) => { try { fn(key); } catch { /* */ } });

  const attendi = (p) => conScadenza(p, attesa, timer);

  async function salvaCoda() {
    try { await locale.set(CHIAVE_CODA, JSON.stringify([...inCoda.entries()])); }
    catch { /* la copia in memoria resta valida */ }
  }

  async function caricaCoda() {
    if (codaCaricata) return;
    codaCaricata = true;
    try {
      const voci = analizza((await locale.get(CHIAVE_CODA))?.value);
      if (Array.isArray(voci)) voci.forEach(([k, v]) => { if (!inCoda.has(k)) inCoda.set(k, v); });
    } catch { /* coda mai scritta */ }
  }

  function accoda(key, value) {
    inCoda.set(key, value);
    salvaCoda();
    if (!timerCoda) {
      timerCoda = timer(() => { timerCoda = null; svuota(); }, 5000);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  SCRITTURA CON CONTROLLO DI CONCORRENZA                          */
  /* ---------------------------------------------------------------- */
  async function scriviRemoto(uid, key, valoreTesto) {
    if (valoreTesto === null) {
      const esito = await attendi(promessaVera(remoto.cancella(uid, key)));
      if (esito === SCADUTA || esito?.error) return { ok: false };
      revNota.delete(key);
      return { ok: true };
    }

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
    try {
      for (const [key, value] of [...inCoda.entries()]) {
        const esito = await scriviRemoto(uid, key, value);
        /* `inCoda.get(key) === value` e non `delete` e basta: durante lo
           svuotamento l'utente può aver registrato un'altra sigaretta, e
           quella scrittura ha rimpiazzato la voce in coda. Cancellandola
           alla cieca si buttava via la versione PIÙ NUOVA — il modo più
           stupido di perdere un dato, e succedeva. */
        if (esito.ok && inCoda.get(key) === value) inCoda.delete(key);
      }
      await salvaCoda();
    } finally {
      svuotamentoInCorso = false;
    }
    if (inCoda.size && !timerCoda) {
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
      if (JSON.stringify(esito.data.value) !== testo) accoda(key, testo);

      return { key, value: testo };
    },

    async set(key, value) {
      /* PRIMA IL LOCALE, SEMPRE. È la durabilità: se l'app viene chiusa,
         sospesa o uccisa un istante dopo, la registrazione è già sul
         dispositivo e la coda la porterà al database più tardi. */
      await locale.set(key, value);
      const uid = await remoto.utente();
      if (!uid) return { key, value };

      await caricaCoda();
      const esito = await scriviRemoto(uid, key, value);
      const finale = esito.value || value;
      if (!esito.ok) accoda(key, finale);
      else if (inCoda.get(key) === value) { inCoda.delete(key); salvaCoda(); }
      return { key, value: finale };
    },

    async delete(key) {
      await locale.delete(key);
      const uid = await remoto.utente();
      if (!uid) return { key, deleted: true };
      const esito = await scriviRemoto(uid, key, null);
      if (!esito.ok) accoda(key, null);
      return { key, deleted: true };
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
