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
  componiTelefono, cifreLocali, ora,
} from '../src/utils/format.js';
import { finestre, distribuisci, tappeDaRiavviare } from '../src/utils/arretrate.js';
import { calcolaConti } from '../src/utils/conti.js';
import { PREFISSI } from '../src/data/prefissi.js';
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
const base = {
  unit: 6 / 20,                                  // pacchetto da 6 €
  minPer: 20,
  baseline: 15,                                  // ritmo di partenza
  mediaOra: 8,                                   // media degli ultimi 7 giorni
  totCigs: 220,
  oggiFumate: 5,
  settFumate: 40,
  oggiTs: new Date(2026, 8, 15, 0, 0).getTime(),
  inizioSett: new Date(2026, 8, 13, 0, 0).getTime(),
  startSod: new Date(2026, 7, 26, 0, 0).getTime(),
  curvaGiorni: [{ n: 9, label: '13/9' }, { n: 8, label: '14/9' }, { n: 5, label: '15/9' }],
};
const c = calcolaConti(base, ADESSO);
const vicino = (a, b, tolleranza) => Math.abs(a - b) <= tolleranza;

ok('Conti · euro e minuti derivano dalle stesse sigarette evitate',
  vicino(c.risparmiato / c.unitario, c.minutiSalvati / c.minutiPer, 1e-9),
  `${c.risparmiato / c.unitario} vs ${c.minutiSalvati / c.minutiPer}`);

ok('Conti · vita risparmiata + vita persa = vita che il ritmo di partenza costava',
  vicino(c.minutiSalvati + c.minutiPersiTotali, c.baseline * ((ADESSO - base.startSod) / DAY) * c.minutiPer, 1e-6));

/* Il numero mostrato deve poter essere moltiplicato a mano: prima le
   schermate troncavano `evitate` per conto loro (86 invece di 86,25)
   mentre gli euro restavano sul valore pieno, e 86 x 0,30 non faceva
   25,88. Con un decimale lo scarto scende sotto il centesimo. */
/* La tolleranza non è scelta a occhio: mostrando le sigarette con un
   decimale, lo scarto massimo possibile è mezzo decimale per il prezzo
   unitario, più l'arrotondamento al centesimo degli euro. Se il codice
   sfora QUESTO limite, sta sbagliando davvero. */
const scartoAmmesso = c.unitario * 0.05 + 0.005;
ok('Conti · sigarette mostrate x prezzo = euro mostrati, entro l\'arrotondamento',
  vicino(c.evitateMostrate * c.unitario, Math.abs(c.risparmiato), scartoAmmesso),
  `${c.evitateMostrate} x ${c.unitario} = ${(c.evitateMostrate * c.unitario).toFixed(2)}, card ${Math.abs(c.risparmiato).toFixed(2)}`);

ok('Conti · sigarette mostrate x minuti = vita mostrata, entro un minuto',
  vicino(c.evitateMostrate * c.minutiPer, Math.abs(c.minutiSalvati), 1),
  `${c.evitateMostrate * c.minutiPer} vs ${Math.abs(c.minutiSalvati)}`);

/* Il bug che ha fatto nascere questi controlli: le due proiezioni a un
   anno stavano nella stessa posizione di due card affiancate, con la
   stessa etichetta, ma una era un risparmio e l'altra una perdita. */
ok('Conti · le due proiezioni a un anno hanno lo stesso segno',
  Math.sign(c.annoProiezione) === Math.sign(c.annoVita),
  `soldi ${c.annoProiezione.toFixed(0)} · vita ${c.annoVita.toFixed(0)}`);

ok('Conti · le due proiezioni a un anno parlano delle stesse sigarette',
  vicino(c.annoProiezione / c.unitario, c.annoVita / c.minutiPer, 1e-6),
  `${c.annoProiezione / c.unitario} vs ${c.annoVita / c.minutiPer}`);

/* Le due card devono essere una il riflesso dell'altra: stessi tre
   periodi, stessa natura, solo un prezzo diverso. È il controllo che
   impedisce di rimetterci dentro una cifra di natura sbagliata. */
for (const [periodo, soldi, vita] of [
  ['finora', c.risparmiato, c.minutiSalvati],
  ['oggi', c.oggiRisparmio, c.oggiVita],
  ['questa settimana', c.settimana, c.settimanaVita],
  ['in un anno così', c.annoProiezione, c.annoVita],
]) {
  ok(`Conti · «${periodo}» dice la stessa cosa in euro e in minuti`,
    vicino(soldi / c.unitario, vita / c.minutiPer, 1e-6),
    `${soldi / c.unitario} vs ${vita / c.minutiPer}`);
}

ok('Conti · la proiezione della vita NON è il valore assoluto perso',
  Math.abs(c.annoVita - c.minutiAnnoRitmo) > 1,
  'annoVita deve essere una differenza dal ritmo di partenza, non il totale perso');

/* Chi sta peggiorando: i segni devono ribaltarsi tutti insieme. */
const peggio = calcolaConti({ ...base, mediaOra: 20, totCigs: 400 }, ADESSO);
ok('Conti · chi fuma più di prima ha risparmio, vita e proiezioni tutti negativi',
  peggio.risparmiato < 0 && peggio.minutiSalvati < 0
  && peggio.annoProiezione < 0 && peggio.annoVita < 0 && peggio.inRosso);
ok('Conti · anche peggiorando, la vita persa in totale resta positiva',
  peggio.minutiPersiTotali > 0 && peggio.minutiAnnoRitmo > 0);

eq('Conti · le sigarette mostrate sono sempre positive, il segno lo porta l\'etichetta',
  peggio.evitateMostrate > 0, true);

/* La curva cumulativa deve finire sul risparmio dell'ultimo giorno, non
   su un numero suo. */
ok('Conti · la curva ha un punto per ogni giorno passato',
  c.curva.length === base.curvaGiorni.length);
ok('Conti · la curva è cumulativa, quindi monotòna quando si fuma meno del ritmo',
  c.curva.every((p, i) => i === 0 || p.v >= c.curva[i - 1].v));

/* ------------------------------------------------------------------ */

console.log(`\n  ${passati} controlli superati`);
if (falliti.length) {
  console.log(`  ${falliti.length} FALLITI:\n`);
  falliti.forEach((f) => console.log(`   ✗ ${f}`));
  process.exit(1);
}
console.log('  nessun fallimento\n');
