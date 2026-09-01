import { giorniFra, dayDiff, addGiorni, sod, maxTs } from './format.js';
import { TOLLERANZA_COPERTURA, SOGLIA_RICADUTA, DAY } from '../constants.js';

/* ------------------------------------------------------------------ */
/*  IL MOTORE DEI NUMERI                                               */
/*                                                                     */
/*  Tutto quello che l'app mostra come cifra nasce qui. Sta fuori da    */
/*  App.jsx apposta: dentro un componente React non si può verificare,  */
/*  e questi sono i numeri su cui la gente decide se fidarsi.           */
/*                                                                     */
/*  TRE REGOLE, e prima erano violate tutte e tre.                      */
/*                                                                     */
/*  1. IL METRO NON SI MUOVE. Il ritmo di partenza si decide una volta  */
/*     e non si tocca più: ricalcolandolo ogni giorno sui dati che deve */
/*     misurare, finisce per misurare sé stesso. → calcolaBaseline      */
/*                                                                     */
/*  2. IL SILENZIO NON È UNO ZERO. Se per dieci giorni non si registra  */
/*     niente, non vuol dire che non si è fumato: vuol dire che non lo  */
/*     sappiamo. Il tempo non certificato non produce risparmio.        */
/*     → intervalliCoperti / tempoCoperto                               */
/*     L'eccezione è la dichiarazione esplicita di aver smesso: da lì   */
/*     in poi il silenzio diventa informativo, ed è la persona a doverci */
/*     dire se ricade. → smessoDal                                      */
/*                                                                     */
/*  3. UN NUMERO CHIAMATO «RISPARMIO» NON PUÒ ESSERE NEGATIVO. Lo       */
/*     scarto dal ritmo ha un segno, i soldi no: o hai risparmiato, o   */
/*     hai speso in più. → scartoRitmo / risparmiato / spesoInPiu       */
/* ------------------------------------------------------------------ */

/* ================================================================== */
/*  D1  ·  IL RITMO DI PARTENZA                                        */
/* ================================================================== */
/* Prima era: `profile.baseline || sigarette dei primi min(7, giorni)
   giorni / min(7, giorni)`, ricalcolato a ogni apertura. Due difetti che
   si sommavano: la finestra comprendeva il giorno in corso, ancora a
   metà, come se fosse pieno; e si allargava ogni giorno.

   Effetto misurato: una persona che fumava ESATTAMENTE dieci sigarette
   al giorno, senza mai cambiare, per sette giorni leggeva «sei 4,5
   sigarette sopra il ritmo da cui sei partito» e un risparmio di
   −1,35 €. L'ottavo giorno saltava a +0,60 €. E chi calava davvero da 20
   a 5 vedeva il risparmio cumulato SCENDERE per sei giorni di fila, che
   è aritmeticamente impossibile.

   Adesso: o il ritmo lo dichiara la persona (pronto subito), o si misura
   sui primi SETTE GIORNI PIENI — saltando il giorno d'inizio, che è per
   forza parziale — e da lì non cambia più, perché la finestra è fissa.
   Chi dichiara di aver smesso senza aver mai registrato una sigaretta
   non avrà mai dati da cui dedurlo: per quella persona il ritmo
   dichiarato è l'unica strada, e l'app glielo chiede. */
export const GIORNI_MISURA = 7;

export function calcolaBaseline(profile, start, cigs, adesso) {
  const dichiarata = Number(profile?.baseline);
  if (Number.isFinite(dichiarata) && dichiarata > 0) {
    return { valore: dichiarata, pronta: true, dichiarata: true, giorniMancanti: 0 };
  }
  if (!start) {
    return { valore: 0, pronta: false, dichiarata: false, giorniMancanti: GIORNI_MISURA + 1 };
  }
  const da = addGiorni(start, 1);
  const a = addGiorni(start, GIORNI_MISURA + 1);
  const passati = dayDiff(start, adesso);
  if (passati < GIORNI_MISURA + 1) {
    return {
      valore: 0, pronta: false, dichiarata: false, giorniMancanti: GIORNI_MISURA + 1 - passati,
    };
  }
  const n = (cigs || []).filter((t) => t >= da && t < a).length;
  return { valore: n / GIORNI_MISURA, pronta: n > 0, dichiarata: false, giorniMancanti: 0 };
}

