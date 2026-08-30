/* ------------------------------------------------------------------ */
/*  ELIMINARE L'ACCOUNT                                                */
/*                                                                     */
/*  Sta qui e non dentro App.jsx per la stessa ragione di               */
/*  `tappeDaRiavviare` e `togliLotto`: è una sequenza con degli esiti,  */
/*  e gli esiti vanno provati.                                         */
/*                                                                     */
/*  «ACCOUNT ELIMINATO.» SI DICE SOLO SE È SUCCESSO DAVVERO.           */
/*                                                                     */
/*  Prima l'esito non veniva letto: senza rete la cancellazione         */
/*  falliva, l'app faceva comunque il logout e mostrava la conferma, e  */
/*  l'utente restava convinto di non esistere più mentre account,       */
/*  registro e sessione erano tutti ancora lì. Su un'app che tratta     */
/*  dati di salute è la peggiore delle bugie possibili.                 */
/*                                                                     */
/*  Una transazione non c'è e non la si inventa: l'architettura non la  */
/*  sostiene. Si procede in ordine, ci si ferma al primo passo che non  */
/*  riesce, e si RESTITUISCE cosa è riuscito — così chi chiama può      */
/*  rimettere in ordine lo stato locale invece di lasciarlo a metà.     */
/*                                                                     */
/*  L'ordine non è casuale: prima si esce dai gruppi, poi si cancella.  */
/*  Se l'uscita non riesce non si prova nemmeno a cancellare, perché    */
/*  resterebbe una riga di classifica di un account che non c'è più.    */
/* ------------------------------------------------------------------ */

/* `leave` e `deleteAccount` normalmente tornano { error }, ma sotto c'è
   una chiamata di rete: se lancia, un'eccezione qui dentro diventerebbe
   una promise non gestita e l'utente non vedrebbe succedere niente. Un
   fallimento è un fallimento, comunque si presenti. */
const prova = async (lavoro) => {
  try { return (await lavoro()) || {}; } catch (e) { return { error: e?.message || 'errore' }; }
};

export async function eliminaAccount({ codici = [], uid, groups, auth }) {
  const rimasti = [];
  for (const code of codici) {
    const uscita = await prova(() => groups.leave(code, uid));
    if (uscita.error) rimasti.push(code);
  }
  if (rimasti.length) return { ok: false, rimasti, motivo: 'gruppi' };

  const esito = await prova(() => auth.deleteAccount(uid));
  if (esito.error) return { ok: false, rimasti, motivo: esito.error };

  return { ok: true, rimasti: [] };
}

export default eliminaAccount;
