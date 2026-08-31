/* ------------------------------------------------------------------ */
/* coda-utente.mjs — la coda sa di chi è ogni scrittura                 */
/*                                                                     */
/*   node verifica/coda-utente.mjs                                     */
/*                                                                     */
/* Due problemi trovati dall'audit, che sono lo stesso problema visto   */
/* da due lati:                                                        */
/*                                                                     */
/*  · la coda teneva chiave → valore e consegnava all'utente di ADESSO. */
/*    Su un telefono condiviso il registro di A finiva sotto l'account  */
/*    di B — verificato, non temuto.                                    */
/*  · con la sessione scaduta la scrittura non entrava proprio in coda: */
/*    restava sulla copia locale e `inSospeso()` diceva zero.           */
/*                                                                     */
/* Il database finto applica la policy vera (`kv_all_own`): una riga è  */
/* (user_id, key), e ognuno può scrivere righe SUE con QUALSIASI        */
/* chiave. È il motivo per cui la RLS non poteva difendere da sola, e   */
/* per cui la difesa deve stare nel client.                             */
/* ------------------------------------------------------------------ */

import { creaKvSincronizzato, CHIAVE_CODA } from '../src/utils/sincronizza.js';
import {
  fondiValore, normalizzaRegistro, aggiungiEvento, timbra,
} from '../src/utils/fusione.js';

let passati = 0;
const falliti = [];
const ok = (nome, cond, extra = '') => {
  if (cond) passati += 1;
  else falliti.push(`${nome}${extra ? `\n      ${extra}` : ''}`);
};
const eq = (nome, a, b) => ok(nome, a === b, `atteso ${b}, ottenuto ${a}`);

const vuoto = () => ({
  v: 9, start: null, smessoDal: null, eventi: [], cigs: [], resists: [],
  checkins: [], ricadute: [], rimossi: [], tags: {}, groups: [], notify: true,
  avvisiCorpo: true, onboarded: true,
  profile: { motivo: '', baseline: null, prezzoPacchetto: null, perPacchetto: 20, sesso: 'non_detto' },
  plans: {}, tappeViste: { ref: null, idx: [] }, ripartenzeBase: 0, ripartenze: 0, orologi: {},
});

/* la stessa funzione che installStorage.js passa al motore */
const uidDaChiave = (key) => {
  const m = /^smetto:(?:log|seen):(.+)$/.exec(String(key));
  return m ? m[1] : null;
};

function creaDb() {
  const righe = new Map();               // `${uid}|${key}` → { value, rev }
  let dentro = null;
  let rete = true;
  return {
    righe,
    entra: (u) => { dentro = u; },
    esci: () => { dentro = null; },
    spegniRete: () => { rete = false; },
    accendiRete: () => { rete = true; },
    cigs: (uid, key) => righe.get(`${uid}|${key}`)?.value?.cigs?.length ?? null,
    api: {
      async utente() { return dentro; },
      async leggi(uid, key) {
        if (!rete) return { error: new Error('offline') };
        const r = righe.get(`${uid}|${key}`);
        return { data: r ? { value: r.value, rev: r.rev } : null };
      },
      async aggiorna(uid, key, valore, rev) {
        if (!rete) return { error: new Error('offline') };
        const r = righe.get(`${uid}|${key}`);
        if (!r || r.rev !== rev) return { data: [] };
        r.value = valore; r.rev = rev + 1;
        return { data: [{ rev: r.rev }] };
      },
      async inserisci(uid, key, valore) {
        if (!rete) return { error: new Error('offline') };
        const k = `${uid}|${key}`;
        if (righe.has(k)) return { error: new Error('duplicato') };
        righe.set(k, { value: valore, rev: 1 });
        return { data: [{ rev: 1 }] };
      },
      async cancella(uid, key, rev) {
        if (!rete) return { error: new Error('offline') };
        const r = righe.get(`${uid}|${key}`);
        if (!r || r.rev !== rev) return { data: [] };
        righe.delete(`${uid}|${key}`);
        return { data: [{ rev }] };
      },
      async elenca() { return { data: [] }; },
    },
  };
}