/* ================================================================== */
/*  D2  ·  LA COPERTURA: fin dove sappiamo davvero cosa è successo     */
/* ================================================================== */
/* Ogni evento registrato — una sigaretta, una voglia superata, un
   check-in — certifica sé stesso e le TOLLERANZA_COPERTURA ore
   successive. Gli intervalli si fondono, e quello che resta scoperto
   resta scoperto per sempre.

   Perché «per sempre» e non «finché non riapri l'app»: la prima idea era
   congelare il conto e farlo ripartire al rientro, ma al rientro il
   tempo non coperto sarebbe stato ricalcolato tutto insieme e il salto
   sarebbe arrivato lo stesso, solo dopo. Verificato: dieci giorni di
   silenzio valevano 200 sigarette «evitate» e 60 € mai risparmiati.

   La dichiarazione di aver smesso aggiunge un intervallo aperto da quel
   momento in avanti: è quello che rende il silenzio informativo. Non
   copre all'indietro — chi dichiara oggi non certifica i dieci giorni di
   buio che ha alle spalle.

   Gli intervalli NON sono tagliati su `adesso`: così si calcolano una
   volta al giorno e restano validi mentre i contatori scorrono al
   secondo. Il taglio lo fa `tempoCoperto`. */
export function intervalliCoperti(dati, tolleranza = TOLLERANZA_COPERTURA) {
  if (!dati?.start) return [];
  const eventi = [
    dati.start,
    ...(dati.cigs || []),
    ...(dati.resists || []),
    ...(dati.checkins || []),
  ].filter((t) => Number.isFinite(t) && t >= dati.start);

  const grezzi = eventi.map((t) => [t, t + tolleranza]);
  if (Number.isFinite(dati.smessoDal)) grezzi.push([dati.smessoDal, Infinity]);
  grezzi.sort((a, b) => a[0] - b[0]);

  const uniti = [];
  for (const [da, a] of grezzi) {
    const ultimo = uniti[uniti.length - 1];
    if (ultimo && da <= ultimo[1]) { if (a > ultimo[1]) ultimo[1] = a; } else uniti.push([da, a]);
  }
  return uniti;
}

/* ================================================================== */
/*  D3  ·  IL TEMPO CONTATO                                            */
/* ================================================================== */
/* Giorni coperti dentro un intervallo, in giorni frazionari e con l'ora
   legale al posto giusto (giorniFra conta i giorni interi per calendario
   e le due code come frazione del giorno a cui appartengono).

   Invariante: 0 ≤ tempoContato ≤ giorniFra(start, adesso). L'uguaglianza
   vale su TUTTO il percorso solo se non ci sono buchi; dopo una
   dichiarazione, invece, il tratto [smessoDal, adesso] è coperto per
   intero sempre — quello che c'era prima resta com'era, perché la
   dichiarazione non copre all'indietro. */
export function tempoCoperto(intervalli, da, a) {
  let tot = 0;
  for (const [i0, i1] of intervalli) {
    const x = Math.max(i0, da);
    const y = Math.min(i1, a);
    if (y > x) tot += giorniFra(x, y);
  }
  return tot;
}

/* L'inizio del tratto di copertura che arriva fino a adesso — cioè da
   quando, senza interruzioni, sappiamo cosa è successo. null se in questo
   momento non siamo coperti. */
export function inizioCertificato(intervalli, adesso) {
  for (const [da, a] of intervalli) if (da <= adesso && adesso <= a) return da;
  return null;
}

export const copertoAdesso = (intervalli, adesso) => inizioCertificato(intervalli, adesso) !== null;

/* ================================================================== */
/*  D4  ·  IL RIFERIMENTO DELL'ASTINENZA                               */
/* ================================================================== */
/* Da quando dura il periodo senza fumare che stiamo mostrando.

   È l'ultima sigaretta registrata, ma non può essere più indietro
   dell'inizio del tratto certificato: chi ha smesso il 20 luglio senza
   dirlo a nessuno e lo dichiara il 1° agosto non ha dodici giorni da
   rivendicare, perché in mezzo l'app non sapeva niente. Chi invece ha
   registrato o confermato ogni giorno tiene tutto il suo tempo, e
   dichiarare di aver smesso non lo rimanda a zero.

   Senza nemmeno una sigaretta registrata (chi dichiara di aver smesso
   partendo da fermo) il riferimento è la dichiarazione stessa. */
