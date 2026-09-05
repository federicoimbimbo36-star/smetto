/* ------------------------------------------------------------------ */
/* intestazioni.mjs — gli header di sicurezza di vercel.json           */
/*                                                                     */
/*   node verifica/intestazioni.mjs                                    */
/*                                                                     */
/* Una CSP è una lista di permessi che nessuno rilegge. Sbagliarla ha  */
/* due esiti, e sono opposti:                                          */
/*                                                                     */
/*   · TROPPO STRETTA → l'app si rompe in produzione, in silenzio, e   */
/*     solo per chi la usa: i font non arrivano, oppure Supabase non   */
/*     risponde e sembra un problema di rete.                          */
/*   · TROPPO LARGA  → non protegge da niente, ma sembra di sì.        */
/*                                                                     */
/* Perciò questa suite non controlla che «ci sia una CSP». Confronta   */
/* la CSP con il CODICE, nei due versi:                                */
/*                                                                     */
/*   1. ogni origine esterna che il sorgente usa dev'essere permessa;  */
/*   2. ogni origine permessa dev'essere usata dal sorgente.           */
/*                                                                     */
/* Il verso 2 è quello che di solito manca. Senza, un'origine aggiunta */
/* «per sicurezza» resta lì per sempre e nessuno sa più se serve.      */
/*                                                                     */
/* In più guarda il BUNDLE COSTRUITO, se c'è: è lì che compaiono le    */
/* cose che il sorgente non mostra — un `data:` prodotto da Vite       */
/* inlinando un'immagine piccola, per esempio, che la CSP di oggi      */
/* bloccherebbe.                                                       */
/*                                                                     */
/* Nessuna rete: si legge solo il repository.                          */
/* ------------------------------------------------------------------ */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let passati = 0;
const falliti = [];
const ok = (nome, cond, extra = '') => {
  if (cond) passati += 1;
  else falliti.push(`${nome}${extra ? `\n      ${extra}` : ''}`);
};
const eq = (nome, a, b) => ok(
  nome,
  JSON.stringify(a) === JSON.stringify(b),
  `atteso ${JSON.stringify(b)}, ottenuto ${JSON.stringify(a)}`,
);

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const leggi = (...p) => readFileSync(join(RADICE, ...p), 'utf8');

/* ------------------------------------------------------------------ */
/* Il file                                                             */
/* ------------------------------------------------------------------ */

ok('A1  vercel.json esiste', existsSync(join(RADICE, 'vercel.json')));

const config = JSON.parse(leggi('vercel.json'));
const regole = config.headers ?? [];
eq('A2  una sola regola di header', regole.length, 1);

/* «tutte le pagine»: il pattern deve prendere la radice e qualunque
   percorso sotto, non una lista di rotte scritte a mano che il giorno che
   se ne aggiunge una resta indietro. */
eq('A3  la regola vale per ogni percorso', regole[0]?.source, '/(.*)');

const intestazioni = Object.fromEntries((regole[0]?.headers ?? []).map((h) => [h.key, h.value]));

for (const atteso of [
  'Content-Security-Policy', 'X-Frame-Options', 'Referrer-Policy',
  'Permissions-Policy', 'Strict-Transport-Security',
]) {
  ok(`A4  ${atteso} presente`, typeof intestazioni[atteso] === 'string' && intestazioni[atteso].length > 0);
}

/* Nessun servizio esterno tirato dentro dalla configurazione stessa. */
const testoConfig = leggi('vercel.json');
for (const proibito of ['report-uri', 'report-to', 'sentry', 'analytics', 'googletagmanager']) {
  ok(`A5  nessun servizio esterno: «${proibito}»`, !testoConfig.toLowerCase().includes(proibito));
}

/* ------------------------------------------------------------------ */
/* La CSP, direttiva per direttiva                                     */
/* ------------------------------------------------------------------ */

const csp = Object.fromEntries(
  intestazioni['Content-Security-Policy'].split(';')
    .map((d) => d.trim()).filter(Boolean)
    .map((d) => { const [nome, ...valori] = d.split(/\s+/); return [nome, valori]; }),
);

