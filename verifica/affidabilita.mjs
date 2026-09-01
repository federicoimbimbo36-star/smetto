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
import { creaCanaleAuth, creaGuardiaRisveglio, CHIAVE_CANALE } from '../src/utils/canaleAuth.js';
import { eseguiLogout, creaUscitaAnnunciata } from '../src/utils/logout.js';
import {
  scriviMarcatore, leggiMarcatore, rimuoviMarcatore, marcatoreRiguarda, sessioneAmmessa,
  CHIAVE_MARCATORE,
} from '../src/utils/marcatoreLogout.js';
import { GoTrueClient } from '@supabase/auth-js';

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
  /* La sessione che se ne va porta ancora alla schermata di accesso, ma
     passando dalla sequenza condivisa: così il reset resta uno solo anche
     quando è la cancellazione locale a farlo scattare. */
  ok('sessione · e se la sessione se ne va torna all\'accesso',
    /if\s*\(!idOra\)\s*\{[\s\S]{0,240}uscitaAnnunciataRef\.current\(\);[\s\S]{0,120}resetAuthState\(\);/.test(app));
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

/* ================================================================== */
/* 9. IL LOGOUT FRA SCHEDE DELLO STESSO BROWSER                        */
/*                                                                     */
/* Due schede, stesso account, stesso browser. Logout nella prima: la  */
/* seconda restava utilizzabile, e dopo un ricaricamento manuale        */
/* restava pure autenticata. Su un computer condiviso è l'account di    */
/* qualcun altro lasciato aperto.                                       */
/*                                                                     */
/* Due cause, e vanno provate tutte e due.                              */
/*                                                                     */
/* La prima: `signOut()` non restituiva niente, e `supabase.auth        */
/* .signOut()` ha un percorso in cui esce con un errore e LASCIA LA     */
/* SESSIONE SCRITTA. L'app diceva «Hai effettuato il logout» comunque.  */
/*                                                                     */
/* La seconda: `auth-js` usa solo `BroadcastChannel` e, se non riesce   */
/* ad aprirlo, lo scrive in console e basta — di ascoltatori            */
/* dell'evento `storage` in quella libreria non ce n'è nessuno.         */
/* ================================================================== */
{
  /* --- un browser finto: due schede, un BroadcastChannel, un localStorage --- */
  const creaBrowser = ({ conBroadcast = true, conStorage = true } = {}) => {
    const canali = new Map();          // nome → elenco di istanze
    const memoria = new Map();
    const schede = [];

    class FintoCanale {
      constructor(nome) {
        this.nome = nome;
        this.chiuso = false;
        this.onmessage = null;
        if (!canali.has(nome)) canali.set(nome, []);
        canali.get(nome).push(this);
      }

      postMessage(dato) {
        if (this.chiuso) throw new Error('canale chiuso');
        canali.get(this.nome).forEach((c) => {
          if (c !== this && !c.chiuso) c.onmessage?.({ data: dato });
        });
      }

      close() { this.chiuso = true; }
    }

    const browser = {
      schede,
      apriScheda(nome) {
        const ascoltatori = [];
        const ambiente = {
          addEventListener: conStorage
            ? (t, fn) => { if (t === 'storage') ascoltatori.push(fn); }
            : undefined,
          removeEventListener: conStorage
            ? (t, fn) => {
              const i = ascoltatori.indexOf(fn); if (i >= 0) ascoltatori.splice(i, 1);
            }
            : undefined,
          localStorage: {
            setItem(chiave, valore) {
              const prima = memoria.get(chiave) ?? null;
              memoria.set(chiave, valore);
              if (prima === valore) return;      // niente evento se non cambia
              schede.forEach((s) => {
                if (s.nome === nome) return;     // `storage` non arriva a chi scrive
                s.ascoltatori.slice().forEach((fn) => fn({ key: chiave, newValue: valore }));
              });
            },
            getItem: (k) => memoria.get(k) ?? null,
          },
        };
        if (conBroadcast) ambiente.BroadcastChannel = FintoCanale;
        const scheda = { nome, ascoltatori, resetati: 0, ambiente };
        scheda.canale = creaCanaleAuth({
          ambiente,
          onLogout: () => { scheda.resetati += 1; },
        });
        schede.push(scheda);
        return scheda;
      },
    };
    return browser;
  };

  /* --- 1. logout nella scheda A → la scheda B viene resettata --- */
  {
    const browser = creaBrowser();
    const a = browser.apriScheda('A');
    const b = browser.apriScheda('B');

    a.canale.annunciaLogout();

    eq('logout · la scheda B viene resettata', b.resetati, 1);
    eq('logout · e la scheda A non resetta se stessa', a.resetati, 0);
  }

  /* --- 2. con tre schede si resettano tutte quelle rimaste --- */
  {
    const browser = creaBrowser();
    const a = browser.apriScheda('A');
    const b = browser.apriScheda('B');
    const c = browser.apriScheda('C');
    a.canale.annunciaLogout();
    eq('logout · anche la terza scheda si resetta', b.resetati + c.resetati, 2);
    eq('logout · una sola volta ciascuna', `${b.resetati}${c.resetati}`, '11');
  }

  /* --- 3. NIENTE BroadcastChannel: deve funzionare lo stesso ---
     È il caso di Safari in navigazione privata, quello che lasciava la
     seconda scheda dentro. `auth-js` qui si ferma; il canale dell'app no. */
  {
    const browser = creaBrowser({ conBroadcast: false });
    const a = browser.apriScheda('A');
    const b = browser.apriScheda('B');

    a.canale.annunciaLogout();

    eq('logout · senza BroadcastChannel passa dall\'evento storage', b.resetati, 1);
    eq('logout · e chi annuncia non si risveglia da solo', a.resetati, 0);
    ok('logout · il messaggio è finito in localStorage',
      Boolean(a.ambiente.localStorage.getItem(CHIAVE_CANALE)));
  }

  /* --- 4. tutte e due le strade aperte: UN SOLO reset ---
     Il messaggio arriva dal canale e dall'evento storage. Resettare due
     volte non romperebbe niente, ma è il genere di doppione che poi si
     incastra con un caricamento in corso. */
  {
    const browser = creaBrowser({ conBroadcast: true, conStorage: true });
    const a = browser.apriScheda('A');
    const b = browser.apriScheda('B');
    a.canale.annunciaLogout();
    eq('logout · con entrambe le strade il reset è uno solo', b.resetati, 1);
  }

  /* --- 5. due logout di fila arrivano tutti e due ---
     Riscrivere in localStorage lo STESSO valore non fa scattare l'evento:
     senza un contatore che cambia, il secondo logout non sarebbe partito. */
  {
    const browser = creaBrowser({ conBroadcast: false });
    const a = browser.apriScheda('A');
    const b = browser.apriScheda('B');
    a.canale.annunciaLogout();
    a.canale.annunciaLogout();
    eq('logout · due annunci di fila arrivano tutti e due', b.resetati, 2);
  }

  /* --- 6. una scheda chiusa non riceve più niente --- */
  {
    const browser = creaBrowser();
    const a = browser.apriScheda('A');
    const b = browser.apriScheda('B');
    b.canale.chiudi();
    a.canale.annunciaLogout();
    eq('logout · una scheda chiusa non viene più toccata', b.resetati, 0);
  }

  /* --- 7. messaggi estranei non fanno niente --- */
  {
    const browser = creaBrowser({ conBroadcast: false });
    const a = browser.apriScheda('A');
    const b = browser.apriScheda('B');
    a.ambiente.localStorage.setItem('smetto:kv:qualcosa', '{"tipo":"logout"}');
    eq('logout · un\'altra chiave non resetta niente', b.resetati, 0);
    a.ambiente.localStorage.setItem(CHIAVE_CANALE, 'non è json');
    eq('logout · un messaggio illeggibile non resetta niente', b.resetati, 0);
    a.ambiente.localStorage.setItem(CHIAVE_CANALE, '{"tipo":"altro","da":"x","quando":1,"n":1}');
    eq('logout · un messaggio di altro tipo non resetta niente', b.resetati, 0);
  }

  /* ================================================================ */
  /* LA SEQUENZA DI USCITA: e se Supabase dice di no?                  */
  /* ================================================================ */

  const creaSchermoLogout = () => ({
    resetati: 0, annunci: 0, notificheSpente: 0, toast: null, errore: null,
  });
  const opzioni = (schermo, signOut) => ({
    signOut,
    spegniNotifiche: async () => { schermo.notificheSpente += 1; },
    reset: () => { schermo.resetati += 1; },
    annuncia: () => { schermo.annunci += 1; },
    riuscito: () => { schermo.toast = 'Hai effettuato il logout.'; },
    fallito: () => { schermo.errore = 'Non è stato possibile uscire. Controlla la rete e riprova.'; },
  });

  /* --- 8. uscita riuscita --- */
  {
    const schermo = creaSchermoLogout();
    eq('uscita · riuscita', await eseguiLogout(opzioni(schermo, async () => ({}))), 'uscito');
    eq('uscita · lo stato viene resettato', schermo.resetati, 1);
    eq('uscita · le notifiche di sistema si spengono', schermo.notificheSpente, 1);
    eq('uscita · le altre schede vengono avvisate', schermo.annunci, 1);
    eq('uscita · e il messaggio arriva', schermo.toast, 'Hai effettuato il logout.');
    eq('uscita · senza nessun errore', schermo.errore, null);
  }

  /* --- 9. SUPABASE RESTITUISCE UN ERRORE ---
     È il caso che lasciava la sessione scritta sul dispositivo e l'utente
     convinto di essere uscito. */
  {
    const schermo = creaSchermoLogout();
    const esito = await eseguiLogout(opzioni(schermo, async () => ({ error: 'rete assente' })));

    eq('errore · la sequenza si dichiara fallita', esito, 'errore');
    eq('errore · NESSUN messaggio di logout riuscito', schermo.toast, null);
    eq('errore · e lo stato NON viene resettato', schermo.resetati, 0);
    eq('errore · le altre schede non vengono avvisate', schermo.annunci, 0);
    ok('errore · l\'utente viene avvisato che non è uscito', Boolean(schermo.errore));
  }

  /* --- 10. e se signOut lancia un'eccezione, invece di restituire l'errore --- */
  {
    const schermo = creaSchermoLogout();
    const esito = await eseguiLogout(opzioni(schermo, async () => {
      throw new Error('connessione interrotta');
    }));
    eq('errore · un\'eccezione vale come un errore', esito, 'errore');
    eq('errore · e nemmeno lì si dice che è andata bene', schermo.toast, null);
    eq('errore · niente reset', schermo.resetati, 0);
  }

  /* --- 11. le notifiche che non si spengono non bloccano l'uscita ---
     Uscire deve riuscire anche se il telefono non lascia toccare le
     notifiche: il contrario vorrebbe dire non poter uscire. */
  {
    const schermo = creaSchermoLogout();
    const opz = opzioni(schermo, async () => ({}));
    opz.spegniNotifiche = async () => { throw new Error('permesso negato'); };
    eq('uscita · un guasto alle notifiche non impedisce di uscire',
      await eseguiLogout(opz), 'uscito');
    eq('uscita · lo stato viene resettato lo stesso', schermo.resetati, 1);
  }

  /* --- 12. l'annuncio arriva DOPO il reset locale ---
     Se partisse prima, le altre schede comincerebbero a pulirsi mentre
     questa è ancora piena. */
  {
    const ordine = [];
    await eseguiLogout({
      signOut: async () => ({}),
      spegniNotifiche: async () => ordine.push('notifiche'),
      reset: () => ordine.push('reset'),
      annuncia: () => ordine.push('annuncio'),
      riuscito: () => ordine.push('messaggio'),
      fallito: () => ordine.push('errore'),
    });
    eq('uscita · l\'ordine è notifiche, reset, annuncio, messaggio',
      ordine.join(' → '), 'notifiche → reset → annuncio → messaggio');
  }

  /* --- 13. il sorgente resta agganciato --- */
  {
    const app = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    ok('uscita · App.jsx passa da eseguiLogout', /eseguiLogout\(\{/.test(app));
    ok('uscita · e non chiama più signOut per conto suo',
      !/await auth\.signOut\(\);/.test(app));
    ok('uscita · il canale fra schede è agganciato', /creaCanaleAuth\(\{/.test(app));
    ok('uscita · chi riceve il logout passa dalla sequenza che pulisce la sessione',
      /creaUscitaAnnunciata\(\{/.test(app) && /onLogout:[\s\S]{0,80}ricevi\(\)/.test(app));
    ok('uscita · e la sequenza cancella la sessione LOCALE, non quella globale',
      /signOutLocale:[\s\S]{0,120}auth\.signOutLocale\(\)/.test(app));
    ok('uscita · la guardia al risveglio è agganciata', /creaGuardiaRisveglio\(\{/.test(app));
    ok('uscita · e non resta nessun reset diretto sull\'annuncio',
      !/onLogout:[\s\S]{0,120}resetAuthState\(\)/.test(app));
    ok('uscita · e il canale viene chiuso allo smontaggio', /canaleRef\.current\?\.chiudi\(\)/.test(app));
    ok('uscita · e anche la guardia', /guardiaRef\.current\?\.chiudi\(\)/.test(app));

    const sa = readFileSync(resolve(process.cwd(), 'src/auth/supabaseAuth.js'), 'utf8');
    ok('uscita · supabaseAuth restituisce l\'errore', /return error \?/.test(sa));
    ok('uscita · supabaseAuth sa uscire solo da questo dispositivo',
      /signOut\(\{ scope: 'local' \}\)/.test(sa));
    ok('uscita · e sa dire CHI c\'è, senza leggere il profilo',
      /async idSessione\(\)/.test(sa));

    const la = readFileSync(resolve(process.cwd(), 'src/auth/localAuth.js'), 'utf8');
    ok('uscita · anche il backend locale ha la stessa interfaccia',
      /async signOutLocale\(\)/.test(la) && /async idSessione\(\)/.test(la));
  }
}

/* ================================================================== */
/* 10. LA SCHEDA B SU IPHONE: PERCHÉ CONTINUAVA A FUNZIONARE           */
/*                                                                     */
/* Provato in Safari su iPhone, due schede normali, stesso account,     */
/* stesso dominio: logout nella scheda A, e la scheda B continuava a    */
/* funzionare. La correzione precedente non bastava, per due motivi     */
/* distinti che vanno provati separatamente.                            */
/*                                                                     */
/* PRIMO — l'annuncio non arriva. Safari su iOS congela le schede di    */
/* sfondo: una pagina congelata non riceve né i messaggi di             */
/* `BroadcastChannel` né gli eventi `storage`, e al risveglio non le    */
/* vengono riconsegnati. Il canale non era rotto: non veniva            */
/* raggiunto.                                                           */
/*                                                                     */
/* SECONDO — e `auth-js` al risveglio tace. `_recoverAndRefresh()`      */
/* rilegge la sessione da localStorage; quando non c'è più (l'ha tolta  */
/* l'altra scheda) fa `return` senza passare da `_removeSession()`,     */
/* che è l'unico posto da cui esce `SIGNED_OUT`. Quindi `onAuthChange`  */
/* resta muto e niente resetta l'interfaccia.                           */
/*                                                                     */
/* La prova qui sotto NON usa un finto Supabase: monta due `GoTrueClient` */
/* veri di `@supabase/auth-js` sullo stesso localStorage — che è come   */
/* stanno due schede dello stesso browser — e mostra il silenzio con    */
/* codice in esecuzione. Poi verifica che la correzione lo copra, e     */
/* soprattutto che RIAPRENDO la scheda B la sessione non ci sia più.    */
/* ================================================================== */
{
  /* --- un localStorage solo per due schede, come nel browser vero --- */
  const creaStorageCondiviso = () => {
    const memoria = new Map();
    return {
      memoria,
      adattatore: {
        getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
        setItem: (k, v) => { memoria.set(k, v); },
        removeItem: (k) => { memoria.delete(k); },
      },
    };
  };

  const CHIAVE_SESSIONE = 'sb-prova-auth-token';
  const seiOreDopo = Math.floor(Date.now() / 1000) + 3600;
  const sessioneFinta = {
    access_token: 'token-di-prova',
    refresh_token: 'rinnovo-di-prova',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: seiOreDopo,
    user: {
      id: 'utente-1', aud: 'authenticated', app_metadata: {}, user_metadata: {},
      created_at: '2026-01-01T00:00:00Z',
    },
  };

  /* Nessuna rete: il logout di `auth-js` chiama `/logout` sul server, e
     qui risponde questo. Serve a provare la sequenza, non Supabase. */
  const senzaRete = async () => new Response('{}', {
    status: 200, headers: { 'content-type': 'application/json' },
  });

  /* Aprire una scheda: `senzaCanale` è la scheda di sfondo di iOS, quella
     che il messaggio non lo riceve. Si toglie `BroadcastChannel` solo per
     il momento della costruzione, che è quando `auth-js` lo aggancia. */
  const apriScheda = (adattatore, { senzaCanale = false } = {}) => {
    const vero = globalThis.BroadcastChannel;
    if (senzaCanale) delete globalThis.BroadcastChannel;
    let client;
    try {
      client = new GoTrueClient({
        url: 'http://localhost/auth/v1',
        storageKey: CHIAVE_SESSIONE,
        storage: adattatore,
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        fetch: senzaRete,
      });
    } finally {
      if (senzaCanale) globalThis.BroadcastChannel = vero;
    }
    const eventi = [];
    client.onAuthStateChange((e) => eventi.push(e));
    return { client, eventi };
  };

  /* Lo strato `auth` dell'app, sopra un client vero: le stesse due
     funzioni che App.jsx chiama in produzione. */
  const authSopra = (client) => ({
    signOutLocale: async () => {
      const { error } = await client.signOut({ scope: 'local' });
      return error ? { error: error.message } : {};
    },
    sessioneValida: async () => {
      const { data } = await client.getSession();
      return Boolean(data?.session?.user);
    },
  });

  const respira = () => new Promise((r) => setTimeout(r, 30));

  /* ---------------------------------------------------------------- */
  /* --- 1. IL DIFETTO, riprodotto: B non riceve nessun SIGNED_OUT --- */
  /* ---------------------------------------------------------------- */
  {
    const { memoria, adattatore } = creaStorageCondiviso();
    memoria.set(CHIAVE_SESSIONE, JSON.stringify(sessioneFinta));

    const A = apriScheda(adattatore);
    const B = apriScheda(adattatore, { senzaCanale: true });   // scheda sospesa
    await A.client.initialize();
    await B.client.initialize();
    /* `INITIAL_SESSION` arriva da solo poco dopo l'aggancio: si aspetta e
       si azzera, così quello che resta è solo ciò che riguarda il logout. */
    await respira();
    B.eventi.length = 0;

    await A.client.signOut();
    await respira();

    eq('iphone · dopo il logout di A la chiave non è più in localStorage',
      memoria.get(CHIAVE_SESSIONE) ?? null, null);
    ok('iphone · e alla scheda sospesa non arriva NIENTE dal canale',
      !B.eventi.includes('SIGNED_OUT'));

    /* L'utente torna sulla scheda B: è quello che fa `auth-js` da solo. */
    await B.client._recoverAndRefresh();
    ok('iphone · CAUSA · nemmeno al risveglio auth-js emette SIGNED_OUT',
      !B.eventi.includes('SIGNED_OUT'));
    ok('iphone · CAUSA · quindi onAuthChange resta muto e niente resetta',
      B.eventi.length === 0);
  }

  /* ---------------------------------------------------------------- */
  /* --- 2. LA CORREZIONE: la guardia al risveglio pulisce la B ------ */
  /* ---------------------------------------------------------------- */
  {
    const { memoria, adattatore } = creaStorageCondiviso();
    memoria.set(CHIAVE_SESSIONE, JSON.stringify(sessioneFinta));

    const A = apriScheda(adattatore);
    const B = apriScheda(adattatore, { senzaCanale: true });
    await A.client.initialize();
    await B.client.initialize();

    const schermo = { dentro: true, reset: 0 };
    const authB = authSopra(B.client);
    const ricevi = creaUscitaAnnunciata({
      signOutLocale: authB.signOutLocale,
      reset: () => { schermo.reset += 1; schermo.dentro = false; },
      dentro: () => schermo.dentro,
    });
    const guardia = creaGuardiaRisveglio({
      ambiente: {}, documento: null,
      dentro: () => schermo.dentro,
      sessioneValida: authB.sessioneValida,
      suSessioneNonValida: ricevi,
    });

    /* finché la sessione c'è, il risveglio non deve buttare fuori nessuno */
    eq('iphone · con la sessione ancora buona il risveglio non tocca niente',
      await guardia.controlla(), 'sessione presente');
    eq('iphone · e nessun reset', schermo.reset, 0);

    await A.client.signOut();
    await respira();

    eq('iphone · al risveglio dopo il logout la guardia ripulisce',
      await guardia.controlla(), 'ripulita');
    eq('iphone · con UN solo reset dell\'interfaccia', schermo.reset, 1);

    /* --- 3. LA PROVA CHE MANCAVA: si RIAPRE la scheda B --- */
    const riaperta = apriScheda(adattatore);
    await riaperta.client.initialize();
    const { data } = await riaperta.client.getSession();
    eq('iphone · RIAPRENDO la scheda B, getSession() è null', data.session, null);
    eq('iphone · e in localStorage non è rimasto niente',
      memoria.get(CHIAVE_SESSIONE) ?? null, null);

    /* un secondo risveglio non deve rifare niente */
    eq('iphone · il risveglio successivo trova già tutto fatto',
      await guardia.controlla(), 'già fuori');
    eq('iphone · e non resetta una seconda volta', schermo.reset, 1);
    guardia.chiudi();
  }

  /* ---------------------------------------------------------------- */
  /* --- 4. L'ANNUNCIO CHE ARRIVA: B cancella la sessione E resetta -- */
  /*                                                                  */
  /* Il caso delle due schede sveglie. Prima qui si eseguiva solo      */
  /* `resetAuthState()`: la sessione della scheda B non veniva toccata */
  /* e il suo client restava convinto di essere dentro.                */
  /* ---------------------------------------------------------------- */
  {
    const { memoria, adattatore } = creaStorageCondiviso();
    memoria.set(CHIAVE_SESSIONE, JSON.stringify(sessioneFinta));

    const B = apriScheda(adattatore, { senzaCanale: true });
    await B.client.initialize();

    const ordine = [];
    const schermo = { dentro: true };
    const authB = authSopra(B.client);
    const ricevi = creaUscitaAnnunciata({
      signOutLocale: async () => { ordine.push('sessione'); return authB.signOutLocale(); },
      reset: () => { ordine.push('reset'); schermo.dentro = false; },
      dentro: () => schermo.dentro,
    });

    eq('annuncio · la scheda B esce', await ricevi(), 'uscito');
    eq('annuncio · prima la sessione, poi l\'interfaccia', ordine.join(' → '), 'sessione → reset');
    eq('annuncio · e la sessione locale non c\'è più', await authB.sessioneValida(), false);

    const riaperta = apriScheda(adattatore);
    await riaperta.client.initialize();
    eq('annuncio · riaprendo la scheda B, getSession() è null',
      (await riaperta.client.getSession()).data.session, null);
  }

  /* ---------------------------------------------------------------- */
  /* --- 5. IL CANALE, con la sequenza vera attaccata ----------------- */
  /*                                                                  */
  /* Le prove della sezione 9 contavano un reset finto. Queste contano */
  /* la sessione: `ricevi` è la stessa funzione che monta App.jsx.     */
  /* ---------------------------------------------------------------- */
  {
    const creaBrowser = ({ conBroadcast = true } = {}) => {
      const canali = new Map();
      const memoria = new Map();
      const schede = [];

      class FintoCanale {
        constructor(nome) {
          this.nome = nome; this.chiuso = false; this.onmessage = null;
          if (!canali.has(nome)) canali.set(nome, []);
          canali.get(nome).push(this);
        }

        postMessage(dato) {
          canali.get(this.nome).forEach((c) => {
            if (c !== this && !c.chiuso) c.onmessage?.({ data: dato });
          });
        }

        close() { this.chiuso = true; }
      }

      return {
        apriScheda(nome, { sessionePulibile = true } = {}) {
          const ascoltatori = [];
          const ambiente = {
            addEventListener: (t, fn) => { if (t === 'storage') ascoltatori.push(fn); },
            removeEventListener: (t, fn) => {
              const i = ascoltatori.indexOf(fn); if (i >= 0) ascoltatori.splice(i, 1);
            },
            localStorage: {
              setItem(chiave, valore) {
                const prima = memoria.get(chiave) ?? null;
                memoria.set(chiave, valore);
                if (prima === valore) return;
                schede.forEach((s) => {
                  if (s.nome === nome) return;
                  s.ascoltatori.slice().forEach((fn) => fn({ key: chiave, newValue: valore }));
                });
              },
              getItem: (k) => memoria.get(k) ?? null,
            },
          };
          if (conBroadcast) ambiente.BroadcastChannel = FintoCanale;

          const scheda = {
            nome, ascoltatori, ambiente, dentro: true,
            reset: 0, sessioniCancellate: 0, annunci: 0,
          };
          scheda.ricevi = creaUscitaAnnunciata({
            signOutLocale: async () => {
              scheda.sessioniCancellate += 1;
              return sessionePulibile ? {} : { error: 'storage negato' };
            },
            reset: () => { scheda.reset += 1; scheda.dentro = false; },
            dentro: () => scheda.dentro,
          });
          scheda.canale = creaCanaleAuth({
            ambiente,
            onLogout: () => { scheda.annunci += 1; scheda.ricevi(); },
          });
          schede.push(scheda);
          return scheda;
        },
      };
    };

    /* --- logout da A: B cancella la sessione E l'interfaccia --- */
    {
      const browser = creaBrowser();
      const a = browser.apriScheda('A');
      const b = browser.apriScheda('B');
      a.canale.annunciaLogout();
      await respira();
      eq('canale · B cancella la propria sessione locale', b.sessioniCancellate, 1);
      eq('canale · e resetta l\'interfaccia', b.reset, 1);
      eq('canale · la scheda A non tocca la propria sessione', a.sessioniCancellate, 0);
      eq('canale · né si resetta da sola', a.reset, 0);
    }

    /* --- senza BroadcastChannel: dall'evento storage, uguale --- */
    {
      const browser = creaBrowser({ conBroadcast: false });
      const a = browser.apriScheda('A');
      const b = browser.apriScheda('B');
      a.canale.annunciaLogout();
      await respira();
      eq('ripiego · senza BroadcastChannel la sessione di B viene cancellata lo stesso',
        b.sessioniCancellate, 1);
      eq('ripiego · e l\'interfaccia resettata', b.reset, 1);
      eq('ripiego · chi annuncia non si risveglia da solo', a.reset, 0);
    }

    /* --- B NON riannuncia: nessun anello --- */
    {
      const browser = creaBrowser();
      const a = browser.apriScheda('A');
      const b = browser.apriScheda('B');
      const c = browser.apriScheda('C');
      a.canale.annunciaLogout();
      await respira();
      eq('anello · B non riannuncia niente', b.annunci, 1);
      eq('anello · e C ha ricevuto un solo annuncio, non due', c.annunci, 1);
      eq('anello · un reset a testa', `${b.reset}${c.reset}`, '11');
    }

    /* --- doppio segnale, un reset solo --- */
    {
      const browser = creaBrowser();
      const a = browser.apriScheda('A');
      const b = browser.apriScheda('B');
      a.canale.annunciaLogout();
      a.canale.annunciaLogout();          // due annunci DIVERSI, tutti e due consegnati
      await respira();
      eq('doppione · due segnali arrivano davvero', b.annunci, 2);
      eq('doppione · ma la sessione si cancella una volta sola', b.sessioniCancellate, 1);
      eq('doppione · e il reset è uno solo', b.reset, 1);
    }

    /* --- due segnali nello STESSO istante, mentre il primo è in volo --- */
    {
      let sblocca;
      const attesa = new Promise((r) => { sblocca = r; });
      const schermo = { dentro: true, reset: 0, cancellazioni: 0 };
      const ricevi = creaUscitaAnnunciata({
        signOutLocale: async () => { schermo.cancellazioni += 1; await attesa; return {}; },
        reset: () => { schermo.reset += 1; schermo.dentro = false; },
        dentro: () => schermo.dentro,
      });
      const primo = ricevi();
      const secondo = ricevi();          // arriva mentre il primo non ha finito
      sblocca();
      await Promise.all([primo, secondo]);
      eq('in volo · una sola cancellazione', schermo.cancellazioni, 1);
      eq('in volo · un solo reset', schermo.reset, 1);
    }

    /* --- la cancellazione locale fallisce: si resetta lo stesso --- */
    {
      const browser = creaBrowser();
      const a = browser.apriScheda('A');
      const b = browser.apriScheda('B', { sessionePulibile: false });
      a.canale.annunciaLogout();
      await respira();
      eq('guasto · l\'interfaccia viene ripulita anche se la sessione non si cancella',
        b.reset, 1);
    }
    {
      const schermo = { dentro: true, reset: 0 };
      const ricevi = creaUscitaAnnunciata({
        signOutLocale: async () => { throw new Error('storage negato'); },
        reset: () => { schermo.reset += 1; schermo.dentro = false; },
        dentro: () => schermo.dentro,
      });
      eq('guasto · e l\'esito lo dice invece di nasconderlo',
        await ricevi(), 'uscito-con-sessione-sporca');
      eq('guasto · con il reset comunque eseguito', schermo.reset, 1);
    }
  }

  /* ---------------------------------------------------------------- */
  /* --- 6. LOGOUT FALLITO IN A: nessun falso messaggio, B resta ------ */
  /* ---------------------------------------------------------------- */
  {
    const schermoA = { toast: null, errore: null, reset: 0, annunci: 0 };
    const schermoB = { reset: 0, cancellazioni: 0 };
    const riceviB = creaUscitaAnnunciata({
      signOutLocale: async () => { schermoB.cancellazioni += 1; return {}; },
      reset: () => { schermoB.reset += 1; },
      dentro: () => true,
    });

    const esito = await eseguiLogout({
      signOut: async () => ({ error: 'rete assente' }),
      spegniNotifiche: async () => {},
      reset: () => { schermoA.reset += 1; },
      annuncia: () => { schermoA.annunci += 1; riceviB(); },
      riuscito: () => { schermoA.toast = 'Hai effettuato il logout.'; },
      fallito: () => { schermoA.errore = 'Non è stato possibile uscire. Controlla la rete e riprova.'; },
    });
    await respira();

    eq('fallito · la sequenza si dichiara fallita', esito, 'errore');
    eq('fallito · NESSUN «Hai effettuato il logout»', schermoA.toast, null);
    ok('fallito · l\'utente viene avvisato', Boolean(schermoA.errore));
    eq('fallito · la scheda A resta dentro', schermoA.reset, 0);
    eq('fallito · nessun annuncio parte', schermoA.annunci, 0);
    eq('fallito · quindi la scheda B non cancella niente', schermoB.cancellazioni, 0);
    eq('fallito · e non si resetta', schermoB.reset, 0);
  }

  /* ---------------------------------------------------------------- */
  /* --- 7. LA GUARDIA NON È UN INTERRUTTORE GENERALE ----------------- */
  /*                                                                  */
  /* Sbagliare qui vorrebbe dire buttare fuori chi è legittimamente    */
  /* dentro. Tre casi in cui NON deve succedere niente.                */
  /* ---------------------------------------------------------------- */
  {
    /* la sessione c'è: non si tocca */
    {
      let ripuliture = 0;
      const g = creaGuardiaRisveglio({
        ambiente: {}, documento: null,
        dentro: () => true,
        sessioneValida: async () => true,
        suSessioneNonValida: () => { ripuliture += 1; },
      });
      eq('guardia · con la sessione presente non fa niente', await g.controlla(), 'sessione presente');
      eq('guardia · e nessuna ripulitura', ripuliture, 0);
    }

    /* il controllo non riesce (storage negato, promessa rifiutata):
       nel dubbio si resta dentro, non si butta fuori nessuno */
    {
      let ripuliture = 0;
      const g = creaGuardiaRisveglio({
        ambiente: {}, documento: null,
        dentro: () => true,
        sessioneValida: async () => { throw new Error('storage negato'); },
        suSessioneNonValida: () => { ripuliture += 1; },
      });
      eq('guardia · se il controllo fallisce non butta fuori nessuno',
        await g.controlla(), 'incerto');
      eq('guardia · nessuna ripulitura', ripuliture, 0);
    }

    /* già fuori: non c'è niente da difendere */
    {
      let letture = 0;
      const g = creaGuardiaRisveglio({
        ambiente: {}, documento: null,
        dentro: () => false,
        sessioneValida: async () => { letture += 1; return false; },
        suSessioneNonValida: () => {},
      });
      eq('guardia · a schermata di accesso non controlla nemmeno',
        await g.controlla(), 'già fuori');
      eq('guardia · nessuna lettura della sessione', letture, 0);
    }

    /* dopo `chiudi()` non fa più niente, anche se l'evento arriva tardi */
    {
      let ripuliture = 0;
      const g = creaGuardiaRisveglio({
        ambiente: {}, documento: null,
        dentro: () => true,
        sessioneValida: async () => false,
        suSessioneNonValida: () => { ripuliture += 1; },
      });
      g.chiudi();
      eq('guardia · una scheda smontata non viene più toccata', await g.controlla(), 'spento');
      eq('guardia · nessuna ripulitura dopo lo smontaggio', ripuliture, 0);
    }
  }

  /* ---------------------------------------------------------------- */
  /* --- 8. GLI EVENTI DEL BROWSER sono agganciati e sganciati -------- */
  /* ---------------------------------------------------------------- */
  {
    const agganciati = { finestra: [], documento: [] };
    const ambiente = {
      addEventListener: (t) => agganciati.finestra.push(t),
      removeEventListener: (t) => {
        const i = agganciati.finestra.indexOf(t); if (i >= 0) agganciati.finestra.splice(i, 1);
      },
    };
    const documento = {
      visibilityState: 'visible',
      ascoltatori: {},
      addEventListener(t, fn) { this.ascoltatori[t] = fn; agganciati.documento.push(t); },
      removeEventListener(t) {
        delete this.ascoltatori[t];
        const i = agganciati.documento.indexOf(t); if (i >= 0) agganciati.documento.splice(i, 1);
      },
    };

    let ripuliture = 0;
    const g = creaGuardiaRisveglio({
      ambiente,
      documento,
      dentro: () => true,
      sessioneValida: async () => false,
      suSessioneNonValida: () => { ripuliture += 1; },
    });

    ok('eventi · pageshow è agganciato (ritorno da bfcache su Safari)',
      agganciati.finestra.includes('pageshow'));
    ok('eventi · visibilitychange è agganciato',
      agganciati.documento.includes('visibilitychange'));

    /* la scheda passa in sfondo: non deve succedere niente */
    documento.visibilityState = 'hidden';
    documento.ascoltatori.visibilitychange();
    await respira();
    eq('eventi · andare in sfondo non ripulisce niente', ripuliture, 0);

    /* e torna in primo piano: qui sì */
    documento.visibilityState = 'visible';
    documento.ascoltatori.visibilitychange();
    await respira();
    eq('eventi · tornare in primo piano fa scattare il controllo', ripuliture, 1);

    g.chiudi();
    eq('eventi · dopo chiudi() la finestra è pulita', agganciati.finestra.length, 0);
    eq('eventi · e anche il documento', agganciati.documento.length, 0);
  }
}

/* ================================================================== */
/* 11. LO SCOPE DEL LOGOUT                                             */
/*                                                                     */
/* Il rapporto diceva «l'altro telefono resta dentro» e il codice       */
/* faceva il contrario: il pulsante «Esci» chiamava                     */
/* `supabase.auth.signOut()` senza argomenti, e senza argomenti vale    */
/* `{ scope: 'global' }` — revoca i refresh token dell'utente OVUNQUE.  */
/* Solo la scheda che RICEVEVA l'annuncio usava `local`. Risultato:     */
/* uscire da Safari sull'iPhone buttava fuori anche il computer, al     */
/* primo rinnovo del token.                                             */
/*                                                                     */
/* Qui non si controlla il sorgente con un'espressione regolare: si     */
/* guarda la RICHIESTA che parte, e si guarda un secondo dispositivo    */
/* che prova a rinnovare il token dopo il logout del primo.             */
/* ================================================================== */
{
  const ORA = () => Math.floor(Date.now() / 1000);
  const utente = {
    id: 'utente-1', aud: 'authenticated', app_metadata: {}, user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  };
  const sessione = (n) => ({
    access_token: `access-${n}`,
    refresh_token: `refresh-${n}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: ORA() + 3600,
    user: utente,
  });

  /* Un Supabase finto quel tanto che basta: tiene i refresh token vivi
     dell'utente e sa cosa vuol dire `scope`. È la parte che decide se
     l'altro dispositivo resta dentro, quindi va rappresentata. */
  const creaServer = () => {
    const vivi = new Map();          // refresh_token → access_token
    let seq = 0;
    const richieste = [];

    const risposta = (corpo, stato = 200) => new Response(JSON.stringify(corpo), {
      status: stato, headers: { 'content-type': 'application/json' },
    });

    return {
      richieste,
      vivi,
      registra(sess) { vivi.set(sess.refresh_token, sess.access_token); },
      fetch: async (url, opzioni = {}) => {
        const u = new URL(String(url));
        const scope = u.searchParams.get('scope');
        const autorizzazione = (opzioni.headers?.Authorization
          || opzioni.headers?.authorization || '').replace('Bearer ', '');
        richieste.push({ percorso: u.pathname, scope, jwt: autorizzazione });

        if (u.pathname.endsWith('/logout')) {
          if (scope === 'global') {
            vivi.clear();                                   // via tutti, ovunque
          } else if (scope === 'local') {
            for (const [rt, at] of vivi) if (at === autorizzazione) vivi.delete(rt);
          }
          return new Response(null, { status: 204 });
        }

        if (u.pathname.endsWith('/token')) {
          const corpo = JSON.parse(opzioni.body || '{}');
          if (!vivi.has(corpo.refresh_token)) {
            return risposta({ error: 'invalid_grant', error_description: 'refresh token revocato' }, 400);
          }
          vivi.delete(corpo.refresh_token);
          seq += 1;
          const nuova = sessione(`rinnovo-${seq}`);
          vivi.set(nuova.refresh_token, nuova.access_token);
          return risposta(nuova);
        }

        return risposta({});
      },
    };
  };

  /* Un dispositivo = un localStorage tutto suo. Le SCHEDE dello stesso
     browser invece condividono lo stesso, ed è tutta la differenza. */
  const creaDispositivo = (server, nome, n) => {
    const memoria = new Map();
    const sess = sessione(n);
    server.registra(sess);
    memoria.set(`sb-${nome}-auth-token`, JSON.stringify(sess));
    const adattatore = {
      getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
      setItem: (k, v) => { memoria.set(k, v); },
      removeItem: (k) => { memoria.delete(k); },
    };
    return {
      memoria,
      sess,
      apriScheda() {
        return new GoTrueClient({
          url: 'http://localhost/auth/v1',
          storageKey: `sb-${nome}-auth-token`,
          storage: adattatore,
          persistSession: true,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          fetch: server.fetch,
        });
      },
    };
  };

  /* --- 1. IL DIFETTO: senza scope la richiesta parte globale --- */
  {
    const server = creaServer();
    const telefono = creaDispositivo(server, 'difetto', 1);
    const client = telefono.apriScheda();
    await client.initialize();
    await client.signOut();                     // com'era: nessun argomento
    const logout = server.richieste.find((r) => r.percorso.endsWith('/logout'));
    eq('scope · CAUSA · signOut() senza argomenti parte con scope=global',
      logout?.scope, 'global');
  }

  /* --- 2. LA CORREZIONE: il pulsante «Esci» parte con scope=local --- */
  {
    const server = creaServer();
    const telefono = creaDispositivo(server, 'corretto', 2);
    const client = telefono.apriScheda();
    await client.initialize();
    await client.signOut({ scope: 'local' });
    const logout = server.richieste.find((r) => r.percorso.endsWith('/logout'));
    eq('scope · il logout iniziale parte con scope=local', logout?.scope, 'local');
    ok('scope · e nessuna richiesta di questo flusso è globale',
      server.richieste.every((r) => r.scope !== 'global'));
    eq('scope · la sessione di questo dispositivo è cancellata',
      telefono.memoria.get('sb-corretto-auth-token') ?? null, null);
  }

  /* --- 3. IL SECONDO DISPOSITIVO RESTA DENTRO ---
     Non basta guardarlo subito dopo: il momento in cui prima veniva
     buttato fuori era il RINNOVO del token, che arriva più tardi. */
  {
    const server = creaServer();
    const iphone = creaDispositivo(server, 'iphone', 10);
    const computer = creaDispositivo(server, 'computer', 20);
    const suIphone = iphone.apriScheda();
    const suComputer = computer.apriScheda();
    await suIphone.initialize();
    await suComputer.initialize();

    await suIphone.signOut({ scope: 'local' });

    eq('due dispositivi · l\'iPhone è uscito',
      iphone.memoria.get('sb-iphone-auth-token') ?? null, null);
    ok('due dispositivi · il computer ha ancora la sua sessione scritta',
      Boolean(computer.memoria.get('sb-computer-auth-token')));

    const { data, error } = await suComputer.refreshSession();
    ok('due dispositivi · e il RINNOVO del token gli riesce', !error, String(error?.message));
    ok('due dispositivi · quindi resta autenticato', Boolean(data?.session?.user));

    /* il refresh token dell'iPhone invece è stato revocato davvero: uscire
       non deve lasciarsi dietro una credenziale ancora buona */
    ok('due dispositivi · il refresh token dell\'iPhone non vale più',
      !server.vivi.has(iphone.sess.refresh_token));
  }

  /* --- 4. E CON `global` il computer sarebbe caduto ---
     È la prova che il test sopra non passerebbe comunque: se lo scope
     tornasse globale, questo controllo se ne accorgerebbe. */
  {
    const server = creaServer();
    const iphone = creaDispositivo(server, 'iphone2', 30);
    const computer = creaDispositivo(server, 'computer2', 40);
    const suIphone = iphone.apriScheda();
    const suComputer = computer.apriScheda();
    await suIphone.initialize();
    await suComputer.initialize();

    await suIphone.signOut();                   // globale, come prima
    const { error } = await suComputer.refreshSession();
    ok('due dispositivi · CAUSA · con scope globale il computer viene buttato fuori al rinnovo',
      Boolean(error));
  }

  /* --- 5. ANCHE LA SCHEDA CHE RICEVE esce solo da qui --- */
  {
    const server = creaServer();
    /* due schede dello stesso browser: UN localStorage per tutte e due */
    const browser = creaDispositivo(server, 'safari', 50);
    const schedaA = browser.apriScheda();
    const schedaB = browser.apriScheda();
    await schedaA.initialize();
    await schedaB.initialize();

    await schedaA.signOut({ scope: 'local' });          // il pulsante
    await schedaB.signOut({ scope: 'local' });          // l'annuncio ricevuto

    const scopi = server.richieste.filter((r) => r.percorso.endsWith('/logout')).map((r) => r.scope);
    ok('scope · nessuno dei due logout è globale', scopi.every((s) => s === 'local'));
    eq('scope · la sessione condivisa non c\'è più',
      browser.memoria.get('sb-safari-auth-token') ?? null, null);
  }

  /* --- 6. NEL SORGENTE non deve restare nessun signOut senza scope ---
     È l'eccezione dimenticata in un angolo che rimette in piedi il
     comportamento globale senza che nessuno la colleghi al logout. */
  {
    const sa = readFileSync(resolve(process.cwd(), 'src/auth/supabaseAuth.js'), 'utf8');
    const senzaCommenti = sa
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    const chiamate = [...senzaCommenti.matchAll(/supabase\.auth\.signOut\(([^)]*)\)/g)]
      .map((m) => m[1].trim());
    eq('sorgente · una sola chiamata a supabase.auth.signOut in tutto il file',
      chiamate.length, 1);
    eq('sorgente · e ha lo scope scritto esplicitamente',
      chiamate[0], "{ scope: 'local' }");
    ok('sorgente · nessun signOut() senza argomenti',
      !chiamate.some((c) => c === ''));
    ok('sorgente · e nessuno scope globale da nessuna parte',
      !/scope:\s*'global'/.test(senzaCommenti));
    ok('sorgente · il pulsante «Esci» passa dalla funzione unica',
      /async signOut\(\)\s*\{\s*return escoSoloDaQui\(/.test(sa));
    ok('sorgente · e anche la scheda che riceve l\'annuncio',
      /async signOutLocale\(\)\s*\{\s*return escoSoloDaQui\(/.test(sa));
  }
}

/* ================================================================== */
/* 12. IL MARCATORE DI LOGOUT                                          */
/*                                                                     */
/* Provato di nuovo sull'iPhone, e falliva ancora: logout nella scheda  */
/* A, la scheda B restava dentro, e RICARICANDOLA restava dentro lo     */
/* stesso.                                                             */
/*                                                                     */
/* Tre tentativi non erano bastati, e il terzo è quello che spiega      */
/* perché. `BroadcastChannel` e l'evento `storage` non arrivano a una   */
/* scheda che iOS ha congelato: già saputo. Ma il controllo al          */
/* risveglio, che doveva coprirli, chiedeva «c'è una sessione?» — e     */
/* dava per scontato che dopo il logout di A la scheda B non ne         */
/* trovasse più. Sull'iPhone la trova: una scheda ripristinata dal      */
/* congelamento riparte con la sessione che il suo client teneva in     */
/* memoria, e può riscriverla nello storage.                            */
/*                                                                     */
/* L'errore era dedurre uno stato dall'ASSENZA di qualcosa. Adesso il   */
/* fatto si scrive: un marcatore in `localStorage`, in una chiave tutta */
/* sua, che `auth-js` non tocca e che il ricaricamento non porta via.   */
/*                                                                     */
/* Le prove qui sotto ricostruiscono lo scenario del telefono passo per */
/* passo, compreso il pezzo che prima nessun test rappresentava: la     */
/* sessione di B che, dopo il logout di A, È ANCORA LEGGIBILE.          */
/* ================================================================== */
{
  const CHIAVE_SESSIONE = 'sb-marcatore-auth-token';
  const utenteA = 'utente-A';
  const utenteB = 'utente-B';

  /* un browser con un solo localStorage, come Safari con due schede */
  const creaBrowser = () => {
    const memoria = new Map();
    return {
      memoria,
      ambiente: {
        localStorage: {
          getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
          setItem: (k, v) => { memoria.set(k, v); },
          removeItem: (k) => { memoria.delete(k); },
        },
      },
    };
  };

  const sessioneDi = (uid) => ({ user: { id: uid } });

  /* --- 1. lo scenario del telefono, per intero --- */
  {
    const browser = creaBrowser();
    const { ambiente, memoria } = browser;

    /* due schede, stesso account, sessione condivisa e leggibile */
    memoria.set(CHIAVE_SESSIONE, JSON.stringify(sessioneDi(utenteA)));

    /* la scheda A esce. Nessun evento viene consegnato a B: è sospesa. */
    const marcatore = scriviMarcatore(utenteA, { ambiente });
    memoria.delete(CHIAVE_SESSIONE);

    ok('marcatore · il logout lascia un fatto scritto', Boolean(marcatore));
    eq('marcatore · con il tipo', marcatore.tipo, 'logout');
    eq('marcatore · con l\'utente', marcatore.userId, utenteA);
    ok('marcatore · con il momento', typeof marcatore.quando === 'number');
    ok('marcatore · e con un identificativo unico', Boolean(marcatore.id));
    ok('marcatore · sta in una chiave sua, separata dalla sessione',
      CHIAVE_MARCATORE !== CHIAVE_SESSIONE && Boolean(memoria.get(CHIAVE_MARCATORE)));

    /* IL PEZZO CHE MANCAVA: Safari ripristina la scheda B, e il suo
       client riscrive la sessione che aveva in memoria. Da qui in poi
       `getSession()` di B risponde di sì. */
    memoria.set(CHIAVE_SESSIONE, JSON.stringify(sessioneDi(utenteA)));

    const letta = JSON.parse(memoria.get(CHIAVE_SESSIONE));
    ok('marcatore · CASO REALE · dopo il logout la sessione di B è ancora leggibile',
      Boolean(letta?.user?.id));

    /* B viene RICARICATA: è l'avvio dell'app, non un evento */
    eq('marcatore · ma all\'avvio la sessione non viene ammessa',
      sessioneAmmessa(letta, { ambiente }), null);

    /* e al risveglio, stessa risposta: la funzione è la stessa */
    const id = letta.user.id;
    ok('marcatore · e al risveglio la sessione non risulta valida',
      !(Boolean(id) && !marcatoreRiguarda(leggiMarcatore({ ambiente }), id)));
  }

  /* --- 1-bis. LO STESSO, con un client Supabase VERO ---
     Non un oggetto finto: un `GoTrueClient` di `@supabase/auth-js` che
     legge davvero la sessione. È il caso provato sul telefono — la
     scheda B ricaricata trova una sessione buona — e serve che a
     rifiutarla sia la logica dell'app, non l'assenza del dato. */
  {
    const memoria = new Map();
    const adattatore = {
      getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
      setItem: (k, v) => { memoria.set(k, v); },
      removeItem: (k) => { memoria.delete(k); },
    };
    const ambiente = {
      localStorage: {
        getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
        setItem: (k, v) => { memoria.set(k, v); },
        removeItem: (k) => { memoria.delete(k); },
      },
    };
    const CHIAVE = 'sb-vero-auth-token';
    const vera = {
      access_token: 'access-vero',
      refresh_token: 'refresh-vero',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: utenteA, aud: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    };
    const senzaRete = async () => new Response('{}', {
      status: 200, headers: { 'content-type': 'application/json' },
    });
    const apri = () => new GoTrueClient({
      url: 'http://localhost/auth/v1',
      storageKey: CHIAVE,
      storage: adattatore,
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      fetch: senzaRete,
    });

    memoria.set(CHIAVE, JSON.stringify(vera));

    /* la scheda A esce; nessun evento raggiunge B */
    const schedaA = apri();
    await schedaA.initialize();
    await schedaA.signOut({ scope: 'local' });
    scriviMarcatore(utenteA, { ambiente });

    /* Safari ripristina B e il suo client riscrive quello che aveva in
       memoria: da qui in poi la sessione È di nuovo nello storage */
    memoria.set(CHIAVE, JSON.stringify(vera));

    /* B viene RICARICATA: client nuovo, storage vero */
    const schedaBRicaricata = apri();
    await schedaBRicaricata.initialize();
    const { data } = await schedaBRicaricata.getSession();

    ok('marcatore · CASO REALE · getSession() della scheda B ricaricata risponde ancora',
      Boolean(data.session?.user?.id));
    eq('marcatore · ed è proprio l\'utente uscito', data.session?.user?.id, utenteA);
    eq('marcatore · eppure l\'app NON la ammette',
      sessioneAmmessa({ user: { id: data.session?.user?.id } }, { ambiente }), null);

    /* e dopo un accesso riuscito la stessa sessione torna buona */
    rimuoviMarcatore({ ambiente });
    const dopoAccesso = { user: { id: utenteA } };
    eq('marcatore · dopo un nuovo accesso la stessa sessione è ammessa',
      sessioneAmmessa(dopoAccesso, { ambiente }), dopoAccesso);
  }

  /* --- 2. senza marcatore la sessione passa: non è un blocco a caso --- */
  {
    const browser = creaBrowser();
    const sess = sessioneDi(utenteA);
    eq('marcatore · senza marcatore si entra normalmente',
      sessioneAmmessa(sess, { ambiente: browser.ambiente }), sess);
  }

  /* --- 3. NON deve buttare fuori un ALTRO account ---
     Esco io dal telefono di casa; chi entra dopo con il suo account non
     c'entra niente con il mio logout. Un marcatore senza nome sarebbe
     stato un interruttore generale. */
  {
    const browser = creaBrowser();
    scriviMarcatore(utenteA, { ambiente: browser.ambiente });
    const suaSessione = sessioneDi(utenteB);
    eq('marcatore · un altro utente non viene toccato',
      sessioneAmmessa(suaSessione, { ambiente: browser.ambiente }), suaSessione);
    eq('marcatore · e il mio resta fuori',
      sessioneAmmessa(sessioneDi(utenteA), { ambiente: browser.ambiente }), null);
  }

  /* --- 4. si cancella SOLO con un accesso riuscito --- */
  {
    const browser = creaBrowser();
    const { ambiente } = browser;
    scriviMarcatore(utenteA, { ambiente });

    /* leggerlo non lo consuma: al secondo risveglio deve valere ancora */
    sessioneAmmessa(sessioneDi(utenteA), { ambiente });
    sessioneAmmessa(sessioneDi(utenteA), { ambiente });
    ok('marcatore · leggerlo non lo consuma', Boolean(leggiMarcatore({ ambiente })));
    eq('marcatore · e continua a valere al risveglio successivo',
      sessioneAmmessa(sessioneDi(utenteA), { ambiente }), null);

    /* accesso riuscito: adesso sì */
    rimuoviMarcatore({ ambiente });
    eq('marcatore · dopo un accesso riuscito non c\'è più',
      leggiMarcatore({ ambiente }), null);
    const rientro = sessioneDi(utenteA);
    eq('marcatore · e lo stesso utente può rientrare',
      sessioneAmmessa(rientro, { ambiente }), rientro);
  }

  /* --- 5. due logout di fila sono due marcatori diversi ---
     Riscrivere lo STESSO valore in localStorage non fa scattare l'evento
     `storage` nelle altre schede: senza un identificativo che cambia, il
     secondo logout sarebbe muto. */
  {
    const browser = creaBrowser();
    const uno = scriviMarcatore(utenteA, { ambiente: browser.ambiente });
    const due = scriviMarcatore(utenteA, { ambiente: browser.ambiente });
    ok('marcatore · due logout di fila hanno identificativi diversi', uno.id !== due.id);
  }

  /* --- 6. roba rotta o mancante non blocca nessuno ---
     Sbagliare da questa parte vuol dire non far entrare la gente. */
  {
    const browser = creaBrowser();
    const { ambiente, memoria } = browser;
    const sess = sessioneDi(utenteA);

    memoria.set(CHIAVE_MARCATORE, 'non è json');
    eq('marcatore · un marcatore illeggibile vale come assente',
      sessioneAmmessa(sess, { ambiente }), sess);

    memoria.set(CHIAVE_MARCATORE, '{"tipo":"altro","userId":"utente-A"}');
    eq('marcatore · un marcatore di altro tipo non blocca', sessioneAmmessa(sess, { ambiente }), sess);

    memoria.set(CHIAVE_MARCATORE, '{"tipo":"logout"}');
    eq('marcatore · un marcatore senza utente non blocca', sessioneAmmessa(sess, { ambiente }), sess);

    eq('marcatore · e senza sessione non c\'è niente da ammettere',
      sessioneAmmessa(null, { ambiente }), null);
  }

  /* --- 7. storage negato: non si blocca l'app ---
     Safari in navigazione privata può rifiutare la scrittura. */
  {
    const negato = {
      localStorage: {
        getItem() { throw new Error('negato'); },
        setItem() { throw new Error('negato'); },
        removeItem() { throw new Error('negato'); },
      },
    };
    eq('marcatore · se non si può scrivere lo dice invece di fingere',
      scriviMarcatore(utenteA, { ambiente: negato }), null);
    eq('marcatore · e se non si può leggere non blocca nessuno',
      leggiMarcatore({ ambiente: negato }), null);
    const sess = sessioneDi(utenteA);
    eq('marcatore · la sessione passa lo stesso',
      sessioneAmmessa(sess, { ambiente: negato }), sess);
  }

  /* --- 8. LA SEQUENZA DI USCITA scrive il marcatore, e solo se è uscita --- */
  {
    const passi = [];
    await eseguiLogout({
      signOut: async () => ({}),
      spegniNotifiche: async () => passi.push('notifiche'),
      marca: () => passi.push('marcatore'),
      reset: () => passi.push('reset'),
      annuncia: () => passi.push('annuncio'),
      riuscito: () => passi.push('messaggio'),
    });
    eq('uscita · il marcatore si scrive prima del reset e dell\'annuncio',
      passi.join(' → '), 'notifiche → marcatore → reset → annuncio → messaggio');
  }
  {
    const passi = [];
    await eseguiLogout({
      signOut: async () => ({ error: 'rete assente' }),
      marca: () => passi.push('marcatore'),
      reset: () => passi.push('reset'),
      fallito: () => passi.push('errore'),
    });
    eq('uscita · un logout fallito NON scrive il marcatore', passi.join(' → '), 'errore');
  }
  {
    /* lo storage può rifiutare: non deve impedire di uscire */
    const passi = [];
    const esito = await eseguiLogout({
      signOut: async () => ({}),
      marca: () => { throw new Error('storage negato'); },
      reset: () => passi.push('reset'),
      riuscito: () => passi.push('messaggio'),
    });
    eq('uscita · un marcatore non scrivibile non impedisce di uscire', esito, 'uscito');
    eq('uscita · e il reset avviene lo stesso', passi.join(' → '), 'reset → messaggio');
  }

  /* --- 9. IL SECONDO DISPOSITIVO ha un localStorage suo --- */
  {
    const iphone = creaBrowser();
    const computer = creaBrowser();
    scriviMarcatore(utenteA, { ambiente: iphone.ambiente });

    eq('due dispositivi · sull\'iPhone il marcatore c\'è',
      leggiMarcatore({ ambiente: iphone.ambiente })?.userId, utenteA);
    eq('due dispositivi · sul computer non c\'è',
      leggiMarcatore({ ambiente: computer.ambiente }), null);

    const suaSessione = sessioneDi(utenteA);
    eq('due dispositivi · e il computer resta autenticato',
      sessioneAmmessa(suaSessione, { ambiente: computer.ambiente }), suaSessione);
  }

  /* --- 10. IL SORGENTE: letto all'avvio, al risveglio, scritto e tolto --- */
  {
    const app = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8');
    const pulito = app.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

    ok('sorgente · all\'avvio la sessione passa dal marcatore',
      /leggiSessione:\s*async\s*\(\)\s*=>\s*sessioneAmmessa\(await auth\.getSession\(\)\)/.test(pulito));
    ok('sorgente · al risveglio si guarda il marcatore, non solo la sessione',
      /sessioneValida:[\s\S]{0,240}marcatoreRiguarda\(leggiMarcatore\(\), id\)/.test(pulito));
    ok('sorgente · il logout scrive il marcatore con l\'utente uscente',
      /marca:\s*\(\)\s*=>\s*scriviMarcatore\(uscente\)/.test(pulito));
    ok('sorgente · l\'utente si prende PRIMA del reset',
      /const uscente = userRef\.current \|\| user\.id;[\s\S]{0,400}await eseguiLogout\(/.test(pulito));
    ok('sorgente · e il marcatore si toglie solo dopo un accesso riuscito',
      /if \(res\.error\)[\s\S]*?rimuoviMarcatore\(\);/.test(pulito));
    ok('sorgente · prima di rileggere la sessione del nuovo accesso',
      pulito.indexOf('rimuoviMarcatore();') < pulito.indexOf('const atteso = res.user.id;'));
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
