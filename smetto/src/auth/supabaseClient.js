/* ------------------------------------------------------------------ */
/* supabaseClient.js — src/auth/supabaseClient.js                      */
/*                                                                     */
/* Progetto Supabase "smetto" (organizzazione federicoimbimbo36),      */
/* regione eu-west-1.                                                  */
/*                                                                     */
/* La chiave qui sotto è la chiave PUBBLICA (publishable): è pensata   */
/* per stare nel codice del client, la si legge aprendo l'app con gli  */
/* strumenti da sviluppatore ed è normale così. Quello che protegge i  */
/* dati NON è il segreto della chiave, ma le policy RLS sul database:  */
/* con questa chiave si può fare solo ciò che le policy permettono a   */
/* un utente autenticato, cioè leggere e scrivere i propri dati.       */
/*                                                                     */
/* ⚠️  La chiave `service_role` scavalca la RLS: non deve MAI comparire */
/*     in questo file né in nessun altro file che finisce nel bundle.  */
/*                                                                     */
/* In produzione conviene comunque passare da variabili d'ambiente     */
/* (.env non versionato):                                              */
/*   VITE_SUPABASE_URL=...                                             */
/*   VITE_SUPABASE_PUBLISHABLE_KEY=...                                 */
/* I valori qui sotto restano come default per far partire l'app       */
/* appena clonata, senza configurare niente.                           */
/* ------------------------------------------------------------------ */

import { createClient } from '@supabase/supabase-js';

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};

export const SUPABASE_URL = env.VITE_SUPABASE_URL
  ?? 'https://mzsiqlhovliginqazwrx.supabase.co';

export const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY
  ?? 'sb_publishable_rq6ZNqXRTef18qCjDAhOBw_PoaP703l';

/* Se qualcuno svuota le variabili d'ambiente l'app non deve crashare:
   torna semplicemente in modalità locale (auth finto + storage sul
   dispositivo), utile anche per sviluppare offline. */
export const supabaseConfigurato = Boolean(SUPABASE_URL && SUPABASE_KEY);

export const supabase = supabaseConfigurato
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,      // la sessione sopravvive alla chiusura dell'app
      autoRefreshToken: true,
      detectSessionInUrl: false, // niente redirect OAuth: si entra con telefono e password
    },
  })
  : null;

/* Supabase fa il login con password su un'email. Qui si entra col numero
   di telefono, quindi il numero viene trasformato in un indirizzo tecnico
   che non riceverà mai posta e non viene mostrato da nessuna parte.
   ⚠️  Questa funzione non si tocca più: cambiarla vorrebbe dire che tutti
   gli account già registrati non riescono più ad accedere. */
export const phoneToTechnicalEmail = (phone) =>
  `u${String(phone).replace(/[^0-9]/g, '')}@smetto.app`;