eq('B1  default-src chiuso su sé stessi', csp['default-src'], ["'self'"]);
eq('B2  base-uri bloccato', csp['base-uri'], ["'self'"]);
eq('B3  object-src spento', csp['object-src'], ["'none'"]);
eq('B4  form-action limitata', csp['form-action'], ["'self'"]);
/* L'UNICA ECCEZIONE, ED È UN ELENCO CHIUSO.

   `script-src 'self'` era il pezzo più prezioso di questa CSP e ci entra
   un'origine di terze parti: va detto per intero, non ammorbidito.

   Perché ci entra: la verifica anti-bot davanti ad accesso, registrazione
   e cambio password è Cloudflare Turnstile, e Turnstile gira nel browser —
   non esiste un modo di usarlo senza caricare il suo `api.js` dal suo
   dominio. Cloudflare raccomanda l'alternativa più stretta (un nonce per
   richiesta con `strict-dynamic`), che qui non è disponibile: gli header
   di `vercel.json` sono statici e un nonce diverso a ogni risposta non lo
   possono generare.

   Perché resta un elenco e non un permesso: `eq` e non `includes`. Se un
   domani qualcuno aggiunge una terza origine «solo per provare», questo
   controllo fallisce. Un `includes` no, e la deroga si allargherebbe da
   sola senza che nessuno la colleghi a questa decisione. */
eq('B5  script-src: sé stessi più la sola eccezione Turnstile', csp['script-src'],
  ["'self'", 'https://challenges.cloudflare.com']);

/* L'iframe della sfida. Prima non c'era nessuna `frame-src`, quindi
   ricadeva su `default-src 'self'` e l'iframe di Turnstile sarebbe stato
   bloccato — con il widget che resta un rettangolo vuoto e nessun errore
   visibile a parte una riga in console. Anche qui elenco chiuso. */
eq('B5b frame-src: solo l\'iframe della sfida', csp['frame-src'],
  ['https://challenges.cloudflare.com']);

/* LA DIRETTIVA CHE NON SI ALLARGA FINCHÉ NON SERVE.

   La documentazione di riferimento di Turnstile chiede due direttive:
   `script-src` e `frame-src`. La pagina sull'implementazione dentro le
   WebView mostra un esempio che aggiunge anche `connect-src`. Le due non
   concordano, e nel dubbio la scelta è stata: non allargare. Se un giorno
   la console di produzione mostrerà una connessione bloccata verso
   challenges.cloudflare.com, allora si aggiunge — con la prova in mano e
   cambiando questo controllo, non prima e non «per sicurezza». */
ok('B5c connect-src non è stata allargata a Cloudflare senza una prova',
  !(csp['connect-src'] ?? []).includes('https://challenges.cloudflare.com'));

/* Il doppio lucchetto contro l'iframe: `frame-ancestors` è quello che
   conta sui browser di oggi, `X-Frame-Options` copre quelli che non la
   leggono. Devono dire la stessa cosa: se un giorno uno dei due si
   allenta e l'altro no, il risultato dipende dal browser di chi apre. */
eq('B6  frame-ancestors: nessuno', csp['frame-ancestors'], ["'none'"]);
eq('B7  X-Frame-Options: DENY', intestazioni['X-Frame-Options'], 'DENY');

/* Gli stili inline di React. Nel bundle non c'è né iniezione di <style>
   né `setAttribute("style")` — React passa dal CSSOM, che la CSP non
   controlla — ma toglierlo qui vorrebbe dire scommettere l'interfaccia
   su quel dettaglio di implementazione: se cambia, l'app si presenta
   senza stili e nessuno se ne accorge finché non lo dice un utente. */
ok('B8  style-src accetta gli stili inline di React',
  csp['style-src']?.includes("'unsafe-inline'"));

