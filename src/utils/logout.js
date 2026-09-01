/* ------------------------------------------------------------------ */
/* logout.js — src/utils/logout.js                                     */
/*                                                                     */
/* Uscire dall'account, nell'ordine giusto e senza mentire.            */
/*                                                                     */
/* Il difetto era una riga:                                            */
/*                                                                     */
/*   await auth.signOut(); … showToast('Hai effettuato il logout.');   */
/*                                                                     */
/* `signOut` non restituiva niente e nessuno guardava com'era andata.  */
/* Non è una sfumatura: `supabase.auth.signOut()` ha un percorso in cui */
/* esce con un errore e LASCIA LA SESSIONE SUL DISPOSITIVO — quando la */
/* lettura della sessione stessa fallisce, per esempio perché il token */
/* è scaduto e il rinnovo non passa perché la rete non c'è. In quel     */
/* caso l'app diceva «Hai effettuato il logout», tornava alla           */
/* schermata di accesso, e la sessione restava scritta: bastava        */
/* ricaricare — in questa scheda o in un'altra — per ritrovarsi dentro. */
/*                                                                     */
/* Da qui la regola: se il logout non è riuscito non si resetta niente */
/* e non si dice che è riuscito. Meglio restare dentro e dirlo, che    */
/* sembrare fuori e non esserlo.                                       */
/*                                                                     */
/* Sta in un modulo per la stessa ragione di `caricaSessione`: una      */
/* sequenza dentro un componente React non si può eseguire in un banco */
/* di prova, e questa va provata proprio nel caso in cui fallisce.      */
/* ------------------------------------------------------------------ */

export async function eseguiLogout({
  signOut,
  spegniNotifiche,
  reset,
  annuncia,
  riuscito,
  fallito,
}) {
  let esito;
  try {
    esito = await signOut();
  } catch (e) {
    fallito?.(e);
    return 'errore';
  }
  if (esito?.error) {
    fallito?.(esito.error);
    return 'errore';
  }

  /* Le notifiche di sistema PRIMA del reset: sono già programmate nel
     telefono e non le tocca nessuno svuotando lo stato dell'app. Se
     restassero, l'account uscito continuerebbe a mandare avvisi. */
  try { await spegniNotifiche?.(); } catch { /* niente notifiche: non blocca l'uscita */ }

  reset();

  /* L'annuncio DOPO il reset locale: così questa scheda è già pulita
     quando le altre cominciano a pulirsi, e non c'è un momento in cui
     due schede si rispondono a vicenda. */
  try { annuncia?.(); } catch { /* canale non disponibile */ }

  riuscito?.();
  return 'uscito';
}
