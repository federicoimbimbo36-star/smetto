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

    if (error) {
      return {
        error: error.message.toLowerCase().includes('already registered')
          ? 'già registrato'
          : error.message,
      };
    }
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

  /* L'ESITO SI RESTITUISCE, non si butta via.

     `supabase.auth.signOut()` ha un percorso in cui esce con un errore e
     LASCIA LA SESSIONE SUL DISPOSITIVO: quando la lettura della sessione
     fallisce — token scaduto e rinnovo non riuscito perché la rete non
     c'è — torna subito con l'errore senza cancellare niente. Ignorandolo,
     l'app diceva «Hai effettuato il logout» con la sessione ancora
     scritta, e bastava ricaricare per ritrovarsi dentro. */
  async signOut() {
    const { error } = await supabase.auth.signOut();
    return error ? { error: error.message || 'logout non riuscito' } : {};
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
    await supabase.auth.signOut();
    return {};
  },
};

export default supabaseAuth;
