/* ------------------------------------------------------------------ */
/* persistenza.mjs — la sigaretta non deve poter sparire                */
/*                                                                     */
/*   TZ=Europe/Rome node verifica/persistenza.mjs                      */
/*                                                                     */
/* I controlli matematici dimostrano che i numeri sono giusti. Questi   */
/* dimostrano che i DATI da cui nascono ci sono ancora.                 */
/*                                                                     */
/* Non si mima «la rete va bene»: si costruisce un database finto che   */
/* fa i dispetti veri — risponde in ritardo, non risponde affatto,      */
/* risponde quando ormai qualcun altro ha scritto — e due dispositivi   */
/* che ci parlano insieme. Poi si conta.                                */
/*                                                                     */
/* Ogni controllo qui dentro è scritto per FALLIRE con il codice di     */
/* prima: senza fusione, senza revisione e senza coda durevole quasi    */
/* tutti finiscono con una sigaretta in meno.                           */
/* ------------------------------------------------------------------ */

import { creaKvSincronizzato, CHIAVE_CODA } from '../src/utils/sincronizza.js';
import { distribuisci, finestraDi } from '../src/utils/arretrate.js';
import {
  fondiValore, fondiRegistri, normalizzaRegistro, timbra,
  rimuoviEvento, seppellisciTutto, aggiungiEvento, nuovoId, idStorico,
} from '../src/utils/fusione.js';

let passati = 0;
const falliti = [];
function ok(nome, condizione, dettaglio = '') {
  if (condizione) { passati += 1; return; }
  falliti.push(`${nome}${dettaglio ? ` — ${dettaglio}` : ''}`);
}
const eq = (nome, a, b) => ok(nome, JSON.stringify(a) === JSON.stringify(b),
  `atteso ${JSON.stringify(b)}, ottenuto ${JSON.stringify(a)}`);

const CHIAVE = 'smetto:log:u1';
const vuoto = () => ({
  v: 9, start: null, smessoDal: null,
  eventi: [], cigs: [], resists: [], checkins: [], ricadute: [], rimossi: [],
  tags: {}, groups: [], notify: true, avvisiCorpo: true, onboarded: false,
  profile: { motivo: '', baseline: null, prezzoPacchetto: null, perPacchetto: 20, sesso: 'non_detto' },
  plans: {}, tappeViste: { ref: null, idx: [] },
  ripartenzeBase: 0, ripartenze: 0, orologi: {},
});

/* ------------------------------------------------------------------ */
/*  IL DATABASE FINTO                                                  */
/* ------------------------------------------------------------------ */
/* Una riga per chiave, con la revisione. `aggiorna` applica la stessa
   condizione del vero (`where rev = <attesa>`), quindi se qualcuno ha
   scritto in mezzo torna zero righe — che è tutto quello che serve per
   riprodurre la corsa fra due dispositivi. */
