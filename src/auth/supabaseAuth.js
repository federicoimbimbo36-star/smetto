/* ------------------------------------------------------------------ */
/* supabaseAuth.js — src/auth/supabaseAuth.js                          */
/*                                                                     */
/* Stessa identica interfaccia di localAuth, ma i dati stanno sul       */
/* database. Attivato da src/auth/index.js quando Supabase è           */
/* configurato.                                                        */
/*                                                                     */
/* Schema di riferimento (migrazioni in supabase/migrations):           */
/*   profiles(id = auth.users.id, display_name, nickname, email,        */
/*            phone, avatar_color)                                      */
/* Il profilo NON viene creato da qui: ci pensa il trigger              */
/* on_auth_user_created leggendo i metadati passati a signUp.           */
/*                                                                     */
/* La RLS lascia leggere a ciascuno solo il PROPRIO profilo. Per questo */
/* l'unicità del nickname non si controlla più con una select sugli     */
/* altri utenti (che ora torna sempre vuota, e lascerebbe passare i     */
/* doppioni): la garantisce l'indice unico sul database, e qui si       */
/* intercetta il suo errore 23505.                                      */
/* ------------------------------------------------------------------ */

import { supabase, phoneToTechnicalEmail } from './supabaseClient';

/* deve restare allineato al primo colore di PALETTE in constants.js */
const PALETTE_DEFAULT = '#D19A3E';

async function fetchProfile(id) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, nickname, email, phone, avatar_color')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) {
    if (error) console.warn('Impossibile leggere il profilo:', error.message);
    return { id };
  }
  return data;
}

/* Il trigger che crea il profilo scatta subito dopo l'insert in
   auth.users, ma la prima select può arrivare un attimo prima che sia
   visibile: qui si riprova un paio di volte invece di mostrare un
   account senza nome. */
async function fetchProfileConAttesa(id, tentativi = 3) {
  for (let i = 0; i < tentativi; i += 1) {
    const p = await fetchProfile(id);
    if (p.display_name) return p;
    await new Promise((r) => setTimeout(r, 150 * (i + 1)));
  }
  return { id };
}

/* ------------------------------------------------------------------ */
/* L'UNICO MODO DI USCIRE, in tutto questo file.                       */
/*                                                                     */
/* `supabase.auth.signOut()` senza argomenti vale `{ scope: 'global' }`:*/
/* revoca i refresh token dell'utente OVUNQUE.                          */
/*                                                                     */
/*   'global'  chiude tutte le sessioni dell'utente, su ogni browser e  */
/*             ogni telefono. Chi stava usando l'app dall'altro         */
/*             dispositivo viene buttato fuori al primo rinnovo del     */
/*             token, senza aver toccato niente.                        */
/*   'local'   revoca SOLTANTO questa sessione, e cancella la copia     */
/*             scritta su questo dispositivo.                           */
/*                                                                     */
/* `local` è quello giusto, e la ragione sta in come è fatta una        */
/* sessione: le schede dello stesso browser ne condividono UNA, perché  */
/* condividono lo stesso localStorage. Revocare quella basta e avanza   */
/* per far uscire tutte le schede di questo Safari, e non tocca la      */
/* sessione — diversa, con un suo refresh token — che l'altro telefono  */
/* si è aperto con il proprio accesso.                                  */
/*                                                                     */
/* Il refresh token DI QUESTO dispositivo viene comunque revocato sul   */
/* server: `auth-js` chiama `/logout?scope=local`. Non resta una        */
/* credenziale viva dietro le spalle di chi è uscito.                   */
/*                                                                     */
/* Quello che si perde è «esci da tutti i dispositivi»: un refresh      */
/* token finito nelle mani sbagliate non si annulla più da qui. È una   */
/* funzione che va offerta a parte, se serve, non l'effetto involontario*/
/* di un pulsante «Esci».                                               */
/*                                                                     */
/* Una funzione sola perché il rischio vero è la deriva: due copie      */
/* della stessa chiamata, e fra sei mesi una delle due torna globale    */
/* senza che nessuno se ne accorga. Qui lo scope si scrive in un posto. */
/*                                                                     */
/* L'ESITO SI RESTITUISCE, non si butta via: `signOut` ha un percorso   */
/* in cui esce con un errore e LASCIA LA SESSIONE SUL DISPOSITIVO —     */
/* quando la lettura della sessione fallisce perché il token è scaduto  */
/* e il rinnovo non passa senza rete. Ignorandolo, l'app diceva «Hai    */
/* effettuato il logout» con la sessione ancora scritta.                */
/* ------------------------------------------------------------------ */
async function escoSoloDaQui(seNonRiesce) {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  return error ? { error: error.message || seNonRiesce } : {};
}

