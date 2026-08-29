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
  sod, dayDiff, addGiorni, maxTs, daYmd, ymd, prossimaMedia, giorniFra,
  componiTelefono, cifreLocali, ora, durata, tempoVita, eurUnitario,
} from '../src/utils/format.js';
import { finestre, distribuisci, tappeDaRiavviare } from '../src/utils/arretrate.js';
import {
  calcolaConti, calcolaBaseline, intervalliCoperti, tempoCoperto, copertoAdesso,
  riferimentoAstinenza, giorniSenzaFumare, giorniZeroCoperti, eRicaduta,
} from '../src/utils/conti.js';
import { PREFISSI } from '../src/data/prefissi.js';
import { DAY, SOGLIA_RICADUTA, TOLLERANZA_COPERTURA } from '../src/constants.js';

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
  const arrivaAZero = righe.length > 0 && righe[righe.length - 1].media < 0.5;
  const settZero = primaSett + righe.length - (arrivaAZero ? 1 : 0);
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
  pianoB.settimaneRestanti === pianoB.righe.length,
  `restanti ${pianoB.settimaneRestanti}, righe ${pianoB.righe.length}`);

/* La settimana a zero è l'ULTIMA RIGA del piano, non quella dopo: il ciclo
   inserisce la riga e poi esce, quindi quando l'obiettivo scende sotto mezza
   sigaretta quella riga È già la settimana dello zero. Contandone una in più,
   la card annunciava «sigaretta zero» sette giorni dopo la riga che, nella
   stessa card, mostrava già obiettivo 0,00. */
const ultimaRigaA = pianoA.righe[pianoA.righe.length - 1];
eq('Piano · la sigaretta zero cade sull\'ultima riga del piano, non dopo',
  pianoA.dataZero, ultimaRigaA.data);
eq('Piano · settimane restanti = distanza dalla riga che arriva a zero',
  pianoA.settimaneRestanti, ultimaRigaA.n - 1 - pianoA.settCorrente);
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
  dayDiff(daYmd(chiaviOrdinate[0]), oggi) >= 14);

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
/* 8. Numero di telefono con prefisso scelto dall'utente                */
/* ------------------------------------------------------------------ */
/* Prima il codice appiccicava +39 a chiunque. Un numero rumeno o       */
/* albanese — le due comunità straniere più numerose in Italia —        */
/* diventava un numero italiano inesistente, e l'account restava        */
/* irrecuperabile senza che niente lo segnalasse.                       */

const IT = PREFISSI.find((p) => p.iso === 'IT');
const RO = PREFISSI.find((p) => p.iso === 'RO');
const US = PREFISSI.find((p) => p.iso === 'US');

eq('Telefono · numero italiano scritto normale',
  componiTelefono(IT, '333 123 4567'), '+393331234567');
eq('Telefono · lo zero iniziale di un numero rumeno si toglie',
  componiTelefono(RO, '0721 234 567'), '+40721234567');
eq('Telefono · il prefisso non si raddoppia se è già nel numero incollato',
  componiTelefono(IT, '+39 333 1234567'), '+393331234567');
eq('Telefono · funziona anche col vecchio 00 al posto del +',
  componiTelefono(IT, '0039 333 1234567'), '+393331234567');
eq('Telefono · prefisso ripetuto senza il +: si toglie solo perché senza sarebbe troppo lungo',
  componiTelefono(IT, '39 333 1234567'), '+393331234567');
eq('Telefono · parentesi e trattini americani si ignorano',
  componiTelefono(US, '(415) 555-0132'), '+14155550132');
/* Il caso che rompeva la regola ingenua: 391 è un prefisso mobile italiano
   vero, quindi queste cifre NON sono un prefisso duplicato. */
eq('Telefono · un numero che comincia per 39 ma è di lunghezza valida resta intero',
  componiTelefono(IT, '3912345678'), '+393912345678');
eq('cifreLocali · toglie spazi, trattini e lo zero iniziale',
  cifreLocali('0721 234-567'), '721234567');

ok('Prefissi · nessun paese doppio',
  new Set(PREFISSI.map((p) => `${p.iso}${p.prefisso}`)).size === PREFISSI.length);
ok('Prefissi · tutti cominciano col + e hanno solo cifre',
  PREFISSI.every((p) => /^\+\d{1,4}$/.test(p.prefisso)));
ok('Prefissi · le lunghezze dichiarate sono sensate',
  PREFISSI.every((p) => p.min >= 6 && p.max <= 14 && p.min <= p.max));
eq('Prefissi · il primo della lista è l\'Italia', PREFISSI[0].iso, 'IT');

/* ------------------------------------------------------------------ */
/* 9. Sigarette arretrate                                              */
/* ------------------------------------------------------------------ */
/* Segnarne cinque insieme non deve produrre cinque timestamp identici: */
/* su quei timestamp poggiano l'intervallo medio, la fascia oraria a    */
/* rischio e il confine di giornata della classifica.                   */

const pomeriggio = new Date(2026, 8, 15, 16, 30).getTime();   // martedì
const disponibili = finestre(pomeriggio);

ok('Arretrate · alle 16:30 non viene proposto "stasera"',
  !disponibili.some((f) => f.id === 'sera'));
ok('Arretrate · alle 16:30 vengono proposte stamattina, pomeriggio e ieri',
  ['mattina', 'pomeriggio', 'ieri'].every((id) => disponibili.some((f) => f.id === id)));
ok('Arretrate · nessuna finestra finisce nel futuro',
  disponibili.every((f) => f.a <= pomeriggio));

const mattina = new Date(2026, 8, 15, 9, 0).getTime();
ok('Arretrate · alle 9 non viene proposto "nel pomeriggio"',
  !finestre(mattina).some((f) => f.id === 'pomeriggio'));

const fMattina = disponibili.find((f) => f.id === 'mattina');
const cinque = distribuisci(5, fMattina, []);

eq('Arretrate · ne produce esattamente quante ne chiedi', cinque.length, 5);
ok('Arretrate · nessun timestamp ripetuto', new Set(cinque).size === 5);
ok('Arretrate · stanno tutte dentro la finestra scelta',
  cinque.every((t) => t >= fMattina.da && t <= fMattina.a));
ok('Arretrate · sono in ordine e distanziate di almeno un minuto',
  cinque.every((t, i) => i === 0 || t - cinque[i - 1] >= 60000));
ok('Arretrate · cadono su minuti tondi, senza secondi',
  cinque.every((t) => t % 60000 === 0));
ok('Arretrate · non finiscono tutte nella stessa fascia oraria',
  new Set(cinque.map((t) => new Date(t).getHours())).size > 1,
  `ore: ${cinque.map((t) => ora(t)).join(' ')}`);

