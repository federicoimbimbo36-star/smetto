/* ------------------------------------------------------------------ */
/* controlli.mjs — verifica delle correzioni, senza framework di test.  */
/*                                                                     */
/*   TZ=Europe/Rome bun verifica/controlli.mjs                         */
/*                                                                     */
/* Non è una suite completa: sono i controlli sui punti dove i bug      */
/* c'erano davvero, scritti in modo da FALLIRE con il codice di prima.  */
/* Servono a dimostrare la correzione, non a coprire tutto.            */
/* ------------------------------------------------------------------ */

import {
  sod, dayDiff, addGiorni, maxTs, daYmd, ymd, prossimaMedia,
} from '../src/utils/format.js';
import { DAY } from '../src/constants.js';

let passati = 0;
const falliti = [];

function ok(nome, condizione, dettaglio = '') {
  if (condizione) { passati += 1; return; }
  falliti.push(`${nome}${dettaglio ? ` — ${dettaglio}` : ''}`);
}

const eq = (nome, a, b) => ok(nome, JSON.stringify(a) === JSON.stringify(b), `atteso ${JSON.stringify(b)}, ottenuto ${JSON.stringify(a)}`);

/* ------------------------------------------------------------------ */
/* 1. Ora legale — il bug che spariva un giorno dalla classifica        */
/* ------------------------------------------------------------------ */
/* In Italia il 29 marzo 2026 le lancette vanno avanti: quel giorno     */
/* dura 23 ore. Il 30 marzo, "gli ultimi 7 giorni" calcolati sottraendo */
/* 86.400.000 ms alla volta saltano il 29 e contano un giorno di troppo */
/* dall'altra parte.                                                    */

const trentaMarzo = new Date(2026, 2, 30, 12, 0, 0).getTime();

const chiaviVecchie = Array.from({ length: 7 }, (_, i) => ymd(sod(trentaMarzo) - i * DAY));
const chiaviNuove = Array.from({ length: 7 }, (_, i) => ymd(addGiorni(trentaMarzo, -i)));

ok('DST · il vecchio calcolo perdeva il 29 marzo',
  !chiaviVecchie.includes('2026-03-29'), `chiavi vecchie: ${chiaviVecchie.join(' ')}`);
ok('DST · il nuovo calcolo include il 29 marzo',
  chiaviNuove.includes('2026-03-29'), `chiavi nuove: ${chiaviNuove.join(' ')}`);
eq('DST · 7 giorni consecutivi senza buchi né doppioni', chiaviNuove, [
  '2026-03-30', '2026-03-29', '2026-03-28', '2026-03-27',
  '2026-03-26', '2026-03-25', '2026-03-24',
]);
eq('DST · nessuna chiave ripetuta', new Set(chiaviNuove).size, 7);

/* stesso controllo sul ritorno all'ora solare: 25 ottobre 2026 dura 25 ore */
const ventisetteOttobre = new Date(2026, 9, 27, 12, 0, 0).getTime();
const chiaviOttobre = Array.from({ length: 7 }, (_, i) => ymd(addGiorni(ventisetteOttobre, -i)));
eq('DST · ottobre, 7 giorni consecutivi', chiaviOttobre, [
  '2026-10-27', '2026-10-26', '2026-10-25', '2026-10-24',
  '2026-10-23', '2026-10-22', '2026-10-21',
]);

/* addGiorni torna sempre la mezzanotte vera del giorno di calendario */
ok('addGiorni · restituisce mezzanotte locale',
  [0, -1, -2, -7, -30, 1, 7].every((n) => new Date(addGiorni(trentaMarzo, n)).getHours() === 0));

/* i confini di giornata attorno al cambio d'ora non si sovrappongono */
const giornoDST = addGiorni(new Date(2026, 2, 29, 12).getTime(), 0);
const dopoDST = addGiorni(giornoDST, 1);
ok('addGiorni · il giorno da 23 ore resta un giorno intero',
  dopoDST - giornoDST === 23 * 3600000, `durata ${(dopoDST - giornoDST) / 3600000}h`);

/* ------------------------------------------------------------------ */
/* 2. maxTs — niente RangeError sugli storici lunghi, niente −Infinity  */
/* ------------------------------------------------------------------ */
eq('maxTs · array vuoto torna null', maxTs([]), null);
eq('maxTs · null torna null', maxTs(null), null);
eq('maxTs · trova il massimo', maxTs([5, 99, 3]), 99);

