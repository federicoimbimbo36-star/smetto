# Verifica anti-bot davanti all'autenticazione (Cloudflare Turnstile)

Revisione r1. Solo codice: **niente è stato acceso, creato o configurato**
su Cloudflare, Supabase, Vercel o GitHub. Nessuna migrazione applicata,
nessun account reale creato, nessuna chiave scritta in nessun file.

---

## Il problema

Sul piano free di Supabase le difese disponibili contro la creazione
automatica di account e contro i tentativi di accesso a tappeto sono due, e
una era già esaurita: il minimo di 12 caratteri riguarda la qualità delle
password, non chi le crea. La protezione contro le password compromesse
richiede il piano Pro.

La registrazione, poi, è un bersaglio comodo: l'account è identificato da
un'email tecnica derivata dal numero di telefono, la conferma email è
spenta e `signUp` restituisce subito una sessione. Chi scorre i numeri
crea account veri.

Resta il CAPTCHA, che Supabase supporta in proprio.

## Cosa fa Supabase e cosa deve fare l'app

Con l'interruttore acceso, il server di autenticazione rifiuta con
`400 captcha_failed` ogni richiesta a `/signup`,
`/token?grant_type=password`, `/recover`, `/otp`, `/magiclink` e `/resend`
che non porti un token valido.

**Il rinnovo della sessione è escluso dal server** (`grant_type=refresh_token`,
`pkce`, `id_token`): chi è già dentro non incontra mai una sfida, e il
risveglio delle schede su iOS non è toccato. È la ragione per cui questa
modifica non ha bisogno di niente sul percorso della sessione.

L'app deve fare tre cose, e sono tutte e tre in `src/utils/captcha.js`:

1. **allegare il token** alle chiamate → `conCaptcha`
2. **riconoscere il rifiuto** per quel che è → `captchaFallito`
3. **azzerare il widget dopo ogni tentativo** → `creaGestore`, `conTentativo`

Il punto 3 non è cosmetico. Un token Turnstile si spende una volta sola: al
secondo invio torna indietro come già speso. Senza azzeramento, chi sbaglia
la password e la ridigita giusta si vede rifiutare anche quella.

## Le quattro chiamate protette, nell'app

| funzione | endpoint | note |
|---|---|---|
| `signUp` | `/auth/v1/signup` | |
| `signIn` | `/auth/v1/token?grant_type=password` | |
| `changePassword` | `/auth/v1/token?grant_type=password` | **il percorso che si dimentica** |
| `requestRecovery` | `/auth/v1/otp` | |

`changePassword` merita la riga in grassetto: `updateUser` non è protetto,
ma il controllo della password attuale passa da un accesso vero. Senza
token lì, con la protezione accesa, accesso e registrazione funzionano
benissimo e il cambio password smette di funzionare — e nessuno cambia la
password mentre collauda il login.

`verifyRecovery` **non** riceve il token, ed è voluto: la verifica del
codice passa da `/verify`, che il server non protegge. Metterlo lì darebbe
l'impressione di una protezione che non c'è.

## File toccati

**Nuovi**

| file | cosa contiene |
|---|---|
| `src/utils/captcha.js` | `MESSAGGIO_CAPTCHA`, `leggiSitekey`, `conCaptcha`, `captchaFallito`, `creaGestore`, `conTentativo` |
| `src/components/Turnstile.jsx` | guscio React: render esplicito, attesa dello script, errore, scadenza, azzeramento |
| `verifica/turnstile.mjs` | 103 controlli, nessuna rete |
| `RAPPORTO-TURNSTILE.md` | questo file |

**Modificati**

| file | modifica |
|---|---|
| `index.html` | script ufficiale `api.js?render=explicit`, `async defer` |
| `vercel.json` | `script-src` += Cloudflare; nuova `frame-src`. Nient'altro toccato |
| `src/auth/supabaseAuth.js` | token sulle quattro chiamate; esito `captcha` in `leggiEsitoAccesso`, `signUp`, `changePassword`, `requestRecovery` |
| `src/auth/localAuth.js` | firme allineate, token accettato e ignorato |
| `src/App.jsx` | sitekey dall'ambiente, due token e due contatori, tre handler avvolti in `conTentativo`, due widget montati |
| `src/screens/AuthScreen.jsx` | prop `captcha`, sopra errore e bottone |
| `src/screens/ProfiloScreen.jsx` | prop `captcha`, nel blocco password |
| `src/components/index.js` | export di `Turnstile` |
| `src/styles.css` | `.captcha`, `.captcha-riquadro`, `.captcha-nota` |
| `.env.example` | `VITE_TURNSTILE_SITEKEY` documentata e **vuota** |
| `verifica/intestazioni.mjs` | B5 riscritta, B5b/B5c/C5b–C5g nuove, C1 aggiornata |
| `verifica/password-server.mjs` | solo commento: quando lanciarlo rispetto all'interruttore |
| `package.json` | `verifica:completa` include la suite nuova |
| `README.md` | conteggi allineati alla misura |

## Decisioni, con il loro prezzo

