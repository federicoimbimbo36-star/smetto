/* ------------------------------------------------------------------ */
/*  LA FUSIONE DEI REGISTRI                                            */
/*                                                                     */
/*  Questo file esiste per una frase sola:                             */
/*                                                                     */
/*    UNA SIGARETTA REGISTRATA NON PUÒ SPARIRE.                        */
/*                                                                     */
/*  Prima non era vero, e non per un caso limite esotico. Il registro   */
/*  è un unico oggetto JSON scritto per intero a ogni modifica, e chi   */
/*  scriveva per ultimo cancellava l'altro. Due telefoni con lo stesso  */
/*  account, cento sigarette a testa, una registrata su ciascuno:       */
/*  risultato 101, non 102. Stessa cosa con due schede del browser, e   */
/*  stessa cosa fra la copia locale e quella remota dopo un periodo     */
/*  offline.                                                            */
/*                                                                     */
/*  La correzione NON è «scrivere più in fretta» né «prendere sempre il  */
/*  più recente»: è smettere di scegliere fra due versioni e FONDERLE.  */
/*                                                                     */
/*  Il registro si divide in due nature, e ognuna ha la sua regola:     */
/*                                                                     */
/*  1. GLI INSIEMI DI ISTANTI — sigarette, voglie superate, check-in,   */
/*     ricadute. Sono insiemi di millisecondi, e un millisecondo è già  */
/*     l'identità dell'evento (su quello sono indicizzate le etichette  */
/*     del registro). Si fondono con l'UNIONE, meno le cancellazioni:   */
/*     è un 2P-Set, cioè commutativo, associativo e idempotente. Da qui */
/*     discende tutto quello che serve: due dispositivi non si perdono  */
/*     niente, i tentativi ripetuti non duplicano, e l'ordine in cui le */
/*     sincronizzazioni arrivano non cambia il risultato finale.        */
/*                                                                     */
/*     Le cancellazioni sono LAPIDI (`rimossi`), non semplici assenze.  */
/*     Senza lapidi l'unione farebbe risorgere ogni sigaretta tolta dal */
/*     registro alla prima sincronizzazione con l'altro dispositivo.    */
/*                                                                     */
/*  2. I CAMPI SINGOLI — prezzo, ritmo, motivo, se–allora, etichette.   */
/*     Qui l'unione non vuol dire niente: un prezzo o è 6,00 o è 6,50.  */
/*     Vince il più recente, CAMPO PER CAMPO, con un orologio proprio   */
/*     per ciascuno. Non un orologio solo per tutto il registro: con    */
/*     quello, cambiare il prezzo su un telefono avrebbe cancellato il  */
/*     motivo scritto sull'altro cinque minuti prima.                   */
/*                                                                     */
/*  Tre eccezioni volute, tutte nella stessa direzione — non perdere:   */
/*    · `start` prende il MINIMO: il percorso comincia dalla prima      */
/*      sigaretta conosciuta, e scoprirne una più vecchia non deve      */
/*      accorciarlo;                                                    */
/*    · `ripartenzeBase` prende il MASSIMO: è un contatore che sale;    */
/*    · un campo che esiste da una parte sola vince, qualunque cosa     */
/*      dicano gli orologi. `null` invece è un valore, non un'assenza:  */
/*      «sono tornato in riduzione» scrive `smessoDal: null` e deve     */
/*      poter vincere sul valore precedente.                            */
/* ------------------------------------------------------------------ */

export const VERSIONE_REGISTRO = 8;

/* Gli insiemi di istanti, e la lapide che li accompagna. */
export const INSIEMI = ['cigs', 'resists', 'checkins', 'ricadute'];

/* I campi a orologio: quelli per cui «vince il più recente» ha senso.
   `profile`, `tags` e `plans` sono mappe e si trattano CHIAVE PER CHIAVE,
   altrimenti scrivere un se–allora cancellerebbe quello scritto
   sull'altro dispositivo. */
export const CAMPI_SEMPLICI = [
  'smessoDal', 'notify', 'avvisiCorpo', 'onboarded', 'tappeViste', 'groups',
];
export const MAPPE = ['profile', 'tags', 'plans'];

