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

import { spawnSync } from 'node:child_process';
import {
  existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  VERSIONE_STATO, PERCORSO_STATO, emailDa,
  generaPasswordForte, nuovoStato, salvaStato, leggiStato, rimuoviStato,
  aggiungiPassword, segnaEsistenza, eseguiPulizia,
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

/* ------------------------------------------------------------------ */

rmSync(banco, { recursive: true, force: true });

console.log(`\npassword-server-stato: ${passati} controlli superati`);
if (falliti.length) {
  console.error(`\n${falliti.length} FALLITI:\n  · ${falliti.join('\n  · ')}\n`);
  process.exit(1);
}
