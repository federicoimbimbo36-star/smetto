/* Thin wrapper su window.storage — vedi ../installStorage.js, che decide
   se dietro c'è il database (Supabase, con la copia locale come cache)
   oppure il solo dispositivo.

   Il parametro `shared` non c'è più: i dati condivisi — cioè i gruppi —
   non passano da qui, perché un KV a chiave singola non sa distinguere
   chi può scrivere cosa. Stanno su tabelle vere con le loro policy
   (vedi ../data/groups.js). Qui restano solo i dati privati: il registro
   personale e i "già visti", che nessun altro deve poter leggere.

   ------------------------------------------------------------------
   LE SCRITTURE SULLA STESSA CHIAVE SONO IN FILA INDIANA.

   `salva()` non aspetta il salvataggio — giustamente, l'interfaccia non
   deve bloccarsi per la rete — quindi due modifiche ravvicinate
   lanciavano due `writeStore` che correvano una contro l'altra. Ognuna
   fa `localKV.set`, poi legge la sessione, poi parla col database: tre
   punti in cui la seconda può sorpassare la prima e far vincere il
   registro PIÙ VECCHIO. Con Capacitor Preferences, che è asincrono
   anche sul dispositivo, il sorpasso è possibile pure sulla copia
   locale.

   Una coda per chiave lo rende impossibile: la scrittura N+1 comincia
   quando la N è finita. Costa niente (le promesse si incatenano, non si
   accumula memoria) e toglie di mezzo un'intera famiglia di corse. */

const code = new Map();

function inFila(key, lavoro) {
  const precedente = code.get(key) || Promise.resolve();
  // `.catch` sulla precedente: un errore non deve bloccare la fila
  const prossima = precedente.catch(() => {}).then(lavoro);
  code.set(key, prossima);
  // quando la fila si svuota si toglie la chiave, così la Map non cresce
  prossima.catch(() => {}).finally(() => {
    if (code.get(key) === prossima) code.delete(key);
  });
  return prossima;
}

export async function readStore(key, fallback) {
  try {
    const r = await inFila(key, () => window.storage.get(key));
    if (r && r.value) return JSON.parse(r.value);
  } catch (e) { /* chiave non ancora creata */ }
  return fallback;
}

export function writeStore(key, value) {
  return inFila(key, () => window.storage.set(key, JSON.stringify(value)))
    .catch((e) => { console.error('salvataggio non riuscito', e); });
}

export async function listStore(prefix) {
  try { return (await window.storage.list(prefix))?.keys || []; }
  catch (e) { return []; }
}

/* Quante scritture non sono ancora arrivate al database. Zero non vuol
   dire «tutto sincronizzato per sempre», vuol dire «niente in sospeso in
   questo momento». */
export const scrittureInSospeso = () => {
  try { return window.storage.inSospeso?.() ?? 0; } catch { return 0; }
};

/* Avvisa quando un'ALTRA scheda dello stesso browser tocca una chiave. */
export const onCambioEsterno = (fn) => {
  try { return window.storage.onCambioEsterno?.(fn) || (() => {}); }
  catch { return () => {}; }
};
