/* ------------------------------------------------------------------ */
/* turnstile.mjs — la verifica anti-bot davanti all'autenticazione     */
/*                                                                     */
/*   node verifica/turnstile.mjs                                       */
/*                                                                     */
/* Le domande a cui risponde, che sono quattro e sono diverse fra loro: */
/*                                                                     */
/*  A. Il token arriva DAVVERO al server, in tutte e quattro le        */
/*     operazioni che Supabase protegge? Non «la funzione riceve un    */
/*     argomento»: il token deve finire dentro il corpo della          */
/*     richiesta HTTP, nel campo che il server legge                    */
/*     (`gotrue_meta_security.captcha_token`). Fra la firma della       */
/*     funzione e il filo c'è `auth-js`, e quello che ci mette dentro   */
/*     lui non lo decide questo repository.                             */
/*                                                                     */
/*  B. Il widget si azzera dopo OGNI tentativo — riuscito, fallito e    */
/*     interrotto da un'eccezione? Un token Turnstile si spende una     */
/*     volta sola: senza azzeramento il secondo tentativo è morto in    */
/*     partenza, e il caso «password sbagliata, poi giusta» è il primo  */
/*     che capita a un utente vero.                                     */
/*                                                                     */
/*  C. Un rifiuto anti-bot si distingue da credenziali sbagliate?       */
/*     È lo stesso vicolo cieco già chiuso una volta per le password    */
/*     sotto il minimo del server: dire «password non corretta» a chi   */
/*     l'ha scritta giusta manda la persona a cambiare una password     */
/*     che non ha nessun problema.                                      */
/*                                                                     */
/*  D. Senza sitekey l'app resta identica a prima? È la condizione che  */
/*     rende pubblicabile questo codice PRIMA di accendere la           */
/*     protezione su Supabase, quindi senza nessuna finestra in cui     */
/*     accesso e registrazione siano rotti.                             */
/*                                                                     */
/* NESSUNA RETE. `globalThis.fetch` viene sostituito per intero prima   */
/* di toccare qualunque funzione dell'app: nessuna richiesta esce da    */
/* questa macchina, nessun account viene creato, e la copia originale   */
/* di `fetch` viene messa da parte e ricontrollata alla fine.           */
/*                                                                     */
/* Quello che questa suite NON prova: che la protezione sia accesa sul  */
/* progetto Supabase vero, e che Cloudflare accetti il dominio di       */
/* produzione. Quelle due cose si vedono solo dai pannelli e dal        */
/* telefono, e stanno nella checklist di RAPPORTO-TURNSTILE.md.         */
/* ------------------------------------------------------------------ */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

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
/* IL FINTO SERVER                                                     */
/*                                                                     */
/* Le risposte hanno la forma delle struct di GoTrue, come in           */
/* password-debole.mjs. Ogni richiesta viene registrata: è quella la    */
/* prova, non il valore di ritorno.                                    */
/* ------------------------------------------------------------------ */

const FETCH_ORIGINALE = globalThis.fetch;
const richieste = [];

const UTENTE = {
  id: 'utente-di-prova',
  aud: 'authenticated',
  email: 'u393331112223@smetto.app',
  phone: '',
};

const sessione = (utente = UTENTE) => ({
  access_token: 'jwt.finto.123',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'refresh-finto',
  user: utente,
});

/* Il rifiuto anti-bot, copiato dal server:
     internal/api/middleware.go, verifyCaptcha
       NewBadRequestError(ErrorCodeCaptchaFailed,
         "captcha protection: request disallowed (no captcha_token found)")
   `ErrorCodeCaptchaFailed` vale "captcha_failed". */
const RIFIUTO_CAPTCHA = {
  code: 400,
  error_code: 'captcha_failed',
  msg: 'captcha protection: request disallowed (no captcha_token found)',
};

/* Password sbagliata per davvero: l'altro 400, quello che NON deve
   essere confuso con il precedente in nessuna direzione. */
const CREDENZIALI_SBAGLIATE = {
  code: 400,
  error_code: 'invalid_credentials',
  msg: 'Invalid login credentials',
};

