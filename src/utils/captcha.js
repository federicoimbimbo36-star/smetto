/* ------------------------------------------------------------------ */
/* captcha.js — src/utils/captcha.js                                   */
/*                                                                     */
/* Tutto quello che si può provare senza un browser sta qui; in         */
/* `src/components/Turnstile.jsx` resta soltanto il guscio React.       */
/* È la stessa scelta già fatta per `sincronizza.js` e `arretrate.js`,  */
/* e per la stessa ragione: un banco di prova che riscrive la logica    */
/* invece di chiamarla prova soltanto di saper copiare.                 */
/*                                                                     */
/* COSA FA SUPABASE E COSA DEVE FARE L'APP                              */
/*                                                                     */
/* Con la protezione CAPTCHA accesa, il server di autenticazione        */
/* rifiuta con 400 `captcha_failed` ogni richiesta a                    */
/*   /signup, /token?grant_type=password, /recover, /otp,               */
/*   /magiclink, /resend                                                */
/* che non porti un token valido. Il rinnovo della sessione             */
/* (`grant_type=refresh_token`) è escluso dal server, quindi chi è già  */
/* dentro non incontra mai una sfida: non serve niente qui per quello.  */
/*                                                                     */
/* L'app deve fare tre cose, e sono tutte e tre in questo file:         */
/*   1. allegare il token alle chiamate    → `conCaptcha`               */
/*   2. riconoscere il rifiuto per quel che è → `captchaFallito`        */
/*   3. azzerare il widget dopo OGNI tentativo → `creaGestore`,         */
/*      `conTentativo`                                                  */
/*                                                                     */
/* IL PUNTO 3 NON È COSMETICO. Un token Turnstile si spende una volta   */
/* sola: al secondo invio lo stesso token torna indietro come           */
/* «timeout-or-duplicate». Senza azzeramento, chi sbaglia la password   */
/* e la ridigita giusta si vede rifiutare anche quella — e l'errore     */
/* che legge non parla di verifica anti-bot.                            */
/* ------------------------------------------------------------------ */

/* Un solo messaggio, in un posto solo. Le tre schermate che possono    */
/* incontrare un rifiuto (accesso, registrazione, cambio password)      */
/* devono dire la stessa cosa, e soprattutto NON devono dire «password  */
/* sbagliata»: è esattamente il vicolo cieco già chiuso una volta per   */
/* le password sotto il minimo del server.                              */
export const MESSAGGIO_CAPTCHA = 'Verifica anti-bot non riuscita. Attendi che il riquadro qui sopra si completi e riprova.';

/* La chiave PUBBLICA del widget. Sta nel bundle ed è normale: è pensata
   per essere letta da chiunque apra gli strumenti da sviluppatore. Quella
   che non deve mai comparire da nessuna parte in questo repository è la
   secret key, che vive soltanto nel pannello Supabase.

   Assente = niente widget. È voluto: finché la protezione è spenta sul
   progetto Supabase, l'app deve comportarsi esattamente come prima, e chi
   clona il repository deve poterla avviare senza configurare niente.

   Prende l'ambiente come argomento invece di leggere `import.meta.env` da
   sé, per due motivi: così si può provare con un ambiente qualsiasi, e così
   questo file resta importabile da Node — `src/components/index.js` finisce
   nel fascio esbuild del banco delle schermate, e un `import.meta` là dentro
   sarebbe un avviso a ogni giro. La lettura vera sta in `App.jsx`. */
export function leggiSitekey(env) {
  const grezza = env && typeof env.VITE_TURNSTILE_SITEKEY === 'string' ? env.VITE_TURNSTILE_SITEKEY : '';
  return grezza.trim();
}

/* Aggiunge il token ai parametri di una chiamata `auth-js`.

   SENZA TOKEN NON AGGIUNGE NIENTE, e non è un dettaglio: l'oggetto che
   esce dev'essere identico a quello che l'app mandava prima di questa
   funzione. È la garanzia che, con la protezione spenta su Supabase e la
   sitekey non configurata, non cambi una virgola di quello che finisce
   sul filo. Una `options: {}` di troppo sarebbe innocua oggi e nessuno
   saprebbe dire, fra sei mesi, se lo è ancora.

   `options` esistente si conserva: a `signUp` ci passano i metadati del
   profilo (`options.data`), che il trigger del database legge per creare
   la riga in `profiles`. Sovrascriverlo vorrebbe dire account senza nome. */
export function conCaptcha(parametri, token) {
  const pulito = typeof token === 'string' ? token.trim() : '';
  if (!pulito) return parametri;
  return { ...parametri, options: { ...(parametri.options ?? {}), captchaToken: pulito } };
}

