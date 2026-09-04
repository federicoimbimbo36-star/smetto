/* ------------------------------------------------------------------ */
/* password-server-stato.mjs — le tre fasi si passano le credenziali?  */
/*                                                                     */
/*   node verifica/password-server-stato.mjs                           */
/*                                                                     */
/* Il difetto che questa suite sorveglia: `prepara`, `verifica` e       */
/* `pulisci` sono tre PROCESSI DIVERSI. La prova 4b cambia la password  */
/* dell'account legacy con un valore casuale; se quel valore vive solo  */
/* in memoria, quando il processo finisce se ne va con lui, e `pulisci` */
/* non riesce più a entrare in un account che ha creato lui stesso.     */
/*                                                                     */
/* Perciò il blocco C non simula i processi: ne AVVIA TRE VERI, con     */
/* `spawnSync`, contro un finto server su file. Provare il passaggio    */
/* fra processi restando dentro un processo solo proverebbe la cosa     */
/* sbagliata — la memoria condivisa è esattamente ciò che nella realtà  */
/* non c'è.                                                            */
/*                                                                     */
/* Niente rete: il finto server è un JSON `{ email: password }`.        */
/* Nessuna chiamata a Supabase, né di produzione né di altro tipo.      */
/* ------------------------------------------------------------------ */

import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createServer } from 'node:http';

import {
  VERSIONE_STATO, PERCORSO_STATO, FLAG_PRO, emailDa,
  generaPasswordForte, nuovoStato, salvaStato, leggiStato, rimuoviStato,
  aggiungiPassword, segnaEsistenza, segnaSaltato, eseguiPulizia,
  provaLeakedRichiesta, creaRapporto,
} from './password-server.mjs';

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

const QUI = dirname(fileURLToPath(import.meta.url));
const MODULO = join(QUI, 'password-server.mjs');
const banco = mkdtempSync(join(tmpdir(), 'smetto-stato-'));
const stataFile = join(banco, 'stato.json');

const TEL_LEGACY = '+390000000001';
const PROGETTO = 'https://finto.esempio.supabase.co';

/* ================================================================== */
/* A. Il file di stato: forma, permessi, e nessuna chiave dentro       */
/* ================================================================== */

const s0 = salvaStato(nuovoStato(PROGETTO), stataFile);
const scritto = readFileSync(stataFile, 'utf8');

eq('A1  versione registrata', JSON.parse(scritto).versione, VERSIONE_STATO);
eq('A2  i tre account di prova ci sono', Object.keys(JSON.parse(scritto).account).sort(),
  ['corta', 'legacy', 'pwned']);
eq('A3  il legacy parte con la sua password corta',
  JSON.parse(scritto).account.legacy.passwordDaProvare, ['vecchia8']);
ok('A4  la password della prova 4b è generata già in «prepara»',
  typeof s0.passwordNuova === 'string' && s0.passwordNuova.length >= 12);

/* Requisito esplicito: nel file non finiscono chiavi Supabase. Si guarda
   il TESTO scritto, non l'oggetto in memoria, perché è il file quello che
   resta sul disco di chi lancia le prove. */
for (const proibito of ['sb_publishable', 'service_role', 'apikey', 'eyJ', 'anon']) {
  ok(`A5  nessuna chiave nel file: «${proibito}»`, !scritto.includes(proibito),
    `trovato «${proibito}» nel file di stato`);
}
ok('A6  il file è scritto con permessi 0600',
  (statSync(stataFile).mode & 0o777) === 0o600,
  `permessi ${(statSync(stataFile).mode & 0o777).toString(8)}`);

/* Il percorso predefinito sta accanto allo script e comincia con un punto:
   è la stessa forma già ignorata da Git per `verifica/.schermate.cjs`. */
ok('A7  il percorso predefinito è dentro verifica/', PERCORSO_STATO.includes('verifica'));
ok('A8  il nome del file comincia con un punto', /\/\.[^/]+$/.test(PERCORSO_STATO));