**`script-src 'self'` si allarga, e va detto.** Era il pezzo più prezioso
di quella CSP. Turnstile gira nel browser e non esiste modo di usarlo senza
caricare il suo `api.js` dal suo dominio. L'alternativa raccomandata da
Cloudflare — nonce per richiesta con `strict-dynamic` — qui non è
disponibile: gli header di `vercel.json` sono statici e un nonce diverso a
ogni risposta non lo possono generare. Il controllo B5 usa `eq` e non
`includes`: è un elenco chiuso, e una terza origine aggiunta «per provare»
lo fa fallire.

**`connect-src` non è stata allargata.** La documentazione di riferimento
di Turnstile chiede due direttive; la pagina sulle WebView ne mostra tre.
Nel dubbio non si allarga: il controllo B5c fallisce se qualcuno lo fa
senza una prova. Se la console di produzione mostrerà una connessione
bloccata verso `challenges.cloudflare.com`, si aggiunge allora, cambiando
quel controllo.

**Nessun blocco locale prima dell'invio.** Se il token manca, la richiesta
parte lo stesso e decide il server. Un controllo lato client chiuderebbe
fuori chi ha un'estensione che ferma lo script di Cloudflare, in una fase
in cui la protezione su Supabase è ancora spenta e quel blocco non avrebbe
ragione di esistere.

**Senza sitekey l'app è identica a prima.** Niente widget, niente token, e
sul filo lo stesso identico corpo di richiesta. È la proprietà che rende
questo codice pubblicabile **prima** di accendere l'interruttore, quindi
senza nessuna finestra in cui accesso e registrazione siano rotti.

**Un errore che avevo scritto io, corretto dalla controprova.** Il commento
in `creaGestore` sosteneva che `if (id)` avrebbe rotto l'azzeramento perché
Turnstile chiama `"0"` il primo widget. È falso: `"0"` è una stringa non
vuota, quindi è vera. La controprova non è fallita e l'ha detto. Il
confronto `id !== null` resta, per la ragione che avanza — non dipendere
dal tipo di un identificativo che arriva da codice di terze parti — e il
banco prova ora entrambe le forme, stringa e numero. Il commento è stato
riscritto per dire com'è.

## Verifiche eseguite

```
npm run lint                 0 errori, 0 avvisi
npm run verifica:completa    2643 controlli superati, 0 falliti
npm run build                pulita (dist/ non è nella consegna)
```

Dettaglio: controlli 311 · persistenza 133 · redesign 1094 · gruppi 25 ·
coda-utente 49 · annulla-lotto 41 · account 297 · affidabilità 418 ·
password-debole 23 · password-server-stato 77 · **turnstile 103** ·
**intestazioni 72** (75 con `dist/` presente) · schermate 44 stati.

I conteggi nel README erano già disallineati nella versione di partenza
(dichiarava 2023, `account 22`, `affidabilita 381`; la misura dà
rispettivamente 2504 prima di questa revisione, 297 e 418). Sono stati
riportati alla misura reale, non stimati.

### Controprove: undici su undici

Ogni controllo nuovo è stato fatto fallire contro il codice di prima. Non
descritte: eseguite.

| # | modifica introdotta di proposito | controlli caduti |
|---|---|---|
| 1 | `conCaptcha` non allega più il token | A1, A2, A3, A4, B3d, B3e |
| 2 | `leggiEsitoAccesso` senza il ramo captcha | D4, D4b, D6 |
| 3 | `azzera` con `if (id)` invece di `id !== null` | C5e, C5f |
| 4 | `conTentativo` senza il `finally` | C9, C10, C10b |
| 5 | `changePassword` senza il ramo captcha | D8, D8b |
| 6 | `requestRecovery` senza il ramo captcha | D9 |
| 7 | CSP di prima (`script-src 'self'`, nessuna `frame-src`) | B5, B5b, C2, C5c |
| 8 | `index.html` senza lo script | C1, C3, C5b, C5c, C5d, C5e |
| 9 | `connect-src` allargata a Cloudflare senza prove | B5c |
| 10 | una chiave finta scritta nel codice | F1 |
| 11 | sitekey valorizzata in `.env.example` | F3 |

La controprova 3 è quella che ha corretto me, non il codice (vedi sopra).
La controprova 4 all'inizio uccideva il banco invece di riportare: il
controllo C10 è stato reso resistente, così un fallimento futuro si legge
invece di far morire il processo a metà.

### Cosa queste verifiche NON provano

Non provano niente di ciò che vive fuori da questa macchina, e non lo
dichiaro:

- che la protezione sia accesa sul progetto Supabase vero;
- che Cloudflare accetti il dominio di produzione;
- che il widget si disegni bene su un iPhone vero;
- che la CSP in produzione non blocchi niente.

Sono le quattro cose della checklist qui sotto, e si vedono solo dai
pannelli e dal telefono.

## Ordine operativo

L'interruttore su Supabase si accende **per ultimo**. Con l'interruttore
spento Supabase ignora il token che gli arriva, quindi il codice nuovo si
può pubblicare e collaudare in produzione prima dello scatto: nessuna
finestra di rottura.