/* Cosa risponde il finto server, richiesta per richiesta. Si cambia da
   fuori, prima di ogni scenario. */
let copione = {};

function rispondi(url, metodo) {
  const su = (frammento) => url.includes(frammento);

  if (su('/auth/v1/signup')) return copione.signup ?? { status: 200, body: sessione() };
  if (su('/auth/v1/token')) return copione.token ?? { status: 200, body: sessione() };
  if (su('/auth/v1/otp')) return copione.otp ?? { status: 200, body: {} };
  if (su('/auth/v1/user')) {
    if (metodo === 'GET') return copione.utente ?? { status: 200, body: UTENTE };
    return copione.aggiornaUtente ?? { status: 200, body: UTENTE };
  }
  /* Il profilo su PostgREST: `maybeSingle()` chiede un oggetto solo. */
  if (su('/rest/v1/profiles')) {
    return {
      status: 200,
      body: {
        id: UTENTE.id,
        display_name: 'Amico 2223',
        nickname: null,
        email: null,
        phone: '+393331112223',
        avatar_color: '#D19A3E',
      },
    };
  }
  return { status: 200, body: {} };
}

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : (input?.url ?? String(input));
  const metodo = (init.method ?? 'GET').toUpperCase();
  let corpo = null;
  if (init.body) { try { corpo = JSON.parse(init.body); } catch (e) { corpo = init.body; } }
  richieste.push({ url, metodo, corpo });
  const r = rispondi(url, metodo);
  return new Response(JSON.stringify(r.body), {
    status: r.status,
    headers: { 'Content-Type': 'application/json' },
  });
};

/* Gli import dell'app vengono DOPO la sostituzione di `fetch`: il client
   Supabase si costruisce al momento dell'import, e da lì in poi qualunque
   chiamata deve passare da qui. */
const { default: supabaseAuth, leggiEsitoAccesso } = await import('../src/auth/supabaseAuth.js');
const {
  conCaptcha, captchaFallito, leggiSitekey, creaGestore, conTentativo, MESSAGGIO_CAPTCHA,
} = await import('../src/utils/captcha.js');
const { default: localAuth } = await import('../src/auth/localAuth.js');
const { supabase } = await import('../src/auth/supabaseClient.js');

/* Comodità per leggere l'ultima richiesta a un certo endpoint. */
const ultima = (frammento) => [...richieste].reverse().find((r) => r.url.includes(frammento));
const tokenSulFilo = (frammento) => ultima(frammento)?.corpo?.gotrue_meta_security?.captcha_token;

const TOKEN = 'token-finto-di-turnstile';

/* ================================================================== */
/* A. IL TOKEN ARRIVA AL SERVER, IN TUTTE E QUATTRO LE OPERAZIONI      */
/* ================================================================== */

/* --- A1. registrazione --- */
richieste.length = 0;
copione = {};
const A1 = await supabaseAuth.signUp('+393331112223', 'dodicicaratteri', TOKEN);
eq('A1  registrazione: il token è sul filo', tokenSulFilo('/auth/v1/signup'), TOKEN);
ok('A1b registrazione: riuscita', A1.error === undefined, JSON.stringify(A1.error));

/* I metadati del profilo devono sopravvivere all'aggiunta del token: è
   `options.data` che il trigger del database legge per creare la riga in
   `profiles`. Un `options` sovrascritto invece che esteso darebbe account
   senza nome, e non se ne accorgerebbe nessuno fino al primo utente. */
eq('A1c registrazione: i metadati del profilo non vengono schiacciati',
  ultima('/auth/v1/signup')?.corpo?.data?.display_name, 'Amico 2223');
eq('A1d registrazione: il numero resta nei metadati',
  ultima('/auth/v1/signup')?.corpo?.data?.phone, '+393331112223');

/* --- A2. accesso --- */
richieste.length = 0;
copione = {};
const A2 = await supabaseAuth.signIn('+393331112223', 'dodicicaratteri', TOKEN);
eq('A2  accesso: il token è sul filo', tokenSulFilo('/auth/v1/token'), TOKEN);
ok('A2b accesso: si entra', A2.error === undefined, JSON.stringify(A2.error));
ok('A2c accesso: la richiesta va al grant password',
  (ultima('/auth/v1/token')?.url ?? '').includes('grant_type=password'));

