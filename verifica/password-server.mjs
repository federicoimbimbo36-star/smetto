#!/usr/bin/env node
/* ------------------------------------------------------------------ *
 * password-server.mjs — prove REALI delle regole password lato server *
 *                                                                     *
 * Va lanciato DA TE, dalla tua macchina: dal sandbox in cui è stato    *
 * scritto l'API del progetto non è raggiungibile (host_not_allowed).   *
 *                                                                     *
 *   node verifica/password-server.mjs prepara    # PRIMA di cambiare  *
 *   node verifica/password-server.mjs verifica   # DOPO aver cambiato *
 *   node verifica/password-server.mjs pulisci    # cancella le prove  *
 *                                                                     *
 * L'ORDINE NON È UN DETTAGLIO: l'account "legacy" con password corta  *
 * si può creare solo finché il minimo è ancora 6. Se alzi il minimo   *
 * prima di lanciare `prepara`, la prova 3 non è più eseguibile.       *
 *                                                                     *
 * Usa solo numeri di telefono inesistenti (+39 000 000 000x) e chiavi *
 * pubbliche. La service_role non serve e non va messa qui.            *
 * ------------------------------------------------------------------ */

import {
  existsSync, readFileSync, writeFileSync, unlinkSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const URL_BASE = process.env.VITE_SUPABASE_URL
  ?? 'https://mzsiqlhovliginqazwrx.supabase.co';
const CHIAVE = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  ?? 'sb_publishable_rq6ZNqXRTef18qCjDAhOBw_PoaP703l';

/* Stessa trasformazione del client: il numero diventa un'email tecnica.
   Esportata perché il banco di prova possa indirizzare gli stessi account
   senza riscriversi la regola — e riscriversela vorrebbe dire provare la
   propria copia invece di questa. */
export const emailDa = (tel) => `u${String(tel).replace(/[^0-9]/g, '')}@smetto.app`;

const TEL_LEGACY = '+390000000001';   // account con password corta, preesistente
const TEL_CORTA  = '+390000000002';   // tentativo di registrazione a 11 caratteri
const TEL_PWNED  = '+390000000003';   // tentativo con password compromessa

const PW_LEGACY = 'vecchia8';         // 8 caratteri: nella fascia 6–11
const PW_11     = 'undicicar11';      // 11 caratteri esatti
const PW_PWNED  = 'passwordpassword'; // 16 caratteri: lunga ma notoriamente violata

/* ================================================================== */
/* LO STATO CONDIVISO FRA LE TRE FASI                                  */
/*                                                                     */
/* Il difetto che questo blocco esiste per chiudere.                   */
/*                                                                     */
/* La password casuale della prova 4b nasceva a ogni avvio, sulla riga */
/* `const PW_NUOVA = 'Qz7' + Math.random()…`. Sembra innocuo: è dentro */
/* un solo processo. Ma le tre fasi sono TRE PROCESSI DIVERSI, e la    */
/* prova 4b CAMBIA la password dell'account legacy usando quel valore. */
/* Al `pulisci` successivo ne nasceva un altro, diverso, e a quel      */
/* punto nessuna password conosciuta apriva più quella sessione: la    */
/* password vera era stata scritta sul server e persa in memoria       */
/* quando il processo di `verifica` è terminato.                       */
/*                                                                     */
/* Risultato: l'account di prova restava in Authentication → Users per */
/* sempre, e non c'era più modo di toglierlo da qui — solo a mano dal  */
/* pannello, sapendo che c'è.                                          */
/*                                                                     */
/* La cura è un file su disco, generato da `prepara` e letto dalle     */
/* altre due fasi. Con due regole che contano più del file stesso:     */
/*                                                                     */
/*  1. SI SCRIVE PRIMA DI AGIRE. La password nuova finisce nel file    */
/*     PRIMA della PUT che la imposta, non dopo. Se il processo muore  */
/*     a metà — rete che cade, Ctrl-C — sul server può esserci già la  */
/*     nuova password: scrivendo dopo, quel caso ricrea esattamente il */
/*     difetto che stiamo togliendo.                                   */
/*  2. NON SI SOSTITUISCE, SI ACCUMULA. `passwordDaProvare` è un       */
/*     elenco, non un valore: la più recente per prima, le vecchie     */
/*     dietro. `pulisci` le prova in ordine, quindi funziona sia se il */
/*     cambio è andato a buon fine sia se non è mai partito.           */
/*                                                                     */
/* Nel file NON ci sono chiavi: né `apikey`, né publishable, né        */
/* service_role, né token di sessione. Solo numeri finti e le password */
/* usa-e-getta che questo script ha creato lui stesso. È comunque      */
/* ignorato da Git (`.gitignore`) e scritto con permessi 0600.         */
/* ================================================================== */

const QUI = dirname(fileURLToPath(import.meta.url));
export const PERCORSO_STATO = join(QUI, '.stato-prove-password.json');

export const VERSIONE_STATO = 1;

/* Lunga, casuale e con maiuscole, cifre e simboli: deve passare il minimo
   a 12 e anche un eventuale `required_characters`, altrimenti la prova 4b
   fallirebbe per il motivo sbagliato. Da `randomBytes` e non da
   `Math.random()`: qui l'imprevedibilità crittografica non serve, ma non
   costa niente e toglie di mezzo la domanda. */
export function generaPasswordForte() {
  return `Qz7${randomBytes(15).toString('base64url').replace(/[-_]/g, 'x')}Lm!4`;
}

export function nuovoStato(progetto) {
  return {
    versione: VERSIONE_STATO,
    creato: new Date().toISOString(),
    progetto,
    /* La password verso cui la prova 4b farà cambiare l'account legacy.
       Generata QUI, una volta sola, e non più a ogni processo. */
    passwordNuova: generaPasswordForte(),
    account: {
      legacy: {
        telefono: TEL_LEGACY,
        descrizione: 'account storico con password corta (prove 3 e 4)',
        passwordDaProvare: [PW_LEGACY],
        esiste: null,
      },
      corta: {
        telefono: TEL_CORTA,
        descrizione: 'registrazione a 11 caratteri, attesa in rifiuto (prova 1)',
        passwordDaProvare: [PW_11],
        esiste: null,
      },
      pwned: {
        telefono: TEL_PWNED,
        descrizione: 'registrazione con password compromessa (prova 2b)',
        passwordDaProvare: [PW_PWNED],
        esiste: null,
      },
    },
  };
}

export function salvaStato(stato, percorso = PERCORSO_STATO) {
  writeFileSync(percorso, `${JSON.stringify(stato, null, 2)}\n`, { mode: 0o600 });
  return stato;
}

/* `null` solo quando il file non c'è. Un file illeggibile invece è un
   errore rumoroso di proposito: trattarlo come «niente da pulire» direbbe
   «fatto» lasciando gli account vivi sul progetto. */
export function leggiStato(percorso = PERCORSO_STATO) {
  if (!existsSync(percorso)) return null;
  let grezzo;
  try {
    grezzo = JSON.parse(readFileSync(percorso, 'utf8'));
  } catch (e) {
    throw new Error(`Il file di stato ${percorso} non è leggibile (${e.message}). `
      + 'Controlla a mano in Authentication → Users prima di cancellarlo.');
  }
  if (grezzo?.versione !== VERSIONE_STATO || !grezzo.account) {
    throw new Error(`Il file di stato ${percorso} ha un formato che non riconosco. `
      + 'Controlla a mano in Authentication → Users prima di cancellarlo.');
  }
  return grezzo;
}

export function rimuoviStato(percorso = PERCORSO_STATO) {
  if (existsSync(percorso)) unlinkSync(percorso);
}

/* La più recente davanti: `pulisci` prova in quest'ordine, quindi dopo un
   cambio riuscito entra al primo colpo e dopo un cambio fallito entra al
   secondo. I doppioni non si accumulano. */
export function aggiungiPassword(stato, id, password) {
  const conto = stato.account[id];
  if (!conto) throw new Error(`Account di prova sconosciuto: ${id}`);
  conto.passwordDaProvare = [password, ...conto.passwordDaProvare.filter((p) => p !== password)];
  return stato;
}

export function segnaEsistenza(stato, id, esiste) {
  const conto = stato.account[id];
  if (!conto) throw new Error(`Account di prova sconosciuto: ${id}`);
  conto.esiste = esiste;
  return stato;
}

/* ------------------------------------------------------------------ */
/* Il cuore della pulizia, senza rete                                  */
/*                                                                     */
/* `accedi` e `cancella` arrivano da fuori così che questa funzione si  */
/* possa provare per davvero in locale — è quello che fa               */
/* `verifica/password-server-stato.mjs` — invece di scoprire solo sul   */
/* progetto vero se cancella quello che dice di cancellare.             */
/* ------------------------------------------------------------------ */
export async function eseguiPulizia(stato, { accedi, cancella }) {
  const righe = [];

  for (const [id, conto] of Object.entries(stato.account)) {
    /* Sappiamo che non è mai stato creato (registrazione rifiutata):
       non c'è niente da cancellare, e non è un fallimento. */
    if (conto.esiste === false) {
      righe.push({ id, telefono: conto.telefono, riuscito: true, nota: 'mai creato, niente da cancellare' });
      continue;
    }

    let token = null;
    let posizione = -1;
    for (let i = 0; i < conto.passwordDaProvare.length; i += 1) {
      const t = await accedi(conto.telefono, conto.passwordDaProvare[i]);
      if (t) { token = t; posizione = i; break; }
    }

    if (!token) {
      /* Nessuna password apre una sessione. Se sapevamo che l'account
         esiste è un fallimento vero e il file va tenuto; se non l'avevamo
         mai creato è semplicemente un'assenza. */
      const riuscito = conto.esiste !== true;
      righe.push({
        id,
        telefono: conto.telefono,
        riuscito,
        nota: riuscito
          ? 'nessuna traccia sul server'
          : `esiste, ma nessuna delle ${conto.passwordDaProvare.length} password conosciute apre una sessione`,
      });
      continue;
    }

    const cancellato = await cancella(token);
    righe.push({
      id,
      telefono: conto.telefono,
      riuscito: cancellato,
      nota: cancellato
        ? `cancellato (${posizione === 0 ? 'password più recente' : 'password precedente'})`
        : 'sessione aperta ma delete_me non è riuscita',
    });
  }

  return { righe, tutteRiuscite: righe.every((r) => r.riuscito) };
}

/* ================================================================== */
/* Rete                                                                */
/* ================================================================== */

const intestazioni = (token) => ({
  'Content-Type': 'application/json',
  apikey: CHIAVE,
  Authorization: `Bearer ${token || CHIAVE}`,
});

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

async function chiama(percorso, opzioni = {}, token) {
  const risposta = await fetch(`${URL_BASE}${percorso}`, {
    ...opzioni,
    headers: intestazioni(token),
  });
  const testo = await risposta.text();
  let corpo;
  try { corpo = testo ? JSON.parse(testo) : {}; } catch { corpo = { grezzo: testo }; }
  return { stato: risposta.status, corpo };
}

const registra = (tel, password) => chiama('/auth/v1/signup', {
  method: 'POST',
  body: JSON.stringify({
    email: emailDa(tel),
    password,
    data: { phone: tel, display_name: `Prova ${tel.slice(-4)}`, avatar_color: '#E24A17' },
  }),
});

const entra = (tel, password) => chiama('/auth/v1/token?grant_type=password', {
  method: 'POST',
  body: JSON.stringify({ email: emailDa(tel), password }),
});

const cambiaPassword = (token, password) => chiama('/auth/v1/user', {
  method: 'PUT',
  body: JSON.stringify({ password }),
}, token);

/* HaveIBeenPwned, k-anonymity: mandiamo solo i primi 5 caratteri dell'hash,
   mai la password. Serve a DIMOSTRARE la premessa della prova 2 invece di
   darla per buona: se il conteggio è 0, la prova non varrebbe niente. */
async function quanteVolteViolata(password) {
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefisso = hash.slice(0, 5);
  const suffisso = hash.slice(5);
  const risposta = await fetch(`https://api.pwnedpasswords.com/range/${prefisso}`, {
    headers: { 'Add-Padding': 'true', 'User-Agent': 'smetto-verifica-password' },
  });
  if (!risposta.ok) return null; // rete non disponibile: la prova resta non conclusiva
  const righe = (await risposta.text()).split('\n');
  for (const riga of righe) {
    const [coda, conteggio] = riga.trim().split(':');
    if (coda === suffisso) return Number(conteggio);
  }
  return 0;
}

/* ------------------------------------------------------------------ */
/* Rapporto                                                            */
/* ------------------------------------------------------------------ */
const esiti = [];
function annota(passo, atteso, ottenuto, ok) {
  esiti.push({ passo, atteso, ottenuto, ok });
  console.log(`${ok ? '  OK  ' : ' FALLITA '} ${passo}`);
  console.log(`        atteso:   ${atteso}`);
  console.log(`        ottenuto: ${ottenuto}\n`);
}

function stampaRapporto() {
  const passate = esiti.filter((e) => e.ok).length;
  console.log('─'.repeat(64));
  console.log(`RAPPORTO: ${passate} prove su ${esiti.length}`);
  console.log('─'.repeat(64));
  for (const e of esiti) console.log(`${e.ok ? '✓' : '✗'} ${e.passo} → ${e.ottenuto}`);
  return passate === esiti.length;
}

/* Le fasi 2 e 3 non possono inventarsi le credenziali: se il file non c'è,
   le password degli account di prova non esistono da nessun'altra parte. */
function statoObbligatorio(fase) {
  const stato = leggiStato();
  if (!stato) {
    console.log(`\nNessun file di stato: «${fase}» non ha le credenziali degli account di prova.`);
    console.log('Lancia prima «prepara» — e ricordati che va lanciato MENTRE il minimo è ancora 6.\n');
    process.exit(1);
  }
  if (stato.progetto !== URL_BASE) {
    console.log(`\nIl file di stato è stato creato per ${stato.progetto},`);
    console.log(`ma adesso stai puntando a ${URL_BASE}.`);
    console.log('Mi fermo: gli account di prova sono sull\'altro progetto.\n');
    process.exit(1);
  }
  return stato;
}

/* ------------------------------------------------------------------ */
/* Fase 1 — PRIMA di alzare il minimo                                  */
/* ------------------------------------------------------------------ */
async function prepara() {
  console.log(`\nProgetto: ${URL_BASE}`);
  console.log('Fase «prepara»: creo l\'account con password corta.');
  console.log('Da lanciare MENTRE il minimo è ancora 6.\n');

  /* Se un file c'è già lo si TIENE. Rigenerarlo butterebbe via le password
     di account che potrebbero essere ancora vivi sul progetto — cioè
     rifarebbe, da un'altra porta, il difetto che questo file esiste per
     chiudere. */
  const precedente = leggiStato();
  if (precedente) {
    console.log(`Riuso il file di stato del ${new Date(precedente.creato).toLocaleString('it-IT')}.`);
    console.log('Se vuoi ripartire pulito: lancia «pulisci», poi «prepara».\n');
  }
  const stato = precedente ?? salvaStato(nuovoStato(URL_BASE));
  if (!precedente) console.log(`Stato scritto in ${PERCORSO_STATO}\n`);

  const r = await registra(TEL_LEGACY, PW_LEGACY);

  if (r.stato === 200 && r.corpo.access_token) {
    salvaStato(segnaEsistenza(stato, 'legacy', true));
    console.log(`Account creato: ${emailDa(TEL_LEGACY)} con password di ${PW_LEGACY.length} caratteri.`);
    console.log('Ora alza il minimo a 12 nel pannello, poi lancia «verifica».\n');
    return;
  }
  if (r.stato === 200 && !r.corpo.access_token) {
    salvaStato(segnaEsistenza(stato, 'legacy', true));
    console.log('Account creato ma SENZA sessione: «Confirm email» è ancora attivo.');
    console.log('Va spento (Authentication → Sign In / Providers → Email), come da BACKEND.md.\n');
    return;
  }
  if (r.corpo?.error_code === 'weak_password') {
    salvaStato(segnaEsistenza(stato, 'legacy', false));
    console.log('RIFIUTATO per password debole: il minimo è già stato alzato.');
    console.log('La prova 3 (utente storico) non è più riproducibile con un account nuovo:');
    console.log('usa un account reale già esistente con password corta, oppure riabbassa');
    console.log('temporaneamente il minimo, lancia «prepara», e rialzalo.\n');
    return;
  }
  if (r.corpo?.error_code === 'user_already_exists' || r.corpo?.msg?.includes('already')) {
    salvaStato(segnaEsistenza(stato, 'legacy', true));
    console.log('L\'account di prova esiste già: va bene, si passa a «verifica».\n');
    return;
  }
  console.log(`Risposta inattesa ${r.stato}:`, JSON.stringify(r.corpo, null, 2));
}

/* ------------------------------------------------------------------ */
/* Fase 2 — DOPO aver alzato il minimo                                 */
/* ------------------------------------------------------------------ */
async function verifica() {
  const stato = statoObbligatorio('verifica');
  const [PW_LEGACY_ATTUALE] = stato.account.legacy.passwordDaProvare;
  const PW_NUOVA = stato.passwordNuova;

  console.log(`\nProgetto: ${URL_BASE}`);
  console.log('Fase «verifica»: quattro prove sul server vero.\n');

  /* --- PROVA 1: registrazione con 11 caratteri ------------------- */
  const p1 = await registra(TEL_CORTA, PW_11);
  salvaStato(segnaEsistenza(stato, 'corta', p1.stato === 200));
  annota(
    `1. Registrazione con ${PW_11.length} caratteri`,
    'HTTP 422, error_code = weak_password',
    `HTTP ${p1.stato}, error_code = ${p1.corpo.error_code ?? '(nessuno)'} — "${p1.corpo.msg ?? ''}"`,
    p1.stato === 422 && p1.corpo.error_code === 'weak_password',
  );
  await attendi(1200);

  /* --- PROVA 2: password compromessa ----------------------------- */
  const volte = await quanteVolteViolata(PW_PWNED);
  if (volte === null) {
    annota('2a. Premessa: la password di prova è davvero compromessa',
      'conteggio HIBP > 0', 'HIBP non raggiungibile — prova non conclusiva', false);
  } else {
    annota('2a. Premessa: la password di prova è davvero compromessa',
      'conteggio HIBP > 0', `trovata ${volte.toLocaleString('it-IT')} volte nei data breach`, volte > 0);
  }

  const p2 = await registra(TEL_PWNED, PW_PWNED);
  salvaStato(segnaEsistenza(stato, 'pwned', p2.stato === 200));
  const rifiutataPerché = p2.corpo?.weak_password?.reasons?.join(', ') ?? '';
  annota(
    `2b. Registrazione con password compromessa (${PW_PWNED.length} caratteri, lunghezza a norma)`,
    'HTTP 422, error_code = weak_password, motivo "pwned"',
    `HTTP ${p2.stato}, error_code = ${p2.corpo.error_code ?? '(nessuno)'}${rifiutataPerché ? ` [${rifiutataPerché}]` : ''} — "${p2.corpo.msg ?? ''}"`,
    p2.stato === 422 && p2.corpo.error_code === 'weak_password',
  );
  if (p2.stato === 200) {
    console.log('  ⚠️  L\'account È STATO CREATO: la protezione password compromesse non è attiva.');
    console.log('      Sul piano free non è attivabile (richiede il piano Pro).');
    console.log('      Lancia «pulisci» per rimuovere questo account.\n');
  }
  await attendi(1200);

  /* --- PROVA 3: l'utente storico riesce ancora a entrare ---------- */
  const p3 = await entra(TEL_LEGACY, PW_LEGACY_ATTUALE);
  const tokenLegacy = p3.corpo.access_token;
  if (tokenLegacy) salvaStato(segnaEsistenza(stato, 'legacy', true));
  annota(
    `3a. Accesso di un account preesistente con password da ${PW_LEGACY_ATTUALE.length} caratteri (HTTP grezzo)`,
    'HTTP 200 con access_token: chi c\'era già entra ancora',
    `HTTP ${p3.stato}${tokenLegacy ? ' con access_token' : ''}${p3.corpo.weak_password ? ` + weak_password: [${p3.corpo.weak_password.reasons?.join(', ')}]` : ''}${p3.corpo.msg ? ` — "${p3.corpo.msg}"` : ''}`,
    p3.stato === 200 && Boolean(tokenLegacy),
  );

  /* --- PROVA 3b: e cosa vede l'APP, che passa da supabase-js? ----- */
  /* Questa è la prova che conta per gli utenti veri: signIn() in
     supabaseAuth.js traduce QUALSIASI errore in 'credenziali', e
     changePassword() rifà il login con la password attuale per
     verificarla. Se la libreria segnala la password debole come
     errore invece che come avviso, l'utente storico resta fuori. */
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const cliente = createClient(URL_BASE, CHIAVE, { auth: { persistSession: false } });
    const { data, error } = await cliente.auth.signInWithPassword({
      email: emailDa(TEL_LEGACY), password: PW_LEGACY_ATTUALE,
    });
    const debole = data?.weakPassword ? ` (weakPassword: ${data.weakPassword.reasons?.join(', ')})` : '';
    annota(
      '3b. Lo stesso accesso attraverso supabase-js, cioè quello che vede l\'app',
      'error === null e sessione presente',
      error
        ? `error = ${error.name}: "${error.message}" → l'app mostrerebbe "credenziali"`
        : `error = null, sessione ${data?.session ? 'presente' : 'assente'}${debole}`,
      !error && Boolean(data?.session),
    );
    if (error) {
      console.log('  ⚠️  Da sistemare in src/auth/supabaseAuth.js: signIn() tratta questo caso');
      console.log('      come credenziali sbagliate, e changePassword() verifica la password');
      console.log('      attuale con lo stesso login — gli utenti storici non potrebbero');
      console.log('      nemmeno cambiare la password.\n');
    }

    /* --- PROVA 3c: l'avviso arriva fino all'app? ------------------- */
    /* Entrare non basta. `signIn()` porta l'utente storico direttamente
       al cambio password SOLO se `data.weakPassword` è popolato: è quello
       il segnale, e senza di lui l'accesso riesce, la password corta resta
       corta per sempre e alzare il minimo non cambia niente per chi c'era
       già. Sul server questo campo esiste solo se il minimo è davvero
       salito: se qui esce vuoto, o la prova 1 è rossa (minimo non alzato)
       o la password del legacy è già a norma. */
    annota(
      '3c. L\'accesso porta con sé l\'avviso che la password va cambiata',
      'data.weakPassword.reasons contiene «length»',
      data?.weakPassword
        ? `weakPassword.reasons = [${data.weakPassword.reasons?.join(', ')}]`
        : 'weakPassword assente — l\'app non ha nessun segnale da seguire',
      Boolean(data?.weakPassword?.reasons?.includes('length')),
    );
  } catch {
    console.log('  (supabase-js non installato: lancia `npm install` per eseguire anche la prova 3b)\n');
  }

  /* --- PROVA 4: cambio password sotto il minimo ------------------- */
  if (!tokenLegacy) {
    annota('4. Cambio password sotto il minimo', 'HTTP 422 weak_password',
      'non eseguibile: la prova 3 non ha prodotto una sessione', false);
  } else {
    const p4 = await cambiaPassword(tokenLegacy, PW_11);
    annota(
      `4a. Cambio password verso ${PW_11.length} caratteri`,
      'HTTP 422, error_code = weak_password',
      `HTTP ${p4.stato}, error_code = ${p4.corpo.error_code ?? '(nessuno)'} — "${p4.corpo.msg ?? ''}"`,
      p4.stato === 422 && p4.corpo.error_code === 'weak_password',
    );
    await attendi(1200);

    /* Controprova: la via d'uscita esiste davvero. Senza questa, un 422
       potrebbe voler dire "il cambio password è rotto", non "la regola vale". */
    const violata = await quanteVolteViolata(PW_NUOVA);

    /* PRIMA della PUT, non dopo. Se la richiesta parte, arriva al server e
       la risposta si perde per strada, la password sul server è già quella
       nuova: averla scritta qui è l'unica cosa che tiene `pulisci` in grado
       di rientrare. Scriverla dopo funzionerebbe in tutti i casi tranne
       quello in cui serve. */
    salvaStato(aggiungiPassword(stato, 'legacy', PW_NUOVA));

    const p4b = await cambiaPassword(tokenLegacy, PW_NUOVA);
    annota(
      `4b. Controprova: cambio verso ${PW_NUOVA.length} caratteri casuali${violata === 0 ? ' (non compromessa)' : ''}`,
      'HTTP 200: la strada per mettersi in regola è aperta',
      `HTTP ${p4b.stato}${p4b.corpo.msg ? ` — "${p4b.corpo.msg}"` : ''}`,
      p4b.stato === 200,
    );
    if (p4b.stato === 200) {
      console.log(`  La password nuova dell'account di prova è salvata in ${PERCORSO_STATO}:`);
      console.log('  «pulisci» la rilegge da lì e riesce a cancellare l\'account.\n');
    }
  }

  const tutteOk = stampaRapporto();
  console.log('\nAccount di prova ancora presenti. Per rimuoverli: node verifica/password-server.mjs pulisci');
  process.exitCode = tutteOk ? 0 : 1;
}

