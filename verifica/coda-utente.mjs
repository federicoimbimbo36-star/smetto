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

import { creaKvSincronizzato } from '../src/utils/sincronizza.js';
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

console.log('');
if (falliti.length) {
  falliti.forEach((f) => console.log(`  ✗ ${f}`));
  console.log(`\n  ${passati} controlli superati, ${falliti.length} falliti\n`);
  process.exit(1);
}
console.log(`  ${passati} controlli sulla coda per utente superati\n  nessun fallimento\n`);
process.exit(0);
