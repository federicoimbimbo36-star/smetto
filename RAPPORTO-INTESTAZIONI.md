# Intestazioni di sicurezza — `vercel.json`

Sessione del 3 settembre 2026. Nessun servizio esterno, nessuna modifica
al codice dell'app, nessuna modifica al backend.

## Prima: l'inventario

La CSP non è stata scritta a memoria. È stata ricavata da cosa il codice
chiede davvero, e il risultato è più corto di quanto ci si aspetterebbe:

| origine | chi la chiama | direttiva |
|---|---|---|
| `https://fonts.googleapis.com` | `@import` in `src/styles.css` (riga 27) | `style-src` |
| `https://fonts.gstatic.com` | il CSS di Google Fonts, di rimbalzo | `font-src` |
| `https://mzsiqlhovliginqazwrx.supabase.co` | `src/auth/supabaseClient.js` | `connect-src` |

E basta. Verificato sul bundle costruito, non solo sul sorgente:

- **niente `eval` né `new Function`** → `script-src 'self'` senza eccezioni;
- **nessuno script inline** in `dist/index.html`: Vite emette solo
  `<script type="module" src="/assets/…">`;
- **nessun `data:`** nel CSS costruito — le immagini stanno in `public/` e
  si servono per percorso, quindi `img-src 'self'` basta;
- **nessun WebSocket**: Realtime non è ancora usato, quindi niente `wss:`;
- `api.pwnedpasswords.com` compare **solo** in `verifica/password-server.mjs`,
  che gira da riga di comando e non dal browser: fuori dalla CSP.

## Gli header

Applicati a `"source": "/(.*)"`, quindi a ogni percorso e non a un elenco
di rotte che il giorno che se ne aggiunge una resta indietro.

### Content-Security-Policy

```
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'none';
form-action 'self';
script-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self';
connect-src 'self' https://mzsiqlhovliginqazwrx.supabase.co;
manifest-src 'self'
```

Nessun jolly, nessun `unsafe-eval`, nessuno schema `https:` nudo, nessuna
origine che il codice non chiami.

### Gli altri

| header | valore |
|---|---|
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `no-referrer` |
| `Strict-Transport-Security` | `max-age=31536000` |
| `X-Content-Type-Options` | `nosniff` |
| `Permissions-Policy` | venti funzioni negate, elenco sotto |

```
accelerometer=(), autoplay=(), browsing-topics=(), camera=(),
display-capture=(), encrypted-media=(), fullscreen=(), geolocation=(),
gyroscope=(), idle-detection=(), local-fonts=(), magnetometer=(),
microphone=(), midi=(), payment=(), publickey-credentials-get=(),
screen-wake-lock=(), serial=(), usb=(), xr-spatial-tracking=()
```

## Le tre decisioni che valeva la pena prendere piano

### `'unsafe-inline'` negli stili, e perché non negli script

Sono due direttive diverse e due rischi diversi. `script-src` resta
`'self'` secco: è lì che sta la protezione vera.

Per gli stili il codice ha 103 `style={{…}}`. Il bundle mostra che React
non li scrive come attributi HTML — non c'è un solo `setAttribute("style")`,
né iniezione di `<style>` a runtime — quindi passa dal CSSOM, che la CSP
non controlla. In teoria `'unsafe-inline'` si potrebbe togliere.

Non è stato tolto, e il motivo è il modo in cui fallirebbe: l'app si
presenterebbe **senza stili**, in produzione, in silenzio, e ci si
accorgerebbe solo quando lo dice qualcuno. Scommettere l'interfaccia su un
dettaglio interno di React per guadagnare una restrizione sugli stili — non
sugli script — non è uno scambio conveniente.

### `no-referrer`

Più stretto del default dei browser. Niente lo richiede: Supabase
autentica con bearer token e non guarda il `Referer`, Google Fonts nemmeno,
e l'app è una pagina sola senza percorsi che dicano qualcosa di chi la usa.

È comunque una scelta, non un obbligo: se un domani serve sapere da dove
arriva una richiesta, `strict-origin-when-cross-origin` è il gradino sotto
e la verifica lo accetta già.

### HSTS: `max-age` e nient'altro

Questa è la parte da leggere con attenzione, perché è l'unica riga che non
si può disfare in fretta.

**Niente `preload`.** È una porta a senso unico: i browser rifiutano
l'HTTP su quel dominio anche mesi dopo che lo si è tolto dalla lista. E su
un sottodominio di `vercel.app` non è nemmeno una cosa che si possa
chiedere, perché l'apice non è nostro — `vercel.app` è già nella lista di
preload per conto suo, e questa è la ragione per cui oggi l'header è quasi
solo una formalità.