/* Le due cose che NON devono esserci mai. */
const cspTesto = intestazioni['Content-Security-Policy'];
ok('B9  niente unsafe-eval', !cspTesto.includes('unsafe-eval'));
ok('B10 niente unsafe-inline negli script', !(csp['script-src'] ?? []).includes("'unsafe-inline'"));
ok('B11 nessun jolly', !/(^|[\s])\*|https:\/\/\*/.test(cspTesto), cspTesto);
ok('B12 nessuna origine in chiaro', !/\bhttp:\/\//.test(cspTesto));
ok('B13 niente schema nudo https:', !/(^|\s)https:(\s|;|$)/.test(cspTesto));

/* ------------------------------------------------------------------ */
/* Inventario: la CSP contro il codice, nei due versi                  */
/* ------------------------------------------------------------------ */

/* Le origini che il sorgente usa davvero. `verifica/` è escluso apposta:
   quello che fa `password-server.mjs` (HIBP, API di Supabase) gira da riga
   di comando, non nel browser, e non deve finire nella CSP. */
function origineDa(url) { try { return new URL(url).origin; } catch { return null; } }

function origineDelSorgente() {
  const trovate = new Set();
  const visita = (cartella) => {
    for (const voce of readdirSync(cartella, { withFileTypes: true })) {
      const percorso = join(cartella, voce.name);
      if (voce.isDirectory()) { visita(percorso); continue; }
      if (!/\.(jsx?|css|html|webmanifest)$/.test(voce.name)) continue;
      for (const u of readFileSync(percorso, 'utf8').match(/https?:\/\/[^\s'"`)]+/g) ?? []) {
        const o = origineDa(u);
        /* w3.org compare come namespace XML dentro gli SVG: è un
           identificatore, non un indirizzo da cui si scarica qualcosa. */
        if (o && o !== 'http://www.w3.org') trovate.add(o);
      }
    }
  };
  visita(join(RADICE, 'src'));
  visita(join(RADICE, 'public'));
  for (const u of leggi('index.html').match(/https?:\/\/[^\s'"`)]+/g) ?? []) {
    const o = origineDa(u);
    if (o && o !== 'http://www.w3.org') trovate.add(o);
  }
  return trovate;
}

const usate = origineDelSorgente();
const permesse = new Set(
  Object.values(csp).flat().filter((v) => v.startsWith('http')).map(origineDa).filter(Boolean),
);

eq('C1  il sorgente usa esattamente tre origini esterne', [...usate].sort(), [
  'https://challenges.cloudflare.com',
  'https://fonts.googleapis.com',
  'https://mzsiqlhovliginqazwrx.supabase.co',
]. concat([...usate].filter((o) => o === 'https://fonts.gstatic.com')).sort());

for (const o of usate) {
  ok(`C2  origine usata e permessa: ${o}`, permesse.has(o),
    'il sorgente la chiama ma la CSP non la elenca: in produzione verrebbe bloccata');
}

/* Il verso che di solito manca. `fonts.gstatic.com` è l'eccezione
   dichiarata: non compare nel sorgente perché è il CSS di Google Fonts a
   rimandarci, ed è l'unico modo di ricevere i file dei font. */
const attesePerRimbalzo = new Set(['https://fonts.gstatic.com']);
for (const o of permesse) {
  ok(`C3  origine permessa e usata: ${o}`,
    usate.has(o) || attesePerRimbalzo.has(o),
    'è nella CSP ma nessuno la chiama: va tolta, o va spiegato perché resta');
}

/* Il dominio Supabase non si scrive due volte a mano: si legge da dove
   lo legge l'app, così cambiare progetto fa fallire questa prova invece
   di lasciare una CSP che punta al progetto di prima. */
const [dominioSupabase] = leggi('src', 'auth', 'supabaseClient.js').match(/https:\/\/[a-z0-9]+\.supabase\.co/) ?? [];
ok('C4  la CSP consente il progetto Supabase che usa il client',
  Boolean(dominioSupabase) && (csp['connect-src'] ?? []).includes(dominioSupabase),
  `client: ${dominioSupabase}, connect-src: ${(csp['connect-src'] ?? []).join(' ')}`);

ok('C5  Google Fonts è consentito come foglio di stile',
  (csp['style-src'] ?? []).includes('https://fonts.googleapis.com'));
ok('C6  i file dei font arrivano da gstatic',
  (csp['font-src'] ?? []).includes('https://fonts.gstatic.com'));

/* ------------------------------------------------------------------ */
/* Lo script di Turnstile: dov'è, da dove viene, com'è configurato     */
/*                                                                     */
/* Stesso principio del blocco C4 sul dominio Supabase: l'origine non  */
/* si riscrive a mano due volte. Si legge dal tag vero in index.html e */
/* la si confronta con la CSP, così spostare lo script fa fallire      */
/* questa prova invece di lasciare una CSP che permette un'origine che */
/* nessuno carica più.                                                 */
/* ------------------------------------------------------------------ */
const indice = leggi('index.html');
const [tagTurnstile] = indice.match(/<script[^>]*challenges\.cloudflare\.com[^>]*>/) ?? [];
const [urlTurnstile] = indice.match(/https:\/\/challenges\.cloudflare\.com\/turnstile\/[^\s"']+/) ?? [];

ok('C5b index.html carica lo script di Turnstile', Boolean(tagTurnstile), indice.includes('turnstile') ? '' : 'nessun tag trovato');
ok('C5c lo script viene dall\'origine permessa in script-src',
  Boolean(urlTurnstile) && (csp['script-src'] ?? []).includes(origineDa(urlTurnstile)),
  `script: ${urlTurnstile}, script-src: ${(csp['script-src'] ?? []).join(' ')}`);

/* `render=explicit` non è un dettaglio di stile: senza, Turnstile cerca da
   solo gli elementi `.cf-turnstile` appena si carica e disegna dentro un
   nodo che il render successivo di React può già aver sostituito. Il
   risultato è un widget che si vede e non produce nessun token. */
ok('C5d il render è esplicito, non automatico', /render=explicit/.test(urlTurnstile ?? ''));

/* `async defer`: lo script non deve bloccare il primo disegno della
   schermata di accesso. Il componente sa aspettare che arrivi. */
ok('C5e lo script non blocca il rendering', /\basync\b/.test(tagTurnstile ?? '') && /\bdefer\b/.test(tagTurnstile ?? ''));

/* Nessuna chiave nel markup. La sitekey è pubblica ma arriva da una
   variabile d'ambiente, non scritta a mano qui dentro; la secret key non
   deve comparire in nessun file di questo repository. Le chiavi Turnstile
   cominciano tutte per `0x4`. */
ok('C5f nessuna chiave Turnstile scritta in index.html', !/0x4[A-Za-z0-9_-]{10,}/.test(indice));
ok('C5g nessuna chiave Turnstile scritta in vercel.json', !/0x4[A-Za-z0-9_-]{10,}/.test(testoConfig));

/* Immagini e manifest sono tutti locali: icone in public/, favicon,
   e le icone delle notifiche web (/icon-192.png, /badge.png). */
eq('C7  le immagini sono solo locali', csp['img-src'], ["'self'"]);
eq('C8  il manifest è locale', csp['manifest-src'], ["'self'"]);
for (const file of ['icon-192.png', 'badge.png', 'favicon.svg', 'manifest.webmanifest']) {
  ok(`C9  ${file} esiste davvero in public/`, existsSync(join(RADICE, 'public', file)));
}

/* ------------------------------------------------------------------ */
/* Permissions-Policy: quello che si nega e quello che NON si nega     */
/* ------------------------------------------------------------------ */

const permessi = intestazioni['Permissions-Policy'];

for (const funzione of [
  'camera', 'microphone', 'geolocation', 'payment', 'usb', 'serial',
  'display-capture', 'accelerometer', 'gyroscope', 'magnetometer',
  'browsing-topics', 'xr-spatial-tracking',
]) {
  ok(`D1  ${funzione} negato`, new RegExp(`(^|,\\s*)${funzione}=\\(\\)`).test(permessi));
}

/* Nessuna funzione è concessa a qualcuno: solo elenchi vuoti. Un `=(self)`
   scappato qui dentro sarebbe un permesso dato senza che nessuno lo
   chiedesse. */
ok('D2  tutte le voci sono negazioni',
  permessi.split(',').every((v) => /=\(\)\s*$/.test(v.trim())), permessi);

/* Le notifiche non si toccano. `clipboard-write` nemmeno: lo usa il
   pulsante che copia il codice del gruppo (App.jsx, handleCopiaCodice).
   Sono le due cose che questa intestazione poteva rompere in silenzio. */
ok('D3  clipboard-write NON è negato: serve al codice del gruppo',
  !/clipboard/.test(permessi));
ok('D4  nessuna voce che tocchi le notifiche', !/notification|push/i.test(permessi));
ok('D5  il pulsante «copia codice» esiste ancora',
  /navigator\.clipboard/.test(leggi('src', 'App.jsx')));
ok('D6  le notifiche web sono ancora previste',
  /showNotification/.test(leggi('src', 'notificheTappe.js')));

/* ------------------------------------------------------------------ */
/* Referrer-Policy e HSTS                                              */
/* ------------------------------------------------------------------ */

ok('E1  Referrer-Policy fra i valori stretti',
  ['no-referrer', 'strict-origin-when-cross-origin', 'same-origin'].includes(intestazioni['Referrer-Policy']),
  intestazioni['Referrer-Policy']);

const hsts = intestazioni['Strict-Transport-Security'];
const durata = Number(hsts.match(/max-age=(\d+)/)?.[1] ?? 0);
ok('E2  HSTS dura almeno un anno', durata >= 31536000, `max-age=${durata}`);

/* La forma sicura rispetto ai domini che ci sono DAVVERO.
   `preload` è una porta a senso unico: entrarci significa che i browser
   rifiuteranno l'HTTP su quel dominio anche mesi dopo averlo tolto — e su
   un sottodominio di vercel.app non è nemmeno una cosa che si possa
   chiedere, perché l'apice non è nostro.
   `includeSubDomains` impegna sottodomini che oggi non esistono: quando
   arriverà un dominio proprio, si aggiunge allora, dopo aver controllato
   che ogni sottodominio parli HTTPS. */
ok('E3  HSTS senza preload', !/preload/.test(hsts), hsts);
ok('E4  HSTS senza includeSubDomains', !/includeSubDomains/i.test(hsts), hsts);

/* ------------------------------------------------------------------ */
/* Il bundle costruito, se c'è                                         */
/* ------------------------------------------------------------------ */
/* Il sorgente non racconta tutto. Vite inlina da sé gli asset sotto i
   4 kB come `data:`, e `img-src 'self'` li bloccherebbe: oggi non succede
   perché le immagini stanno in public/ e si servono per percorso, ma il
   giorno che qualcuno scrive `import logo from './logo.png'` la cosa
   cambia senza che nessuno la colleghi alla CSP. Questa prova è lì per
   quel giorno. */

/* Si guarda il CSS costruito e non il JavaScript, di proposito. In un
   foglio di stile un indirizzo è sempre una richiesta: `url(...)` o
   `@import`. Nel JavaScript minificato no — dentro ci sono i messaggi di
   avviso di React, che citano reactjs.org e github.com come testo. Un
   controllo che li segnalasse insegnerebbe soltanto a ignorarlo. Per il
   JavaScript vale già il blocco C, che legge il sorgente. */

const dist = join(RADICE, 'dist', 'assets');
const fogli = existsSync(dist) ? readdirSync(dist).filter((f) => f.endsWith('.css')) : [];

if (fogli.length) {
  const cssCostruito = fogli.map((f) => readFileSync(join(dist, f), 'utf8')).join('\n');

  ok('F1  nessuna immagine inlinata come data:, o la CSP la consente',
    !/url\(\s*["']?data:image/.test(cssCostruito) || (csp['img-src'] ?? []).includes('data:'),
    'il CSS costruito contiene un\'immagine data: — aggiungi data: a img-src');

  const richiesteCss = [
    ...(cssCostruito.match(/url\(\s*["']?(https?:\/\/[^"')\s]+)/g) ?? []),
    ...(cssCostruito.match(/@import\s+(?:url\()?\s*["']?(https?:\/\/[^"')\s;]+)/g) ?? []),
  ];
  const origineCss = new Set(
    richiesteCss.map((r) => origineDa(r.match(/https?:\/\/[^"')\s;]+/)[0])).filter(Boolean),
  );
  eq('F2  il CSS costruito chiede solo Google Fonts', [...origineCss], ['https://fonts.googleapis.com']);
  for (const o of origineCss) {
    ok(`F3  origine del CSS presente nella CSP: ${o}`, permesse.has(o),
      'il foglio costruito la chiama ma la CSP non la elenca');
  }
} else {
  console.log('  (dist/ assente: le prove F si eseguono dopo «npm run build»)\n');
}

/* ------------------------------------------------------------------ */

console.log(`\nintestazioni: ${passati} controlli superati`);
if (falliti.length) {
  console.error(`\n${falliti.length} FALLITI:\n  · ${falliti.join('\n  · ')}\n`);
  process.exit(1);
}
