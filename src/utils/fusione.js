/* ------------------------------------------------------------------ */
/*  IDENTITÀ DEGLI EVENTI E FUSIONE DEI REGISTRI                       */
/*                                                                     */
/*  Due frasi, e la seconda è arrivata dopo:                           */
/*                                                                     */
/*    1. UNA SIGARETTA REGISTRATA NON PUÒ SPARIRE.                     */
/*    2. L'IDENTITÀ DI UN EVENTO NON È IL MOMENTO IN CUI È SUCCESSO.   */
/*                                                                     */
/*  La prima l'ha risolta la fusione: unione degli insiemi, lapidi per  */
/*  le cancellazioni, orologio per campo sui valori singoli.            */
/*                                                                     */
/*  La seconda era ancora aperta, e non per un caso di laboratorio.     */
/*  L'identità di una sigaretta era il suo millisecondo, e due          */
/*  millisecondi uguali facevano UNA sigaretta sola. Non «raramente»:   */
/*                                                                     */
/*   · `distribuisci` è una funzione PURA di (quante, finestra). Due    */
/*     dispositivi che segnano «ieri, 10 sigarette» producono dieci     */
/*     istanti IDENTICI AL MILLISECONDO — verificato, non stimato.      */
/*     Non è una collisione da una su ottantasei milioni: è certa.      */
/*   · un orologio spostato indietro (fuso orario, correzione manuale)  */
/*     restituisce millisecondi già usati, e la sigaretta nuova veniva  */
/*     ingoiata dal `Set` senza un errore, senza un avviso, senza       */
/*     niente.                                                          */
/*   · `tags` era indicizzato per istante, quindi due sigarette allo    */
/*     stesso millisecondo condividevano il motivo.                     */
/*   · e cancellarne una cancellava anche l'altra, sull'altro           */
/*     dispositivo, dopo la fusione.                                    */
/*                                                                     */
/*  Un'identità deve essere univoca PER COSTRUZIONE, non per            */
/*  probabilità. Quindi adesso ogni evento è { id, ts }:                */
/*                                                                     */
/*    ts  →  QUANDO è successo   (lo usa tutta la matematica, D1–D13)   */
/*    id  →  QUALE evento è      (lo usa solo l'identità: fusione,      */
/*                                cancellazioni, etichette)             */
/*                                                                     */
/*  Le due cose sono indipendenti. Due eventi possono avere lo stesso   */
/*  `ts` e restare due; lo stesso evento ritrasmesso dieci volte resta  */
/*  uno, perché ha lo stesso `id`.                                      */
/*                                                                     */
/*  ------------------------------------------------------------------ */
/*  PERCHÉ `cigs` È ANCORA UN ARRAY DI NUMERI                          */
/*                                                                     */
/*  Perché tutta la matematica — 311 controlli — lavora su array di     */
/*  millisecondi, e riscriverla per farle digerire degli oggetti        */
/*  avrebbe voluto dire rimettere in discussione un motore verificato   */
/*  per risolvere un problema che non è suo. `eventi` è la verità;      */
/*  `cigs`, `resists`, `checkins` e `ricadute` sono PROIEZIONI generate */
/*  da `normalizzaRegistro`. La sola differenza per chi le consuma è    */
/*  che adesso possono contenere due volte lo stesso numero — ed è      */
/*  esattamente quello che deve succedere quando due eventi diversi     */
/*  cadono nello stesso millisecondo.                                   */
/* ------------------------------------------------------------------ */

export const VERSIONE_REGISTRO = 9;

/* I tipi di evento, e la proiezione che ciascuno alimenta. */
export const TIPI = { cig: 'cigs', resist: 'resists', checkin: 'checkins', ricaduta: 'ricadute' };
export const INSIEMI = Object.values(TIPI);

/* I campi a orologio: quelli per cui «vince il più recente» ha senso.
   `profile`, `tags` e `plans` sono mappe e si trattano CHIAVE PER CHIAVE,
   altrimenti scrivere un se–allora cancellerebbe quello scritto
   sull'altro dispositivo. */
