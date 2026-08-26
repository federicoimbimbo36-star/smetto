# Backend Supabase — progetto `smetto`

Da qui in poi account, gruppi e registro personale non stanno più sul telefono:
stanno su un database. È il cambiamento che sblocca la funzione più importante
dell'app — **i gruppi funzionano davvero fra persone diverse** — e che fa seguire
i tuoi dati da un dispositivo all'altro.

| | |
|---|---|
| Progetto | `smetto` — ref `mzsiqlhovliginqazwrx` |
| Organizzazione | `federicoimbimbo36` |
| Regione | `eu-west-1` (Irlanda) |
| URL API | `https://mzsiqlhovliginqazwrx.supabase.co` |
| Chiave publishable | `sb_publishable_rq6ZNqXRTef18qCjDAhOBw_PoaP703l` |
| Piano | free — 0 €/mese |

La chiave publishable è **pubblica per progetto**: sta nel bundle del client ed è
normale che si veda. A proteggere i dati non è il segreto della chiave ma le
policy RLS. La chiave `service_role` non deve mai finire nel codice dell'app.

---

## ⚠️ Un passaggio da fare a mano, una volta sola

Nel pannello Supabase: **Authentication → Sign In / Providers → Email → *Confirm
email* = OFF**.

Qui si entra con numero di telefono e password: l'email è solo un indirizzo
tecnico (`u39333...@smetto.app`) che non riceverà mai posta. Se la conferma email
resta attiva, la registrazione non apre nessuna sessione e l'app mostra
`serve disattivare la conferma email nelle impostazioni Supabase`.

---

## Le tabelle

**`profiles`** — una riga per account (`id` = `auth.users.id`), con
`display_name`, `nickname`, `email`, `phone`, `avatar_color`.
Creata da sola alla registrazione dal trigger `on_auth_user_created`, che legge i
metadati passati a `signUp`.
Il `nickname` è unico senza distinzione fra maiuscole e minuscole (indice unico
parziale): il doppione lo blocca il database, non un controllo del client — che
peraltro ora non potrebbe più farlo, visto che ognuno legge solo il proprio
profilo.

**`groups`** — `code` (6 caratteri, alfabeto senza O/0/I/1), `name`, `owner_id`,
`created_at`.

**`group_members`** — *una riga per persona per gruppo*: `days`, `resists`,
`checkins` (jsonb, per data), `total`, `last_event`, `last_resist`,
`last_attivita`.
Qui sta il vero guadagno rispetto al KV di prima: entrare, uscire e pubblicare i
propri conteggi toccano solo la propria riga, quindi **il conflitto non può
nascere**. Il vecchio giro di scrittura → rilettura → confronto → nuovo tentativo
non serve più.

**`user_kv`** — il registro personale e i "già visti", una riga per chiave per
utente. Leggibile solo dal proprietario.

## Chi può fare cosa (RLS)

- Ognuno legge e scrive **solo il proprio** profilo, il proprio KV e la propria
  riga di membro. La regola che regge tutta l'app — *nessuno può registrare
  sigarette a nome di un altro* — è applicata dal server, non dal client: non si
  aggira modificando il codice dell'app.
- Le schede degli altri si vedono **solo se si è nello stesso gruppo**.
- Con il solo codice invito si vede l'anteprima e nient'altro: nome del gruppo e
  quante persone ci sono. Nessun nome, nessun numero.
- Ognuno può uscire da sé; il proprietario può rimuovere un membro **dal proprio
  gruppo soltanto**.
- Se esce il proprietario ma resta qualcuno, la proprietà passa a chi è entrato
  per primo. Se esce l'ultimo, il gruppo sparisce da solo.

## Funzioni sul database

| Funzione | A cosa serve |
|---|---|
| `create_group(nome, nome_membro, colore)` | crea il gruppo e ci entra, in un colpo solo |
| `join_group(codice, nome, colore)` | entra nel gruppo (o aggiorna nome e colore) |
| `group_preview(codice)` | anteprima prima di entrare |
| `delete_me()` | cancella il proprio account; profilo, registro e iscrizioni cadono in cascata |

## Verifica fatta

Simulando tre utenti direttamente sul database, 10 controlli su 10:

- chi è nel gruppo vede tutti i membri; chi è fuori non ne vede nessuno;
- un membro **non** riesce ad alterare i numeri di un altro;
- il registro privato di uno **non** è leggibile da altri;
- il proprietario di un gruppo **non** può toccare i membri di un altro gruppo
  (era un bug vero, trovato e corretto: un riferimento ambiguo nella policy
  rendeva la condizione sempre vera);