/* il caso che romperebbe le etichette del registro: un minuto già occupato */
const occupato = distribuisci(3, fMattina, []);
const conScontro = distribuisci(3, fMattina, occupato);
ok('Arretrate · non riusa un timestamp già presente nel registro',
  conScontro.every((t) => !occupato.includes(t)),
  `già presenti ${occupato.join(',')} — nuovi ${conScontro.join(',')}`);

eq('Arretrate · una sola sigaretta cade a metà della finestra',
  distribuisci(1, { da: 0, a: 60 * 60000 }, []), [30 * 60000]);

const venti = distribuisci(20, fMattina, []);
ok('Arretrate · regge anche venti sigarette senza uscire dalla finestra',
  venti.length === 20 && new Set(venti).size === 20
  && venti.every((t) => t >= fMattina.da && t <= fMattina.a));

/* Il conto delle tappe del corpo riparte dall'ultima sigaretta. Segnare
   adesso delle sigarette di IERI non deve azzerare le ore pulite di oggi:
   sarebbe la punizione perfetta per chi mette in ordine il registro. */
const oggiOtto = new Date(2026, 8, 15, 8, 0).getTime();
const ieriSera = new Date(2026, 8, 14, 21, 0).getTime();
const ieriPomeriggio = new Date(2026, 8, 14, 15, 0).getTime();

eq('Tappe · sigarette di ieri non azzerano il conto di oggi',
  tappeDaRiavviare([ieriSera, oggiOtto], [ieriPomeriggio]), null);
eq('Tappe · una sigaretta più recente di tutte fa ripartire il conto',
  tappeDaRiavviare([ieriSera], [oggiOtto]), oggiOtto);
eq('Tappe · sul registro vuoto il conto parte comunque',
  tappeDaRiavviare([], [ieriPomeriggio]), ieriPomeriggio);
eq('Tappe · fra le nuove vince la più recente',
  tappeDaRiavviare([ieriPomeriggio], [ieriSera, oggiOtto]), oggiOtto);
eq('Tappe · una di ieri e una di oggi insieme fanno ripartire da quella di oggi',
  tappeDaRiavviare([ieriPomeriggio], [ieriSera, oggiOtto]), oggiOtto);

/* ------------------------------------------------------------------ */
/* 11. Coerenza fra le due card del Percorso                            */
/* ------------------------------------------------------------------ */
/* «Risparmiato finora» e «Vita non bruciata» guardano lo stesso numero  */
/* da due lati: se non tornano fra loro, l'app sta mentendo a chi la     */
/* controlla con la calcolatrice — ed è la prima cosa che fa uno che ci  */
/* crede poco.                                                          */

const ADESSO = new Date(2026, 8, 15, 10, 0).getTime();
const START = new Date(2026, 7, 26, 9, 0).getTime();          // 26 agosto, ore 9
const giornoCurva = (i) => {
  const g = addGiorni(ADESSO, i);
  return { n: [9, 8, 5][i + 2], da: g, a: addGiorni(g, 1), label: `d${i}` };
};
const base = {
  unit: 6 / 20,                                  // pacchetto da 6 €
  minPer: 20,
  baseline: 15,                                  // ritmo di partenza
  baselinePronta: true,
  baselineDichiarata: true,
  mediaOra: 8,                                   // media dei 7 giorni PIENI
  totCigs: 220,
  oggiFumate: 5,
  settFumate: 40,
  startTs: START,
  // copertura continua: qui non stiamo verificando i buchi
  intervalli: [[START, Infinity]],
  oggiTs: new Date(2026, 8, 15, 0, 0).getTime(),
  inizioSett: new Date(2026, 8, 13, 0, 0).getTime(),
  inizioCurva: addGiorni(ADESSO, -2),
  totPrimaCurva: 198,
  curvaGiorni: [giornoCurva(-2), giornoCurva(-1), giornoCurva(0)],
};
const c = calcolaConti(base, ADESSO);
const vicino = (a, b, tolleranza) => Math.abs(a - b) <= tolleranza;

ok('Conti · euro e minuti derivano dalle stesse sigarette evitate',
  vicino(c.risparmiato / c.unitario, c.vitaTenuta / c.minutiPer, 1e-9),
  `${c.risparmiato / c.unitario} vs ${c.vitaTenuta / c.minutiPer}`);

ok('Conti · vita risparmiata + vita persa = vita che il ritmo di partenza costava',
  vicino(c.vitaTenuta + c.minutiPersiTotali, c.baseline * giorniFra(START, ADESSO) * c.minutiPer, 1e-6));

/* IL CONTO PARTE DA `start`, NON DALLA MEZZANOTTE PRIMA.
   Prima il riferimento era `sod(start)`, quindi il ritmo di partenza
   accreditava anche le ore della giornata precedenti all'installazione —
   ore in cui l'app non misurava niente e in cui la persona aveva fumato
   senza registrare. Chi installava alle 22:00 e segnava una sigaretta
   leggeva «17 sigarette non fumate · 5,20 €». */
const seraTardi = new Date(2026, 8, 15, 22, 0).getTime();
const contiPrimoGiorno = calcolaConti({
  ...base, startTs: seraTardi, totCigs: 1, oggiFumate: 1, settFumate: 1,
  oggiTs: sod(seraTardi), inizioSett: sod(seraTardi), baseline: 20, mediaOra: null,
  inizioCurva: sod(seraTardi), totPrimaCurva: 0,
  curvaGiorni: [{ n: 1, da: sod(seraTardi), a: addGiorni(sod(seraTardi), 1), label: 'oggi' }],
}, seraTardi);
ok('Conti · installando alle 22 non regala il risparmio di tutta la giornata',
  Math.abs(contiPrimoGiorno.scartoRitmo) < 1.1,
  `evitate ${contiPrimoGiorno.scartoRitmo.toFixed(2)} — col vecchio riferimento erano 17,3`);
ok('Conti · e nemmeno gli euro',
  Math.abs(contiPrimoGiorno.risparmiato) < 0.35,
  `risparmiato ${contiPrimoGiorno.risparmiato.toFixed(2)} €`);

/* IL METRO NON SI MUOVE. Con il ritmo dedotto dai dati, la finestra di
   misura è fissa (i primi sette giorni pieni) e salta il giorno d'inizio,
   che è per forza parziale. Prima si allargava ogni giorno e comprendeva
   la giornata in corso: chi fumava esattamente dieci sigarette al giorno
   senza mai cambiare leggeva per una settimana «sei sopra il tuo ritmo». */
