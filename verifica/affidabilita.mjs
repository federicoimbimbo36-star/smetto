/* ------------------------------------------------------------------ */
/* verifica/affidabilita.mjs — fase 2                                  */
/*                                                                     */
/* Sei difetti, sei sezioni. Ognuna è stata prima riprodotta con        */
/* codice in esecuzione contro la versione di prima, e ognuna fallisce  */
/* se la correzione viene tolta.                                        */
/*                                                                     */
/*   node verifica/affidabilita.mjs                                     */
/* ------------------------------------------------------------------ */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizzaRegistro, fondiRegistri, timbra, fondiValore } from '../src/utils/fusione.js';
import { creaKvSincronizzato } from '../src/utils/sincronizza.js';
import { creaSequenza, caricaSessione } from '../src/utils/sessione.js';
import {
  codiciDopoSync, gruppiDopoSync, membriDopoSync, attivoDopoSync, statoDopoSync,
} from '../src/utils/gruppiSync.js';

let passati = 0;
const falliti = [];
const ok = (nome, cond, extra = '') => {
  if (cond) passati += 1;
  else falliti.push(`${nome}${extra ? `\n      ${extra}` : ''}`);
};
const eq = (nome, a, b) => ok(nome, a === b, `atteso ${JSON.stringify(b)}, ottenuto ${JSON.stringify(a)}`);

const vuoto = () => ({
  v: 9, eventi: [], rimossi: [], gruppiUsciti: [], cigs: [], resists: [],
  ricadute: [], checkins: [], start: null, smessoDal: null, tags: {}, groups: [],
  notify: true, avvisiCorpo: true, onboarded: false,
  profile: { motivo: '', baseline: null, prezzoPacchetto: null, perPacchetto: 20 },
  plans: {}, tappeViste: { ref: null, idx: [] }, ripartenzeBase: 0, ripartenze: 0, orologi: {},
});

const T = 1_700_000_000_000;