export const CAMPI_SEMPLICI = [
  'smessoDal', 'notify', 'avvisiCorpo', 'onboarded', 'tappeViste', 'groups',
];
export const MAPPE = ['profile', 'tags', 'plans'];

/* L'identità di questa copia dell'app. Serve a due cose: a rompere le
   parità fra due orologi identici in modo che le due parti arrivino
   ALLO STESSO risultato, e a comporre gli identificativi degli eventi
   quando `crypto.randomUUID` non c'è. Vive in memoria: cambia a ogni
   avvio, e va bene, perché ogni registro si porta dietro quello di chi
   l'ha scritto. */
export const ID_DISPOSITIVO = `d${Math.random().toString(36).slice(2, 10)}`;

/* ------------------------------------------------------------------ */
/*  GLI IDENTIFICATIVI                                                 */
/* ------------------------------------------------------------------ */
/* `crypto.randomUUID` quando c'è — è nel browser da anni, in Node da
   sempre e in Capacitor per forza. Il ripiego non è «quasi unico»: è
   dispositivo + contatore monotono + caso. Il contatore garantisce che
   la stessa copia dell'app non possa MAI riusare un identificativo,
   nemmeno chiamando la funzione mille volte nello stesso millisecondo;
   il dispositivo separa le copie diverse. */