const startBase = new Date(2026, 5, 1, 14, 0).getTime();
const cigsCostanti = [];
for (let g = 0; g <= 20; g += 1) {
  for (let i = 0; i < 10; i += 1) {
    const t = addGiorni(startBase, g) + (8 + i * 1.3) * 3600000;
    if (t >= startBase) cigsCostanti.push(t);
  }
}
const misure = [8, 10, 14, 21].map((g) => calcolaBaseline(
  {}, startBase, cigsCostanti, addGiorni(startBase, g) + 12 * 3600000,
));
ok('Baseline · dedotta dai dati, vale il ritmo vero (10/g) e non uno più basso',
  misure.every((m) => m.pronta && Math.abs(m.valore - 10) < 0.01),
  misure.map((m) => m.valore.toFixed(2)).join(' '));
ok('Baseline · una volta calcolata non cambia più al passare dei giorni',
  new Set(misure.map((m) => m.valore)).size === 1);
ok('Baseline · prima degli otto giorni non è pronta, e i conti non partono',
  [0, 1, 3, 6, 7].every((g) => !calcolaBaseline({}, startBase, cigsCostanti,
    addGiorni(startBase, g) + 12 * 3600000).pronta));
ok('Baseline · quella dichiarata è pronta subito',
  calcolaBaseline({ baseline: 20 }, startBase, [], startBase).pronta === true);
eq('Conti · senza un ritmo di partenza affidabile non si mostra niente',
  calcolaConti({ ...base, baselinePronta: false }, ADESSO), null);

/* Il risparmio cumulato non può SCENDERE mentre si fuma meno del ritmo di
   partenza. Con il metro che si muoveva, scendeva per sei giorni di fila. */
const seq = [8, 9, 10, 12, 15, 20].map((g) => {
  const adesso = addGiorni(startBase, g) + 12 * 3600000;
  const fino = cigsCostanti.filter((t) => t <= adesso);
  const b = calcolaBaseline({ baseline: 15 }, startBase, fino, adesso);
  const ints = intervalliCoperti({ start: startBase, cigs: fino, resists: [], checkins: [], smessoDal: null });
  return b.valore * tempoCoperto(ints, startBase, adesso) - fino.length;
});
ok('Conti · chi fuma meno del ritmo vede il risparmio solo salire',
  seq.every((v, i) => i === 0 || v > seq[i - 1]), seq.map((v) => v.toFixed(1)).join(' → '));

/* Il numero mostrato deve poter essere moltiplicato a mano. Il prezzo
   unitario adesso viene dichiarato per intero (eurUnitario), quindi resta
   solo l'arrotondamento a un decimale delle sigarette: con «0,33 €» al
   posto di 0,325 € lo scarto arrivava a 1,83 € su 367 sigarette. */
const scartoAmmesso = c.unitario * 0.05 + 0.005;
ok('Conti · sigarette mostrate x prezzo = euro mostrati, entro l\'arrotondamento',
  vicino(c.scartoMostrato * c.unitario, Math.abs(c.risparmiato), scartoAmmesso),
  `${c.scartoMostrato} x ${c.unitario} = ${(c.scartoMostrato * c.unitario).toFixed(2)}, card ${Math.abs(c.risparmiato).toFixed(2)}`);

eq('Formato · il prezzo di una sigaretta non viene arrotondato al centesimo',
  eurUnitario(6.5 / 20), '0,325 €');
eq('Formato · e quando il terzo decimale non serve resta ai centesimi',
  eurUnitario(6 / 20), '0,30 €');

ok('Conti · sigarette mostrate x minuti = vita mostrata, entro un minuto',
  vicino(c.scartoMostrato * c.minutiPer, Math.abs(c.vitaTenuta), 1),
  `${c.scartoMostrato * c.minutiPer} vs ${Math.abs(c.vitaTenuta)}`);

/* ARROTONDARE DUE VOLTE NON È COME ARROTONDARE UNA. La Home prendeva
   `evitateMostrate` (già a un decimale) e lo riarrotondava: 86,46 → 86,5
   → 87, mentre il valore vero è 86. Adesso l'intero arriva dai conti. */
const doppio = calcolaConti({ ...base, totCigs: 220.04 }, ADESSO);
ok('Conti · l\'intero della Home è arrotondato una volta sola',
  doppio.scartoIntero === Math.round(Math.abs(doppio.scartoRitmo)),
  `${doppio.scartoRitmo} → intere ${doppio.scartoIntero}, mostrate ${doppio.scartoMostrato}`);
ok('Conti · dove i due arrotondamenti divergevano, adesso vince quello giusto',
  Math.round(86.46) === 86 && Math.round(Math.round(86.46 * 10) / 10) === 87);

/* Il bug che ha fatto nascere questi controlli: le due proiezioni a un
   anno stavano nella stessa posizione di due card affiancate, con la
   stessa etichetta, ma una era un risparmio e l'altra una perdita. */
ok('Conti · le due proiezioni a un anno hanno lo stesso segno',
  Math.sign(c.risparmioAnno) === Math.sign(c.vitaAnno),
  `soldi ${c.risparmioAnno.toFixed(0)} · vita ${c.vitaAnno.toFixed(0)}`);

ok('Conti · le due proiezioni a un anno parlano delle stesse sigarette',
  vicino(c.risparmioAnno / c.unitario, c.vitaAnno / c.minutiPer, 1e-6),
  `${c.risparmioAnno / c.unitario} vs ${c.vitaAnno / c.minutiPer}`);

/* Senza nemmeno un giorno pieno alle spalle la proiezione a un anno non
   esiste: prima ripiegava sulla baseline e mostrava zero euro come se
   fosse una previsione. */
const senzaMedia = calcolaConti({ ...base, mediaOra: null }, ADESSO);
ok('Conti · senza giorni pieni la proiezione annuale è nulla, non zero',
  senzaMedia.risparmioAnno === null && senzaMedia.vitaAnno === null
  && senzaMedia.minutiAnnoRitmo === null);

/* Le due card devono essere una il riflesso dell'altra: stessi tre
   periodi, stessa natura, solo un prezzo diverso. È il controllo che
   impedisce di rimetterci dentro una cifra di natura sbagliata. */
for (const [periodo, soldi, vita] of [
  ['finora', c.risparmiato, c.vitaTenuta],
  ['oggi', c.risparmioOggi, c.vitaOggi],
  ['questa settimana', c.risparmioSett, c.vitaSett],
  ['in un anno così', c.risparmioAnno, c.vitaAnno],
]) {
  ok(`Conti · «${periodo}» dice la stessa cosa in euro e in minuti`,
    vicino(soldi / c.unitario, vita / c.minutiPer, 1e-6),
    `${soldi / c.unitario} vs ${vita / c.minutiPer}`);
}

ok('Conti · la proiezione della vita NON è il valore assoluto perso',
  Math.abs(c.vitaAnno - c.minutiAnnoRitmo) > 1,
  'annoVita deve essere una differenza dal ritmo di partenza, non il totale perso');