/* ================================================================== */
/* 0. LA SESSIONE CHE CAMBIA MENTRE SI STA ANCORA CARICANDO            */
/*                                                                     */
/* Caricare un account è una catena: `getSession`, poi `loadLog`, che a */
/* sua volta legge il disco e interroga il database. Fra un'attesa e    */
/* l'altra la sessione può cambiare — logout da un'altra scheda,        */
/* accesso con un altro account — e il caricamento vecchio arrivava     */
/* comunque in fondo e chiamava `setIsAuthenticated(true)`, ripopolando */
/* i dati di chi era appena uscito.                                     */
/*                                                                     */
/* Qui il ritardo è comandato dal banco: si fa partire il caricamento,  */
/* si brucia il gettone a metà strada, e si controlla che il            */
/* caricamento non renda autenticato nessuno.                           */
/* ================================================================== */
{
  const attesa = (ms) => new Promise((r) => { setTimeout(r, ms); });

  /* UNO SCHERMO FINTO, non solo un elenco di fatti.

     Il test di prima controllava solo che non venisse chiamata
     `autentica()`. Non bastava: la sequenza vecchia veniva fermata prima
     di dichiarare autenticato l'account sbagliato, e intanto aveva già
     scritto dati, gruppi e notifiche. Qui c'è lo stato che l'utente
     vedrebbe davvero — utente in alto, dati a schermo, gruppi, notifiche
     programmate — e alla fine si guarda QUELLO. */
  const creaSchermo = () => ({
    utente: null,
    dati: null,
    gruppi: [],
    gruppoAttivo: null,
    visti: null,
    notifiche: [],
    autenticato: false,
    controllata: false,
    // quello che vede l'utente dopo un accesso riuscito
    scheda: null,
    toast: null,
    passwordPulite: false,
    erroreAccesso: null,
  });

  /* Le stesse due metà di App.jsx: `prepara` legge e restituisce,
     `applica` scrive. Il ritardo sta tutto dentro la lettura. */
  const finto = (schermo, utente, ritardoLog) => ({
    leggiSessione: async () => (utente ? { user: { id: utente } } : null),
    applicaProfilo: (u) => { schermo.utente = u.id; },
    preparaRegistro: async (uid) => {
      await attesa(ritardoLog);
      return {
        uid,
        dati: `dati-${uid}`,
        gruppi: [`gruppo-di-${uid}`],
        visti: `visti-${uid}`,
        tappa: `tappa-di-${uid}`,
      };
    },
    applicaRegistro: (pre) => {
      schermo.dati = pre.dati;
      schermo.gruppi = pre.gruppi;
      schermo.gruppoAttivo = pre.gruppi[0];
      schermo.visti = pre.visti;
      schermo.notifiche.push(pre.tappa);
    },
    utenteAdesso: () => schermo.utente,
    autentica: () => { schermo.autenticato = true; },
    finito: () => { schermo.controllata = true; },
  });

  /* --- caso normale: nessuno disturba --- */
  {
    const schermo = creaSchermo();
    const esito = await caricaSessione(creaSequenza(), finto(schermo, 'utente-A', 5));
    eq('sessione · senza disturbi si entra', esito, 'entrato');
    eq('sessione · con l\'utente giusto', schermo.utente, 'utente-A');
    eq('sessione · e i suoi dati a schermo', schermo.dati, 'dati-utente-A');
    ok('sessione · autenticato', schermo.autenticato);
    eq('sessione · i gruppi sono i suoi', schermo.gruppi.join(','), 'gruppo-di-utente-A');
    eq('sessione · e la tappa è programmata', schermo.notifiche.length, 1);
  }

  /* --- LOGOUT MENTRE IL REGISTRO È IN CARICAMENTO ---
     Alla fine non deve restare niente dell'account uscito: né dati, né
     gruppi, né notifiche. */
  {
    const seq = creaSequenza();
    const schermo = creaSchermo();
    const carico = caricaSessione(seq, finto(schermo, 'utente-A', 40));
    await attesa(10);
    eq('logout · il profilo di A è stato applicato', schermo.utente, 'utente-A');
    eq('logout · ma il registro non è ancora arrivato', schermo.dati, null);

    // logout da un'altra scheda: resetAuthState azzera le ref e brucia il gettone
    schermo.utente = null;
    schermo.dati = null;
    schermo.gruppi = [];
    seq.brucia();

    eq('logout · il caricamento sorpassato si dichiara scaduto', await carico, 'scaduta');
    eq('logout · NESSUN DATO dell\'account uscito', schermo.dati, null);
    eq('logout · nessun gruppo', schermo.gruppi.length, 0);
    eq('logout · NESSUNA NOTIFICA programmata', schermo.notifiche.length, 0);
    eq('logout · nessun elenco dei visti', schermo.visti, null);
    ok('logout · e non risulta autenticato nessuno', !schermo.autenticato);
    ok('logout · né si dichiara il controllo finito', !schermo.controllata);
  }

  /* --- IL CASO DELLA SEGNALAZIONE ---
     A parte lento, B entra e finisce, A arriva in ritardo. Alla fine
     utente e dati devono essere ENTRAMBI di B. */
  {
    const schermo = creaSchermo();
    const seq = creaSequenza();

    const caricoA = caricaSessione(seq, finto(schermo, 'utente-A', 60));
    await attesa(10);
    eq('sorpasso · A è partito', schermo.utente, 'utente-A');
    eq('sorpasso · e non ha ancora scritto niente', schermo.dati, null);

    // entra B: resetAuthState azzera tutto e brucia il gettone di A
    schermo.utente = null;
    schermo.dati = null;
    schermo.gruppi = [];
    schermo.visti = null;
    schermo.notifiche.length = 0;
    seq.brucia();

    // B carica in fretta e finisce prima di A
    eq('sorpasso · B entra', await caricaSessione(seq, finto(schermo, 'utente-B', 5)), 'entrato');
    eq('sorpasso · B è dentro', schermo.utente, 'utente-B');
    eq('sorpasso · con i dati di B', schermo.dati, 'dati-utente-B');

    // e adesso arriva A, in ritardo
    eq('sorpasso · A si dichiara scaduto', await caricoA, 'scaduta');

    eq('sorpasso · l\'utente finale è B', schermo.utente, 'utente-B');
    eq('sorpasso · I DATI FINALI SONO DI B', schermo.dati, 'dati-utente-B');
    eq('sorpasso · i gruppi finali sono di B', schermo.gruppi.join(','), 'gruppo-di-utente-B');
    eq('sorpasso · e i visti pure', schermo.visti, 'visti-utente-B');
    eq('sorpasso · una sola notifica programmata', schermo.notifiche.length, 1);
    eq('sorpasso · ed è quella di B', schermo.notifiche[0], 'tappa-di-utente-B');
    ok('sorpasso · nessuna traccia di A',
      !schermo.notifiche.some((n) => n.includes('utente-A')),
      `notifiche rimaste: ${schermo.notifiche.join(', ')}`);
  }

  /* --- gettone ancora valido, ma dentro c'è un altro ---
     Succede quando l'accesso avviene da questa scheda: `handleLogin` non
     passa dalla sequenza, quindi il gettone non si brucia. A salvare è il
     controllo sull'utente corrente. */
  {
    const schermo = creaSchermo();
    const seq = creaSequenza();
    const caricoA = caricaSessione(seq, finto(schermo, 'utente-A', 40));
    await attesa(10);

    // B entra dal modulo di accesso, senza toccare la sequenza
    schermo.utente = 'utente-B';
    schermo.dati = 'dati-utente-B';

    eq('utente cambiato · A si ferma anche col gettone valido', await caricoA, 'scaduta');
    eq('utente cambiato · i dati restano di B', schermo.dati, 'dati-utente-B');
    eq('utente cambiato · e nessuna notifica di A', schermo.notifiche.length, 0);
  }

  /* --- un errore su una sequenza scaduta non deve nemmeno lamentarsi --- */
  {
    const seq = creaSequenza();
    const lamentele = [];
    const carico = caricaSessione(seq, {
      leggiSessione: async () => { await attesa(30); throw new Error('rete assente'); },
      applicaProfilo: () => {},
      preparaRegistro: async () => ({}),
      applicaRegistro: () => {},
      utenteAdesso: () => null,
      autentica: () => {},
      finito: () => lamentele.push('controllata'),
      errore: (e) => lamentele.push(`errore:${e.message}`),
    });
    await attesa(5);
    seq.brucia();
    eq('sessione · un errore su una sequenza scaduta si zittisce', await carico, 'scaduta');
    eq('sessione · e non tocca lo stato', lamentele.length, 0);
  }

  /* ------------------------------------------------------------------ */
  /*  IL PERCORSO DEL MODULO DI ACCESSO                                  */
  /*                                                                     */
  /*  `handleAuthSubmit` non passava dalla sequenza protetta: chiamava    */
  /*  `applyProfile`, poi `loadLog`, poi `setIsAuthenticated(true)`, e i  */
  /*  tre write arrivavano comunque, anche in ritardo. Il commento diceva */
  /*  che dalla stessa scheda la sessione non può cambiare durante il     */
  /*  caricamento — ma il cambio arriva da un'ALTRA scheda, e questa non  */
  /*  se ne accorge.                                                      */
  /*                                                                     */
  /*  Qui si ricostruisce il percorso intero, non `caricaSessione` da     */
  /*  sola: credenziali, risposta di `signIn`, sequenza bruciata,         */
  /*  rilettura della sessione, e il benvenuto solo se si è entrati.      */
  /* ------------------------------------------------------------------ */
  {
    /* le stesse righe di handleAuthSubmit, con le stesse dipendenze */
    const creaModulo = (schermo, seqRef, backend) => async (telefono, password) => {
      const res = await backend.signIn(telefono, password);
      if (res.error) {
        schermo.erroreAccesso = 'Numero di telefono o password non corretti.';
        return 'errore';
      }
      seqRef.corrente.brucia();
      const atteso = res.user.id;
      const esito = await caricaSessione(seqRef.corrente, {
        leggiSessione: async () => {
          const sessione = await backend.getSession();
          return sessione?.user?.id === atteso ? sessione : null;
        },
        applicaProfilo: (u) => { schermo.utente = u.id; },
        preparaRegistro: async (uid) => {
          await attesa(backend.ritardo(uid));
          return {
            uid,
            dati: `dati-${uid}`,
            gruppi: [`gruppo-di-${uid}`],
            visti: `visti-${uid}`,
            tappa: `tappa-di-${uid}`,
          };
        },
        applicaRegistro: (pre) => {
          schermo.dati = pre.dati;
          schermo.gruppi = pre.gruppi;
          schermo.gruppoAttivo = pre.gruppi[0];
          schermo.visti = pre.visti;
          schermo.notifiche.push(pre.tappa);
        },
        utenteAdesso: () => schermo.utente,
        autentica: () => { schermo.autenticato = true; },
      });
      if (esito !== 'entrato') return esito;
      schermo.scheda = 'oggi';
      schermo.toast = 'Bentornato 👋';
      schermo.passwordPulite = true;
      return 'entrato';
    };

    /* il backend finto: una sessione condivisa fra le schede, come
       localStorage, e un ritardo per utente deciso dal test */
    const creaBackend = () => {
      const ritardi = {};
      let sessione = null;
      return {
        ritardi,
        ritardo: (uid) => ritardi[uid] ?? 0,
        entra: (uid) => { sessione = { user: { id: uid } }; },
        esci: () => { sessione = null; },
        async signIn(_t, _p) {
          if (_p === 'sbagliata') return { error: 'credenziali' };
          sessione = { user: { id: _t } };
          return { user: { id: _t } };
        },
        async getSession() { return sessione; },
      };
    };

    /* --- accesso normale --- */
    {
      const schermo = creaSchermo();
      const seqRef = { corrente: creaSequenza() };
      const backend = creaBackend();
      const accedi = creaModulo(schermo, seqRef, backend);

      eq('login · un accesso normale entra', await accedi('utente-A', 'giusta'), 'entrato');
      eq('login · con i suoi dati', schermo.dati, 'dati-utente-A');
      ok('login · autenticato', schermo.autenticato);
      eq('login · e il benvenuto arriva', schermo.toast, 'Bentornato 👋');
      eq('login · la scheda iniziale è impostata', schermo.scheda, 'oggi');
      ok('login · e i campi password sono puliti', schermo.passwordPulite);
    }

    /* --- credenziali sbagliate: l'errore normale resta --- */
    {
      const schermo = creaSchermo();
      const seqRef = { corrente: creaSequenza() };
      const accedi = creaModulo(schermo, seqRef, creaBackend());

      eq('login · credenziali sbagliate', await accedi('utente-A', 'sbagliata'), 'errore');
      eq('login · il messaggio di errore c\'è ancora',
        schermo.erroreAccesso, 'Numero di telefono o password non corretti.');
      eq('login · e non è stato applicato niente', schermo.dati, null);
      ok('login · nessuno è autenticato', !schermo.autenticato);
    }

    /* --- IL CASO DELLA SEGNALAZIONE ---
       A fa l'accesso, il suo caricamento è lento, l'altra scheda passa a
       B, B finisce, A arriva in ritardo. Alla fine tutto deve essere di B. */
    {
      const schermo = creaSchermo();
      const seqRef = { corrente: creaSequenza() };
      const backend = creaBackend();
      backend.ritardi['utente-A'] = 60;
      backend.ritardi['utente-B'] = 5;
      const accedi = creaModulo(schermo, seqRef, backend);

      const accessoA = accedi('utente-A', 'giusta');
      await attesa(15);
      eq('login sorpassato · A ha applicato il profilo', schermo.utente, 'utente-A');
      eq('login sorpassato · ma non ancora i dati', schermo.dati, null);

      /* l'altra scheda cambia la sessione a B. Qui succede quello che fa
         `onAuthChange`: resetAuthState azzera tutto e brucia la sequenza,
         poi si carica B. */
      schermo.utente = null;
      schermo.dati = null;
      schermo.gruppi = [];
      schermo.visti = null;
      schermo.notifiche.length = 0;
      schermo.autenticato = false;
      seqRef.corrente.brucia();
      backend.entra('utente-B');

      const esitoB = await caricaSessione(seqRef.corrente, {
        leggiSessione: () => backend.getSession(),
        applicaProfilo: (u) => { schermo.utente = u.id; },
        preparaRegistro: async (uid) => {
          await attesa(backend.ritardo(uid));
          return {
            uid,
            dati: `dati-${uid}`,
            gruppi: [`gruppo-di-${uid}`],
            visti: `visti-${uid}`,
            tappa: `tappa-di-${uid}`,
          };
        },
        applicaRegistro: (pre) => {
          schermo.dati = pre.dati;
          schermo.gruppi = pre.gruppi;
          schermo.gruppoAttivo = pre.gruppi[0];
          schermo.visti = pre.visti;
          schermo.notifiche.push(pre.tappa);
        },
        utenteAdesso: () => schermo.utente,
        autentica: () => { schermo.autenticato = true; },
      });
      eq('login sorpassato · B è entrato', esitoB, 'entrato');

      // e adesso arriva A, in ritardo
      eq('login sorpassato · l\'accesso di A si ritira', await accessoA, 'scaduta');

      eq('login sorpassato · l\'utente finale è B', schermo.utente, 'utente-B');
      eq('login sorpassato · I DATI FINALI SONO DI B', schermo.dati, 'dati-utente-B');
      eq('login sorpassato · i gruppi sono di B', schermo.gruppi.join(','), 'gruppo-di-utente-B');
      eq('login sorpassato · il gruppo attivo è di B', schermo.gruppoAttivo, 'gruppo-di-utente-B');
      eq('login sorpassato · i visti sono di B', schermo.visti, 'visti-utente-B');
      eq('login sorpassato · una sola notifica', schermo.notifiche.length, 1);
      eq('login sorpassato · ed è quella di B', schermo.notifiche[0], 'tappa-di-utente-B');
      ok('login sorpassato · nessuna traccia di A',
        !schermo.notifiche.some((n) => n.includes('utente-A')),
        `notifiche: ${schermo.notifiche.join(', ')}`);
      ok('login sorpassato · e resta autenticato B', schermo.autenticato);
      eq('login sorpassato · nessun benvenuto per A', schermo.toast, null);
      ok('login sorpassato · e i campi password di A non sono stati toccati',
        !schermo.passwordPulite);
    }

    /* --- login A, poi LOGOUT da un'altra scheda durante il caricamento --- */
    {
      const schermo = creaSchermo();
      const seqRef = { corrente: creaSequenza() };
      const backend = creaBackend();
      backend.ritardi['utente-A'] = 50;
      const accedi = creaModulo(schermo, seqRef, backend);

      const accessoA = accedi('utente-A', 'giusta');
      await attesa(15);

      // logout dall'altra scheda
      schermo.utente = null;
      seqRef.corrente.brucia();
      backend.esci();

      eq('login + logout · l\'accesso si ritira', await accessoA, 'scaduta');
      eq('login + logout · NESSUN DATO di A', schermo.dati, null);
      eq('login + logout · nessun gruppo', schermo.gruppi.length, 0);
      eq('login + logout · NESSUNA NOTIFICA', schermo.notifiche.length, 0);
      eq('login + logout · nessun elenco dei visti', schermo.visti, null);
      ok('login + logout · nessuno risulta autenticato', !schermo.autenticato);
      eq('login + logout · nessun utente a schermo', schermo.utente, null);
      eq('login + logout · e nessun benvenuto', schermo.toast, null);
    }

    /* --- la sessione riletta è di un altro: non si applica niente --- */
    {
      const schermo = creaSchermo();
      const seqRef = { corrente: creaSequenza() };
      const backend = creaBackend();
      backend.ritardi['utente-A'] = 30;
      const accedi = creaModulo(schermo, seqRef, backend);

      // fra signIn e la rilettura, l'altra scheda si prende la sessione
      const originale = backend.getSession.bind(backend);
      backend.getSession = async () => { backend.entra('utente-B'); return originale(); };

      eq('login · se la sessione riletta è di un altro non si entra',
        await accedi('utente-A', 'giusta'), 'nessuna');
      eq('login · e non si applica niente', schermo.dati, null);
      ok('login · né si autentica nessuno', !schermo.autenticato);
      eq('login · nessun benvenuto', schermo.toast, null);
    }

    /* --- e il sorgente deve restare agganciato: se `handleAuthSubmit`
           tornasse a chiamare il caricamento per conto suo, il modello qui
           sopra descriverebbe un'app che non esiste più --- */
    {
      const app = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      const i = app.indexOf('async function handleAuthSubmit');
      const corpo = app.slice(i, app.indexOf('\n  }\n', i));
      ok('login · handleAuthSubmit passa da caricaSessione',
        /caricaSessione\(\s*sequenzaRef\.current/.test(corpo));
      ok('login · e non chiama più il caricamento diretto',
        !/\bloadLog\(/.test(corpo), 'handleAuthSubmit chiama ancora loadLog');
      ok('login · brucia la sequenza prima di aprirne una nuova',
        corpo.indexOf('sequenzaRef.current.brucia()') < corpo.indexOf('caricaSessione('));
      ok('login · e il benvenuto è sotto il controllo dell\'esito',
        corpo.indexOf("esito !== 'entrato'") < corpo.indexOf('showToast('));
      ok('login · `loadLog` non esiste più da nessuna parte',
        !/function\s+loadLog\b/.test(app));
    }
  }

  /* --- senza sessione si arriva comunque alla schermata di accesso --- */
  {
    const schermo = creaSchermo();
    eq('sessione · senza sessione non si resta appesi',
      await caricaSessione(creaSequenza(), finto(schermo, null, 0)), 'nessuna');
    ok('sessione · e il controllo si dichiara finito', schermo.controllata);
    eq('sessione · senza scrivere niente', schermo.dati, null);
  }
}

/* ================================================================== */
/* 1. USCIRE DA UN GRUPPO QUANDO IL SERVER DICE DI NO                  */
/*                                                                     */
/* `groups.leave` torna `{ error }` quando la cancellazione non passa,  */
/* e App.jsx buttava via quel valore: toglieva il gruppo dallo schermo  */
/* e diceva «sei uscito» comunque. Il gruppo spariva dal telefono e     */
/* l'iscrizione restava sul database — si continuava a comparire nella  */
/* classifica degli altri senza più avere il gruppo per uscirne.        */
/*                                                                     */
/* Il controllo è sul SORGENTE perché la funzione vive dentro un        */
/* componente React: quello che conta è che l'esito venga guardato      */
/* prima di toccare lo stato locale.                                    */
/* ================================================================== */
{
  const app = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8');
  const senzaCommenti = app
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  const i = senzaCommenti.indexOf('groups.leave(');
  ok('uscita · handleEsciGruppo chiama groups.leave', i > 0);
  const dopo = senzaCommenti.slice(i, i + 1500);

  ok('uscita · l\'esito di leave viene raccolto, non buttato',
    /=\s*await\s+groups\.leave\(/.test(senzaCommenti),
    'la chiamata è ancora `await groups.leave(...)` senza assegnazione');
  ok('uscita · e viene controllato prima di toccare lo stato',
    /\.error/.test(dopo.slice(0, dopo.indexOf('salva('))),
    'fra leave e salva non c\'è nessun controllo sull\'errore');
  ok('uscita · in caso di errore si esce senza salvare',
    /if\s*\(\s*esito\?\.error\s*\)[\s\S]{0,220}return;/.test(dopo));
  ok('uscita · e senza dire che l\'uscita è riuscita',
    dopo.indexOf('return;') < dopo.indexOf('Sei uscito'),
    'il messaggio di conferma è raggiungibile anche con l\'errore');
}

/* ================================================================== */
/* 2. NOTIFICHE DELLE TAPPE SORPASSATE                                 */
/*                                                                     */
/* Programmare le tappe è una catena di attese. Due sigarette a poca    */
/* distanza fanno partire due catene, e siccome le notifiche hanno      */
/* identificativi fissi vince l'ULTIMA che arriva — che può essere la   */
/* più vecchia. Restavano programmate le tappe di una sigaretta che non */
/* era più l'ultima: il telefono avvisava «sono passate due ore»        */
/* contando da un momento sbagliato.                                    */
/*                                                                     */
/* Qui si monta il ramo web con un finto service worker che risponde    */
/* lento a comando, così l'ordine di arrivo è deciso dal test.          */
/* ================================================================== */
{
  const attesa = (ms) => new Promise((r) => { setTimeout(r, ms); });
  const programmate = [];
  let ritardo = 0;

  let ritardoChiusura = 0;
  const reg = {
    async getNotifications() {
      if (ritardo) await attesa(ritardo);
      if (ritardoChiusura) await attesa(ritardoChiusura);
      return programmate.slice();
    },
    async showNotification(titolo, opz) {
      const n = {
        tag: opz.tag,
        quando: opz.showTrigger?.quando,
        close() { const i = programmate.indexOf(n); if (i >= 0) programmate.splice(i, 1); },
      };
      programmate.push(n);
      return n;
    },
  };

  const def = (nome, valore) => Object.defineProperty(globalThis, nome, {
    value: valore, configurable: true, writable: true,
  });
  def('navigator', { serviceWorker: { getRegistration: async () => reg } });
  class FintaNotifica {}
  FintaNotifica.permission = 'granted';
  FintaNotifica.prototype.showTrigger = undefined;
  def('Notification', FintaNotifica);
  class FintoTrigger { constructor(quando) { this.quando = quando; } }
  def('window', { TimestampTrigger: FintoTrigger });

  const { programmaTappe, annullaTappe } = await import('../src/notificheTappe.js');

  const vecchia = Date.now() - 60 * 60000;   // sigaretta di un'ora fa
  const nuova = Date.now();                  // quella appena registrata

  /* la catena della VECCHIA parte per prima ma è lenta, quella della
     NUOVA parte dopo ed è veloce: senza guardia vince la vecchia */
  ritardo = 40;
  const lenta = programmaTappe(vecchia);
  await attesa(5);
  ritardo = 0;
  await programmaTappe(nuova);
  const esitoLenta = await lenta;

  const tappe = programmate.filter((n) => n.tag?.startsWith('tappa-'));
  ok('tappe · qualcosa è stato programmato', tappe.length > 0);
  eq('tappe · la catena sorpassata si ritira', esitoLenta, false);
  ok('tappe · nessuna tappa punta alla sigaretta vecchia',
    tappe.every((n) => n.quando > vecchia + 30000 && n.quando > nuova),
    `programmate: ${tappe.map((n) => n.quando - nuova).join(', ')} ms dopo l'ultima`);

  /* e una programmazione in volo non deve ricomparire dopo un logout */
  programmate.length = 0;
  ritardo = 40;
  const inVolo = programmaTappe(Date.now());
  await attesa(5);
  ritardo = 0;
  await annullaTappe();
  eq('tappe · annullaTappe sorpassa la programmazione in volo', await inVolo, false);
  eq('tappe · dopo il logout non resta niente programmato',
    programmate.filter((n) => n.tag?.startsWith('tappa-')).length, 0);
  /* ---------------------------------------------------------------- */
  /* Le tre sequenze che il numero da solo non copriva. La coda seriale  */
  /* mette le operazioni in fila; il numero scarta quelle superate.      */
  /* ---------------------------------------------------------------- */

  /* a) ANNULLAMENTO LENTO → PROGRAMMAZIONE RAPIDA.
     Senza ordine, l'annullamento finiva DOPO e cancellava le notifiche
     appena programmate: telefono senza nessuna tappa. */
  {
    programmate.length = 0;
    ritardo = 0;
    await programmaTappe(Date.now() - 10 * 60000);   // qualcosa da cancellare
    ok('sequenza a · c\'è qualcosa da annullare',
      programmate.some((n) => n.tag?.startsWith('tappa-')));

    ritardoChiusura = 40;
    const annulla = annullaTappe();
    await attesa(5);
    ritardoChiusura = 0;
    const quando = Date.now();
    await programmaTappe(quando);
    await annulla;

    const restano = programmate.filter((n) => n.tag?.startsWith('tappa-'));
    ok('sequenza a · le notifiche nuove restano', restano.length > 0,
      'l\'annullamento lento ha cancellato quelle programmate dopo di lui');
    ok('sequenza a · e sono quelle della programmazione nuova',
      restano.every((n) => n.quando > quando));
  }

  /* b) PROGRAMMAZIONE LENTA → ANNULLAMENTO.
     La programmazione non deve poter ricomparire dopo l'annullamento. */
  {
    programmate.length = 0;
    ritardo = 40;
    const lenta = programmaTappe(Date.now());
    await attesa(5);
    ritardo = 0;
    await annullaTappe();
    await lenta;

    eq('sequenza b · dopo l\'annullamento non resta niente',
      programmate.filter((n) => n.tag?.startsWith('tappa-')).length, 0);
    // e nemmeno più tardi: la coda ha già finito, ma controlliamo comunque
    await attesa(60);
    eq('sequenza b · e non ricompare nemmeno dopo',
      programmate.filter((n) => n.tag?.startsWith('tappa-')).length, 0);
  }

  /* c) PROGRAMMAZIONE VECCHIA → PROGRAMMAZIONE NUOVA.
     Devono restare solo le tappe della più recente. */
  {
    programmate.length = 0;
    const vecchiaTs = Date.now() - 30 * 60000;
    const nuovaTs = Date.now();
    ritardo = 40;
    const primaChiamata = programmaTappe(vecchiaTs);
    await attesa(5);
    ritardo = 0;
    await programmaTappe(nuovaTs);
    await primaChiamata;

    const restano = programmate.filter((n) => n.tag?.startsWith('tappa-'));
    ok('sequenza c · restano solo le tappe della più recente',
      restano.length > 0 && restano.every((n) => n.quando > nuovaTs),
      `scarti rispetto all'ultima: ${restano.map((n) => n.quando - nuovaTs).join(', ')}`);
    // nessun doppione: gli identificativi sono fissi, due catene ne lascerebbero due
    const tag = restano.map((n) => n.tag);
    eq('sequenza c · nessuna tappa doppia', tag.length, new Set(tag).size);
  }
}

/* ================================================================== */
/* 3. CAMBI DI SESSIONE DA UN'ALTRA SCHEDA                             */
/*                                                                     */
/* La sessione si leggeva una volta sola all'avvio. Uscire in un'altra  */
/* scheda, o entrare con un altro account, lasciava questa a mostrare   */
/* i dati di prima. I due backend devono esporre la stessa forma, così  */
/* App.jsx non deve sapere quale sta usando.                            */
/* ================================================================== */
{
  const app = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8');
  const sorgenti = {
    supabase: readFileSync(resolve(process.cwd(), 'src/auth/supabaseAuth.js'), 'utf8'),
    locale: readFileSync(resolve(process.cwd(), 'src/auth/localAuth.js'), 'utf8'),
  };

  ok('sessione · supabaseAuth espone onAuthChange', /onAuthChange\s*\(/.test(sorgenti.supabase));
  ok('sessione · localAuth espone onAuthChange', /onAuthChange\s*\(/.test(sorgenti.locale));
  ok('sessione · supabaseAuth si aggancia a onAuthStateChange',
    sorgenti.supabase.includes('onAuthStateChange'));
  ok('sessione · e restituisce come staccarsi',
    /unsubscribe/.test(sorgenti.supabase));
  ok('sessione · App.jsx ascolta i cambi', /auth\.onAuthChange\(/.test(app));
  ok('sessione · e se la sessione se ne va torna all\'accesso',
    /if\s*\(!idOra\)\s*\{\s*resetAuthState\(\);/.test(app));
  ok('sessione · un rinnovo del token non fa niente',
    /if\s*\(idOra === idPrima\)\s*return;/.test(app),
    'senza questo, ogni rinnovo del token ricaricherebbe tutto');

  // localAuth.onAuthChange, eseguito davvero
  const ascoltatori = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: {
      addEventListener: (t, fn) => { if (t === 'storage') ascoltatori.push(fn); },
      removeEventListener: (t, fn) => {
        const i = ascoltatori.indexOf(fn); if (i >= 0) ascoltatori.splice(i, 1);
      },
    },
  });
  const { default: localAuth } = await import('../src/auth/localAuth.js');
  const stacca = localAuth.onAuthChange(() => {});
  eq('sessione · localAuth si aggancia all\'evento storage', ascoltatori.length, 1);
  ok('sessione · e restituisce una funzione per staccarsi', typeof stacca === 'function');
  stacca();
  eq('sessione · che stacca davvero', ascoltatori.length, 0);
}

/* ================================================================== */
/* 4. UNA LETTURA NON LEGGE LA CHIAVE DI UN ALTRO                      */
/*                                                                     */
/* `set` e `delete` il controllo ce l'hanno; `get` no. E `get` è        */
/* peggio, perché non si limita a leggere: fonde il risultato nella     */
/* copia locale e la riscrive.                                          */
/* ================================================================== */
{
  const uidDaChiave = (key) => {
    const m = /^smetto:(?:log|seen):(.+)$/.exec(String(key));
    return m ? m[1] : null;
  };
  const A = 'utente-A';
  const B = 'utente-B';
  const chiaveA = `smetto:log:${A}`;
  /* Il registro vero tiene gli EVENTI, non gli istanti: `cigs` è una
     proiezione che `normalizzaRegistro` rigenera. Un fixture con i soli
     `cigs` e `eventi: []` viene letto come «registro nuovo, zero eventi». */
  const reg = (n) => JSON.stringify({
    v: 9,
    eventi: Array.from({ length: n }, (_, i) => ({ id: `ev-${i}`, tipo: 'cig', ts: T + i * 60000 })),
    rimossi: [], rev: 1,
  });

  const letture = [];
  const righe = new Map();
  let dentro = null;
  const remoto = {
    async utente() { return dentro; },
    async leggi(uid, key) {
      letture.push(`${uid}|${key}`);
      const r = righe.get(`${uid}|${key}`);
      return { data: r ? { value: r.value, rev: r.rev } : null };
    },
    async aggiorna() { return { data: [] }; },
    async inserisci(uid, key, valore) {
      righe.set(`${uid}|${key}`, { value: valore, rev: 1 }); return { data: [{ rev: 1 }] };
    },
    async cancella() { return { data: [] }; },
    async elenca() { return { data: [] }; },
  };

  const mappa = new Map();
  const locale = {
    async get(k) { const v = mappa.get(k); return v === undefined ? null : { key: k, value: v }; },
    async set(k, v) { mappa.set(k, v); return { key: k, value: v }; },
    async delete(k) { mappa.delete(k); return { key: k, deleted: true }; },
    async list(p = '') { return { keys: [...mappa.keys()].filter((x) => x.startsWith(p)), prefix: p }; },
  };

  const kv = creaKvSincronizzato({
    locale, remoto, fondi: fondiValore, attesa: 30, uidDaChiave,
  });

  // sul dispositivo c'è il registro di A, con tre sigarette
  mappa.set(chiaveA, reg(3));
  // ma dentro c'è B
  dentro = B;

  const letto = await kv.get(chiaveA);

  eq('lettura · non è partita nessuna interrogazione al database', letture.length, 0);
  ok('lettura · in particolare nessuna con la sessione di B sulla chiave di A',
    !letture.includes(`${B}|${chiaveA}`));
  eq('lettura · torna la copia sul dispositivo, intatta', letto?.value, reg(3));
  eq('lettura · e la copia sul dispositivo non è stata riscritta', mappa.get(chiaveA), reg(3));

  // con il proprietario dentro, invece, si legge normalmente
  dentro = A;
  /* La riga del database porta il valore GIÀ come oggetto: la colonna è
     jsonb, e `get` infatti passa `esito.data.value` alla fusione senza
     analizzarlo, mentre la copia locale ci passa attraverso `analizza`. */
  righe.set(`${A}|${chiaveA}`, { value: JSON.parse(reg(5)), rev: 2 });
  await kv.get(chiaveA);
  ok('lettura · con il proprietario dentro la lettura parte',
    letture.includes(`${A}|${chiaveA}`));
  const dopoFusione = JSON.parse(mappa.get(chiaveA));
  eq('lettura · e la fusione tiene tutte le sigarette', dopoFusione.eventi.length, 5);
}

/* ================================================================== */
/* 5. PAREGGI DEGLI OROLOGI, DETERMINISTICI                            */
/*                                                                     */
/* A parità di orologio decideva l'identificativo del dispositivo. Ma i */
/* due dispositivi possono essere lo stesso — `ID_DISPOSITIVO` si       */
/* rigenera a ogni caricamento, quindi la copia locale e la riga sul    */
/* database possono portare lo stesso timbro — e allora vinceva il      */
/* PRIMO ARGOMENTO: fondere locale con remoto dava un risultato,        */
/* fondere remoto con locale ne dava un altro.                          */
/* ================================================================== */
{
  const base = normalizzaRegistro(vuoto(), vuoto);
  const conValore = (campo, valore, orologio, dispositivo) => ({
    ...base, dispositivo, [campo]: valore, orologi: { [campo]: orologio },
  });

  const a = conValore('smessoDal', 111, T, 'dSTESSO');
  const b = conValore('smessoDal', 999, T, 'dSTESSO');
  eq('pareggio · fondere nei due versi dà lo stesso risultato',
    fondiRegistri(a, b, vuoto).smessoDal, fondiRegistri(b, a, vuoto).smessoDal);

  // il prezzo del pacchetto: da lì passano tutti i conti dei risparmi
  const prezzo = (v, disp) => ({
    ...base, dispositivo: disp,
    profile: { ...base.profile, prezzoPacchetto: v },
    orologi: { 'profile.prezzoPacchetto': T },
  });
  const c = prezzo(5.5, 'dSTESSO');
  const d = prezzo(6.2, 'dSTESSO');
  eq('pareggio · vale anche per i campi dentro le mappe',
    fondiRegistri(c, d, vuoto).profile.prezzoPacchetto,
    fondiRegistri(d, c, vuoto).profile.prezzoPacchetto);

  // dispositivi diversi: continua a decidere il dispositivo, come prima
  const e = conValore('smessoDal', 111, T, 'dAAA');
  const f = conValore('smessoDal', 999, T, 'dZZZ');
  eq('pareggio · con dispositivi diversi decide ancora il dispositivo',
    fondiRegistri(e, f, vuoto).smessoDal, 999);
  eq('pareggio · e anche quello non dipende dall\'ordine',
    fondiRegistri(f, e, vuoto).smessoDal, 999);

  // orologi diversi: vince il più recente, come sempre
  const g = conValore('smessoDal', 111, T + 1000, 'dSTESSO');
  const h = conValore('smessoDal', 999, T, 'dSTESSO');
  eq('pareggio · un orologio più recente vince comunque',
    fondiRegistri(g, h, vuoto).smessoDal, 111);
  eq('pareggio · nei due versi', fondiRegistri(h, g, vuoto).smessoDal, 111);

  // e la fusione resta idempotente
  const uno = fondiRegistri(a, b, vuoto);
  eq('pareggio · fondere due volte non cambia niente',
    JSON.stringify(fondiRegistri(uno, uno, vuoto)), JSON.stringify(uno));
}

/* ================================================================== */
/* 6. USCIRE DA UN GRUPPO, E POTERCI RIENTRARE                         */
/*                                                                     */
/* Due difetti in fila, non uno.                                        */
/*                                                                     */
/* Il primo: `groups` si fonde a orologio, quindi un dispositivo che    */
/* non sapeva dell'uscita e ha toccato la lista dopo rimetteva dentro   */
/* il gruppo — con l'iscrizione già cancellata sul server.               */
/*                                                                     */
/* Il secondo, che la prima correzione ha introdotto: `gruppiUsciti`    */
/* era un'unione permanente di codici, e un'unione non si disfa. Una    */
/* copia rimasta offline con la vecchia lapide se la riportava dietro   */
/* alla prima fusione e buttava fuori l'utente da un gruppo in cui era  */
/* appena rientrato. Una lapide non si toglie: va bene per una          */
/* sigaretta cancellata, non per un gruppo da cui si esce e si rientra. */
/*                                                                     */
/* Adesso ogni uscita e ogni rientro sono un'operazione con la sua      */
/* versione, su `gruppiStato.<codice>`. Qui si ricostruisce quello che  */
/* fa davvero App.jsx: partire dal registro normalizzato, cambiare lo   */
/* stato del singolo gruppo, e passare da `timbra` come fa `salva`.     */
/* ================================================================== */
{
  const apri = (codici) => normalizzaRegistro({ ...vuoto(), groups: codici }, vuoto);
  /* le stesse due righe di handleEsciGruppo e handleConfermaJoin */
  const esci = (d, codice, quando) => normalizzaRegistro(timbra(d, {
    ...d,
    groups: (d.groups || []).filter((c) => c !== codice),
    gruppiStato: { ...(d.gruppiStato || {}), [codice]: false },
  }, quando), vuoto);
  const entra = (d, codice, quando) => normalizzaRegistro(timbra(d, {
    ...d,
    groups: [...(d.groups || []), codice],
    gruppiStato: { ...(d.gruppiStato || {}), [codice]: true },
  }, quando), vuoto);

  /* --- il primo difetto: il gruppo lasciato non deve tornare --- */
  {
    const base = entra(entra(apri([]), 'AAAAAA', T), 'BBBBBB', T);
    const uno = esci(base, 'AAAAAA', T + 100000);
    // l'altro telefono non lo sa ed entra in CCCCCC DOPO
    const due = entra(base, 'CCCCCC', T + 200000);

    const fuso = fondiRegistri(uno, due, vuoto);
    ok('gruppi · il gruppo lasciato non ritorna', !fuso.groups.includes('AAAAAA'),
      `gruppi dopo la fusione: ${fuso.groups.join(', ')}`);
    ok('gruppi · quello nuovo dell\'altro telefono sopravvive', fuso.groups.includes('CCCCCC'));
    ok('gruppi · e quello comune resta', fuso.groups.includes('BBBBBB'));
    eq('gruppi · nei due versi lo stesso risultato',
      fondiRegistri(due, uno, vuoto).groups.join(','), fuso.groups.join(','));
    ok('gruppi · l\'uscita resta scritta anche per le versioni precedenti',
      fuso.gruppiUsciti.includes('AAAAAA'));
  }

  /* --- IL SECONDO DIFETTO: rientrare con una replica vecchia in giro ---
     È lo scenario chiesto: telefono 1 esce, telefono 2 resta offline con
     l'uscita, telefono 1 rientra, e poi i due si sincronizzano. Con
     l'unione permanente il telefono 2 rimetteva la lapide e l'utente
     veniva espulso di nuovo — senza che nessuno avesse chiesto niente. */
  {
    const base = entra(apri([]), 'AAAAAA', T);
    const uscito = esci(base, 'AAAAAA', T + 100000);

    // telefono 2 riceve l'uscita e poi resta offline: questa è la sua copia
    const replicaVecchia = fondiRegistri(normalizzaRegistro(vuoto(), vuoto), uscito, vuoto);
    ok('rientro · il telefono offline ha davvero registrato l\'uscita',
      !replicaVecchia.groups.includes('AAAAAA')
      && replicaVecchia.gruppiStato.AAAAAA === false,
      'la replica non conserva l\'uscita: lo scenario non starebbe provando niente');

    // telefono 1 rientra
    const rientrato = entra(uscito, 'AAAAAA', T + 200000);
    ok('rientro · dopo il rientro il gruppo c\'è', rientrato.groups.includes('AAAAAA'));

    // e adesso i due si incontrano
    const dopoSync = fondiRegistri(rientrato, replicaVecchia, vuoto);
    ok('rientro · LA REPLICA VECCHIA NON ESPELLE DI NUOVO',
      dopoSync.groups.includes('AAAAAA'),
      'la copia offline ha rimesso l\'uscita sopra un rientro più recente');
    eq('rientro · e non dipende dall\'ordine della fusione',
      fondiRegistri(replicaVecchia, rientrato, vuoto).groups.includes('AAAAAA'), true);
    eq('rientro · il gruppo non compare fra gli usciti',
      dopoSync.gruppiUsciti.includes('AAAAAA'), false);

    // fondere più volte, in ordini diversi, non cambia niente
    const a1 = fondiRegistri(fondiRegistri(rientrato, replicaVecchia, vuoto), uscito, vuoto);
    const a2 = fondiRegistri(uscito, fondiRegistri(replicaVecchia, rientrato, vuoto), vuoto);
    eq('rientro · associativa', a1.groups.join(','), a2.groups.join(','));
    ok('rientro · e il rientro sopravvive a entrambe', a1.groups.includes('AAAAAA'));
    eq('rientro · idempotente',
      fondiRegistri(dopoSync, dopoSync, vuoto).groups.join(','), dopoSync.groups.join(','));

    // e si può uscire di nuovo: l'ultima operazione è quella che vale
    const uscitoDiNuovo = esci(dopoSync, 'AAAAAA', T + 300000);
    ok('rientro · si può uscire di nuovo dopo essere rientrati',
      !fondiRegistri(uscitoDiNuovo, rientrato, vuoto).groups.includes('AAAAAA'));
  }

  /* --- compatibilità con i registri già scritti --- */
  {
    const vecchioSoloGroups = normalizzaRegistro({ ...vuoto(), groups: ['AAAAAA'] }, vuoto);
    ok('compatibilità · un registro con le sole `groups` tiene i suoi gruppi',
      vecchioSoloGroups.groups.includes('AAAAAA'));
    eq('compatibilità · e viene tradotto in stato', vecchioSoloGroups.gruppiStato.AAAAAA, true);

    const vecchioConLapidi = normalizzaRegistro(
      { ...vuoto(), groups: ['BBBBBB'], gruppiUsciti: ['AAAAAA'] }, vuoto,
    );
    eq('compatibilità · le vecchie lapidi diventano uscite', vecchioConLapidi.gruppiStato.AAAAAA, false);
    ok('compatibilità · e il gruppo uscito resta fuori',
      !vecchioConLapidi.groups.includes('AAAAAA'));
    ok('compatibilità · gli altri gruppi non si perdono',
      vecchioConLapidi.groups.includes('BBBBBB'));

    /* La migrazione dà alle vecchie liste una versione BASSA, apposta: un
       rientro fatto dopo l'aggiornamento deve vincere su un registro
       scritto prima, non il contrario. */
    const base = entra(normalizzaRegistro(vuoto(), vuoto), 'AAAAAA', T + 500000);
    const fuso = fondiRegistri(base, vecchioConLapidi, vuoto);
    ok('compatibilità · un registro vecchio non annulla un rientro nuovo',
      fuso.groups.includes('AAAAAA'));

    const senzaNiente = normalizzaRegistro({ ...vuoto(), gruppiStato: undefined }, vuoto);
    eq('compatibilità · un registro senza nessuna delle due liste si legge lo stesso',
      Object.keys(senzaNiente.gruppiStato).length, 0);
  }
}

/* ================================================================== */
/* 7. UN GRUPPO SCIOLTO NON DEVE TORNARE                               */
/*                                                                     */
/* Quando `groups.fetch` dice che un gruppo non esiste più, `sync` lo   */
/* toglieva dalla sola lista `groups` e scriveva il registro a mano con */
/* `writeStore`. Due cose sbagliate in una riga.                        */
/*                                                                     */
/* `groups` non è più la verità: da quando uscita e rientro sono        */
/* operazioni versionate, la verità è `gruppiStato`, e `groups` è una   */
/* proiezione che `normalizzaRegistro` rigenera da lì. Lasciando        */
/* `gruppiStato` con il codice ancora a `true`, il gruppo sciolto        */
/* tornava alla PRIMA LETTURA del registro — bastava riaprire l'app.    */
/*                                                                     */
/* E `writeStore` diretto saltava `timbra`, quindi la modifica non aveva */
/* orologio: nessuna versione con cui vincere su una copia più vecchia.  */
/* ================================================================== */
{
  const T7 = 1_700_000_000_000;
  const apri = () => normalizzaRegistro(vuoto(), vuoto);
  const entra = (d, codice, quando) => normalizzaRegistro(timbra(d, {
    ...d,
    groups: [...(d.groups || []), codice],
    gruppiStato: { ...(d.gruppiStato || {}), [codice]: true },
  }, quando), vuoto);

  /* `salva()`: timbra e restituisce, come fa App.jsx */
  const salva = (prima, next, quando) => normalizzaRegistro(timbra(prima, next, quando), vuoto);

  /* le righe di `sync` quando trova dei gruppi sciolti, chiamando le
     funzioni vere invece di ricopiarle */
  const sciogli = (dati, _codici, morti, quando) => {
    const { codici: rimasti, daTogliere } = codiciDopoSync(dati.groups || [], morti);
    return salva(dati, {
      ...dati,
      groups: rimasti,
      gruppiStato: statoDopoSync(dati.gruppiStato, daTogliere),
    }, quando);
  };

  const dueGruppi = entra(entra(apri(), 'AAAAAA', T7), 'BBBBBB', T7);
  eq('sciolto · si parte con due gruppi', dueGruppi.groups.join(','), 'AAAAAA,BBBBBB');

  /* --- 1. il gruppo sciolto sparisce --- */
  const dopo = sciogli(dueGruppi, ['AAAAAA', 'BBBBBB'], ['AAAAAA'], T7 + 100000);
  ok('sciolto · sparisce dall\'app', !dopo.groups.includes('AAAAAA'),
    `gruppi rimasti: ${dopo.groups.join(', ')}`);
  ok('sciolto · l\'altro resta', dopo.groups.includes('BBBBBB'));
  eq('sciolto · ed è registrato come uscita, non solo tolto dalla lista',
    dopo.gruppiStato.AAAAAA, false);
  ok('sciolto · l\'uscita ha un orologio suo',
    Number.isFinite(dopo.orologi['gruppiStato.AAAAAA'])
      && dopo.orologi['gruppiStato.AAAAAA'] === T7 + 100000,
    `orologio: ${dopo.orologi['gruppiStato.AAAAAA']}`);

  /* --- 2. rileggere il registro non lo fa tornare ---
     È il caso che il difetto sbagliava per primo: `normalizzaRegistro`
     rigenera `groups` da `gruppiStato`, quindi bastava riaprire l'app. */
  ok('sciolto · una rilettura del registro non lo riporta',
    !normalizzaRegistro(dopo, vuoto).groups.includes('AAAAAA'));

  /* --- 3. una modifica non collegata, poi un salvataggio --- */
  const conSigaretta = salva(dopo, {
    ...dopo,
    eventi: [...dopo.eventi, { id: 'ev-7', tipo: 'cig', ts: T7 + 150000 }],
  }, T7 + 200000);
  ok('sciolto · un salvataggio non collegato non lo fa ricomparire',
    !conSigaretta.groups.includes('AAAAAA'),
    `gruppi dopo il salvataggio: ${conSigaretta.groups.join(', ')}`);
  eq('sciolto · e la modifica non collegata è passata', conSigaretta.cigs.length, 1);
  eq('sciolto · l\'uscita è ancora registrata', conSigaretta.gruppiStato.AAAAAA, false);

  /* --- 4. fusione con una copia più vecchia che ce l'ha ancora --- */
  const copiaIndietro = dueGruppi;      // il dispositivo rimasto indietro
  const fuso = fondiRegistri(conSigaretta, copiaIndietro, vuoto);
  ok('sciolto · una copia rimasta indietro non lo ripristina',
    !fuso.groups.includes('AAAAAA'),
    `gruppi dopo la fusione: ${fuso.groups.join(', ')}`);
  ok('sciolto · e l\'altro gruppo sopravvive', fuso.groups.includes('BBBBBB'));
  eq('sciolto · nei due versi lo stesso risultato',
    fondiRegistri(copiaIndietro, conSigaretta, vuoto).groups.join(','), fuso.groups.join(','));
  ok('sciolto · anche fondendo tre volte in ordini diversi',
    !fondiRegistri(fondiRegistri(copiaIndietro, fuso, vuoto), dopo, vuoto)
      .groups.includes('AAAAAA'));

  /* --- 5. dati salvati e stato dell'app coerenti ---
     `salva` scrive `datiRef` e lo stato dallo STESSO oggetto timbrato:
     quello che finisce sul dispositivo e quello che l'app mostra devono
     essere la stessa cosa, altrimenti la lista a schermo e la lista
     salvata possono divergere. */
  const rilettoDalDisco = normalizzaRegistro(JSON.parse(JSON.stringify(conSigaretta)), vuoto);
  eq('sciolto · quello che si rilegge dal dispositivo è quello che l\'app mostra',
    rilettoDalDisco.groups.join(','), conSigaretta.groups.join(','));
  eq('sciolto · e lo stato dei gruppi coincide',
    JSON.stringify(rilettoDalDisco.gruppiStato), JSON.stringify(conSigaretta.gruppiStato));

  /* --- 6. l'incerto non si tocca ---
     `smista` distingue «non c'è più» da «non lo so», e solo il primo
     autorizza a togliere. Sul secondo non deve succedere niente. */
  const conIncerto = sciogli(dueGruppi, ['AAAAAA', 'BBBBBB'], [], T7 + 300000);
  eq('sciolto · con nessun gruppo morto la lista non cambia',
    conIncerto.groups.join(','), 'AAAAAA,BBBBBB');
  eq('sciolto · e nessuna uscita viene registrata',
    Object.values(conIncerto.gruppiStato).filter((v) => v === false).length, 0);

  /* --- 7. e si può sempre rientrare, se il gruppo viene ricreato --- */
  const rientrato = entra(fuso, 'AAAAAA', T7 + 400000);
  ok('sciolto · se il gruppo torna a esistere ci si può rientrare',
    rientrato.groups.includes('AAAAAA'));
  ok('sciolto · e il rientro vince sulla copia rimasta indietro',
    fondiRegistri(rientrato, copiaIndietro, vuoto).groups.includes('AAAAAA'));

  /* --- 8. il sorgente resta agganciato --- */
  {
    const app = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const i = app.indexOf('daTogliere.length');
    const corpo = app.slice(i, i + 700);
    ok('sciolto · sync registra le uscite in gruppiStato',
      /gruppiStato:\s*statoDopoSync\(/.test(corpo),
      'sync toglie ancora il gruppo dalla sola lista');
    ok('sciolto · e passa da salva, non da writeStore',
      /salva\(/.test(corpo) && !/writeStore\(/.test(corpo),
      'sync scrive ancora il registro a mano');
  }
}

/* ================================================================== */
/* 8. UN GRUPPO ENTRATO MENTRE LA SINCRONIZZAZIONE ASPETTA LA RETE     */
/*                                                                     */
/* `sync()` cattura la lista all'avvio, poi fa una richiesta di rete    */
/* per ogni gruppo. Se l'utente entra in un gruppo nuovo mentre quelle  */
/* richieste sono in volo, l'esito arrivava e ricostruiva tutto dalla   */
/* lista VECCHIA: il gruppo appena aggiunto spariva dalla lista         */
/* salvata, dalla schermata, dalle classifiche in memoria e dal gruppo  */
/* aperto. Quattro posti, un solo errore.                               */
/*                                                                     */
/* Qui la sincronizzazione è davvero differita: la rete risponde con un */
/* ritardo comandato dal test, e l'ingresso nel gruppo nuovo avviene in */
/* mezzo. Le funzioni chiamate sono quelle vere di `gruppiSync.js`.     */
/* ================================================================== */
{
  const T8 = 1_800_000_000_000;
  const attesa8 = (ms) => new Promise((r) => { setTimeout(r, ms); });

  /* un'app finta ridotta all'osso: registro, schede a schermo,
     classifiche in memoria, gruppo aperto */
  const creaApp8 = () => {
    const app = {
      dati: normalizzaRegistro(vuoto(), vuoto),
      gruppi: [],
      membri: {},
      attivo: null,
    };
    app.salva = (next, quando) => {
      app.dati = normalizzaRegistro(timbra(app.dati, next, quando), vuoto);
      return app.dati;
    };
    // handleConfermaJoin, ridotto a quello che tocca
    app.entra = (codice, quando) => {
      app.salva({
        ...app.dati,
        groups: [...(app.dati.groups || []), codice],
        gruppiStato: { ...(app.dati.gruppiStato || {}), [codice]: true },
      }, quando);
      app.gruppi = [...app.gruppi.filter((g) => g.code !== codice), { code: codice, name: `gruppo ${codice}` }];
      app.membri[codice] = [`membro-di-${codice}`];
      app.attivo = codice;
    };
    /* sync(): cattura la lista, aspetta la rete, poi applica l'esito
       esattamente come fa App.jsx */
    app.sync = async (rete) => {
      const codici = app.dati.groups || [];
      const esiti = {};
      const membriLetti = {};
      for (const code of codici) {
        esiti[code] = await rete(code);
        if (esiti[code].vivo) membriLetti[code] = [`membro-di-${code}`];
      }
      const morti = codici.filter((c) => esiti[c].morto);
      const incerti = codici.filter((c) => esiti[c].incerto);
      const vivi = codici.filter((c) => esiti[c].vivo);

      const attuale = app.dati;
      const listaAdesso = attuale?.groups || codici;
      const { codici: rimasti, daTogliere } = codiciDopoSync(listaAdesso, morti);

      const nuoviGruppi = vivi.map((c) => ({ code: c, name: `gruppo ${c}` }));
      app.gruppi = gruppiDopoSync(app.gruppi, nuoviGruppi, rimasti);
      app.membri = membriDopoSync(app.membri, membriLetti, rimasti);

      if (daTogliere.length && attuale) {
        app.salva({
          ...attuale,
          groups: rimasti,
          gruppiStato: statoDopoSync(attuale.gruppiStato, daTogliere),
        }, T8 + 500000);
      }
      app.attivo = attivoDopoSync(app.attivo, rimasti);
      return { rimasti, daTogliere, incerti };
    };
    return app;
  };

  /* --- IL CASO DELLA SEGNALAZIONE ---
     AAAAAA e BBBBBB; sync lento; si entra in CCCCCC; AAAAAA è sciolto. */
  {
    const app = creaApp8();
    app.entra('AAAAAA', T8);
    app.entra('BBBBBB', T8 + 1000);
    app.attivo = 'AAAAAA';
    eq('gara · si parte con due gruppi', app.dati.groups.join(','), 'AAAAAA,BBBBBB');

    const rete = async (code) => {
      await attesa8(30);                    // la rete è lenta
      return code === 'AAAAAA' ? { morto: true } : { vivo: true };
    };
    const inCorso = app.sync(rete);

    // mentre la rete pensa, l'utente entra in CCCCCC
    await attesa8(10);
    app.entra('CCCCCC', T8 + 200000);
    eq('gara · CCCCCC è entrato durante la sincronizzazione',
      app.dati.groups.join(','), 'AAAAAA,BBBBBB,CCCCCC');

    await inCorso;

    /* 1 · risultato finale */
    eq('gara · la lista finale è BBBBBB, CCCCCC', app.dati.groups.join(','), 'BBBBBB,CCCCCC');
    ok('gara · CCCCCC NON è sparito dalla lista', app.dati.groups.includes('CCCCCC'),
      `lista finale: ${app.dati.groups.join(', ')}`);

    /* 2 · AAAAAA segnato false con un orologio nuovo */
    eq('gara · AAAAAA è segnato come uscito', app.dati.gruppiStato.AAAAAA, false);
    eq('gara · con un orologio nuovo e valido',
      app.dati.orologi['gruppiStato.AAAAAA'], T8 + 500000);

    /* 3 · CCCCCC resta true, con il SUO orologio */
    eq('gara · CCCCCC resta dentro', app.dati.gruppiStato.CCCCCC, true);
    eq('gara · e tiene il suo orologio, non quello della sincronizzazione',
      app.dati.orologi['gruppiStato.CCCCCC'], T8 + 200000);

    /* 3b · e non lo perde una rilettura o una fusione con una copia vecchia */
    ok('gara · una rilettura non lo perde',
      normalizzaRegistro(app.dati, vuoto).groups.includes('CCCCCC'));
    const copiaPrima = normalizzaRegistro({
      ...vuoto(), groups: ['AAAAAA', 'BBBBBB'],
      gruppiStato: { AAAAAA: true, BBBBBB: true },
      orologi: { 'gruppiStato.AAAAAA': T8, 'gruppiStato.BBBBBB': T8 + 1000 },
    }, vuoto);
    const fuso8 = fondiRegistri(app.dati, copiaPrima, vuoto);
    ok('gara · una fusione con una copia indietro non lo perde',
      fuso8.groups.includes('CCCCCC'), `dopo la fusione: ${fuso8.groups.join(', ')}`);
    ok('gara · e non riporta AAAAAA', !fuso8.groups.includes('AAAAAA'));
    eq('gara · nei due versi lo stesso risultato',
      fondiRegistri(copiaPrima, app.dati, vuoto).groups.join(','), fuso8.groups.join(','));

    /* 4 · schermata e classifiche */
    ok('gara · CCCCCC è ancora nella schermata gruppi',
      app.gruppi.some((g) => g.code === 'CCCCCC'),
      `schede a schermo: ${app.gruppi.map((g) => g.code).join(', ')}`);
    ok('gara · e AAAAAA non c\'è più', !app.gruppi.some((g) => g.code === 'AAAAAA'));
    ok('gara · le classifiche di CCCCCC non sono state cancellate',
      Array.isArray(app.membri.CCCCCC), `membri in memoria: ${Object.keys(app.membri).join(', ')}`);
    ok('gara · quelle di BBBBBB sono state aggiornate', Array.isArray(app.membri.BBBBBB));
    ok('gara · e quelle di AAAAAA sono sparite', !app.membri.AAAAAA);
  }

  /* --- 5 · se CCCCCC è il gruppo aperto, resta aperto --- */
  {
    const app = creaApp8();
    app.entra('AAAAAA', T8);
    app.entra('BBBBBB', T8 + 1000);
    const inCorso = app.sync(async (code) => {
      await attesa8(30);
      return code === 'AAAAAA' ? { morto: true } : { vivo: true };
    });
    await attesa8(10);
    app.entra('CCCCCC', T8 + 200000);        // `entra` lo apre, come fa l'app
    eq('gara · CCCCCC è il gruppo aperto', app.attivo, 'CCCCCC');
    await inCorso;
    eq('gara · e resta aperto dopo la sincronizzazione', app.attivo, 'CCCCCC');
  }

  /* --- 6 · la stessa gara senza nessun gruppo morto --- */
  {
    const app = creaApp8();
    app.entra('AAAAAA', T8);
    app.entra('BBBBBB', T8 + 1000);
    const inCorso = app.sync(async () => { await attesa8(30); return { vivo: true }; });
    await attesa8(10);
    app.entra('CCCCCC', T8 + 200000);
    const esito = await inCorso;

    eq('gara · senza morti la lista non perde niente',
      app.dati.groups.join(','), 'AAAAAA,BBBBBB,CCCCCC');
    eq('gara · e non si registra nessuna uscita', esito.daTogliere.length, 0);
    ok('gara · CCCCCC è ancora a schermo', app.gruppi.some((g) => g.code === 'CCCCCC'));
    ok('gara · con le sue classifiche', Array.isArray(app.membri.CCCCCC));
    eq('gara · e resta il gruppo aperto', app.attivo, 'CCCCCC');
  }

  /* --- 7 · l'incerto non si tocca, nemmeno durante una gara --- */
  {
    const app = creaApp8();
    app.entra('AAAAAA', T8);
    app.entra('BBBBBB', T8 + 1000);
    const inCorso = app.sync(async (code) => {
      await attesa8(30);
      if (code === 'AAAAAA') return { incerto: true };
      return { vivo: true };
    });
    await attesa8(10);
    app.entra('CCCCCC', T8 + 200000);
    await inCorso;

    ok('gara · un gruppo incerto resta nella lista', app.dati.groups.includes('AAAAAA'));
    ok('gara · e non viene segnato come uscito', app.dati.gruppiStato.AAAAAA !== false);
    ok('gara · la sua scheda resta a schermo', app.gruppi.some((g) => g.code === 'AAAAAA'));
    ok('gara · e CCCCCC c\'è comunque', app.dati.groups.includes('CCCCCC'));
  }

  /* --- 8 · un morto da cui l'utente è già uscito per conto suo non
             viene tolto due volte né segnato di nuovo --- */
  {
    const app = creaApp8();
    app.entra('AAAAAA', T8);
    app.entra('BBBBBB', T8 + 1000);
    const { codici, daTogliere } = codiciDopoSync(['BBBBBB'], ['AAAAAA']);
    eq('gara · un morto non più in lista non si toglie', daTogliere.length, 0);
    eq('gara · e la lista resta com\'è', codici.join(','), 'BBBBBB');
  }
}

console.log('');
if (falliti.length) {
  falliti.forEach((f) => console.log(`  ✗ ${f}`));
  console.log(`\n  ${passati} controlli superati, ${falliti.length} falliti\n`);
  process.exit(1);
}
console.log(`  ${passati} controlli di affidabilità superati\n  nessun fallimento\n`);
process.exit(0);
