import { useState, useEffect, useMemo, useRef, useCallback } from 'react';

import { PALETTE, DAY, MINUTI_PER_SIGARETTA, logKey, seenKey, FASCE, TAPPE, RILANCI } from './constants';
import {
  sod, dayDiff, ora, eur, ymd, dataBreve, prossimaMedia,
  addGiorni, maxTs, daYmd, durata, componiTelefono, cifreLocali,
} from './utils/format';
import { readStore, writeStore } from './utils/storage';
import auth from './auth';
import { distribuisci, tappeDaRiavviare } from './utils/arretrate';
import { PREFISSO_DEFAULT } from './data/prefissi';
import groups from './data/groups';
import {
  ConfirmDialog, RecoveryOtpModal, BottomNav, UmoreFoglio, Respiro, AggiungiTante,
} from './components';
import {
  AuthScreen, OnboardingScreen, CravingOverlay, RicadutaOverlay,
  OggiScreen, PercorsoScreen, AiutoScreen, GruppoScreen, ProfiloScreen,
} from './screens';
import { programmaTappe, annullaTappe } from './notificheTappe';
import './styles.css';

/* Funzione e non costante: il registro vuoto contiene array e oggetti, e
   una costante a livello di modulo li condividerebbe fra tutti quelli che
   la usano. Basta un solo punto del codice che faccia push invece di
   ricreare l'array e il "vuoto" smette di essere vuoto per sempre, anche
   dopo un logout. Con la funzione ogni chiamata ha i suoi. */
