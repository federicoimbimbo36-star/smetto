# Smetto

Tieni il conto delle sigarette e smetti un po' alla volta — da solo o, meglio,
con qualcuno che ti guarda.

## Avviare l'app

```bash
npm install
npm run dev
```

Poi apri l'indirizzo che stampa Vite (`http://localhost:5173`). Vite parte con
`host: true`, quindi stampa anche un indirizzo tipo `http://192.168.x.x:5173`:
quello lo puoi aprire dal telefono, se è sulla stessa rete di casa.

```bash
npm run build     # produce dist/
npm run preview   # serve dist/ come in produzione
npm run lint
npm run verifica  # controlli sui calcoli: date, piano, classifica
```

`npm run verifica` gira con Node puro, senza installare niente. Non è una suite
completa: sono controlli mirati sui punti dove i bug c'erano davvero — confini
di giornata attorno al cambio d'ora, numerazione delle settimane del piano,
calcolo del calo in classifica — scritti in modo da **fallire** con il codice di
prima. Devono girare con `TZ=Europe/Rome`, altrimenti quelli sull'ora legale non
provano niente; lo script imposta il fuso da solo.

## Come è fatta

```
index.html                 monta #root
src/
├─ main.jsx                importa installStorage PRIMA di App (l'ordine conta)
├─ App.jsx                 stato, calcoli, sincronizzazione
├─ constants.js            palette, fasce orarie, TAPPE del corpo, frasi
├─ styles.css
├─ installStorage.js       definisce window.storage: database + cache locale
├─ windowStorage.js        la sola copia locale (Capacitor Preferences o localStorage)
├─ notificheTappe.js       notifiche programmate delle tappe
├─ utils/    format.js · storage.js
├─ auth/     index.js (sceglie il backend) · supabaseAuth.js · supabaseClient.js · localAuth.js
├─ data/     groups.js     gruppi e classifica, su tabelle Supabase
├─ components/             12 pezzi riusabili
└─ screens/                le 5 schermate + i 2 overlay

public/                    icone, manifest della PWA
supabase/migrations/       lo schema del database, versionato
verifica/controlli.mjs     controlli sui calcoli, senza dipendenze
strumenti/genera-icone.py  rifà le icone PNG dal logo
```

## Installarla sul telefono

`index.html` dichiara il manifest e le icone, quindi «Aggiungi a schermata
Home» dà un'app vera: icona propria, apertura a schermo intero, niente barra
del browser. Le icone si rigenerano dal logo con
`python3 strumenti/genera-icone.py` (serve Pillow).

## Pubblicarla

`PUBBLICARE.md` — guida passo passo, senza riga di comando.

## La grafica

`DESIGN.md` — il sistema visivo «Brace»: l'idea, le tre regole, la palette e
cosa è cambiato. Tutto l'aspetto vive in `src/styles.css`; il file Figma di
riferimento è **Smetto — Brace**.

## Backend

Supabase, progetto `smetto`. Schema, policy RLS e cose ancora da fare stanno in
`BACKEND.md`; le migrazioni vere e proprie in `supabase/migrations/`.

Le credenziali sono già scritte come default in `src/auth/supabaseClient.js`,
quindi l'app funziona appena clonata. Per puntare a un altro progetto copia
`.env.example` in `.env`.

## Capacitor

Il codice è già pronto per il telefono: `windowStorage.js` e `notificheTappe.js`
provano a caricare `@capacitor/preferences` e `@capacitor/local-notifications`
con un import dinamico, e se non li trovano usano il fallback web.

Finché Capacitor non è installato, `vite.config.js` risolve quei pacchetti su un
modulo vuoto — serve solo a non far fallire la build. **Quando installerai
Capacitor davvero, togli il plugin `stubCapacitor` da `vite.config.js`.**

## Limiti noti sul web

- Le notifiche delle tappe a schermo spento **non funzionano da browser**: non
  c'è nessun service worker registrato, e comunque i Notification Triggers li
  supportano solo alcuni browser Chromium. Con l'app aperta le tappe arrivano
  lo stesso (banner + notifica di sistema). Per averle davvero in tasca serve
  il pacchetto Capacitor.
- Il gruppo si aggiorna a intervalli: 30 secondi se sei nella schermata gruppo,
  90 altrimenti. Con Supabase Realtime diventerebbe istantaneo.
