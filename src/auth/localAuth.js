import { AUTH_KEY, PALETTE, logKey } from '../constants.js';
import { readStore, writeStore } from '../utils/storage.js';

const vuotoAuth = { users: {}, byPhone: {}, session: null };

/* PBKDF2-HMAC-SHA256, 150k iterazioni: a differenza di un digest SHA-256
   "secco" ha un costo di calcolo voluto, che rende il brute-force su GPU
   ordini di grandezza più lento. */
const PBKDF2_ITERAZIONI = 150000;

async function derivaPBKDF2(pw, salt, iterazioni) {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw', enc.encode(pw), { name: 'PBKDF2' }, false, ['deriveBits'],
  );
  const bits = await window.crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: iterazioni, hash: 'SHA-256' },
    keyMaterial, 256,
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPw(pw, salt, iterazioni = PBKDF2_ITERAZIONI) {
  if (window.crypto?.subtle) return derivaPBKDF2(pw, salt, iterazioni);
  // fallback per browser senza Web Crypto: molto meno sicuro, solo per non
  // bloccare l'app — nella pratica su web moderno non si arriva mai qui.
  const txt = `${salt}:${pw}`;
  let h = 0;
  for (let i = 0; i < txt.length; i += 1) h = (h * 31 + txt.charCodeAt(i)) | 0;
  return `fallback${h}`;
}

/* record creati prima di questo fix: un solo giro di SHA-256, senza
   iterazioni. Servono solo per riconoscere ed eseguire il login una
   tantum, poi il record viene rialzato subito a PBKDF2. */
async function hashLegacySha256(pw, salt) {
  const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pw}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* Verifica la password contro un record, qualunque sia il suo formato.
   Se il record è nel vecchio formato legacy e la password è corretta,
   lo riscrive subito in PBKDF2 (migrazione trasparente, un utente alla
   volta, al primo login riuscito dopo l'aggiornamento). */
async function verificaEMigra(pw, rec) {
  if (rec.algo === 'pbkdf2') {
    return (await hashPw(pw, rec.salt, rec.iterazioni)) === rec.hash;
  }
  const ok = (await hashLegacySha256(pw, rec.salt)) === rec.hash;
  if (ok) {
    rec.salt = Math.random().toString(36).slice(2);
    rec.hash = await hashPw(pw, rec.salt);
    rec.algo = 'pbkdf2';
    rec.iterazioni = PBKDF2_ITERAZIONI;
  }
  return ok;
}

const localAuth = {
  mode: 'locale',
  async getSession() {
    const db = await readStore(AUTH_KEY, vuotoAuth);
    if (!db.session || !db.users[db.session]) return null;
    return { user: { id: db.session, ...db.users[db.session].profile } };
  },

  /* La stessa forma di `supabaseAuth.onAuthChange`, perché App.jsx non
     debba sapere quale dei due backend sta usando. Qui la sessione è una
     riga in localStorage, quindi l'avviso arriva dall'evento `storage`,
     che il browser manda alle ALTRE schede. */
  onAuthChange(fn) {
    if (typeof window === 'undefined' || !window.addEventListener) return () => {};
    const ascolta = async (e) => {
      if (e?.key && !e.key.includes(AUTH_KEY)) return;
      const db = await readStore(AUTH_KEY, vuotoAuth);
      fn(db.session && db.users[db.session] ? db.session : null);
    };
    window.addEventListener('storage', ascolta);
    return () => window.removeEventListener('storage', ascolta);
  },
  /* LE FIRME RESTANO QUELLE DI supabaseAuth, token compreso.

     Qui il token non serve a niente — non c'è nessun server da
     convincere — ma accettarlo è l'unica cosa che tiene i due backend
     davvero intercambiabili. Una firma più corta di là non darebbe
     errore: JavaScript butta via l'argomento in più in silenzio, e il
     giorno che qualcuno inverte due parametri se ne accorge l'utente. */
  async signUp(phone, password, captchaToken) {
    if (password.length < 12) return { error: 'password-debole' };
    const db = await readStore(AUTH_KEY, vuotoAuth);
    if (db.byPhone[phone]) return { error: 'registrazione-non-riuscita' };
    const id = `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const salt = Math.random().toString(36).slice(2);
    db.users[id] = {
      salt, hash: await hashPw(password, salt), algo: 'pbkdf2', iterazioni: PBKDF2_ITERAZIONI,
      profile: { display_name: `Amico ${phone.slice(-4)}`, nickname: '', email: '', phone, avatar_color: PALETTE[0] },
    };
    db.byPhone[phone] = id;
    db.session = id;
    await writeStore(AUTH_KEY, db);
    return { user: { id, ...db.users[id].profile } };
  },
  async signIn(phone, password, captchaToken) {
    const db = await readStore(AUTH_KEY, vuotoAuth);
    const id = db.byPhone[phone];
    if (!id) return { error: 'credenziali' };
    const rec = db.users[id];
    if (!(await verificaEMigra(password, rec))) return { error: 'credenziali' };
    db.session = id;
    await writeStore(AUTH_KEY, db);      // salva anche l'eventuale migrazione dell'hash
    return { user: { id, ...rec.profile } };
  },
  // stessa forma di supabaseAuth: chi chiama non deve sapere quale dei due è
  async signOut() {
    const db = await readStore(AUTH_KEY, vuotoAuth);
    db.session = null;
    await writeStore(AUTH_KEY, db);
    return {};
  },

  /* Stessa interfaccia di supabaseAuth, così App.jsx non deve sapere
     quale dei due backend ha sotto. Qui la sessione è già una riga sola
     su questo dispositivo, quindi «locale» e «globale» coincidono. */
  async signOutLocale() {
    return this.signOut();
  },

  async idSessione() {
    const db = await readStore(AUTH_KEY, vuotoAuth);
    return (db.session && db.users[db.session]) ? db.session : null;
  },
  async updateProfile(id, patch) {
    const db = await readStore(AUTH_KEY, vuotoAuth);
    if (!db.users[id]) return { error: 'utente inesistente' };
    if (patch.nickname) {
      const preso = Object.entries(db.users).some(([uid, u]) => uid !== id && u.profile.nickname === patch.nickname);
      if (preso) return { error: 'nickname' };
    }
    db.users[id].profile = { ...db.users[id].profile, ...patch };
    await writeStore(AUTH_KEY, db);
    return { profile: db.users[id].profile };
  },
  async changePassword(id, current, next, captchaToken) {
    if (next.length < 12) return { error: 'password-debole' };
    const db = await readStore(AUTH_KEY, vuotoAuth);
    const rec = db.users[id];
    if (!rec) return { error: 'utente inesistente' };
    if (!(await verificaEMigra(current, rec))) return { error: 'password attuale' };
    rec.salt = Math.random().toString(36).slice(2);
    rec.hash = await hashPw(next, rec.salt);
    rec.algo = 'pbkdf2';
    rec.iterazioni = PBKDF2_ITERAZIONI;
    await writeStore(AUTH_KEY, db);
    return {};
  },
  async requestRecovery(phone, captchaToken) { return { error: 'sms-non-disponibile' }; },
  async verifyRecovery() { return { error: 'sms-non-disponibile' }; },
  async deleteAccount(id) {
    const db = await readStore(AUTH_KEY, vuotoAuth);
    const phone = db.users[id]?.profile.phone;
    delete db.users[id];
    if (phone) delete db.byPhone[phone];
    db.session = null;
    await writeStore(AUTH_KEY, db);
    try { await window.storage.delete(logKey(id)); } catch (e) { /* già assente */ }
  },
};

export default localAuth;
