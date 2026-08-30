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
import {
  fondiValore, fondiRegistri, normalizzaRegistro, timbra,
  rimuoviIstante, seppellisciTutto,
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
  v: 8, start: null, smessoDal: null, cigs: [], resists: [], tags: {}, checkins: [],
  groups: [], notify: true, avvisiCorpo: true, onboarded: false,
  profile: { motivo: '', baseline: null, prezzoPacchetto: null, perPacchetto: 20, sesso: 'non_detto' },
  plans: {}, tappeViste: { ref: null, idx: [] },
  ricadute: [], ripartenzeBase: 0, ripartenze: 0,
  rimossi: { cigs: [], resists: [], checkins: [], ricadute: [] },
  orologi: {},
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
    async cancella(uid, key) { await db.attesa(); righe.delete(key); return {}; },
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
      return disp.salva((d) => ({ ...d, start: d.start ?? ts, cigs: [...d.cigs, ts] }));
    },
    async elimina(ts) { return disp.salva((d) => rimuoviIstante(d, 'cigs', ts)); },
    async svuota() { await kv.svuotaCoda(); },
    riavvia() {
      // la coda ricomincia dal disco, lo stato in memoria si perde
      kv = creaKvSincronizzato({ locale, remoto: db, fondi: fondiValore, attesa: 60 });
      memoria = null;
    },
    inSospeso: () => kv.inSospeso(),
  };
  return disp;
}

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
  eq('Offline 4 · e la cancellazione viaggia come lapide',
    db.stato().value.rimossi.cigs, [1_800_000_000_000]);
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
  const nuovo = { ...registro, cigs: [...registro.cigs, 1_900_000_000_000] };
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
  const conA = { ...base, cigs: [1000, 2000] };
  const conB = { ...base, cigs: [1000, 3000] };
  const senzaA = rimuoviIstante(conA, 'cigs', 2000);

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
  const a = timbra(base, { ...base, ricadute: [...base.ricadute, 400] }, 1000);
  const b = timbra(base, { ...base, ricadute: [...base.ricadute, 500] }, 1001);
  const fuso = fondiRegistri(a, b, vuoto);
  eq('Ricadute · due dispositivi, cinque ricadute', fuso.ricadute.length, 5);
  eq('Ricadute · e il numero mostrato è la loro conta', fuso.ripartenze, 5);
}

/* Il contatore delle versioni precedenti non si perde nella migrazione */
{
  const vecchio = { v: 7, start: 1000, cigs: [1000], ripartenze: 3 };
  const migrato = normalizzaRegistro(vecchio, vuoto);
  eq('Ricadute · il contatore vecchio viene ereditato', migrato.ripartenze, 3);
  const conNuova = { ...migrato, ricadute: [2000] };
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
  eq('Sporcizia · le lapidi tolgono quello che era già cancellato', pulito.rimossi.cigs, [2000]);
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

/* ------------------------------------------------------------------ */

console.log(`\n  ${passati} controlli di persistenza superati`);
if (falliti.length) {
  console.log(`  ${falliti.length} FALLITI:\n`);
  falliti.forEach((f) => console.log(`   ✗ ${f}`));
  process.exit(1);
}
console.log('  nessun fallimento\n');
