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
  marca,
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

  /* IL MARCATORE PRIMA DEL RESET, e per un motivo banale: `reset()`
     azzera `userRef`, e senza l'identificativo dell'utente il marcatore
     non si può scrivere. Dopo il `signOut`, però, non prima: un marcatore
     scritto per un logout che poi fallisce chiuderebbe fuori una persona
     che è rimasta legittimamente dentro.

     Ed è quello che rende superfluo l'annuncio: da qui in poi il fatto è
     scritto su questo dispositivo, e le altre schede lo trovano da sole
     alla prima occhiata — all'avvio o al risveglio — anche se il
     messaggio non è mai arrivato. */
  try { marca?.(); } catch { /* storage negato: restano canale e annuncio */ }

  reset();

  /* L'annuncio DOPO il reset locale: così questa scheda è già pulita
     quando le altre cominciano a pulirsi, e non c'è un momento in cui
     due schede si rispondono a vicenda. */
  try { annuncia?.(); } catch { /* canale non disponibile */ }

  riuscito?.();
  return 'uscito';
}

/* ------------------------------------------------------------------ */
/* L'USCITA DALL'ALTRA PARTE: la scheda che RICEVE l'annuncio.          */
/*                                                                     */
/* Prima qui c'era una riga sola, `resetAuthState()`, e non bastava.    */
/* Svuotava lo stato React e lasciava il client di `auth-js` di QUESTA  */
/* scheda convinto di essere dentro: nessun `SIGNED_OUT` emesso, il     */
/* ticker del rinnovo ancora agganciato, e — se per qualsiasi motivo    */
/* la copia locale della sessione fosse sopravvissuta al logout         */
/* dell'altra scheda — una schermata di accesso davanti a una sessione  */
/* ancora scritta. La schermata giusta con lo stato sbagliato sotto.    */
/*                                                                     */
/* Quindi: prima si cancella la sessione DI QUESTA scheda, poi si       */
/* resetta l'interfaccia. In quest'ordine, perché se il reset venisse   */
/* prima ci sarebbe un momento — breve, ma c'è — in cui l'app mostra    */
/* la schermata di accesso mentre la sessione è ancora buona, e         */
/* qualunque cosa parta in quel momento parte autenticata.              */
/*                                                                     */
/* Tre cose che questa funzione NON fa, e sono volute:                  */
/*                                                                     */
/*  · non riannuncia. Chi riceve non ripete: due schede che si          */
/*    rispondono a vicenda sono un anello.                              */
/*  · non revoca sul server. `signOutLocale` esce solo da qui: l'altro  */
/*    telefono della stessa persona non c'entra con questo logout.      */
/*  · non mostra nessun messaggio di riuscita. Non è stato l'utente a   */
/*    premere il pulsante su questa scheda.                             */
/*                                                                     */
/* `dentro()` e la guardia `inCorso` sono le due metà della stessa      */
/* regola: un reset solo. La prima ferma i segnali che arrivano quando  */
/* la scheda è già fuori, la seconda quelli che arrivano mentre         */
/* `signOutLocale` è ancora in volo — che è proprio il caso del         */
/* messaggio che arriva dal canale e dall'evento `storage` insieme.     */
/* ------------------------------------------------------------------ */

export function creaUscitaAnnunciata({ signOutLocale, reset, dentro }) {
  let inCorso = null;

  return function ricevi() {
    if (inCorso) return inCorso;                       // secondo segnale: si aggancia al primo
    if (dentro && !dentro()) return Promise.resolve('già fuori');

    const lavoro = (async () => {
      /* Se la cancellazione locale non riesce si resetta lo stesso: qui
         non c'è niente da salvare e lasciare a schermo i dati di un
         account uscito è il danno peggiore dei due. L'esito si
         restituisce, così chi chiama può dirlo se vuole. */
      let pulita = true;
      try {
        const esito = await signOutLocale?.();
        if (esito?.error) pulita = false;
      } catch {
        pulita = false;
      }
      reset();
      return pulita ? 'uscito' : 'uscito-con-sessione-sporca';
    })();

    /* L'assegnazione PRIMA di agganciare il `finally`, e non dopo: un
       `signOutLocale` che risponde subito farebbe scattare il `finally`
       su una variabile non ancora scritta, e la guardia sarebbe finta. */
    inCorso = lavoro;
    lavoro.then(() => { inCorso = null; }, () => { inCorso = null; });
    return lavoro;
  };
}
