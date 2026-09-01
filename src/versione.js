/* ------------------------------------------------------------------ */
/* versione.js — src/versione.js                                       */
/*                                                                     */
/* L'identificativo della build che sta girando, cucito nel bundle da   */
/* `vite.config.js` a partire da `VERCEL_GIT_COMMIT_SHA`.               */
/*                                                                     */
/* Esiste per togliere di mezzo una domanda che finora si rispondeva a  */
/* naso: «la correzione è davvero online, o sto guardando una build     */
/* vecchia?». Finché la risposta è una supposizione, un collaudo che    */
/* fallisce non dice se il codice è sbagliato o se non è mai arrivato.  */
/*                                                                     */
/* `typeof` e non un accesso diretto: fuori da Vite — il banco di prova */
/* delle schermate monta i componenti con esbuild — la costante non     */
/* esiste, e leggerla direttamente sarebbe un ReferenceError.           */
/*                                                                     */
/* Il ripiego dice «non disponibile» e non «locale»: che l'app giri in  */
/* locale è una spiegazione possibile fra altre — su Vercel la          */
/* variabile di sistema può semplicemente non essere esposta — e da qui */
/* non si può distinguere. Meglio dire quello che si sa.                */
/* ------------------------------------------------------------------ */

/* eslint-disable no-undef */
export const VERSIONE = typeof __VERSIONE__ === 'string' && __VERSIONE__
  ? __VERSIONE__
  : 'non disponibile';