/* localStorage: uno solo, condiviso da tutti gli account del dispositivo */
function creaLocale(m = new Map()) {
  return {
    mappa: m,
    async get(k) { const v = m.get(k); return v === undefined ? null : { key: k, value: v }; },
    async set(k, v) { m.set(k, v); return { key: k, value: v }; },
    async delete(k) { m.delete(k); return { key: k, deleted: true }; },
    async list(p = '') { return { keys: [...m.keys()].filter((x) => x.startsWith(p)), prefix: p }; },
  };
}

const registro = (istanti) => {
  let d = normalizzaRegistro(vuoto(), vuoto);
  istanti.forEach((ts) => {
    d = timbra(d, { ...aggiungiEvento(d, 'cig', ts), start: d.start ?? ts }, Date.now());
  });
  return JSON.stringify(d);
};

const A = 'utente-A';
const B = 'utente-B';
const chiaveA = `smetto:log:${A}`;
const chiaveB = `smetto:log:${B}`;

/* ================================================================== */
/* 1. IL CASO DELL'AUDIT: A offline, esce, entra B                     */
/* ================================================================== */
{
  const db = creaDb();
  const locale = creaLocale();
  const kv = creaKvSincronizzato({
    locale, remoto: db.api, fondi: fondiValore, attesa: 30, uidDaChiave,
  });

  db.entra(A);
  db.spegniRete();
  await kv.set(chiaveA, registro([1_700_000_000_000, 1_700_000_060_000, 1_700_000_120_000]));
  eq('A · la scrittura offline entra in coda', kv.inSospeso(), 1);

  // A esce, B entra, la rete torna: è il momento in cui installStorage
  // chiama svuotaCoda su onAuthStateChange
  db.esci();
  db.accendiRete();
  db.entra(B);
  await kv.svuotaCoda();

  ok('B · il registro di A NON finisce sotto l\'account di B',
    db.cigs(B, chiaveA) === null,
    `sotto B ci sono ${db.cigs(B, chiaveA)} sigarette di A`);
  eq('B · nessuna riga estranea sul database', db.righe.size, 0);
  eq('B · la voce di A resta in coda, intatta', kv.inSospeso(), 1);

  // B lavora normalmente: la coda di A non gli dà fastidio
  await kv.set(chiaveB, registro([1_700_100_000_000]));
  eq('B · le sue scritture passano', db.cigs(B, chiaveB), 1);
  eq('B · e quella di A è ancora lì che aspetta', kv.inSospeso(), 1);

  // A rientra
  db.esci();
  db.entra(A);
  await kv.svuotaCoda();
  eq('A rientra · il suo registro arriva al SUO account', db.cigs(A, chiaveA), 3);
  eq('A rientra · la coda si è svuotata', kv.inSospeso(), 0);
  ok('A rientra · e l\'account di B non è stato toccato', db.cigs(B, chiaveA) === null);
}

/* ================================================================== */
/* 2. SESSIONE ASSENTE: LA SCRITTURA NON SI PERDE                      */
/* ================================================================== */
{
  const db = creaDb();
  const locale = creaLocale();
  const kv = creaKvSincronizzato({
    locale, remoto: db.api, fondi: fondiValore, attesa: 30, uidDaChiave,
  });

  db.entra(A);
  await kv.set(chiaveA, registro([1_700_000_000_000]));
  eq('sessione presente · la scrittura arriva', db.cigs(A, chiaveA), 1);
  eq('sessione presente · niente in sospeso', kv.inSospeso(), 0);

  // la sessione scade e il refresh non riesce: getSession torna null
  db.esci();
  await kv.set(chiaveA, registro([1_700_000_000_000, 1_700_000_060_000]));
  eq('sessione scaduta · il database resta indietro', db.cigs(A, chiaveA), 1);
  eq('sessione scaduta · MA la scrittura è in coda', kv.inSospeso(), 1);

  db.entra(A);
  await kv.svuotaCoda();
  eq('rientro · la scrittura arriva all\'account giusto', db.cigs(A, chiaveA), 2);
  eq('rientro · la coda si è svuotata', kv.inSospeso(), 0);
}