- l'anteprima mostra nome e numero di persone, e basta;
- uscito un membro il gruppo resta, uscito l'ultimo sparisce;
- il profilo si crea da solo alla registrazione.

---

## Cosa è cambiato nel codice

| File | |
|---|---|
| `src/auth/supabaseClient.js` | **nuovo** — client, chiavi, numero → email tecnica |
| `src/auth/index.js` | ora punta a `supabaseAuth`; `localAuth` resta come fallback se mancano le variabili d'ambiente |
| `src/auth/supabaseAuth.js` | nickname unico via indice del database (errore `23505`), recupero SMS con messaggio chiaro se il provider non c'è |
| `src/data/groups.js` | **riscritto** sulle tabelle: niente più tentativi e confronti |
| `src/installStorage.js` | **nuovo** — installa `window.storage`: database come verità, dispositivo come cache, coda di riscrittura per quello che parte offline |
| `src/windowStorage.js` | non definisce più `window.storage`: esporta `localKV`, la copia locale |
| `src/utils/storage.js` | via il parametro `shared`: i dati condivisi non passano più da un KV |
| `src/main.jsx` | importa `./installStorage` al posto di `./windowStorage` |
| `src/App.jsx` | i gruppi si leggono da `groups.fetch` / `groups.mine`, non più da `readStore(groupKey(...), null, true)` |

> Nota sui documenti del progetto: qui i file sono salvati per nome, e di
> `index.js` ce ne sono tre (auth, components, screens). Il nuovo selettore di
> autenticazione è salvato come **`auth/index.js`** per non sovrascrivere gli
> altri: il vecchio `index.js` che importa solo `localAuth` è quello superato.

### Variabili d'ambiente (facoltative)

I valori sono già scritti come default nel client, quindi l'app parte senza
configurare niente. Per separare gli ambienti, in `.env` (non versionato):

```
VITE_SUPABASE_URL=https://mzsiqlhovliginqazwrx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_rq6ZNqXRTef18qCjDAhOBw_PoaP703l
```

Serve il pacchetto `@supabase/supabase-js`.

### Migrazioni

Adesso stanno **nel repository**, in `supabase/migrations/` — scaricate dal
progetto e messe lì. Prima esistevano solo sul progetto remoto: se fosse
sparito (cancellato per sbaglio, piano free in pausa, account perso) non
sarebbe rimasto niente da cui ricostruire tabelle, policy e funzioni.

```bash
npx supabase link --project-ref mzsiqlhovliginqazwrx
npx supabase db push     # applica le migrazioni a un progetto nuovo
npx supabase db pull     # riporta nel repo modifiche fatte a mano dal pannello
```

Dettagli e ordine dei file in `supabase/README.md`.

---

## Cosa manca ancora

1. **Recupero password via SMS**: servono due cose, non una. Un provider SMS
   (Twilio, Vonage) configurato in Supabase, **e** il numero legato davvero
   all'utente con `supabase.auth.updateUser({ phone })` — oggi la registrazione
   avviene su email tecnica e `auth.users.phone` resta vuoto, quindi un OTP non
   raggiungerebbe l'account nemmeno con Twilio attivo. Finché mancano, l'app lo
   dice invece di far aspettare un codice che non arriverà.
2. **Realtime**: oggi il gruppo si aggiorna a intervalli (30s se sei nella
   schermata gruppo, 90s altrimenti). Con Supabase Realtime le sigarette degli
   altri arriverebbero nell'istante in cui vengono registrate — è quello che dà
   al gruppo il senso di presenza.
3. **Notifiche push vere**: le notifiche di sistema partono solo con l'app aperta.
   Per avvisare davvero quando qualcuno del gruppo registra serve una Edge
   Function + push (FCM/APNs), quindi il pacchetto Capacitor.
4. **Tappe del corpo a schermo spento**: da browser non funzionano — non c'è
   service worker e i Notification Triggers li supportano solo alcuni browser
   Chromium. Servono `@capacitor/local-notifications` e l'app impacchettata.

Fatto invece: conferma email disattivata, scaffolding completo del progetto
(`package.json`, `vite.config.js`, `index.html`, `.env.example`, ESLint) e i bug
elencati nell'audit — pulsante "+" dei gruppi, logout che restava appeso,
fallback locale rotto, doppione delle TAPPE, gestione errori sulla creazione
gruppo.