export function riferimentoAstinenza(dati, adesso, intervalli) {
  if (!dati?.start) return null;
  const ints = intervalli || intervalliCoperti(dati);
  const ultima = maxTs(dati.cigs);
  const certificato = inizioCertificato(ints, adesso);
  if (ultima === null && certificato === null) return null;
  if (ultima === null) return certificato;
  if (certificato === null) return ultima;
  return Math.max(ultima, certificato);
}

/* ================================================================== */
/*  D5  ·  GIORNI SENZA FUMARE                                         */
/* ================================================================== */
/* TEMPO TRASCORSO in blocchi di 24 ore, non giorni di calendario. È la
   stessa grandezza che alimenta il numero grande della Home, le tappe del
   corpo e il record, quindi non possono contraddirsi.
   Volutamente diversa da `giorniPercorso` (D6), che è di calendario e non
   torna mai indietro. */
export function giorniSenzaFumare(rif, adesso) {
  if (rif === null || rif === undefined || !Number.isFinite(rif)) return null;
  return Math.floor(Math.max(0, adesso - rif) / DAY);
}

/* ================================================================== */
/*  D6  ·  GIORNI DI PERCORSO                                          */
/* ================================================================== */
/* Giorni di CALENDARIO dall'inizio del percorso. Unità volutamente
   diversa da D5: uno è tempo trascorso, l'altro sono giorni sul
   calendario. NON si azzera mai, nemmeno dopo una ricaduta — è il numero
   su cui cresce la pianta.
   Stava scritto a mano dentro App.jsx: da qui in poi lo calcola questa
   funzione, così l'invariante «non torna indietro» si può verificare. */
export function giorniPercorso(dati, adesso) {
  if (!dati?.start || !Number.isFinite(dati.start)) return 0;
  return Math.max(0, dayDiff(dati.start, adesso));
}

export const inAstinenzaDichiarata = (dati) => Number.isFinite(dati?.smessoDal);

/* ================================================================== */
/*  D8  ·  LA RICADUTA                                                 */
/* ================================================================== */
/* Durante un'astinenza dichiarata QUALSIASI sigaretta è una ricaduta,
   anche a tre ore dalla precedente. Fuori dall'astinenza serve una pausa
   che una notte di sonno non possa raggiungere: a otto ore contava i
   risvegli, e in trenta giorni di fumo regolare fra le 7:30 e le 22:30
   il contatore arrivava a «è la 29ª volta che riparti».

   La seconda condizione evita di contarne un'altra venti minuti dopo:
   solo la PRIMA sigaretta dopo la dichiarazione è la ricaduta. */
export function eRicaduta(dati, ts, soglia = SOGLIA_RICADUTA) {
  const precedente = maxTs(dati?.cigs);
  const dich = Number.isFinite(dati?.smessoDal) ? dati.smessoDal : null;
  const primaDopoLaDichiarazione = dich !== null && (precedente === null || precedente < dich);
  const pausaLunga = precedente !== null && ts - precedente >= soglia;
  return primaDopoLaDichiarazione || pausaLunga;
}

/* Le SIGARETTE ARRETRATE durante un'astinenza dichiarata.

   La regola dice che durante un'astinenza dichiarata qualsiasi sigaretta
   registrata è una ricaduta, e le arretrate non facevano eccezione a
   parole ma la facevano nei fatti: `registraArretrate` non passava da
   `eRicaduta`, quindi chi dichiarava di aver smesso e poi metteva in
   ordine il registro segnando tre sigarette di ieri vedeva ripartire il
   contatore dei giorni — perché il riferimento si sposta da solo — ma
   `ripartenze` restava fermo. Due numeri che raccontavano due storie.

   Qui NON si usa `eRicaduta` così com'è: la sua seconda condizione (la
   pausa lunga) scatterebbe anche fuori dall'astinenza, e mettere in
   ordine il registro non è ricadere. Conta solo la prima sigaretta che
   cade dopo la dichiarazione. */