let contatore = 0;
export function nuovoId() {
  contatore += 1;
  const c = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${ID_DISPOSITIVO}-${contatore.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* L'identificativo dei registri VECCHI, quelli in cui gli eventi erano
   solo millisecondi. È DERIVATO dal millisecondo, quindi due dispositivi
   che migrano lo stesso registro arrivano agli stessi identificativi e la
   fusione non raddoppia tutto quanto. È la proprietà che rende la
   migrazione sicura: se fosse casuale, la prima sincronizzazione dopo
   l'aggiornamento avrebbe prodotto due copie di ogni sigaretta mai
   registrata. */
export const idStorico = (tipo, ts) => `s:${tipo}:${ts}`;

export const eventoNuovo = (tipo, ts, id) => ({ id: id || nuovoId(), tipo, ts });

/* ------------------------------------------------------------------ */
/*  NORMALIZZAZIONE E MIGRAZIONE                                       */
/* ------------------------------------------------------------------ */
const numeroBuono = (t) => Number.isFinite(t) && t > 0;

function eventiDaGrezzo(grezzo) {
  const fuori = [];
  const visti = new Set();

  const aggiungi = (tipo, id, ts) => {
    if (!numeroBuono(ts) || typeof id !== 'string' || !id) return;
    if (visti.has(id)) return;          // stesso evento ritrasmesso: uno solo
    visti.add(id);
    fuori.push({ id, tipo, ts });
  };

  /* SE C'È `eventi`, QUELLA È LA VERITÀ, e le liste di millisecondi sono
     solo la sua proiezione: rileggerle sarebbe contare due volte ogni
     sigaretta. Le liste si migrano soltanto quando `eventi` non c'è
     proprio, cioè quando il registro arriva da una versione precedente. */
  if (Array.isArray(grezzo?.eventi)) {
    grezzo.eventi.forEach((e) => { if (e && TIPI[e.tipo]) aggiungi(e.tipo, e.id, e.ts); });
    return fuori;
  }

  /* Formato vecchio. L'identificativo è DERIVATO dal millisecondo, così
     due dispositivi che migrano lo stesso registro arrivano agli stessi
     identificativi e la fusione non raddoppia tutto: se fosse casuale, la
     prima sincronizzazione dopo l'aggiornamento avrebbe prodotto due
     copie di ogni sigaretta mai registrata. */
  Object.entries(TIPI).forEach(([tipo, nome]) => {
    (Array.isArray(grezzo?.[nome]) ? grezzo[nome] : []).forEach((t) => {
      if (numeroBuono(t)) aggiungi(tipo, idStorico(tipo, t), t);
    });
  });

  return fuori;
}

function lapidiDaGrezzo(grezzo) {
  const fuori = new Set();
  const rim = grezzo?.rimossi;

  // formato nuovo: un elenco piatto di identificativi
  if (Array.isArray(rim)) rim.forEach((id) => { if (typeof id === 'string' && id) fuori.add(id); });

  /* Formato vecchio: { cigs: [ts], resists: [ts], … }. Si traducono negli
     identificativi storici, cioè esattamente quelli che la migrazione qui
     sopra assegna alle stesse sigarette. Senza questa riga, tutto quello
     che era stato cancellato prima dell'aggiornamento sarebbe tornato
     indietro al primo riallineamento. */
  if (rim && !Array.isArray(rim)) {
    Object.entries(TIPI).forEach(([tipo, nome]) => {
      (Array.isArray(rim[nome]) ? rim[nome] : []).forEach((t) => {
        if (numeroBuono(t)) fuori.add(idStorico(tipo, t));
      });
    });
  }
  return fuori;
}

/* Le etichette erano indicizzate per istante e adesso lo sono per
   identificativo. Le vecchie si traducono con la stessa regola della
   migrazione, quindi restano attaccate alla loro sigaretta. */
function tagsDaGrezzo(grezzo) {
  const fuori = {};
  Object.entries(grezzo?.tags || {}).forEach(([k, v]) => {
    if (typeof v !== 'string' || !v) return;
    const numerico = Number(k);
    fuori[numeroBuono(numerico) ? idStorico('cig', numerico) : k] = v;
  });
  return fuori;
}

export function normalizzaRegistro(grezzo, vuoto) {
  const base = typeof vuoto === 'function' ? vuoto() : (vuoto || {});
  const d = { ...base, ...(grezzo || {}) };

  d.profile = { ...(base.profile || {}), ...(grezzo?.profile || {}) };
  d.plans = { ...(grezzo?.plans || {}) };
  d.tags = tagsDaGrezzo(grezzo);

  const lapidi = lapidiDaGrezzo(grezzo);
  d.rimossi = [...lapidi].sort();

  /* Le lapidi vincono sempre sugli eventi: se un identificativo compare
     in tutti e due, è stato cancellato dopo essere stato registrato. */
  d.eventi = eventiDaGrezzo(grezzo)
    .filter((e) => !lapidi.has(e.id))
    .sort((a, b) => (a.ts - b.ts) || (a.id < b.id ? -1 : 1));

  /* LE PROIEZIONI. Array di millisecondi, come li vuole la matematica,
     e con i doppioni quando due eventi distinti cadono nello stesso
     istante — che è il punto di tutto questo file. */
  INSIEMI.forEach((nome) => { d[nome] = []; });
  d.eventi.forEach((e) => d[TIPI[e.tipo]].push(e.ts));

  // le etichette delle sigarette cancellate non servono più a nessuno
  const vivi = new Set(d.eventi.map((e) => e.id));
  Object.keys(d.tags).forEach((id) => { if (!vivi.has(id)) delete d.tags[id]; });

  /* L'INIZIO DEL PERCORSO NON PUÒ ESSERE DOPO LA PRIMA SIGARETTA.
     `intervalliCoperti` scarta gli eventi precedenti a `start`, quindi un
     registro con `start` più recente della sigaretta più vecchia aveva
     eventi invisibili alla copertura: registrati, contati nei totali, e
     ignorati dal tempo contato. La fusione lo correggeva già; qui lo fa
     anche l'apertura, così l'invariante vale sempre e non solo dopo una
     sincronizzazione. */
  if (!numeroBuono(d.start)) d.start = d.cigs[0] ?? null;
  else if (d.cigs.length) d.start = Math.min(d.start, d.cigs[0]);
  if (!numeroBuono(d.smessoDal)) d.smessoDal = null;

  /* Il contatore scalare delle ripartenze delle versioni ancora
     precedenti. Si guarda `grezzo` e non `d`, perché `d` ha già ereditato
     lo zero del registro vuoto. */
  if (Number.isFinite(grezzo?.ripartenzeBase)) {
    d.ripartenzeBase = Math.max(0, Math.round(grezzo.ripartenzeBase));
  } else if (Number.isFinite(grezzo?.ripartenze) && !Array.isArray(grezzo?.ricadute)) {
    d.ripartenzeBase = Math.max(0, Math.round(grezzo.ripartenze));
  } else {
    d.ripartenzeBase = 0;
  }
  d.ripartenze = d.ripartenzeBase + d.ricadute.length;

  d.orologi = { ...(grezzo?.orologi || {}) };
  d.dispositivo = typeof grezzo?.dispositivo === 'string' ? grezzo.dispositivo : ID_DISPOSITIVO;
  d.rev = Number.isFinite(grezzo?.rev) ? grezzo.rev : 0;
  d.v = VERSIONE_REGISTRO;

  delete d.group;   // residuo delle versioni con un gruppo solo
  return d;
}

/* ------------------------------------------------------------------ */
/*  GLI OROLOGI                                                        */
/* ------------------------------------------------------------------ */
/* `salva()` chiama `timbra` a ogni modifica: confronta il prima e il dopo
   e timbra SOLO i campi che sono davvero cambiati. Timbrare tutto a ogni
   salvataggio equivarrebbe a un orologio unico, cioè a rimettere in piedi
   il problema che questi orologi risolvono. */
export function percorsiSemplici(d) {
  const p = [...CAMPI_SEMPLICI];
  MAPPE.forEach((mappa) => {
    Object.keys(d?.[mappa] || {}).forEach((k) => p.push(`${mappa}.${k}`));
  });
  return p;
}

const leggi = (d, percorso) => {
  const i = percorso.indexOf('.');
  if (i === -1) return d?.[percorso];
  return d?.[percorso.slice(0, i)]?.[percorso.slice(i + 1)];
};

const esiste = (d, percorso) => {
  const i = percorso.indexOf('.');
  if (i === -1) return d ? Object.hasOwn(d, percorso) : false;
  const testa = d?.[percorso.slice(0, i)];
  return testa ? Object.hasOwn(testa, percorso.slice(i + 1)) : false;
};

const scriviIn = (out, percorso, valore) => {
  const i = percorso.indexOf('.');
  if (i === -1) { out[percorso] = valore; return; }
  const testa = percorso.slice(0, i);
  out[testa] = { ...out[testa], [percorso.slice(i + 1)]: valore };
};

const uguali = (a, b) => (a === b) || JSON.stringify(a) === JSON.stringify(b);

export function timbra(prima, dopo, adesso = Date.now()) {
  const orologi = { ...(dopo?.orologi || prima?.orologi || {}) };
  const percorsi = new Set([...percorsiSemplici(prima), ...percorsiSemplici(dopo)]);
  percorsi.forEach((p) => {
    if (!uguali(leggi(prima, p), leggi(dopo, p))) orologi[p] = adesso;
  });
  return { ...dopo, orologi, dispositivo: ID_DISPOSITIVO };
}

/* ------------------------------------------------------------------ */
/*  LA FUSIONE                                                         */
/* ------------------------------------------------------------------ */
/* Commutativa, associativa, idempotente. Adesso l'unione è sugli
   IDENTIFICATIVI e non più sugli istanti, quindi due eventi diversi che
   cadono nello stesso millisecondo restano due, e lo stesso evento
   ritrasmesso resta uno. Prima le due cose non si potevano distinguere,
   perché erano la stessa cosa. */
export function fondiRegistri(a, b, vuoto) {
  if (!a) return b ? normalizzaRegistro(b, vuoto) : null;
  if (!b) return normalizzaRegistro(a, vuoto);

  const x = normalizzaRegistro(a, vuoto);
  const y = normalizzaRegistro(b, vuoto);
  const out = { ...x };

  // --- 1. gli eventi: unione per identificativo, meno le lapidi ---
  const lapidi = new Set([...x.rimossi, ...y.rimossi]);
  const perId = new Map();
  [...x.eventi, ...y.eventi].forEach((e) => { if (!perId.has(e.id)) perId.set(e.id, e); });
  lapidi.forEach((id) => perId.delete(id));

  out.rimossi = [...lapidi].sort();
  out.eventi = [...perId.values()].sort((p, q) => (p.ts - q.ts) || (p.id < q.id ? -1 : 1));
  INSIEMI.forEach((nome) => { out[nome] = []; });
  out.eventi.forEach((e) => out[TIPI[e.tipo]].push(e.ts));

  // --- 2. i campi a orologio, uno per uno ---
  const orologio = (d, p) => (Number.isFinite(d.orologi?.[p]) ? d.orologi[p] : 0);
  /* A parità di orologio decide l'identificativo del dispositivo: non
     conta QUALE vinca, conta che le due parti scelgano lo stesso. */
  const vinceY = (p) => {
    const ox = orologio(x, p);
    const oy = orologio(y, p);
    if (oy !== ox) return oy > ox;
    return String(y.dispositivo) > String(x.dispositivo);
  };

  out.tags = { ...x.tags };
  out.plans = { ...x.plans };
  out.profile = { ...x.profile };
  new Set([...percorsiSemplici(x), ...percorsiSemplici(y)]).forEach((p) => {
    const inX = esiste(x, p);
    const inY = esiste(y, p);
    // un campo che esiste da una parte sola non può essere cancellato
    // dall'assenza dell'altra: l'assenza non è una decisione
    if (inY && (!inX || vinceY(p))) scriviIn(out, p, leggi(y, p));
    else if (inX) scriviIn(out, p, leggi(x, p));
  });

  // le etichette degli eventi che non ci sono più
  const vivi = new Set(out.eventi.map((e) => e.id));
  Object.keys(out.tags).forEach((id) => { if (!vivi.has(id)) delete out.tags[id]; });

  out.orologi = { ...x.orologi };
  Object.entries(y.orologi || {}).forEach(([p, t]) => {
    if (!Number.isFinite(out.orologi[p]) || t > out.orologi[p]) out.orologi[p] = t;
  });

  /* --- 3. le tre eccezioni, tutte nella direzione «non perdere» ---
     `start` prende il minimo: scoprire una sigaretta più vecchia non deve
     accorciare il percorso. `ripartenzeBase` prende il massimo: è un
     contatore che sale. */
  const inizi = [x.start, y.start].filter(numeroBuono);
  out.start = inizi.length ? Math.min(...inizi) : null;
  if (out.cigs.length) {
    out.start = out.start === null ? out.cigs[0] : Math.min(out.start, out.cigs[0]);
  }
  out.ripartenzeBase = Math.max(x.ripartenzeBase || 0, y.ripartenzeBase || 0);
  out.ripartenze = out.ripartenzeBase + out.ricadute.length;

  out.dispositivo = ID_DISPOSITIVO;
  out.rev = Math.max(x.rev || 0, y.rev || 0);
  out.v = VERSIONE_REGISTRO;
  return out;
}

/* ------------------------------------------------------------------ */
/*  LE OPERAZIONI SUGLI EVENTI                                         */
/* ------------------------------------------------------------------ */
/* Aggiunge l'evento E tiene ordinate le proiezioni. L'ordine conta:
   `start` si legge come `cigs[0]`, il record scorre le pause fra una
   sigaretta e la successiva, il registro si mostra dal più recente. Prima
   le sigarette segnate in ritardo finivano in fondo alla lista con un
   istante di ieri, e la sistemava solo la normalizzazione al caricamento
   successivo — cioè tutto funzionava fino al primo che si fidava
   dell'ordine senza riordinare. */
export function aggiungiEvento(d, tipo, ts, id) {
  const e = eventoNuovo(tipo, ts, id);
  const eventi = [...(d.eventi || []), e].sort((p, q) => (p.ts - q.ts) || (p.id < q.id ? -1 : 1));
  const proiezione = [...(d[TIPI[tipo]] || []), ts].sort((p, q) => p - q);
  return { ...d, eventi, [TIPI[tipo]]: proiezione };
}

export function aggiungiEventi(d, tipo, istanti) {
  let out = d;
  istanti.forEach((ts) => { out = aggiungiEvento(out, tipo, ts); });
  return out;
}

/* GLI IDENTIFICATIVI DI QUELLO CHE È STATO APPENA AGGIUNTO.

   Sembra una comodità e invece è la stessa regola di `rimuoviEvento` qui
   sotto, applicata al verso opposto: un evento si riconosce dal suo
   IDENTIFICATIVO, mai dalla sua posizione nella lista.

   Chi chiamava `aggiungiEventi` e poi leggeva `next.eventi.slice(quanti
   ce n'erano prima)` dava per scontato che i nuovi finissero in fondo. Non
   ci finiscono: `aggiungiEvento` RIORDINA per istante, apposta, perché
   `start` si legge come `cigs[0]` e il registro si mostra dal più recente.
   Segnare tre sigarette di ieri le mette in mezzo, e lo `slice` restituiva
   gli ultimi tre per istante — cioè le sigarette di OGGI. Chi poi toccava
   «Annulla» se le vedeva seppellire, con la lapide, quindi senza ritorno
   né dal database né dall'altro telefono.

   Vale anche per una sola: `eventi[eventi.length - 1]` non è la sigaretta
   appena registrata se sul dispositivo ne è già arrivata una con lo stesso
   millisecondo — che è precisamente lo scenario obbligatorio di questo
   file, non un caso di laboratorio. */
export function idsAggiunti(prima, dopo) {
  const gia = new Set((prima?.eventi || []).map((e) => e.id));
  return (dopo?.eventi || []).filter((e) => !gia.has(e.id)).map((e) => e.id);
}

/* Cancellare per IDENTIFICATIVO, non per istante. È il punto del test
   obbligatorio: A registra X, B registra Y, X e Y hanno lo stesso
   millisecondo, A cancella X — Y deve restare. Cancellando per istante,
   la lapide colpiva tutti e due. */
export function rimuoviEvento(d, id) {
  const eventi = (d.eventi || []).filter((e) => e.id !== id);
  const rimossi = [...new Set([...(d.rimossi || []), id])].sort();
  const tags = { ...(d.tags || {}) };
  delete tags[id];
  const out = { ...d, eventi, rimossi, tags };
  INSIEMI.forEach((nome) => { out[nome] = []; });
  eventi.forEach((e) => out[TIPI[e.tipo]].push(e.ts));
  return out;
}

/* Azzerare lo storico deve SEPPELLIRE quello che c'era, non svuotare la
   lista: senza lapidi, il primo riallineamento col database — o con
   l'altro telefono — rimetterebbe dentro tutto. */
export function seppellisciTutto(d) {
  return [...new Set([...(d.rimossi || []), ...(d.eventi || []).map((e) => e.id)])].sort();
}

/* ------------------------------------------------------------------ */
/*  LE ALTRE CHIAVI                                                    */
/* ------------------------------------------------------------------ */
/* `smetto:seen:<uid>` è la mappa «ultimo evento che ho già visto» per
   ogni membro del gruppo. Non è un registro, ma anche qui prendere il
   più recente e basta è sbagliato nel verso peggiore: un valore vecchio
   che sovrascrive uno nuovo fa ricomparire notifiche già lette. Ogni
   voce sale e basta, quindi si fonde con il massimo. */
export function fondiVisti(a, b) {
  const out = { ...(a || {}) };
  Object.entries(b || {}).forEach(([k, v]) => {
    if (!Number.isFinite(out[k]) || (Number.isFinite(v) && v > out[k])) out[k] = v;
  });
  return out;
}

/* Il dispatcher usato dallo strato di storage: decide come fondere in
   base alla chiave, così `installStorage.js` non deve sapere niente
   della forma dei dati. Una chiave sconosciuta non viene fusa a caso:
   si tiene quella locale, che è l'unica di cui sappiamo che è nostra. */
export function fondiValore(chiave, locale, remoto) {
  if (locale === undefined || locale === null) return remoto;
  if (remoto === undefined || remoto === null) return locale;
  if (String(chiave).startsWith('smetto:log:')) return fondiRegistri(locale, remoto);
  if (String(chiave).startsWith('smetto:seen:')) return fondiVisti(locale, remoto);
  return locale;
}
