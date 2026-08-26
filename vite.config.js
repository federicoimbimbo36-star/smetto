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

export default defineConfig({
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