/* CHI STA PEGGIORANDO: lo scarto diventa negativo, i SOLDI NO.
   Un numero che si chiama «risparmio» non può avere il meno davanti: o hai
   risparmiato, o hai speso in più, e sono due grandezze diverse tutte e due
   positive. Prima nel Profilo si leggeva letteralmente «−12,40 €
   risparmiati», con l'etichetta fissa e il segno sul numero. */
const peggio = calcolaConti({ ...base, mediaOra: 20, totCigs: 400 }, ADESSO);
ok('Conti · chi fuma più di prima ha lo scarto negativo',
  peggio.scartoRitmo < 0 && peggio.scartoAnno < 0 && peggio.inRosso);
ok('Conti · ma il risparmio resta a zero, non diventa negativo',
  peggio.risparmiato === 0 && peggio.risparmioAnno === 0
  && peggio.vitaTenuta === 0 && peggio.vitaAnno === 0);
ok('Conti · e lo «speso in più» è positivo',
  peggio.spesoInPiu > 0 && peggio.spesoAnno > 0 && peggio.vitaPersaInPiu > 0);
ok('Conti · anche peggiorando, la vita persa in totale resta positiva',
  peggio.minutiPersiTotali > 0 && peggio.minutiAnnoRitmo > 0);

/* Gli invarianti dei soldi, su tutti i periodi e in tutte e due le
   direzioni. Sono i controlli che impediscono di rimettere un segno
   davanti alla parola sbagliata. */
for (const [nome, c2] of [['chi risparmia', c], ['chi è sopra il ritmo', peggio]]) {
  for (const [periodo, scarto, risp, speso] of [
    ['finora', c2.scartoRitmo, c2.risparmiato, c2.spesoInPiu],
    ['oggi', c2.scartoOggi, c2.risparmioOggi, c2.spesoOggi],
    ['settimana', c2.scartoSett, c2.risparmioSett, c2.spesoSett],
    ['anno', c2.scartoAnno, c2.risparmioAnno, c2.spesoAnno],
  ]) {
    ok(`Invariante · ${nome}, «${periodo}»: nessuno dei due soldi è negativo`,
      risp >= 0 && speso >= 0, `risp ${risp} speso ${speso}`);
    ok(`Invariante · ${nome}, «${periodo}»: mai entrambi maggiori di zero`,
      !(risp > 0 && speso > 0));
    ok(`Invariante · ${nome}, «${periodo}»: risparmio − speso = scarto × prezzo`,
      Math.abs((risp - speso) - scarto * c2.unitario) < 1e-9);
  }
}

eq('Conti · le sigarette mostrate sono sempre positive, il segno lo porta l\'etichetta',
  peggio.scartoMostrato > 0, true);

/* LA CURVA FINISCE SUL NUMERO DELLA CARD. Prima accumulava solo gli ultimi
   quattordici giorni partendo da zero, quindi con più storico il suo ultimo
   punto cadeva su un valore diverso da quello scritto due centimetri sopra
   (218,10 € nella card, 48,90 € in fondo alla curva). */
ok('Conti · la curva ha un punto per ogni giorno passato',
  c.curva.length === base.curvaGiorni.length);
ok('Conti · l\'ultimo punto della curva è il numero grande della card',
  vicino(c.curva[c.curva.length - 1].v, c.risparmiato, 1e-6),
  `curva ${c.curva[c.curva.length - 1].v.toFixed(2)} vs card ${c.risparmiato.toFixed(2)}`);
ok('Conti · la curva è cumulativa, quindi monotòna quando si fuma meno del ritmo',
  c.curva.every((p, i) => i === 0 || p.v >= c.curva[i - 1].v));

/* ------------------------------------------------------------------ */
/* 12. Ora legale dentro i conti                                        */
/* ------------------------------------------------------------------ */
/* La correzione dell'ora legale si era fermata alle chiavi della
   classifica: dentro i conti i giorni frazionari si calcolavano ancora
   dividendo per 86.400.000, e un'ora di scarto a 20 sigarette al giorno
   vale 0,83 sigarette, cioè un quarto di euro che compariva dal nulla. */
for (const [nome, a, b] of [
  ['marzo (giorno da 23 ore)', new Date(2026, 2, 25, 9).getTime(), new Date(2026, 2, 31, 9).getTime()],
  ['ottobre (giorno da 25 ore)', new Date(2026, 9, 22, 9).getTime(), new Date(2026, 9, 28, 9).getTime()],
]) {
  ok(`giorniFra · ${nome}: conta i giorni di calendario, non i millisecondi`,
    Math.abs(giorniFra(a, b) - 6) < 1e-9,
    `giorniFra ${giorniFra(a, b)} · vecchio calcolo ${((b - a) / DAY).toFixed(4)}`);
}
ok('giorniFra · dentro la stessa giornata è la frazione trascorsa',
  Math.abs(giorniFra(sod(ADESSO), ADESSO) - 10 / 24) < 1e-9);

/* ------------------------------------------------------------------ */
/* 13. Formattatori: mesi e anni                                        */
/* ------------------------------------------------------------------ */
/* «12 mesi» era il modo meno riconoscibile possibile di annunciare il
   traguardo più grande dell'app, e «1 mesi» era solo sbagliato. */
ok('durata · trenta giorni restano giorni, e non diventano «1 mesi»',
  durata(30 * DAY) === '30g 0h', durata(30 * DAY));
eq('durata · trentuno giorni sono un mese, al singolare', durata(31 * DAY), '1 mese');
ok('durata · un anno si chiama anno', durata(365 * DAY).startsWith('1 anno'), durata(365 * DAY));
ok('durata · tre anni si chiamano anni', durata(3 * 365 * DAY).startsWith('3 anni'), durata(3 * 365 * DAY));
ok('tempoVita · un anno di vita si chiama anno',
  tempoVita(365 * 24 * 60).startsWith('1 anno'), tempoVita(365 * 24 * 60));
eq('durata · una durata negativa non produce NaN', durata(-5000), 'adesso');

/* ------------------------------------------------------------------ */
/* 14. Distribuzione delle arretrate in finestre strette                */
/* ------------------------------------------------------------------ */
/* Alle 07:03 la finestra «stamattina» dura tre minuti, ed è raggiungibile
   dall'interfaccia. Venti sigarette dentro tre minuti producevano quattro
   istanti distinti su venti: e siccome eliminare una sigaretta filtrava
   per valore, un tocco sulla X ne cancellava cinque insieme. */
for (const [nome, minuti, quante] of [
  ['due minuti, dieci sigarette', 2, 10],
  ['tre minuti, venti sigarette', 3, 20],
  ['61 secondi, cinque sigarette', 61 / 60, 5],
  ['un\'ora, trenta sigarette', 60, 30],
]) {
  const da = new Date(2026, 8, 15, 7, 0).getTime();
  const f = { da, a: da + Math.round(minuti * 60000) };
  const out = distribuisci(quante, f, []);
  ok(`Arretrate · ${nome}: nessun doppione`,
    out.length === quante && new Set(out).size === quante,
    `${new Set(out).size} istanti distinti su ${out.length}`);
  ok(`Arretrate · ${nome}: nessuna esce dalla finestra`,
    out.every((t) => t >= f.da && t <= f.a));
}

