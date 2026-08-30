/* ------------------------------------------------------------------ */
/* annulla-lotto.mjs — annullare il lotto toglie il lotto, e basta      */
/*                                                                     */
/*   TZ=Europe/Rome node verifica/annulla-lotto.mjs                    */
/*                                                                     */
/* Lo scenario è quello trovato dall'audit, riprodotto passo per passo  */
/* con le funzioni vere:                                               */
/*                                                                     */
/*   1. una sigaretta registrata normalmente                           */
/*   2. «ne ho fumate più di una» → tre arretrate                      */
/*   3. NEI 40 SECONDI del chip: un'altra sigaretta, registrata da      */
/*      Aiuto → voglia → «Ho fumato»                                   */
/*   4. si tocca «Annulla» sul lotto                                   */
/*                                                                     */
/* Prima sopravviveva solo la sigaretta del punto 1: il punto 3 spariva */
/* senza lapide, e la scrittura successiva lo toglieva anche dal        */
/* database. Qui si controlla che non succeda più, e che non succeda    */
/* nemmeno dopo un giro di sincronizzazione.                            */
/* ------------------------------------------------------------------ */

import {
  normalizzaRegistro, aggiungiEvento, aggiungiEventi, rimuoviEvento, timbra,
  fondiRegistri, fondiValore,
} from '../src/utils/fusione.js';
import { distribuisci, tappeDaRiavviare, togliLotto } from '../src/utils/arretrate.js';
import { creaKvSincronizzato } from '../src/utils/sincronizza.js';

let passati = 0;
const falliti = [];
const ok = (nome, cond, extra = '') => {
  if (cond) passati += 1;
  else falliti.push(`${nome}${extra ? `\n      ${extra}` : ''}`);
};
const eq = (nome, a, b) => ok(nome, a === b, `atteso ${b}, ottenuto ${a}`);

/* deve restare allineato a vuotoLog() in App.jsx */
const vuoto = () => ({
  v: 9, start: null, smessoDal: null, eventi: [], cigs: [], resists: [],
  checkins: [], ricadute: [], rimossi: [], tags: {}, groups: [], notify: true,
  avvisiCorpo: true, onboarded: true,
  profile: { motivo: '', baseline: null, prezzoPacchetto: null, perPacchetto: 20, sesso: 'non_detto' },
  plans: {}, tappeViste: { ref: null, idx: [] }, ripartenzeBase: 0, ripartenze: 0, orologi: {},
});

const adesso = Date.parse('2026-08-30T18:00:00+02:00');

/* Lo stato dell'app, come `datiRef.current`, e `salva()` come App.jsx. */
function creaApp() {
  let dati = normalizzaRegistro(vuoto(), vuoto);
  return {
    stato: () => dati,
    salva(next) {
      dati = timbra(dati, next, Date.now());
      dati.ripartenze = (dati.ripartenzeBase || 0) + (dati.ricadute?.length || 0);
      return dati;
    },
    /* copia fedele di registraArretrate (App.jsx), lotto compreso */
    arretrate(quante, finestra) {
      const primaDiTutto = dati;
      const nuovi = distribuisci(quante, finestra, dati.cigs);
      const riavvio = tappeDaRiavviare(dati.cigs, nuovi);
      const next = aggiungiEventi(dati, 'cig', nuovi);
      this.salva({
        ...next,
        start: dati.start === null ? nuovi[0] : Math.min(dati.start, nuovi[0]),
        ...(riavvio === null ? {} : { tappeViste: { ref: riavvio, idx: [] } }),
      });
      const ids = next.eventi.slice(primaDiTutto.eventi?.length || 0).map((e) => e.id);
      return {
        ids, ts: nuovi, quante: nuovi.length, quando: finestra.breve, riavvio, prima: primaDiTutto,
      };
    },
    fuma(ts) {
      const next = aggiungiEvento(dati, 'cig', ts);
      const id = next.eventi[next.eventi.length - 1].id;
      this.salva({ ...next, start: dati.start ?? ts, tappeViste: { ref: ts, idx: [] } });
      return id;
    },
  };
}

/* ================================================================== */
/* 1. LO SCENARIO DELL'AUDIT                                           */
/* ================================================================== */
const app = creaApp();
const idPrima = app.fuma(adesso - 5 * 3600000);
eq('1 · una sigaretta registrata', app.stato().cigs.length, 1);

const finestra = { id: 'mattina', da: adesso - 4 * 3600000, a: adesso - 3600000, breve: 'stamattina' };
const lotto = app.arretrate(3, finestra);
eq('2 · tre arretrate aggiunte', app.stato().cigs.length, 4);
eq('2 · il lotto porta con sé gli istanti (correzione 1)', lotto.ts.length, 3);
ok('2 · e sono ordinati', lotto.ts.every((t, i) => i === 0 || t >= lotto.ts[i - 1]));

const idNuova = app.fuma(adesso);
eq('3 · una sigaretta registrata nei 40 secondi del chip', app.stato().cigs.length, 5);

const dopo = app.salva(togliLotto(app.stato(), lotto, rimuoviEvento));