const gitignore = readFileSync(join(QUI, '..', '.gitignore'), 'utf8');
ok('A9  il file di stato è escluso da Git',
  gitignore.split('\n').some((r) => r.trim() === 'verifica/.stato-prove-password.json'),
  'manca la riga in .gitignore');

/* ================================================================== */
/* B. Lettura, accumulo, errori rumorosi                               */
/* ================================================================== */

eq('B1  file assente → null', leggiStato(join(banco, 'non-esiste.json')), null);

const s1 = leggiStato(stataFile);
eq('B1b riletto uguale a scritto', s1.passwordNuova, s0.passwordNuova);

/* La regola numero due: non si sostituisce, si accumula. */
aggiungiPassword(s1, 'legacy', 'NuovaLunghissima12!');
eq('B2  la nuova password va davanti, la vecchia resta dietro',
  s1.account.legacy.passwordDaProvare, ['NuovaLunghissima12!', 'vecchia8']);

aggiungiPassword(s1, 'legacy', 'vecchia8');
eq('B3  niente doppioni: la ripetuta si sposta davanti',
  s1.account.legacy.passwordDaProvare, ['vecchia8', 'NuovaLunghissima12!']);

segnaEsistenza(s1, 'corta', false);
eq('B4  l\'esistenza si registra', s1.account.corta.esiste, false);

let scoppiato = null;
try { aggiungiPassword(s1, 'inventato', 'x'); } catch (e) { scoppiato = e.message; }
ok('B5  un account sconosciuto è un errore, non un silenzio', /inventato/.test(scoppiato || ''));

/* Un file illeggibile NON deve passare per «niente da pulire»: direbbe
   «fatto» lasciando gli account vivi sul progetto. */
const rotto = join(banco, 'rotto.json');
writeFileSync(rotto, '{ questo non è json');
scoppiato = null;
try { leggiStato(rotto); } catch (e) { scoppiato = e.message; }
ok('B6  file illeggibile → errore rumoroso', /non è leggibile/.test(scoppiato || ''));

const vecchio = join(banco, 'vecchio.json');
writeFileSync(vecchio, JSON.stringify({ versione: 0, account: {} }));
scoppiato = null;
try { leggiStato(vecchio); } catch (e) { scoppiato = e.message; }
ok('B7  formato non riconosciuto → errore rumoroso', /non riconosco/.test(scoppiato || ''));

/* ================================================================== */
/* C. Tre processi veri, un finto server su file                       */
/* ================================================================== */

const server = join(banco, 'finto-server.json');
writeFileSync(server, '{}');

const preludio = `
import { readFileSync, writeFileSync } from 'node:fs';
import {
  nuovoStato, salvaStato, leggiStato, rimuoviStato,
  aggiungiPassword, segnaEsistenza, eseguiPulizia, emailDa, generaPasswordForte,
} from ${JSON.stringify(MODULO)};
const STATO = ${JSON.stringify(stataFile)};
const SRV = ${JSON.stringify(server)};
const leggiSrv = () => JSON.parse(readFileSync(SRV, 'utf8'));
const scriviSrv = (o) => writeFileSync(SRV, JSON.stringify(o));
const TEL = ${JSON.stringify(TEL_LEGACY)};
`;

const fase = (nome, corpo) => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', preludio + corpo],
    { encoding: 'utf8' });
  if (r.status !== 0) {
    falliti.push(`${nome}: il processo è uscito con ${r.status}\n      ${r.stderr.trim().split('\n').slice(-3).join('\n      ')}`);
    return {};
  }
  try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch { return {}; }
};

/* --- processo 1: prepara ---------------------------------------- */
rimuoviStato(stataFile);
const p1 = fase('C-prepara', `
  const stato = salvaStato(nuovoStato(${JSON.stringify(PROGETTO)}), STATO);
  const srv = leggiSrv();
  srv[emailDa(TEL)] = 'vecchia8';           // registrazione con password corta
  scriviSrv(srv);
  salvaStato(segnaEsistenza(stato, 'legacy', true), STATO);
  console.log(JSON.stringify({ passwordNuova: stato.passwordNuova }));
`);
ok('C1  «prepara» ha generato la password della prova 4b',
  typeof p1.passwordNuova === 'string' && p1.passwordNuova.length >= 12);