const supabaseAuth = {
  mode: 'supabase',

  async getSession() {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) return null;
    const profile = await fetchProfile(data.session.user.id);
    return { user: { ...profile, id: data.session.user.id } };
  },

  /* CHI ENTRA E CHI ESCE, ANCHE DA UN'ALTRA SCHEDA.

     La sessione Supabase sta in localStorage ed è condivisa fra tutte le
     schede dello stesso browser: uscire in una le fa uscire tutte, ma solo
     la scheda che ha premuto il pulsante se ne accorgeva. Le altre
     restavano a mostrare i dati di un account da cui l'utente era già
     uscito — su un telefono o un computer condiviso, sotto gli occhi di
     chi entra dopo.

     `onAuthStateChange` lo dice; mancava solo qualcuno che ascoltasse.
     Passa `null` quando la sessione se ne va, l'identificativo quando
     cambia. Restituisce la funzione per staccarsi. */
  onAuthChange(fn) {
    const { data } = supabase.auth.onAuthStateChange((_evento, sessione) => {
      fn(sessione?.user?.id || null);
    });
    return () => { try { data?.subscription?.unsubscribe?.(); } catch { /* già staccato */ } };
  },

  async signUp(phone, password) {
    if (password.length < 12) return { error: 'password-debole' };
    const { data, error } = await supabase.auth.signUp({
      email: phoneToTechnicalEmail(phone),
      password,
      options: {
        data: {
          phone,
          display_name: `Amico ${phone.slice(-4)}`,
          avatar_color: PALETTE_DEFAULT,
        },
      },
    });

    // Non distinguere mai un numero già registrato da un altro errore di
    // registrazione: l'account è identificato dall'email tecnica derivata
    // dal numero e un messaggio specifico lo trasformerebbe in un oracolo.
    if (error) return { error: 'registrazione-non-riuscita' };
    // Se non torna una sessione, il progetto ha ancora la conferma email
    // obbligatoria: va disattivata, perché qui l'email è tecnica e non reale.
    if (!data.session) {
      return { error: 'serve disattivare la conferma email nelle impostazioni Supabase' };
    }

    const profile = await fetchProfileConAttesa(data.user.id);
    return { user: { ...profile, id: data.user.id, phone } };
  },

  async signIn(phone, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: phoneToTechnicalEmail(phone),
      password,
    });
    if (error) return { error: 'credenziali' };
    const profile = await fetchProfile(data.user.id);
    return { user: { ...profile, id: data.user.id, phone: profile.phone || phone } };
  },

  /* IL PULSANTE «ESCI»: la scheda che l'utente ha davanti.

     Esce di qui, poi App.jsx annuncia alle altre schede di questo Safari.
     Lo scope è quello di `escoSoloDaQui` — mai globale — per la ragione
     spiegata sopra: l'altro telefono della stessa persona non ha premuto
     niente e non deve accorgersi di questo logout. */
  async signOut() {
    return escoSoloDaQui('logout non riuscito');
  },

  /* La scheda che RICEVE l'annuncio, non quella che preme il pulsante.

     Stesso scope, per due motivi diversi. Là si esce; qui si finisce di
     uscire: la sessione condivisa l'ha già revocata la scheda A, quindi
     di solito qui non resta nemmeno un access token da mandare al server
     e la chiamata non parte proprio. Serve comunque, perché è l'unico
     modo di far emettere a QUESTO client un `SIGNED_OUT` vero invece di
     lasciarlo convinto di essere dentro — e perché la copia locale può
     davvero sopravvivere (storage partizionato, navigazione privata, un
     logout che ha pulito solo l'altra scheda).

     Quello che NON deve fare è revocare a raggio più largo di A: se qui
     ci scappasse un `global`, il logout su una scheda porterebbe giù
     l'altro telefono passando dalla porta di servizio. */
  async signOutLocale() {
    return escoSoloDaQui('sessione locale non cancellata');
  },

  /* CHI C'È, senza leggere il profilo.

     La usa il controllo al risveglio della scheda, che deve essere
     immediato e non deve dipendere dalla rete: `getSession()` di
     `auth-js` legge da localStorage e risponde anche a telefono
     staccato, mentre `supabaseAuth.getSession()` va a prendere anche il
     profilo dal database — un giro in rete a ogni cambio di scheda, per
     un dato che qui non serve.

     Torna l'identificativo e non un sì/no perché il marcatore di logout
     va confrontato con QUALE utente è dentro: senza il nome, buttare
     fuori sarebbe una decisione presa al buio. */
  async idSessione() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id || null;
  },

  async updateProfile(id, patch) {
    const nickname = (patch.nickname || '').trim();
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: patch.display_name,
        nickname: nickname || null,
        email: patch.email || null,
        phone: patch.phone,
        avatar_color: patch.avatar_color,
      })
      .eq('id', id);

    // 23505 = violazione di un indice unico: l'unico che abbiamo è quello
    // sul nickname (senza distinzione fra maiuscole e minuscole).
    if (error?.code === '23505') return { error: 'nickname' };
    if (error) return { error: error.message };
    return { profile: await fetchProfile(id) };
  },

  async changePassword(id, current, next) {
    if (next.length < 12) return { error: 'password-debole' };
    // Supabase non verifica la password attuale in updateUser: la ricontrolliamo
    // con un login "a vuoto" sullo stesso account prima di procedere.
    const { data: sessionData } = await supabase.auth.getSession();
    const email = sessionData.session?.user?.email;
    if (!email) return { error: 'sessione scaduta' };

    const { error: checkError } = await supabase.auth.signInWithPassword({ email, password: current });
    if (checkError) return { error: 'password attuale' };

    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) return { error: error.message };
    return {};
  },

  async requestRecovery(phone) {
    /* Perché questo controllo esiste.
       La registrazione avviene su un'email tecnica e il numero finisce solo
       nei metadati e nella tabella profiles: `auth.users.phone` resta VUOTO.
       Un signInWithOtp({ phone }) su un numero non collegato non raggiunge
       questo account — nel migliore dei casi ne aprirebbe un altro. Quindi
       il codice non arriverebbe mai a destinazione anche con Twilio attivo.

       Per attivarlo davvero servono due cose:
       1. un provider SMS configurato in Supabase (Twilio, Vonage…);
       2. il numero legato all'utente con supabase.auth.updateUser({ phone }),
          che manda un SMS di verifica da confermare una volta sola.
       Finché mancano, si dice com'è invece di far aspettare a vuoto. */
    const { data: utente } = await supabase.auth.getUser();
    if (!utente?.user?.phone) return { error: 'sms-non-disponibile' };

    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (!error) return {};
    const m = error.message.toLowerCase();
    if (m.includes('sms') || m.includes('phone') || m.includes('provider') || m.includes('disabled')) {
      return { error: 'sms-non-disponibile' };
    }
    return { error: error.message };
  },

  async verifyRecovery(phone, code, newPassword) {
    if (newPassword.length < 12) return { error: 'password-debole' };
    // Verifica il codice ricevuto via SMS: se corretto, Supabase apre già
    // una sessione autenticata, quindi possiamo impostare subito la nuova password.
    const { error: otpError } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
    if (otpError) return { error: 'Codice non valido o scaduto. Richiedine uno nuovo.' };

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: error.message };
    return {};
  },

  async deleteAccount() {
    // Cancellare una riga di auth.users richiede privilegi che nel client
    // non devono mai finire: lo fa la funzione delete_me (SECURITY DEFINER)
    // sul database, che elimina soltanto l'utente che la sta chiamando.
    // Da lì in poi profilo, registro privato e iscrizioni ai gruppi se ne
    // vanno in cascata.
    const { error } = await supabase.rpc('delete_me');
    if (error) return { error: error.message };
    /* Anche qui `local`, e non per simmetria: l'account non esiste più,
       quindi non c'è nessuna sessione altrove da revocare e la chiamata
       globale sarebbe solo una richiesta che il server rifiuta. La regola
       in questo file è una sola — nessun `signOut()` senza scope — perché
       è l'eccezione dimenticata in un angolo che poi rimette in piedi il
       comportamento globale senza che nessuno la colleghi al logout. */
    await escoSoloDaQui('sessione non cancellata');
    return {};
  },
};

export default supabaseAuth;