/* ================================================================== */
/* 3. SESSIONE ASSENTE E POI ENTRA QUALCUN ALTRO                       */
/* ================================================================== */
/* È il punto in cui le due correzioni si incontrano: la scrittura fatta
   senza sessione deve andare in coda (correzione 6) ma con il
   proprietario giusto (correzione 3), altrimenti si sarebbe costruita
   una coda senza padrone — cioè lo stesso bug, in un altro punto. */
{
  const db = creaDb();
  const locale = creaLocale();
  const kv = creaKvSincronizzato({
    locale, remoto: db.api, fondi: fondiValore, attesa: 30, uidDaChiave,
  });

  db.esci();
  await kv.set(chiaveA, registro([1_700_000_000_000, 1_700_000_060_000]));
  eq('senza sessione · in coda', kv.inSospeso(), 1);

  db.entra(B);
  await kv.svuotaCoda();
  ok('entra B · non prende la scrittura di A', db.cigs(B, chiaveA) === null);
  eq('entra B · la coda non è stata consumata', kv.inSospeso(), 1);

  db.esci();
  db.entra(A);
  await kv.svuotaCoda();
  eq('entra A · la riceve lui', db.cigs(A, chiaveA), 2);
}

/* ================================================================== */
/* 4. LA CODA DELLA VERSIONE PRECEDENTE                                */
/* ================================================================== */
/* Chi aggiorna ha già sul disco una coda nel formato vecchio,
   `[[chiave, valore]]`, senza proprietario. Non deve essere persa, e non
   deve essere consegnata al primo che passa. */
{
  const db = creaDb();
  const mappa = new Map();
  const locale = creaLocale(mappa);

  // coda scritta dalla versione precedente
  mappa.set('__coda__', JSON.stringify([[chiaveA, registro([1_700_000_000_000, 1_700_000_060_000])]]));

  const kv = creaKvSincronizzato({
    locale, remoto: db.api, fondi: fondiValore, attesa: 30, uidDaChiave,
  });
  await kv.caricaCoda();
  eq('coda vecchia · viene ritrovata', kv.inSospeso(), 1);

  db.entra(B);
  await kv.svuotaCoda();
  ok('coda vecchia · non viene consegnata a B', db.cigs(B, chiaveA) === null);
  eq('coda vecchia · e non viene buttata', kv.inSospeso(), 1);

  db.esci();
  db.entra(A);
  await kv.svuotaCoda();
  eq('coda vecchia · arriva ad A, che ne è il proprietario', db.cigs(A, chiaveA), 2);
}

/* ================================================================== */
/* 5. LA CODA SOPRAVVIVE AL RIAVVIO CON IL PROPRIETARIO                */
/* ================================================================== */
{
  const db = creaDb();
  const mappa = new Map();
  const locale = creaLocale(mappa);
  const kv = creaKvSincronizzato({
    locale, remoto: db.api, fondi: fondiValore, attesa: 30, uidDaChiave,
  });

  db.entra(A);
  db.spegniRete();
  await kv.set(chiaveA, registro([1_700_000_000_000]));

  // app uccisa e riaperta: motore nuovo, stesso disco
  const kv2 = creaKvSincronizzato({
    locale, remoto: db.api, fondi: fondiValore, attesa: 30, uidDaChiave,
  });
  await kv2.caricaCoda();
  eq('riavvio · la coda si ritrova', kv2.inSospeso(), 1);

  db.accendiRete();
  db.esci();
  db.entra(B);
  await kv2.svuotaCoda();
  ok('riavvio · B non se la prende', db.cigs(B, chiaveA) === null);

  db.esci();
  db.entra(A);
  await kv2.svuotaCoda();
  eq('riavvio · A la riceve', db.cigs(A, chiaveA), 1);
}

