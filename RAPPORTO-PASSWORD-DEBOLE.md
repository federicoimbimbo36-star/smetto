# Password sotto il minimo — prova, esito, correzione

Sessione del 3 settembre 2026. Progetto `smetto`, ref `mzsiqlhovliginqazwrx`.

## Cosa è stato modificato sul progetto Supabase

**Niente.** Nessun account creato, nessuna impostazione di Auth toccata,
nessuna query di scrittura. Va detto in chiaro perché il resto di questo
documento vale solo se questa riga è vera.

Il motivo è duplice, e il primo basta da solo:

- dal sandbox `mzsiqlhovliginqazwrx.supabase.co` e `api.supabase.com`
  rispondono `403 host_not_allowed`;
- il connettore Supabase di questa sessione espone lettura del progetto,
  SQL, migrazioni, edge function e advisor, ma **nessuno strumento per la
  configurazione di Auth**: il minimo password vive in GoTrue, non nel
  database.

I punti 1, 2, 3 e 7 della richiesta — crea l'account di prova, alza il
minimo nel pannello, prova il login, elimina l'account — restano quindi da
eseguire a mano. Sotto trovi come, e cosa deve venire fuori.

Quello che segue non è una previsione su cosa succederebbe: è la stessa
domanda risolta per un'altra strada, guardando il codice che risponde.

---

## Punto 4 — la risposta

### a. Il server emette la sessione

`internal/api/token.go` del server GoTrue, percorso `grant_type=password`,
righe 129-209:

```go
var weakPasswordError *WeakPasswordError
if isValidPassword {
    if err := a.checkPasswordStrength(ctx, params.Password); err != nil {
        if wpe, ok := err.(*WeakPasswordError); ok {
            weakPasswordError = wpe          // ← messo da parte
        }
    }
}
…
token.WeakPassword = weakPasswordError       // ← allegato
return sendJSON(w, http.StatusOK, token)     // ← 200, con la sessione
```

Il controllo di robustezza **riempie una variabile e non interrompe
niente**. La sessione viene emessa comunque e l'avviso viaggia allegato a
un `200`.

Il campo è dichiarato in `internal/tokens/service.go`:

```go
WeakPassword interface{} `json:"weak_password,omitempty"`
```

e la sua forma in `internal/api/password.go`:

```go
type WeakPasswordError struct {
    Message string   `json:"message,omitempty"`
    Reasons []string `json:"reasons,omitempty"`
}
```

con `reasons` che contiene `"length"` quando la password è più corta di
`config.Password.MinLength`.

### b. `data.session` presente o assente, tipo/codice/messaggio dell'errore

Eseguito, non ricordato: `@supabase/supabase-js` 2.112.4 vero, con il solo
`fetch` sostituito da risposte costruite sulla forma esatta di quelle
struct. La prova è in `verifica/password-debole.mjs`, blocco A.

| risposta del server | `data.session` | errore | `data.weakPassword` |
|---|---|---|---|
| **200 + `weak_password`** — l'account storico dopo il minimo a 12 | **presente** | **`null`** | `{ message: "Password should be at least 12 characters.", reasons: ["length"] }` |
| 400 `invalid_credentials` — password sbagliata davvero | `null` | `AuthApiError`, code `invalid_credentials`, status 400 | `null` |
| 422 `weak_password` — la forma di `signUp` e `updateUser` | `null` | `AuthWeakPasswordError`, code `weak_password`, status 422, `reasons: ["length"]` | `null` |

La riga che conta è la prima. **Al login `AuthWeakPasswordError` non si
presenta**: nasce solo in `handleError`, cioè da una risposta HTTP di
errore. Su un `200` la libreria passa da `_sessionResponsePassword`, che
copia il campo in `data.weakPassword` e lascia `error` a `null`.

### c. Comportamento visualizzato dall'app — il codice *prima*

Il `signIn()` originale, ripreso dallo ZIP senza modifiche, eseguito contro
le stesse tre risposte:

| caso | `signIn()` restituiva |
|---|---|
| 200 + `weak_password` | `{ user }` — si entrava, **`passwordDaAggiornare` assente** |
| 400 credenziali sbagliate | `{ error: 'credenziali' }` |
| 422 password debole | `{ error: 'credenziali' }` |

### d. Cambio password immediato: sì

`changePassword()` riverifica la password attuale rifacendo il login con
`signInWithPassword`. Su un `200` non c'è errore, quindi la verifica passa
e la strada per mettersi in regola era già aperta.

---

## Punti 5 e 6 — quale dei due si applica

**Il punto 6 non si applica.** Il server restituisce la sessione: alzare il
minimo a 12 **non chiude fuori nessuno**. Nessuna strategia di migrazione
da inventare, il comportamento di GoTrue *è già* la migrazione.

