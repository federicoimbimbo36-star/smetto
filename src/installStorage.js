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
import { uidDaChiave } from './constants';
import localKV from './windowStorage';
import { fondiValore } from './utils/fusione';
import { creaKvSincronizzato, CHIAVE_CODA } from './utils/sincronizza';
import { dimenticaUtenteSulDispositivo } from './utils/puliziaLocale';
import { rimuoviMarcatoreDi } from './utils/marcatoreLogout';

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

/* A CHI APPARTIENE UNA CHIAVE — `uidDaChiave`, importata da
   constants.js, dove sta accanto a `logKey` e `seenKey` che quelle
   chiavi le compongono. Il motore di sincronizzazione se la fa passare
   da qui invece di dedurre: non deve sapere niente della forma delle
   chiavi, e chi ne aggiunge una tocca un file solo.

   Stava scritta qui dentro, ma questo file installa `window.storage` al
   caricamento e quindi non si apre da un banco di prova: la stessa
   espressione regolare finiva ricopiata nei controlli, dove poteva
   restare indietro senza che nessuno se ne accorgesse. */

const cloudKV = supabaseConfigurato
  ? creaKvSincronizzato({
    locale: localKV, remoto, fondi: fondiValore, uidDaChiave, togliMarcatore: rimuoviMarcatoreDi,
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
  /* Senza database non c'è coda da svuotare, ma le chiavi private sono
     le stesse e stanno nello stesso posto: la cancellazione dell'account
     deve portarsele via anche qui. La funzione è la stessa del motore,
     così i due percorsi non possono divergere. */
  dimenticaUtente: (uid) => dimenticaUtenteSulDispositivo({
    uid, locale: localKV, uidDaChiave, chiaveCoda: CHIAVE_CODA,
    togliMarcatore: rimuoviMarcatoreDi,
  }),
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
