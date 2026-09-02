/* ------------------------------------------------------------------ */
/* account.mjs — eliminare l'account, e dirlo solo se è vero            */
/*                                                                     */
/*   node verifica/account.mjs                                         */
/*                                                                     */
/* Due difetti, trovati a distanza di due fasi, che sono lo stesso      */
/* difetto: l'app diceva più di quello che era successo.                */
/*                                                                     */
/*  · l'esito di `deleteAccount` non veniva letto: senza rete la        */
/*    cancellazione falliva, l'app faceva comunque il logout e mostrava */
/*    la conferma;                                                      */
/*  · la cancellazione remota riusciva, ma `smetto:log:<uid>` e         */
/*    `smetto:seen:<uid>` — quante sigarette, quando, dopo cosa —       */
/*    restavano in chiaro sul dispositivo, insieme alle scritture       */
/*    ancora in coda, sotto la scritta «Account eliminato.».            */
/*                                                                     */
/* La pulizia si prova con il MOTORE VERO (`creaKvSincronizzato`), non  */
/* con una finta: la coda ha due copie — memoria e disco — e una prova  */
/* che ne guardasse una sola non dimostrerebbe niente.                  */
/* ------------------------------------------------------------------ */

import { eliminaAccount, messaggioEliminazione, MESSAGGI } from '../src/utils/account.js';
import { creaKvSincronizzato, CHIAVE_CODA } from '../src/utils/sincronizza.js';
import { dimenticaUtenteSulDispositivo } from '../src/utils/puliziaLocale.js';
import {
  rimuoviMarcatoreDi, scriviMarcatore, leggiMarcatore, ispezionaMarcatore, CHIAVE_MARCATORE,
} from '../src/utils/marcatoreLogout.js';
import { fondiValore } from '../src/utils/fusione.js';
import { logKey, seenKey, uidDaChiave } from '../src/constants.js';

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
   React: è la regola, scritta come la scrive App — e il messaggio lo
   sceglie la funzione vera, così la frase e l'esito non possono
   divergere senza che qui si veda. */