function creaDatabase() {
  const righe = new Map();
  const db = {
    online: true,
    latenza: 0,
    scritture: 0,
    letture: 0,
    async attesa() {
      if (!db.online) throw new Error('offline');
      if (db.latenza) await new Promise((r) => { setTimeout(r, db.latenza); });
    },
    stato: (key = CHIAVE) => righe.get(key) || null,
    metti(key, value, rev = 1) { righe.set(key, { value, rev }); },

    async leggi(uid, key) {
      await db.attesa();
      db.letture += 1;
      const r = righe.get(key);
      return { data: r ? { value: r.value, rev: r.rev } : null };
    },
    async aggiorna(uid, key, valore, rev) {
      await db.attesa();
      const r = righe.get(key);
      if (!r || r.rev !== rev) return { data: [] };     // qualcuno ha scritto prima
      righe.set(key, { value: valore, rev: rev + 1 });
      db.scritture += 1;
      return { data: [{ rev: rev + 1 }] };
    },
    async inserisci(uid, key, valore) {
      await db.attesa();
      if (righe.has(key)) return { error: { code: '23505' } };
      righe.set(key, { value: valore, rev: 1 });
      db.scritture += 1;
      return { data: [{ rev: 1 }] };
    },
    /* Come il vero: la cancellazione dichiara la revisione da cui parte,
       e se qualcuno ha scritto nel frattempo non tocca niente. */
    async cancella(uid, key, rev) {
      await db.attesa();
      const r = righe.get(key);
      if (!r || r.rev !== rev) return { data: [] };
      righe.delete(key);
      return { data: [{ rev: r.rev }] };
    },
    async elenca(uid, prefix) {
      await db.attesa();
      return { data: [...righe.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    },
    utente: async () => 'u1',
  };
  return db;
}

/* La copia sul dispositivo. `condivisa` serve alle due schede dello
   stesso browser, che lo stesso localStorage ce l'hanno davvero. */
function creaLocale(condivisa = new Map()) {
  return {
    mappa: condivisa,
    async get(key) {
      const v = condivisa.get(key);
      return v === undefined ? null : { key, value: v };
    },
    async set(key, value) { condivisa.set(key, value); return { key, value }; },
    async delete(key) { condivisa.delete(key); return { key, deleted: true }; },
    async list(prefix = '') {
      return { keys: [...condivisa.keys()].filter((k) => k.startsWith(prefix)), prefix };
    },
  };
}

/* Un dispositivo: la sua copia locale, il suo motore, il suo stato in
   memoria. `riavvia` butta via lo stato in memoria e la coda in memoria
   ma NON il disco — cioè simula un refresh o l'app uccisa dal sistema. */
function creaDispositivo(db, condivisa) {
  const locale = creaLocale(condivisa);
  let kv = creaKvSincronizzato({ locale, remoto: db, fondi: fondiValore, attesa: 60 });
  let memoria = null;
  /* Come fa l'app: quando lo strato di sincronizzazione fonde per conto
     suo, lo stato in memoria è rimasto indietro e va rifuso. Senza,
     il salvataggio successivo partirebbe da una base vecchia. */
  const riallinea = async () => {
    const r = await locale.get(CHIAVE);
    if (!r?.value) return;
    memoria = fondiRegistri(memoria, JSON.parse(r.value), vuoto);
  };
  kv.onCambioEsterno(() => { attese.push(riallinea()); });

  const disp = {
    locale,
    get kv() { return kv; },
    async apri() {
      const r = await kv.get(CHIAVE);
      memoria = normalizzaRegistro(r?.value ? JSON.parse(r.value) : null, vuoto);
      return memoria;
    },
    stato: () => memoria,
    async salva(modifica) {
      const prima = memoria;
      const dopo = timbra(prima, modifica(prima), Date.now());
      dopo.ripartenze = (dopo.ripartenzeBase || 0) + (dopo.ricadute?.length || 0);
      memoria = dopo;
      await kv.set(CHIAVE, JSON.stringify(dopo));
      return dopo;
    },
    async registra(ts) {
      return disp.salva((d) => ({ ...aggiungiEvento(d, 'cig', ts), start: d.start ?? ts }));
    },
    /* Si cancella per IDENTIFICATIVO. Nei casi in cui il test conosce solo
       l'istante — quelli scritti prima che gli eventi avessero un'identità —
       si risale al primo evento con quell'istante, che è quello che
       l'utente avrebbe toccato nel registro. */
    async elimina(ts) {
      const e = (memoria?.eventi || []).find((x) => x.tipo === 'cig' && x.ts === ts);
      if (!e) return memoria;
      return disp.salva((d) => rimuoviEvento(d, e.id));
    },
    async eliminaId(id) { return disp.salva((d) => rimuoviEvento(d, id)); },
    async svuota() { await kv.svuotaCoda(); },
    riavvia() {
      // la coda ricomincia dal disco, lo stato in memoria si perde
      kv = creaKvSincronizzato({ locale, remoto: db, fondi: fondiValore, attesa: 60 });
      kv.onCambioEsterno(() => { attese.push(riallinea()); });
      memoria = null;
    },
    inSospeso: () => kv.inSospeso(),
  };
  return disp;
}

/* Le rifusioni scattano dopo la scrittura: `sistemato()` aspetta che
   siano finite prima di controllare, come farebbe un render di React. */
const attese = [];
const sistemato = async () => { while (attese.length) await attese.shift(); };

const conta = (db, key = CHIAVE) => db.stato(key)?.value?.cigs?.length ?? 0;
const cigsDb = (db) => db.stato()?.value?.cigs ?? [];

/* ================================================================== */
/* 1. DUE DISPOSITIVI — il caso che dà 101 invece di 102               */
/* ================================================================== */
{
  const db = creaDatabase();
  const cento = Array.from({ length: 100 }, (_, i) => 1_700_000_000_000 + i * 60000);
  db.metti(CHIAVE, normalizzaRegistro({ start: cento[0], cigs: cento }, vuoto), 1);

  const A = creaDispositivo(db, new Map());
  const B = creaDispositivo(db, new Map());
  await A.apri();
  await B.apri();
  eq('Due dispositivi · partono tutti e due da 100', [A.stato().cigs.length, B.stato().cigs.length], [100, 100]);

  await A.registra(1_800_000_000_000);
  await B.registra(1_800_000_001_000);

  ok('Due dispositivi · il database ne ha 102, non 101',
    conta(db) === 102, `contate ${conta(db)}`);

  await A.apri();
  await B.apri();
  eq('Due dispositivi · e le rivedono tutte e due', [A.stato().cigs.length, B.stato().cigs.length], [102, 102]);
}

/* ================================================================== */
/* 2. DUE SCHEDE dello stesso browser (stesso localStorage)            */
/* ================================================================== */
{
  const db = creaDatabase();
  const condivisa = new Map();
  const cento = Array.from({ length: 100 }, (_, i) => 1_700_000_000_000 + i * 60000);
  db.metti(CHIAVE, normalizzaRegistro({ start: cento[0], cigs: cento }, vuoto), 1);

  const T1 = creaDispositivo(db, condivisa);
  const T2 = creaDispositivo(db, condivisa);
  await T1.apri();
  await T2.apri();

  await T1.registra(1_800_000_000_000);
  await T2.registra(1_800_000_002_000);

  ok('Due schede · nessuna delle due registrazioni va persa',
    conta(db) === 102, `contate ${conta(db)}`);
  const daDisco = JSON.parse(condivisa.get(CHIAVE));
  ok('Due schede · anche la copia locale condivisa le ha tutte e due',
    daDisco.cigs.length === 102, `contate ${daDisco.cigs.length}`);
}

/* ================================================================== */
/* 3. OFFLINE                                                          */
/* ================================================================== */
/* Scenario 1: online → registra → online */
{
  const db = creaDatabase();
  const A = creaDispositivo(db, new Map());
  await A.apri();
  await A.registra(1_800_000_000_000);
  eq('Offline 1 · online, registra, arriva subito', conta(db), 1);
  eq('Offline 1 · niente resta in sospeso', A.inSospeso(), 0);
}

/* Scenario 2: offline → registra → CHIUDE L'APP → riapre → torna online.
   È il caso che il codice di prima perdeva sempre: la coda viveva in
   memoria, il refresh la azzerava, e alla prima lettura riuscita il
   database rispondeva con la versione senza la sigaretta. */
{
  const db = creaDatabase();
  const disco = new Map();
  const A = creaDispositivo(db, disco);
  await A.apri();
  db.online = false;
  await A.registra(1_800_000_000_000);
  ok('Offline 2 · offline la registrazione resta in sospeso', A.inSospeso() === 1);

  A.riavvia();                                   // refresh / app uccisa
  ok('Offline 2 · la coda sopravvive alla chiusura dell\'app',
    JSON.parse(disco.get(CHIAVE_CODA) || '[]').length === 1);

  db.online = true;
  await A.apri();                                // rientro online
  await A.svuota();
  eq('Offline 2 · la sigaretta arriva al database', conta(db), 1);
  eq('Offline 2 · e l\'app la vede ancora', (await A.apri()).cigs.length, 1);
}

/* Scenario 3: offline → dieci sigarette → online */
{
  const db = creaDatabase();
  const A = creaDispositivo(db, new Map());
  await A.apri();
  db.online = false;
  for (let i = 0; i < 10; i += 1) await A.registra(1_800_000_000_000 + i * 60000);
  db.online = true;
  await A.svuota();
  eq('Offline 3 · dieci registrate offline arrivano tutte e dieci', conta(db), 10);
}

/* Scenario 4: offline → registra → elimina → online.
   La cancellazione deve arrivare come cancellazione, non come assenza. */
{
  const db = creaDatabase();
  const A = creaDispositivo(db, new Map());
  await A.apri();
  db.online = false;
  await A.registra(1_800_000_000_000);
  await A.registra(1_800_000_060_000);
  await A.elimina(1_800_000_000_000);
  db.online = true;
  await A.svuota();
  eq('Offline 4 · resta solo quella non cancellata', cigsDb(db), [1_800_000_060_000]);
  ok('Offline 4 · e la cancellazione viaggia come lapide',
    db.stato().value.rimossi.length === 1, JSON.stringify(db.stato().value.rimossi));
}

/* Scenario 5: A offline registra, B online registra, poi A rientra */
{
  const db = creaDatabase();
  const A = creaDispositivo(db, new Map());
  const B = creaDispositivo(db, new Map());
  await A.apri();
  await B.apri();

  db.online = false;
  await A.registra(1_800_000_000_000);
  db.online = true;
  await B.registra(1_800_000_500_000);
  await A.svuota();

  eq('Offline 5 · le due registrazioni convivono', conta(db), 2);
  ok('Offline 5 · e sono proprio quelle giuste',
    cigsDb(db).includes(1_800_000_000_000) && cigsDb(db).includes(1_800_000_500_000));
}

/* Scenario 6: connessione instabile, timeout ripetuti */
{
  const db = creaDatabase();
  const A = creaDispositivo(db, new Map());
  await A.apri();
  db.latenza = 300;                              // oltre l'attesa di 60 ms
  await A.registra(1_800_000_000_000);
  ok('Offline 6 · con la rete che non risponde la scrittura resta in sospeso',
    A.inSospeso() === 1);
  db.latenza = 0;
  await A.svuota();
  eq('Offline 6 · e appena la rete torna arriva', conta(db), 1);
}

/* ================================================================== */
/* 4. IL REMOTO VECCHIO NON PUÒ SOVRASCRIVERE IL LOCALE NUOVO          */
/* ================================================================== */
/* Il caso del punto 3 della richiesta, riprodotto passo per passo:
   richiesta lenta → scade il timeout → l'app usa la copia locale →
   l'utente registra → la risposta vecchia arriva DOPO. */
{
  const db = creaDatabase();
  const disco = new Map();
  const cento = Array.from({ length: 100 }, (_, i) => 1_700_000_000_000 + i * 60000);
  const registro = normalizzaRegistro({ start: cento[0], cigs: cento }, vuoto);
  db.metti(CHIAVE, registro, 1);
  disco.set(CHIAVE, JSON.stringify(registro));

  const A = creaDispositivo(db, disco);
  db.latenza = 250;                              // il database ci mette troppo
  const partita = A.kv.get(CHIAVE);              // scade e torna la copia locale
  const subito = await partita;
  eq('Ritardo · alla scadenza si parte con la copia locale',
    JSON.parse(subito.value).cigs.length, 100);

  // l'utente registra mentre la risposta vecchia è ancora per aria
  db.latenza = 0;
  const nuovo = aggiungiEvento(normalizzaRegistro(registro, vuoto), 'cig', 1_900_000_000_000);
  await A.kv.set(CHIAVE, JSON.stringify(nuovo));

  // e adesso arriva la risposta nata PRIMA della registrazione
  await new Promise((r) => { setTimeout(r, 400); });

  const suDisco = JSON.parse(disco.get(CHIAVE));
  ok('Ritardo · la risposta vecchia NON cancella la sigaretta appena registrata',
    suDisco.cigs.length === 101, `sul dispositivo ce ne sono ${suDisco.cigs.length}`);
  ok('Ritardo · e il database ce l\'ha', conta(db) === 101, `nel database ${conta(db)}`);
}

/* ================================================================== */
/* 5. TENTATIVI RIPETUTI E IDEMPOTENZA                                 */
/* ================================================================== */
{
  const db = creaDatabase();
  const A = creaDispositivo(db, new Map());
  await A.apri();
  await A.registra(1_800_000_000_000);
  const testo = JSON.stringify(A.stato());
  // la stessa identica scrittura, cinque volte
  for (let i = 0; i < 5; i += 1) await A.kv.set(CHIAVE, testo);
  eq('Idempotenza · cinque tentativi identici non fanno cinque sigarette', conta(db), 1);

  // e la fusione applicata due volte non cambia niente
  const unaVolta = fondiRegistri(A.stato(), db.stato().value, vuoto);
  const dueVolte = fondiRegistri(unaVolta, db.stato().value, vuoto);
  eq('Idempotenza · fondere due volte dà lo stesso risultato',
    JSON.stringify(unaVolta.cigs), JSON.stringify(dueVolte.cigs));
}

/* ================================================================== */
/* 6. L'ORDINE NON CONTA                                               */
/* ================================================================== */
/* sigaretta A, sigaretta B, cancellazione di A, sincronizzazioni fuori
   ordine, poi il tentativo ritardato di A. Lo stato finale deve essere
   lo stesso comunque arrivino. */
{
  const base = normalizzaRegistro({ start: 1000, cigs: [1000] }, vuoto);
  const conA = aggiungiEvento(base, 'cig', 2000);
  const conB = aggiungiEvento(base, 'cig', 3000);
  const senzaA = rimuoviEvento(conA, conA.eventi[conA.eventi.length - 1].id);

  const ordini = [
    [conA, conB, senzaA],
    [conB, senzaA, conA],
    [senzaA, conA, conB],
    [conB, conA, senzaA],
    [senzaA, conB, conA],
    [conA, senzaA, conB],
  ];
  const esiti = ordini.map((seq) => {
    let acc = base;
    seq.forEach((x) => { acc = fondiRegistri(acc, x, vuoto); });
    return JSON.stringify(acc.cigs);
  });
  eq('Ordine · sei ordini diversi, un solo stato finale', new Set(esiti).size, 1);
  eq('Ordine · e la sigaretta cancellata non torna', JSON.parse(esiti[0]), [1000, 3000]);
}

/* ================================================================== */
/* 7. NIENTE RESURREZIONI                                              */
/* ================================================================== */
{
  const db = creaDatabase();
  const A = creaDispositivo(db, new Map());
  const B = creaDispositivo(db, new Map());
  await A.apri();
  await A.registra(1_800_000_000_000);
  await A.registra(1_800_000_060_000);
  await B.apri();                                 // B vede tutte e due

  await A.elimina(1_800_000_000_000);
  await B.registra(1_800_000_120_000);            // B scrive la sua copia, che ce l'ha ancora

  eq('Resurrezione · la sigaretta cancellata non torna dall\'altro dispositivo',
    cigsDb(db), [1_800_000_060_000, 1_800_000_120_000]);

  await B.apri();
  eq('Resurrezione · e nemmeno all\'apertura successiva',
    B.stato().cigs, [1_800_000_060_000, 1_800_000_120_000]);
}

/* Azzerare lo storico deve seppellire, non svuotare. */
{
  const db = creaDatabase();
  const A = creaDispositivo(db, new Map());
  const B = creaDispositivo(db, new Map());
  await A.apri();
  await A.registra(1_800_000_000_000);
  await A.registra(1_800_000_060_000);
  await B.apri();

  await A.salva((d) => ({ ...vuoto(), rimossi: seppellisciTutto(d), orologi: d.orologi }));
  await B.salva((d) => ({ ...d }));               // B riscrive la sua copia, che le ha ancora

  eq('Azzeramento · quello che è stato azzerato non torna', cigsDb(db), []);
}

/* ================================================================== */
/* 8. PROFILO E REGISTRO INSIEME                                       */
/* ================================================================== */
{
  const db = creaDatabase();
  const A = creaDispositivo(db, new Map());
  const B = creaDispositivo(db, new Map());
  await A.apri();
  await B.apri();

  await A.salva((d) => ({ ...d, profile: { ...d.profile, prezzoPacchetto: 6.5 } }));
  await B.registra(1_800_000_000_000);

  eq('Profilo · il prezzo cambiato su A sopravvive alla scrittura di B',
    db.stato().value.profile.prezzoPacchetto, 6.5);
  eq('Profilo · e la sigaretta di B c\'è', conta(db), 1);
}

/* Due campi diversi cambiati sui due dispositivi: non devono cancellarsi */
{
  const db = creaDatabase();
  const A = creaDispositivo(db, new Map());
  const B = creaDispositivo(db, new Map());
  await A.apri();
  await B.apri();

  await A.salva((d) => ({ ...d, profile: { ...d.profile, prezzoPacchetto: 6.5 } }));
  await B.salva((d) => ({ ...d, profile: { ...d.profile, motivo: 'per mia figlia' } }));

  const p = db.stato().value.profile;
  ok('Profilo · orologio per campo: prezzo e motivo convivono',
    p.prezzoPacchetto === 6.5 && p.motivo === 'per mia figlia',
    JSON.stringify(p));
}

/* Lo stesso campo cambiato su tutti e due: vince il più recente, e la
   scelta deve essere la stessa dalle due parti. */
{
  const a = timbra(vuoto(), { ...vuoto(), smessoDal: 111 }, 1000);
  const b = timbra(vuoto(), { ...vuoto(), smessoDal: 222 }, 2000);
  eq('Campi · sullo stesso campo vince il più recente',
    fondiRegistri(a, b, vuoto).smessoDal, 222);
  eq('Campi · e la fusione è commutativa',
    fondiRegistri(b, a, vuoto).smessoDal, 222);
}

/* `null` è un valore, non un'assenza: «sono tornato in riduzione» deve
   poter vincere sulla dichiarazione precedente. */
{
  const a = timbra(vuoto(), { ...vuoto(), smessoDal: 111 }, 1000);
  const b = timbra(a, { ...a, smessoDal: null }, 2000);
  eq('Campi · annullare la dichiarazione vince sul valore precedente',
    fondiRegistri(a, b, vuoto).smessoDal, null);
  eq('Campi · in tutti e due i versi',
    fondiRegistri(b, a, vuoto).smessoDal, null);
}

/* ================================================================== */
/* 9. LE RICADUTE SI CONTANO, NON SI SOVRASCRIVONO                     */
/* ================================================================== */
/* Era un contatore scalare: due dispositivi che salgono da 3 a 4
   ciascuno, riconciliati con «vince il più recente», davano 4 e non 5. */
{
  const base = normalizzaRegistro({ ricadute: [100, 200, 300] }, vuoto);
  const a = timbra(base, aggiungiEvento(base, 'ricaduta', 400), 1000);
  const b = timbra(base, aggiungiEvento(base, 'ricaduta', 500), 1001);
  const fuso = fondiRegistri(a, b, vuoto);
  eq('Ricadute · due dispositivi, cinque ricadute', fuso.ricadute.length, 5);
  eq('Ricadute · e il numero mostrato è la loro conta', fuso.ripartenze, 5);
}

/* Il contatore delle versioni precedenti non si perde nella migrazione */
{
  const vecchio = { v: 7, start: 1000, cigs: [1000], ripartenze: 3 };
  const migrato = normalizzaRegistro(vecchio, vuoto);
  eq('Ricadute · il contatore vecchio viene ereditato', migrato.ripartenze, 3);
  const conNuova = aggiungiEvento(migrato, 'ricaduta', 2000);
  eq('Ricadute · e le nuove si sommano a quello',
    normalizzaRegistro(conNuova, vuoto).ripartenze, 4);
}

/* ================================================================== */
/* 10. `start` NON PUÒ ANDARE AVANTI                                   */
/* ================================================================== */
{
  const a = normalizzaRegistro({ start: 5000, cigs: [5000] }, vuoto);
  const b = normalizzaRegistro({ start: 9000, cigs: [9000] }, vuoto);
  eq('Inizio · fondendo, il percorso comincia dalla più vecchia',
    fondiRegistri(a, b, vuoto).start, 5000);
  eq('Inizio · e nell\'altro verso è uguale',
    fondiRegistri(b, a, vuoto).start, 5000);
}

/* ================================================================== */
/* 11. LOGOUT E RIENTRO                                                */
/* ================================================================== */
/* Uscire dall'account non tocca il database: rientrando si deve
   ritrovare tutto, anche partendo da un dispositivo pulito. */
{
  const db = creaDatabase();
  const A = creaDispositivo(db, new Map());
  await A.apri();
  for (let i = 0; i < 5; i += 1) await A.registra(1_800_000_000_000 + i * 60000);

  const nuovoTelefono = creaDispositivo(db, new Map());
  const ritrovato = await nuovoTelefono.apri();
  eq('Logout · da un dispositivo pulito si ritrova tutto', ritrovato.cigs.length, 5);
}

/* ================================================================== */
/* 12. LA CODA NON PERDE LA VERSIONE PIÙ NUOVA                         */
/* ================================================================== */
/* Durante lo svuotamento l'utente registra un'altra sigaretta, quindi la
   voce in coda viene rimpiazzata. Cancellandola alla cieca si buttava
   via proprio la più recente. */
{
  const db = creaDatabase();
  const A = creaDispositivo(db, new Map());
  await A.apri();
  db.online = false;
  await A.registra(1_800_000_000_000);
  await A.registra(1_800_000_060_000);            // rimpiazza la voce in coda
  db.online = true;
  await A.svuota();
  eq('Coda · arrivano tutte e due, non solo la prima', conta(db), 2);
  eq('Coda · e la coda si svuota', A.inSospeso(), 0);
}

/* ================================================================== */
/* 13. UN CENTINAIO DI GIRI A CASO                                     */
/* ================================================================== */
/* Due dispositivi che registrano, cancellano, vanno offline e tornano in
   ordine casuale. Alla fine il conto deve tornare esatto: tutto quello
   che è stato registrato e non cancellato, né una in più né una in meno. */
{
  let seme = 4242;
  const rnd = () => { seme = (seme * 1103515245 + 12345) % 2147483648; return seme / 2147483648; };

  const db = creaDatabase();
  const A = creaDispositivo(db, new Map());
  const B = creaDispositivo(db, new Map());
  await A.apri();
  await B.apri();

  const registrate = new Set();
  const cancellate = new Set();
  let ts = 1_800_000_000_000;

  for (let giro = 0; giro < 120; giro += 1) {
    const disp = rnd() < 0.5 ? A : B;
    const azione = rnd();
    db.online = rnd() > 0.25;                     // un giro su quattro senza rete

    if (azione < 0.6) {
      ts += 60000;
      await disp.registra(ts);
      registrate.add(ts);
    } else if (azione < 0.75 && registrate.size > cancellate.size) {
      const vive = [...registrate].filter((t) => !cancellate.has(t)
        && (disp.stato()?.cigs || []).includes(t));
      if (vive.length) {
        const scelta = vive[Math.floor(rnd() * vive.length)];
        await disp.elimina(scelta);
        cancellate.add(scelta);
      }
    } else {
      db.online = true;
      await disp.svuota();
      await disp.apri();
    }
  }

  db.online = true;
  await A.svuota(); await B.svuota();
  await A.apri(); await B.apri();
  await A.svuota(); await B.svuota();

  const attese = [...registrate].filter((t) => !cancellate.has(t)).sort((a, b) => a - b);
  eq('Caos · dopo centoventi mosse casuali il database ha esattamente le sigarette vive',
    cigsDb(db), attese);
  eq('Caos · e i due dispositivi vedono la stessa cosa',
    [A.stato().cigs.length, B.stato().cigs.length], [attese.length, attese.length]);
  eq('Caos · nessuna cancellata è tornata',
    cigsDb(db).filter((t) => cancellate.has(t)), []);
}

/* ================================================================== */
/* 14. NIENTE NaN, NIENTE Infinity, NIENTE DOPPIONI                    */
/* ================================================================== */
{
  const sporco = {
    start: 'x', cigs: [1000, 1000, null, NaN, 'y', 2000, Infinity],
    resists: null, checkins: undefined, smessoDal: 'boh',
    ricadute: [3000, 3000], ripartenze: 'due',
    rimossi: { cigs: [2000, 'z'] },
  };
  const pulito = normalizzaRegistro(sporco, vuoto);
  eq('Sporcizia · restano solo gli istanti veri, senza doppioni', pulito.cigs, [1000]);
  eq('Sporcizia · le lapidi tolgono quello che era già cancellato',
    pulito.rimossi, [idStorico('cig', 2000)]);
  eq('Sporcizia · le ricadute sono un insieme', pulito.ricadute, [3000]);
  ok('Sporcizia · nessun valore non finito',
    [pulito.start, pulito.ripartenze].every((v) => v === null || Number.isFinite(v)),
    JSON.stringify([pulito.start, pulito.ripartenze]));
  eq('Sporcizia · una dichiarazione illeggibile diventa nessuna dichiarazione',
    pulito.smessoDal, null);
  const rifuso = fondiRegistri(pulito, sporco, vuoto);
  ok('Sporcizia · e fondere con la versione sporca non reintroduce niente',
    rifuso.cigs.length === 1 && Number.isFinite(rifuso.ripartenze));
}

/* ================================================================== */
/* 15. LE ALTRE CHIAVI                                                 */
/* ================================================================== */
/* `smetto:seen:` è la mappa «ultimo evento già visto» per ogni membro:
   un valore vecchio che ne sovrascrive uno nuovo fa ricomparire notifiche
   già lette. Ogni voce sale e basta. */
{
  const a = { m1: 100, m2: 500 };
  const b = { m1: 300, m3: 900 };
  eq('Visti · si prende il massimo voce per voce',
    fondiValore('smetto:seen:u1', a, b), { m1: 300, m2: 500, m3: 900 });
  /* Le chiavi possono uscire in ordine diverso — un oggetto non ha un
     ordine — quindi si confrontano le voci ordinate, non il testo. */
  const voci = (o) => Object.entries(o).sort(([x], [y]) => x.localeCompare(y));
  eq('Visti · ed è commutativa',
    voci(fondiValore('smetto:seen:u1', b, a)),
    voci(fondiValore('smetto:seen:u1', a, b)));
}
{
  eq('Chiavi sconosciute · non si fondono a caso, vince la copia locale',
    fondiValore('altro:qualcosa', { a: 1 }, { a: 2 }), { a: 1 });
}


/* ================================================================== */
/* 16. L'IDENTITÀ DELL'EVENTO NON È IL SUO MILLISECONDO                */
/* ================================================================== */
/* Il millisecondo dice QUANDO è successo. Non dice QUALE evento è.
   Finché le due cose erano la stessa, due sigarette allo stesso
   millisecondo erano una sigaretta sola — e non per un caso di
   laboratorio: `distribuisci` è una funzione pura di (quante, finestra),
   quindi due dispositivi che segnano «ieri, 10 sigarette» producono dieci
   istanti identici al millisecondo. Certo, non improbabile.

   Le due proprietà che devono valere INSIEME, ed è la distinzione che
   prima non si poteva esprimere:
     eventi diversi con lo stesso istante  →  NON si fondono
     lo stesso evento ritrasmesso          →  si fonde in uno solo        */

const T0 = 1_800_000_000_000;
const conEventi = (...eventi) => {
  let d = normalizzaRegistro({ start: T0 }, vuoto);
  eventi.forEach(([tipo, ts, id]) => { d = aggiungiEvento(d, tipo, ts, id); });
  return d;
};

/* --- Scenario A: due registrazioni nello stesso millisecondo, stesso
       dispositivo. Succede con l'orologio spostato indietro (fuso orario,
       correzione manuale): `Date.now()` restituisce un millisecondo già
       usato, e la sigaretta nuova veniva ingoiata senza un errore. --- */
{
  const d = conEventi(['cig', T0], ['cig', T0]);
  eq('Identità A · due registrazioni nello stesso millisecondo restano due', d.cigs.length, 2);
  eq('Identità A · e sopravvivono alla normalizzazione',
    normalizzaRegistro(d, vuoto).cigs.length, 2);
  eq('Identità A · con due identificativi diversi',
    new Set(d.eventi.map((e) => e.id)).size, 2);
  eq('Identità A · e lo stesso istante, perché il tempo non è cambiato',
    d.cigs, [T0, T0]);
}

/* --- Scenario B: due dispositivi registrano nello stesso millisecondo --- */
{
  const A = conEventi(['cig', T0]);
  const B = conEventi(['cig', T0]);
  const f = fondiRegistri(A, B, vuoto);
  eq('Identità B · due dispositivi, stesso millisecondo, due sigarette', f.cigs.length, 2);
  eq('Identità B · e la fusione è commutativa',
    fondiRegistri(B, A, vuoto).cigs.length, 2);
}

/* --- Scenario C: stesso istante, informazioni diverse --- */
{
  let d = conEventi(['cig', T0], ['cig', T0]);
  const [x, y] = d.eventi;
  d = { ...d, tags: { [x.id]: 'stress', [y.id]: 'caffè' } };
  const dopo = normalizzaRegistro(d, vuoto);
  eq('Identità C · due sigarette allo stesso istante hanno due motivi diversi',
    [dopo.tags[x.id], dopo.tags[y.id]], ['stress', 'caffè']);
  const fuso = fondiRegistri(dopo, dopo, vuoto);
  eq('Identità C · e i motivi restano distinti dopo la fusione',
    [fuso.tags[x.id], fuso.tags[y.id]], ['stress', 'caffè']);
}

/* --- Scenario D: lo stesso evento sincronizzato due volte --- */
{
  const A = conEventi(['cig', T0]);
  const id = A.eventi[0].id;
  const copia = conEventi(['cig', T0, id]);          // stesso identificativo
  eq('Identità D · lo stesso evento ritrasmesso resta uno',
    fondiRegistri(A, copia, vuoto).cigs.length, 1);
  let acc = A;
  for (let i = 0; i < 10; i += 1) acc = fondiRegistri(acc, copia, vuoto);
  eq('Identità D · e dieci ritrasmissioni non fanno dieci sigarette', acc.cigs.length, 1);
}

/* --- Il test obbligatorio: cancellare X non deve cancellare Y --- */
{
  const A = conEventi(['cig', T0]);                  // A registra X
  const B = conEventi(['cig', T0]);                  // B registra Y, stesso istante
  const X = A.eventi[0].id;
  const Y = B.eventi[0].id;
  const insieme = fondiRegistri(A, B, vuoto);
  eq('Identità · X e Y convivono prima della cancellazione', insieme.cigs.length, 2);

  const senzaX = rimuoviEvento(insieme, X);          // A elimina X
  const dopoSync = fondiRegistri(senzaX, B, vuoto);  // …e sincronizza con B, che ha ancora Y

  eq('Identità · dopo la cancellazione di X resta un evento solo', dopoSync.cigs.length, 1);
  eq('Identità · ed è Y', dopoSync.eventi[0].id, Y);
  ok('Identità · X resta cancellato', dopoSync.rimossi.includes(X));
  ok('Identità · e non torna nemmeno rifondendo dieci volte', (() => {
    let acc = dopoSync;
    for (let i = 0; i < 10; i += 1) acc = fondiRegistri(acc, i % 2 ? A : B, vuoto);
    return acc.cigs.length === 1 && acc.eventi[0].id === Y;
  })());
}

/* --- `distribuisci`: la collisione certa che ha motivato tutto --- */
{
  const adesso = new Date(2026, 7, 30, 14, 0).getTime();
  const ieri = finestraDi('ieri', adesso);
  const suA = distribuisci(10, ieri, []);
  const suB = distribuisci(10, ieri, []);
  ok('Identità · `distribuisci` produce gli stessi istanti su due dispositivi',
    JSON.stringify(suA) === JSON.stringify(suB),
    'se un giorno smettesse di essere vero, questo controllo non proverebbe più niente');

  let A = normalizzaRegistro({ start: suA[0] }, vuoto);
  suA.forEach((t) => { A = aggiungiEvento(A, 'cig', t); });
  let B = normalizzaRegistro({ start: suB[0] }, vuoto);
  suB.forEach((t) => { B = aggiungiEvento(B, 'cig', t); });

  eq('Identità · due lotti arretrati identici su due dispositivi fanno venti sigarette',
    fondiRegistri(A, B, vuoto).cigs.length, 20);
}

/* --- Gli identificativi non si ripetono mai --- */
{
  const generati = new Set();
  for (let i = 0; i < 20000; i += 1) generati.add(nuovoId());
  eq('Identità · ventimila identificativi, ventimila valori distinti', generati.size, 20000);
}

/* --- Il modello temporale non è cambiato --- */
/* L'identificativo NON sostituisce l'istante: tutta la matematica continua
   a leggere il tempo vero dell'evento. */
{
  const ts1 = new Date(2026, 6, 1, 9).getTime();
  const ts2 = new Date(2026, 6, 5, 22).getTime();
  const d = conEventi(['cig', ts2], ['cig', ts1], ['resist', ts1 + 1000], ['checkin', ts2 + 5000]);
  eq('Tempo · le proiezioni sono ordinate per istante', d.cigs, [ts1, ts2]);
  eq('Tempo · ogni tipo finisce nella sua proiezione',
    [d.cigs.length, d.resists.length, d.checkins.length], [2, 1, 1]);
  eq('Tempo · e l\'istante è quello vero, non l\'ordine di inserimento',
    Math.min(...d.cigs), ts1);
  /* La normalizzazione tira indietro l'inizio del percorso fino alla
     sigaretta più vecchia conosciuta: l'identità non c'entra, il tempo
     resta quello vero. */
  eq('Tempo · l\'inizio del percorso segue l\'istante più vecchio, non l\'identità',
    normalizzaRegistro(d, vuoto).start, ts1);
}

/* --- La migrazione dei registri vecchi --- */
/* L'identificativo storico è DERIVATO dal millisecondo. È la proprietà che
   rende la migrazione sicura: se fosse casuale, due dispositivi che
   aggiornano l'app produrrebbero due copie di ogni sigaretta mai
   registrata alla prima sincronizzazione. */
{
  const vecchio = {
    v: 8,
    start: T0,
    cigs: [T0, T0 + 60000, T0 + 120000],
    resists: [T0 + 30000],
    checkins: [T0 + 90000],
    ricadute: [T0 + 120000],
    tags: { [T0]: 'stress' },
    rimossi: { cigs: [T0 + 999000] },
    profile: { prezzoPacchetto: 6 },
  };
  const m = normalizzaRegistro(vecchio, vuoto);
  eq('Migrazione · le sigarette ci sono tutte', m.cigs.length, 3);
  eq('Migrazione · e anche voglie, check-in e ricadute',
    [m.resists.length, m.checkins.length, m.ricadute.length], [1, 1, 1]);
  eq('Migrazione · gli istanti non si spostano di un millisecondo',
    m.cigs, [T0, T0 + 60000, T0 + 120000]);
  eq('Migrazione · il motivo resta attaccato alla sua sigaretta',
    m.tags[idStorico('cig', T0)], 'stress');
  ok('Migrazione · quello che era stato cancellato resta cancellato',
    m.rimossi.includes(idStorico('cig', T0 + 999000)));
  eq('Migrazione · il prezzo non si perde per strada', m.profile.prezzoPacchetto, 6);

  const m2 = normalizzaRegistro(vecchio, vuoto);
  eq('Migrazione · due dispositivi migrano lo stesso registro senza raddoppiarlo',
    fondiRegistri(m, m2, vuoto).cigs.length, 3);
  eq('Migrazione · e rifondere non aggiunge niente',
    fondiRegistri(fondiRegistri(m, m2, vuoto), m, vuoto).cigs.length, 3);

  /* Il registro migrato non deve rileggere le proprie proiezioni come se
     fossero dati vecchi: sarebbe il doppio di tutto a ogni apertura. */
  let acc = m;
  for (let i = 0; i < 5; i += 1) acc = normalizzaRegistro(acc, vuoto);
  eq('Migrazione · cinque normalizzazioni di fila non moltiplicano niente', acc.cigs.length, 3);
}

/* --- Un registro a metà: `eventi` c'è, le vecchie liste pure --- */
{
  const misto = {
    v: 9,
    start: T0,
    eventi: [{ id: 'abc', tipo: 'cig', ts: T0 }],
    cigs: [T0],                                    // la proiezione dello stesso evento
  };
  eq('Migrazione · con `eventi` presente le liste sono proiezioni, non dati',
    normalizzaRegistro(misto, vuoto).cigs.length, 1);
}

/* ================================================================== */
/* 17. STESSO ISTANTE, IN TUTTE LE SITUAZIONI DELLA VITA VERA          */
/* ================================================================== */
{
  // due dispositivi, stesso istante, con la rete di mezzo
  const db = creaDatabase();
  const A = creaDispositivo(db, new Map());
  const B = creaDispositivo(db, new Map());
  await A.apri();
  await B.apri();
  await A.registra(T0);
  await B.registra(T0);
  eq('Stesso istante · due dispositivi, il database ne ha due', conta(db), 2);
  eq('Stesso istante · e sono lo stesso millisecondo', cigsDb(db), [T0, T0]);
}
{
  // due schede dello stesso browser
  const db = creaDatabase();
  const condivisa = new Map();
  const T1 = creaDispositivo(db, condivisa);
  const T2 = creaDispositivo(db, condivisa);
  await T1.apri();
  await T2.apri();
  await T1.registra(T0);
  await T2.registra(T0);
  eq('Stesso istante · due schede, due sigarette', conta(db), 2);
}
{
  // con tentativi ripetuti: la stessa scrittura non deve moltiplicare
  const db = creaDatabase();
  const A = creaDispositivo(db, new Map());
  await A.apri();
  await A.registra(T0);
  await A.registra(T0);
  const testo = JSON.stringify(A.stato());
  for (let i = 0; i < 5; i += 1) await A.kv.set(CHIAVE, testo);
  eq('Stesso istante · cinque tentativi identici non aggiungono niente', conta(db), 2);
}
{
  // stesso istante + cancellazione, passando dal database
  const db = creaDatabase();
  const A = creaDispositivo(db, new Map());
  const B = creaDispositivo(db, new Map());
  await A.apri();
  await B.apri();
  db.online = false;
  await A.registra(T0);
  const idA = A.stato().eventi.find((e) => e.ts === T0).id;
  db.online = true;
  await B.registra(T0);
  await A.svuota();
  eq('Stesso istante · con cancellazione — prima ce ne sono due', conta(db), 2);
  await A.eliminaId(idA);
  eq('Stesso istante · cancellata la propria, resta quella dell\'altro', conta(db), 1);
  await B.apri();
  eq('Stesso istante · e l\'altro dispositivo vede la sua, non zero', B.stato().cigs.length, 1);
}
{
  // stesso istante + etichette
  const db = creaDatabase();
  const A = creaDispositivo(db, new Map());
  const B = creaDispositivo(db, new Map());
  await A.apri();
  await B.apri();
  await A.registra(T0);
  const idA = A.stato().eventi[0].id;
  await A.salva((d) => ({ ...d, tags: { ...d.tags, [idA]: 'stress' } }));
  await B.registra(T0);
  const idB = B.stato().eventi.find((e) => e.id !== idA)?.id;
  await B.salva((d) => ({ ...d, tags: { ...d.tags, [idB]: 'caffè' } }));
  const finale = db.stato().value;
  eq('Stesso istante · due motivi diversi sulla stessa ora',
    [finale.tags[idA], finale.tags[idB]], ['stress', 'caffè']);
}
{
  // stesso istante + ricaduta
  const d = conEventi(['cig', T0], ['ricaduta', T0], ['cig', T0]);
  eq('Stesso istante · sigaretta e ricaduta nello stesso millisecondo convivono',
    [d.cigs.length, d.ricadute.length], [2, 1]);
  eq('Stesso istante · e il contatore delle ripartenze è la conta delle ricadute',
    normalizzaRegistro(d, vuoto).ripartenze, 1);
}
{
  // stesso istante + offline + refresh
  const db = creaDatabase();
  const disco = new Map();
  const A = creaDispositivo(db, disco);
  await A.apri();
  db.online = false;
  await A.registra(T0);
  await A.registra(T0);
  A.riavvia();                                     // refresh con la coda piena
  db.online = true;
  await A.apri();
  await A.svuota();
  eq('Stesso istante · offline, refresh, rientro: restano due', conta(db), 2);
  eq('Stesso istante · e l\'app le rivede', (await A.apri()).cigs.length, 2);
}
{
  // caos con istanti che si ripetono apposta
  let seme = 909;
  const rnd = () => { seme = (seme * 1103515245 + 12345) % 2147483648; return seme / 2147483648; };
  const db = creaDatabase();
  const A = creaDispositivo(db, new Map());
  const B = creaDispositivo(db, new Map());
  await A.apri();
  await B.apri();
  const istanti = [T0, T0 + 1000, T0 + 2000];       // solo tre istanti possibili
  let quante = 0;
  for (let i = 0; i < 60; i += 1) {
    db.online = rnd() > 0.3;
    const disp = rnd() < 0.5 ? A : B;
    await disp.registra(istanti[Math.floor(rnd() * istanti.length)]);
    quante += 1;
  }
  db.online = true;
  await A.svuota(); await B.svuota();
  await A.apri(); await B.apri();
  await A.svuota(); await B.svuota();
  eq('Stesso istante · sessanta registrazioni su tre soli istanti, sessanta sigarette',
    conta(db), quante);
}



/* ================================================================== */
/* 18. LA CANCELLAZIONE DELLA CHIAVE, CHE NON PUÒ ESSERE CIECA         */
/* ================================================================== */
/* `aggiorna` dichiarava da quale revisione partiva; `cancella` no, e
   faceva un DELETE secco sulla riga. La scrittura era protetta, la
   cancellazione — che distrugge di più — non lo era.

   Va detto con onestà: nell'app di oggi questo ramo NON è raggiungibile.
   Con Supabase configurato, eliminare l'account passa dalla funzione
   `delete_me` sul database e dalla cascata, non da qui; senza Supabase,
   `window.storage` è la sola copia locale e non c'è nessun remoto da
   cancellare. Il difetto è nel codice, non nell'esperienza di nessuno.
   Si corregge lo stesso, perché `delete` è un metodo pubblico dello strato
   di storage, la coda offline può trasportarlo, e la prossima funzione che
   ne avesse bisogno l'avrebbe usato così com'era. */

/* --- A. cancellazione semplice ------------------------------------ */
{
  const db = creaDatabase();
  const A = creaDispositivo(db, new Map());
  await A.apri();
  await A.registra(T0);
  eq('Delete A · prima della cancellazione la riga c\'è', conta(db), 1);
  const esito = await A.kv.delete(CHIAVE);
  ok('Delete A · la cancellazione riesce', esito.deleted === true);
  eq('Delete A · e la riga non c\'è più', db.stato(), null);
}

/* --- B. modifica concorrente: la cancellazione NON deve passare ---- */
/* È lo scenario obbligatorio: A ferma a una revisione vecchia, B che ha
   scritto dopo. Prima il DELETE secco portava via anche il lavoro di B. */
{
  const db = creaDatabase();
  const A = creaDispositivo(db, new Map());
  const B = creaDispositivo(db, new Map());
  await A.apri();
  await A.registra(T0);                       // revisione 1
  await B.apri();                             // B legge la revisione 1
  await B.registra(T0 + 60000);               // revisione 2: A non l'ha mai vista

  const revDiA = db.stato().rev;
  const esito = await A.kv.delete(CHIAVE);

  ok('Delete B · la cancellazione con una revisione vecchia viene abbandonata',
    esito.annullata === true, JSON.stringify(esito));
  ok('Delete B · la riga di B è ancora lì', db.stato() !== null);
  eq('Delete B · e contiene tutte e due le sigarette', conta(db), 2);
  eq('Delete B · la revisione non è stata toccata', db.stato().rev, revDiA);

  /* Il dispositivo che ha chiesto la cancellazione ha buttato via la sua
     copia locale: alla prima lettura deve riprendersi quello che c'è, non
     restare vuoto. */
  const ripreso = await A.apri();
  eq('Delete B · e chi ha chiesto la cancellazione si riallinea', ripreso.cigs.length, 2);
}

/* --- C. cancellazione offline ------------------------------------- */
{
  const db = creaDatabase();
  const disco = new Map();
  const A = creaDispositivo(db, disco);
  await A.apri();
  await A.registra(T0);
  db.online = false;
  await A.kv.delete(CHIAVE);
  ok('Delete C · offline la cancellazione resta in coda', A.inSospeso() === 1);
  A.riavvia();                                // e sopravvive al refresh
  db.online = true;
  await A.svuota();
  eq('Delete C · appena torna la rete la riga viene cancellata', db.stato(), null);
  eq('Delete C · e la coda si svuota', A.inSospeso(), 0);
}

/* --- D. cancellazione offline + l'altro dispositivo registra ------- */
{
  const db = creaDatabase();
  const A = creaDispositivo(db, new Map());
  const B = creaDispositivo(db, new Map());
  await A.apri();
  await A.registra(T0);
  await B.apri();

  db.online = false;
  await A.kv.delete(CHIAVE);                  // A cancella, al buio
  db.online = true;
  await B.registra(T0 + 60000);               // B intanto registra
  await A.svuota();                           // A rientra e prova a consegnare

  ok('Delete D · la sigaretta nuova di B non viene cancellata', db.stato() !== null);
  ok('Delete D · e c\'è ancora', cigsDb(db).includes(T0 + 60000));
  eq('Delete D · la coda non resta appesa a ritentare per sempre', A.inSospeso(), 0);
}

/* --- E. cancellazione di un evento + registrazione successiva ------ */
{
  const db = creaDatabase();
  const A = creaDispositivo(db, new Map());
  await A.apri();
  await A.registra(T0);
  const X = A.stato().eventi[0].id;
  await A.eliminaId(X);
  await A.registra(T0 + 60000);               // Y, dopo la cancellazione
  eq('Delete E · resta solo Y', cigsDb(db), [T0 + 60000]);
  ok('Delete E · e X resta cancellato', db.stato().value.rimossi.includes(X));
  await A.apri();
  eq('Delete E · anche dopo aver riaperto', A.stato().cigs, [T0 + 60000]);
}

/* --- F. cancellazione con lo stesso istante ------------------------ */
{
  const db = creaDatabase();
  const A = creaDispositivo(db, new Map());
  await A.apri();
  await A.registra(1000);
  await A.registra(1000);                     // stesso istante, altro evento
  const [X, Y] = A.stato().eventi.map((e) => e.id);
  eq('Delete F · due eventi allo stesso istante', conta(db), 2);
  await A.eliminaId(X);
  eq('Delete F · cancellato X, resta uno solo', conta(db), 1);
  eq('Delete F · ed è Y', db.stato().value.eventi[0].id, Y);
}

/* --- G. cancellazione e etichette --------------------------------- */
{
  const db = creaDatabase();
  const A = creaDispositivo(db, new Map());
  await A.apri();
  await A.registra(1000);
  await A.registra(1000);
  const [X, Y] = A.stato().eventi.map((e) => e.id);
  await A.salva((d) => ({ ...d, tags: { ...d.tags, [X]: 'stress', [Y]: 'caffè' } }));
  await A.eliminaId(X);
  const finale = db.stato().value;
  eq('Delete G · il motivo di X sparisce con X', finale.tags[X], undefined);
  eq('Delete G · quello di Y resta', finale.tags[Y], 'caffè');
}

/* --- H. la stessa cancellazione ritentata più volte ---------------- */
{
  const db = creaDatabase();
  const A = creaDispositivo(db, new Map());
  await A.apri();
  await A.registra(T0);
  await A.registra(T0 + 60000);
  const X = A.stato().eventi[0].id;
  await A.eliminaId(X);
  const testo = JSON.stringify(A.stato());
  for (let i = 0; i < 5; i += 1) await A.kv.set(CHIAVE, testo);
  eq('Delete H · cinque tentativi identici lasciano una sigaretta sola', conta(db), 1);
  eq('Delete H · e X resta cancellato una volta sola',
    db.stato().value.rimossi.filter((id) => id === X).length, 1);
  eq('Delete H · l\'altra sigaretta non è stata toccata', cigsDb(db), [T0 + 60000]);
}

/* --- La cancellazione della chiave, ritentata più volte ------------ */
{
  const db = creaDatabase();
  const A = creaDispositivo(db, new Map());
  await A.apri();
  await A.registra(T0);
  await A.kv.delete(CHIAVE);
  const dueVolte = await A.kv.delete(CHIAVE);
  ok('Delete H · cancellare una riga che non c\'è più non è un errore',
    dueVolte.deleted === true && !dueVolte.annullata, JSON.stringify(dueVolte));
  eq('Delete H · e lo stato finale è lo stesso', db.stato(), null);
}

/* ================================================================== */
/* 19. LE LAPIDI REGGONO A TUTTO                                       */
/* ================================================================== */
/* Il caso del punto 4, passo per passo: A registra X, B lo riceve, A lo
   cancella, B resta offline per un po', B torna e si sincronizzano.
   X non deve ricomparire. */
{
  const db = creaDatabase();
  const discoB = new Map();
  const A = creaDispositivo(db, new Map());
  const B = creaDispositivo(db, discoB);
  await A.apri();
  await A.registra(T0);
  const X = A.stato().eventi[0].id;
  await B.apri();                               // B riceve X
  ok('Lapidi · B ha ricevuto X', B.stato().cigs.length === 1);

  await A.eliminaId(X);                         // A cancella X
  db.online = false;
  await B.registra(T0 + 60000);                 // B, offline, registra altro
  B.riavvia();                                  // e nel frattempo si riavvia
  db.online = true;
  await B.apri();
  await B.svuota();
  await sistemato();

  ok('Lapidi · X non ricompare dopo il rientro di B',
    !cigsDb(db).includes(T0), JSON.stringify(cigsDb(db)));
  ok('Lapidi · e quello che B ha registrato offline c\'è',
    cigsDb(db).includes(T0 + 60000));

  // e nemmeno su un dispositivo nuovo di zecca
  const C = creaDispositivo(db, new Map());
  const visto = await C.apri();
  ok('Lapidi · nemmeno su un dispositivo appena installato',
    !visto.cigs.includes(T0) && visto.cigs.includes(T0 + 60000));

  // né rifondendo all'infinito in ordine casuale
  let acc = normalizzaRegistro(db.stato().value, vuoto);
  for (let i = 0; i < 20; i += 1) {
    acc = fondiRegistri(acc, i % 3 === 0 ? A.stato() : B.stato(), vuoto);
  }
  ok('Lapidi · né dopo venti rifusioni in ordine misto', !acc.cigs.includes(T0));
}


/* ------------------------------------------------------------------ */

console.log(`\n  ${passati} controlli di persistenza superati`);
if (falliti.length) {
  console.log(`  ${falliti.length} FALLITI:\n`);
  falliti.forEach((f) => console.log(`   ✗ ${f}`));
  process.exit(1);
}
console.log('  nessun fallimento\n');