/* --- processo 2: verifica --------------------------------------- */
const p2 = fase('C-verifica', `
  const stato = leggiStato(STATO);
  // si scrive PRIMA di agire: se il processo morisse qui, pulisci saprebbe già
  salvaStato(aggiungiPassword(stato, 'legacy', stato.passwordNuova), STATO);
  const srv = leggiSrv();
  srv[emailDa(TEL)] = stato.passwordNuova;  // prova 4b: la password cambia sul server
  scriviSrv(srv);
  console.log(JSON.stringify({ passwordNuova: stato.passwordNuova }));
`);
eq('C2  il secondo processo legge LA STESSA password del primo',
  p2.passwordNuova, p1.passwordNuova);

const dopoVerifica = leggiStato(stataFile);
eq('C3  dopo il cambio il file conosce entrambe le password',
  dopoVerifica.account.legacy.passwordDaProvare, [p1.passwordNuova, 'vecchia8']);

/* --- processo 3: pulisci ---------------------------------------- */
const p3 = fase('C-pulisci', `
  const stato = leggiStato(STATO);
  const esito = await eseguiPulizia(stato, {
    accedi: async (tel, pw) => (leggiSrv()[emailDa(tel)] === pw ? 'token:' + emailDa(tel) : null),
    cancella: async (token) => {
      const srv = leggiSrv();
      delete srv[token.slice('token:'.length)];
      scriviSrv(srv);
      return true;
    },
  });
  if (esito.tutteRiuscite) rimuoviStato(STATO);
  console.log(JSON.stringify({ ...esito, restano: Object.keys(leggiSrv()) }));
`);
ok('C4  il terzo processo cancella l\'account dopo il cambio password',
  p3.tutteRiuscite === true,
  JSON.stringify(p3.righe));
eq('C5  sul finto server non resta niente', p3.restano, []);
eq('C6  ha usato la password più recente',
  p3.righe?.find((r) => r.id === 'legacy')?.nota, 'cancellato (password più recente)');
ok('C7  con tutto cancellato il file di stato sparisce', !existsSync(stataFile));

/* --- controprova: il difetto di prima ---------------------------- */
/* Stessa sequenza, ma con la password casuale generata dentro il processo
   di «verifica» e mai salvata: è com'era prima. Se questa controprova
   passasse insieme a C4, vorrebbe dire che C4 non sta misurando niente. */
writeFileSync(server, '{}');
fase('D-prepara', `
  const stato = salvaStato(nuovoStato(${JSON.stringify(PROGETTO)}), STATO);
  const srv = leggiSrv();
  srv[emailDa(TEL)] = 'vecchia8';
  scriviSrv(srv);
  salvaStato(segnaEsistenza(stato, 'legacy', true), STATO);
  console.log('{}');
`);
fase('D-verifica', `
  const stato = leggiStato(STATO);
  const persa = generaPasswordForte();   // nasce qui, muore qui: com'era prima
  const srv = leggiSrv();
  srv[emailDa(TEL)] = persa;
  scriviSrv(srv);
  console.log('{}');
`);
const d3 = fase('D-pulisci', `
  const stato = leggiStato(STATO);
  const esito = await eseguiPulizia(stato, {
    accedi: async (tel, pw) => (leggiSrv()[emailDa(tel)] === pw ? 'token:' + emailDa(tel) : null),
    cancella: async () => true,
  });
  if (esito.tutteRiuscite) rimuoviStato(STATO);
  console.log(JSON.stringify({ ...esito, restano: Object.keys(leggiSrv()) }));
`);
ok('D1  controprova: senza salvare, la pulizia NON riesce', d3.tutteRiuscite === false);
eq('D2  controprova: l\'account resta sul server', d3.restano, [emailDa(TEL_LEGACY)]);
ok('D3  controprova: e il file di stato viene TENUTO', existsSync(stataFile),
  'il file è sparito: un secondo «pulisci» sarebbe impossibile');
