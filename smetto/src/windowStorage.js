/* ------------------------------------------------------------------ */
/* windowStorage.js — src/windowStorage.js                             */
/*                                                                     */
/* La copia LOCALE dei dati, sul dispositivo:                          */
/*  - su Capacitor (iOS/Android): @capacitor/preferences, che          */
/*    sopravvive davvero fuori dal browser;                            */
/*  - sul web: localStorage.                                           */
/*                                                                     */
/* Non è più lui a definire window.storage: da quando c'è il database, */
/* quel compito è di installStorage.js, che usa questo file come cache  */
/* davanti a Supabase. Serve a due cose precise:                        */
/*  1. l'app si apre e mostra i dati subito, senza aspettare la rete;   */
/*  2. se la rete non c'è si continua a registrare, e si riallinea      */
/*     appena torna.                                                    */
/*                                                                     */
/* Da solo (Supabase non configurato) resta un backend completo, ma     */
/* solo su questo dispositivo: i gruppi non funzionano fra persone      */
/* diverse. Va bene per sviluppare, non per farlo provare a qualcuno.   */
/* ------------------------------------------------------------------ */

const LOCAL_PREFIX = 'smetto:kv:';

async function preferences() {
  try {
    const mod = await import('@capacitor/preferences');
    return mod.Preferences;
  } catch (e) {
    return null;
  }
}

const localKV = {
  async get(key) {
    const Prefs = await preferences();
    const value = Prefs
      ? (await Prefs.get({ key: LOCAL_PREFIX + key })).value
      : window.localStorage.getItem(LOCAL_PREFIX + key);
    return value == null ? null : { key, value };
  },

  async set(key, value) {
    const Prefs = await preferences();
    if (Prefs) await Prefs.set({ key: LOCAL_PREFIX + key, value });
    else window.localStorage.setItem(LOCAL_PREFIX + key, value);
    return { key, value };
  },

  async delete(key) {
    const Prefs = await preferences();
    if (Prefs) await Prefs.remove({ key: LOCAL_PREFIX + key });
    else window.localStorage.removeItem(LOCAL_PREFIX + key);
    return { key, deleted: true };
  },

  async list(prefix = '') {
    const Prefs = await preferences();
    let keys;
    if (Prefs) {
      keys = (await Prefs.keys()).keys
        .filter((k) => k.startsWith(LOCAL_PREFIX))
        .map((k) => k.slice(LOCAL_PREFIX.length));
    } else {
      keys = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const k = window.localStorage.key(i);
        if (k?.startsWith(LOCAL_PREFIX)) keys.push(k.slice(LOCAL_PREFIX.length));
      }
    }
    return { keys: keys.filter((k) => k.startsWith(prefix)), prefix };
  },
};

export default localKV;
