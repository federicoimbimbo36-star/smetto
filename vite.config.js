import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* ------------------------------------------------------------------ */
/* Stub dei pacchetti Capacitor.                                       */
/*                                                                     */
/* windowStorage.js e notificheTappe.js fanno `await import('@capacitor/…')`
   dentro un try/catch: sul telefono trovano il pacchetto vero, sul web
   devono semplicemente fallire e passare al fallback (localStorage e
   notifiche in-app).

   Il problema è che Rollup, in fase di build, non tollera un import di un
   pacchetto che non esiste in node_modules: la build fallisce prima ancora
   di arrivare al runtime. Questo plugin risolve quegli id su un modulo
   vuoto, così l'import riesce, torna un oggetto senza `Preferences` /
   `LocalNotifications`, e il codice prende da solo la strada del fallback.

   👉 Quando installerai Capacitor davvero (npm i @capacitor/core
      @capacitor/preferences @capacitor/local-notifications), togli questo
      plugin dalla lista qui sotto: da quel momento devono essere caricati
      i moduli veri.                                                      */
/* ------------------------------------------------------------------ */
function stubCapacitor() {
  const daStubbare = [
    '@capacitor/core',
    '@capacitor/preferences',
    '@capacitor/local-notifications',
  ];
  const idVirtuale = '\0stub-capacitor';

  return {
    name: 'stub-capacitor',
    enforce: 'pre',
    resolveId(source) {
      return daStubbare.includes(source) ? idVirtuale : null;
    },
    load(id) {
      return id === idVirtuale ? 'export default {};' : null;
    },
  };
}

/* ------------------------------------------------------------------ */
/* QUALE BUILD STO GUARDANDO.                                          */
/*                                                                     */
/* Serve a rispondere senza congetture alla domanda «la correzione è    */
/* davvero online?». Il commit arriva da Vercel al momento della build. */
/*                                                                     */
/* DUE NOMI, non uno. `VERCEL_GIT_COMMIT_SHA` è la variabile di         */
/* sistema, ma Vercel la espone solo se l'opzione «Automatically expose */
/* System Environment Variables» è attiva: senza, la variabile non      */
/* c'è e la build non è affatto sbagliata. Chi la aggiunge a mano       */
/* invece la chiama quasi sempre `VITE_VERCEL_GIT_COMMIT_SHA`, perché   */
/* è il prefisso che Vite riconosce. Si guardano tutte e due.           */
/*                                                                     */
/* E il ripiego è `non disponibile`, non `locale`: dire «locale»        */
/* significherebbe affermare che la build non è passata da Vercel, e    */
/* non è una cosa che da qui si può sapere. L'unica cosa vera è che     */
/* l'identificativo non è stato esposto.                                */
/*                                                                     */
/* Solo il commit: niente chiavi, niente token, niente dati di nessuno. */
/* Un hash di commit è pubblico quanto il repository.                   */
/* ------------------------------------------------------------------ */
const RIPIEGO_VERSIONE = 'non disponibile';

const commit = process.env.VITE_VERCEL_GIT_COMMIT_SHA
  || process.env.VERCEL_GIT_COMMIT_SHA
  || '';

/* Sempre e solo i primi 7 caratteri: l'hash intero non aggiunge niente
   a chi deve confrontarlo a occhio con quello che mostra Vercel. */
const VERSIONE = commit.slice(0, 7) || RIPIEGO_VERSIONE;

export default defineConfig({
  define: {
    __VERSIONE__: JSON.stringify(VERSIONE),
  },
  plugins: [stubCapacitor(), react()],
  server: {
    port: 5173,
    // così puoi aprire l'app dal telefono sulla stessa rete di casa:
    // vite stampa l'indirizzo tipo http://192.168.x.x:5173
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
