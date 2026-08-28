import { DAY } from '../constants.js';

/* ------------------------------------------------------------------ */
/*  I CONTI                                                            */
/*                                                                     */
/*  Stava dentro App.jsx, dove non si poteva verificare. Sono i numeri  */
/*  che la gente guarda ogni giorno e su cui decide se l'app dice il    */
/*  vero: se questi non tornano, non conta quanto è bella la Home.      */
/*                                                                     */
/*  UNA REGOLA SOLA, ed è quella che prima era violata: dentro una      */
/*  stessa card ogni cifra deve essere la STESSA NATURA di numero.      */
/*  Ci sono due nature qui dentro e vanno tenute separate:              */
/*                                                                     */
/*    · RISPARMIO — una differenza rispetto al ritmo di partenza.       */
/*      Può essere negativa (stai fumando più di prima).                */
/*    · PERDITA — un valore assoluto: quello che il fumo ti costa       */
/*      comunque, anche quando stai andando bene.                       */
/*                                                                     */
/*  Prima la card «Vita non bruciata» aveva un titolo di risparmio e    */
/*  una riga di perdite, con l'ultima colonna etichettata «in un anno   */
/*  così» esattamente come quella dei soldi — che però era un           */
/*  risparmio. Stessa etichetta, significato opposto, card adiacenti:   */
/*  chi leggeva «vita non bruciata 1g 4h … in un anno così 40g 13h»     */
/*  capiva di risparmiare quaranta giorni l'anno, e non era vero.       */
/* ------------------------------------------------------------------ */

export function calcolaConti(base, adesso = Date.now()) {
  if (!base) return null;
  const {
    unit, minPer, baseline, oggiTs, inizioSett, mediaOra,
    totCigs, oggiFumate, settFumate, curvaGiorni, startSod,
  } = base;

  /* Un solo calcolo, tre periodi: quante sigarette hai evitato rispetto al
     ritmo di partenza. Euro e minuti di vita sono poi la STESSA quantità
     moltiplicata per due prezzi diversi — il prezzo in denaro e il prezzo
     in tempo. Tenendo i periodi qui, la coerenza fra le due card non è più
     una cosa da ricordarsi: è come sono fatti i numeri. */
  const giorniFraz = (adesso - startSod) / DAY;   // frazionari: è questo che
  const fraOggi = (adesso - oggiTs) / DAY;        // fa muovere i contatori
  const settGiorni = (adesso - inizioSett) / DAY;

  const evitate = baseline * giorniFraz - totCigs;      // negativo se sei sopra il tuo ritmo
  const evitateOggi = baseline * fraOggi - oggiFumate;
  const evitateSett = baseline * settGiorni - settFumate;
  const evitateAnno = (baseline - mediaOra) * 365;      // al passo degli ultimi 7 giorni

  // curva cumulativa: i conteggi giornalieri sono già pronti, resta solo
  // da sommare e aggiustare la quota di "oggi" col tempo trascorso
  let acc = 0;
  const curva = curvaGiorni.map(({ n, label }, idx) => {
    const isOggi = idx === curvaGiorni.length - 1;
    acc += (baseline * (isOggi ? fraOggi : 1) - n) * unit;
    return { v: acc, label };
  });

  /* Il numero che finisce a schermo, arrotondato una volta sola e QUI.
     Prima ogni schermata troncava `evitate` per conto suo (86 invece di
     86,25) mentre euro e minuti restavano sul valore pieno: chi controllava
     con la calcolatrice trovava 86 x 0,30 = 25,80 contro i 25,88 della
     card, e aveva ragione lui. Con un decimale lo scarto resta sotto il
     mezzo centesimo, ed è per questo che la card dichiara anche il prezzo
     unitario: la catena si vede tutta. */
  const evitateMostrate = Math.round(Math.abs(evitate) * 10) / 10;

  return {
    unitario: unit, minutiPer: minPer, baseline,
    evitate, evitateMostrate, inRosso: evitate < 0,

    // ---- gli stessi tre periodi, in euro ----
    risparmiato: evitate * unit,
    oggiRisparmio: evitateOggi * unit,
    settimana: evitateSett * unit,
    annoProiezione: evitateAnno * unit,

    // ---- gli stessi tre periodi, in minuti di vita ----
    minutiSalvati: evitate * minPer,
    oggiVita: evitateOggi * minPer,
    settimanaVita: evitateSett * minPer,
    annoVita: evitateAnno * minPer,

    /* Natura diversa dalle precedenti, e per questo nell'interfaccia non
       stanno mai nella stessa riga: non sono risparmi ma il costo pieno
       del fumo, quello che resta anche mentre stai andando bene. */
    minutiPersiTotali: totCigs * minPer,
    minutiPersiOggi: oggiFumate * minPer,
    minutiAnnoRitmo: mediaOra * 365 * minPer,

    curva,
  };
}