/* ================================================================== */
/* 6. LA SCRITTURA DIRETTA, CHE NON PASSAVA DALLA CODA                 */
/*                                                                     */
/* La coda era blindata, la scrittura diretta no. `set()` prendeva      */
/* `uid` dalla sessione e scriveva, qualunque chiave fosse — e la       */
/* chiave e la sessione non cambiano nello stesso istante: la chiave la */
/* compone installStorage.js dallo stato dell'app, `uid` arriva da      */
/* `remoto.utente()`. Con la rete che FUNZIONA e la sessione gia'       */
/* passata a B, il registro di A finiva sotto l'account di B senza      */
/* nemmeno sfiorare la coda.                                            */
/*                                                                     */
/* La RLS non poteva difendere: la policy guarda `user_id`, e B stava   */
/* scrivendo righe sue.                                                 */
/* ================================================================== */
{
  const db = creaDb();
  const locale = creaLocale();
  const kv = creaKvSincronizzato({
    locale, remoto: db.api, fondi: fondiValore, attesa: 30, uidDaChiave,
  });

  db.entra(B);
  // l'app ha ancora A nello stato, quindi compone la chiave di A
  await kv.set(chiaveA, registro([1_700_000_000_000, 1_700_000_060_000]));

  ok('diretta · il registro di A NON finisce sotto l\'account di B',
    db.cigs(B, chiaveA) === null,
    `sotto B ci sono ${db.cigs(B, chiaveA)} sigarette di A`);
  eq('diretta · nessuna riga estranea sul database', db.righe.size, 0);
  eq('diretta · la scrittura e\' stata trattenuta in coda', kv.inSospeso(), 1);

  // la copia locale c'e' comunque: la durabilita' non si sacrifica
  ok('diretta · la copia sul dispositivo e\' stata scritta lo stesso',
    locale.mappa.has(chiaveA));

  // B intanto lavora senza impicci
  await kv.set(chiaveB, registro([1_700_100_000_000]));
  eq('diretta · le scritture di B passano', db.cigs(B, chiaveB), 1);

  // e quando rientra A, la sua roba arriva al suo account
  db.esci();
  db.entra(A);
  await kv.svuotaCoda();
  eq('diretta · A rientra e il registro arriva al SUO account', db.cigs(A, chiaveA), 2);
  ok('diretta · l\'account di B resta pulito', db.cigs(B, chiaveA) === null);
  eq('diretta · la coda si e\' svuotata', kv.inSospeso(), 0);
}

/* la cancellazione segue la stessa regola: cancellare la riga di un
   altro account e' peggio che scriverla */
{
  const db = creaDb();
  const locale = creaLocale();
  const kv = creaKvSincronizzato({
    locale, remoto: db.api, fondi: fondiValore, attesa: 30, uidDaChiave,
  });

  // A ha gia' il suo registro sul database
  db.entra(A);
  await kv.set(chiaveA, registro([1_700_000_000_000, 1_700_000_060_000, 1_700_000_120_000]));
  eq('cancella · A ha tre sigarette sul database', db.cigs(A, chiaveA), 3);

  // passa la sessione a B, ma la chiave in volo e' ancora di A
  db.esci();
  db.entra(B);
  await kv.delete(chiaveA);

  eq('cancella · il registro di A e\' ancora sul database', db.cigs(A, chiaveA), 3);
  eq('cancella · nessuna riga di B toccata', db.cigs(B, chiaveA), null);
  eq('cancella · la cancellazione e\' in coda, non eseguita', kv.inSospeso(), 1);

  db.esci();
  db.entra(A);
  await kv.svuotaCoda();
  eq('cancella · A rientra e la cancellazione parte davvero', db.cigs(A, chiaveA), null);
}