/* --- A3. cambio password ---
   È il percorso che si dimentica: `updateUser` non è protetto, ma il
   controllo della password attuale passa da un accesso vero, cioè da
   `/token?grant_type=password`, che lo è. La sessione qui c'è davvero,
   perché l'accesso di A2 l'ha appena salvata nel client. */
richieste.length = 0;
copione = {};
const A3 = await supabaseAuth.changePassword(UTENTE.id, 'vecchiapassword', 'nuovadodici12', TOKEN);
eq('A3  cambio password: il token è sul filo del controllo',
  tokenSulFilo('/auth/v1/token'), TOKEN);
ok('A3b cambio password: riuscito', A3.error === undefined, JSON.stringify(A3.error));
ok('A3c cambio password: la nuova password parte davvero',
  Boolean(richieste.find((r) => r.url.includes('/auth/v1/user') && r.metodo === 'PUT')));

/* --- A4. richiesta del codice di recupero ---
   Il numero verificato deve esserci, altrimenti la funzione si ferma
   prima per un'altra ragione (che è giusta, e resta invariata). */
richieste.length = 0;
copione = { utente: { status: 200, body: { ...UTENTE, phone: '393331112223' } } };
const A4 = await supabaseAuth.requestRecovery('+393331112223', TOKEN);
eq('A4  recupero: il token è sul filo', tokenSulFilo('/auth/v1/otp'), TOKEN);
ok('A4b recupero: richiesta accettata', A4.error === undefined, JSON.stringify(A4.error));

/* La logica di recupero NON è stata toccata oltre al token: senza numero
   verificato si continua a dire com'è, invece di far aspettare un codice
   che non arriverebbe. */
richieste.length = 0;
copione = { utente: { status: 200, body: { ...UTENTE, phone: '' } } };
const A5 = await supabaseAuth.requestRecovery('+393331112223', TOKEN);
eq('A5  recupero senza numero verificato: risposta invariata', A5.error, 'sms-non-disponibile');
ok('A5b recupero senza numero verificato: nessuna richiesta di OTP', !ultima('/auth/v1/otp'));

/* ================================================================== */
/* B. SENZA TOKEN, LA RICHIESTA È IDENTICA A PRIMA                     */
/*                                                                     */
/* La condizione che rende pubblicabile questo codice mentre la         */
/* protezione su Supabase è ancora spenta.                              */
/*                                                                     */
/* ATTENZIONE A COSA SI CONFRONTA. Il primo giro di questa prova        */
/* chiedeva che sul filo non comparisse `gotrue_meta_security`, ed è    */
/* fallita: `auth-js` quel contenitore lo mette SEMPRE, anche vuoto     */
/* (`GoTrueClient.ts`, `gotrue_meta_security: { captcha_token:          */
/* credentials?.options?.captchaToken }`). Lo metteva anche prima di    */
/* questa modifica, quindi non è una differenza introdotta qui.         */
/*                                                                     */
/* La domanda giusta non è «manca il campo» ma «il corpo è lo stesso    */
/* di prima». Quindi si confronta la chiamata dell'app con la chiamata  */
/* NUDA — quella che il codice faceva prima che esistesse `conCaptcha`  */
/* — e devono coincidere carattere per carattere.                       */
/* ================================================================== */

richieste.length = 0;
copione = {};
await supabaseAuth.signIn('+393331112223', 'dodicicaratteri');
const conApp = ultima('/auth/v1/token')?.corpo;

richieste.length = 0;
await supabase.auth.signInWithPassword({
  email: 'u393331112223@smetto.app',
  password: 'dodicicaratteri',
});
const comePrima = ultima('/auth/v1/token')?.corpo;

eq('B1  accesso senza token: il corpo è identico a quello di prima', conApp, comePrima);
eq('B1b accesso senza token: nessun token sul filo',
  conApp?.gotrue_meta_security?.captcha_token, undefined);