/* L'identità di questa copia dell'app. Serve solo a rompere le parità
   fra due orologi identici in modo che le due parti arrivino ALLO STESSO
   risultato: senza, un pareggio verrebbe risolto in due modi diversi sui
   due dispositivi e non convergerebbero mai. Vive in memoria: cambia a
   ogni avvio, e va benissimo, perché ogni registro si porta dietro
   quello di chi l'ha scritto. */
export const ID_DISPOSITIVO = `d${Math.random().toString(36).slice(2, 10)}`;

const soloIstanti = (lista) => (Array.isArray(lista) ? lista : [])
  .filter((t) => Number.isFinite(t) && t > 0);

const insieme = (lista) => new Set(soloIstanti(lista));

const ordinati = (set) => [...set].sort((a, b) => a - b);

/* ------------------------------------------------------------------ */
/*  NORMALIZZAZIONE                                                    */
/* ------------------------------------------------------------------ */
/* Un registro che arriva da fuori — dal dispositivo, dal database, un
   domani da un backup JSON reimportato — può essere di una versione
   precedente o semplicemente sporco. Qui prende la forma su cui la
   fusione sa ragionare, e i valori che l'aritmetica sa digerire.

   `ripartenze` era un contatore scalare, e un contatore scalare non si
   fonde: due dispositivi che ricadono nello stesso giorno, sommati con
   «vince il più recente», perdono una ricaduta. Adesso le ricadute sono
   l'INSIEME degli istanti in cui sono avvenute — si fondono come tutto
   il resto — e il numero è la loro conta. `ripartenzeBase` porta avanti
   quello che c'era prima della migrazione, senza inventarsi istanti che
   nessuno ha registrato. */
