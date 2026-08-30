/* ------------------------------------------------------------------ */
/* gruppi.mjs — un errore di rete non è una risposta                   */
/*                                                                     */
/*   node verifica/gruppi.mjs                                          */
/*                                                                     */
/* Questo file ha bisogno di node_modules (importa src/data/groups.js,  */
/* che importa il client Supabase). Gli altri controlli girano su Node  */
/* nudo; questo no, ed è il prezzo per provare il codice VERO invece    */
/* di una sua copia.                                                    */
/*                                                                     */
/* Il client non viene sostituito né aggirato: si sostituisce `fetch`,  */
/* cioè l'unica porta da cui esce davvero qualcosa. Così passano per il */
/* banco anche postgrest, il parsing della risposta e `maybeSingle()` — */
/* che è esattamente il pezzo in cui «zero righe» e «query fallita»     */
/* venivano confusi.                                                    */
/*                                                                     */
/* I tre stati da tenere separati:                                      */
/*   A. il gruppo esiste                                                */
/*   B. il gruppo non esiste più (o ne siamo stati tolti)               */
/*   C. non si sa: la domanda non è arrivata a destinazione             */
/* ------------------------------------------------------------------ */

import groups, { smista } from '../src/data/groups.js';

let passati = 0;
const falliti = [];
const ok = (nome, cond, extra = '') => {
  if (cond) passati += 1;
  else falliti.push(`${nome}${extra ? `\n      ${extra}` : ''}`);
};
const eq = (nome, a, b) => ok(nome, JSON.stringify(a) === JSON.stringify(b), `atteso ${JSON.stringify(b)}, ottenuto ${JSON.stringify(a)}`);

/* ---------- la porta da cui esce tutto ---------- */
const fetchVero = globalThis.fetch;
const risposta = (corpo, status = 200) => new Response(JSON.stringify(corpo), {
  status,
  headers: { 'Content-Type': 'application/json' },
});
const rispondi = (fn) => { globalThis.fetch = async (...a) => fn(...a); };
const rete = { giu: () => { globalThis.fetch = async () => { throw new TypeError('fetch failed'); }; } };

const RIGA = {
  code: 'ABC234',
  name: 'Casa',
  owner_id: 'u1',
  created_at: '2026-08-01T10:00:00Z',
  group_members: [{ user_id: 'u1', name: 'Tu', color: '#286B5A', joined_at: '2026-08-01T10:00:00Z' }],
};

/* ================================================================== */
/* 1. fetch — i tre stati                                              */
/* ================================================================== */
{
  rispondi(() => risposta(RIGA));           // maybeSingle: una riga sola
  const a = await groups.fetch('ABC234');
  ok('fetch · gruppo esistente: la lettura è riuscita', a?.ok === true);
  ok('fetch · gruppo esistente: il gruppo c\'è', a?.gruppo?.code === 'ABC234');
  eq('fetch · gruppo esistente: i membri sono composti', a?.gruppo?.members?.length, 1);
}
{
  rispondi(() => risposta(null));           // zero righe: risposta valida
  const b = await groups.fetch('ZZZ999');
  ok('fetch · gruppo inesistente: la lettura è riuscita', b?.ok === true);
  ok('fetch · gruppo inesistente: e dice che non c\'è', b?.gruppo === null);
}
{
  rete.giu();
  const c = await groups.fetch('ABC234');
  ok('fetch · rete giù: la lettura NON è riuscita', c?.ok === false);
  ok('fetch · rete giù: non si pronuncia sul gruppo', c?.gruppo === undefined);
}
{
  rispondi(() => risposta({ message: 'permission denied' }, 403));
  const d = await groups.fetch('ABC234');
  ok('fetch · errore del database: la lettura NON è riuscita', d?.ok === false);
  ok('fetch · errore del database: non si pronuncia sul gruppo', d?.gruppo === undefined);
}

/* ================================================================== */
/* 2. mine — lista vuota ≠ lettura fallita                             */
/* ================================================================== */
{
  rispondi(() => risposta([RIGA]));
  const a = await groups.mine();
  ok('mine · con un gruppo: lettura riuscita', a?.ok === true);
  eq('mine · con un gruppo: lo restituisce', a?.gruppi?.map((g) => g.code), ['ABC234']);
}
{
  rispondi(() => risposta([]));
  const b = await groups.mine();
  ok('mine · nessun gruppo: lettura riuscita', b?.ok === true);
  eq('mine · nessun gruppo: lista vuota, ed è una risposta', b?.gruppi, []);
}
{
  rete.giu();
  const c = await groups.mine();
  ok('mine · rete giù: lettura NON riuscita', c?.ok === false);
  ok('mine · rete giù: chi chiama sa che non deve fidarsi della lista', c?.ok === false && c?.gruppi?.length === 0);
}

/* ================================================================== */
/* 3. fetchMembers — classifica vuota ≠ classifica non letta           */
/* ================================================================== */
{
  rispondi(() => risposta([{ user_id: 'u2', name: 'Ada', color: '#2F6470', days: {}, resists: {}, checkins: {}, total: 0 }]));
  const a = await groups.fetchMembers('ABC234');
  ok('fetchMembers · lettura riuscita', a?.ok === true && a?.membri?.length === 1);
}
{
  rete.giu();
  const b = await groups.fetchMembers('ABC234');
  ok('fetchMembers · rete giù: lettura NON riuscita', b?.ok === false);
}

globalThis.fetch = fetchVero;

/* ================================================================== */
/* 4. LA REGOLA: un errore non toglie mai un gruppo dalla lista        */
/* ================================================================== */
/* `smista` è la funzione pura che App.jsx usa dentro sync() per
   decidere chi resta e chi viene tolto. Qui non serve né rete né React:
   si passano gli esiti e si guarda la decisione. */
{
  const r = smista(['A', 'B', 'C'], {
    A: { ok: true, gruppo: { code: 'A' } },
    B: { ok: true, gruppo: null },
    C: { ok: false },
  });
  eq('smista · il gruppo che c\'è è vivo', r.vivi, ['A']);
  eq('smista · il gruppo che non c\'è più è morto', r.morti, ['B']);
  eq('smista · il gruppo non letto è incerto', r.incerti, ['C']);
}
{
  // il caso del bug: tutte le letture falliscono
  const r = smista(['A', 'B'], { A: { ok: false }, B: { ok: false } });
  eq('ERRORE DI RETE · nessun gruppo viene dichiarato morto', r.morti, []);
  eq('ERRORE DI RETE · restano tutti incerti', r.incerti, ['A', 'B']);
  ok('ERRORE DI RETE · quindi la lista locale non perde niente',
    ['A', 'B'].filter((c) => !r.morti.includes(c)).length === 2);
}
{
  // esito mancante del tutto (chiamata mai partita): incerto, non morto
  const r = smista(['A'], {});
  eq('esito mancante · incerto e non morto', [r.morti, r.incerti], [[], ['A']]);
}
{
  // e quando il gruppo è DAVVERO sciolto, il codice deve uscire
  const r = smista(['A', 'B'], { A: { ok: true, gruppo: { code: 'A' } }, B: { ok: true, gruppo: null } });
  eq('gruppo sciolto · viene tolto dalla lista', ['A', 'B'].filter((c) => !r.morti.includes(c)), ['A']);
}

console.log('');
if (falliti.length) {
  falliti.forEach((f) => console.log(`  ✗ ${f}`));
  console.log(`\n  ${passati} controlli superati, ${falliti.length} falliti\n`);
  process.exit(1);
}
console.log(`  ${passati} controlli sui gruppi superati\n  nessun fallimento\n`);
process.exit(0);