ok('D4  controprova: la nota dice perché',
  /nessuna delle 1 password/.test(d3.righe?.find((r) => r.id === 'legacy')?.nota || ''));

/* ================================================================== */
/* E. eseguiPulizia, caso per caso                                     */
/* ================================================================== */

const staccato = (modifica) => {
  const s = nuovoStato(PROGETTO);
  modifica(s);
  return s;
};
const finto = (accessi, cancellaOk = true) => ({
  accedi: async (tel, pw) => (accessi[emailDa(tel)] === pw ? `token:${tel}` : null),
  cancella: async () => cancellaOk,
});

/* Registrazione rifiutata: non c'è niente da cancellare, e non è un guaio. */
const e1 = await eseguiPulizia(
  staccato((s) => { segnaEsistenza(s, 'legacy', false); segnaEsistenza(s, 'corta', false); segnaEsistenza(s, 'pwned', false); }),
  finto({}),
);
ok('E1  tre account mai creati → pulizia riuscita', e1.tutteRiuscite === true);
eq('E1b e lo dice', e1.righe[0].nota, 'mai creato, niente da cancellare');

/* Esiste, si entra, delete_me fallisce: il file deve restare. */
const e2 = await eseguiPulizia(
  staccato((s) => { segnaEsistenza(s, 'legacy', true); segnaEsistenza(s, 'corta', false); segnaEsistenza(s, 'pwned', false); }),
  finto({ [emailDa(TEL_LEGACY)]: 'vecchia8' }, false),
);
ok('E2  delete_me che fallisce → pulizia non riuscita', e2.tutteRiuscite === false);
eq('E2b e lo dice', e2.righe.find((r) => r.id === 'legacy').nota,
  'sessione aperta ma delete_me non è riuscita');

/* Non sappiamo se esiste e non si entra: è un'assenza, non un fallimento —
   altrimenti il file resterebbe lì per sempre dopo un «prepara» a vuoto. */
const e3 = await eseguiPulizia(staccato(() => {}), finto({}));
ok('E3  esistenza ignota e nessun accesso → riuscita', e3.tutteRiuscite === true);
eq('E3b e lo dice', e3.righe[0].nota, 'nessuna traccia sul server');

/* Il caso che dà il nome a tutto: si entra solo con la password vecchia,
   perché il cambio non era mai partito. */
const e4 = await eseguiPulizia(
  staccato((s) => {
    segnaEsistenza(s, 'legacy', true);
    segnaEsistenza(s, 'corta', false);
    segnaEsistenza(s, 'pwned', false);
    aggiungiPassword(s, 'legacy', 'CambioMaiAndato12!');
  }),
  finto({ [emailDa(TEL_LEGACY)]: 'vecchia8' }),
);
ok('E4  cambio non riuscito → si rientra con la password precedente',
  e4.tutteRiuscite === true);
eq('E4b e lo dice', e4.righe.find((r) => r.id === 'legacy').nota,
  'cancellato (password precedente)');

/* ================================================================== */
/* F. La password casuale è davvero casuale                            */
/* ================================================================== */
/* Se non lo fosse, C2 passerebbe per il motivo sbagliato: due processi
   che generano lo stesso valore non dimostrerebbero nessun passaggio. */
const generate = new Set(Array.from({ length: 200 }, () => generaPasswordForte()));
eq('F1  200 password generate, 200 diverse', generate.size, 200);
ok('F2  lunghe abbastanza per il minimo a 12',
  [...generate].every((p) => p.length >= 12));
ok('F3  con maiuscole, minuscole, cifre e simboli',
  [...generate].every((p) => /[A-Z]/.test(p) && /[a-z]/.test(p) && /[0-9]/.test(p) && /[^A-Za-z0-9]/.test(p)));

/* ================================================================== */
/* G. Il rapporto sa dire «saltata» senza dire «fallita»               */
/* ================================================================== */

const zitto = () => {};