eq('4 · restano due sigarette, non una', dopo.cigs.length, 2);
ok('4 · la sigaretta iniziale c\'è ancora', dopo.eventi.some((e) => e.id === idPrima));
ok('4 · LA SIGARETTA INDIPENDENTE C\'È ANCORA', dopo.eventi.some((e) => e.id === idNuova));
ok('4 · le tre del lotto sono sparite', lotto.ids.every((id) => !dopo.eventi.some((e) => e.id === id)));
ok('4 · e hanno una lapide ciascuna', lotto.ids.every((id) => dopo.rimossi.includes(id)));
ok('4 · la sigaretta indipendente NON è stata seppellita', !dopo.rimossi.includes(idNuova));
ok('4 · nemmeno quella iniziale', !dopo.rimossi.includes(idPrima));

/* start e tappeViste: i due soli campi che l'istantanea deve recuperare */
ok('4 · start non finisce dopo la prima sigaretta rimasta',
  dopo.start !== null && dopo.start <= Math.min(...dopo.cigs),
  `start ${dopo.start}, prima sigaretta ${Math.min(...dopo.cigs)}`);
eq('4 · le tappe restano quelle della sigaretta indipendente, non del lotto',
  dopo.tappeViste?.ref, adesso);

/* ================================================================== */
/* 2. IL LOTTO ANNULLATO SUBITO, SENZA NIENTE IN MEZZO                 */
/* ================================================================== */
/* Il comportamento di sempre non deve cambiare: se non è successo
   niente nei quaranta secondi, annullare riporta esattamente a prima. */
{
  const b = creaApp();
  b.fuma(adesso - 5 * 3600000);
  const primaDelLotto = b.stato();
  const l = b.arretrate(3, finestra);
  const d = b.salva(togliLotto(b.stato(), l, rimuoviEvento));
  eq('lotto annullato subito · torna a una sigaretta', d.cigs.length, 1);
  eq('lotto annullato subito · start è quello di prima', d.start, primaDelLotto.start);
  eq('lotto annullato subito · le tappe tornano indietro',
    d.tappeViste?.ref, primaDelLotto.tappeViste?.ref);
}

/* ================================================================== */
/* 3. E DOPO LA SINCRONIZZAZIONE?                                      */
/* ================================================================== */
/* Le lapidi devono reggere anche quando il database ha ancora la
   versione col lotto dentro: la fusione non deve farlo tornare, e non
   deve portarsi via la sigaretta indipendente. */
{
  const CHIAVE = 'smetto:log:u1';
  const righe = new Map();
  const db = {
    async utente() { return 'u1'; },
    async leggi(uid, key) {
      const r = righe.get(`${uid}|${key}`);
      return { data: r ? { value: r.value, rev: r.rev } : null };
    },
    async aggiorna(uid, key, valore, rev) {
      const r = righe.get(`${uid}|${key}`);
      if (!r || r.rev !== rev) return { data: [] };
      r.value = valore; r.rev = rev + 1;
      return { data: [{ rev: r.rev }] };
    },
    async inserisci(uid, key, valore) {
      righe.set(`${uid}|${key}`, { value: valore, rev: 1 });
      return { data: [{ rev: 1 }] };
    },
    async cancella() { return { data: [] }; },
    async elenca() { return { data: [] }; },
  };
  const mappa = new Map();
  const locale = {
    async get(k) { const v = mappa.get(k); return v === undefined ? null : { key: k, value: v }; },
    async set(k, v) { mappa.set(k, v); return { key: k, value: v }; },
    async delete(k) { mappa.delete(k); return { key: k, deleted: true }; },
    async list(p = '') { return { keys: [...mappa.keys()].filter((x) => x.startsWith(p)), prefix: p }; },
  };
  const kv = creaKvSincronizzato({ locale, remoto: db, fondi: fondiValore, attesa: 50 });

  const c = creaApp();
  const idIniziale = c.fuma(adesso - 5 * 3600000);
  const l = c.arretrate(3, finestra);
  await kv.set(CHIAVE, JSON.stringify(c.stato()));      // il lotto arriva al database
  eq('sync · il database ha le quattro sigarette',
    righe.get(`u1|${CHIAVE}`).value.cigs.length, 4);

  const idIndipendente = c.fuma(adesso);
  const finale = c.salva(togliLotto(c.stato(), l, rimuoviEvento));
  await kv.set(CHIAVE, JSON.stringify(finale));

  const remoto = righe.get(`u1|${CHIAVE}`).value;
  eq('sync · sul database restano due sigarette', remoto.cigs.length, 2);
  ok('sync · la sigaretta indipendente è arrivata',
    remoto.eventi.some((e) => e.id === idIndipendente));
  ok('sync · quella iniziale pure', remoto.eventi.some((e) => e.id === idIniziale));

  // e una rifusione con la versione vecchia non resuscita il lotto
  const rifuso = fondiRegistri(remoto, c.stato(), vuoto);
  eq('sync · rifondendo con la versione vecchia restano due', rifuso.cigs.length, 2);
  ok('sync · il lotto non torna indietro',
    l.ids.every((id) => !rifuso.eventi.some((e) => e.id === id)));
}

console.log('');
if (falliti.length) {
  falliti.forEach((f) => console.log(`  ✗ ${f}`));
  console.log(`\n  ${passati} controlli superati, ${falliti.length} falliti\n`);
  process.exit(1);
}
console.log(`  ${passati} controlli sull'annullamento del lotto superati\n  nessun fallimento\n`);
process.exit(0);
