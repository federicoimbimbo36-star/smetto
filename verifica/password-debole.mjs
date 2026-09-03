/* ------------------------------------------------------------------ */
/* password-debole.mjs — l'account storico con password corta          */
/*                                                                     */
/*   node verifica/password-debole.mjs                                 */
/*                                                                     */
/* La domanda a cui risponde: alzando il minimo password a 12 sul       */
/* server, chi si è registrato prima con 8 caratteri riesce ancora a    */
/* entrare, e l'app se ne accorge?                                      */
/*                                                                     */
/* Due blocchi, e la differenza fra i due conta.                        */
/*                                                                     */
/*  A. Cosa fa `auth-js` DAVVERO. Non una finta della libreria: la      */
/*     libreria vera, con il solo `fetch` sostituito, che risponde con  */
/*     la forma esatta delle struct del server GoTrue. Se un giorno     */
/*     `npm update` cambia quel comportamento, questo blocco lo dice.   */
/*                                                                     */
/*  B. Cosa ne fa l'app, chiamando la funzione vera esportata da        */
/*     `src/auth/supabaseAuth.js` — non una copia della sua logica      */
/*     riscritta qui, che proverebbe soltanto che so copiare.           */
/*                                                                     */
/* Quello che questa suite NON prova: che il server di produzione sia   */
/* configurato con il minimo a 12. Quello si vede solo dal progetto     */
/* vero, e sta in `verifica/password-server.mjs`.                       */
/* ------------------------------------------------------------------ */

import { createClient } from '@supabase/supabase-js';
import { leggiEsitoAccesso, passwordDebole } from '../src/auth/supabaseAuth.js';

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

/* ------------------------------------------------------------------ */
/* Le risposte del server, copiate dalle struct Go                     */
/*                                                                     */
/*   internal/tokens/service.go                                        */
/*     AccessTokenResponse.WeakPassword `json:"weak_password,omitempty"`*/
/*   internal/api/password.go                                          */
/*     WeakPasswordError{ Message string; Reasons []string }           */
/*   internal/api/token.go, righe 129-209                              */
/*     il controllo di robustezza NON blocca l'accesso: riempie una     */
/*     variabile, la sessione viene emessa lo stesso e il tutto esce    */
/*     con `sendJSON(w, http.StatusOK, token)`.                        */
/* ------------------------------------------------------------------ */

const SESSIONE = {
  access_token: 'jwt.finto.123',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'refresh-finto',
  user: { id: 'utente-storico', email: 'u393331112223@smetto.app', aud: 'authenticated' },
};

const RISPOSTE = {
  /* Account storico, password da 8 caratteri, minimo del server a 12. */
  debole: {
    status: 200,
    body: {
      ...SESSIONE,
      weak_password: { message: 'Password should be at least 12 characters.', reasons: ['length'] },
    },
  },
  /* Accesso normale, password già a norma. */
  regolare: { status: 200, body: SESSIONE },
  /* Password sbagliata per davvero. */
  sbagliata: {
    status: 400,
    body: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' },
  },
  /* La forma in cui GoTrue manda la password debole a REGISTRAZIONE e a
     CAMBIO password: dentro un errore HTTP, senza sessione. Al login oggi
     non si presenta — ma è la stessa libreria a saperla produrre, quindi
     l'app non deve chiamarla «credenziali sbagliate» se un domani arriva. */
  debolePerErrore: {
    status: 422,
    body: {
      code: 422,
      error_code: 'weak_password',
      msg: 'Password should be at least 12 characters.',
      weak_password: { reasons: ['length'] },
    },
  },
};

async function accedi(quale) {
  const r = RISPOSTE[quale];
  const client = createClient('https://esempio.supabase.co', 'chiave-finta', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async () => new Response(JSON.stringify(r.body), {
        status: r.status,
        headers: { 'Content-Type': 'application/json' },
      }),
    },
  });
  return client.auth.signInWithPassword({ email: 'u393331112223@smetto.app', password: 'segreto8' });
}

/* ------------------------------------------------------------------ */
/* A. auth-js, la libreria vera                                        */
/* ------------------------------------------------------------------ */

const A1 = await accedi('debole');
ok('A1  200+weak_password → nessun errore', A1.error === null,
  `ottenuto ${A1.error && A1.error.name}`);
ok('A1b 200+weak_password → la sessione c\'è', Boolean(A1.data?.session?.access_token));
eq('A1c 200+weak_password → l\'avviso è leggibile', A1.data?.weakPassword?.reasons, ['length']);

const A2 = await accedi('sbagliata');
ok('A2  400 invalid_credentials → errore', A2.error?.code === 'invalid_credentials');
ok('A2b 400 invalid_credentials → nessuna sessione', A2.data?.session === null);

const A3 = await accedi('debolePerErrore');
ok('A3  422 weak_password → AuthWeakPasswordError', A3.error?.name === 'AuthWeakPasswordError');
ok('A3b 422 weak_password → nessuna sessione', A3.data?.session === null);
eq('A3c 422 weak_password → i motivi restano sull\'errore', A3.error?.reasons, ['length']);

/* ------------------------------------------------------------------ */
/* B. la funzione vera dell'app                                        */
/* ------------------------------------------------------------------ */

const B1 = leggiEsitoAccesso(await accedi('debole'));
eq('B1  password corta: si entra', B1.error, undefined);
eq('B1b password corta: è l\'utente giusto', B1.utente?.id, 'utente-storico');
eq('B1c password corta: l\'app lo sa', B1.motivi, ['length']);

const B2 = leggiEsitoAccesso(await accedi('regolare'));
eq('B2  password a norma: si entra', B2.error, undefined);
eq('B2b password a norma: niente da segnalare', B2.motivi, []);

const B3 = leggiEsitoAccesso(await accedi('sbagliata'));
eq('B3  password sbagliata: «credenziali»', B3.error, 'credenziali');
eq('B3b password sbagliata: nessun utente', B3.utente, undefined);

const B4 = leggiEsitoAccesso(await accedi('debolePerErrore'));
ok('B4  debole senza sessione: NON è «credenziali»', B4.error !== 'credenziali',
  `ottenuto ${JSON.stringify(B4.error)}`);
eq('B4b debole senza sessione: si dice cos\'è', B4.error, 'password-debole');

/* Il riconoscimento dell'errore, isolato: è quello che tiene aperto il
   cambio password in `changePassword`, dove un errore letto male
   chiuderebbe l'utente storico fuori dall'unica uscita che ha. */
ok('B5  passwordDebole riconosce l\'errore per nome', passwordDebole(A3.error) === true);
ok('B5b passwordDebole non si confonde con le credenziali', passwordDebole(A2.error) === false);
ok('B5c passwordDebole regge null', passwordDebole(null) === false);
ok('B5d passwordDebole regge un errore di rete', passwordDebole(new Error('fetch failed')) === false);

/* Nessuna sessione e nessun errore: risposta malformata, non un accesso. */
const B6 = leggiEsitoAccesso({ data: { session: null, user: null }, error: null });
eq('B6  risposta vuota: non si entra', B6.error, 'credenziali');
const B7 = leggiEsitoAccesso(undefined);
eq('B7  risposta assente: non si entra', B7.error, 'credenziali');

/* ------------------------------------------------------------------ */

console.log(`\npassword-debole: ${passati} controlli superati`);
if (falliti.length) {
  console.error(`\n${falliti.length} FALLITI:\n  · ${falliti.join('\n  · ')}\n`);
  process.exit(1);
}