/* Vero solo per il rifiuto del CAPTCHA, e per niente altro.

   Riconosciuto prima per codice, che è quello che il server manda
   (`ErrorCodeCaptchaFailed` = "captcha_failed"), e in seconda battuta sul
   prefisso esatto del messaggio («captcha protection: request disallowed
   (...)»), perché `auth-js` riempie i due campi in punti diversi e una
   versione futura potrebbe portarne solo uno.

   Volutamente stretto: un `/captcha/i` sul messaggio prenderebbe anche un
   errore di rete che cita il dominio, e classificare male qui vuol dire
   mandare la persona a ridigitare una password che era giusta. */
export function captchaFallito(errore) {
  if (!errore || typeof errore !== 'object') return false;
  if (errore.code === 'captcha_failed') return true;
  return typeof errore.message === 'string'
    && errore.message.toLowerCase().startsWith('captcha protection');
}

/* ------------------------------------------------------------------ */
/* IL CICLO DI VITA DEL WIDGET                                         */
/*                                                                     */
/* `api` è `window.turnstile`, iniettata invece che letta qui dentro:   */
/* è l'unico modo di provare montaggio, azzeramento e smontaggio su    */
/* Node, dove `window` non esiste e un browser finto sarebbe una copia  */
/* di quello vero scritta da me.                                        */
/* ------------------------------------------------------------------ */
export function creaGestore(api) {
  /* `null` e non `undefined`, e il confronto è sempre `!== null`.

     La prima stesura di questo commento diceva un'altra cosa: che
     Turnstile chiama "0" il primo widget della pagina e che un `if (id)`
     lo leggerebbe come assente. È falso, e l'ha detto la controprova
     invece di me: `"0"` è una stringa non vuota, quindi è vera, e con
     l'identificativo che Turnstile restituisce oggi — una stringa —
     `if (id)` funzionerebbe.

     Il confronto esplicito resta lo stesso, per la ragione che avanza
     una volta tolta quella sbagliata: qui non si deve dipendere dal TIPO
     dell'identificativo. `render` è codice di terze parti che può
     restituire quello che vuole, numero compreso, e un `if (id)` su uno
     zero numerico smetterebbe di azzerare senza dire niente — nel caso
     peggiore, cioè in silenzio. `id !== null` significa una cosa sola:
     «il widget è montato». Il banco di prova copre tutte e due le forme. */
  let id = null;

  const usabile = (nome) => Boolean(api) && typeof api[nome] === 'function';

  return {
    monta(nodo, opzioni = {}) {
      if (id !== null) return id;
      const sitekey = typeof opzioni.sitekey === 'string' ? opzioni.sitekey.trim() : '';
      if (!sitekey || !nodo || !usabile('render')) return null;
      try {
        const esito = api.render(nodo, {
          sitekey,
          action: opzioni.azione,
          language: 'it',
          callback: opzioni.alToken,
          /* Scadenza e timeout portano allo stesso posto: il token che
             l'app ha in mano non vale più, e tenerselo vorrebbe dire
             mandarne uno morto al primo invio. */
          'expired-callback': opzioni.alloScadere,
          'timeout-callback': opzioni.alloScadere,
          'error-callback': opzioni.alErrore,
        });
        id = esito === undefined ? null : esito;
      } catch (e) {
        id = null;
        if (typeof opzioni.alErrore === 'function') opzioni.alErrore(e);
      }
      return id;
    },

    azzera() {
      if (id === null || !usabile('reset')) return false;
      try { api.reset(id); return true; } catch (e) { return false; }
    },

    smonta() {
      if (id === null) return false;
      if (usabile('remove')) { try { api.remove(id); } catch (e) { /* già rimosso */ } }
      id = null;
      return true;
    },

    identificativo() { return id; },
  };
}

/* Il tentativo, con l'azzeramento garantito.

   `finally` e non due chiamate copiate nei rami: l'azzeramento deve
   avvenire dopo il successo, dopo l'errore restituito e anche dopo
   l'eccezione di rete. È il ramo dell'eccezione quello che si dimentica,
   ed è pure il peggiore: chi perde la linea a metà accesso si ritrova un
   token già speso e non riesce più a entrare nemmeno quando la rete torna.

   Se l'azzeramento fallisce — widget smontato nel frattempo, script mai
   arrivato — non deve travolgere l'esito del tentativo, che è la cosa che
   interessa a chi sta guardando lo schermo. */
export async function conTentativo(azzera, azione) {
  try {
    return await azione();
  } finally {
    try { if (typeof azzera === 'function') azzera(); } catch (e) { /* widget già via */ }
  }
}