richieste.length = 0;
await supabaseAuth.signUp('+393331112223', 'dodicicaratteri');
const signupSenza = ultima('/auth/v1/signup')?.corpo ?? {};
eq('B2  registrazione senza token: nessun token sul filo',
  signupSenza?.gotrue_meta_security?.captcha_token, undefined);
eq('B2b registrazione senza token: i metadati restano',
  signupSenza?.data?.display_name, 'Amico 2223');

/* Una stringa vuota o uno spazio non sono un token: mandarli vorrebbe
   dire farsi rifiutare dal server avendo l'aria di aver fatto le cose. */
eq('B3  conCaptcha con token assente non aggiunge niente',
  conCaptcha({ email: 'a', password: 'b' }, undefined), { email: 'a', password: 'b' });
eq('B3b conCaptcha con stringa vuota non aggiunge niente',
  conCaptcha({ email: 'a' }, ''), { email: 'a' });
eq('B3c conCaptcha con soli spazi non aggiunge niente',
  conCaptcha({ email: 'a' }, '   '), { email: 'a' });
eq('B3d conCaptcha ripulisce gli spazi intorno al token',
  conCaptcha({ email: 'a' }, `  ${TOKEN}  `), { email: 'a', options: { captchaToken: TOKEN } });
eq('B3e conCaptcha conserva le opzioni che c\'erano già',
  conCaptcha({ email: 'a', options: { data: { x: 1 } } }, TOKEN),
  { email: 'a', options: { data: { x: 1 }, captchaToken: TOKEN } });

/* La sitekey: assente in ogni forma sbagliata, presente solo se c'è. */
eq('B4  sitekey assente con ambiente vuoto', leggiSitekey({}), '');
eq('B4b sitekey assente senza ambiente', leggiSitekey(undefined), '');
eq('B4c sitekey assente se la variabile è vuota', leggiSitekey({ VITE_TURNSTILE_SITEKEY: '' }), '');
eq('B4d sitekey assente se la variabile è fatta di spazi',
  leggiSitekey({ VITE_TURNSTILE_SITEKEY: '   ' }), '');
eq('B4e sitekey assente se la variabile non è una stringa',
  leggiSitekey({ VITE_TURNSTILE_SITEKEY: 12345 }), '');
eq('B4f sitekey letta e ripulita', leggiSitekey({ VITE_TURNSTILE_SITEKEY: ' abc123 ' }), 'abc123');

/* Senza sitekey il widget non si monta nemmeno: niente riquadro, niente
   attesa, niente richiesta a Cloudflare. */
const apiMai = { render: () => { throw new Error('non deve essere chiamata'); } };
eq('B5  senza sitekey il widget non si monta',
  creaGestore(apiMai).monta({}, { sitekey: '' }), null);
eq('B5b senza nodo il widget non si monta',
  creaGestore({ render: () => 'x' }).monta(null, { sitekey: 'abc' }), null);
eq('B5c senza script di Turnstile il widget non si monta',
  creaGestore(undefined).monta({}, { sitekey: 'abc' }), null);

/* ================================================================== */
/* C. L'AZZERAMENTO DOPO OGNI TENTATIVO                                */
/* ================================================================== */

function apiFinta(identificativo = 'widget-1') {
  const registro = { render: 0, reset: 0, remove: 0, opzioni: null, azzerati: [] };
  return {
    registro,
    api: {
      render: (nodo, opzioni) => { registro.render += 1; registro.opzioni = opzioni; return identificativo; },
      reset: (id) => { registro.reset += 1; registro.azzerati.push(id); },
      remove: (id) => { registro.remove += 1; },
    },
  };
}

const C = apiFinta();
const gestore = creaGestore(C.api);
const visto = { token: null, scaduto: 0, errore: 0 };
eq('C1  il widget si monta e restituisce il suo identificativo',
  gestore.monta({}, {
    sitekey: 'abc',
    azione: 'accesso',
    alToken: (t) => { visto.token = t; },
    alloScadere: () => { visto.scaduto += 1; },
    alErrore: () => { visto.errore += 1; },
  }), 'widget-1');
