/* estensione esplicita: così questo file si può importare anche da Node
   "nudo", che è quello che fa verifica/controlli.mjs senza installare nulla */
import { addGiorni, maxTs } from './format.js';

/* ------------------------------------------------------------------ */
/*  SIGARETTE ARRETRATE                                                */
/*                                                                     */
/*  Capita di non aprire l'app per mezza giornata e di doversi segnare  */
/*  cinque sigarette in una volta. Il problema è che «cinque adesso»    */
/*  non è vero, e in questa app i timestamp non sono un dettaglio:      */
/*  ci vivono sopra l'intervallo medio fra una e l'altra, la fascia     */
/*  oraria in cui uno si frega, il confine fra ieri e oggi in           */
/*  classifica e il conto delle tappe del corpo. Cinque timestamp       */
/*  identici a mezzanotte meno cinque farebbero sembrare che uno abbia  */
/*  fumato cinque sigarette in un secondo, di notte.                    */
/*                                                                      */
/*  Quindi si chiede QUANDO, a grandi linee, e le sigarette vengono     */
/*  distribuite dentro quella finestra. Non è la verità al minuto — non */
/*  ce l'ha nemmeno chi le ha fumate — ma è una ricostruzione onesta,   */
/*  e i numeri che ne escono restano leggibili.                         */
/* ------------------------------------------------------------------ */

const ORA = 3600000;

/* I confini si costruiscono con setHours e non sommando millisecondi:
   nei due giorni del cambio d'ora l'aritmetica sposta le fasce di
   un'ora, ed è lo stesso bug che aveva già colpito la classifica. */
const alle = (ts, h) => { const d = new Date(ts); d.setHours(h, 0, 0, 0); return d.getTime(); };

/* Le finestre proposte dipendono dall'ora: alle nove del mattino non ha
   senso offrire «stasera», e infatti non compare. Una finestra si vede
   solo se ha almeno un pezzo già passato. */
export function finestre(adesso = Date.now()) {
  const ieri = addGiorni(adesso, -1);
  const tutte = [
    { id: 'ora', testo: 'Nell\u2019ultima ora', breve: 'nell\u2019ultima ora', da: adesso - ORA, a: adesso },
    { id: 'mattina', testo: 'Stamattina', breve: 'stamattina', da: alle(adesso, 7), a: alle(adesso, 12) },
    { id: 'pomeriggio', testo: 'Nel pomeriggio', breve: 'nel pomeriggio', da: alle(adesso, 13), a: alle(adesso, 18) },
    { id: 'sera', testo: 'Stasera', breve: 'stasera', da: alle(adesso, 18), a: alle(adesso, 23) },
    { id: 'ieri', testo: 'Ieri', breve: 'ieri', da: alle(ieri, 8), a: alle(ieri, 23) },
  ];
  return tutte
    .map((f) => ({ ...f, a: Math.min(f.a, adesso) }))
    .filter((f) => f.a - f.da > 60000);
}

export const finestraDi = (id, adesso) => finestre(adesso).find((f) => f.id === id) || null;

/* Il primo istante libero a partire da `ts`, cercando alternativamente
   prima e dopo, e stringendo la grana quando la finestra è piena: prima i
   minuti, poi i secondi, poi i millisecondi. L'ultimo livello non fallisce
   mai — una finestra dura almeno un minuto, cioè 60.000 posti, e le
   sigarette sono al massimo cinquanta. */
function primoLibero(ts, presi, da, a) {
  for (const grana of [60000, 1000, 1]) {
    for (let k = 1; k <= 60000; k += 1) {
      const giu = ts - k * grana;
      const su = ts + k * grana;
      if (giu >= da && !presi.has(giu)) return giu;
      if (su <= a && !presi.has(su)) return su;
      if (giu < da && su > a) break;      // finestra esaurita a questa grana
    }
  }
  return ts;
}

/* Distribuisce `quante` sigarette dentro la finestra, a intervalli
   regolari e scostate dai bordi di mezzo passo — così due sigarette in
   cinque ore non finiscono una all'inizio esatto e una alla fine esatta.
   I minuti si arrotondano perché nel registro si legge l'ora, e i secondi
   lì dentro sarebbero solo rumore.

   DUE TIMESTAMP NON POSSONO MAI COINCIDERE, e prima potevano.
   `dati.tags` è indicizzato per timestamp, quindi un doppione fa
   condividere l'etichetta a due sigarette diverse — ma soprattutto
   `handleElimina` toglie dal registro per valore: con due sigarette allo
   stesso istante, un tocco sulla X ne cancellava due, e da lì in poi ogni
   conteggio era sbagliato senza modo di accorgersene.

   Il vecchio ciclo di riparazione poteva arrendersi e inserire comunque il
   doppione. Succedeva nelle finestre strette, che sono raggiungibili: alle
   07:03 «Stamattina» dura tre minuti, e venti sigarette dentro tre minuti
   producevano quattro istanti distinti su venti. Adesso la grana si adatta
   alla larghezza della finestra e `primoLibero` non si arrende. */
export function distribuisci(quante, finestra, esistenti = []) {
  const n = Math.max(1, Math.min(50, Math.round(quante)));
  const { da, a } = finestra;
  const passo = (a - da) / n;
  /* Al minuto tondo finché c'è spazio; sotto il minuto di distanza media
     si scende ai secondi, perché arrotondare al minuto significherebbe
     chiedere lo stesso istante più volte. */
  const grana = passo >= 60000 ? 60000 : 1000;
  const presi = new Set(esistenti);
  const fuori = [];

  for (let i = 0; i < n; i += 1) {
    const grezzo = da + passo * (i + 0.5);
    // il clamp evita anche il secondo effetto dell'arrotondamento: un
    // timestamp mezzo minuto NEL FUTURO, che rendeva negativo il numero
    // grande della Home («−1 min senza fumare»)
    let ts = Math.min(a, Math.max(da, Math.round(grezzo / grana) * grana));
    if (presi.has(ts)) ts = primoLibero(ts, presi, da, a);
    presi.add(ts);
    fuori.push(ts);
  }
  return fuori.sort((x, y) => x - y);
}

/* Le tappe del corpo (battito, ossigeno, gusto…) ripartono dall'ULTIMA
   sigaretta. Quindi vanno azzerate solo se fra quelle appena inserite ce
   n'è una più recente di tutte quelle già registrate.

   Detta al contrario: segnare adesso tre sigarette di ieri non deve
   cancellare le otto ore pulite che uno ha oggi. Sarebbe la punizione
   perfetta per chi è stato onesto, e la ragione migliore per non segnarle
   mai più. Sta qui e non dentro App.jsx proprio per poterla verificare. */
export function tappeDaRiavviare(cigsEsistenti, nuovi) {
  const precedente = maxTs(cigsEsistenti);
  const nuovoMax = maxTs(nuovi);
  if (nuovoMax === null) return null;
  return precedente === null || nuovoMax > precedente ? nuovoMax : null;
}
