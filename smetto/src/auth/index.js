/* ------------------------------------------------------------------ */
/* src/auth/index.js                                                   */
/*                                                                     */
/* Punto unico in cui si sceglie il backend di autenticazione.         */
/*                                                                     */
/* Da qui in avanti il backend vero è Supabase: account, gruppi e      */
/* registro personale stanno sul database, quindi ti ritrovi i tuoi    */
/* dati anche cambiando telefono e i membri di un gruppo si vedono     */
/* davvero fra loro.                                                   */
/*                                                                     */
/* localAuth resta come rete di sicurezza: se le variabili d'ambiente  */
/* di Supabase sono vuote (sviluppo offline, build di prova) l'app     */
/* riparte in modalità locale invece di non aprirsi proprio.           */
/* ------------------------------------------------------------------ */

import localAuth from './localAuth';
import supabaseAuth from './supabaseAuth';
import { supabaseConfigurato } from './supabaseClient';

const auth = supabaseConfigurato ? supabaseAuth : localAuth;

if (!supabaseConfigurato) {
  // eslint-disable-next-line no-console
  console.warn(
    '[auth] Supabase non configurato: l’app gira in modalità locale. '
    + 'Account e gruppi restano su questo dispositivo e nessun altro li vede.',
  );
}

export default auth;