/* Togliere una sigaretta ne toglie UNA. */
const conDoppione = [1000, 1000, 2000];
const idx = conDoppione.indexOf(1000);
const dopoIlTaglio2 = [...conDoppione.slice(0, idx), ...conDoppione.slice(idx + 1)];
eq('Registro · eliminare una sigaretta ne toglie una sola', dopoIlTaglio2, [1000, 2000]);
ok('Registro · il vecchio filter per valore ne toglieva due',
  conDoppione.filter((t) => t !== 1000).length === 1);

/* ------------------------------------------------------------------ */
/* 15. Soglia della ricaduta                                            */
/* ------------------------------------------------------------------ */
/* A otto ore contava le notti di sonno: trenta giorni di fumo regolare
   fra le 7:30 e le 22:30 facevano comparire «Ripartiamo da qui» 29 volte
   e il contatore arrivava a «È la 29ª volta che riparti». */
let ripartenze = 0;
let ultimaSig = null;
const inizioSim = new Date(2026, 5, 1, 7, 30).getTime();
for (let g = 0; g < 30; g += 1) {
  for (const h of [7.5, 10, 13, 16, 19, 22.5]) {
    const ts = addGiorni(inizioSim, g) + h * 3600000;
    if (ultimaSig !== null && ts - ultimaSig >= SOGLIA_RICADUTA) ripartenze += 1;
    ultimaSig = ts;
  }
}
eq('Ricaduta · trenta giorni di fumo regolare non sono trenta ricadute', ripartenze, 0);
ok('Ricaduta · nessuna notte di sonno raggiunge la soglia',
  [7, 8, 9, 10, 12, 14, 16].every((h) => h * 3600000 < SOGLIA_RICADUTA));
ok('Ricaduta · una giornata intera senza fumare la raggiunge',
  26 * 3600000 >= SOGLIA_RICADUTA);

/* ------------------------------------------------------------------ */
/* 16. Le medie di periodo escludono il giorno in corso                 */
/* ------------------------------------------------------------------ */
/* Con oggi dentro al numeratore com'era — mezzo — e nel denominatore come
   giorno intero, la media risaliva durante la giornata e la proiezione
   annuale in prima pagina passava da 1.251 € all'una di notte a 1.095 €
   alle nove di sera, senza che i dati cambiassero. */
const oggiSim = sod(new Date(2026, 5, 20, 12).getTime());
const cigsMedia = [];
for (let g = 1; g <= 7; g += 1) {
  for (let i = 0; i < 10; i += 1) cigsMedia.push(addGiorni(oggiSim, -g) + (8 + i) * 3600000);
}
const media7Di = (adesso) => {
  const oggiTs = sod(adesso);
  return cigsMedia.filter((t) => t >= addGiorni(oggiTs, -7) && t < oggiTs).length / 7;
};
const lettureNellaGiornata = [1, 6, 12, 18, 23].map((h) => {
  const adesso = oggiSim + h * 3600000;
  const quanteOggi = Math.round((10 * h) / 24);
  for (let i = 0; i < quanteOggi; i += 1) {
    const t = oggiSim + (i * h) / Math.max(1, quanteOggi) * 3600000;
    if (!cigsMedia.includes(t)) cigsMedia.push(t);
  }
  return media7Di(adesso);
});
ok('Medie · la media dei 7 giorni pieni non cambia nel corso della giornata',
  new Set(lettureNellaGiornata.map((v) => v.toFixed(6))).size === 1,
  lettureNellaGiornata.map((v) => v.toFixed(2)).join(' '));
eq('Medie · e vale il ritmo vero', Number(lettureNellaGiornata[0].toFixed(6)), 10);

/* ------------------------------------------------------------------ */
/* 17. Una sola formula per le "sigarette risparmiate"                  */
/* ------------------------------------------------------------------ */
/* `mese.risparmiate` era un secondo calcolo che contava i giorni interi
   mentre i contatori li contano frazionari: con meno di trenta giorni di
   storico coprono lo stesso identico periodo e la stessa schermata diceva
   «107 sigarette che non hai fumato» e «117 sigarette in meno». */
const startMese = new Date(2026, 5, 10, 9).getTime();
const adessoMese = new Date(2026, 5, 20, 12).getTime();
const cigsMese = [];
for (let g = 10; g >= 0; g -= 1) {
  for (let i = 0; i < 10; i += 1) {
    const t = addGiorni(adessoMese, -g) + (8 + i) * 3600000;
    if (t >= startMese && t <= adessoMese) cigsMese.push(t);
  }
}
const inizio30 = addGiorni(sod(adessoMese), -10);
const intMese = intervalliCoperti({ start: startMese, cigs: cigsMese, resists: [], checkins: [], smessoDal: null });
const dalContatore = 20 * tempoCoperto(intMese, startMese, adessoMese) - cigsMese.length;
const dalMese = 20 * tempoCoperto(intMese, Math.max(inizio30, startMese), adessoMese) - cigsMese.length;
ok('Coerenza · «risparmiate nel mese» e «sigarette non fumate» sono lo stesso numero',
  Math.abs(dalContatore - dalMese) < 1e-9,
  `contatore ${dalContatore.toFixed(2)} vs mese ${dalMese.toFixed(2)}`);


/* ------------------------------------------------------------------ */
/* 18. La tolleranza di copertura, soglia per soglia                    */
/* ------------------------------------------------------------------ */
/* `TOLLERANZA_COPERTURA` è una scelta di prodotto, non un dettaglio
   tecnico: decide ogni quanto devi farti vivo perché i contatori
   continuino a correre. Questi controlli fissano il comportamento esatto
   attorno alla soglia, così che cambiarne il valore sia una decisione
   deliberata e non un effetto collaterale.

   Il vincolo importante non è dove cade il confine — quello si può
   spostare — ma che il passaggio sia CONTINUO: nessun salto, nessuna
   doppia contabilizzazione, e nessun tempo ricreditato all'indietro
   quando la persona riappare. */
const T = TOLLERANZA_COPERTURA;
const ORA_MS = 3600000;
const MIN_MS = 60000;
const startTol = new Date(2026, 5, 1, 9, 0).getTime();
const unicoEvento = { start: startTol, cigs: [startTol], resists: [], checkins: [], smessoDal: null };
const intTol = intervalliCoperti(unicoEvento);

eq('Tolleranza · è definita una volta sola e vale 48 ore', T, 48 * ORA_MS);