const vuotoLog = () => ({
  v: 6, start: null, cigs: [], resists: [], tags: {}, checkins: [],
  groups: [], notify: true, avvisiCorpo: true, onboarded: false,
  profile: { motivo: '', baseline: null, prezzoPacchetto: null, perPacchetto: 20, sesso: 'non_detto' },
  plans: {}, tappeViste: { ref: null, idx: [] }, ripartenze: 0,
});
const UTENTE_VUOTO = {
  id: null, name: 'Tu', nickname: '', email: '', emailVerified: false,
  phone: '', phoneVerified: false, avatarColor: PALETTE[0],
};

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [authMode, setAuthMode] = useState('signup');
  const [authPhone, setAuthPhone] = useState('');
  const [authPaese, setAuthPaese] = useState(PREFISSO_DEFAULT);
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [showAuthConfirmPassword, setShowAuthConfirmPassword] = useState(false);

  const [user, setUser] = useState(UTENTE_VUOTO);
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [pwFields, setPwFields] = useState({ current: '', next: '', confirm: '' });

  const [dati, setDati] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [tick, setTick] = useState(0);          // batte ogni secondo: fa muovere i contatori
  const [ultimoTs, setUltimoTs] = useState(null);
  const [craving, setCraving] = useState(false);
  const [respiro, setRespiro] = useState(false);          // respirazione guidata a schermo intero
  const [umore, setUmore] = useState(false);              // «come ti senti oggi?»
  const [tante, setTante] = useState(false);              // «ne ho fumate più di una»
  const [lotto, setLotto] = useState(null);               // l'ultimo blocco aggiunto, per poterlo annullare
  const [tappaBanner, setTappaBanner] = useState(null);   // tappa del corpo appena raggiunta
  const [riparti, setRiparti] = useState(null);           // schermata dopo una ricaduta

  /* Quattro schede, non cinque: il gruppo è una sotto-schermata di Aiuto,
     e `dentroGruppo` è lo stato che dice se ci siamo dentro. Prima era
     `activeTab === 'gruppo'`, e da quel confronto dipendono due cose
     concrete — la frequenza del sync e l'azzeramento dei non letti. */
  const [activeTab, setActiveTab] = useState('oggi');
  const [dentroGruppo, setDentroGruppo] = useState(false);
  const [percorsoSezione, setPercorsoSezione] = useState('traguardi');
  const [toast, setToast] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const [otpModal, setOtpModal] = useState(false);

  const [gruppi, setGruppi] = useState([]);
  const [gruppoAttivo, setGruppoAttivo] = useState(null);
  const [membriPerGruppo, setMembriPerGruppo] = useState({});
  const [groupStep, setGroupStep] = useState('menu');
  const [groupNome, setGroupNome] = useState('');
  const [codiceInput, setCodiceInput] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joinPreview, setJoinPreview] = useState(null);
  const [ordine, setOrdine] = useState('meno');
  const [gruppoPeriodo, setGruppoPeriodo] = useState('giorno');
  const [ultimoSync, setUltimoSync] = useState(null);
  const [nonLetti, setNonLetti] = useState(0);

  const finestra = useRef(null);
  const timerLotto = useRef(null);
  const toastTimer = useRef(null);
  const visti = useRef({});
  /* copia sempre aggiornata di `dati`, per il codice asincrono (sync) che
     gira fuori dal render e non può fidarsi della closure con cui è nato */
  const datiRef = useRef(null);

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3600);
  }

  const meCard = useMemo(() => ({
    id: user.id, name: user.nickname || user.name, color: user.avatarColor,
  }), [user.id, user.nickname, user.name, user.avatarColor]);

  function applyProfile(u) {
    setUser((prev) => ({
      ...prev, id: u.id, name: u.display_name || prev.name, nickname: u.nickname || '',
      email: u.email || '', phone: u.phone || '', avatarColor: u.avatar_color || PALETTE[0],
    }));
  }

  async function loadLog(uid) {
    const base = vuotoLog();
    const d = await readStore(logKey(uid), base);
    const merged = { ...base, ...d, profile: { ...base.profile, ...(d.profile || {}) } };
    // migrazione dalle versioni con un gruppo solo
    if (!merged.groups?.length && d.group) merged.groups = [d.group];
    delete merged.group;
    visti.current = await readStore(seenKey(uid), {});

    // I gruppi arrivano dal database, non dalla lista salvata sul dispositivo:
    // così un telefono nuovo li ritrova da solo senza reinserire i codici, e
    // quelli sciolti nel frattempo spariscono invece di restare appesi.
    // ATTENZIONE: solo se il database c'è davvero. In modalità locale
    // groups.mine() torna [] per forza, e prendere quel [] per buono
    // cancellava la lista dei gruppi salvata sul dispositivo.
    if (groups.disponibile()) {
      const caricati = await groups.mine();
      const vivi = caricati.map((g) => g.code);
      merged.groups = vivi;
      setGruppi(caricati);
      setGruppoAttivo((prev) => (vivi.includes(prev) ? prev : vivi[0] || null));
    }
    setDati(merged);

    // riallinea le notifiche native all'apertura app: se il sistema le aveva
    // perse (reinstallo, permesso concesso dopo, primo avvio con questo fix)
    // qui vengono riprogrammate dall'ultima sigaretta nota — ma solo se gli
    // avvisi sulle tappe sono accesi, altrimenti l'interruttore in Account
    // spegne il banner in app e lascia però partire le notifiche di sistema.
    const ultima = maxTs(merged.cigs);
    if (ultima && merged.avvisiCorpo !== false) programmaTappe(ultima).catch(() => {});
    if (merged.avvisiCorpo === false) annullaTappe().catch(() => {});
    return merged;
  }

  useEffect(() => {
    let active = true;
    auth.getSession().then(async (session) => {
      if (session?.user && active) {
        applyProfile(session.user);
        await loadLog(session.user.id);
        setIsAuthenticated(true);
      }
      if (active) setSessionChecked(true);
    }).catch((e) => {
      // Se qualcosa va storto qui (rete assente, backend irraggiungibile)
      // NON si può lasciare l'app ferma su "Verifica sessione…": meglio
      // mostrare la schermata di accesso e far riprovare.
      console.error('controllo della sessione non riuscito', e);
      if (active) setSessionChecked(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(i);
  }, []);

  // i contatori si muovono solo dove si vedono, per non far lavorare il telefono a vuoto
  useEffect(() => {
    if (activeTab !== 'oggi' && activeTab !== 'percorso') return;
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, [activeTab]);

  useEffect(() => { setNicknameDraft(user.nickname || ''); }, [user.nickname]);
  useEffect(() => { datiRef.current = dati; }, [dati]);

  /* `pubblica` esiste perché non tutto quello che si salva riguarda il gruppo.
     Il prezzo del pacchetto, il motivo, i se–allora sono roba privata: prima
     ogni carattere digitato in quei campi faceva partire anche un upsert su
     group_members, cioè traffico e scritture per dati che il gruppo non vede
     nemmeno. Le sigarette invece vanno pubblicate subito. */
  function salva(next, { pubblica = true } = {}) {
    setDati(next);
    if (!user.id) return;
    writeStore(logKey(user.id), next);
    if (pubblica && next.groups?.length) groups.publish(next.groups, meCard, next);
  }

  /* ------------------------- sincronizzazione gruppo ------------------------- */

  const sync = useCallback(async (silenzioso = false) => {
    const codici = dati?.groups || [];
    if (!codici.length || !user.id) return;

    const nuoviGruppi = [];
    const nuoviMembri = {};
    const morti = [];
    for (const code of codici) {
      const g = await groups.fetch(code);
      // fetch torna null se il gruppo è stato sciolto o se ne siamo stati
      // rimossi: il codice va tolto dalla lista, altrimenti resta appeso e
      // ogni publish successiva fallisce in silenzio fino al prossimo avvio.
      if (!g) { morti.push(code); continue; }
      nuoviGruppi.push(g);
      nuoviMembri[code] = await groups.fetchMembers(code);
    }
    setGruppi(nuoviGruppi);
    setMembriPerGruppo(nuoviMembri);
    setUltimoSync(Date.now());

    if (morti.length && datiRef.current) {
      const vivi = codici.filter((c) => !morti.includes(c));
      // datiRef e non l'updater funzionale di setDati: dentro l'updater non
      // vanno messi effetti collaterali (in StrictMode React lo esegue due
      // volte, e la scrittura partirebbe doppia).
      const next = { ...datiRef.current, groups: vivi };
      setDati(next);
      writeStore(logKey(user.id), next);
      setGruppoAttivo((prev) => (vivi.includes(prev) ? prev : vivi[0] || null));
    }

    if (silenzioso) return;

    // una notifica per persona, anche se la stessa compare in più gruppi
    const visti_ = { ...visti.current };
    const gia = new Set();
    let nuovi = 0;
    Object.entries(nuoviMembri).forEach(([code, lista]) => {
      const nomeGruppo = nuoviGruppi.find((g) => g.code === code)?.name || 'gruppo';
      lista.forEach((m) => {
        if (m.id === user.id || !m.lastEvent || gia.has(m.id)) return;
        const prima = visti_[m.id];
        if (prima === undefined) { visti_[m.id] = m.lastEvent; return; }
        if (m.lastEvent > prima) {
          gia.add(m.id);
          nuovi += 1;
          visti_[m.id] = m.lastEvent;
          if (dati.notify) {
            const oggiN = m.days?.[ymd(Date.now())] || 0;
            notificaSistema(`${m.name} ha registrato una sigaretta`, `${oggiN} oggi · ${nomeGruppo}`);
            showToast(`${m.name} ha registrato una sigaretta`);
          }
        }
      });
    });
    if (nuovi > 0) {
      visti.current = visti_;
      writeStore(seenKey(user.id), visti_);
      if (!dentroGruppo) setNonLetti((n) => n + nuovi);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dati?.groups, dati?.notify, user.id, dentroGruppo]);

  useEffect(() => {
    if (!isAuthenticated || !dati?.groups?.length) return;
    sync(true);
    const i = setInterval(() => sync(false), dentroGruppo ? 30000 : 90000);
    return () => clearInterval(i);
  }, [isAuthenticated, dati?.groups, dentroGruppo, sync]);

  useEffect(() => { if (dentroGruppo) setNonLetti(0); }, [dentroGruppo]);

  /* Fra le 22 e le 8 niente notifica di sistema: il toast in app resta,
     ma non si sveglia nessuno per una sigaretta altrui. */
  function oraSilenziosa() {
    const h = new Date().getHours();
    return h >= 22 || h < 8;
  }

  function notificaSistema(titolo, corpo, ignoraSilenzio = false) {
    try {
      if (typeof Notification === 'undefined') return;
      if (!ignoraSilenzio && oraSilenziosa()) return;
      if (Notification.permission === 'granted') new Notification(titolo, { body: corpo });
    } catch (e) { /* iframe senza permessi: resta il toast */ }
  }

  async function chiediPermessoNotifiche() {
    try {
      if (typeof Notification === 'undefined') return false;
      if (Notification.permission === 'granted') return true;
      return (await Notification.requestPermission()) === 'granted';
    } catch (e) { return false; }
  }

  /* ---------------------------- accesso ---------------------------- */

  function switchAuthMode(mode) { setAuthMode(mode); setAuthError(''); }

  async function handleAuthSubmit() {
    /* La lunghezza si controlla sul numero LOCALE e con i limiti del paese
       scelto: «almeno 8 cifre» andava bene finché il prefisso era sempre
       +39, ma un numero danese ne ha 8 e uno indiano 10, e con la vecchia
       regola metà mondo passava un controllo che non controllava niente. */
    const locali = cifreLocali(authPhone);
    if (locali.length < authPaese.min || locali.length > authPaese.max) {
      setAuthError(authPaese.min === authPaese.max
        ? `Un numero ${authPaese.nome} ha ${authPaese.min} cifre dopo il ${authPaese.prefisso}.`
        : `Un numero ${authPaese.nome} ha fra ${authPaese.min} e ${authPaese.max} cifre dopo il ${authPaese.prefisso}.`);
      return;
    }
    if (authPassword.length < 6) { setAuthError('La password deve avere almeno 6 caratteri.'); return; }
    if (authMode === 'signup' && authPassword !== authConfirmPassword) {
      setAuthError('Le due password non coincidono.'); return;
    }
    const phone = componiTelefono(authPaese, authPhone);
    setAuthError(''); setAuthBusy(true);
    try {
      const res = authMode === 'signup'
        ? await auth.signUp(phone, authPassword)
        : await auth.signIn(phone, authPassword);
      if (res.error) {
        setAuthError(authMode === 'signup'
          ? (res.error === 'già registrato'
            ? 'Questo numero di telefono ha già un account: prova ad accedere.'
            : `Non è stato possibile creare l'account: ${res.error}`)
          : 'Numero di telefono o password non corretti.');
        return;
      }
      applyProfile(res.user);
      await loadLog(res.user.id);
      setIsAuthenticated(true);
      setActiveTab('oggi');
      showToast(authMode === 'signup' ? 'Account creato. Si comincia 🎯' : 'Bentornato 👋');
      setAuthPassword(''); setAuthConfirmPassword('');
    } catch (err) {
      setAuthError('Errore di connessione: controlla la tua rete e riprova.');
    } finally {
      setAuthBusy(false);
    }
  }

  /* ---------------------------- account ---------------------------- */

  async function handleSaveAccount() {
    const name = user.name.trim();
    const nickname = nicknameDraft.trim();
    if (!name) { showToast('Il nome non può essere vuoto.'); return; }
    const res = await auth.updateProfile(user.id, {
      display_name: name, nickname: nickname || '', email: user.email.trim(),
      phone: user.phone.trim(), avatar_color: user.avatarColor,
    });
    if (res.error === 'nickname') { showToast('Nickname già in uso da un altro utente.'); return; }
    if (res.error) { showToast(`Non è stato possibile salvare: ${res.error}`); return; }
    setUser((u) => ({ ...u, nickname }));
    if (dati?.groups?.length) {
      groups.publish(dati.groups, { id: user.id, name: nickname || name, color: user.avatarColor }, dati);
    }
    showToast('Modifiche salvate ✅');
  }

  async function handlePasswordRecovery() {
    const res = await auth.requestRecovery(user.phone);
    if (res?.error === 'sms-non-disponibile') {
      showToast('Recupero via SMS non ancora attivo: serve un provider SMS e il numero verificato.');
      return;
    }
    if (res?.error) {
      showToast(`Non è stato possibile inviare il codice: ${res.error}`);
      return;
    }
    showToast('Codice OTP inviato via SMS al numero verificato 📱');
    setOtpModal(true);
  }

  async function handleVerifyRecovery(code, newPassword) {
    const res = await auth.verifyRecovery(user.phone, code, newPassword);
    if (res?.error) return res;
    setOtpModal(false);
    showToast('Password aggiornata ✅');
    return {};
  }

  async function handleChangePassword() {
    if (!pwFields.current || !pwFields.next) { showToast('Inserisci la password attuale e quella nuova.'); return; }
    if (pwFields.next.length < 6) { showToast('La nuova password deve avere almeno 6 caratteri.'); return; }
    if (pwFields.next !== pwFields.confirm) { showToast('La conferma non coincide con la nuova password.'); return; }
    const res = await auth.changePassword(user.id, pwFields.current, pwFields.next);
    if (res.error) { showToast('La password attuale non è corretta.'); return; }
    setPwFields({ current: '', next: '', confirm: '' });
    showToast('Password aggiornata ✅');
  }

  async function handleToggleNotifiche() {
    const prossimo = !dati.notify;
    if (prossimo) {
      const ok = await chiediPermessoNotifiche();
      showToast(ok ? 'Avvisi attivi anche fuori dall’app.' : 'Avvisi attivi dentro l’app.');
    } else {
      showToast('Avvisi silenziati. Il gruppo vede comunque i tuoi conteggi.');
    }
    salva({ ...dati, notify: prossimo }, { pubblica: false });
  }

  async function handleToggleCorpo() {
    const prossimo = dati.avvisiCorpo === false;
    if (prossimo) {
      const ok = await chiediPermessoNotifiche();
      // riacceso l'interruttore, le tappe vanno riprogrammate: senza questo
      // restava acceso solo il banner in app fino alla sigaretta successiva.
      const ultima = maxTs(dati.cigs);
      if (ultima) programmaTappe(ultima).catch(() => {});
      showToast(ok
        ? 'Ti avviso a ogni tappa, anche fuori dall’app.'
        : 'Tappe attive dentro l’app. Il browser non ha concesso le notifiche di sistema.');
    } else {
      // Spegnere l'interruttore deve spegnere anche quelle GIÀ programmate.
      // Prima non succedeva: le notifiche di sistema continuavano ad arrivare
      // per giorni dopo che l'utente le aveva disattivate.
      annullaTappe().catch(() => {});
      showToast('Avvisi sulle tappe del corpo disattivati.');
    }
    salva({ ...dati, avvisiCorpo: prossimo }, { pubblica: false });
  }

  function handleProfileChange(campo, valore) {
    salva({ ...dati, profile: { ...dati.profile, [campo]: valore } }, { pubblica: false });
  }

  function resetAuthState() {
    setActiveTab('oggi'); setDentroGruppo(false); setAuthMode('login');
    setAuthPhone(''); setAuthPaese(PREFISSO_DEFAULT);
    setAuthPassword(''); setAuthConfirmPassword(''); setAuthError('');
    setIsAuthenticated(false); setDati(null); setUltimoTs(null);
    setCraving(false); setRespiro(false); setUmore(false);
    setTante(false); setLotto(null);
    setGruppi([]); setGruppoAttivo(null); setMembriPerGruppo({});
    setGroupStep('menu'); setUser(UTENTE_VUOTO);
    // roba dell'account precedente che non deve sopravvivere al logout:
    // su un telefono condiviso finirebbe sotto gli occhi di chi entra dopo
    setPwFields({ current: '', next: '', confirm: '' });
    setNicknameDraft(''); setOtpModal(false); setRiparti(null); setTappaBanner(null);
    setNonLetti(0); setUltimoSync(null);
    visti.current = {};
  }

  function handleResetLog() {
    setConfirmModal({
      title: 'Azzerare lo storico?',
      body: 'Cancella tutte le sigarette registrate e fa ripartire la settimana di misura. Account, gruppo e piano restano.',
      confirmLabel: 'Azzera', danger: true,
      onConfirm: () => {
        salva({
          ...vuotoLog(), groups: dati.groups, notify: dati.notify, avvisiCorpo: dati.avvisiCorpo,
          onboarded: true, profile: dati.profile, plans: dati.plans,
        });
        annullaTappe().catch(() => {});
        // anche i "già visti" del gruppo vanno azzerati, altrimenti restano
        // riferiti a eventi che non esistono più
        visti.current = {};
        writeStore(seenKey(user.id), {});
        setUltimoTs(null); setConfirmModal(null); showToast('Storico azzerato.');
      },
    });
  }

  function handleDeleteAccount() {
    setConfirmModal({
      title: 'Eliminare l’account?',
      body: 'Questa azione è definitiva: perdi lo storico, il piano e il posto in classifica.',
      confirmLabel: 'Elimina account', danger: true,
      onConfirm: async () => {
        for (const c of dati?.groups || []) await groups.leave(c, user.id);
        await auth.deleteAccount(user.id);
        await annullaTappe().catch(() => {});
        setConfirmModal(null); resetAuthState(); showToast('Account eliminato.');
      },
    });
  }

  function handleLogout() {
    setConfirmModal({
      title: 'Uscire dall’account?',
      body: 'Dovrai effettuare di nuovo l’accesso per continuare a registrare.',
      confirmLabel: 'Esci',
      onConfirm: async () => {
        await auth.signOut(); await annullaTappe().catch(() => {});
        setConfirmModal(null); resetAuthState(); showToast('Hai effettuato il logout.');
      },
    });
  }

  /* ---------------------------- gruppo ---------------------------- */

  async function handleCreaGruppo() {
    // groups.create lancia un'eccezione se il database rifiuta: senza questo
    // try/catch l'errore restava una promise non gestita e l'utente vedeva
    // semplicemente non succedere niente.
    let g;
    try {
      g = await groups.create(groupNome, meCard);
    } catch (e) {
      showToast('Non è stato possibile creare il gruppo. Controlla la rete e riprova.');
      return;
    }
    const next = { ...dati, groups: [...(dati.groups || []), g.code] };
    setGruppi((prev) => [...prev, g]);
    setGruppoAttivo(g.code);
    salva(next);
    await groups.publish(next.groups, meCard, next);
    setGroupNome(''); setGroupStep('menu');
    showToast(`Gruppo creato. Codice: ${g.code}`);
  }

  async function handleVerificaCodice() {
    const code = codiceInput.trim().toUpperCase();
    if (!code) return;
    if ((dati.groups || []).includes(code)) {
      setJoinError('Fai già parte di questo gruppo.'); setJoinPreview(null); return;
    }
    const p = await groups.preview(code);
    if (!p) { setJoinError('Codice non valido o scaduto.'); setJoinPreview(null); return; }
    setJoinPreview(p); setJoinError('');
  }

  async function handleConfermaJoin() {
    const code = codiceInput.trim().toUpperCase();
    const res = await groups.join(code, meCard);
    if (res.error) { setJoinError('Non è stato possibile unirsi al gruppo.'); return; }
    const next = { ...dati, groups: [...(dati.groups || []), code] };
    setGruppi((prev) => [...prev.filter((g) => g.code !== code), res.group]);
    setGruppoAttivo(code);
    salva(next);
    await groups.publish(next.groups, meCard, next);
    setCodiceInput(''); setJoinPreview(null); setGroupStep('menu');
    showToast(`Sei entrato in ${res.group.name}`);
  }

  function handleEsciGruppo() {
    const code = gruppoAttivo;
    const nome = gruppi.find((g) => g.code === code)?.name || 'questo gruppo';
    setConfirmModal({
      title: `Uscire da ${nome}?`,
      body: 'Sparisci dalla sua classifica e i membri non ricevono più i tuoi aggiornamenti. Il tuo storico personale e gli altri gruppi restano.',
      confirmLabel: 'Esci dal gruppo', danger: true,
      onConfirm: async () => {
        await groups.leave(code, user.id);
        const rimasti = (dati.groups || []).filter((c) => c !== code);
        salva({ ...dati, groups: rimasti });
        setGruppi((prev) => prev.filter((g) => g.code !== code));
        setMembriPerGruppo((prev) => { const n = { ...prev }; delete n[code]; return n; });
        setGruppoAttivo(rimasti[0] || null);
        setGroupStep('menu');
        setConfirmModal(null);
        showToast(`Sei uscito da ${nome}.`);
      },
    });
  }

  function handleCopiaCodice() {
    const code = gruppoAttivo;
    if (!code) return;
    try { navigator.clipboard.writeText(code); showToast('Codice copiato'); }
    catch (e) { showToast(`Codice: ${code}`); }
  }

  /* Due dettagli che sembrano pignoleria e invece decidono se il file arriva:
     1. il link va ATTACCATO al documento prima del click — Firefox ignora il
        click su un elemento che non sta nel DOM, e il download non parte;
     2. revokeObjectURL non va chiamato subito dopo il click: il browser deve
        ancora leggere il blob, e revocarlo nello stesso giro di eventi può
        annullare il download appena iniziato. Si aspetta un attimo. */
  function scarica(contenuto, nome, tipo) {
    try {
      const blob = new Blob([contenuto], { type: tipo });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nome;
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
      return true;
    } catch (e) { return false; }
  }

  function handleExportJSON() {
    if (!dati) return;
    const ok = scarica(JSON.stringify(dati, null, 2), `smetto-backup-${ymd(Date.now())}.json`, 'application/json');
    showToast(ok ? 'Backup scaricato ✅' : 'Non è stato possibile scaricare il file.');
  }

  function handleExportCSV() {
    if (!dati) return;
    const righe = [['data', 'ora', 'tipo', 'motivo']];
    [...dati.cigs].sort((a, b) => a - b).forEach((ts) => {
      righe.push([ymd(ts), ora(ts), 'sigaretta', dati.tags[ts] || '']);
    });
    [...dati.resists].sort((a, b) => a - b).forEach((ts) => {
      righe.push([ymd(ts), ora(ts), 'voglia superata', '']);
    });
    (dati.checkins || []).forEach((ts) => righe.push([ymd(ts), ora(ts), 'giorno a zero', '']));
    const csv = righe.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const ok = scarica(csv, `smetto-registro-${ymd(Date.now())}.csv`, 'text/csv;charset=utf-8;');
    showToast(ok ? 'Registro scaricato ✅' : 'Non è stato possibile scaricare il file.');
  }

  function handleCheckin() {
    const ts = Date.now();
    salva({ ...dati, checkins: [...(dati.checkins || []), ts] });
    showToast('Segnato: oggi zero 🌱');
  }

  /* ---------------------------- conteggio ---------------------------- */

  const apriFinestra = (ts) => {
    setUltimoTs(ts);
    clearTimeout(finestra.current);
    finestra.current = setTimeout(() => setUltimoTs(null), 25000);
  };

  const minutiPer = MINUTI_PER_SIGARETTA[dati?.profile?.sesso || 'non_detto'];
  const unitario = dati?.profile?.prezzoPacchetto
    ? dati.profile.prezzoPacchetto / (dati.profile.perPacchetto || 20)
    : 0;

  function registraSigaretta() {
    const ts = Date.now();
    const precedente = maxTs(dati.cigs);
    const pausa = precedente ? ts - precedente : 0;
    const ricaduta = precedente !== null && pausa >= 8 * 3600000;

    salva({
      ...dati,
      start: dati.start ?? ts,
      cigs: [...dati.cigs, ts],
      tappeViste: { ref: ts, idx: [] },              // il conto del corpo riparte
      // Si conta una ripartenza esattamente quando mostriamo la schermata del
      // rilancio, cioè da 8 ore in su. Prima la soglia qui era 24 ore, quindi
      // "è la Nª volta che riparti" non contava le pause fra le 8 e le 24 ore
      // che pure avevano fatto comparire quella schermata.
      ripartenze: (dati.ripartenze || 0) + (ricaduta ? 1 : 0),
    });
    setTappaBanner(null);
    // le tappe di recupero ripartono da questa sigaretta: a telefono chiuso
    // devono comunque arrivare, quindi le riprogrammiamo subito — sempre che
    // l'utente non le abbia disattivate.
    if (dati.avvisiCorpo !== false) programmaTappe(ts).catch(() => {});

    if (ricaduta) {
      /* Niente finestra dei 25 secondi qui: la schermata della ricaduta fa
         già la stessa domanda ("cosa è successo?") e con più spazio. Aprire
         anche la finestra vorrebbe dire ritrovarsi la stessa domanda una
         seconda volta, in piccolo, appena chiusa la schermata. */
      setRiparti({ ts, pausa, frase: RILANCI[Math.floor(Math.random() * RILANCI.length)] });
    } else {
      apriFinestra(ts);
      showToast('Registrata. Nessun problema, si continua.');
    }
  }

  /* Le sigarette che uno si è dimenticato di segnare.

     Tre cose vanno fatte bene, e nessuna è ovvia:

     1. NON tutte allo stesso istante. I timestamp qui reggono l'intervallo
        medio, la fascia oraria a rischio e il confine di giornata della
        classifica: cinque sigarette nello stesso minuto li falserebbero
        tutti. `distribuisci` le sparge dentro la finestra scelta.

     2. Le TAPPE DEL CORPO ripartono solo se una di queste è più recente
        dell'ultima già registrata. Segnare adesso tre sigarette di ieri non
        deve azzerare le otto ore pulite che uno ha oggi — sarebbe la
        punizione perfetta per chi è stato onesto.

     3. Niente schermata della ricaduta e niente conteggio delle ripartenze.
        Quella schermata serve a chi ha appena ceduto dopo una pausa lunga,
        non a chi sta mettendo in ordine il registro. */
  function registraArretrate(quante, finestra) {
    if (!finestra) return;
    const nuovi = distribuisci(quante, finestra, dati.cigs);
    if (!nuovi.length) return;

    const primaDiTutto = dati;
    const nuovoMin = nuovi[0];
    const riavvio = tappeDaRiavviare(dati.cigs, nuovi);

    salva({
      ...dati,
      // il percorso comincia dalla prima sigaretta conosciuta, anche se
      // quella prima sigaretta la scopriamo adesso
      start: dati.start === null ? nuovoMin : Math.min(dati.start, nuovoMin),
      cigs: [...dati.cigs, ...nuovi],
      ...(riavvio === null ? {} : { tappeViste: { ref: riavvio, idx: [] } }),
    });

    if (riavvio !== null) {
      setTappaBanner(null);
      if (dati.avvisiCorpo !== false) programmaTappe(riavvio).catch(() => {});
    }

    setTante(false);
    setUltimoTs(null);
    setLotto({ ts: nuovi, quante: nuovi.length, quando: finestra.breve, prima: primaDiTutto });
    clearTimeout(timerLotto.current);
    timerLotto.current = setTimeout(() => setLotto(null), 40000);
  }

  /* Annullare rimette esattamente il registro di prima invece di togliere
     i timestamp uno per uno: `start` e `tappeViste` erano cambiati insieme
     alle sigarette, e ricostruirli a ritroso è il modo migliore per
     sbagliarli. */
  function annullaLotto() {
    if (!lotto) return;
    salva(lotto.prima);
    riallineaTappe(lotto.prima.cigs);
    setLotto(null);
    showToast('Annullato.');
  }

  /* La causa scelta nella schermata della ricaduta non finisce nel vuoto:
     diventa l'etichetta di QUELLA sigaretta nel registro. Da lì risale nel
     Percorso come «lo stress ti ha innescato 6 sigarette» e come suggerimento
     di scrivere il se–allora giusto. È il modo di mantenere la promessa fatta
     all'utente in quel momento: «saperlo serve». */
  function handleCausaRicaduta(causa) {
    if (!riparti?.ts || causa === '—') return;
    salva({ ...dati, tags: { ...dati.tags, [riparti.ts]: causa } });
  }

  /* «Come ti senti oggi?» non è un sondaggio: è uno smistamento. Ogni
     risposta porta da qualche parte, altrimenti chiedere è solo un modo
     per far toccare un bottone in più. */
  function handleUmore(id) {
    setUmore(false);
    if (id === 'voglia') { setCraving(true); return; }
    if (id === 'fatica') { setActiveTab('aiuto'); return; }
    if (id === 'bene') {
      // se oggi è davvero a zero, «sto bene» vale come conferma e tiene
      // la persona in classifica: è l'unico modo di restarci senza fumare
      if (!checkedInOggi && (s?.oggi ?? 0) === 0 && dati?.start) { handleCheckin(); return; }
      showToast('Bene. Continua così 🌱');
      return;
    }
    showToast('Va bene anche così. Un passo alla volta.');
  }

  function registraResistenza() {
    const ts = Date.now();
    salva({ ...dati, start: dati.start ?? ts, resists: [...dati.resists, ts] });
  }

  // dopo aver tolto una sigaretta dal registro, le tappe vanno riallineate
  // all'ultima rimasta (o annullate se non ne restano più).
  function riallineaTappe(cigsRimaste) {
    const ultima = maxTs(cigsRimaste);
    if (ultima && dati.avvisiCorpo !== false) programmaTappe(ultima).catch(() => {});
    else annullaTappe().catch(() => {});
  }

  function handleAnnulla() {
    if (!ultimoTs) return;
    const tags = { ...dati.tags };
    delete tags[ultimoTs];
    const cigs = dati.cigs.filter((t) => t !== ultimoTs);
    salva({ ...dati, cigs, tags });
    riallineaTappe(cigs);
    setUltimoTs(null);
  }

  function handleElimina(ts) {
    const tags = { ...dati.tags };
    delete tags[ts];
    const cigs = dati.cigs.filter((t) => t !== ts);
    salva({ ...dati, cigs, tags });
    if (ts === ultimoTs) setUltimoTs(null);
    // rilevante solo se abbiamo tolto proprio l'ultima sigaretta cronologica
    if (ts === maxTs(dati.cigs)) riallineaTappe(cigs);
  }

  function handleTag(ts, t) {
    const tags = { ...dati.tags };
    if (tags[ts] === t) delete tags[ts]; else tags[ts] = t;
    salva({ ...dati, tags });
    setUltimoTs(null);
  }

  function handleSalvaPiano(trigger, testo) {
    salva({ ...dati, plans: { ...dati.plans, [trigger]: testo } }, { pubblica: false });
    if (testo) showToast('Piano salvato.');
  }

  /* ---------------------------- calcoli ---------------------------- */

  const s = useMemo(() => {
    if (!dati || !dati.start) return null;
    const cigs = [...dati.cigs].sort((a, b) => a - b);
    const giorno = dayDiff(dati.start, now);
    const sett = Math.floor(giorno / 7);
    // addGiorni invece di + n*DAY: nelle settimane del cambio d'ora
    // l'aritmetica sui millisecondi sposta i confini di giornata di un'ora
    const inizioSett = addGiorni(dati.start, sett * 7);
    const giorniTrascorsi = giorno - sett * 7 + 1;

    const oggiTs = sod(now);
    const oggiList = cigs.filter((t) => t >= oggiTs);
    const oggi = oggiList.length;
    const inizioIeri = addGiorni(oggiTs, -1);
    const ieri = giorno >= 1 ? cigs.filter((t) => t >= inizioIeri && t < oggiTs).length : null;

    const settTot = cigs.filter((t) => t >= inizioSett).length;
    const media = settTot / giorniTrascorsi;

    const precInizio = addGiorni(inizioSett, -7);
    const precCigs = sett > 0 ? cigs.filter((t) => t >= precInizio && t < inizioSett).length : 0;
    const mediaPrec = sett > 0 ? precCigs / 7 : null;

    const obiettivo = mediaPrec === null ? null : prossimaMedia(mediaPrec);
    const budget = obiettivo === null ? null : Math.round(obiettivo);

    const perGiorno = Array.from({ length: 7 }, (_, i) => {
      const g = addGiorni(inizioSett, i);
      const fine = addGiorni(g, 1);
      return {
        ts: g, futuro: i + 1 > giorniTrascorsi,
        n: cigs.filter((t) => t >= g && t < fine).length,
        label: new Date(g).toLocaleDateString('it-IT', { weekday: 'narrow' }),
      };
    });
    const indiceOggi = perGiorno.findIndex((d) => dayDiff(d.ts, now) === 0);
    const giorniSottoBudget = budget === null ? null : perGiorno.filter((d) => !d.futuro && d.n <= budget).length;

    const giorni7 = Math.min(7, giorno + 1);
    const media7 = cigs.filter((t) => t >= addGiorni(oggiTs, -(giorni7 - 1))).length / giorni7;

    const perFascia = FASCE.map((f) => ({
      label: f.label.slice(0, 3),
      n: oggiList.filter((t) => { const h = new Date(t).getHours(); return h >= f.from && h < f.to; }).length,
      futuro: false,
    }));
    const maxFascia = Math.max(...perFascia.map((f) => f.n));
    const fasciaTopIndex = maxFascia > 0 ? perFascia.findIndex((f) => f.n === maxFascia) : -1;
    const fasciaTop = fasciaTopIndex >= 0 ? FASCE[fasciaTopIndex] : null;

    let intervalloMedio = null;
    if (oggiList.length >= 2) {
      const gaps = oggiList.slice(1).map((t, i) => t - oggiList[i]);
      intervalloMedio = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    }

    const conteggio = {};
    cigs.filter((t) => t >= inizioSett).forEach((t) => {
      const g = dati.tags[t];
      if (g) conteggio[g] = (conteggio[g] || 0) + 1;
    });
    const topTrigger = Object.entries(conteggio).sort((a, b) => b[1] - a[1])[0] || null;

    const ultima = cigs.length ? cigs[cigs.length - 1] : null;
    const minutiDaUltima = ultima ? (now - ultima) / 60000 : 0;
    const idxTappa = TAPPE.findIndex((t) => t.min > minutiDaUltima);
    const prossimaTappa = idxTappa >= 0 ? {
      ...TAPPE[idxTappa],
      mancano: (TAPPE[idxTappa].min - minutiDaUltima) * 60000,
      progresso: idxTappa === 0
        ? minutiDaUltima / TAPPE[0].min
        : (minutiDaUltima - TAPPE[idxTappa - 1].min) / (TAPPE[idxTappa].min - TAPPE[idxTappa - 1].min),
    } : null;

    return {
      giorno, sett, giorniTrascorsi, oggi, ieri, media, media7, mediaPrec, obiettivo, budget,
      perGiorno, indiceOggi, giorniSottoBudget, settTot, perFascia, fasciaTop, fasciaTopIndex,
      intervalloMedio, ultima, minutiDaUltima, prossimaTappa,
      resistOggi: dati.resists.filter((t) => t >= oggiTs).length,
      resistSett: dati.resists.filter((t) => t >= inizioSett).length,
      topTrigger,
    };
  }, [dati, now]);

  /* Tappe del corpo: quando il tempo dall'ultima sigaretta supera una soglia,
     parte la notifica. Se l'app è rimasta chiusa e ne sono passate più di una,
     avvisa solo della più alta ma le segna tutte come viste. */
  useEffect(() => {
    if (!isAuthenticated || !dati || !s?.ultima) return;
    const minuti = (now - s.ultima) / 60000;
    const viste = dati.tappeViste?.ref === s.ultima ? (dati.tappeViste.idx || []) : [];
    const nuove = TAPPE.map((t, i) => i).filter((i) => minuti >= TAPPE[i].min && !viste.includes(i));
    if (nuove.length === 0) return;

    const ultima = TAPPE[nuove[nuove.length - 1]];
    if (dati.avvisiCorpo !== false) {
      notificaSistema(`${ultima.avviso} 🫁`, ultima.avvisoTesto);
      setTappaBanner(ultima);
    }
    salva({ ...dati, tappeViste: { ref: s.ultima, idx: [...viste, ...nuove] } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, s?.ultima, isAuthenticated]);

  /* i due contatori: soldi e tempo, aggiornati ogni secondo */
  /* PARTE PESANTE — scandisce dati.cigs con dei filter(). Deve ricalcolare
     solo quando cambiano i dati veri (sigaretta registrata/tolta, profilo
     modificato) o quando cambia il giorno — MAI a ogni tick di secondo,
     altrimenti su mesi di storico sono decine di migliaia di confronti al
     secondo sul thread principale.
     `oggiChiave` è ricalcolato a ogni render (costa nulla: solo un new Date)
     ma resta lo STESSO valore per tutto il giorno, quindi da solo non fa
     scattare il ricalcolo del useMemo qui sotto finché non cambia data. */
  const oggiChiave = sod(now);
  const media7 = s?.media7 ?? null;
  const contiBase = useMemo(() => {
    if (!dati?.profile?.prezzoPacchetto || !dati.start) return null;
    const unit = dati.profile.prezzoPacchetto / (dati.profile.perPacchetto || 20);
    const minPer = MINUTI_PER_SIGARETTA[dati.profile.sesso || 'non_detto'];
    const oggiTs = oggiChiave;

    // ritmo di partenza: quello dichiarato, altrimenti la media della prima settimana
    const giorniTot = dayDiff(dati.start, oggiTs) + 1;
    const baseGiorni = Math.min(7, giorniTot);
    const baseReale = dati.cigs.filter((t) => t < addGiorni(dati.start, baseGiorni)).length / baseGiorni;
    const baseline = dati.profile.baseline || baseReale || 0;

    const oggiFumate = dati.cigs.filter((t) => t >= oggiTs).length;

    const inizioSett = addGiorni(oggiTs, -((giorniTot - 1) % 7));
    const settFumate = dati.cigs.filter((t) => t >= inizioSett).length;

    const mediaOra = media7 ?? baseline;

    // conteggio per giorno degli ultimi 14 giorni: i filter costosi girano
    // una volta al giorno, non una volta al secondo
    const giorniCurva = Math.min(14, giorniTot);
    const curvaGiorni = [];
    for (let i = giorniCurva - 1; i >= 0; i -= 1) {
      const g = addGiorni(oggiTs, -i);
      const fine = addGiorni(g, 1);
      const n = dati.cigs.filter((t) => t >= g && t < fine).length;
      curvaGiorni.push({ n, label: dataBreve(g) });
    }

    return {
      unit, minPer, baseline, oggiTs, inizioSett, mediaOra, curvaGiorni,
      totCigs: dati.cigs.length, oggiFumate, settFumate, startSod: sod(dati.start),
    };
    // `s` intero NON va nelle dipendenze: è un oggetto nuovo ogni 15 secondi
    // (dipende da `now`) e trascinava con sé tutti i filter costosi qui sopra.
    // Di `s` qui serve un solo numero, e quello basta come dipendenza.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dati, media7, oggiChiave]);

  /* PARTE LEGGERA — pura aritmetica sui numeri già aggregati sopra: questa
     sì può girare a ogni tick di secondo senza mai toccare dati.cigs. */
  const conti = useMemo(() => {
    if (!contiBase) return null;
    const adesso = Date.now();
    const {
      unit, minPer, baseline, oggiTs, inizioSett, mediaOra,
      totCigs, oggiFumate, settFumate, curvaGiorni, startSod,
    } = contiBase;

    // giorni frazionari: è questo che fa muovere il contatore secondo per secondo
    const giorniFraz = (adesso - startSod) / DAY;
    const attese = baseline * giorniFraz;
    const evitate = attese - totCigs;      // negativo se sei sopra il tuo ritmo

    const fraOggi = (adesso - oggiTs) / DAY;
    const oggiRisparmio = (baseline * fraOggi - oggiFumate) * unit;

    const settGiorni = (adesso - inizioSett) / DAY;
    const settimana = (baseline * settGiorni - settFumate) * unit;

    const annoProiezione = (baseline - mediaOra) * 365 * unit;

    // curva cumulativa: i conteggi giornalieri sono già pronti, resta solo
    // da sommare e aggiustare la quota di "oggi" col tempo trascorso
    let acc = 0;
    const curva = curvaGiorni.map(({ n, label }, idx) => {
      const isOggi = idx === curvaGiorni.length - 1;
      const quota = isOggi ? fraOggi : 1;
      acc += (baseline * quota - n) * unit;
      return { v: acc, label };
    });

    return {
      unitario: unit, minutiPer: minPer, baseline, evitate,
      inRosso: evitate < 0,
      risparmiato: evitate * unit,
      minutiSalvati: evitate * minPer,
      minutiPersiTotali: totCigs * minPer,
      minutiPersiOggi: oggiFumate * minPer,
      minutiAnnoRitmo: mediaOra * 365 * minPer,
      oggiRisparmio, settimana, annoProiezione, curva,
    };
  }, [contiBase, tick, now]);

  const tappe = useMemo(() => {
    const quanto = (min) => {
      if (min < 60) return `${min} min`;
      if (min < 60 * 24) return `${min / 60} ore`;
      const g = min / 60 / 24;
      if (g < 30) return g === 1 ? '1 giorno' : `${g} giorni`;
      if (g < 365) return `${Math.round(g / 30)} mesi`;
      const a = Math.round(g / 365);
      return a === 1 ? '1 anno' : `${a} anni`;
    };
    const minuti = s?.ultima ? (now - s.ultima) / 60000 : 0;
    const idx = TAPPE.findIndex((t) => t.min > minuti);
    return TAPPE.map((t, i) => ({
      ...t,
      raggiunta: minuti >= t.min,
      corrente: i === idx,
      // quanto manca alla tappa in corso: la Timeline lo mostra sotto la barra
      manca: i === idx ? durata((t.min - minuti) * 60000) : null,
      progresso: i === idx ? (i === 0 ? minuti / t.min : (minuti - TAPPE[i - 1].min) / (t.min - TAPPE[i - 1].min)) : 0,
      // il singolare conta: la tappa dei 365 giorni scriveva «1 anni»
      quando: quanto(t.min),
    }));
  }, [s?.ultima, now]);

  /* Il piano delle prossime settimane.

     Qui c'era uno sfasamento di una settimana: la prima riga conteneva
     l'obiettivo della settimana IN CORSO — lo stesso numero che il Recap
     mostra come «OBIETTIVO SETTIMANA n» — ma la etichettava «S n+1» e le
     metteva accanto la data del lunedì successivo. Chi confrontava le due
     schermate vedeva lo stesso valore attribuito a due settimane diverse.

     La regola giusta è una sola: la prima riga del piano è la prima
     settimana che ha davvero un obiettivo. Se una media della settimana
     scorsa esiste (mediaPrec) quella settimana è QUESTA; se siamo ancora
     nella settimana di misura, che per definizione non ha limiti, il piano
     comincia dalla prossima. */
  const piano = useMemo(() => {
    if (!dati) return null;
    const base = s?.mediaPrec ?? s?.media ?? dati.profile?.baseline;
    if (!base || base <= 0) return null;

    const settCorrente = s?.sett ?? 0;
    const conObiettivoOra = s?.mediaPrec != null;      // fuori dalla settimana di misura
    const primaSett = conObiettivoOra ? settCorrente : settCorrente + 1;
    const lunediSett = (idx) => (dati.start ? addGiorni(dati.start, idx * 7) : addGiorni(now, idx * 7));

    const righe = [];
    let m = base;
    let i = 0;
    while (i < 40) {
      m = prossimaMedia(m);
      const idxSett = primaSett + i;                   // indice 0-based della settimana
      righe.push({
        n: idxSett + 1,                                // numero mostrato, come nel Recap
        media: m,
        data: dataBreve(lunediSett(idxSett)),
        perc: Math.round((m / base) * 100),
        corrente: i === 0 && conObiettivoOra,
      });
      i += 1;
      if (m < 0.5) break;
    }

    // la prima settimana interamente a zero è quella dopo l'ultima del piano
    const settZero = primaSett + righe.length;
    return {
      righe: righe.slice(0, 8),
      settimaneRestanti: Math.max(1, settZero - settCorrente),
      dataZero: new Date(lunediSett(settZero))
        .toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }),
    };
  }, [dati, s, now]);

  const record = useMemo(() => {
    if (!dati?.cigs.length) return { piuLungo: null };
    const cigs = [...dati.cigs].sort((a, b) => a - b);
    let piuLungo = now - cigs[cigs.length - 1];
    for (let i = 1; i < cigs.length; i += 1) piuLungo = Math.max(piuLungo, cigs[i] - cigs[i - 1]);
    return { piuLungo };
  }, [dati, now]);

  const mese = useMemo(() => {
    if (!dati || !dati.start) return null;
    const cigs = dati.cigs;
    const oggiTs = sod(now);
    const giorniTot = dayDiff(dati.start, now) + 1;
    const finestra30 = Math.min(30, giorniTot);
    const inizio30 = addGiorni(oggiTs, -(finestra30 - 1));
    const totale = cigs.filter((t) => t >= inizio30).length;
    const media = totale / finestra30;

    const inizioPrec30 = addGiorni(inizio30, -30);
    const prec30 = cigs.filter((t) => t >= inizioPrec30 && t < inizio30).length;
    const giorniPrec = Math.max(0, Math.min(30, giorniTot - finestra30));
    const mediaPrec = giorniPrec > 0 ? prec30 / giorniPrec : 0;

    const nSett = Math.min(5, Math.ceil(giorniTot / 7));
    const perSettimana = Array.from({ length: nSett }, (_, i) => {
      const idx = nSett - 1 - i;
      const fine = addGiorni(oggiTs, -idx * 7 + 1);
      const inizio = addGiorni(fine, -7);
      const validi = Math.max(1, Math.min(7, dayDiff(Math.max(inizio, sod(dati.start)), Math.min(fine - 1, oggiTs)) + 1));
      const n = cigs.filter((t) => t >= inizio && t < fine).length;
      return { label: idx === 0 ? 'ora' : `−${idx}s`, n: Math.round((n / validi) * 10) / 10, futuro: false };
    });

    const perGiornoMese = Array.from({ length: finestra30 }, (_, i) => {
      const g = addGiorni(inizio30, i);
      const fine = addGiorni(g, 1);
      return { ts: g, n: cigs.filter((t) => t >= g && t < fine).length };
    });
    const giorniZero = perGiornoMese.filter((d) => d.n === 0).length;

    /* Stesso ritmo di partenza usato dai contatori nella schermata Piano:
       prima qui si usava sempre e solo la media dei primi giorni registrati,
       ignorando il valore dichiarato nell'onboarding. Risultato: chi aveva
       detto «ne fumo 20» e ne aveva registrate 12 la prima settimana si
       vedeva due numeri di "sigarette risparmiate" diversi in due schermate
       della stessa app. */
    const baseGiorni = Math.min(7, giorniTot);
    const baseReale = cigs.filter((t) => t < addGiorni(dati.start, baseGiorni)).length / baseGiorni;
    const baseline = dati.profile?.baseline || baseReale || 0;
    const risparmiate = Math.max(0, Math.round(baseline * finestra30 - totale));

    return { totale, media, mediaPrec, perSettimana, giorniZero, resists: dati.resists.filter((t) => t >= inizio30).length, risparmiate };
  }, [dati, now]);

  const registro = useMemo(() => {
    if (!dati) return [];
    const g = new Map();
    [...dati.cigs].sort((a, b) => b - a).forEach((t) => {
      const k = sod(t);
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(t);
    });
    return [...g.entries()].slice(0, 14);
  }, [dati]);

  const checkedInOggi = useMemo(
    () => (dati?.checkins || []).some((t) => sod(t) === sod(now)),
    [dati, now],
  );

  const membriAttuali = useMemo(
    () => membriPerGruppo[gruppoAttivo] || [],
    [membriPerGruppo, gruppoAttivo],
  );

  /* Chi non registra da 24 ore esce dalla classifica: senza dati il confronto
     non vuol dire niente, e "sparire" non deve essere una strategia vincente.
     Basta una sigaretta o un check-in "oggi zero" per rientrare. */
  const SOGLIA_INATTIVO = DAY;

  const ioAttivo = useMemo(() => {
    const ultimo = maxTs([...(dati?.cigs || []), ...(dati?.resists || []), ...(dati?.checkins || [])]);
    if (!ultimo) return false;
    return now - ultimo < SOGLIA_INATTIVO;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dati, now]);

  const classifica = useMemo(() => {
    const oggiKey = ymd(now);
    const giorniPeriodo = gruppoPeriodo === 'giorno' ? 1 : gruppoPeriodo === 'settimana' ? 7 : 30;
    // addGiorni e non `sod(now) − i*DAY`: nei due giorni del cambio d'ora
    // quel calcolo cade alle 23:00 o all'01:00 del giorno prima, e ymd()
    // restituiva la data sbagliata. La classifica saltava o contava due
    // volte un giorno, due volte l'anno, senza nessun segnale evidente.
    const chiavi = Array.from({ length: giorniPeriodo }, (_, i) => ymd(addGiorni(now, -i)));
    const ultimi7 = Array.from({ length: 7 }, (_, i) => ymd(addGiorni(now, -i)));

    return membriAttuali.map((m) => {
      const n = chiavi.reduce((tot, k) => tot + (m.days?.[k] || 0), 0);
      const resists = chiavi.reduce((tot, k) => tot + (m.resists?.[k] || 0), 0);

      /* Calo rispetto ai primi 7 giorni.
         `days` contiene una chiave SOLO per i giorni con almeno una
         sigaretta: prendere le prime 7 chiavi e dividere per 7 significava
         prendere i primi 7 giorni FUMATI — che possono coprire due o tre
         settimane di calendario — e confrontarli con gli ultimi 7 giorni
         veri, zeri compresi. Il calo usciva gonfiato proprio per chi aveva
         iniziato piano. Qui i primi 7 giorni sono 7 giorni di calendario a
         partire dal primo registrato. */
      const giorniOrdinati = Object.keys(m.days || {}).sort();
      let calo = null;
      if (giorniOrdinati.length && dayDiff(daYmd(giorniOrdinati[0]), now) >= 13) {
        const primoGiorno = daYmd(giorniOrdinati[0]);
        const primi = Array.from({ length: 7 }, (_, i) => ymd(addGiorni(primoGiorno, i)))
          .reduce((t, k) => t + (m.days[k] || 0), 0) / 7;
        const ultimi = ultimi7.reduce((t, k) => t + (m.days[k] || 0), 0) / 7;
        if (primi > 0) calo = Math.round(((primi - ultimi) / primi) * 100);
      }
      const attivo = !!m.lastAttivita && now - m.lastAttivita < SOGLIA_INATTIVO;
      return { ...m, n, resists, calo, attivo, oggi: m.days?.[oggiKey] || 0 };
    }).sort((a, b) => {
      // gli inattivi in fondo, comunque vadano i loro numeri
      if (a.attivo !== b.attivo) return a.attivo ? -1 : 1;
      if (!a.attivo) return (b.lastAttivita || 0) - (a.lastAttivita || 0);
      if (ordine === 'calo') {
        if (a.calo === null && b.calo === null) return a.n - b.n;
        if (a.calo === null) return 1;
        if (b.calo === null) return -1;
        return b.calo - a.calo;
      }
      if (a.n !== b.n) return a.n - b.n;
      return b.resists - a.resists;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membriAttuali, gruppoPeriodo, ordine, now]);

  const feed = useMemo(() => {
    const eventi = [];
    membriAttuali.forEach((m) => {
      if (m.lastEvent) eventi.push({ id: m.id, name: m.name, color: m.color, ts: m.lastEvent, tipo: 'cig', oggi: m.days?.[ymd(now)] || 0 });
      if (m.lastResist) eventi.push({ id: m.id, name: m.name, color: m.color, ts: m.lastResist, tipo: 'resist', oggi: m.days?.[ymd(now)] || 0 });
    });
    return eventi.sort((a, b) => b.ts - a.ts).slice(0, 8);
  }, [membriAttuali, now]);

  const pianoTrigger = s?.topTrigger ? dati?.plans?.[s.topTrigger[0]] : null;

  /* I giorni di percorso: quanti giorni sono passati dall'inizio, non da
     quando hai smesso. È il numero su cui cresce la pianta, ed è l'unico
     che NON torna mai indietro dopo una ricaduta. */
  const giorniPercorso = dati?.start ? dayDiff(dati.start, now) : 0;

  /* ---------------------------- render ---------------------------- */

  return (
    <div className="page-bg">
      <div className="phone-frame">
        {!sessionChecked ? (
          <div className="app-shell">
            <div className="screen" style={{ textAlign: 'center', paddingTop: 120 }}>
              <p className="testo">Un attimo…</p>
            </div>
          </div>
        ) : !isAuthenticated ? (
          <div className="app-shell">
            <AuthScreen
              mode={authMode} setMode={switchAuthMode}
              phone={authPhone} setPhone={setAuthPhone}
              paese={authPaese} setPaese={setAuthPaese}
              password={authPassword} setPassword={setAuthPassword}
              confirmPassword={authConfirmPassword} setConfirmPassword={setAuthConfirmPassword}
              showPassword={showAuthPassword} setShowPassword={setShowAuthPassword}
              showConfirmPassword={showAuthConfirmPassword} setShowConfirmPassword={setShowAuthConfirmPassword}
              error={authError} busy={authBusy} onSubmit={handleAuthSubmit}
            />
          </div>
        ) : !dati?.onboarded ? (
          <div className="app-shell">
            <OnboardingScreen
              iniziale={dati?.profile}
              onChiediPermesso={chiediPermessoNotifiche}
              onFine={(profile, avvisiCorpo) => salva({
                ...dati,
                onboarded: true,
                profile: { ...dati.profile, ...profile },
                ...(avvisiCorpo === undefined ? {} : { avvisiCorpo }),
              })}
            />
          </div>
        ) : (
          <>
            <div className="app-shell">
              {activeTab === 'oggi' && (
                <OggiScreen
                  nome={user.nickname || user.name} s={s} conti={conti} now={now}
                  giorniPercorso={giorniPercorso} ultimoTs={ultimoTs} gruppi={gruppi}
                  tappaBanner={tappaBanner} onChiudiBanner={() => setTappaBanner(null)}
                  checkedIn={checkedInOggi} lotto={lotto}
                  onFuma={registraSigaretta} onUmore={() => setUmore(true)}
                  onTante={() => setTante(true)} onAnnullaLotto={annullaLotto}
                  onVediRegistro={() => { setActiveTab('percorso'); setPercorsoSezione('registro'); setLotto(null); }}
                  onAnnulla={handleAnnulla} onTag={handleTag} onSkipTag={() => setUltimoTs(null)}
                  onVaiAlPercorso={() => { setActiveTab('percorso'); setPercorsoSezione('numeri'); }}
                />
              )}

              {activeTab === 'percorso' && (
                <PercorsoScreen
                  s={s} mese={mese} registro={registro} tags={dati?.tags || {}} now={now}
                  conti={conti} tappe={tappe} piano={piano} record={record}
                  giorniPercorso={giorniPercorso}
                  sezione={percorsoSezione} setSezione={setPercorsoSezione}
                  onElimina={handleElimina} onTante={() => setTante(true)}
                />
              )}

              {activeTab === 'aiuto' && !dentroGruppo && (
                <AiutoScreen
                  motivo={dati?.profile?.motivo} plans={dati?.plans} gruppi={gruppi}
                  nonLetti={nonLetti}
                  onCraving={() => setCraving(true)} onRespira={() => setRespiro(true)}
                  onApriGruppo={() => setDentroGruppo(true)}
                  onSalvaPiano={handleSalvaPiano}
                  onModificaMotivo={() => salva({ ...dati, onboarded: false })}
                />
              )}

              {activeTab === 'aiuto' && dentroGruppo && (
                <GruppoScreen
                  gruppi={gruppi} attivo={gruppoAttivo} setAttivo={setGruppoAttivo}
                  membri={membriAttuali} me={meCard} ioAttivo={ioAttivo}
                  onIndietro={() => { setDentroGruppo(false); setGroupStep('menu'); }}
                  step={groupStep} setStep={(v) => { setGroupStep(v); setJoinError(''); setJoinPreview(null); }}
                  nome={groupNome} setNome={setGroupNome}
                  codiceInput={codiceInput} setCodiceInput={setCodiceInput}
                  joinError={joinError} joinPreview={joinPreview}
                  onCrea={handleCreaGruppo} onVerifica={handleVerificaCodice}
                  onConfermaJoin={handleConfermaJoin} onEsci={handleEsciGruppo} onCopia={handleCopiaCodice}
                  classifica={classifica} ordine={ordine} setOrdine={setOrdine}
                  periodo={gruppoPeriodo} setPeriodo={setGruppoPeriodo}
                  feed={feed} ultimoSync={ultimoSync}
                />
              )}

              {activeTab === 'profilo' && (
                <ProfiloScreen
                  user={user} setUser={setUser}
                  nicknameDraft={nicknameDraft} setNicknameDraft={setNicknameDraft}
                  pwFields={pwFields} setPwFields={setPwFields}
                  onSave={handleSaveAccount} onRecovery={handlePasswordRecovery}
                  onChangePassword={handleChangePassword} onDelete={handleDeleteAccount}
                  onLogout={handleLogout} onResetLog={handleResetLog}
                  totale={dati?.cigs.length ?? 0}
                  notifiche={dati?.notify ?? true} onToggleNotifiche={handleToggleNotifiche}
                  avvisiCorpo={dati?.avvisiCorpo !== false} onToggleCorpo={handleToggleCorpo}
                  profile={dati.profile} onProfileChange={handleProfileChange}
                  onExportJSON={handleExportJSON} onExportCSV={handleExportCSV}
                  start={dati?.start} conti={conti} giorniPercorso={giorniPercorso}
                  motivo={dati?.profile?.motivo} obiettivo={s?.obiettivo ?? null}
                  onModificaMotivo={() => salva({ ...dati, onboarded: false })}
                />
              )}
            </div>
            <BottomNav
              active={activeTab} badge={nonLetti}
              onChange={(id) => { setActiveTab(id); if (id !== 'aiuto') setDentroGruppo(false); }}
            />
          </>
        )}

        {umore && (
          <UmoreFoglio onScegli={handleUmore} onChiudi={() => setUmore(false)} />
        )}

        {tante && (
          <AggiungiTante now={now} onConferma={registraArretrate} onChiudi={() => setTante(false)} />
        )}

        {craving && !respiro && (
          <CravingOverlay
            motivo={dati?.profile?.motivo}
            piano={pianoTrigger}
            minuti={minutiPer}
            costo={unitario}
            gruppi={gruppi}
            onRespira={() => setRespiro(true)}
            onApriGruppo={() => { setCraving(false); setActiveTab('aiuto'); setDentroGruppo(true); }}
            onCeLHoFatta={() => {
              registraResistenza(); setCraving(false);
              showToast(unitario > 0
                ? `Voglia superata · +${minutiPer} min · +${eur(unitario)}`
                : `Voglia superata · +${minutiPer} minuti`);
            }}
            onHoFumato={() => { registraSigaretta(); setCraving(false); }}
            onChiudi={() => setCraving(false)}
          />
        )}

        {respiro && (
          <Respiro
            onFine={() => {
              setRespiro(false);
              if (craving) {
                registraResistenza(); setCraving(false);
                showToast(unitario > 0
                  ? `Voglia superata · +${minutiPer} min · +${eur(unitario)}`
                  : `Voglia superata · +${minutiPer} minuti`);
              }
            }}
            onHoFumato={() => { registraSigaretta(); setRespiro(false); setCraving(false); }}
          />
        )}

        {riparti && (
          <RicadutaOverlay
            pausa={riparti.pausa}
            frase={riparti.frase}
            ripartenze={dati?.ripartenze || 0}
            giorniPercorso={giorniPercorso}
            onCausa={handleCausaRicaduta}
            onChiudi={() => setRiparti(null)}
          />
        )}

        {toast && <div className="toast">{toast}</div>}
        {confirmModal && <ConfirmDialog data={confirmModal} onCancel={() => setConfirmModal(null)} />}
        {otpModal && (
          <RecoveryOtpModal phone={user.phone} onCancel={() => setOtpModal(false)} onVerify={handleVerifyRecovery} />
        )}
      </div>
    </div>
  );
}