**Il punto 5 si applica, ma non per il motivo previsto.** `signIn()` non
trasformava quell'accesso in «credenziali sbagliate» — la premessa
letterale del punto 5 è falsa, ed è la notizia buona. Il difetto era
l'altra metà: **l'avviso veniva buttato via** insieme al resto di `data`.

Il che vuol dire che l'utente storico entrava su «Oggi», contava la sua
sigaretta, e la password da 8 caratteri restava lì per sempre. Alzare il
minimo non cambiava niente **per le uniche persone che il punto 5 doveva
proteggere**: quelle che c'erano già.

---

## Correzione

### `src/auth/supabaseAuth.js`

Due funzioni pure, esportate perché siano provabili senza un server:

- `passwordDebole(error)` — vero solo per l'errore di password debole,
  riconosciuto per nome **e** per codice perché `auth-js` li riempie in
  punti diversi. Per niente altro: confondere qui un errore di rete con
  una password debole farebbe entrare qualcuno che non doveva entrare.
- `leggiEsitoAccesso(esito)` — decide se si entra e se c'è qualcosa da
  dire sulla password. **Guarda la sessione prima dell'errore**: oggi le
  due cose non convivono mai, ma se un giorno convivessero l'ordine
  inverso butterebbe via un accesso riuscito.

`signIn()` ci passa attraverso e restituisce `passwordDaAggiornare` solo
quando c'è davvero qualcosa da sistemare.

`changePassword()`: una password che il server giudica debole **non è una
password sbagliata**, è esattamente quella che la persona è venuta a
cambiare. Trattarla come errore chiuderebbe l'unica uscita — entrare sì,
mettersi in regola no. Vicolo cieco.

L'import di `./supabaseClient` ha ora l'estensione `.js` esplicita: Vite la
mette da sé, node no, e senza quella la verifica dovrebbe provare una copia
della logica riscritta nel test invece delle funzioni vere.

### `src/App.jsx`

Con l'avviso si atterra sul **Profilo**, dove il campo del cambio password
è già a schermo, invece che su «Oggi». Nessun blocco: l'app si usa lo
stesso, la schermata giusta è a un tocco invece che a quattro.

L'errore `password-debole` — il ramo difensivo, oggi irraggiungibile — ha
un suo messaggio che manda al recupero password. Rimandare a ridigitare la
password appena digitata bene è un giro a vuoto che dopo tre tentativi fa
dare la colpa a sé stessi.

### Stesse tre risposte, codice nuovo

| caso | `signIn()` restituisce ora |
|---|---|
| 200 + `weak_password` | `{ user, passwordDaAggiornare: ["length"] }` |
| 400 credenziali sbagliate | `{ error: 'credenziali' }` |
| 422 password debole | `{ error: 'password-debole' }` |

---

## Verifica

`verifica/password-debole.mjs`, 23 controlli in due blocchi:

- **A** — cosa fa `auth-js` davvero. Non una finta della libreria: la
  libreria vera, con il solo `fetch` sostituito. Se un giorno `npm update`
  cambia quel comportamento, questo blocco lo dice invece di lasciarlo
  scoprire a un utente.
- **B** — cosa ne fa l'app, chiamando le funzioni vere esportate da
  `supabaseAuth.js`, non una copia della loro logica riscritta nel test.

Suite completa: **2.365 controlli in 9 suite + 44 stati renderizzati, 0
fallimenti.** Lint 0 errori / 0 avvisi. Build pulita (resta il solo avviso
di dimensione del chunk, preesistente).

Righe toccate: 94 in `supabaseAuth.js`, 35 in `App.jsx`, 2 in
`package.json`. La maggior parte sono commenti.

---

## Cosa resta da fare a mano

`verifica/password-server.mjs` è ora nel repo, con una prova in più.

**L'ordine conta**: l'account con password corta si può creare solo finché
il minimo è ancora 6.

```bash
node verifica/password-server.mjs prepara    # 1) PRIMA di cambiare l'impostazione
#    → pannello: Authentication → Sign In / Providers → Email
#      → Minimum password length = 12 → Save
node verifica/password-server.mjs verifica   # 2) DOPO
node verifica/password-server.mjs pulisci    # 3) il punto 7, quando hai finito
```

### La prova 3c è quella nuova, ed è quella da guardare

Le prove 3a e 3b dicono che si entra. **3c dice che l'avviso arriva**, cioè
che `data.weakPassword` è popolato sul tuo progetto vero.

È il segnale su cui poggia tutta la correzione: senza, `signIn()` non ha
niente da seguire, l'accesso riesce, e la password corta resta corta per
sempre. Se 3c esce rossa, o la prova 1 è rossa a sua volta (il minimo non è
salito davvero) o `PW_LEGACY` è già a norma e la prova non sta misurando
quello che crede.