export function ricadutaArretrate(dati, nuovi) {
  const dich = Number.isFinite(dati?.smessoDal) ? dati.smessoDal : null;
  if (dich === null) return false;
  const giaDopo = (dati?.cigs || []).some((t) => Number.isFinite(t) && t >= dich);
  if (giaDopo) return false;
  return (nuovi || []).some((t) => Number.isFinite(t) && t >= dich);
}

/* ================================================================== */
/*  D10 ·  GIORNI A ZERO (solo in fase di riduzione)                   */
/* ================================================================== */
/* Un giorno conta come «a zero» se è COMPLETO (oggi non è finito, quindi
   non partecipa), INTERAMENTE COPERTO e senza sigarette registrate.
   Senza la condizione di copertura, sparire dall'app era il modo più
   veloce per collezionare giorni a zero.

   In astinenza dichiarata questa statistica non si mostra: al suo posto
   va `giorniSenzaFumare`, che è più preciso e non ha il tetto della
   finestra di trenta giorni. */
export function giorniZeroCoperti(dati, adesso, intervalli, finestra = 30) {
  if (!dati?.start) return 0;
  const ints = intervalli || intervalliCoperti(dati);
  /* `dati.cigs` può non esserci: il registro arriva da fuori (storage, e un
     domani da un backup JSON reimportato) e qui dentro si passa anche da
     `mese`, che non lo ripulisce. Senza questa riga bastava una chiave
     mancante per far esplodere l'intera schermata dei Numeri. */
  const cigs = Array.isArray(dati.cigs) ? dati.cigs : [];
  const oggiTs = sod(adesso);
  const n = Math.min(finestra, dayDiff(dati.start, adesso));
  let zero = 0;
  for (let i = 1; i <= n; i += 1) {
    const g = addGiorni(oggiTs, -i);
    const fine = addGiorni(g, 1);
    const tuttoCoperto = ints.some(([da, a]) => da <= g && a >= fine);
    if (!tuttoCoperto) continue;
    if (!cigs.some((t) => t >= g && t < fine)) zero += 1;
  }
  return zero;
}

/* ================================================================== */
/*  D12 ·  IL RECORD SENZA FUMARE                                      */
/* ================================================================== */
/* «Assenza di dati ≠ zero» valeva per i contatori e per i giorni a
   zero, non qui: il record scorreva le sigarette due a due e prendeva
   la distanza più grande, senza chiedersi cosa fosse successo in mezzo.

   Chi spariva per dieci giorni e poi registrava una sigaretta si vedeva
   assegnare un record di dieci giorni senza fumare — dieci giorni in cui
   l'app non sapeva niente, ed è la stessa identica cosa che la copertura
   esiste per non pagare. Ed è peggio che nei contatori: un record resta
   scritto, diventa il numero da battere, e sta accanto a «il tuo record
   senza fumare» come se qualcuno l'avesse verificato.

   REGOLA, coerente con D2 e D3: una pausa fra due sigarette conta come
   record solo se è INTERAMENTE dentro un tratto coperto. Con la
   tolleranza a 48 ore questo vuol dire che una pausa più lunga di due
   giorni conta solo se chi l'ha fatta si è fatto vivo nel frattempo —
   una voglia superata, un «oggi zero», o una dichiarazione di aver
   smesso, che copre tutto da lì in avanti. Che è esattamente la persona
   che quel record se lo merita.

   La pausa IN CORSO si misura dal riferimento (D4), che è già prudente
   per costruzione, e vale sempre. */
export function recordSenzaFumare(dati, adesso, intervalli, rif) {
  if (!dati?.start) return null;
  const ints = intervalli || intervalliCoperti(dati);
  const cigs = [...(Array.isArray(dati.cigs) ? dati.cigs : [])]
    .filter((t) => Number.isFinite(t)).sort((a, b) => a - b);

  const riferimento = rif === undefined ? riferimentoAstinenza(dati, adesso, ints) : rif;
  let piu = riferimento === null ? 0 : Math.max(0, adesso - riferimento);

  const coperta = (da, a) => ints.some(([i0, i1]) => i0 <= da && i1 >= a);
  for (let i = 1; i < cigs.length; i += 1) {
    const durataPausa = cigs[i] - cigs[i - 1];
    if (durataPausa > piu && coperta(cigs[i - 1], cigs[i])) piu = durataPausa;
  }
  if (piu === 0 && cigs.length === 0 && riferimento === null) return null;
  return piu;
}