eq('C1b la sitekey arriva a Turnstile', C.registro.opzioni?.sitekey, 'abc');
eq('C1c l\'azione arriva a Turnstile', C.registro.opzioni?.action, 'accesso');
eq('C1d la lingua è l\'italiano', C.registro.opzioni?.language, 'it');

/* Le tre richiamate non si controllano per tipo ma CHIAMANDOLE: un
   `typeof === 'function'` passerebbe anche se fossero collegate al posto
   sbagliato, e scambiare scadenza ed errore è esattamente il genere di
   svista che non si vede finché un token non scade davvero. */
C.registro.opzioni.callback('token-dal-widget');
eq('C1e la richiamata del token consegna il token', visto.token, 'token-dal-widget');
C.registro.opzioni['expired-callback']();
eq('C1f la scadenza arriva a chi deve saperla', visto.scaduto, 1);
C.registro.opzioni['timeout-callback']();
eq('C1g anche il timeout passa dalla scadenza', visto.scaduto, 2);
C.registro.opzioni['error-callback']();
eq('C1h l\'errore arriva a chi deve saperlo', visto.errore, 1);

eq('C2  montare due volte non crea due widget', gestore.monta({}, { sitekey: 'abc' }), 'widget-1');
eq('C2b render chiamato una volta sola', C.registro.render, 1);

ok('C3  azzerare chiama reset sul widget giusto', gestore.azzera() === true);
eq('C3b reset ha ricevuto l\'identificativo', C.registro.azzerati, ['widget-1']);

gestore.smonta();
eq('C4  smontare chiama remove', C.registro.remove, 1);
ok('C4b dopo lo smontaggio non si azzera più niente', gestore.azzera() === false);

/* L'IDENTIFICATIVO CHE SEMBRA ASSENTE.

   Turnstile oggi restituisce una stringa, e `"0"` è vera: su quella un
   `if (id)` funzionerebbe. Ma `render` è codice di terze parti, e se un
   giorno restituisse uno zero NUMERICO un `if (id)` smetterebbe di
   azzerare senza dire niente. Qui si provano tutte e due le forme,
   perché il codice non deve dipendere dal tipo. */
const Z = apiFinta('0');
const gestoreZero = creaGestore(Z.api);
eq('C5  identificativo "0" (stringa): il widget risulta montato', gestoreZero.monta({}, { sitekey: 'abc' }), '0');
ok('C5b identificativo "0" (stringa): l\'azzeramento parte', gestoreZero.azzera() === true);
eq('C5c identificativo "0" (stringa): reset ha ricevuto proprio "0"', Z.registro.azzerati, ['0']);

const N = apiFinta(0);
const gestoreNumero = creaGestore(N.api);
eq('C5d identificativo 0 (numero): il widget risulta montato', gestoreNumero.monta({}, { sitekey: 'abc' }), 0);
ok('C5e identificativo 0 (numero): l\'azzeramento parte lo stesso', gestoreNumero.azzera() === true);
eq('C5f identificativo 0 (numero): reset ha ricevuto proprio 0', N.registro.azzerati, [0]);

/* Se `render` esplode — sitekey rifiutata, dominio non autorizzato — non
   deve portarsi dietro l'app: si segnala e basta. */
let erroreVisto = null;
const gestoreRotto = creaGestore({ render: () => { throw new Error('dominio non autorizzato'); } });
eq('C6  render che esplode non monta niente',
  gestoreRotto.monta({}, { sitekey: 'abc', alErrore: (e) => { erroreVisto = e; } }), null);
ok('C6b render che esplode avvisa chi lo usa', erroreVisto instanceof Error);

/* `conTentativo`: l'azzeramento dopo il successo, dopo l'errore
   restituito e dopo l'eccezione. È il terzo il ramo che si dimentica, ed
   è il peggiore: chi perde la linea a metà accesso si ritroverebbe un
   token già speso e non riuscirebbe più a entrare nemmeno a rete tornata. */
let azzeramenti = 0;
const azzera = () => { azzeramenti += 1; };

const D1 = await conTentativo(azzera, async () => ({ user: { id: 'x' } }));
eq('C7  dopo un tentativo riuscito si azzera', azzeramenti, 1);
eq('C7b il risultato del tentativo passa intatto', D1, { user: { id: 'x' } });