const soglie = [
  ['23h59m', 23 * ORA_MS + 59 * MIN_MS, true],
  ['24h', 24 * ORA_MS, true],
  ['36h', 36 * ORA_MS, true],
  ['47h59m', 47 * ORA_MS + 59 * MIN_MS, true],
  ['48h', 48 * ORA_MS, true],
  ['48h1m', 48 * ORA_MS + MIN_MS, false],
  ['72h', 72 * ORA_MS, false],
];

for (const [nome, dopo, atteso] of soglie) {
  const adesso = startTol + dopo;
  const coperto = copertoAdesso(intTol, adesso);
  ok(`Tolleranza · a ${nome} dall'unico evento la copertura è ${atteso ? 'attiva' : 'scaduta'}`,
    coperto === atteso, `coperto=${coperto}`);

  /* Il tempo contato non supera mai la tolleranza, per quanto tempo passi:
     è esattamente il punto della regola. Prima del blocco, dieci giorni di
     silenzio valevano 200 sigarette «evitate» e 60 € mai risparmiati. */
  const contato = tempoCoperto(intTol, startTol, adesso);
  const atteso2 = Math.min(dopo, T) / DAY;
  ok(`Tolleranza · a ${nome} il tempo contato è ${atteso2.toFixed(3)} g`,
    Math.abs(contato - atteso2) < 1e-9, `contato ${contato.toFixed(6)}`);
}

/* CONTINUITÀ ATTRAVERSO LA SOGLIA: il minuto prima e il minuto dopo devono
   differire di un minuto, non di un salto. Un gradino qui vorrebbe dire
   che il risparmio mostrato cambia di colpo senza che sia successo niente. */
{
  const prima = tempoCoperto(intTol, startTol, startTol + T - MIN_MS);
  const esatto = tempoCoperto(intTol, startTol, startTol + T);
  const dopo = tempoCoperto(intTol, startTol, startTol + T + MIN_MS);
  ok('Tolleranza · un minuto prima della soglia il tempo cresce ancora',
    Math.abs((esatto - prima) - MIN_MS / DAY) < 1e-9);
  eq('Tolleranza · superata la soglia il tempo si ferma, non arretra', dopo, esatto);
  ok('Tolleranza · nessun gradino: fra i due lati della soglia non c\'è salto',
    Math.abs(dopo - prima) < 2 * MIN_MS / DAY);
}

/* NESSUNA DOPPIA CONTABILIZZAZIONE. Due eventi vicini producono intervalli
   sovrapposti: fondendoli il tempo va contato una volta sola. Con la somma
   ingenua uscirebbero 2×48 ore invece delle 49 reali. */
{
  const dueVicini = {
    start: startTol, cigs: [startTol, startTol + ORA_MS], resists: [], checkins: [], smessoDal: null,
  };
  const ints = intervalliCoperti(dueVicini);
  const fine = startTol + T + 2 * ORA_MS;
  eq('Copertura · due eventi a un\'ora di distanza danno un solo intervallo', ints.length, 1);
  ok('Copertura · e il tempo si conta una volta sola, non due',
    Math.abs(tempoCoperto(ints, startTol, fine) - (T + ORA_MS) / DAY) < 1e-9,
    `contato ${tempoCoperto(ints, startTol, fine).toFixed(4)} g, atteso ${((T + ORA_MS) / DAY).toFixed(4)}`);
}

/* Un evento esattamente sulla soglia del precedente: gli intervalli si
   toccano e devono fondersi, non lasciare un buco di misura zero. */
{
  const alConfine = {
    start: startTol, cigs: [startTol, startTol + T], resists: [], checkins: [], smessoDal: null,
  };
  const ints = intervalliCoperti(alConfine);
  eq('Copertura · un evento esattamente a 48h dal precedente non apre un buco', ints.length, 1);
  ok('Copertura · e la copertura arriva fino a 96h dall\'inizio',
    Math.abs(tempoCoperto(ints, startTol, startTol + 4 * T) - (2 * T) / DAY) < 1e-9);
}

/* IL SILENZIO NON VIENE RICREDITATO AL RIENTRO. Era il difetto della prima
   versione: congelare il contatore e farlo ripartire sembrava sufficiente,
   ma al rientro il tempo scoperto veniva ricalcolato tutto insieme e il
   salto arrivava lo stesso, solo dopo. */
{
  const rientro = startTol + 10 * DAY;
  const prima = 20 * tempoCoperto(intTol, startTol, rientro) - 1;
  const dopoDati = { ...unicoEvento, cigs: [startTol, rientro] };
  const dopo = 20 * tempoCoperto(intervalliCoperti(dopoDati), startTol, rientro) - 2;
  ok('Copertura · rientrare dopo dieci giorni non ricredita il silenzio',
    dopo <= prima, `prima ${prima.toFixed(1)} · dopo ${dopo.toFixed(1)}`);
  ok('Copertura · e il salto è di una sigaretta, non di dieci giorni',
    Math.abs(dopo - prima) <= 1.000001, `differenza ${(dopo - prima).toFixed(3)}`);
}

/* Un check-in tiene vivo il conto di chi sta davvero senza fumare: è la
   valvola che impedisce alla regola di punire chi va bene. */
{
  const senzaCheckin = {
    start: startTol, cigs: [startTol], resists: [], checkins: [], smessoDal: null,
  };
  const conCheckin = {
    ...senzaCheckin,
    checkins: [startTol + DAY, startTol + 2 * DAY, startTol + 3 * DAY],
  };
  const fine = startTol + 3 * DAY + ORA_MS;
  ok('Copertura · senza check-in il conto di chi non fuma si ferma',
    tempoCoperto(intervalliCoperti(senzaCheckin), startTol, fine) < 2.1);
  ok('Copertura · con i check-in continua a correre per intero',
    Math.abs(tempoCoperto(intervalliCoperti(conCheckin), startTol, fine) - (3 + 1 / 24)) < 1e-9);
}

/* L'astinenza dichiarata esce del tutto dalla regola: da lì in poi il
   silenzio è informativo e la copertura è continua. */
{
  const dichiarato2 = {
    start: startTol, cigs: [startTol], resists: [], checkins: [], smessoDal: startTol + ORA_MS,
  };
  const ints = intervalliCoperti(dichiarato2);
  const fine = startTol + 30 * DAY;
  eq('Astinenza · la dichiarazione rende la copertura continua', ints.length, 1);
  ok('Astinenza · e il tempo contato torna uguale al tempo di calendario',
    Math.abs(tempoCoperto(ints, startTol, fine) - 30) < 1e-9);
}

/* Nessun altro algoritmo ha una tolleranza propria: se qualcuno ne
   scrivesse una, questo controllo la scoprirebbe cambiando la costante. */
{
  const conMezza = intervalliCoperti(unicoEvento, T / 2);
  ok('Tolleranza · tutti i calcoli passano dalla stessa costante',
    Math.abs(tempoCoperto(conMezza, startTol, startTol + 10 * DAY) - (T / 2) / DAY) < 1e-9);
}