const r1 = creaRapporto(zitto);
r1.annota('a', '', '', true);
r1.annota('b', '', '', true);
r1.salta('c', 'saltata: richiede Supabase Pro');
const c1 = r1.chiudi();
ok('G1  una prova saltata non fa fallire la verifica', c1.tutteOk === true);
eq('G1b conta solo quello che ha eseguito', [c1.eseguite, c1.passate, c1.saltate], [2, 2, 1]);

const r2 = creaRapporto(zitto);
r2.annota('a', '', '', true);
r2.annota('b', '', '', false);
r2.salta('c', 'saltata: richiede Supabase Pro');
const c2 = r2.chiudi();
ok('G2  una prova fallita fa fallire la verifica', c2.tutteOk === false);
eq('G2b la saltata resta fuori dal conteggio', [c2.eseguite, c2.saltate], [2, 1]);

const r3 = creaRapporto(zitto);
r3.salta('unica', 'saltata: richiede Supabase Pro');
ok('G3  solo saltate → nessun fallimento', r3.chiudi().tutteOk === true);

/* La saltata resta VISIBILE: sparire in silenzio farebbe dimenticare che
   c'è una prova da riaccendere il giorno che il piano cambia. */
const righeRapporto = [];
const r4 = creaRapporto((t) => righeRapporto.push(t));
r4.salta('2. Registrazione con password compromessa', 'saltata: richiede Supabase Pro');
r4.chiudi();
ok('G4  il motivo è scritto nel rapporto',
  righeRapporto.some((t) => t.includes('saltata: richiede Supabase Pro')));
ok('G4b e anche nel riepilogo finale',
  righeRapporto.some((t) => t.startsWith('–') && t.includes('password compromessa')));

/* ================================================================== */
/* H. Il flag                                                          */
/* ================================================================== */

ok('H1  senza argomenti la prova leaked non parte', provaLeakedRichiesta([]) === false);
ok('H1b nemmeno con altri argomenti', provaLeakedRichiesta(['--verbose', 'pro']) === false);
ok('H2  parte solo con il flag esatto', provaLeakedRichiesta([FLAG_PRO]) === true);
eq('H2b il flag è quello documentato', FLAG_PRO, '--pro');

/* Saltare una prova non cancella quello che sapevamo. Se l'account pwned
   era già stato creato da una verifica precedente, `esiste` resta `true` e
   `pulisci` continua a occuparsene. */
const sIgnoto = segnaSaltato(nuovoStato(PROGETTO), 'pwned');
eq('H3  esistenza ignota → segnato come mai creato', sIgnoto.account.pwned.esiste, false);

const sCreato = nuovoStato(PROGETTO);
segnaEsistenza(sCreato, 'pwned', true);
segnaSaltato(sCreato, 'pwned');
eq('H4  esistenza nota → il salto NON la cancella', sCreato.account.pwned.esiste, true);

/* Requisito 5, misurato: uno stato vecchio con l'account pwned vivo deve
   ancora essere ripulito. */
const eVecchio = await eseguiPulizia(
  staccato((s) => {
    segnaEsistenza(s, 'legacy', false);
    segnaEsistenza(s, 'corta', false);
    segnaEsistenza(s, 'pwned', true);
    segnaSaltato(s, 'pwned');
  }),
  finto({ [emailDa('+390000000003')]: 'passwordpassword' }),
);
ok('H5  stato precedente con account pwned → viene cancellato', eVecchio.tutteRiuscite === true);
eq('H5b e lo dice', eVecchio.righe.find((r) => r.id === 'pwned').nota,
  'cancellato (password più recente)');

/* Stato nuovo: la prova è stata saltata, l'account non è mai nato. */
const eNuovo = await eseguiPulizia(
  staccato((s) => { segnaSaltato(s, 'pwned'); segnaEsistenza(s, 'legacy', false); segnaEsistenza(s, 'corta', false); }),
  finto({}),
);
ok('H6  stato nuovo: niente da cancellare, e non è un guaio', eNuovo.tutteRiuscite === true);
eq('H6b e lo dice', eNuovo.righe.find((r) => r.id === 'pwned').nota,
  'mai creato, niente da cancellare');