### 1. Cloudflare (tu)

- Account gratuito, sezione **Turnstile** → **Add widget**.
- Nome: qualcosa di riconoscibile, es. «Smetto — auth».
- **Hostname**: `smetto.vercel.app`. Va scritto come dominio puro, senza
  `https://` e senza porta. Aggiungendolo si autorizzano i suoi
  sottodomini, **non** i fratelli: le anteprime Vercel
  (`smetto-git-...vercel.app`) non sono coperte.
- Modalità: **Managed**.
- Copia **sitekey** e **secret key**. La secret non va nel repository, non
  va in Vercel e non va scritta in chat: il solo posto in cui serve è
  Supabase, al punto 4.

### 2. Vercel (tu) — solo la sitekey

- Variabile d'ambiente `VITE_TURNSTILE_SITEKEY` = la **sitekey**, ambiente
  Production.
- Niente altro. In Vercel non esiste un lato server che verifichi il token:
  la secret lì non serve e non deve arrivarci.
- Per le anteprime: o si lascia vuota (nessun widget, comportamento di
  oggi), o si usa una sitekey finta di Cloudflare, perché gli hostname
  delle anteprime non corrispondono.

### 3. Pubblicazione e primo collaudo (tu)

- Deploy della revisione.
- Conferma con `VERIFICA-RILASCIO.md` quale build è davvero in produzione.
- Con l'interruttore **ancora spento**: il riquadro deve comparire sotto i
  campi, e registrazione, accesso e cambio password devono funzionare
  esattamente come prima.
- Se ti servono ancora, lancia adesso le prove di
  `verifica/password-server.mjs`: dopo il punto 4 verranno rifiutate, ed è
  previsto (la ragione è scritta nell'intestazione di quel file).

### 4. Supabase (tu) — solo la secret, e solo adesso

- Authentication → **Attack Protection** → **Enable CAPTCHA protection**.
- Provider: **Cloudflare Turnstile**.
- Incolla la **secret key**. Salva.

### 5. Prove manuali dopo l'attivazione (tu)

Sono sette, e la quarta e la quinta sono quelle che di solito non fa nessuno.

1. **Registrazione** di un account nuovo.
2. **Accesso** con quell'account.
3. **Secondo tentativo dopo un errore**: password sbagliata, poi giusta,
   senza ricaricare la pagina. È la prova dell'azzeramento: se il secondo
   tentativo fallisce, il token non si sta azzerando.
4. **Cambio password dal Profilo**: il percorso che si dimentica.
5. **Rinnovo della sessione**: app chiusa e riaperta dopo più di un'ora.
   Non deve comparire nessuna sfida. Conferma sul campo che il refresh è
   escluso.
6. **Messaggio d'errore**: un rifiuto anti-bot non deve mai leggersi come
   «numero o password non corretti». Per provocarlo, blocca
   `challenges.cloudflare.com` dagli strumenti da sviluppatore e prova a
   entrare.
7. **Console aperta su produzione**: zero violazioni di CSP. Se compare una
   connessione bloccata verso `challenges.cloudflare.com`, allora — e solo
   allora — si aggiunge `connect-src` e si cambia il controllo B5c.
   Da mettere in conto: la modalità invisibile di Turnstile genera rumore
   in console che nasce **dentro** il suo iframe. Non è un problema tuo e
   non si corregge dal tuo lato.

**Su iPhone vero**, in Safari e con «Aggiungi a schermata Home»: il riquadro
non deve finire sotto la tastiera e il bottone «Crea il mio account» deve
restare raggiungibile. Il CSS tiene il posto con `min-height: 65px` apposta,
così la schermata non salta mentre lo script arriva, ma la prova la fa il
telefono.

### Rientro

Interruttore **OFF** su Supabase. L'app continua a mandare un token che il
server ignora, e tutto torna a funzionare. Un clic, nessun rilascio, nessun
rollback di codice.

## Rimasto aperto

- **Capacitor.** In una WebView l'origine della pagina è
  `capacitor://localhost` o `http://localhost`, e Cloudflare raccomanda che
  le sitekey di produzione non ammettano domini locali. Non è verificato
  come Turnstile risolva un'origine `capacitor://`: va misurato su un
  dispositivo **prima** di impacchettare, non dopo. Può servire un widget
  separato per l'app.
- **`/verify` non è protetto dal CAPTCHA.** Oggi non espone niente perché
  non c'è nessun provider SMS. Quando ci sarà, sei cifre indovinabili con
  360 tentativi l'ora per IP diventano l'anello debole, e la leva giusta
  lì è il rate limit `verify`, non il CAPTCHA.
- **Lo script si carica anche senza sitekey**, cioè oggi. Una richiesta in
  più a ogni apertura, nessun widget. Si può rendere condizionale, ma
  vorrebbe dire iniettare lo script da JavaScript e riscrivere a mano il
  controllo che evita di inserirlo due volte: non vale il cambio, finché la
  sitekey è configurata ovunque tranne che nelle anteprime.