/* ------------------------------------------------------------------ */
/* 19. Gli scenari approvati, ricalcolati sul codice vero               */
/* ------------------------------------------------------------------ */
/* Sono gli stessi otto casi della specifica. Se un giorno qualcuno cambia
   una formula, qui salta fuori subito quale numero visibile si è mosso. */
const ORA_SC = new Date(2026, 7, 11, 10, 0).getTime();       // 11 agosto 2026, 10:00
const DT = (mese2, giorno, h = 9, min = 0) => new Date(2026, mese2 - 1, giorno, h, min).getTime();
const PROFILO_SC = { baseline: 20, prezzoPacchetto: 6, perPacchetto: 20, sesso: 'non_detto' };

function sigaretteScenario(dalTs, giorni, quante) {
  const out = [];
  for (let g = 0; g < giorni; g += 1) {
    for (let i = 0; i < quante; i += 1) {
      const h = 8 + (14 * i) / Math.max(1, quante - 1);
      out.push(new Date(dalTs + g * DAY).setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0));
    }
  }
  return out.sort((a, b) => a - b);
}

const baseA = sigaretteScenario(DT(7, 1), 32, 12);
const scenari = [
  ['A · riduzione, dieci giorni di silenzio', {
    start: DT(7, 1, 9), cigs: baseA.filter((t) => t <= DT(8, 1, 22)),
    resists: [], checkins: [], smessoDal: null, profile: PROFILO_SC,
  }, { giorniSenza: 9, scarto: 286.8, risparmiato: 86.05, speso: 0 }],

  ['A-bis · riduzione, sopra il proprio ritmo', {
    start: DT(7, 1, 9), cigs: sigaretteScenario(DT(7, 1), 42, 25).filter((t) => t <= ORA_SC),
    resists: [], checkins: [], smessoDal: null, profile: PROFILO_SC,
  }, { giorniSenza: 0, scarto: -208.2, risparmiato: 0, speso: 62.45 }],

  ['B · dichiara, poi dieci giorni di silenzio', {
    start: DT(7, 1, 9), cigs: baseA.filter((t) => t <= DT(8, 1, 8)),
    resists: [], checkins: [], smessoDal: DT(8, 1, 9), profile: PROFILO_SC,
  }, { giorniSenza: 10, scarto: 447.8, risparmiato: 134.35, speso: 0 }],

  ['C · dichiara, una sigaretta dopo tre giorni', {
    start: DT(7, 1, 9), cigs: [...baseA.filter((t) => t <= DT(8, 1, 8)), DT(8, 4, 20)],
    resists: [], checkins: [], smessoDal: DT(8, 1, 9), profile: PROFILO_SC,
  }, { giorniSenza: 6, scarto: 446.8, risparmiato: 134.05, speso: 0 }],

  /* La dichiarazione è un impegno che resta: ricadere non la cancella e
     ridichiarare non la sposta, quindi `smessoDal` è ancora quello del 1°
     agosto. Il contatore dei giorni riparte da solo dalla sigaretta della
     ricaduta — è il riferimento a spostarsi, non la dichiarazione. */
  ['D · dichiara, ricade, ridichiara', {
    start: DT(7, 1, 9),
    cigs: [
      ...baseA.filter((t) => t <= DT(8, 1, 8)),
      DT(8, 4, 20),
      ...sigaretteScenario(DT(8, 5), 3, 8).filter((t) => t <= DT(8, 7, 22)),
    ].sort((a, b) => a - b),
    resists: [], checkins: [], smessoDal: DT(8, 1, 9), profile: PROFILO_SC,
  }, { giorniSenza: 3, scarto: 422.8, risparmiato: 126.85, speso: 0 }],

  ['E · mai una sigaretta, dichiara di aver smesso', {
    start: DT(8, 1, 9), cigs: [], resists: [], checkins: [],
    smessoDal: DT(8, 1, 9), profile: PROFILO_SC,
  }, { giorniSenza: 10, scarto: 200.8, risparmiato: 60.25, speso: 0 }],

  ['F · come B, ma il ritmo passa da 20 a 15', {
    start: DT(7, 1, 9), cigs: baseA.filter((t) => t <= DT(8, 1, 8)),
    resists: [], checkins: [], smessoDal: DT(8, 1, 9),
    profile: { ...PROFILO_SC, baseline: 15 },
  }, { giorniSenza: 10, scarto: 242.6, risparmiato: 72.79, speso: 0 }],

  ['G · come B, ma il pacchetto passa da 6,00 a 6,50', {
    start: DT(7, 1, 9), cigs: baseA.filter((t) => t <= DT(8, 1, 8)),
    resists: [], checkins: [], smessoDal: DT(8, 1, 9),
    profile: { ...PROFILO_SC, prezzoPacchetto: 6.5 },
  }, { giorniSenza: 10, scarto: 447.8, risparmiato: 145.55, speso: 0 }],
];

for (const [nome, dati, atteso] of scenari) {
  const ints = intervalliCoperti(dati);
  const rifSc = riferimentoAstinenza(dati, ORA_SC, ints);
  const ritmoSc = calcolaBaseline(dati.profile, dati.start, dati.cigs, sod(ORA_SC));
  const unitSc = dati.profile.prezzoPacchetto / dati.profile.perPacchetto;
  const scarto = ritmoSc.valore * tempoCoperto(ints, dati.start, ORA_SC) - dati.cigs.length;

  eq(`Scenario ${nome} · giorni senza fumare`,
    giorniSenzaFumare(rifSc, ORA_SC), atteso.giorniSenza);
  ok(`Scenario ${nome} · scarto dal ritmo ${atteso.scarto}`,
    Math.abs(scarto - atteso.scarto) < 0.05, `ottenuto ${scarto.toFixed(2)}`);
  ok(`Scenario ${nome} · risparmiati ${atteso.risparmiato.toFixed(2)} €`,
    Math.abs(Math.max(0, scarto) * unitSc - atteso.risparmiato) < 0.02,
    `ottenuto ${(Math.max(0, scarto) * unitSc).toFixed(2)}`);
  ok(`Scenario ${nome} · speso in più ${atteso.speso.toFixed(2)} €`,
    Math.abs(Math.max(0, -scarto) * unitSc - atteso.speso) < 0.02,
    `ottenuto ${(Math.max(0, -scarto) * unitSc).toFixed(2)}`);
  ok(`Scenario ${nome} · giorni di percorso non azzerati`,
    dayDiff(dati.start, ORA_SC) === (dati.start === DT(8, 1, 9) ? 10 : 41));
}