/* ================================================================== */
/*  LA MEDIA DI UN PERIODO, SUI SOLI GIORNI COPERTI                    */
/* ================================================================== */
/* Stessa regola dei soldi, applicata alle medie: dividere le sigarette
   registrate per i giorni di calendario significa contare come «zero»
   i giorni in cui l'app non sapeva niente. Non è un dettaglio estetico,
   perché da `media7` esce la proiezione a un anno: sparire per tre
   giorni su sette faceva scendere la media del 43% e saliva della
   stessa quota il risparmio annunciato per i dodici mesi successivi.

   Torna `null` quando il periodo è coperto per meno di mezzo giorno:
   una media costruita su qualche ora non è una media, e chi la mostra
   scrive un trattino. */
export function mediaCoperta(cigs, intervalli, da, a) {
  const giorni = tempoCoperto(intervalli || [], da, a);
  if (!(giorni >= 0.5)) return null;
  const n = (Array.isArray(cigs) ? cigs : []).filter((t) => t >= da && t < a).length;
  return n / giorni;
}

/* ================================================================== */
/*  D7  ·  LO SCARTO DAL RITMO, E POI I SOLDI                          */
/* ================================================================== */
/* Sono due nature diverse di numero e vanno tenute separate, perché
   l'interfaccia non deve poter scrivere un meno davanti alla parola
   «risparmiati»:

     scarto      quante sigarette in meno (o in più) rispetto al ritmo
                 di partenza. HA UN SEGNO.
     risparmiato quanto hai messo da parte. MAI NEGATIVO.
     spesoInPiu  quanto hai bruciato oltre il tuo ritmo. MAI NEGATIVO.

   Invarianti, verificati dai test:
     · risparmiato ≥ 0 e spesoInPiu ≥ 0, sempre;
     · mai entrambi maggiori di zero;
     · risparmiato − spesoInPiu = scarto × prezzo unitario.

   Euro e minuti di vita restano la STESSA quantità moltiplicata per due
   prezzi diversi, quindi non possono contraddirsi fra loro. */
function separa(scarto, prezzo) {
  return {
    risparmio: Math.max(0, scarto) * prezzo,
    speso: Math.max(0, -scarto) * prezzo,
  };
}

