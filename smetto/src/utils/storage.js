/* Thin wrapper su window.storage — vedi ../installStorage.js, che decide
   se dietro c'è il database (Supabase, con la copia locale come cache)
   oppure il solo dispositivo.

   Il parametro `shared` non c'è più: i dati condivisi — cioè i gruppi —
   non passano da qui, perché un KV a chiave singola non sa distinguere
   chi può scrivere cosa. Stanno su tabelle vere con le loro policy
   (vedi ../data/groups.js). Qui restano solo i dati privati: il registro
   personale e i "già visti", che nessun altro deve poter leggere. */

export async function readStore(key, fallback) {
  try {
    const r = await window.storage.get(key);
    if (r && r.value) return JSON.parse(r.value);
  } catch (e) { /* chiave non ancora creata */ }
  return fallback;
}

export async function writeStore(key, value) {
  try { await window.storage.set(key, JSON.stringify(value)); }
  catch (e) { console.error('salvataggio non riuscito', e); }
}

export async function listStore(prefix) {
  try { return (await window.storage.list(prefix))?.keys || []; }
  catch (e) { return []; }
}