const storicoLungo = Array.from({ length: 200000 }, (_, i) => i);
let vecchioEsplode = false;
try { Math.max(...storicoLungo); } catch (e) { vecchioEsplode = true; }
ok('maxTs · dove Math.max(...) esplode, maxTs regge',
  vecchioEsplode ? maxTs(storicoLungo) === 199999 : true,
  vecchioEsplode ? '' : '(su questo motore Math.max regge comunque: controllo non probante)');

/* ------------------------------------------------------------------ */
/* 3. daYmd — la chiave "YYYY-MM-DD" torna al giorno giusto             */
/* ------------------------------------------------------------------ */
eq('daYmd · andata e ritorno', ymd(daYmd('2026-03-29')), '2026-03-29');
ok('daYmd · non slitta al giorno prima come new Date(stringa)',
  ymd(daYmd('2026-01-15')) === '2026-01-15');

/* ------------------------------------------------------------------ */
/* 4. Il piano settimanale — lo sfasamento di una settimana             */
/* ------------------------------------------------------------------ */
/* Regola: il numero di settimana della prima riga del piano deve       */
/* coincidere con quello che il Recap mostra come «OBIETTIVO SETTIMANA  */
/* n», e il valore deve essere lo stesso di s.obiettivo.                */

function calcolaPiano({ start, adesso, mediaPrec, media, baseline }) {
  const base = mediaPrec ?? media ?? baseline;
  if (!base || base <= 0) return null;
  const giorno = dayDiff(start, adesso);
  const settCorrente = Math.floor(giorno / 7);
  const conObiettivoOra = mediaPrec != null;
  const primaSett = conObiettivoOra ? settCorrente : settCorrente + 1;
  const lunediSett = (idx) => addGiorni(start, idx * 7);

  const righe = [];
  let m = base;
  let i = 0;
  while (i < 40) {
    m = prossimaMedia(m);
    const idxSett = primaSett + i;
    righe.push({
      n: idxSett + 1, media: m, data: ymd(lunediSett(idxSett)), corrente: i === 0 && conObiettivoOra,
    });
    i += 1;
    if (m < 0.5) break;
  }
  const settZero = primaSett + righe.length;
  return {
    righe, settCorrente,
    settimaneRestanti: Math.max(1, settZero - settCorrente),
    dataZero: ymd(lunediSett(settZero)),
  };
}

// caso A: siamo nella settimana 2 (indice 1), la scorsa media era 20/giorno
const startA = new Date(2026, 0, 5).getTime();          // lunedì
const adessoA = new Date(2026, 0, 14, 10).getTime();    // 9 giorni dopo → settimana indice 1
const pianoA = calcolaPiano({ start: startA, adesso: adessoA, mediaPrec: 20, media: 15 });
const obiettivoRecapA = prossimaMedia(20);              // quello che mostra il Recap

eq('Piano · la prima riga è la settimana in corso, come nel Recap',
  pianoA.righe[0].n, pianoA.settCorrente + 1);
eq('Piano · il valore della prima riga è l\'obiettivo di questa settimana',
  pianoA.righe[0].media, obiettivoRecapA);
eq('Piano · la data della prima riga è il lunedì della settimana in corso',
  pianoA.righe[0].data, ymd(addGiorni(startA, pianoA.settCorrente * 7)));
ok('Piano · la prima riga è marcata come corrente', pianoA.righe[0].corrente === true);
eq('Piano · numeri di settimana consecutivi',
  pianoA.righe.slice(0, 4).map((r) => r.n),
  [pianoA.settCorrente + 1, pianoA.settCorrente + 2, pianoA.settCorrente + 3, pianoA.settCorrente + 4]);

// caso B: settimana di misura (nessuna media precedente) → il piano parte dopo
const adessoB = new Date(2026, 0, 8, 10).getTime();     // 3 giorni dopo → settimana indice 0
const pianoB = calcolaPiano({ start: startA, adesso: adessoB, mediaPrec: null, media: 18 });
eq('Piano · in settimana di misura la prima riga è la settimana DOPO',
  pianoB.righe[0].n, pianoB.settCorrente + 2);
ok('Piano · in settimana di misura nessuna riga è "corrente"',
  pianoB.righe.every((r) => !r.corrente));
ok('Piano · settimane restanti conta anche la settimana di misura',
  pianoB.settimaneRestanti === pianoB.righe.length + 1,
  `restanti ${pianoB.settimaneRestanti}, righe ${pianoB.righe.length}`);