**Niente `includeSubDomains`.** Su `smetto.vercel.app` non c'è nessun
sottodominio, quindi non aggiungerebbe niente. Ma è una promessa che vale
anche per i sottodomini che non esistono ancora: il giorno che arriva un
dominio proprio, `includeSubDomains` impegnerebbe tutto quello che ci sta
sotto — compreso qualcosa che parla ancora HTTP. Si aggiunge allora, dopo
aver controllato, non adesso «tanto non fa male».

## Le due cose che questi header potevano rompere in silenzio

Sono le uniche due che meritavano un controllo dedicato, e ce l'hanno.

**Le notifiche.** `Permissions-Policy` non ha nessuna voce che le governi —
il permesso si chiede con l'API `Notification`, non da qui — quindi non ce
n'è nessuna nell'elenco, e la verifica fallisce se ne compare una. Le icone
delle notifiche web (`/icon-192.png`, `/badge.png`) sono locali, quindi
`img-src 'self'` le copre; la verifica controlla anche che quei due file
esistano davvero in `public/`.

**Il pulsante «copia codice» del gruppo.** `handleCopiaCodice` usa
`navigator.clipboard.writeText`, e `clipboard-write` è una funzione che
`Permissions-Policy` governa sul serio. Negarla avrebbe rotto l'invito ai
gruppi senza nessun messaggio d'errore. Non è nell'elenco, e la verifica
fallisce se qualcuno ce la mette.

## La verifica

`verifica/intestazioni.mjs`, 65 controlli, nessuna rete: legge solo il
repository.

Non controlla che «ci sia una CSP». Confronta la CSP con il codice **nei
due versi**: ogni origine che il sorgente usa dev'essere permessa, e ogni
origine permessa dev'essere usata. Il secondo verso è quello che di solito
manca, ed è quello che impedisce a un'origine aggiunta «per sicurezza» di
restare lì per anni senza che nessuno sappia più se serve.

Il dominio Supabase non è scritto due volte: si legge da
`src/auth/supabaseClient.js`, così cambiare progetto fa fallire la prova
invece di lasciare una CSP che punta a quello di prima.

C'è anche una guardia per il futuro: se un giorno qualcuno scrive
`import logo from './logo.png'`, Vite inlina l'immagine come `data:` sotto
i 4 kB e `img-src 'self'` la bloccherebbe. La prova F1 legge il CSS
costruito e fallisce prima che succeda.

**Prova di mutazione.** Tredici indebolimenti provati uno per uno — da
`X-Frame-Options: SAMEORIGIN` a `frame-ancestors 'self'`, da un jolly
`https://*.supabase.co` a `clipboard-write=()`, da `preload` in HSTS a un
`camera=(self)` — e la suite li ha rilevati tutti e tredici. Senza questa
prova, «65 controlli superati» non direbbe che i controlli controllano.

## Da verificare dopo il deploy

Il file è statico: quello che segue non lo può dire.

1. **Che gli header arrivino davvero.**
   `curl -sI https://smetto.vercel.app | grep -i "content-security\|frame\|referrer\|permissions\|strict-transport"`.
   Vercel applica `headers` alle risposte del CDN: se un percorso non
   passasse di lì, non li avrebbe.
2. **Il download del backup.** `URL.createObjectURL` più
   `<a download>` è l'unica cosa dell'app che esce dagli schemi della CSP.
   Nei browser di oggi nessuna direttiva governa quel percorso — `navigate-to`
   non è mai arrivata — quindi *dovrebbe* funzionare, ma è una previsione,
   non una prova. Scarica il JSON e il CSV da Profilo **su Safari iOS e su
   Chrome**, con la console aperta. Se compare una violazione, la cura è
   `blob:` in `img-src`, oppure il download via `data:` URL.
3. **I font.** Se il testo appare con un carattere di sistema, la console
   dice quale direttiva ha bloccato cosa: `fonts.googleapis.com` sta in
   `style-src`, `fonts.gstatic.com` in `font-src`, e sono due direttive
   diverse proprio perché si rompono separatamente.
4. **La console pulita su un giro completo.** Accesso, registrazione di
   una sigaretta, gruppo, esportazione, cambio password. Una violazione CSP
   si vede solo in console: l'app non la mostra a chi la usa.
5. **Il giorno che arriva Realtime** (punto 3 di
   `claude/stato-e-prossimi-passi.md`): servirà
   `wss://mzsiqlhovliginqazwrx.supabase.co` in `connect-src`. Oggi non c'è
   perché oggi non serve, e la verifica lo pretende — quando servirà,
   fallirà lei per prima e dirà cosa manca.
6. **Il giorno che arriva un dominio proprio**: rileggere la sezione HSTS
   qui sopra prima di aggiungere `includeSubDomains`.

Facoltativo, quando il resto è verde: `https://securityheaders.com` e
l'analizzatore CSP di Google danno un secondo parere in trenta secondi.