function schermata(codici, esito) {
  if (esito.ok !== true) {
    return {
      toast: messaggioEliminazione(esito),
      logout: false,
      gruppiSalvati: esito.rimasti.length !== codici.length ? esito.rimasti : null,
    };
  }
  return { toast: messaggioEliminazione(esito), logout: true, gruppiSalvati: null };
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

/* una pulizia che riesce sempre, per i casi in cui non è lei l'oggetto
   della prova */
const puliziaOk = async () => ({ ok: true, rimosse: [], rimaste: [], motivo: null });

/* ================================================================== */
/* 1. CANCELLAZIONE RIUSCITA                                           */
/* ================================================================== */
{
  const codici = ['ABC234', 'DEF567'];
  const e = await chiama({
    codici, uid: UID, groups: gruppiOk, auth: authOk, pulisci: puliziaOk,
  });
  ok('riuscita · l\'esito è positivo', e.ok === true);
  eq('riuscita · non resta nessun gruppo', e.rimasti, []);
  const s = schermata(codici, e);
  eq('riuscita · si dice che è stato eliminato', s.toast, MESSAGGI.eliminato);
  ok('riuscita · e si esce dall\'account', s.logout === true);
}
{
  // localAuth.deleteAccount non restituisce niente: deve valere come riuscita
  const e = await chiama({
    codici: [], uid: UID, groups: gruppiOk, auth: authNiente, pulisci: puliziaOk,
  });
  ok('riuscita · anche quando deleteAccount non restituisce nulla', e.ok === true);
}

/* ================================================================== */
/* 2. CANCELLAZIONE FALLITA                                            */
/* ================================================================== */
{
  const codici = ['ABC234'];
  const e = await chiama({
    codici, uid: UID, groups: gruppiOk, auth: authRotto, pulisci: puliziaOk,
  });
  ok('fallita · l\'esito è negativo', e.ok === false);
  const s = schermata(codici, e);
  ok('fallita · NON si dice che è stato eliminato', s.toast !== MESSAGGI.eliminato);
  eq('fallita · si dice di riprovare', s.toast, MESSAGGI.nonEliminato);
  ok('fallita · non si esce dall\'account', s.logout === false);
  eq('fallita · ma le uscite riuscite vengono registrate', s.gruppiSalvati, []);
}

/* ================================================================== */
/* 3. RETE ASSENTE                                                     */
/* ================================================================== */
{
  // la rete cade sull'uscita dai gruppi: non si prova nemmeno a cancellare
  const codici = ['ABC234', 'DEF567'];
  const e = await chiama({
    codici, uid: UID, groups: gruppiRotti, auth: authOk, pulisci: puliziaOk,
  });
  ok('rete assente · l\'esito è negativo', e.ok === false);
  eq('rete assente · il motivo è l\'uscita dai gruppi', e.motivo, 'gruppi');
  eq('rete assente · nessun gruppo è stato lasciato', e.rimasti, codici);
  const s = schermata(codici, e);
  ok('rete assente · nessuna falsa conferma', s.toast !== MESSAGGI.eliminato);
  ok('rete assente · la lista dei gruppi non viene toccata', s.gruppiSalvati === null);
}
{
  // la rete cade lanciando invece di restituire un errore
  const e = await chiama({
    codici: ['ABC234'], uid: UID, groups: gruppiCheLanciano, auth: authOk, pulisci: puliziaOk,
  });
  ok('rete assente · un\'eccezione vale come fallimento', e.ok === false);
}
{
  const e = await chiama({
    codici: [], uid: UID, groups: gruppiOk, auth: authCheLancia, pulisci: puliziaOk,
  });
  ok('rete assente · vale anche se a lanciare è deleteAccount', e.ok === false);
}

/* ================================================================== */
/* 4. STATO DOPO IL FALLIMENTO                                         */
/* ================================================================== */
{
  // uscito da uno dei due gruppi, poi la cancellazione fallisce:
  // la lista locale deve restare coerente con quello che è successo
  const codici = ['ABC234', 'DEF567'];
  const e = await chiama({
    codici, uid: UID, groups: gruppiOk, auth: authRotto, pulisci: puliziaOk,
  });
  const s = schermata(codici, e);
  eq('stato dopo · la lista dei gruppi viene svuotata perché è uscito davvero',
    s.gruppiSalvati, []);
  ok('stato dopo · e l\'account resta attivo', s.logout === false);
}
{
  const codici = ['ABC234', 'DEF567'];
  const e = await chiama({
    codici, uid: UID, groups: gruppiParziali(['DEF567']), auth: authOk, pulisci: puliziaOk,
  });
  ok('stato dopo · un\'uscita fallita ferma tutto', e.ok === false);
  eq('stato dopo · e dice da quale gruppo non si è usciti', e.rimasti, ['DEF567']);
  const s = schermata(codici, e);
  eq('stato dopo · la lista locale tiene solo quello rimasto', s.gruppiSalvati, ['DEF567']);
}
{
  // nessun gruppo: la sequenza deve funzionare comunque
  const e = await chiama({
    codici: [], uid: UID, groups: gruppiRotti, auth: authOk, pulisci: puliziaOk,
  });
  ok('senza gruppi · si arriva alla cancellazione', e.ok === true);
}

/* ================================================================== */
/*  DA QUI: LE COPIE LOCALI DEI DATI SANITARI                          */
/* ================================================================== */

const A = 'utente-A';
const B = 'utente-B';

/* Il dispositivo: uno solo, condiviso da tutti gli account che ci sono
   passati.

   Due modi di rompersi, e sono diversi:
    · `lancia` — l'operazione esplode. Facile da vedere.
    · `finge`  — l'operazione RISOLVE E NON PERSISTE. È il caso vero e
      cattivo: quota superata, storage in sola lettura, navigazione
      privata, un adattatore che ingoia. Nessuna eccezione, nessun
      valore di ritorno diverso — solo il disco che non è cambiato. È
      esattamente il difetto per cui questa revisione esiste, e l'unico
      modo di scoprirlo è rileggere. */
function creaDispositivo(m = new Map()) {
  const guasto = { lancia: new Set(), finge: new Set(), list: null, get: null };
  return {
    mappa: m,
    guasto,
    async get(k) {
      if (guasto.get) throw new Error(guasto.get);
      const v = m.get(k); return v === undefined ? null : { key: k, value: v };
    },
    async set(k, v) {
      if (guasto.lancia.has(k)) throw new Error('storage negato');
      if (guasto.finge.has(k)) return { key: k, value: v };      // risolve, non scrive
      m.set(k, v); return { key: k, value: v };
    },
    async delete(k) {
      if (guasto.lancia.has(k)) throw new Error('storage negato');
      if (guasto.finge.has(k)) return { key: k, deleted: true }; // risolve, non cancella
      m.delete(k); return { key: k, deleted: true };
    },
    async list(p = '') {
      if (guasto.list) throw new Error(guasto.list);
      return { keys: [...m.keys()].filter((x) => x.startsWith(p)), prefix: p };
    },
  };
}

/* `localStorage`, dove sta il marcatore di logout. `sordo` non solleva e
   non cancella: la stessa bugia dello storage che finge. */
function creaAmbiente({ sordo = false } = {}) {
  const m = new Map();
  return {
    mappa: m,
    localStorage: {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => { m.set(k, String(v)); },
      removeItem: (k) => { if (!sordo) m.delete(k); },
    },
  };
}

/* Il database, spento: tutto quello che si scrive resta sul dispositivo
   e finisce in coda, che è esattamente lo stato che la cancellazione
   dell'account deve sapersi portare via. */
function creaDbSpento() {
  let dentro = null;
  return {
    entra: (u) => { dentro = u; },
    api: {
      async utente() { return dentro; },
      async leggi() { return { error: new Error('offline') }; },
      async aggiorna() { return { error: new Error('offline') }; },
      async inserisci() { return { error: new Error('offline') }; },
      async cancella() { return { error: new Error('offline') }; },
      async elenca() { return { data: [] }; },
    },
  };
}

const registro = (n) => JSON.stringify({ v: 9, cigs: Array.from({ length: n }, (_, i) => i) });

/* Due account sullo stesso telefono, tutti e due con registro, «già
   visti» e le scritture ancora in coda. Restituisce anche il motore,
   perché è lui a esporre `dimenticaUtente`. */
async function dispositivoCondiviso({ togliMarcatore = null } = {}) {
  const db = creaDbSpento();
  const locale = creaDispositivo();
  const kv = creaKvSincronizzato({
    locale, remoto: db.api, fondi: fondiValore, attesa: 30, uidDaChiave, togliMarcatore,
  });

  db.entra(A);
  await kv.set(logKey(A), registro(12));
  await kv.set(seenKey(A), JSON.stringify({ 'amico-1': 1700000000000 }));
  db.entra(B);
  await kv.set(logKey(B), registro(3));
  await kv.set(seenKey(B), JSON.stringify({ 'amico-2': 1700000000000 }));
  db.entra(null);

  return { db, locale, kv };
}

/* Un dispositivo la cui coda è GIÀ rotta quando il motore la legge per
   la prima volta. Serve perché l'ordine conta: una coda rotta trovata da
   un motore che ha già la sua copia in memoria viene semplicemente
   riscritta, e il caso non si presenta. */
function dispositivoConCodaRotta(contenuto) {
  const db = creaDbSpento();
  const locale = creaDispositivo(new Map([
    [logKey(A), registro(5)],
    [seenKey(A), '{}'],
    [logKey(B), registro(2)],
    [CHIAVE_CODA, contenuto],
  ]));
  const kv = creaKvSincronizzato({
    locale, remoto: db.api, fondi: fondiValore, attesa: 30, uidDaChiave,
  });
  return { db, locale, kv };
}

const codaSuDisco = (locale) => {
  const grezzo = locale.mappa.get(CHIAVE_CODA);
  return grezzo ? JSON.parse(grezzo).map(([k]) => k) : [];
};

/* ================================================================== */
/* 5. CANCELLAZIONE RIUSCITA → LE COPIE LOCALI SE NE VANNO             */
/* ================================================================== */
{
  const { locale, kv } = await dispositivoCondiviso();

  // il difetto, prima: tutto questo restava sul telefono
  ok('prima · il registro di A è sul dispositivo', locale.mappa.has(logKey(A)));
  ok('prima · e anche i suoi «già visti»', locale.mappa.has(seenKey(A)));
  ok('prima · con due scritture di A in coda',
    codaSuDisco(locale).includes(logKey(A)) && codaSuDisco(locale).includes(seenKey(A)));

  const e = await chiama({
    codici: [], uid: A, groups: gruppiOk, auth: authOk, pulisci: kv.dimenticaUtente,
  });

  ok('pulizia · l\'eliminazione è riuscita', e.ok === true);
  ok('pulizia · e la pulizia locale pure', e.pulizia?.ok === true, JSON.stringify(e.pulizia));
  ok('pulizia · il registro di A non è più sul dispositivo', !locale.mappa.has(logKey(A)));
  ok('pulizia · nemmeno i suoi «già visti»', !locale.mappa.has(seenKey(A)));
  eq('pulizia · e nemmeno le sue voci in coda',
    codaSuDisco(locale).filter((k) => uidDaChiave(k) === A), []);
  ok('pulizia · la coda in memoria non le tiene in vita',
    kv.inSospeso() === 2, `in sospeso: ${kv.inSospeso()}`);
  eq('pulizia · si dice che è stato eliminato', schermata([], e).toast, MESSAGGI.eliminato);
}
{
  /* La controprova che il difetto era vero: senza pulizia le chiavi
     restano dov'erano. È il comportamento di prima, e adesso ha almeno
     un messaggio che non promette il contrario. */
  const { locale } = await dispositivoCondiviso();
  const e = await chiama({ codici: [], uid: A, groups: gruppiOk, auth: authOk });
  ok('controprova · senza pulizia il registro resta sul dispositivo',
    locale.mappa.has(logKey(A)));
  ok('controprova · e non si promette un dispositivo pulito',
    messaggioEliminazione(e) !== MESSAGGI.eliminato);
  eq('controprova · il motivo è che non è stata tentata', e.pulizia?.motivo, 'non-tentata');
}

/* ================================================================== */
/* 6. L'ALTRO ACCOUNT DELLO STESSO TELEFONO NON SI TOCCA               */
/* ================================================================== */
{
  const { locale, kv } = await dispositivoCondiviso();
  const registroB = locale.mappa.get(logKey(B));
  const vistiB = locale.mappa.get(seenKey(B));

  await chiama({
    codici: [], uid: A, groups: gruppiOk, auth: authOk, pulisci: kv.dimenticaUtente,
  });

  eq('altro account · il registro di B è intatto', locale.mappa.get(logKey(B)), registroB);
  eq('altro account · e anche i suoi «già visti»', locale.mappa.get(seenKey(B)), vistiB);
  ok('altro account · le sue scritture restano in coda ad aspettarlo',
    codaSuDisco(locale).includes(logKey(B)) && codaSuDisco(locale).includes(seenKey(B)));
  ok('altro account · e restano attribuite a lui',
    JSON.parse(locale.mappa.get(CHIAVE_CODA)).every(([, v]) => v.uid === B));
}
{
  // e il contrario: cancellare B non porta via A
  const { locale, kv } = await dispositivoCondiviso();
  await chiama({
    codici: [], uid: B, groups: gruppiOk, auth: authOk, pulisci: kv.dimenticaUtente,
  });
  ok('altro account · cancellare B lascia il registro di A', locale.mappa.has(logKey(A)));
  ok('altro account · e toglie quello di B', !locale.mappa.has(logKey(B)));
}

/* ================================================================== */
/* 7. CANCELLAZIONE REMOTA FALLITA → NON SI TOCCA NIENTE               */
/* ================================================================== */
{
  const { locale, kv } = await dispositivoCondiviso();
  const prima = new Map(locale.mappa);

  const e = await chiama({
    codici: [], uid: A, groups: gruppiOk, auth: authRotto, pulisci: kv.dimenticaUtente,
  });

  ok('remota fallita · l\'esito è negativo', e.ok === false);
  ok('remota fallita · la pulizia non è stata nemmeno tentata', e.pulizia === undefined);
  ok('remota fallita · il registro di A è ancora suo',
    locale.mappa.get(logKey(A)) === prima.get(logKey(A)));
  ok('remota fallita · i «già visti» pure',
    locale.mappa.get(seenKey(A)) === prima.get(seenKey(A)));
  ok('remota fallita · la coda non è stata toccata',
    locale.mappa.get(CHIAVE_CODA) === prima.get(CHIAVE_CODA));
  eq('remota fallita · nessuna falsa conferma', messaggioEliminazione(e), MESSAGGI.nonEliminato);
}
{
  // stessa cosa se ci si ferma prima, all'uscita dai gruppi: niente
  // viene portato via dal telefono
  const { locale, kv } = await dispositivoCondiviso();
  const e = await chiama({
    codici: ['ABC234'], uid: A, groups: gruppiRotti, auth: authOk, pulisci: kv.dimenticaUtente,
  });
  ok('remota fallita · fermarsi ai gruppi non cancella niente in locale',
    locale.mappa.has(logKey(A)) && locale.mappa.has(seenKey(A)));
  ok('remota fallita · e non si dice eliminato', messaggioEliminazione(e) !== MESSAGGI.eliminato);
}

/* ================================================================== */
/* 8. PULIZIA LOCALE FALLITA DOPO UNA CANCELLAZIONE RIUSCITA           */
/*                                                                     */
/*    Il caso scomodo: l'account non c'è più davvero, ma sul telefono   */
/*    è rimasto qualcosa. Non si torna indietro e non si mente: si dice */
/*    com'è.                                                           */
/* ================================================================== */
{
  const { locale, kv } = await dispositivoCondiviso();
  locale.guasto.lancia.add(logKey(A));       // lo storage rifiuta quella chiave

  const e = await chiama({
    codici: [], uid: A, groups: gruppiOk, auth: authOk, pulisci: kv.dimenticaUtente,
  });

  ok('pulizia fallita · l\'account risulta comunque eliminato', e.ok === true);
  ok('pulizia fallita · ma la pulizia no', e.pulizia?.ok === false);
  eq('pulizia fallita · e dice cosa è rimasto', e.pulizia?.rimaste, [logKey(A)]);
  ok('pulizia fallita · quello che si poteva togliere è stato tolto',
    !locale.mappa.has(seenKey(A)));
  const s = schermata([], e);
  ok('pulizia fallita · NON si promette un dispositivo pulito', s.toast !== MESSAGGI.eliminato);
  eq('pulizia fallita · si dice che qualcosa può essere rimasto',
    s.toast, MESSAGGI.eliminatoConResidui);
  ok('pulizia fallita · e si esce comunque dall\'account', s.logout === true);
  ok('pulizia fallita · il registro di B resta intatto', locale.mappa.has(logKey(B)));
}
{
  // lo storage non risponde affatto: non si sa nemmeno cosa ci sia
  const { locale, kv } = await dispositivoCondiviso();
  locale.guasto.list = 'storage negato';
  const e = await chiama({
    codici: [], uid: A, groups: gruppiOk, auth: authOk, pulisci: kv.dimenticaUtente,
  });
  ok('pulizia fallita · senza elenco non si promette niente', e.pulizia?.ok === false);
  eq('pulizia fallita · e si dice perché', e.pulizia?.motivo, 'elenco');
  ok('pulizia fallita · non si cancella alla cieca', locale.mappa.has(logKey(A)));
  ok('pulizia fallita · messaggio coerente',
    messaggioEliminazione(e) === MESSAGGI.eliminatoConResidui);
}
{
  // la pulizia lancia invece di restituire un esito
  const e = await chiama({
    codici: [],
    uid: A,
    groups: gruppiOk,
    auth: authOk,
    pulisci: async () => { throw new TypeError('storage sparito'); },
  });
  ok('pulizia fallita · un\'eccezione non diventa una conferma', e.pulizia?.ok === false);
  ok('pulizia fallita · e non ribalta l\'esito remoto, che è vero', e.ok === true);
  ok('pulizia fallita · messaggio coerente',
    messaggioEliminazione(e) === MESSAGGI.eliminatoConResidui);
}
{
  // una pulizia che non restituisce niente non vale come riuscita
  const e = await chiama({
    codici: [], uid: A, groups: gruppiOk, auth: authOk, pulisci: async () => {},
  });
  eq('pulizia fallita · senza esito non si dà per buona', e.pulizia?.motivo, 'senza-esito');
}

/* ================================================================== */
/* 9. LA FUNZIONE DI PULIZIA, PRESA DA SOLA                            */
/* ================================================================== */
{
  // il percorso senza database (localeSolo): stessa funzione, niente coda
  const locale = creaDispositivo(new Map([
    [logKey(A), registro(4)],
    [seenKey(A), '{}'],
    [logKey(B), registro(9)],
    ['smetto:altro', 'roba senza proprietario'],
  ]));
  const e = await dimenticaUtenteSulDispositivo({
    uid: A, locale, uidDaChiave, chiaveCoda: CHIAVE_CODA,
  });
  ok('pulizia diretta · riesce', e.ok === true);
  eq('pulizia diretta · toglie le due chiavi di A',
    [...e.rimosse].sort(), [logKey(A), seenKey(A)].sort());
  ok('pulizia diretta · lascia B', locale.mappa.has(logKey(B)));
  ok('pulizia diretta · e lascia le chiavi senza proprietario',
    locale.mappa.has('smetto:altro'));
}
{
  // senza utente non si cancella niente: un uid vuoto non deve diventare
  // «porta via tutto quello che non ha un proprietario»
  const locale = creaDispositivo(new Map([[logKey(A), registro(4)]]));
  const e = await dimenticaUtenteSulDispositivo({
    uid: null, locale, uidDaChiave, chiaveCoda: CHIAVE_CODA,
  });
  ok('pulizia diretta · senza utente non riesce', e.ok === false);
  eq('pulizia diretta · e non tocca niente', locale.mappa.size, 1);
}
{
  // voci di coda nel formato vecchio, [chiave, valore]: il proprietario
  // si ricava dalla chiave, altrimenti sopravvivrebbero alla loro persona
  const locale = creaDispositivo(new Map([
    [logKey(A), registro(4)],
    [CHIAVE_CODA, JSON.stringify([[logKey(A), registro(4)], [logKey(B), registro(1)]])],
  ]));
  const e = await dimenticaUtenteSulDispositivo({
    uid: A, locale, uidDaChiave, chiaveCoda: CHIAVE_CODA,
  });
  ok('coda vecchia · la pulizia riesce', e.ok === true);
  const restanti = JSON.parse(locale.mappa.get(CHIAVE_CODA)).map(([k]) => k);
  eq('coda vecchia · la voce di A sparisce anche senza uid scritto', restanti, [logKey(B)]);
}
{
  // la chiave della coda non appartiene a nessuno e non si cancella per sbaglio
  const locale = creaDispositivo(new Map([
    [logKey(A), registro(4)],
    [CHIAVE_CODA, JSON.stringify([[logKey(B), { uid: B, value: registro(1) }]])],
  ]));
  await dimenticaUtenteSulDispositivo({ uid: A, locale, uidDaChiave, chiaveCoda: CHIAVE_CODA });
  ok('coda · resta se dentro c\'è roba di un altro', locale.mappa.has(CHIAVE_CODA));
}

/* ================================================================== */
/* 10. LO STORAGE CHE RISOLVE SENZA PERSISTERE                         */
/*                                                                     */
/*     Il difetto di questa revisione. `set`/`delete` sulla coda        */
/*     rispondevano bene e non scrivevano niente; la pulizia diceva     */
/*     `ok: true` e la verifica finale non guardava la coda, perché la  */
/*     sua chiave non appartiene a nessuno. Risultato: «Account         */
/*     eliminato.» con una voce di quell'utente ancora sul telefono,    */
/*     pronta a rimettere in circolo i suoi dati al riavvio.            */
/* ================================================================== */
{
  // coda con A e B: si riscrive tenendo B → `set` finge
  const { locale, kv } = await dispositivoCondiviso();
  locale.guasto.finge.add(CHIAVE_CODA);

  const e = await chiama({
    codici: [], uid: A, groups: gruppiOk, auth: authOk, pulisci: kv.dimenticaUtente,
  });

  ok('set che finge · l\'account è eliminato davvero', e.ok === true);
  ok('set che finge · ma la pulizia NON è riuscita', e.pulizia?.ok === false,
    JSON.stringify(e.pulizia));
  ok('set che finge · la coda è nominata fra i residui',
    e.pulizia?.rimaste.includes(CHIAVE_CODA), JSON.stringify(e.pulizia?.rimaste));
  eq('set che finge · e il motivo è la coda', e.pulizia?.motivo, 'coda');
  ok('set che finge · la voce di A è effettivamente ancora lì',
    codaSuDisco(locale).includes(logKey(A)));
  ok('set che finge · le chiavi che si potevano togliere sono state tolte',
    !locale.mappa.has(logKey(A)) && !locale.mappa.has(seenKey(A)));
  ok('set che finge · B resta intatto',
    locale.mappa.has(logKey(B)) && locale.mappa.has(seenKey(B))
    && codaSuDisco(locale).includes(logKey(B)));
  eq('set che finge · niente falsa promessa di dispositivo pulito',
    messaggioEliminazione(e), MESSAGGI.eliminatoConResidui);
}
{
  // coda con il solo A: si cancellerebbe la chiave → `delete` finge
  const db = creaDbSpento();
  const locale = creaDispositivo();
  const kv = creaKvSincronizzato({
    locale, remoto: db.api, fondi: fondiValore, attesa: 30, uidDaChiave,
  });
  db.entra(A);
  await kv.set(logKey(A), registro(7));
  db.entra(null);
  eq('delete che finge · in coda c\'è solo A', codaSuDisco(locale), [logKey(A)]);

  locale.guasto.finge.add(CHIAVE_CODA);
  const e = await chiama({
    codici: [], uid: A, groups: gruppiOk, auth: authOk, pulisci: kv.dimenticaUtente,
  });

  ok('delete che finge · l\'account è eliminato davvero', e.ok === true);
  ok('delete che finge · ma la pulizia NON è riuscita', e.pulizia?.ok === false);
  ok('delete che finge · la voce di A è ancora sul disco',
    codaSuDisco(locale).includes(logKey(A)));
  eq('delete che finge · si dice che qualcosa può essere rimasto',
    messaggioEliminazione(e), MESSAGGI.eliminatoConResidui);
}
{
  // la stessa bugia su una chiave normale: la rilettura la scopre
  const { locale, kv } = await dispositivoCondiviso();
  locale.guasto.finge.add(seenKey(A));
  const e = await chiama({
    codici: [], uid: A, groups: gruppiOk, auth: authOk, pulisci: kv.dimenticaUtente,
  });
  ok('finge su una chiave · la pulizia fallisce', e.pulizia?.ok === false);
  eq('finge su una chiave · e la nomina', e.pulizia?.rimaste, [seenKey(A)]);
  eq('finge su una chiave · «rimosse» dice solo quello che è sparito davvero',
    e.pulizia?.rimosse, [logKey(A)]);
}

/* ================================================================== */
/* 11. CODA MALFORMATA — NESSUNA ECCEZIONE ESCE DA QUI                 */
/* ================================================================== */
{
  const code = {
    '[null]': '[null]',
    'oggetto invece di elenco': '{"smetto:log:utente-A":"…"}',
    'riga non iterabile': '[123]',
    'riga senza chiave': '[[]]',
    'chiave non stringa': '[[7,{"uid":"utente-A","value":"…"}]]',
    'JSON rotto': '[[',
  };
  for (const [nome, contenuto] of Object.entries(code)) {
    const locale = creaDispositivo(new Map([
      [logKey(A), registro(4)],
      [CHIAVE_CODA, contenuto],
    ]));
    let e;
    let esploso = false;
    try {
      e = await dimenticaUtenteSulDispositivo({
        uid: A, locale, uidDaChiave, chiaveCoda: CHIAVE_CODA,
      });
    } catch { esploso = true; }
    ok(`coda malformata (${nome}) · nessuna eccezione esce`, !esploso);
    ok(`coda malformata (${nome}) · la pulizia fallisce`, e?.ok === false);
    eq(`coda malformata (${nome}) · e dice che è la coda`, e?.motivo, 'coda');
    ok(`coda malformata (${nome}) · la coda non viene buttata via`,
      locale.mappa.get(CHIAVE_CODA) === contenuto);
    ok(`coda malformata (${nome}) · le chiavi di A se ne vanno lo stesso`,
      !locale.mappa.has(logKey(A)));
  }
}
{
  /* E attraverso la sequenza intera. La coda rotta deve essere sul disco
     PRIMA che il motore la legga: se il motore ha già la sua copia in
     memoria, `salvaCoda` riscrive sopra il guasto e la coda torna sana —
     il che è corretto (di A non resta niente), ma non prova niente su
     questo caso. */
  const { locale, kv } = dispositivoConCodaRotta('[null]');
  const e = await chiama({
    codici: [], uid: A, groups: gruppiOk, auth: authOk, pulisci: kv.dimenticaUtente,
  });
  ok('coda malformata · l\'account risulta eliminato', e.ok === true);
  ok('coda malformata · la pulizia no', e.pulizia?.ok === false);
  ok('coda malformata · la coda è fra i residui', e.pulizia?.rimaste.includes(CHIAVE_CODA));
  ok('coda malformata · le chiavi di A se ne sono andate', !locale.mappa.has(logKey(A)));
  eq('coda malformata · messaggio sui possibili residui',
    messaggioEliminazione(e), MESSAGGI.eliminatoConResidui);
}

/* ================================================================== */
/* 12. IL MARCATORE `smetto:uscito`                                    */
/*                                                                     */
/*     È un residuo locale legato a una persona, e porta scritto di     */
/*     chi è. Quello dell'account cancellato va via; quello di un'altra */
/*     persona NO — toglierlo rimetterebbe in piedi il difetto che      */
/*     marcatoreLogout.js esiste per chiudere.                          */
/* ================================================================== */
{
  const ambiente = creaAmbiente();
  scriviMarcatore(A, { ambiente });
  const { locale, kv } = await dispositivoCondiviso({
    togliMarcatore: (id) => rimuoviMarcatoreDi(id, { ambiente }),
  });

  const e = await chiama({
    codici: [], uid: A, groups: gruppiOk, auth: authOk, pulisci: kv.dimenticaUtente,
  });

  ok('marcatore di A · la pulizia riesce', e.pulizia?.ok === true, JSON.stringify(e.pulizia));
  ok('marcatore di A · il marcatore è stato tolto', leggiMarcatore({ ambiente }) === null);
  ok('marcatore di A · e le chiavi pure', !locale.mappa.has(logKey(A)));
  eq('marcatore di A · si dice eliminato', messaggioEliminazione(e), MESSAGGI.eliminato);
}
{
  const ambiente = creaAmbiente();
  scriviMarcatore(B, { ambiente });
  const { kv } = await dispositivoCondiviso({
    togliMarcatore: (id) => rimuoviMarcatoreDi(id, { ambiente }),
  });

  const e = await chiama({
    codici: [], uid: A, groups: gruppiOk, auth: authOk, pulisci: kv.dimenticaUtente,
  });

  ok('marcatore di B · resta dov\'è', leggiMarcatore({ ambiente })?.userId === B);
  ok('marcatore di B · e la pulizia di A riesce lo stesso', e.pulizia?.ok === true);
}
{
  // nessun marcatore: non è un residuo, e non deve diventare un fallimento
  const ambiente = creaAmbiente();
  const { kv } = await dispositivoCondiviso({
    togliMarcatore: (id) => rimuoviMarcatoreDi(id, { ambiente }),
  });
  const e = await chiama({
    codici: [], uid: A, groups: gruppiOk, auth: authOk, pulisci: kv.dimenticaUtente,
  });
  ok('senza marcatore · la pulizia riesce', e.pulizia?.ok === true);
}
{
  // `removeItem` che risolve e non cancella: stessa bugia, stesso verdetto
  const ambiente = creaAmbiente({ sordo: true });
  scriviMarcatore(A, { ambiente });
  const { kv } = await dispositivoCondiviso({
    togliMarcatore: (id) => rimuoviMarcatoreDi(id, { ambiente }),
  });
  const e = await chiama({
    codici: [], uid: A, groups: gruppiOk, auth: authOk, pulisci: kv.dimenticaUtente,
  });
  ok('marcatore sordo · la pulizia fallisce', e.pulizia?.ok === false);
  ok('marcatore sordo · e nomina il marcatore',
    e.pulizia?.rimaste.includes(CHIAVE_MARCATORE));
  eq('marcatore sordo · messaggio sui possibili residui',
    messaggioEliminazione(e), MESSAGGI.eliminatoConResidui);
}
{
  // la funzione presa da sola, senza passare dal motore
  const ambiente = creaAmbiente();
  scriviMarcatore(B, { ambiente });
  const soloB = rimuoviMarcatoreDi(A, { ambiente });
  ok('marcatore · togliere quello di A non tocca quello di B', soloB.ok === true);
  ok('marcatore · e B è ancora lì', leggiMarcatore({ ambiente })?.userId === B);
  const propriamenteB = rimuoviMarcatoreDi(B, { ambiente });
  ok('marcatore · togliere quello di B lo toglie', propriamenteB.tolto === true);
  ok('marcatore · e poi non c\'è più niente', leggiMarcatore({ ambiente }) === null);
}
{
  // un togliMarcatore che lancia non deve far saltare la pulizia
  const locale = creaDispositivo(new Map([[logKey(A), registro(2)]]));
  let esploso = false;
  let e;
  try {
    e = await dimenticaUtenteSulDispositivo({
      uid: A,
      locale,
      uidDaChiave,
      chiaveCoda: CHIAVE_CODA,
      togliMarcatore: () => { throw new TypeError('localStorage negato'); },
    });
  } catch { esploso = true; }
  ok('marcatore che lancia · nessuna eccezione esce', !esploso);
  ok('marcatore che lancia · la pulizia fallisce', e?.ok === false);
  ok('marcatore che lancia · ma le chiavi sono state tolte', !locale.mappa.has(logKey(A)));
}

/* ================================================================== */
/* 13. LA REGOLA GENERALE, DETTA UNA VOLTA SOLA                        */
/*                                                                     */
/*     Qualunque cosa vada storta in locale DOPO una cancellazione      */
/*     remota riuscita: l'account è eliminato, e l'utente non riceve    */
/*     mai «Account eliminato.» e basta.                               */
/* ================================================================== */
{
  const guasti = {
    'coda che finge': async () => {
      const d = await dispositivoCondiviso();
      d.locale.guasto.finge.add(CHIAVE_CODA);
      return d;
    },
    'chiave che finge': async () => {
      const d = await dispositivoCondiviso();
      d.locale.guasto.finge.add(logKey(A));
      return d;
    },
    'chiave che lancia': async () => {
      const d = await dispositivoCondiviso();
      d.locale.guasto.lancia.add(logKey(A));
      return d;
    },
    'elenco non leggibile': async () => {
      const d = await dispositivoCondiviso();
      d.locale.guasto.list = 'negato';
      return d;
    },
    'coda non leggibile': async () => {
      const d = await dispositivoCondiviso();
      d.locale.guasto.get = 'negato';
      return d;
    },
    'coda malformata': async () => dispositivoConCodaRotta('[null]'),
    'marcatore sordo': async () => {
      const ambiente = creaAmbiente({ sordo: true });
      scriviMarcatore(A, { ambiente });
      return dispositivoCondiviso({
        togliMarcatore: (id) => rimuoviMarcatoreDi(id, { ambiente }),
      });
    },
  };
  for (const [nome, prepara] of Object.entries(guasti)) {
    const { kv } = await prepara();
    const e = await chiama({
      codici: [], uid: A, groups: gruppiOk, auth: authOk, pulisci: kv.dimenticaUtente,
    });
    ok(`regola generale (${nome}) · l'account è eliminato`, e.ok === true);
    ok(`regola generale (${nome}) · la pulizia è dichiarata fallita`, e.pulizia?.ok === false);
    ok(`regola generale (${nome}) · nessuna falsa promessa`,
      messaggioEliminazione(e) === MESSAGGI.eliminatoConResidui);
    ok(`regola generale (${nome}) · e si esce comunque dall'account`,
      schermata([], e).logout === true);
  }
}

/* ================================================================== */
/* 14. RIGHE DI CODA CHE NON SONO COPPIE                               */
/*                                                                     */
/*     Il primo dei due difetti trovati sulla revisione 2.             */
/*     `rigaValida` chiedeva «almeno un elemento, il primo stringa», e  */
/*     una riga che non è `[chiave, valore]` passava per buona:         */
/*                                                                     */
/*      · con la sola chiave, veniva attribuita al proprietario         */
/*        ricavato dalla chiave e la coda — che nessuno sa come sia     */
/*        finita in quello stato — veniva CANCELLATA, con la pulizia    */
/*        dichiarata riuscita;                                         */
/*      · con un elemento in più, il codice guardava i primi due,       */
/*        concludeva «è di B» e la teneva: il dato di A restava nel     */
/*        terzo elemento, sul disco, sotto «Account eliminato.».        */
/*                                                                     */
/*     Adesso la lunghezza deve essere esattamente 2. Tutto il resto è  */
/*     una coda che questa app non ha scritto, e su una coda simile non */
/*     si può affermare né che sia pulita né di chi sia: non si butta,  */
/*     e si nomina fra i residui.                                      */
/* ================================================================== */
{
  const righe = {
    'solo la chiave': [[logKey(A)]],
    'chiave e valore, più un terzo elemento di A': [[
      logKey(B),
      { uid: B, value: 'dato-B' },
      { uid: A, value: 'dato-A' },
    ]],
    'quattro elementi': [[
      logKey(B),
      { uid: B, value: 'dato-B' },
      { uid: A, value: 'dato-A' },
      { uid: A, value: 'ancora-A' },
    ]],
    'cinque elementi, tutti di A': [[
      logKey(A), registro(1), registro(2), registro(3), registro(4),
    ]],
    'riga vuota': [[]],
    'una buona e una a tre elementi': [
      [logKey(B), { uid: B, value: 'dato-B' }],
      [logKey(B), { uid: B, value: 'dato-B' }, { uid: A, value: 'dato-A' }],
    ],
  };

  for (const [nome, coda] of Object.entries(righe)) {
    const contenuto = JSON.stringify(coda);
    const locale = creaDispositivo(new Map([
      [logKey(A), registro(4)],
      [seenKey(A), '{}'],
      [logKey(B), registro(9)],
      [seenKey(B), '{"amico":1}'],
      [CHIAVE_CODA, contenuto],
    ]));

    let e;
    let esploso = false;
    try {
      e = await dimenticaUtenteSulDispositivo({
        uid: A, locale, uidDaChiave, chiaveCoda: CHIAVE_CODA,
      });
    } catch { esploso = true; }

    ok(`riga non coppia (${nome}) · nessuna eccezione esce`, !esploso);
    ok(`riga non coppia (${nome}) · la pulizia NON è riuscita`, e?.ok === false,
      JSON.stringify(e));
    ok(`riga non coppia (${nome}) · la coda è nominata fra i residui`,
      e?.rimaste.includes(CHIAVE_CODA), JSON.stringify(e?.rimaste));
    eq(`riga non coppia (${nome}) · e il motivo è la coda`, e?.motivo, 'coda');
    ok(`riga non coppia (${nome}) · la coda non viene buttata via`,
      locale.mappa.get(CHIAVE_CODA) === contenuto);
    ok(`riga non coppia (${nome}) · le chiavi di A se ne vanno lo stesso`,
      !locale.mappa.has(logKey(A)) && !locale.mappa.has(seenKey(A)));
    ok(`riga non coppia (${nome}) · B non viene toccato`,
      locale.mappa.get(logKey(B)) === registro(9)
      && locale.mappa.get(seenKey(B)) === '{"amico":1}');
  }
}
{
  /* Il caso peggiore, detto per intero: il dato di A è NEL TERZO
     elemento di una riga che il vecchio codice attribuiva soltanto a B.
     Prima: `ok: true`, «Account eliminato.», e `dato-A` ancora sul
     disco. Adesso il residuo c'è lo stesso — non lo si può togliere
     senza sapere cosa sia — ma viene DETTO. */
  const contenuto = JSON.stringify([[
    logKey(B), { uid: B, value: 'dato-B' }, { uid: A, value: 'dato-A' },
  ]]);
  const { locale, kv } = dispositivoConCodaRotta(contenuto);
  const e = await chiama({
    codici: [], uid: A, groups: gruppiOk, auth: authOk, pulisci: kv.dimenticaUtente,
  });
  ok('dato di A nel terzo elemento · l\'account è eliminato davvero', e.ok === true);
  ok('dato di A nel terzo elemento · la pulizia locale NO', e.pulizia?.ok === false);
  ok('dato di A nel terzo elemento · la coda è fra i residui',
    e.pulizia?.rimaste.includes(CHIAVE_CODA));
  ok('dato di A nel terzo elemento · il dato è ancora sul disco, e non si finge di no',
    String(locale.mappa.get(CHIAVE_CODA)).includes('dato-A'));
  eq('dato di A nel terzo elemento · messaggio sui possibili residui',
    messaggioEliminazione(e), MESSAGGI.eliminatoConResidui);
}
{
  // e la coppia buona continua a funzionare: la correzione non deve
  // trasformare ogni coda in un residuo
  const locale = creaDispositivo(new Map([
    [logKey(A), registro(4)],
    [CHIAVE_CODA, JSON.stringify([
      [logKey(A), { uid: A, value: registro(4) }],
      [logKey(B), { uid: B, value: registro(1) }],
    ])],
  ]));
  const e = await dimenticaUtenteSulDispositivo({
    uid: A, locale, uidDaChiave, chiaveCoda: CHIAVE_CODA,
  });
  ok('coppie buone · la pulizia riesce ancora', e.ok === true, JSON.stringify(e));
  eq('coppie buone · la voce di A sparisce', codaSuDisco(locale), [logKey(B)]);
}

/* ================================================================== */
/* 15. MARCATORE NON VERIFICABILE                                      */
/*                                                                     */
/*     Il secondo difetto. `leggiMarcatore` risponde `null` sia quando  */
/*     il marcatore non c'è sia quando NON SI È POTUTO LEGGERE, e       */
/*     `rimuoviMarcatoreDi` leggeva quel `null` come «non è di questo   */
/*     utente» → `ok: true`. Con `getItem` negato la cancellazione      */
/*     dichiarava quindi la pulizia riuscita senza aver mai guardato se */
/*     `smetto:uscito` fosse ancora lì.                                */
/*                                                                     */
/*     La lettura per l'autenticazione resta com'era — un JSON rotto    */
/*     non deve impedire a nessuno di entrare — e la pulizia usa una    */
/*     lettura stretta che sa dire «non lo so».                        */
/* ================================================================== */
const ambienteCon = (getItem, { removeItem = () => {} } = {}) => ({
  localStorage: { getItem, setItem: () => {}, removeItem },
});

{
  const casi = {
    'getItem che lancia': ambienteCon(() => { throw new Error('negato'); }),
    'JSON malformato': ambienteCon(() => '{rotto'),
    'JSON valido ma non un marcatore': ambienteCon(() => '[]'),
    'marcatore senza utente': ambienteCon(() => '{"tipo":"logout"}'),
    'marcatore di tipo sbagliato': ambienteCon(() => '{"tipo":"altro","userId":"utente-A"}'),
    'valore non stringa': ambienteCon(() => 42),
    'getItem che non è una funzione': { localStorage: { removeItem: () => {} } },
  };

  for (const [nome, ambiente] of Object.entries(casi)) {
    let r;
    let esploso = false;
    try { r = rimuoviMarcatoreDi(A, { ambiente }); } catch { esploso = true; }

    ok(`marcatore non verificabile (${nome}) · nessuna eccezione esce`, !esploso);
    ok(`marcatore non verificabile (${nome}) · NON è dichiarato riuscito`, r?.ok === false,
      JSON.stringify(r));
    ok(`marcatore non verificabile (${nome}) · non dice di aver tolto niente`,
      r?.tolto === false);
    eq(`marcatore non verificabile (${nome}) · e nomina la chiave`,
      r?.chiave, CHIAVE_MARCATORE);
    ok(`marcatore non verificabile (${nome}) · l'accesso invece non si blocca`,
      leggiMarcatore({ ambiente }) === null);
  }
}
{
  // e non si cancella alla cieca: dentro può esserci il «sei uscito» di
  // un altro account, e toglierlo rimetterebbe in piedi il difetto che
  // marcatoreLogout.js esiste per chiudere
  const casi = { 'JSON malformato': '{rotto', 'forma sconosciuta': '{"tipo":"boh"}' };
  for (const [nome, contenuto] of Object.entries(casi)) {
    const m = new Map([[CHIAVE_MARCATORE, contenuto]]);
    const ambiente = {
      localStorage: {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => { m.set(k, String(v)); },
        removeItem: (k) => { m.delete(k); },
      },
    };
    const r = rimuoviMarcatoreDi(A, { ambiente });
    ok(`marcatore illeggibile (${nome}) · la rimozione fallisce`, r.ok === false);
    ok(`marcatore illeggibile (${nome}) · e il marcatore non viene cancellato`,
      m.get(CHIAVE_MARCATORE) === contenuto);
  }
}
{
  // i tre stati, presi da soli: sono la ragione per cui la pulizia sa
  // distinguere «non c'è» da «non lo so»
  const vuoto = creaAmbiente();
  eq('ispezione · senza marcatore lo stato è «assente»',
    ispezionaMarcatore({ ambiente: vuoto }).stato, 'assente');

  scriviMarcatore(A, { ambiente: vuoto });
  const letto = ispezionaMarcatore({ ambiente: vuoto });
  eq('ispezione · con un marcatore buono lo stato è «letto»', letto.stato, 'letto');
  eq('ispezione · e si sa di chi è', letto.marcatore?.userId, A);

  eq('ispezione · con lo storage negato lo stato è «illeggibile»',
    ispezionaMarcatore({ ambiente: ambienteCon(() => { throw new Error('no'); }) }).stato,
    'illeggibile');
  eq('ispezione · senza localStorage non è un guasto: è «assente»',
    ispezionaMarcatore({ ambiente: {} }).stato, 'assente');
}
{
  // il marcatore di A si toglie ancora, e quello di B resta ancora
  const ambiente = creaAmbiente();
  scriviMarcatore(A, { ambiente });
  const suo = rimuoviMarcatoreDi(A, { ambiente });
  ok('marcatore di A · viene tolto', suo.ok === true && suo.tolto === true);
  ok('marcatore di A · e non c\'è più niente', leggiMarcatore({ ambiente }) === null);

  scriviMarcatore(B, { ambiente });
  const altrui = rimuoviMarcatoreDi(A, { ambiente });
  ok('marcatore di B · togliere quello di A riesce senza toccarlo', altrui.ok === true);
  ok('marcatore di B · resta intatto', leggiMarcatore({ ambiente })?.userId === B);
  ok('marcatore di B · e resta anche sul deposito',
    ambiente.mappa.has(CHIAVE_MARCATORE));
}
{
  /* Attraverso la sequenza intera, per ognuno dei modi di non poter
     verificare: l'account remoto è eliminato, la pulizia locale è
     dichiarata fallita, e la frase non è mai «Account eliminato.». */
  const ambienti = {
    'getItem che lancia': () => ambienteCon(() => { throw new Error('negato'); }),
    'JSON malformato': () => ambienteCon(() => '{rotto'),
    'valore non valido': () => ambienteCon(() => 42),
    'forma sconosciuta': () => ambienteCon(() => '{"tipo":"logout"}'),
  };

  for (const [nome, crea] of Object.entries(ambienti)) {
    const ambiente = crea();
    const { locale, kv } = await dispositivoCondiviso({
      togliMarcatore: (id) => rimuoviMarcatoreDi(id, { ambiente }),
    });
    const e = await chiama({
      codici: [], uid: A, groups: gruppiOk, auth: authOk, pulisci: kv.dimenticaUtente,
    });

    ok(`marcatore non verificabile via sequenza (${nome}) · l'account è eliminato`,
      e.ok === true);
    ok(`marcatore non verificabile via sequenza (${nome}) · la pulizia locale no`,
      e.pulizia?.ok === false, JSON.stringify(e.pulizia));
    ok(`marcatore non verificabile via sequenza (${nome}) · il marcatore è fra i residui`,
      e.pulizia?.rimaste.includes(CHIAVE_MARCATORE), JSON.stringify(e.pulizia?.rimaste));
    eq(`marcatore non verificabile via sequenza (${nome}) · messaggio sui possibili residui`,
      messaggioEliminazione(e), MESSAGGI.eliminatoConResidui);
    ok(`marcatore non verificabile via sequenza (${nome}) · si esce comunque dall'account`,
      schermata([], e).logout === true);
    ok(`marcatore non verificabile via sequenza (${nome}) · le chiavi di A se ne vanno`,
      !locale.mappa.has(logKey(A)) && !locale.mappa.has(seenKey(A)));
    ok(`marcatore non verificabile via sequenza (${nome}) · e B resta intatto`,
      locale.mappa.has(logKey(B)) && locale.mappa.has(seenKey(B)));
  }
}

console.log('');
if (falliti.length) {
  falliti.forEach((f) => console.log(`  ✗ ${f}`));
  console.log(`\n  ${passati} controlli superati, ${falliti.length} falliti\n`);
  process.exit(1);
}
console.log(`  ${passati} controlli sull'eliminazione account superati\n  nessun fallimento\n`);
process.exit(0);
