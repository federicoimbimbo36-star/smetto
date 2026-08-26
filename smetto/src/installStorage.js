/* ------------------------------------------------------------------ */
/* installStorage.js — src/installStorage.js                           */
/*                                                                     */
/* Installa window.storage, su cui si appoggiano readStore/writeStore   */
/* (utils/storage.js) e quindi tutto il registro personale dell'app.    */
/* Va importato UNA VOLTA sola in main.jsx, PRIMA di App.               */
/*                                                                     */
/* Come funziona:                                                       */
/*  - la VERITÀ sta sul database, nella tabella user_kv: una riga per   */
/*    chiave per utente, che la RLS rende illeggibile a chiunque altro. */
/*    È questo che fa seguire il tuo registro da un dispositivo         */
/*    all'altro invece di lasciarlo prigioniero di un telefono.         */
/*  - la copia locale (windowStorage.js) resta davanti come cache:      */
/*    l'app si apre subito con i dati che ha, e se la rete manca si     */
/*    continua a registrare lo stesso.                                  */
/*                                                                     */
/* Le scritture non riuscite non si perdono: finiscono in coda e        */
/* vengono ritentate, anche quando il dispositivo torna online. Questa  */
/* è la parte che conta: una sigaretta registrata in ascensore deve     */
/* arrivare al database, non sparire.                                   */
/* ------------------------------------------------------------------ */

import { supabase, supabaseConfigurato } from './auth/supabaseClient';
import localKV from './windowStorage';

async function utenteCorrente() {
  // getSession legge la sessione già in memoria/localStorage: non fa
  // una chiamata di rete a ogni lettura.
  const { data } = await supabase.auth.getSession();
  return data?.session?.user?.id || null;
}

/* ------------------------------------------------------------------ */
/* Il patto dichiarato qui sopra era: «l'app si apre subito con i dati  */
/* che ha». Non era vero. La lettura aspettava comunque la risposta del */
/* database, e con rete lenta o assente — metropolitana, aereo, hotspot */
/* morto — l'app restava ferma su "Verifica sessione…" fino al timeout  */
/* interno di fetch, che può essere di decine di secondi.               */
/*                                                                     */
/* Adesso l'attesa ha una scadenza: superata quella si va avanti con la */
/* copia sul dispositivo. La risposta, se arriva dopo, aggiorna         */
/* comunque la cache — non si butta via niente, si smette solo di       */
/* aspettarla per mostrare qualcosa.                                    */
/* ------------------------------------------------------------------ */
const ATTESA_RETE = 3500;
const SCADUTA = Symbol('scaduta');

/* Trasforma il thenable pigro di Supabase in una promise vera che non
   rigetta mai: un errore di rete torna come { error }, come farebbe il
   client stesso. Così chi chiama non deve avvolgere tutto in try/catch. */
const promessaVera = (q) => Promise.resolve(q).then((r) => r, (e) => ({ error: e }));

function conScadenza(promessa, ms = ATTESA_RETE) {
  return Promise.race([
    promessa,
    new Promise((resolve) => { setTimeout(() => resolve(SCADUTA), ms); }),
  ]);
}

/* chiavi in attesa di essere scritte sul database (chiave → stringa JSON) */
const inCoda = new Map();
let timerCoda = null;

async function svuotaCoda() {
  if (!inCoda.size) return;
  const uid = await utenteCorrente();
  if (!uid) return;

  for (const [key, value] of [...inCoda.entries()]) {
    const esito = await conScadenza(promessaVera(value === null
      ? supabase.from('user_kv').delete().eq('user_id', uid).eq('key', key)
      : supabase.from('user_kv')
        .upsert({ user_id: uid, key, value: JSON.parse(value) }, { onConflict: 'user_id,key' })));
    // se scade non si toglie dalla coda: sarà il prossimo giro a riprovare
    if (esito !== SCADUTA && !esito.error) inCoda.delete(key);
  }

  if (inCoda.size && !timerCoda) {
    timerCoda = setTimeout(() => { timerCoda = null; svuotaCoda(); }, 20000);
  }
}

function accodaERitenta(key, value) {
  inCoda.set(key, value);
  if (!timerCoda) {
    timerCoda = setTimeout(() => { timerCoda = null; svuotaCoda(); }, 5000);
  }
}

if (supabaseConfigurato) {
  window.addEventListener?.('online', () => { svuotaCoda(); });
  // appena si entra in un account, si prova a consegnare quello che era
  // rimasto in sospeso
  supabase.auth.onAuthStateChange((_evento, sessione) => { if (sessione) svuotaCoda(); });
}

const cloudKV = {
  async get(key) {
    const locale = await localKV.get(key);
    const uid = await utenteCorrente();
    if (!uid) return locale;

    /* Promise.resolve() una volta sola, e poi si riusa quella.
       I query builder di Supabase sono "thenable pigri": partono quando
       qualcuno chiama .then(), e chiamarlo due volte manda DUE richieste.
       Qui la promise serve sia alla gara col timeout sia al ramo che
       riallinea la cache dopo, quindi va materializzata prima. */
    const lettura = promessaVera(supabase
      .from('user_kv')
      .select('value')
      .eq('user_id', uid)
      .eq('key', key)
      .maybeSingle());

    const esito = await conScadenza(lettura);

    if (esito === SCADUTA) {
      // il database ci ha messo troppo: si parte con la cache locale e si
      // lascia comunque arrivare la risposta, che riallinea la cache per
      // la prossima lettura invece di andare persa
      lettura.then((r) => {
        if (r && !r.error && r.data) localKV.set(key, JSON.stringify(r.data.value));
      });
      return locale;
    }

    // offline o errore: si va avanti con quello che abbiamo sul dispositivo
    const { data, error } = esito;
    if (error || !data) return locale;

    const value = JSON.stringify(data.value);
    await localKV.set(key, value);          // la cache si riallinea
    return { key, value };
  },

  async set(key, value) {
    await localKV.set(key, value);          // prima il locale: l'app non aspetta la rete
    const uid = await utenteCorrente();
    if (!uid) return { key, value };

    // Anche la scrittura ha una scadenza: se la rete resta appesa senza mai
    // rispondere né fallire, la chiave finisce in coda e viene ritentata.
    // Prima restava in un limbo — né scritta né in coda — e si perdeva.
    const esito = await conScadenza(promessaVera(supabase
      .from('user_kv')
      .upsert({ user_id: uid, key, value: JSON.parse(value) }, { onConflict: 'user_id,key' })));

    if (esito === SCADUTA || esito.error) accodaERitenta(key, value);
    else inCoda.delete(key);
    return { key, value };
  },

  async delete(key) {
    await localKV.delete(key);
    const uid = await utenteCorrente();
    if (!uid) return { key, deleted: true };

    const esito = await conScadenza(promessaVera(
      supabase.from('user_kv').delete().eq('user_id', uid).eq('key', key),
    ));
    if (esito === SCADUTA || esito.error) accodaERitenta(key, null);
    return { key, deleted: true };
  },

  async list(prefix = '') {
    const locali = (await localKV.list(prefix)).keys;
    const uid = await utenteCorrente();
    if (!uid) return { keys: locali, prefix };

    const esito = await conScadenza(promessaVera(supabase
      .from('user_kv')
      .select('key')
      .eq('user_id', uid)
      .like('key', `${prefix}%`)));
    if (esito === SCADUTA || esito.error || !esito.data) return { keys: locali, prefix };

    return { keys: [...new Set([...locali, ...esito.data.map((r) => r.key)])], prefix };
  },
};

window.storage = supabaseConfigurato ? cloudKV : localKV;

export default window.storage;