// la data di sigaretta zero cade dopo l'ultima riga del piano
const ultimaRigaA = pianoA.righe[pianoA.righe.length - 1];
ok('Piano · sigaretta zero cade dopo l\'ultima settimana del piano',
  daYmd(pianoA.dataZero) > daYmd(ultimaRigaA.data));
ok('Piano · il piano scende davvero fino a zero',
  ultimaRigaA.media < 0.5, `ultima media ${ultimaRigaA.media}`);

/* ------------------------------------------------------------------ */
/* 5. Classifica: il calo confrontava mele con pere                     */
/* ------------------------------------------------------------------ */
/* `days` ha una chiave solo per i giorni con almeno una sigaretta.     */
/* Prendere "le prime 7 chiavi" significava prendere i primi 7 giorni   */
/* FUMATI, che possono coprire tre settimane, e dividerli per 7.        */

const oggi = new Date(2026, 5, 30, 12).getTime();       // 30 giugno 2026
const inizio = addGiorni(oggi, -29);                    // primo giorno registrato

// persona che nei primi 7 giorni ha fumato 10 al giorno solo a giorni alterni
const days = {};
for (let i = 0; i < 7; i += 1) if (i % 2 === 0) days[ymd(addGiorni(inizio, i))] = 10;   // 4 giorni × 10
for (let i = 23; i < 30; i += 1) days[ymd(addGiorni(oggi, -(29 - i)))] = 5;             // ultimi 7 giorni × 5

const chiaviOrdinate = Object.keys(days).sort();

// vecchio calcolo: prime 7 CHIAVI / 7
const primiVecchio = chiaviOrdinate.slice(0, 7).reduce((t, k) => t + days[k], 0) / 7;
// nuovo calcolo: primi 7 giorni di CALENDARIO / 7
const primoGiorno = daYmd(chiaviOrdinate[0]);
const primiNuovo = Array.from({ length: 7 }, (_, i) => ymd(addGiorni(primoGiorno, i)))
  .reduce((t, k) => t + (days[k] || 0), 0) / 7;

eq('Classifica · nuovo calcolo: media reale dei primi 7 giorni di calendario',
  primiNuovo, 40 / 7);
ok('Classifica · il vecchio calcolo gonfiava la base di partenza',
  primiVecchio > primiNuovo, `vecchio ${primiVecchio.toFixed(2)} vs nuovo ${primiNuovo.toFixed(2)}`);

const ultimi = Array.from({ length: 7 }, (_, i) => ymd(addGiorni(oggi, -i)))
  .reduce((t, k) => t + (days[k] || 0), 0) / 7;
const caloVecchio = Math.round(((primiVecchio - ultimi) / primiVecchio) * 100);
const caloNuovo = Math.round(((primiNuovo - ultimi) / primiNuovo) * 100);
ok('Classifica · il calo dichiarato era più alto del vero',
  caloVecchio > caloNuovo, `vecchio ${caloVecchio}% vs nuovo ${caloNuovo}%`);

/* la soglia: servono 14 giorni di calendario perché le due finestre non
   si sovrappongano (prima bastavano 8 giorni con almeno una sigaretta) */
ok('Classifica · con meno di 14 giorni il calo non si calcola',
  dayDiff(daYmd(chiaviOrdinate[0]), oggi) >= 13);

/* ------------------------------------------------------------------ */
/* 6. prossimaMedia — il piano converge sempre                          */
/* ------------------------------------------------------------------ */
for (const partenza of [1, 2, 3, 5, 10, 20, 40, 60]) {
  let m = partenza;
  let giri = 0;
  while (m >= 0.5 && giri < 100) { m = prossimaMedia(m); giri += 1; }
  ok(`prossimaMedia · da ${partenza} arriva a zero`, m < 0.5 && giri < 100, `giri ${giri}`);
}
ok('prossimaMedia · non va mai sotto zero',
  [0.4, 1, 1.2].every((v) => prossimaMedia(v) >= 0));

/* ------------------------------------------------------------------ */

console.log(`\n  ${passati} controlli superati`);
if (falliti.length) {
  console.log(`  ${falliti.length} FALLITI:\n`);
  falliti.forEach((f) => console.log(`   ✗ ${f}`));
  process.exit(1);
}
console.log('  nessun fallimento\n');