### Cosa non è stato toccato

SMS/OTP, CAPTCHA, policy RLS, migrazioni, schema, dati, e la protezione
contro le password compromesse — che sul piano free resta comunque non
attivabile, come già annotato in `RAPPORTO-PASSWORD-SERVER.md`.

---

## Aggiunta: gli account di prova sopravvivevano alla pulizia

Difetto trovato dopo la prima consegna, tutto dentro
`verifica/password-server.mjs`. Non riguarda l'app: riguarda lo strumento
con cui l'app si prova.

### Il difetto

```js
const PW_NUOVA = 'Qz7' + Math.random().toString(36).slice(2, 12) + 'Lm!4x';
```

Riga al livello del modulo, quindi **rieseguita a ogni avvio**. Dentro un
processo solo è innocua. Ma le tre fasi sono tre processi diversi, e la
prova 4b **cambia davvero** la password dell'account legacy usando quel
valore.

Due processi, due valori:

```
processo 1: Qz7din5215d9uLm!4x
processo 2: Qz7s2oui7i468Lm!4x
```

`verifica` scriveva il primo sul server e finiva. `pulisci` partiva, ne
generava un altro, e provava a entrare con quello — più la `vecchia8`, che
sul server non valeva più. Nessuna delle due apriva una sessione, quindi
nessuna `delete_me`, quindi l'account restava in Authentication → Users
**per sempre**, senza più nessun modo di toglierlo da riga di comando.

Il comando che serve a non lasciare tracce era quello che ne lasciava una
che non si poteva più togliere.

### La cura

Un file di stato, `verifica/.stato-prove-password.json`, scritto da
`prepara` e riletto dalle altre due fasi. Il file non è la parte
interessante: lo sono le due regole che lo governano.

**Si scrive prima di agire.** La password nuova finisce nel file *prima*
della PUT che la imposta. Se la richiesta parte, arriva e la risposta si
perde per strada, sul server c'è già la password nuova: scrivendola dopo,
quel caso ricrea esattamente il difetto che stiamo togliendo. Funzionerebbe
in tutti i casi tranne quello in cui serve.

**Non si sostituisce, si accumula.** `passwordDaProvare` è un elenco, la
più recente davanti. `pulisci` le prova in ordine, quindi rientra sia dopo
un cambio riuscito sia dopo un cambio mai partito.

Attorno, tre cose che il difetto ha reso evidenti:

- `esiste` (`true` / `false` / ignoto) distingue **«non c'è niente da
  cancellare»** da **«c'è qualcosa e non riesco a toglierlo»**. Senza
  questa distinzione o il file resta lì per sempre dopo un `prepara` a
  vuoto, o sparisce lasciando account vivi;
- **il file si rimuove solo a pulizia completa.** Se anche una sola
  cancellazione fallisce resta dov'è: è l'unico posto in cui esistono le
  password di quello che è rimasto, e cancellarlo trasformerebbe una
  pulizia incompleta in una pulizia impossibile;
- una **guardia sul progetto**: se il file è stato creato per un progetto
  e adesso `VITE_SUPABASE_URL` ne indica un altro, `verifica` e `pulisci`
  si fermano invece di andare a tentoni.

Nel file non ci sono chiavi: né `apikey`, né publishable, né `service_role`,
né token di sessione. Solo numeri finti (+39 000 000 000x) e le password
usa-e-getta che lo script ha creato lui stesso. È escluso da Git e scritto
con permessi `0600`. Entrambe le cose sono controllate dalla suite, sul
testo del file scritto e non sull'oggetto in memoria.

### La verifica

`verifica/password-server-stato.mjs`, 43 controlli.

Il blocco C **non simula i processi: ne avvia tre veri** con `spawnSync`,
contro un finto server su file. Provare il passaggio fra processi restando
dentro un processo solo proverebbe la cosa sbagliata — la memoria condivisa
è esattamente ciò che nella realtà non c'è.

Il blocco D è la controprova, e resta nella suite per sempre: rifà la
stessa sequenza **con il comportamento di prima**, password generata dentro
il processo di `verifica` e mai salvata. Deve fallire. Se un giorno
passasse insieme al blocco C, vorrebbe dire che C non sta più misurando
niente.

Nessuna chiamata a Supabase, di produzione o di altro tipo: il finto server
è un JSON `{ email: password }` in una cartella temporanea.

### File toccati in questo giro

`verifica/password-server.mjs`, `verifica/password-server-stato.mjs`
(nuovo), `.gitignore`, `package.json`. `src/` e `supabase/` sono rimasti
identici byte per byte, e il bundle prodotto ha lo stesso nome con hash di
prima (`index-DRKof4Ul.js`): la prova che il codice dell'app non è stato
sfiorato.
