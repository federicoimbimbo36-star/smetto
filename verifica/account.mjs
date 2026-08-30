/* ------------------------------------------------------------------ */
/* account.mjs — «Account eliminato.» solo se è successo davvero       */
/*                                                                     */
/*   node verifica/account.mjs                                         */
/*                                                                     */
/* Prima l'esito di deleteAccount non veniva letto: senza rete la       */
/* cancellazione falliva, l'app faceva comunque il logout e mostrava    */
/* la conferma. Qui si controlla che ogni fallimento resti un           */
/* fallimento, e che quello che è riuscito venga detto a chi chiama.    */
/* ------------------------------------------------------------------ */

import { eliminaAccount } from '../src/utils/account.js';

let passati = 0;
const falliti = [];
const ok = (nome, cond, extra = '') => {
  if (cond) passati += 1;
  else falliti.push(`${nome}${extra ? `\n      ${extra}` : ''}`);
};
const eq = (nome, a, b) => ok(nome, JSON.stringify(a) === JSON.stringify(b), `atteso ${JSON.stringify(b)}, ottenuto ${JSON.stringify(a)}`);

const UID = 'u1';

/* Un'eccezione non deve far saltare tutto il banco: un'implementazione
   che lascia sfuggire l'errore È il difetto che si sta cercando, e va
   segnata come tale — non fatta esplodere in uno stack trace. */
const chiama = async (opzioni) => {
  try { return await eliminaAccount(opzioni); }
  catch (e) { return { ok: 'eccezione', rimasti: [], motivo: e?.message }; }
};

/* Il pezzo di App.jsx che decide cosa mostrare e cosa salvare. Non è
   React: è la regola, scritta come la scrive App. */
function schermata(codici, esito) {
  if (esito.ok !== true) {
    return {
      toast: 'Non è stato possibile eliminare l’account. Controlla la rete e riprova.',
      logout: false,
      gruppiSalvati: esito.rimasti.length !== codici.length ? esito.rimasti : null,
    };
  }
  return { toast: 'Account eliminato.', logout: true, gruppiSalvati: null };
}

const gruppiOk = { async leave() { return {}; } };
const gruppiRotti = { async leave() { return { error: 'network' }; } };
const gruppiCheLanciano = { async leave() { throw new TypeError('fetch failed'); } };
const gruppiParziali = (falliscono) => ({
  async leave(code) { return falliscono.includes(code) ? { error: 'network' } : {}; },
});

const authOk = { async deleteAccount() { return {}; } };
const authNiente = { async deleteAccount() { /* localAuth non restituisce niente */ } };
const authRotto = { async deleteAccount() { return { error: 'rete non disponibile' }; } };
const authCheLancia = { async deleteAccount() { throw new TypeError('fetch failed'); } };

/* ================================================================== */
/* 1. CANCELLAZIONE RIUSCITA                                           */
/* ================================================================== */
{
  const codici = ['ABC234', 'DEF567'];
  const e = await chiama({ codici, uid: UID, groups: gruppiOk, auth: authOk });
  ok('riuscita · l\'esito è positivo', e.ok === true);
  eq('riuscita · non resta nessun gruppo', e.rimasti, []);
  const s = schermata(codici, e);
  eq('riuscita · si dice che è stato eliminato', s.toast, 'Account eliminato.');
  ok('riuscita · e si esce dall\'account', s.logout === true);
}
{
  // localAuth.deleteAccount non restituisce niente: deve valere come riuscita
  const e = await chiama({ codici: [], uid: UID, groups: gruppiOk, auth: authNiente });
  ok('riuscita · anche quando deleteAccount non restituisce nulla', e.ok === true);
}

/* ================================================================== */
/* 2. CANCELLAZIONE FALLITA                                            */
/* ================================================================== */
{
  const codici = ['ABC234'];
  const e = await chiama({ codici, uid: UID, groups: gruppiOk, auth: authRotto });
  ok('fallita · l\'esito è negativo', e.ok === false);
  const s = schermata(codici, e);
  ok('fallita · NON si dice che è stato eliminato', s.toast !== 'Account eliminato.');
  ok('fallita · non si esce dall\'account', s.logout === false);
  eq('fallita · ma le uscite riuscite vengono registrate', s.gruppiSalvati, []);
}

/* ================================================================== */
/* 3. RETE ASSENTE                                                     */
/* ================================================================== */
{
  // la rete cade sull'uscita dai gruppi: non si prova nemmeno a cancellare
  const codici = ['ABC234', 'DEF567'];
  const e = await chiama({ codici, uid: UID, groups: gruppiRotti, auth: authOk });
  ok('rete assente · l\'esito è negativo', e.ok === false);
  eq('rete assente · il motivo è l\'uscita dai gruppi', e.motivo, 'gruppi');
  eq('rete assente · nessun gruppo è stato lasciato', e.rimasti, codici);
  const s = schermata(codici, e);
  ok('rete assente · nessuna falsa conferma', s.toast !== 'Account eliminato.');
  ok('rete assente · la lista dei gruppi non viene toccata', s.gruppiSalvati === null);
}
{
  // la rete cade lanciando invece di restituire un errore
  const e = await chiama({ codici: ['ABC234'], uid: UID, groups: gruppiCheLanciano, auth: authOk });
  ok('rete assente · un\'eccezione vale come fallimento', e.ok === false);
}
{
  const e = await chiama({ codici: [], uid: UID, groups: gruppiOk, auth: authCheLancia });
  ok('rete assente · vale anche se a lanciare è deleteAccount', e.ok === false);
}

/* ================================================================== */
/* 4. STATO DOPO IL FALLIMENTO                                         */
/* ================================================================== */
{
  // uscito da uno dei due gruppi, poi la cancellazione fallisce:
  // la lista locale deve restare coerente con quello che è successo
  const codici = ['ABC234', 'DEF567'];
  const e = await chiama({ codici, uid: UID, groups: gruppiOk, auth: authRotto });
  const s = schermata(codici, e);
  eq('stato dopo · la lista dei gruppi viene svuotata perché è uscito davvero',
    s.gruppiSalvati, []);
  ok('stato dopo · e l\'account resta attivo', s.logout === false);
}
{
  const codici = ['ABC234', 'DEF567'];
  const e = await chiama({
    codici, uid: UID, groups: gruppiParziali(['DEF567']), auth: authOk,
  });
  ok('stato dopo · un\'uscita fallita ferma tutto', e.ok === false);
  eq('stato dopo · e dice da quale gruppo non si è usciti', e.rimasti, ['DEF567']);
  const s = schermata(codici, e);
  eq('stato dopo · la lista locale tiene solo quello rimasto', s.gruppiSalvati, ['DEF567']);
}
{
  // nessun gruppo: la sequenza deve funzionare comunque
  const e = await chiama({ codici: [], uid: UID, groups: gruppiRotti, auth: authOk });
  ok('senza gruppi · si arriva alla cancellazione', e.ok === true);
}

console.log('');
if (falliti.length) {
  falliti.forEach((f) => console.log(`  ✗ ${f}`));
  console.log(`\n  ${passati} controlli superati, ${falliti.length} falliti\n`);
  process.exit(1);
}
console.log(`  ${passati} controlli sull'eliminazione account superati\n  nessun fallimento\n`);
process.exit(0);