const D2 = await conTentativo(azzera, async () => ({ error: 'credenziali' }));
eq('C8  dopo un errore restituito si azzera', azzeramenti, 2);
eq('C8b anche l\'errore passa intatto', D2, { error: 'credenziali' });

let esploso = null;
try {
  await conTentativo(azzera, async () => { throw new Error('rete caduta'); });
} catch (e) { esploso = e; }
eq('C9  dopo un\'eccezione si azzera lo stesso', azzeramenti, 3);
ok('C9b l\'eccezione non viene inghiottita', esploso instanceof Error);

/* Un azzeramento che fallisce non deve travolgere l'esito del tentativo:
   quello che interessa a chi guarda lo schermo è se è entrato. Qui si
   cattura di proposito, altrimenti un giorno che questa prova fallisce il
   banco muore a metà invece di dire quale controllo è saltato. */
let D3 = null;
let fuga = null;
try {
  D3 = await conTentativo(() => { throw new Error('widget già smontato'); }, async () => ({ ok: 1 }));
} catch (e) { fuga = e; }
ok('C10 un azzeramento che esplode non esce dal tentativo', fuga === null, String(fuga));
eq('C10b il tentativo restituisce comunque il suo esito', D3, { ok: 1 });

/* ================================================================== */
/* D. RIFIUTO ANTI-BOT ≠ CREDENZIALI SBAGLIATE                         */
/* ================================================================== */

/* Prima la libreria vera: l'errore che `auth-js` costruisce da un 400
   `captcha_failed`, così il riconoscimento non è provato su un oggetto
   scritto da me a somiglianza di quello vero. */
async function errorePer(risposta) {
  const client = createClient('https://esempio.supabase.co', 'chiave-finta', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async () => new Response(JSON.stringify(risposta.body), {
        status: risposta.status,
        headers: { 'Content-Type': 'application/json' },
      }),
    },
  });
  return client.auth.signInWithPassword({ email: 'a@b.c', password: 'x' });
}

const E1 = await errorePer({ status: 400, body: RIFIUTO_CAPTCHA });
eq('D1  auth-js espone il codice del rifiuto', E1.error?.code, 'captcha_failed');
ok('D1b captchaFallito lo riconosce', captchaFallito(E1.error) === true);

const E2 = await errorePer({ status: 400, body: CREDENZIALI_SBAGLIATE });
ok('D2  captchaFallito NON scambia le credenziali per un captcha',
  captchaFallito(E2.error) === false);

ok('D3  captchaFallito regge null', captchaFallito(null) === false);
ok('D3b captchaFallito regge un errore di rete', captchaFallito(new Error('fetch failed')) === false);
ok('D3c captchaFallito regge una stringa', captchaFallito('captcha') === false);
/* Riconosciuto anche solo dal messaggio, perché `auth-js` riempie codice e
   messaggio in punti diversi e una versione futura potrebbe portarne uno solo. */
ok('D3d captchaFallito riconosce anche il solo messaggio del server',
  captchaFallito({ message: 'captcha protection: request disallowed (invalid-input-response)' }) === true);
/* Ma non una frase qualsiasi che nomini il captcha: classificare male qui
   vuol dire mandare qualcuno a ridigitare una password giusta. */
ok('D3e captchaFallito non si fida di una frase qualsiasi',
  captchaFallito({ message: 'network error while loading captcha' }) === false);

/* Poi la funzione vera dell'app, sulla risposta vera. */
const F1 = leggiEsitoAccesso(await errorePer({ status: 400, body: RIFIUTO_CAPTCHA }));
ok('D4  rifiuto anti-bot: NON è «credenziali»', F1.error !== 'credenziali', JSON.stringify(F1));
eq('D4b rifiuto anti-bot: si dice cos\'è', F1.error, 'captcha');

const F2 = leggiEsitoAccesso(await errorePer({ status: 400, body: CREDENZIALI_SBAGLIATE }));
eq('D5  credenziali sbagliate: restano «credenziali»', F2.error, 'credenziali');