/* ================================================================== */
/* 7. LA CODA SI CARICA UNA VOLTA SOLA, MA DAVVERO                     */
/*                                                                     */
/* `caricaCoda` alzava la bandiera PRIMA di leggere il disco:           */
/*                                                                     */
/*   caricaCoda()  → bandiera alzata, si mette ad aspettare il disco    */
/*   set()         → `await caricaCoda()` torna SUBITO, mappa vuota     */
/*                 → accoda() → salvaCoda() riscrive la coda con la     */
/*                   sola voce nuova                                    */
/*   il disco risponde → e rilegge la coda gia' troncata                */
/*                                                                     */
/* Le scritture offline in attesa sparivano dal disco E dalla memoria.  */
/* Non e' una gara stretta: installStorage.js chiama `caricaCoda()`     */
/* SENZA await al caricamento del modulo, quindi ogni scrittura fatta   */
/* nei primi millisecondi dell'app cade esattamente li'.                */
/* ================================================================== */
{
  /* un disco lento come quello di un telefono che sta avviando l'app */
  const m = new Map();
  const locale = {
    mappa: m,
    async get(k) {
      await new Promise((r) => setTimeout(r, 20));
      const v = m.get(k); return v === undefined ? null : { key: k, value: v };
    },
    async set(k, v) { m.set(k, v); return { key: k, value: v }; },
    async delete(k) { m.delete(k); return { key: k, deleted: true }; },
    async list(p = '') { return { keys: [...m.keys()].filter((x) => x.startsWith(p)), prefix: p }; },
  };

  /* tre scritture offline gia' in attesa sul disco, di due account diversi */
  const chiaveVisti = `smetto:seen:${A}`;
  m.set(CHIAVE_CODA, JSON.stringify([
    [chiaveA, { uid: A, value: registro([1_600_000_000_000]) }],
    [chiaveVisti, { uid: A, value: '{}' }],
    [chiaveB, { uid: B, value: registro([1_600_000_060_000]) }],
  ]));

  const db = creaDb();
  const kv = creaKvSincronizzato({
    locale, remoto: db.api, fondi: fondiValore, attesa: 30, uidDaChiave,
  });

  // installStorage.js: caricaCoda() SENZA await
  const caricamento = kv.caricaCoda();
  // e intanto l'app, offline, registra una sigaretta
  db.spegniRete();
  db.entra(A);
  const nuovoRegistro = registro([1_700_000_000_000, 1_700_000_060_000]);
  await kv.set(chiaveA, nuovoRegistro);

  const suDisco = () => JSON.parse(m.get(CHIAVE_CODA)).map(([k]) => k);

  eq('carica · sul disco ci sono ancora tutte e tre le voci in attesa, piu\' niente di perso',
    suDisco().length, 3);
  ok('carica · la voce dell\'altro account e\' ancora li\'',
    suDisco().includes(chiaveB),
    `sul disco: ${suDisco().join(', ')}`);
  ok('carica · e quella dei visti pure', suDisco().includes(chiaveVisti));

  await caricamento;
  eq('carica · in memoria ci sono tutte e tre', kv.inSospeso(), 3);
  eq('carica · dopo la lettura il disco non ha perso niente', suDisco().length, 3);

  /* e la scrittura nuova ha davvero rimpiazzato quella vecchia della
     stessa chiave, non e' andata persa a sua volta */
  const voceA = JSON.parse(m.get(CHIAVE_CODA)).find(([k]) => k === chiaveA)[1];
  eq('carica · la scrittura nuova ha rimpiazzato quella vecchia', voceA.value, nuovoRegistro);
  eq('carica · ed e\' attribuita ad A', voceA.uid, A);

  /* la prova finale: la rete torna e non manca niente */
  db.accendiRete();
  await kv.svuotaCoda();
  eq('carica · A riceve il registro nuovo', db.cigs(A, chiaveA), 2);
  eq('carica · e la mappa dei visti', db.righe.has(`${A}|${chiaveVisti}`), true);
  eq('carica · la voce di B resta in attesa del suo proprietario', kv.inSospeso(), 1);
}

console.log('');
if (falliti.length) {
  falliti.forEach((f) => console.log(`  ✗ ${f}`));
  console.log(`\n  ${passati} controlli superati, ${falliti.length} falliti\n`);
  process.exit(1);
}
console.log(`  ${passati} controlli sulla coda per utente superati\n  nessun fallimento\n`);
process.exit(0);