export function calcolaConti(base, adesso = Date.now()) {
  if (!base) return null;
  const {
    unit, minPer, baseline, baselinePronta, baselineDichiarata,
    startTs, oggiTs, inizioSett, mediaOra, intervalli,
    totCigs, oggiFumate, settFumate, curvaGiorni, inizioCurva, totPrimaCurva,
  } = base;

  /* Senza un ritmo di partenza affidabile non esiste nessun risparmio da
     mostrare. Chi chiama distingue i due casi (manca il prezzo / manca il
     ritmo) e lo dice all'utente invece di mostrare uno zero. */
  if (!baselinePronta) return null;
  /* Nessun calcolo principale deve poter produrre NaN o Infinity. Il ritmo
     e il prezzo unitario sono i due moltiplicatori da cui passa TUTTO:
     basta uno dei due non finito perché ogni cifra della schermata
     diventi «NaN €», che è peggio di una schermata vuota. */
  if (!Number.isFinite(baseline) || !Number.isFinite(unit) || !Number.isFinite(minPer)) return null;

  const attese = (da) => baseline * tempoCoperto(intervalli, Math.max(da, startTs), adesso);

  const scartoRitmo = attese(startTs) - totCigs;
  const scartoOggi = attese(oggiTs) - oggiFumate;
  const scartoSett = attese(inizioSett) - settFumate;

  /* `mediaOra` è la media dei GIORNI PIENI precedenti. Se comprendesse
     anche oggi, che è a metà, la proiezione a un anno si muoverebbe da
     sola nel corso della giornata: misurato prima della correzione,
     1.251 € alle 01:00 e 1.095 € alle 21:00 con gli stessi identici dati.
     Finché non c'è nemmeno un giorno pieno vale null, e chi la mostra
     scrive un trattino: più onesto di una stima fatta su mezza giornata. */
  const scartoAnno = Number.isFinite(mediaOra)
    ? (baseline - mediaOra) * 365
    : null;

  const soldiTot = separa(scartoRitmo, unit);
  const soldiOggi = separa(scartoOggi, unit);
  const soldiSett = separa(scartoSett, unit);
  const soldiAnno = scartoAnno === null ? null : separa(scartoAnno, unit);
  const vitaTot = separa(scartoRitmo, minPer);
  const vitaOggi = separa(scartoOggi, minPer);
  const vitaSett = separa(scartoSett, minPer);
  const vitaAnno = scartoAnno === null ? null : separa(scartoAnno, minPer);

  /* Curva cumulativa degli ultimi giorni, in euro e CON IL SEGNO: sopra
     lo zero si riempie di verde, sotto di grigio spento. Parte dal valore
     già accumulato prima della finestra, non da zero — con più di due
     settimane di storico il suo ultimo punto cadeva su un numero diverso
     da quello scritto due centimetri sopra (218,10 € nella card, 48,90 €
     in fondo alla curva). */
  let acc = (baseline * tempoCoperto(intervalli, startTs, inizioCurva) - totPrimaCurva) * unit;
  const curva = curvaGiorni.map(({ n, da, a, label }) => {
    acc += (baseline * tempoCoperto(intervalli, Math.max(da, startTs), Math.min(a, adesso)) - n) * unit;
    return { v: acc, label };
  });

  /* Il numero che finisce a schermo, arrotondato una volta sola e QUI.
     Arrotondare due volte non è come arrotondare una: 86,46 → 86,5 → 87,
     mentre il valore vero è 86. Per questo l'arrotondamento sta qui e non
     nelle schermate, che si limitano a scegliere quale valore mostrare.

     `scartoIntero` non lo usa più nessuna schermata — la Home mostra
     `scartoMostrato`, con una cifra decimale, per non dire «20 sigarette»
     accanto a un costo di 19,94 — ma resta esposto: è la versione intera
     dello stesso scarto, e i controlli la verificano. */
  const scartoMostrato = Math.round(Math.abs(scartoRitmo) * 10) / 10;

  return {
    unitario: unit,
    minutiPer: minPer,
    baseline,
    baselineDichiarata,

    // ---- lo scarto dal ritmo: ha un segno ----
    scartoRitmo,
    scartoOggi,
    scartoSett,
    scartoAnno,
    scartoMostrato,
    scartoIntero: Math.round(Math.abs(scartoRitmo)),
    inRosso: scartoRitmo < 0,
    inPari: Math.abs(scartoRitmo) < 0.5,

    // ---- i soldi: mai negativi ----
    risparmiato: soldiTot.risparmio,
    spesoInPiu: soldiTot.speso,
    risparmioOggi: soldiOggi.risparmio,
    spesoOggi: soldiOggi.speso,
    risparmioSett: soldiSett.risparmio,
    spesoSett: soldiSett.speso,
    risparmioAnno: soldiAnno === null ? null : soldiAnno.risparmio,
    spesoAnno: soldiAnno === null ? null : soldiAnno.speso,

    // ---- la vita: mai negativa, stessa quantità con l'altro prezzo ----
    vitaTenuta: vitaTot.risparmio,
    vitaPersaInPiu: vitaTot.speso,
    vitaOggi: vitaOggi.risparmio,
    vitaPersaOggi: vitaOggi.speso,
    vitaSett: vitaSett.risparmio,
    vitaPersaSett: vitaSett.speso,
    vitaAnno: vitaAnno === null ? null : vitaAnno.risparmio,
    vitaPersaAnno: vitaAnno === null ? null : vitaAnno.speso,

    /* Natura diversa da tutte le precedenti, e per questo nell'interfaccia
       non stanno mai nella stessa riga: non sono risparmi ma il costo
       pieno del fumo, quello che resta anche mentre stai andando bene. */
    minutiPersiTotali: totCigs * minPer,
    minutiPersiOggi: oggiFumate * minPer,
    minutiAnnoRitmo: Number.isFinite(mediaOra) ? mediaOra * 365 * minPer : null,

    curva,
  };
}