/* E infine i quattro percorsi dell'app, ciascuno con il suo rifiuto. */
richieste.length = 0;
copione = { token: { status: 400, body: RIFIUTO_CAPTCHA } };
const G1 = await supabaseAuth.signIn('+393331112223', 'dodicicaratteri');
eq('D6  accesso rifiutato dal captcha: esito «captcha»', G1.error, 'captcha');

copione = { token: { status: 400, body: CREDENZIALI_SBAGLIATE } };
const G2 = await supabaseAuth.signIn('+393331112223', 'sbagliatissima');
eq('D6b accesso con password sbagliata: esito «credenziali»', G2.error, 'credenziali');

copione = { signup: { status: 400, body: RIFIUTO_CAPTCHA } };
const G3 = await supabaseAuth.signUp('+393331112223', 'dodicicaratteri');
eq('D7  registrazione rifiutata dal captcha: esito «captcha»', G3.error, 'captcha');

/* La risposta muta della registrazione resta muta: un numero già
   registrato non deve diventare distinguibile da un altro errore. */
copione = { signup: { status: 422, body: { code: 422, error_code: 'user_already_exists', msg: 'User already registered' } } };
const G4 = await supabaseAuth.signUp('+393331112223', 'dodicicaratteri');
eq('D7b registrazione: il numero già preso resta indistinguibile',
  G4.error, 'registrazione-non-riuscita');

/* Il cambio password: rifiuto sul controllo della password attuale. Serve
   una sessione viva, quindi prima si entra. */
copione = {};
await supabaseAuth.signIn('+393331112223', 'dodicicaratteri');
copione = { token: { status: 400, body: RIFIUTO_CAPTCHA } };
const G5 = await supabaseAuth.changePassword(UTENTE.id, 'vecchia', 'nuovadodici12');
eq('D8  cambio password rifiutato dal captcha: esito «captcha»', G5.error, 'captcha');
ok('D8b il rifiuto anti-bot NON viene letto come password attuale sbagliata',
  G5.error !== 'password attuale');

copione = { token: { status: 400, body: CREDENZIALI_SBAGLIATE } };
const G6 = await supabaseAuth.changePassword(UTENTE.id, 'vecchia', 'nuovadodici12');
eq('D8c password attuale davvero sbagliata: esito invariato', G6.error, 'password attuale');

/* Il recupero: rifiuto sull'endpoint degli OTP. Il messaggio del server
   non contiene nessuna delle parole chiave sugli SMS, quindi senza questo
   ramo la persona leggerebbe il testo crudo di GoTrue. */
copione = {
  utente: { status: 200, body: { ...UTENTE, phone: '393331112223' } },
  otp: { status: 400, body: RIFIUTO_CAPTCHA },
};
const G7 = await supabaseAuth.requestRecovery('+393331112223');
eq('D9  recupero rifiutato dal captcha: esito «captcha»', G7.error, 'captcha');
ok('D9b il rifiuto non viene scambiato per SMS non disponibili',
  G7.error !== 'sms-non-disponibile');

/* Il messaggio che l'utente legge non deve parlare di password né di
   numero: è l'unica cosa che questa persona vede davvero. */
ok('D10 il messaggio non nomina la password', !/password/i.test(MESSAGGIO_CAPTCHA), MESSAGGIO_CAPTCHA);
ok('D10b il messaggio non nomina il numero', !/numero/i.test(MESSAGGIO_CAPTCHA), MESSAGGIO_CAPTCHA);
ok('D10c il messaggio dice cosa fare', /riprova/i.test(MESSAGGIO_CAPTCHA), MESSAGGIO_CAPTCHA);

/* ================================================================== */
/* E. I DUE BACKEND RESTANO INTERCAMBIABILI                            */
/*                                                                     */
/* App.jsx non sa quale dei due ha sotto. Se le firme divergono,       */
/* JavaScript non dice niente: butta via l'argomento in più in         */
/* silenzio, e il giorno che qualcuno inverte due parametri se ne      */
/* accorge l'utente.                                                    */
/* ================================================================== */