export function normalizzaRegistro(grezzo, vuoto) {
  const base = typeof vuoto === 'function' ? vuoto() : (vuoto || {});
  const d = { ...base, ...(grezzo || {}) };

  d.profile = { ...(base.profile || {}), ...(grezzo?.profile || {}) };
  d.tags = { ...(grezzo?.tags || {}) };
  d.plans = { ...(grezzo?.plans || {}) };

  INSIEMI.forEach((nome) => { d[nome] = ordinati(insieme(d[nome])); });

  const rim = grezzo?.rimossi || {};
  d.rimossi = {};
  INSIEMI.forEach((nome) => { d.rimossi[nome] = ordinati(insieme(rim[nome])); });

  /* Le lapidi vincono sempre sulle liste: se un istante compare in tutte
     e due, è stato cancellato dopo essere stato registrato. */
  INSIEMI.forEach((nome) => {
    const lapidi = new Set(d.rimossi[nome]);
    d[nome] = d[nome].filter((t) => !lapidi.has(t));
  });

  if (!Number.isFinite(d.start) || d.start <= 0) d.start = d.cigs[0] ?? null;
  if (!Number.isFinite(d.smessoDal) || d.smessoDal <= 0) d.smessoDal = null;

  /* Migrazione del contatore scalare. Si guarda `grezzo` e non `d`,
     perché `d` ha già ereditato lo zero del registro vuoto e quel
     controllo non sarebbe mai scattato: il contatore delle versioni
     precedenti sarebbe finito nel cestino alla prima apertura. */
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
/* `salva()` chiama questa funzione a ogni modifica: confronta il prima e
   il dopo e timbra SOLO i campi che sono davvero cambiati. Timbrare
   tutto a ogni salvataggio equivarrebbe a un orologio unico, cioè a
   rimettere in piedi il problema che questi orologi risolvono. */
export function percorsiSemplici(d) {
  const p = [...CAMPI_SEMPLICI];
  MAPPE.forEach((mappa) => {
    Object.keys(d?.[mappa] || {}).forEach((k) => p.push(`${mappa}.${k}`));
  });
  return p;
}

const leggi = (d, percorso) => {
  const [testa, coda] = percorso.split('.');
  if (coda === undefined) return d?.[testa];
  return d?.[testa]?.[coda];
};

const esiste = (d, percorso) => {
  const [testa, coda] = percorso.split('.');
  if (coda === undefined) return d ? Object.hasOwn(d, testa) : false;
  return d?.[testa] ? Object.hasOwn(d[testa], coda) : false;
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
/* Commutativa, associativa, idempotente: fondere A con B dà lo stesso
   risultato di fondere B con A, fonderli in qualunque ordine dà lo
   stesso risultato, e rifondere due volte non cambia niente. È questo —
   e non i tentativi ripetuti fatti bene — che rende impossibile perdere
   una sigaretta per colpa dell'ordine con cui le sincronizzazioni
   arrivano. */
export function fondiRegistri(a, b, vuoto) {
  if (!a) return b ? normalizzaRegistro(b, vuoto) : null;
  if (!b) return normalizzaRegistro(a, vuoto);

  const x = normalizzaRegistro(a, vuoto);
  const y = normalizzaRegistro(b, vuoto);
  const out = { ...x };

  // --- 1. gli insiemi: unione meno le lapidi ---
  INSIEMI.forEach((nome) => {
    const lapidi = new Set([...x.rimossi[nome], ...y.rimossi[nome]]);
    out.rimossi[nome] = ordinati(lapidi);
    out[nome] = ordinati(new Set([...x[nome], ...y[nome]])).filter((t) => !lapidi.has(t));
  });

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

  const scrivi = (percorso, valore) => {
    const [testa, coda] = percorso.split('.');
    if (coda === undefined) out[testa] = valore;
    else out[testa] = { ...out[testa], [coda]: valore };
  };

  const percorsi = new Set([...percorsiSemplici(x), ...percorsiSemplici(y)]);
  out.tags = { ...x.tags };
  out.plans = { ...x.plans };
  out.profile = { ...x.profile };
  percorsi.forEach((p) => {
    const inX = esiste(x, p);
    const inY = esiste(y, p);
    // un campo che esiste da una parte sola non può essere cancellato
    // dall'assenza dell'altra: l'assenza non è una decisione
    if (inY && (!inX || vinceY(p))) scrivi(p, leggi(y, p));
    else if (inX) scrivi(p, leggi(x, p));
  });

  out.orologi = { ...x.orologi };
  Object.entries(y.orologi || {}).forEach(([p, t]) => {
    if (!Number.isFinite(out.orologi[p]) || t > out.orologi[p]) out.orologi[p] = t;
  });

  // --- 3. le tre eccezioni ---
  const inizi = [x.start, y.start].filter((t) => Number.isFinite(t) && t > 0);
  out.start = inizi.length ? Math.min(...inizi) : null;
  out.ripartenzeBase = Math.max(x.ripartenzeBase || 0, y.ripartenzeBase || 0);

  /* Il percorso non può cominciare dopo la prima sigaretta conosciuta:
     dopo l'unione possono essere comparse sigarette più vecchie di
     entrambi gli `start`. */
  if (out.cigs.length) {
    out.start = out.start === null ? out.cigs[0] : Math.min(out.start, out.cigs[0]);
  }

  out.ripartenze = out.ripartenzeBase + out.ricadute.length;
  out.dispositivo = ID_DISPOSITIVO;
  out.rev = Math.max(x.rev || 0, y.rev || 0);
  out.v = VERSIONE_REGISTRO;
  return out;
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

/* Le lapidi: togliere un istante da un insieme NON è filtrare la lista.
   `handleElimina` filtrava e basta, e alla prima sincronizzazione con
   l'altro dispositivo la sigaretta tolta tornava — perché l'unione non
   sa distinguere «non ce l'ho» da «l'ho cancellata». */
export function rimuoviIstante(d, nome, ts) {
  const lista = (d[nome] || []).filter((t) => t !== ts);
  const rimossi = { ...(d.rimossi || {}) };
  rimossi[nome] = [...new Set([...(rimossi[nome] || []), ts])].sort((a, b) => a - b);
  return { ...d, [nome]: lista, rimossi };
}

/* Azzerare lo storico deve seppellire quello che c'era, non svuotare la
   lista: senza lapidi, il primo `mine()` dell'altro dispositivo — o la
   prima lettura dal database — rimetterebbe dentro tutto. */
export function seppellisciTutto(d) {
  const rimossi = { ...(d.rimossi || {}) };
  INSIEMI.forEach((nome) => {
    rimossi[nome] = [...new Set([...(rimossi[nome] || []), ...(d[nome] || [])])]
      .sort((a, b) => a - b);
  });
  return rimossi;
}