/* ------------------------------------------------------------------ */
/* Fase 3 — Pulizia                                                    */
/* ------------------------------------------------------------------ */
async function pulisci() {
  const stato = statoObbligatorio('pulisci');

  console.log('\nCancellazione degli account di prova (solo +39 000 000 000x).\n');

  const { righe, tutteRiuscite } = await eseguiPulizia(stato, {
    accedi: async (tel, password) => {
      const sessione = await entra(tel, password);
      await attendi(400);
      return sessione.stato === 200 ? sessione.corpo.access_token || null : null;
    },
    /* delete_me è la RPC security definer dell'app: cancella soltanto
       l'utente che la chiama, quindi non può toccare nessun altro. */
    cancella: async (token) => {
      const r = await chiama('/rest/v1/rpc/delete_me', { method: 'POST', body: '{}' }, token);
      await attendi(800);
      return r.stato === 200 || r.stato === 204;
    },
  });

  for (const r of righe) {
    console.log(`${r.riuscito ? '✓' : '✗'} ${emailDa(r.telefono)} → ${r.nota}`);
  }

  if (tutteRiuscite) {
    rimuoviStato();
    console.log(`\nFatto. File di stato rimosso (${PERCORSO_STATO}).`);
    console.log('Controlla in Authentication → Users che non resti niente.');
    process.exitCode = 0;
    return;
  }

  /* Il file NON si tocca. È l'unico posto in cui esistono le password di
     quello che è rimasto sul server: cancellarlo adesso trasformerebbe una
     pulizia incompleta in una pulizia impossibile. */
  console.log(`\nQualcosa è rimasto. Il file di stato resta dov'è (${PERCORSO_STATO}):`);
  console.log('rilancia «pulisci» quando la rete regge, oppure toglili a mano dal pannello.');
  process.exitCode = 1;
}

/* ------------------------------------------------------------------ */
/* Riga di comando                                                     */
/*                                                                     */
/* La guardia serve a `verifica/password-server-stato.mjs`, che importa */
/* le funzioni di stato per provarle in locale: senza, il solo import   */
/* farebbe partire il comando e uscire con exit 1.                     */
/* ------------------------------------------------------------------ */
const lanciatoDaRiga = Boolean(process.argv[1])
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (lanciatoDaRiga) {
  const comando = process.argv[2];
  const azioni = { prepara, verifica, pulisci };
  if (!azioni[comando]) {
    console.log('Uso: node verifica/password-server.mjs [prepara|verifica|pulisci]');
    process.exit(1);
  }
  azioni[comando]().catch((e) => { console.error('\nErrore:', e.message); process.exit(1); });
}
