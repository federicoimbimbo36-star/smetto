/* ------------------------------------------------------------------ */
/* installStorage.js — src/installStorage.js                           */
/*                                                                     */
/* Installa window.storage, su cui si appoggiano readStore/writeStore   */
/* (utils/storage.js) e quindi tutto il registro personale dell'app.    */
/* Va importato UNA VOLTA sola in main.jsx, PRIMA di App.               */
/*                                                                     */
/* Questo file adesso fa una cosa sola: COLLEGARE. La logica di         */
/* sincronizzazione — fusione, revisioni, coda, tentativi — sta in      */
/* utils/sincronizza.js, dove si può verificare con un database finto.  */
/* Prima stava qui, attaccata al client Supabase e a window, e quindi   */
/* non si poteva provare: la parte che decide se una sigaretta          */
/* sopravvive a un timeout non è la parte da guardare a occhio.         */
/*                                                                     */
/* ------------------------------------------------------------------ */
/*  LA REGOLA                                                           */
/*                                                                     */
/*    UNA SIGARETTA REGISTRATA NON PUÒ SPARIRE.                         */
/*                                                                     */
/*  Né per un refresh, né per un timeout, né perché la stessa persona   */
/*  ha due telefoni o due schede aperte. Prima i modi di perderla erano */
/*  quattro, tutti raggiungibili senza fare niente di strano:           */
/*                                                                     */
/*  1. il remoto vecchio sovrascriveva il locale nuovo dopo un timeout; */
/*  2. il remoto vinceva sempre, quindi il lavoro fatto offline spariva */
/*     alla prima lettura riuscita;                                     */
/*  3. la coda viveva in memoria e un refresh la azzerava;              */
/*  4. l'upsert era «l'ultimo che scrive vince»: due dispositivi, cento */
/*     sigarette a testa, una registrata su ciascuno, risultato 101.    */
/* ------------------------------------------------------------------ */

import { supabase, supabaseConfigurato } from './auth/supabaseClient';
import localKV from './windowStorage';
import { fondiValore } from './utils/fusione';
import { creaKvSincronizzato } from './utils/sincronizza';

/* Il database, ridotto ai cinque gesti che il motore sa fare. Le
   condizioni di concorrenza sono tutte qui dentro, in una riga:
   `.eq('rev', rev)` è quello che impedisce a una scrittura di passare
   sopra a una che non ha mai visto. */
const remoto = {
  async utente() {
    // getSession legge la sessione già in memoria: non è una chiamata di rete
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id || null;
  },
  leggi: (uid, key) => supabase
    .from('user_kv').select('value, rev')
    .eq('user_id', uid).eq('key', key).maybeSingle(),
  aggiorna: (uid, key, valore, rev) => supabase
    .from('user_kv').update({ value: valore, rev: rev + 1 })
    .eq('user_id', uid).eq('key', key).eq('rev', rev)
    .select('rev'),
  inserisci: (uid, key, valore) => supabase
    .from('user_kv').insert({ user_id: uid, key, value: valore, rev: 1 })
    .select('rev'),
  /* CONDIZIONATA ALLA REVISIONE, esattamente come `aggiorna`. Un DELETE
     secco poteva cancellare uno stato più recente di quello che il
     dispositivo aveva letto: la scrittura era protetta, la cancellazione
     — che distrugge di più — no. `.select('rev')` serve a sapere se ha
     davvero toccato una riga: senza, zero righe e una riga sono
     indistinguibili. */
  cancella: (uid, key, rev) => supabase
    .from('user_kv').delete()
    .eq('user_id', uid).eq('key', key).eq('rev', rev)
    .select('rev'),
  elenca: (uid, prefix) => supabase
    .from('user_kv').select('key').eq('user_id', uid).like('key', `${prefix}%`),
};

/* A CHI APPARTIENE UNA CHIAVE.
   Le due chiavi private dell'app sono `smetto:log:<uid>` e
   `smetto:seen:<uid>` (vedi constants.js): l'utente ce l'hanno scritto
   dentro. Il motore di sincronizzazione se lo fa dare da qui invece di
   dedurlo, perché non deve sapere niente della forma delle chiavi — e
   perché quando Capacitor o un domani un'altra chiave entreranno in
   gioco, l'unico posto da aggiornare è questo.

   Lo usa in due casi, e in nessuno dei due esiste una sessione da cui
   leggere l'utente: le voci di coda lasciate dalla versione precedente,
   che l'utente non lo salvavano, e le scritture fatte mentre la sessione
   è scaduta. Nel funzionamento normale il proprietario è quello della
   sessione, che è l'unica fonte autorevole. */
const uidDaChiave = (key) => {
  const m = /^smetto:(?:log|seen):(.+)$/.exec(String(key));
  return m ? m[1] : null;
};

const cloudKV = supabaseConfigurato
  ? creaKvSincronizzato({
    locale: localKV, remoto, fondi: fondiValore, uidDaChiave,
  })
  : null;

/* ------------------------------------------------------------------ */
/*  GLI AGGANCI DEL BROWSER                                            */
/* ------------------------------------------------------------------ */
if (supabaseConfigurato) {
  cloudKV.caricaCoda();

  window.addEventListener?.('online', () => { cloudKV.svuotaCoda(); });

  // appena si entra in un account si prova a consegnare il sospeso
  supabase.auth.onAuthStateChange((_evento, sessione) => {
    if (sessione) cloudKV.svuotaCoda();
  });

  /* Anche al ritorno in primo piano: su mobile il sistema sospende i
     timer, e l'evento `online` non arriva se la rete non è mai andata
     via davvero — è cambiata la scheda, non la rete. */
  if (typeof document !== 'undefined') {
    document.addEventListener?.('visibilitychange', () => {
      if (document.visibilityState === 'visible') cloudKV.svuotaCoda();
    });
  }
}

/* ------------------------------------------------------------------ */
/*  L'ALTRA SCHEDA                                                     */
/*                                                                     */
/*  Due schede dello stesso account condividono localStorage: quello    */
/*  che scrive l'una, l'altra non lo sa, e continua a costruire i suoi  */
/*  salvataggi sopra uno stato vecchio. Il database le ricuce grazie    */
/*  alla revisione, ma solo alla scrittura successiva, e nel frattempo  */
/*  l'utente vede due conteggi diversi e non sa a quale credere.        */
/*  Qui la scheda si accorge e avvisa chi vuole saperlo.                */
/* ------------------------------------------------------------------ */
const localeSolo = {
  get: (k) => localKV.get(k),
  set: (k, v) => localKV.set(k, v),
  delete: (k) => localKV.delete(k),
  list: (p) => localKV.list(p),
  onCambioEsterno: () => () => {},
  inSospeso: () => 0,
};

const scelto = cloudKV || localeSolo;

if (typeof window !== 'undefined' && window.addEventListener) {
  const ascoltatoriLocali = new Set();
  if (!cloudKV) {
    localeSolo.onCambioEsterno = (fn) => {
      ascoltatoriLocali.add(fn);
      return () => ascoltatoriLocali.delete(fn);
    };
  }
  window.addEventListener('storage', (e) => {
    if (!e?.key || !e.key.startsWith('smetto:kv:')) return;
    const chiave = e.key.slice('smetto:kv:'.length);
    if (chiave === '__coda__') return;
    if (cloudKV) cloudKV.avvisa(chiave);
    else ascoltatoriLocali.forEach((fn) => { try { fn(chiave); } catch { /* */ } });
  });
}

window.storage = scelto;

export default window.storage;