for (const [nome, attesi] of [['signUp', 3], ['signIn', 3], ['changePassword', 4], ['requestRecovery', 2]]) {
  eq(`E1  supabaseAuth.${nome} accetta ${attesi} argomenti`, supabaseAuth[nome].length, attesi);
  eq(`E1b localAuth.${nome} accetta gli stessi ${attesi}`, localAuth[nome].length, attesi);
}

/* Il backend locale accetta il token e lo ignora, senza cambiare esito. */
eq('E2  localAuth.requestRecovery ignora il token', (await localAuth.requestRecovery('+39333', TOKEN)).error, 'sms-non-disponibile');

/* `verifyRecovery` NON prende il token, ed è giusto così: la verifica del
   codice passa da `/verify`, che il server non protegge con il captcha.
   Aggiungerlo lì darebbe l'impressione di una protezione che non c'è. */
eq('E3  verifyRecovery resta a tre argomenti, senza token', supabaseAuth.verifyRecovery.length, 3);

/* ================================================================== */
/* F. NESSUNA CHIAVE NEL REPOSITORY                                    */
/*                                                                     */
/* Le chiavi Turnstile — sitekey e secret — cominciano tutte per `0x4`. */
/* La sitekey è pubblica ma deve arrivare dall'ambiente, non scritta a  */
/* mano; la secret non deve comparire da nessuna parte, perché il solo  */
/* posto in cui viene usata è il pannello Supabase.                     */
/* ================================================================== */

const SOSPETTO = /0x4[A-Za-z0-9_-]{10,}/;

function tuttiIFile(cartella, acc = []) {
  for (const voce of readdirSync(cartella, { withFileTypes: true })) {
    const percorso = join(cartella, voce.name);
    if (voce.isDirectory()) { tuttiIFile(percorso, acc); continue; }
    if (/\.(jsx?|mjs|css|html|json|md)$/.test(voce.name)) acc.push(percorso);
  }
  return acc;
}

const daControllare = [
  ...tuttiIFile(join(RADICE, 'src')),
  ...tuttiIFile(join(RADICE, 'verifica')),
  join(RADICE, 'index.html'),
  join(RADICE, 'vercel.json'),
  join(RADICE, '.env.example'),
];

let sporchi = [];
for (const f of daControllare) {
  if (SOSPETTO.test(readFileSync(f, 'utf8'))) sporchi.push(f.replace(`${RADICE}/`, ''));
}
eq('F1  nessuna chiave Turnstile scritta in nessun file', sporchi, []);

const env = leggi('.env.example');
ok('F2  .env.example documenta la variabile della sitekey',
  /VITE_TURNSTILE_SITEKEY=/.test(env));
ok('F3  .env.example NON contiene un valore di sitekey',
  /VITE_TURNSTILE_SITEKEY=\s*$/m.test(env), 'la variabile è valorizzata: va svuotata');
ok('F4  .env.example ricorda dove va la secret key',
  /secret/i.test(env) && /supabase/i.test(env));

/* La sitekey non deve nemmeno essere scritta dentro il codice: si legge
   dall'ambiente, in un punto solo. */
ok('F5  la sitekey si legge dall\'ambiente, non da una costante scritta a mano',
  /leggiSitekey\(/.test(leggi('src', 'App.jsx'))
  && /VITE_TURNSTILE_SITEKEY/.test(leggi('src', 'utils', 'captcha.js')));

/* ================================================================== */
/* G. NESSUNA RICHIESTA È USCITA DAVVERO                               */
/* ================================================================== */

ok('G1  il fetch originale è stato messo da parte e mai usato',
  typeof FETCH_ORIGINALE === 'function' && globalThis.fetch !== FETCH_ORIGINALE);
ok('G2  tutte le richieste sono finite nel finto server', richieste.length > 0);
eq('G3  nessuna richiesta è uscita verso Cloudflare',
  richieste.filter((r) => r.url.includes('cloudflare')).length, 0);

/* ------------------------------------------------------------------ */

globalThis.fetch = FETCH_ORIGINALE;

console.log(`\nturnstile: ${passati} controlli superati`);
if (falliti.length) {
  console.error(`\n${falliti.length} FALLITI:\n  · ${falliti.join('\n  · ')}\n`);
  process.exit(1);
}