/* ================================================================== */
/* I. La CLI vera, contro un server finto su 127.0.0.1                 */
/* ================================================================== */
/* I blocchi G e H provano le funzioni. Questo prova il COMANDO: che
   `verifica` non registri l'account pwned e non chiami HIBP.
   «Non chiamare» non si legge dal codice, si misura — e si misura solo
   guardando cosa esce dal processo. Il server è locale, quindi ogni
   richiesta che parte finisce nel registro qui sotto: se l'account pwned
   venisse creato lo si vedrebbe, e se una riga della prova 2 comparisse
   nel rapporto vorrebbe dire che il ramo è stato percorso — che è l'unico
   punto da cui si contatta HIBP. */

const chiamate = [];
const sessione = {
  access_token: 'jwt.finto', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'rf',
  user: { id: 'legacy', email: emailDa(TEL_LEGACY), aud: 'authenticated' },
};
const debole = { message: 'Password should be at least 12 characters.', reasons: ['length'] };

const finto12 = createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    let dati = {};
    try { dati = JSON.parse(corpo || '{}'); } catch { /* corpo non JSON */ }
    chiamate.push({ metodo: req.method, percorso: req.url, email: dati.email ?? null });
    const invia = (stato, oggetto) => {
      res.writeHead(stato, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(oggetto));
    };
    /* Un server con il minimo a 12: rifiuta le registrazioni corte, fa
       entrare l'account storico allegando l'avviso, e accetta il cambio
       password solo verso qualcosa di lungo abbastanza. */
    if (req.url.startsWith('/auth/v1/signup')) {
      return invia(422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 12 characters.', weak_password: { reasons: ['length'] } });
    }
    if (req.url.startsWith('/auth/v1/token')) {
      return invia(200, { ...sessione, weak_password: debole });
    }
    if (req.url.startsWith('/auth/v1/user')) {
      return (dati.password ?? '').length >= 12
        ? invia(200, { id: 'legacy' })
        : invia(422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 12 characters.' });
    }
    return invia(404, {});
  });
});

await new Promise((r) => { finto12.listen(0, '127.0.0.1', r); });
const BASE = `http://127.0.0.1:${finto12.address().port}`;

/* Una spia caricata PRIMA dello script, che avvolge `fetch` e segnala ogni
   indirizzo che non sia il server finto. «Non contatta HIBP» letto dal
   codice è una lettura; letto qui è una misura — e copre tutto il processo,
   non solo il punto che si è pensato di guardare. */
const spia = join(banco, 'spia-rete.mjs');
writeFileSync(spia, `
const originale = globalThis.fetch;
globalThis.fetch = (...a) => {
  const url = String(a[0] && a[0].url ? a[0].url : a[0]);
  if (!url.includes('127.0.0.1')) console.log('SPIA-RETE ' + url);
  return originale(...a);
};
`);

/* `spawn` e non `spawnSync`: il server finto vive in QUESTO processo, e
   `spawnSync` ne blocca il loop degli eventi finché il figlio non finisce.
   Il figlio chiederebbe, il genitore non potrebbe rispondere, e i due si
   aspetterebbero a vicenda per sempre. */
const eseguiCli = (args) => new Promise((risolvi) => {
  const figlio = spawn(process.execPath, ['--import', pathToFileURL(spia).href, MODULO, ...args], {
    env: { ...process.env, VITE_SUPABASE_URL: BASE, VITE_SUPABASE_PUBLISHABLE_KEY: 'chiave-finta' },
  });
  let stdout = '';
  figlio.stdout.on('data', (d) => { stdout += d; });
  figlio.stderr.on('data', (d) => { stdout += d; });
  figlio.on('close', (status) => risolvi({ status, stdout }));
});

/* --- predefinito: piano free ------------------------------------- */
rimuoviStato(PERCORSO_STATO);
salvaStato(segnaEsistenza(nuovoStato(BASE), 'legacy', true), PERCORSO_STATO);
chiamate.length = 0;
const corsaFree = await eseguiCli(['verifica']);