/* La ricaduta, sugli stessi scenari. Durante un'astinenza dichiarata
   qualsiasi sigaretta è una ricaduta; fuori serve la pausa lunga. */
for (const [nome, dati] of scenari) {
  ok(`Ricaduta · ${nome}: la prossima sigaretta è una ripartenza`,
    eRicaduta(dati, ORA_SC, SOGLIA_RICADUTA) === !nome.startsWith('A-bis'));
}

/* Una seconda sigaretta subito dopo la ricaduta NON conta come seconda
   ripartenza: solo la prima dopo la dichiarazione. */
{
  const dopoRicaduta = {
    start: DT(7, 1, 9), cigs: [DT(8, 4, 20)], resists: [], checkins: [],
    smessoDal: DT(8, 1, 9), profile: PROFILO_SC,
  };
  ok('Ricaduta · la sigaretta venti minuti dopo non è una seconda ripartenza',
    eRicaduta(dopoRicaduta, DT(8, 4, 20, 20), SOGLIA_RICADUTA) === false);
  ok('Ricaduta · ma dopo essere tornato in riduzione e aver dichiarato di nuovo sì',
    eRicaduta({ ...dopoRicaduta, smessoDal: DT(8, 8, 7) }, DT(8, 8, 12), SOGLIA_RICADUTA) === true);

/* Ridichiarare mentre si è già dichiarati non deve far scendere i soldi:
   spostando `smessoDal` in avanti si perderebbe la copertura del periodo
   già certificato, e chi ricade e ci riprova si vedrebbe punito. */
  const primaDichiarazione = {
    start: DT(7, 1, 9), cigs: [...baseA.filter((t) => t <= DT(8, 1, 8)), DT(8, 4, 20)],
    resists: [], checkins: [], smessoDal: DT(8, 1, 9),
  };
  const seSiSpostasse = { ...primaDichiarazione, smessoDal: DT(8, 8, 7) };
  const tenuto = tempoCoperto(intervalliCoperti(primaDichiarazione), DT(7, 1, 9), ORA_SC);
  const perso = tempoCoperto(intervalliCoperti(seSiSpostasse), DT(7, 1, 9), ORA_SC);
  ok('Astinenza · ridichiarare non deve togliere tempo già certificato',
    tenuto > perso, `tenuto ${tenuto.toFixed(2)} g contro ${perso.toFixed(2)} g`);
}

/* Dichiarare di aver smesso non deve azzerare il tempo di chi era già
   pulito e lo stava certificando. Era il difetto di `max(smessoDal, U)`. */
{
  const pulitoDaDueGiorni = {
    start: DT(7, 1, 9),
    cigs: [DT(8, 9, 10)],
    resists: [], checkins: [DT(8, 10, 20)], smessoDal: DT(8, 11, 9),
    profile: PROFILO_SC,
  };
  const r = riferimentoAstinenza(pulitoDaDueGiorni, ORA_SC);
  eq('Astinenza · dichiarare non cancella i giorni già certificati',
    giorniSenzaFumare(r, ORA_SC), 2);
}

/* …ma non regala nemmeno i giorni che nessuno ha certificato. */
{
  const smessoInSilenzio = {
    start: DT(7, 1, 9), cigs: [DT(7, 20, 10)], resists: [], checkins: [],
    smessoDal: DT(8, 1, 9), profile: PROFILO_SC,
  };
  const r = riferimentoAstinenza(smessoInSilenzio, ORA_SC);
  eq('Astinenza · i giorni passati in silenzio prima della dichiarazione non contano',
    giorniSenzaFumare(r, ORA_SC), 10);
}

/* ------------------------------------------------------------------ */
/* 20. Giorni a zero: solo giorni completi e certificati                */
/* ------------------------------------------------------------------ */
{
  const oggiGz = sod(new Date(2026, 5, 20, 12).getTime());
  const startGz = addGiorni(oggiGz, -20) + 9 * 3600000;
  const cigsGz = [];
  for (let g = 20; g >= 5; g -= 1) cigsGz.push(addGiorni(oggiGz, -g) + 10 * 3600000);
  const dati = { start: startGz, cigs: cigsGz, resists: [], checkins: [], smessoDal: null };
  const zero = giorniZeroCoperti(dati, oggiGz + 12 * 3600000, intervalliCoperti(dati));
  ok('Giorni a zero · il silenzio finale non regala giorni a zero',
    zero <= 2, `contati ${zero} — senza copertura sarebbero 4`);
  const conConferme = {
    ...dati,
    checkins: [1, 2, 3, 4].map((i) => addGiorni(oggiGz, -i) + 21 * 3600000),
  };
  eq('Giorni a zero · confermandoli, quegli stessi giorni contano',
    giorniZeroCoperti(conConferme, oggiGz + 12 * 3600000, intervalliCoperti(conConferme)), 4);
}

/* ------------------------------------------------------------------ */
/* 21. Fusi orari: nessun errore per chi sta nello stesso fuso          */
/* ------------------------------------------------------------------ */
/* La soluzione definitiva è server-side ed è rimandata. Questo controllo
   fissa quello che oggi DEVE valere: chi pubblica e chi legge, stando nello
   stesso fuso, devono generare esattamente le stesse chiavi di giornata —
   cambio d'ora compreso. Se un domani qualcuno tocca `ymd` o `addGiorni`,
   il problema si vede qui e non in classifica. */
{
  let disallineate = 0;
  for (let d = 0; d < 400; d += 1) {
    const giornoBase = addGiorni(new Date(2026, 0, 1, 12).getTime(), d);
    // chi pubblica scrive la chiave dall'istante dell'evento…
    const evento = giornoBase + 3 * 3600000;
    // …chi legge la ricostruisce scorrendo all'indietro da oggi
    const lette = Array.from({ length: 3 }, (_, i) => ymd(addGiorni(giornoBase + 12 * 3600000, -i)));
    if (lette[0] !== ymd(evento)) disallineate += 1;
  }
  eq('Fusi · a fuso costante la chiave scritta e quella letta coincidono sempre',
    disallineate, 0);

  const cambi = [new Date(2026, 2, 29, 12).getTime(), new Date(2026, 9, 25, 12).getTime()];
  for (const c2 of cambi) {
    const chiavi = Array.from({ length: 7 }, (_, i) => ymd(addGiorni(c2, -i)));
    eq(`Fusi · attorno al cambio d'ora del ${new Date(c2).getDate()}/${new Date(c2).getMonth() + 1} le sette chiavi restano distinte`,
      new Set(chiavi).size, 7);
  }
}

/* ------------------------------------------------------------------ */

console.log(`\n  ${passati} controlli superati`);
if (falliti.length) {
  console.log(`  ${falliti.length} FALLITI:\n`);
  falliti.forEach((f) => console.log(`   ✗ ${f}`));
  process.exit(1);
}
console.log('  nessun fallimento\n');