ok('I1  la verifica esce con successo sul piano free', corsaFree.status === 0,
  `exit=${corsaFree.status}\n${corsaFree.stdout.slice(-600)}`);
ok('I2  il rapporto dice «saltata: richiede Supabase Pro»',
  /saltata: richiede Supabase Pro/.test(corsaFree.stdout));
ok('I3  non la conta come fallita', !/FALLITA.*compromess/i.test(corsaFree.stdout));
ok('I4  il riepilogo dichiara la saltata', /,\s*1 saltata\b/.test(corsaFree.stdout),
  corsaFree.stdout.split('RAPPORTO')[1]?.slice(0, 80));

const emailPwned = emailDa('+390000000003');
ok('I5  NESSUNA registrazione dell\'account con password compromessa',
  !chiamate.some((c) => c.percorso.startsWith('/auth/v1/signup') && c.email === emailPwned),
  JSON.stringify(chiamate.filter((c) => c.email === emailPwned)));
ok('I6  nessuna richiesta di alcun tipo per quell\'account',
  !chiamate.some((c) => c.email === emailPwned));

/* Le righe «2a»/«2b» si stampano solo percorrendo il ramo, ed è l'unico
   punto del file da cui parte una chiamata a HaveIBeenPwned. */
ok('I7  nessuna traccia del ramo che contatta HIBP',
  !/2a\.|2b\.|data breach|non compromessa/.test(corsaFree.stdout), corsaFree.stdout.slice(-400));

/* La misura, non l'indizio: la spia elenca ogni indirizzo esterno che il
   processo ha davvero chiesto. Deve essere vuota — HIBP compreso, anche
   quello della prova 4b, che è un ramo diverso e si sarebbe potuto
   dimenticare. */
const versoFuori = corsaFree.stdout.split('\n').filter((r) => r.startsWith('SPIA-RETE'));
eq('I7b nessuna richiesta fuori dal server finto', versoFuori, []);

/* Le altre prove invece sono state eseguite davvero. */
ok('I8  la prova 1 è stata eseguita', /1\. Registrazione con 11 caratteri/.test(corsaFree.stdout));
ok('I9  le prove 3 e 4 sono state eseguite',
  /3a\./.test(corsaFree.stdout) && /4a\./.test(corsaFree.stdout) && /4b\./.test(corsaFree.stdout));

const dopoFree = leggiStato(PERCORSO_STATO);
eq('I10 l\'account pwned resta segnato come mai creato', dopoFree.account.pwned.esiste, false);

/* --- con il flag -------------------------------------------------- */
chiamate.length = 0;
const corsaPro = await eseguiCli(['verifica', FLAG_PRO]);
ok('I11 con --pro il ramo viene percorso', /2b\./.test(corsaPro.stdout), corsaPro.stdout.slice(-400));
ok('I12 con --pro l\'account pwned viene registrato',
  chiamate.some((c) => c.percorso.startsWith('/auth/v1/signup') && c.email === emailPwned));
ok('I13 con --pro la prova non risulta saltata',
  !/saltata: richiede Supabase Pro/.test(corsaPro.stdout));

/* --- senza file di stato: ci si ferma prima di toccare la rete ---- */
rimuoviStato(PERCORSO_STATO);
chiamate.length = 0;
const senzaStato = await eseguiCli(['verifica']);
eq('I14 senza stato la verifica si ferma', senzaStato.status, 1);
eq('I15 e non manda nessuna richiesta', chiamate.length, 0);

/* --- la riga di comando documenta il flag ------------------------- */
const uso = await eseguiCli(['boh']);
ok('I16 l\'uso menziona --pro', uso.stdout.includes(FLAG_PRO));

finto12.close();

/* ------------------------------------------------------------------ */

rmSync(banco, { recursive: true, force: true });
rimuoviStato(PERCORSO_STATO);

console.log(`\npassword-server-stato: ${passati} controlli superati`);
if (falliti.length) {
  console.error(`\n${falliti.length} FALLITI:\n  · ${falliti.join('\n  · ')}\n`);
  process.exit(1);
}
