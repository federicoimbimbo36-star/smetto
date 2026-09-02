import { useState, useEffect, useMemo, useRef, useCallback } from 'react';

import {
  PALETTE, MINUTI_PER_SIGARETTA, logKey, seenKey, FASCE, TAPPE, RILANCI, SOGLIA_RICADUTA,
} from './constants';
import {
  sod, dayDiff, ora, ymd, dataBreve, prossimaMedia,
  addGiorni, maxTs, daYmd, durata, componiTelefono, cifreLocali,
} from './utils/format';
import {
  readStore, writeStore, onCambioEsterno, dimenticaUtente,
} from './utils/storage';
import {
  normalizzaRegistro, fondiRegistri, timbra, seppellisciTutto,
  aggiungiEvento, aggiungiEventi, rimuoviEvento, idsAggiunti,
} from './utils/fusione';
import auth from './auth';
import { eliminaAccount, messaggioEliminazione } from './utils/account';
import { creaSequenza, caricaSessione } from './utils/sessione';
import { creaCanaleAuth, creaGuardiaRisveglio } from './utils/canaleAuth';
import { eseguiLogout, creaUscitaAnnunciata } from './utils/logout';
import {
  scriviMarcatore, rimuoviMarcatore, sessioneAmmessa, leggiMarcatore, marcatoreRiguarda,
} from './utils/marcatoreLogout';
import {
  codiciDopoSync, gruppiDopoSync, membriDopoSync, attivoDopoSync, statoDopoSync,
} from './utils/gruppiSync';
import {
  distribuisci, tappeDaRiavviare, togliLotto, costruisciLotto,
} from './utils/arretrate';
import {
  calcolaConti, calcolaBaseline, intervalliCoperti, tempoCoperto,
  riferimentoAstinenza, giorniSenzaFumare, giorniZeroCoperti, eRicaduta,
  ricadutaArretrate, giorniPercorso as calcolaGiorniPercorso,
  recordSenzaFumare, mediaCoperta,
} from './utils/conti';
import { PREFISSO_DEFAULT } from './data/prefissi';
import groups, { smista } from './data/groups';
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
  v: 9, start: null, smessoDal: null,
  /* `eventi` È LA VERITÀ: ogni evento ha un identificativo suo, separato
     dal momento in cui è successo. Il millisecondo dice QUANDO, non
     QUALE — e finché le due cose erano la stessa, due sigarette allo
     stesso millisecondo erano una sigaretta sola.
     `cigs`, `resists`, `checkins` e `ricadute` restano array di
     millisecondi perché tutta la matematica lavora così, ma sono
     PROIEZIONI generate da normalizzaRegistro: si leggono, non si
     scrivono. */
  eventi: [],
  cigs: [], resists: [], checkins: [], ricadute: [],
  rimossi: [],                       // lapidi: identificativi, non istanti
  gruppiStato: {},                   // per ogni codice: dentro o fuori, con la sua versione
  gruppiUsciti: [],                  // proiezione di gruppiStato, per le versioni precedenti
  tags: {},                          // indicizzate per identificativo
  groups: [], notify: true, avvisiCorpo: true, onboarded: false,
  profile: { motivo: '', baseline: null, prezzoPacchetto: null, perPacchetto: 20, sesso: 'non_detto' },
  plans: {}, tappeViste: { ref: null, idx: [] },
  ripartenzeBase: 0, ripartenze: 0,
  orologi: {},
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
  /* L'OROLOGIO DEI CONTATORI, non un contatore anonimo.

     Prima era `useState(0)` incrementato di uno al secondo, e serviva solo
     a comparire fra le dipendenze di `conti` per farlo ricalcolare: il
     valore non lo leggeva nessuno. Un battito che non porta l'ora è una
     dipendenza che la regola dei hook non può che segnalare come inutile —
     perché dal suo punto di vista lo è davvero.

     Adesso porta l'istante in cui ha battuto, e quell'istante entra nel
     calcolo: `calcolaConti(base, adesso)` lo accetta come secondo
     parametro, ed è esattamente il valore che prima leggeva da sola col
     suo `Date.now()` di riserva. */
  const [tick, setTick] = useState(() => Date.now());
  /* L'IDENTIFICATIVO dell'ultima sigaretta registrata, non il suo
     istante: serve a sapere quale annullare e a quale attaccare il
     motivo, e due sigarette possono condividere il millisecondo. */
  const [ultimoId, setUltimoId] = useState(null);
  const [ultimoTs, setUltimoTs] = useState(null);   // solo per mostrarne l'ora
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
  /* L'identificativo di chi è dentro, leggibile da dentro un ascoltatore
     che è stato agganciato una volta sola e quindi non vedrebbe mai lo
     stato aggiornato. */
  const userRef = useRef(null);
  useEffect(() => { userRef.current = user.id || null; }, [user.id]);

  /* IL TOKEN DELLA SESSIONE.

     Caricare un account non è un'operazione sola: `getSession`, poi
     `loadLog`, che a sua volta legge il disco e interroga il database.
     Fra un'attesa e l'altra la sessione può cambiare — logout da un'altra
     scheda, accesso con un altro account — e il caricamento vecchio
     arrivava comunque in fondo e chiamava `setIsAuthenticated(true)`
     ripopolando i dati di chi era appena uscito.

     Il flag `active` che c'era prima copre solo lo smontaggio del
     componente, cioè un caso che in pratica non succede mai: l'app resta
     montata e cambia la sessione sotto.

     Qui ogni sequenza asincrona prende un numero PRIMA di partire e lo
     ricontrolla dopo ogni `await`, subito prima di toccare lo stato. Il
     numero sale a ogni logout, a ogni cambio di account e in
     `resetAuthState`: da quel momento tutto ciò che era in volo è
     scaduto e si ritira senza scrivere niente. */
  /* Una ref, non una variabile: `useRef` la regola dei hook la riconosce
     come stabile, mentre un oggetto tirato fuori con `.current` durante il
     render le sembra una dipendenza reattiva e la farebbe chiedere negli
     elenchi di dipendenze di effetti che devono girare una volta sola. */
  const sequenzaRef = useRef(null);
  if (!sequenzaRef.current) sequenzaRef.current = creaSequenza();
  const canaleRef = useRef(null);
  const guardiaRef = useRef(null);
  const uscitaAnnunciataRef = useRef(null);

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3600);
  }

  const meCard = useMemo(() => ({
    id: user.id, name: user.nickname || user.name, color: user.avatarColor,
  }), [user.id, user.nickname, user.name, user.avatarColor]);

  function applyProfile(u) {
    /* La ref si aggiorna QUI e non solo nell'effetto su `user.id`: quello
       gira dopo il render, e i controlli dopo un `await` devono poter
       leggere chi c'è adesso, non chi c'era all'ultimo render. */
    userRef.current = u.id || null;
    setUser((prev) => ({
      ...prev, id: u.id, name: u.display_name || prev.name, nickname: u.nickname || '',
      email: u.email || '', phone: u.phone || '', avatarColor: u.avatar_color || PALETTE[0],
    }));
  }

  /* Il registro arriva da fuori (storage, e un domani dall'import di un
     backup JSON): prima di dargli in pasto l'aritmetica va ripulito.
     Un `null` in mezzo alle sigarette veniva contato da `cigs.length` ma
     saltato da tutti i filtri per giorno — due totali diversi sugli stessi
     dati — e un `NaN` finiva a schermo come «NaN mesi» nel record.
     Il Set toglie anche gli eventuali doppioni lasciati dal vecchio bug
     della distribuzione delle arretrate: due sigarette non possono
     condividere lo stesso millisecondo, perché su quel millisecondo sono
     indicizzate le etichette del registro. */
  /* ------------------------------------------------------------------ */
  /*  IL REGISTRO SI PREPARA PRIMA E SI APPLICA DOPO                     */
  /*                                                                     */
  /*  Erano due cose in una funzione sola, e la seconda arrivava troppo  */
  /*  tardi. `loadLog` leggeva il disco, normalizzava, interrogava il    */
  /*  database dei gruppi — tre attese — e lungo la strada scriveva:     */
  /*  `visti`, `setGruppi`, `setGruppoAttivo`, `datiRef`, `setDati`, e   */
  /*  faceva pure partire o spegnere le notifiche di sistema.            */
  /*                                                                     */
  /*  Il gettone della sessione lo controllava `caricaSessione` DOPO,    */
  /*  quindi impediva di dichiarare autenticato l'account sbagliato ma   */
  /*  non impediva niente di tutto il resto: A partiva lento, B entrava  */
  /*  e finiva, e poi A arrivava e scriveva il registro di A sopra la    */
  /*  schermata di B. L'utente in alto diceva B, i numeri erano di A.    */
  /*                                                                     */
  /*  Adesso `preparaLog` LEGGE E BASTA: mette insieme tutto quello che  */
  /*  servirà e lo restituisce, senza toccare niente. `applicaLog` fa    */
  /*  le scritture, tutte insieme, in un colpo solo e senza attese in    */
  /*  mezzo — e `caricaSessione` la chiama solo dopo aver verificato     */
  /*  gettone e utente. Fra il controllo e le scritture non c'è nessun   */
  /*  `await`, quindi non c'è nessun momento in cui la sessione possa    */
  /*  cambiare a metà.                                                   */
  /* ------------------------------------------------------------------ */
  async function preparaLog(uid) {
    const d = await readStore(logKey(uid), vuotoLog());
    /* Una funzione sola, e sta in utils/fusione.js: la ripulitura del
       registro serviva già qui, ma adesso serve anche allo strato di
       storage quando fonde la copia locale con quella del database, e
       due versioni della stessa normalizzazione sono due modi diversi di
       contare le stesse sigarette. */
    const merged = normalizzaRegistro(d, vuotoLog);
    // migrazione dalle versioni con un gruppo solo
    if (!merged.groups?.length && d?.group) merged.groups = [d.group];
    const vistiLetti = await readStore(seenKey(uid), {});

    // I gruppi arrivano dal database, non dalla lista salvata sul dispositivo:
    // così un telefono nuovo li ritrova da solo senza reinserire i codici, e
    // quelli sciolti nel frattempo spariscono invece di restare appesi.
    /* ATTENZIONE, e per due motivi. Il primo: in modalità locale
       `mine()` torna vuoto per forza, e prendere quel vuoto per buono
       cancellava la lista salvata sul dispositivo. Il secondo, trovato
       dall'audit: anche col database configurato la lettura può
       FALLIRE — app aperta offline, sessione scaduta — e prima anche
       quel fallimento arrivava qui come una lista vuota. Aprire l'app
       senza rete faceva sparire i gruppi per tutta la sessione, e da
       quel momento `salva()` non pubblicava più niente perché la lista
       era vuota. Adesso una lettura fallita non tocca niente: resta
       quella salvata, e il prossimo sync riuscito la aggiorna.

       `gruppiVivi` a `null` vuol dire proprio quello: non si è potuto
       leggere, quindi non si tocca la lista. */
    const gruppiLetti = groups.disponibile();
    let gruppiVivi = null;
    if (gruppiLetti) {
      const esito = await groups.mine();
      if (esito.ok) {
        gruppiVivi = esito.gruppi;
        merged.groups = esito.gruppi.map((g) => g.code);
      }
    }

    return { uid, merged, visti: vistiLetti, gruppiVivi, gruppiLetti };
  }

  function applicaLog(preparato) {
    if (!preparato) return null;
    const { merged, visti: vistiLetti, gruppiVivi, gruppiLetti } = preparato;

    visti.current = vistiLetti;

    if (gruppiLetti) {
      if (gruppiVivi) {
        const vivi = gruppiVivi.map((g) => g.code);
        setGruppi(gruppiVivi);
        setGruppoAttivo((prev) => (vivi.includes(prev) ? prev : vivi[0] || null));
      } else {
        setGruppoAttivo((prev) => (merged.groups?.includes(prev) ? prev : merged.groups?.[0] || null));
      }
    }

    /* `datiRef` PRIMA di `setDati`: il riferimento è quello che `salva()`
       legge come «com'era prima» per timbrare i campi cambiati, e lo
       useEffect che lo allinea gira solo dopo il render. Una modifica
       fatta nell'istante fra i due — l'effetto delle tappe del corpo lo
       fa davvero — avrebbe timbrato tutto il registro invece dei soli
       campi toccati, cioè un orologio unico al posto di quelli per
       campo, cioè il bug che gli orologi per campo risolvono. */
    datiRef.current = merged;
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
    caricaSessione(sequenzaRef.current, {
      /* IL MARCATORE SI LEGGE ANCHE QUI, all'avvio, non solo al risveglio.
         È il caso provato sul telefono: la scheda B ricaricata trovava
         ancora una sessione buona e rientrava. Adesso la sessione da sola
         non basta a entrare — deve non risultare uscita da qui. */
      leggiSessione: async () => sessioneAmmessa(await auth.getSession()),
      applicaProfilo: applyProfile,
      preparaRegistro: preparaLog,
      applicaRegistro: applicaLog,
      utenteAdesso: () => userRef.current,
      autentica: () => setIsAuthenticated(true),
      finito: () => setSessionChecked(true),
      // Se qualcosa va storto qui (rete assente, backend irraggiungibile)
      // NON si può lasciare l'app ferma su "Verifica sessione…": meglio
      // mostrare la schermata di accesso e far riprovare.
      errore: (e) => console.error('controllo della sessione non riuscito', e),
    });
    return () => { sequenzaRef.current.brucia(); };
  }, []);

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(i);
  }, []);

  // i contatori si muovono solo dove si vedono, per non far lavorare il telefono a vuoto
  useEffect(() => {
    if (activeTab !== 'oggi' && activeTab !== 'percorso') return;
    const i = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(i);
  }, [activeTab]);

  useEffect(() => { setNicknameDraft(user.nickname || ''); }, [user.nickname]);
  useEffect(() => { datiRef.current = dati; }, [dati]);

  /* ------------------------------------------------------------------ */
  /*  L'ALTRA SCHEDA                                                     */
  /*                                                                     */
  /*  Due schede dello stesso account sono due dispositivi che per        */
  /*  giunta condividono la copia locale. Senza questo effetto, la        */
  /*  scheda B continuava a costruire i propri salvataggi sopra lo stato  */
  /*  che aveva in memoria — quello di prima che A registrasse — e ogni   */
  /*  suo salvataggio ripartiva da lì. Il database ricuce comunque        */
  /*  grazie alla fusione, ma l'utente nel frattempo vede due conteggi    */
  /*  diversi nelle due schede e non sa a quale credere.                  */
  /*                                                                     */
  /*  Qui la scheda si accorge della scrittura dell'altra e RIFONDE: non  */
  /*  ricarica e basta, perché ricaricare vorrebbe dire buttare via       */
  /*  quello che ha in memoria e che magari l'altra non ha ancora visto.  */
  /* ------------------------------------------------------------------ */
  /* ------------------------------------------------------------------ */
  /*  LA SESSIONE PUÒ CAMBIARE DA UN'ALTRA PARTE                         */
  /*                                                                     */
  /*  La sessione si leggeva UNA VOLTA SOLA, all'avvio, e da lì in poi   */
  /*  questa scheda dava per scontato di sapere chi c'è. Ma la sessione  */
  /*  è condivisa fra le schede dello stesso browser e fra i dispositivi */
  /*  dello stesso account: uscire in una scheda, o entrare con un altro */
  /*  account, lasciava le altre a mostrare i dati di prima — con i      */
  /*  pulsanti che continuavano a funzionare, e le scritture che il      */
  /*  motore di sincronizzazione poteva solo mettere in coda perché la   */
  /*  chiave non era più di chi era entrato.                             */
  /*                                                                     */
  /*  Qui la scheda se ne accorge. Se la sessione se n'è andata torna    */
  /*  alla schermata di accesso, con lo stesso `resetAuthState` del      */
  /*  logout — quindi niente dati del vecchio account rimasti a schermo. */
  /*  Se è entrato QUALCUN ALTRO si riparte da capo con i suoi dati.     */
  /*  In nessuno dei due casi si tocca il database: qui si sistema solo  */
  /*  quello che l'utente ha davanti.                                    */
  /* ------------------------------------------------------------------ */
  /* ------------------------------------------------------------------ */
  /*  IL LOGOUT ARRIVA ALLE ALTRE SCHEDE SUBITO                          */
  /*                                                                     */
  /*  `auth-js` un canale ce l'ha, ma se non riesce ad aprirlo lo scrive */
  /*  in console e basta, e un ripiego non esiste: in tutta la libreria  */
  /*  non c'è un ascoltatore dell'evento `storage`. Dove                 */
  /*  `BroadcastChannel` manca o fallisce — Safari in navigazione        */
  /*  privata — la scheda rimasta indietro continuava a funzionare, con  */
  /*  i dati dell'account in chiaro, finché non veniva ricaricata.       */
  /*                                                                     */
  /*  Il reset è LO STESSO del logout locale, `resetAuthState`: dati,    */
  /*  gruppi, modali, riferimenti, e ritorno alla schermata di accesso.  */
  /*  Il guardiano su `userRef` evita il doppio reset quando arrivano    */
  /*  tutti e due gli avvisi — il nostro e quello di `auth-js` — e il    */
  /*  canale non ascolta i propri annunci, quindi non si formano anelli. */
  /*                                                                     */
  /*  Fra browser e dispositivi diversi non cambia niente: questo canale */
  /*  parla solo dentro lo stesso browser.                               */
  /* ------------------------------------------------------------------ */
  /* ------------------------------------------------------------------ */
  /*  ...E NON BASTA IL CANALE, SU IPHONE                                */
  /*                                                                     */
  /*  Provato in Safari su iPhone, due schede normali, stesso account:    */
  /*  la seconda continuava a funzionare. Il canale non era rotto — non   */
  /*  veniva proprio raggiunto. Safari su iOS congela le schede di        */
  /*  sfondo, e una pagina congelata non riceve né i messaggi di          */
  /*  `BroadcastChannel` né gli eventi `storage`; al risveglio non le     */
  /*  vengono riconsegnati, perché erano avvisi in tempo reale.           */
  /*                                                                     */
  /*  E `auth-js` al risveglio non dice niente: rilegge la sessione da    */
  /*  localStorage, non la trova (l'ha tolta l'altra scheda), e torna     */
  /*  con un `return` senza passare da `_removeSession()` — che è         */
  /*  l'unico posto da cui esce `SIGNED_OUT`. `onAuthChange` resta muto.  */
  /*                                                                     */
  /*  Quindi due pezzi, e servono tutti e due:                            */
  /*                                                                     */
  /*   · quando l'annuncio ARRIVA (schede sveglie, stesso browser) la     */
  /*     scheda cancella la PROPRIA sessione locale e poi si resetta —    */
  /*     non solo la seconda cosa, come faceva prima;                     */
  /*   · quando l'annuncio NON arriva (scheda sospesa) la scheda, appena  */
  /*     torna in primo piano, va a controllare da sé.                    */
  /*                                                                     */
  /*  In tutti e due i casi si esce con `scope: 'local'`: si cancella la  */
  /*  sessione di QUESTA scheda e non si revoca niente sul server, così   */
  /*  l'altro telefono della stessa persona — che con questo logout non   */
  /*  c'entra — resta dentro. Fra browser e dispositivi diversi non       */
  /*  cambia niente.                                                      */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    const ricevi = creaUscitaAnnunciata({
      signOutLocale: () => (auth.signOutLocale ? auth.signOutLocale() : auth.signOut()),
      reset: resetAuthState,
      dentro: () => Boolean(userRef.current || datiRef.current),
    });
    uscitaAnnunciataRef.current = ricevi;

    canaleRef.current = creaCanaleAuth({ onLogout: () => { ricevi(); } });

    guardiaRef.current = creaGuardiaRisveglio({
      dentro: () => Boolean(userRef.current || datiRef.current),
      /* Non «c'è una sessione» ma «vale ancora»: una sessione che c'è ma
         appartiene a un utente uscito da questo dispositivo non vale.
         `idSessione` legge solo da localStorage: nessun giro in rete a
         ogni cambio di scheda. */
      sessioneValida: async () => {
        const id = await auth.idSessione();
        return Boolean(id) && !marcatoreRiguarda(leggiMarcatore(), id);
      },
      suSessioneNonValida: () => ricevi(),
    });

    return () => {
      canaleRef.current?.chiudi(); canaleRef.current = null;
      guardiaRef.current?.chiudi(); guardiaRef.current = null;
      uscitaAnnunciataRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!auth.onAuthChange) return undefined;
    let vivo = true;
    const stacca = auth.onAuthChange(async (idOra) => {
      if (!vivo) return;
      const idPrima = userRef.current;
      if (idOra === idPrima) return;          // rinnovo del token: non è successo niente

      /* UNA SOLA STRADA PER USCIRE.

         Cancellando la sessione locale, questa scheda si manda da sola un
         `SIGNED_OUT`: se qui ci fosse ancora un `resetAuthState()` diretto,
         il reset sarebbe due — quello di `ricevi()` e questo. Passando
         dalla stessa sequenza, la guardia `inCorso` li fa diventare uno.
         Vale anche per la sessione che scade da sé: la strada è una. */
      if (!idOra) {
        if (uscitaAnnunciataRef.current) uscitaAnnunciataRef.current();
        else resetAuthState();
        return;
      }
      if (!idPrima) return;                   // l'accesso da questa scheda lo gestisce già chi l'ha fatto

      /* È ENTRATO UN ALTRO ACCOUNT: via tutto e si ricarica il suo.

         `resetAuthState` brucia il gettone, quindi il caricamento di
         prima — se è ancora in volo — da qui in poi è scaduto e non potrà
         più rendere autenticato nessuno. Poi se ne prende uno nuovo per
         questo caricamento, che a sua volta può essere sorpassato se
         nel frattempo cambia ancora qualcosa. */
      resetAuthState();
      await caricaSessione(sequenzaRef.current, {
        leggiSessione: async () => {
          const sessione = await auth.getSession();
          // se nel frattempo è cambiato ancora, questa non è la sessione attesa
          if (sessione?.user?.id !== idOra) return null;
          // e comunque non si entra per conto di chi risulta uscito da qui
          return sessioneAmmessa(sessione);
        },
        applicaProfilo: applyProfile,
        preparaRegistro: preparaLog,
        applicaRegistro: applicaLog,
        utenteAdesso: () => userRef.current,
        autentica: () => { if (vivo) setIsAuthenticated(true); },
      });
    });
    return () => { vivo = false; if (typeof stacca === 'function') stacca(); };
  }, []);

  useEffect(() => {
    if (!user.id) return undefined;
    const mia = logKey(user.id);
    return onCambioEsterno(async (chiave) => {
      if (chiave !== mia || !datiRef.current) return;
      const daFuori = await readStore(mia, null);
      if (!daFuori) return;
      const fuso = fondiRegistri(datiRef.current, daFuori, vuotoLog);
      if (JSON.stringify(fuso) === JSON.stringify(datiRef.current)) return;
      datiRef.current = fuso;
      setDati(fuso);
    });
  }, [user.id]);

  /* `pubblica` esiste perché non tutto quello che si salva riguarda il gruppo.
     Il prezzo del pacchetto, il motivo, i se–allora sono roba privata: prima
     ogni carattere digitato in quei campi faceva partire anche un upsert su
     group_members, cioè traffico e scritture per dati che il gruppo non vede
     nemmeno. Le sigarette invece vanno pubblicate subito. */
  /* OGNI MODIFICA TIMBRA I CAMPI CHE HA TOCCATO, e solo quelli.
     È quello che permette a due dispositivi di non cancellarsi a
     vicenda: chi cambia il prezzo timbra il prezzo, chi scrive un
     se–allora timbra quel se–allora, e la fusione sa quale dei due è
     più recente CAMPO PER CAMPO. Con un orologio unico per tutto il
     registro, cambiare il prezzo sul telefono avrebbe cancellato il
     motivo scritto sul tablet cinque minuti prima.

     `ripartenze` non si scrive più a mano da nessuna parte: è la conta
     delle ricadute registrate più quelle ereditate dalle versioni
     precedenti. Un numero solo, calcolato in un posto solo. */
  function salva(next, { pubblica = true } = {}) {
    const timbrato = timbra(datiRef.current, next, Date.now());
    timbrato.ripartenze = (timbrato.ripartenzeBase || 0) + (timbrato.ricadute?.length || 0);
    datiRef.current = timbrato;
    setDati(timbrato);
    if (!user.id) return;
    writeStore(logKey(user.id), timbrato);
    if (pubblica && timbrato.groups?.length) groups.publish(timbrato.groups, meCard, timbrato);
  }

  /* ------------------------- sincronizzazione gruppo ------------------------- */

  const sync = useCallback(async (silenzioso = false) => {
    const codici = dati?.groups || [];
    if (!codici.length || !user.id) return;

    /* UN ERRORE DI RETE NON È UNA RISPOSTA.
       `fetch` adesso dice tre cose diverse — c'è, non c'è più, non lo so —
       e solo la seconda autorizza a togliere il codice dalla lista. Sul
       «non lo so» non si tocca NIENTE: né la lista, né la schermata, né
       la classifica già a video. Prima il terzo caso non esisteva, e un
       tunnel bastava a far uscire dai propri gruppi. */
    const esiti = {};
    const membriLetti = {};
    for (const code of codici) {
      esiti[code] = await groups.fetch(code);
      if (!esiti[code].ok || !esiti[code].gruppo) continue;
      const m = await groups.fetchMembers(code);
      // il gruppo c'è ma la sua classifica non si è potuta leggere:
      // il codice resta vivo, i membri restano quelli di prima
      if (m.ok) membriLetti[code] = m.membri;
    }
    const { vivi, morti, incerti } = smista(codici, esiti);
    /* `senzaMembri` e `daTenere` non servono più: dicevano quali codici
       tenere da prima perché la loro classifica non era stata riletta, e
       adesso è `membriDopoSync` a farlo per tutti — compresi i gruppi
       entrati durante la sincronizzazione, che quel calcolo non poteva
       nemmeno vedere. */

    /* ------------------------------------------------------------------
       DA QUI IN GIÙ SI PARTE DALLO STATO DI ADESSO, NON DA `codici`.

       `codici` è la lista com'era quando questa sincronizzazione è
       partita, e da allora sono passate diverse richieste di rete. Se
       l'utente è entrato in un gruppo nel frattempo, ricostruire tutto da
       `codici` lo cancellava: dalla lista salvata, dalla schermata, dalle
       classifiche in memoria e dal gruppo aperto. Quattro posti, un solo
       errore — prendere per buono lo stato di prima.

       La regola sta in `utils/gruppiSync.js`, ed è una sola: questa
       sincronizzazione può togliere solo quello che ha verificato, e non
       decide niente su quello che non ha nemmeno guardato.
       ------------------------------------------------------------------ */
    const attuale = datiRef.current;
    const listaAdesso = attuale?.groups || codici;
    const { codici: rimasti, daTogliere } = codiciDopoSync(listaAdesso, morti);

    const nuoviGruppi = vivi.map((c) => esiti[c].gruppo);
    setGruppi((prev) => gruppiDopoSync(prev, nuoviGruppi, rimasti));
    setMembriPerGruppo((prev) => membriDopoSync(prev, membriLetti, rimasti));
    // se non si è riusciti a leggere proprio niente, «aggiornato adesso»
    // sarebbe una bugia: l'ora dell'ultimo sync non si muove
    if (incerti.length < codici.length) setUltimoSync(Date.now());

    const nuoviMembri = membriLetti;

    if (daTogliere.length && attuale) {
      /* UN GRUPPO SCIOLTO È UN'USCITA, e va scritta dove si scrivono le
         uscite. `groups` non è la verità: da quando uscita e rientro sono
         operazioni versionate, la verità è `gruppiStato`, e `groups` è
         una proiezione che `normalizzaRegistro` rigenera. Lasciando
         `gruppiStato` a `true`, il gruppo sciolto tornava alla prima
         rilettura del registro.

         Si passa da `salva`, cioè dallo stesso percorso di join e leave:
         timbra, aggiorna `datiRef`, aggiorna lo stato, scrive sul
         dispositivo e pubblica. Niente `writeStore` a mano, che saltava
         `timbra` e lasciava la modifica senza orologio.

         Solo `daTogliere`, mai gli `incerti`: sul «non lo so» non si tocca
         niente. E mai un gruppo entrato nel frattempo, che questa
         sincronizzazione non ha interrogato. */
      salva({
        ...attuale,
        groups: rimasti,
        gruppiStato: statoDopoSync(attuale.gruppiStato, daTogliere),
      });
    }
    setGruppoAttivo((prev) => attivoDopoSync(prev, rimasti));

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
    /* LA LISTA È PIÙ STRETTA DEL CORPO, E DI PROPOSITO.

       Questo effetto scandisce i conteggi del GRUPPO per accorgersi che
       qualcun altro ha registrato. Il corpo tocca anche `dati` intero (via
       `datiRef`) e qualche funzione di comodo, ma metterli fra le
       dipendenze vorrebbe dire rifare la scansione a ogni sigaretta
       registrata da noi — cioè a ogni cambio del registro personale, che
       con questo effetto non c'entra. La soppressione tiene ferma quella
       distinzione: non nasconde un avviso, dichiara una scelta.

       Non è stata toccata nella fase di igiene perché cambiarla significa
       cambiare quando arrivano le notifiche, e quello si prova con due
       telefoni, non con il linter. */
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
      /* ANCHE L'ACCESSO FATTO QUI PASSA DALLA SEQUENZA PROTETTA.

         Qui c'era scritto che il login da questa scheda non può cambiare
         sessione durante il caricamento. Non è vero: il cambio arriva da
         un'ALTRA scheda, e questa non se ne accorge. A fa l'accesso, il
         suo caricamento è lento, nel frattempo l'altra scheda entra come
         B, B finisce, e poi A arriva e riscrive profilo, dati e
         autenticazione di A sopra la schermata di B.

         La sequenza si brucia prima di aprirne una nuova, così qualunque
         caricamento partito prima è già superato. E la sessione si
         RILEGGE invece di fidarsi di `res.user`: fra la risposta di
         `signIn` e la fine del caricamento può essere cambiata, e se
         quella vera non è più di chi ha appena fatto l'accesso non si
         applica niente. */
      /* IL MARCATORE SI TOGLIE QUI, e prima di rileggere la sessione.
         Se restasse, `sessioneAmmessa` rifiuterebbe la sessione appena
         aperta da chi ha appena fatto l'accesso: il marcatore del logout
         di prima chiuderebbe fuori il login di adesso. Si toglie a
         accesso RIUSCITO — è l'unica cosa che lo cancella — e vale sia
         per l'accesso sia per la registrazione. */
      rimuoviMarcatore();

      sequenzaRef.current.brucia();
      const atteso = res.user.id;
      const esito = await caricaSessione(sequenzaRef.current, {
        leggiSessione: async () => {
          const sessione = await auth.getSession();
          return sessione?.user?.id === atteso ? sessione : null;
        },
        applicaProfilo: applyProfile,
        preparaRegistro: preparaLog,
        applicaRegistro: applicaLog,
        utenteAdesso: () => userRef.current,
        autentica: () => setIsAuthenticated(true),
      });

      /* Il benvenuto, la scheda iniziale e la pulizia delle password solo
         se si è entrati davvero. Una sequenza superata si ritira in
         silenzio: dire «Bentornato» a chi nel frattempo è diventato un
         altro utente sarebbe l'ultima cosa rimasta di questo difetto. */
      if (esito !== 'entrato') return;
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
    setIsAuthenticated(false); setDati(null); setUltimoId(null);
    setCraving(false); setRespiro(false); setUmore(false);
    setTante(false); setLotto(null);
    setGruppi([]); setGruppoAttivo(null); setMembriPerGruppo({});
    setGroupStep('menu'); setUser(UTENTE_VUOTO);
    // roba dell'account precedente che non deve sopravvivere al logout:
    // su un telefono condiviso finirebbe sotto gli occhi di chi entra dopo
    setPwFields({ current: '', next: '', confirm: '' });
    setNicknameDraft(''); setOtpModal(false); setRiparti(null); setTappaBanner(null);
    setNonLetti(0); setUltimoSync(null);
    /* LE REF PER PRIME, e in modo sincrono. Lo stato React si aggiorna al
       prossimo render; le ref no, e sono proprio loro che leggono le
       operazioni ancora in volo. Lasciare `datiRef` pieno significava che
       un salvataggio partito prima del logout trovava ancora il registro
       dell'account uscito e lo riscriveva.

       Il gettone sale per ultimo ma è la riga che conta: da qui in poi
       ogni sequenza asincrona iniziata prima si accorge di essere scaduta
       e si ferma senza toccare niente. */
    visti.current = {};
    datiRef.current = null;
    userRef.current = null;
    sequenzaRef.current.brucia();
  }

  function handleResetLog() {
    setConfirmModal({
      title: 'Azzerare lo storico?',
      body: 'Cancella tutte le sigarette registrate e fa ripartire la settimana di misura. Account, gruppo e piano restano.',
      confirmLabel: 'Azzera', danger: true,
      onConfirm: () => {
        /* Le lapidi vanno portate avanti: senza, il primo riallineamento
           col database — o con l'altro telefono — rimetterebbe dentro
           tutto quello che si è appena chiesto di cancellare. Azzerare
           deve essere un'operazione che si propaga, non un buco locale
           che gli altri riempiono. */
        salva({
          ...vuotoLog(), groups: dati.groups, notify: dati.notify, avvisiCorpo: dati.avvisiCorpo,
          onboarded: true, profile: dati.profile, plans: dati.plans,
          rimossi: seppellisciTutto(dati),
          eventi: [],
          ripartenzeBase: 0,
          orologi: dati.orologi,
        });
        annullaTappe().catch(() => {});
        // anche i "già visti" del gruppo vanno azzerati, altrimenti restano
        // riferiti a eventi che non esistono più
        visti.current = {};
        writeStore(seenKey(user.id), {});
        setUltimoId(null); setConfirmModal(null); showToast('Storico azzerato.');
      },
    });
  }

  function handleDeleteAccount() {
    setConfirmModal({
      title: 'Eliminare l’account?',
      body: 'Questa azione è definitiva: perdi lo storico, il piano e il posto in classifica.',
      confirmLabel: 'Elimina account', danger: true,
      /* «Account eliminato.» va detto solo se è successo davvero.
         Prima l'esito non veniva letto: senza rete la cancellazione
         falliva, l'app faceva comunque il logout e mostrava la conferma,
         e l'utente restava convinto di non esistere più mentre account,
         registro e sessione erano tutti ancora lì. Una transazione non
         c'è e non la si inventa: si procede in ordine e ci si ferma al
         primo passo che non riesce, lasciando lo stato locale coerente
         con quello che è riuscito. */
      onConfirm: async () => {
        const codici = dati?.groups || [];
        const esito = await eliminaAccount({
          codici,
          uid: user.id,
          groups,
          auth,
          /* Lo stato dell'app si azzera QUI, fra la cancellazione remota
             e la pulizia del dispositivo. Dopo sarebbe tardi: `salva()`
             non aspetta `writeStore`, e un salvataggio ancora in volo
             rimetterebbe `smetto:log:<uid>` sul telefono un istante dopo
             che è stato tolto. Prima sarebbe presto: se la cancellazione
             fallisce l'utente deve ritrovare i suoi dati a schermo. */
          primaDiPulire: resetAuthState,
          pulisci: dimenticaUtente,
        });
        if (!esito.ok) {
          /* Le uscite dai gruppi che sono riuscite sono definitive: la
             lista locale deve dirlo, altrimenti l'app continua a
             pubblicare su gruppi che ha già lasciato. */
          if (esito.rimasti.length !== codici.length) salva({ ...dati, groups: esito.rimasti });
          setConfirmModal(null);
          showToast(messaggioEliminazione(esito));
          return;
        }
        await annullaTappe().catch(() => {});
        setConfirmModal(null);
        /* Non sempre «Account eliminato.»: se qualcosa è rimasto su
           questo dispositivo lo si dice, invece di lasciar credere che
           il telefono sia pulito. */
        showToast(messaggioEliminazione(esito));
      },
    });
  }

  function handleLogout() {
    setConfirmModal({
      title: 'Uscire dall’account?',
      body: 'Dovrai effettuare di nuovo l’accesso per continuare a registrare.',
      confirmLabel: 'Esci',
      onConfirm: async () => {
        setConfirmModal(null);
        /* L'identificativo si prende ADESSO: `resetAuthState` lo azzera,
           e senza di lui il marcatore sarebbe anonimo — cioè butterebbe
           fuori chiunque altro usi questo browser. */
        const uscente = userRef.current || user.id;
        await eseguiLogout({
          signOut: () => auth.signOut(),
          spegniNotifiche: () => annullaTappe(),
          /* Il fatto si scrive prima di annunciarlo: l'annuncio è un
             di più che arriva solo alle schede sveglie, il marcatore lo
             trovano anche quelle che dormivano. */
          marca: () => scriviMarcatore(uscente),
          reset: resetAuthState,
          annuncia: () => canaleRef.current?.annunciaLogout(),
          riuscito: () => showToast('Hai effettuato il logout.'),
          /* Niente «Hai effettuato il logout» se il logout non è
             riuscito: si resta dentro, e lo si dice. Dire il contrario
             lasciava la sessione scritta sul dispositivo e l'utente
             convinto di essere uscito. */
          fallito: () => showToast('Non è stato possibile uscire. Controlla la rete e riprova.'),
        });
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
    /* Il rientro è un'OPERAZIONE con la sua versione, non la cancellazione
       di una lapide: `salva` timbra `gruppiStato.<codice>` con l'istante,
       quindi una copia vecchia rimasta offline con l'uscita di prima non
       può più rimettere fuori chi è appena rientrato. */
    const next = {
      ...dati,
      groups: [...(dati.groups || []), code],
      gruppiStato: { ...(dati.gruppiStato || {}), [code]: true },
    };
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
        /* SE IL SERVER DICE DI NO, QUI NON SUCCEDE NIENTE.

           Prima l'esito di `leave` veniva buttato via: la riga si toglieva
           dallo schermo e il messaggio diceva «sei uscito» anche quando la
           cancellazione non era arrivata. Il gruppo spariva dal telefono e
           l'iscrizione restava sul database, quindi si continuava a comparire
           nella classifica degli altri senza più poterci fare niente —
           l'unico stato da cui l'utente non aveva modo di uscire.

           `join` questo controllo ce l'aveva già; era l'uscita a non
           averlo. In modalità locale `leave` torna `{}`, quindi il
           comportamento senza database non cambia. */
        const esito = await groups.leave(code, user.id);
        if (esito?.error) {
          setConfirmModal(null);
          showToast('Non è stato possibile uscire dal gruppo. Riprova.');
          return;
        }
        const rimasti = (dati.groups || []).filter((c) => c !== code);
        /* Togliere il codice dalla lista non basta: `groups` si fonde a
           orologio, quindi un altro dispositivo che non sa dell'uscita e
           tocca la lista dopo di noi vince, e il gruppo ritorna. L'uscita
           si registra su `gruppiStato.<codice>`, che ha un orologio suo:
           vale finché non arriva un rientro più recente. */
        salva({
          ...dati,
          groups: rimasti,
          gruppiStato: { ...(dati.gruppiStato || {}), [code]: false },
        });
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
    /* Una riga per EVENTO. Prima si scorrevano le liste di istanti, quindi
       due sigarette allo stesso millisecondo producevano una riga sola e
       il file esportato conteneva meno sigarette del registro. */
    const nomi = { cig: 'sigaretta', resist: 'voglia superata', checkin: 'giorno a zero', ricaduta: 'ricaduta' };
    const righe = [['data', 'ora', 'tipo', 'motivo']];
    [...(dati.eventi || [])].sort((a, b) => a.ts - b.ts).forEach((e) => {
      if (e.tipo === 'ricaduta') return;      // è già raccontata dalla sigaretta
      righe.push([ymd(e.ts), ora(e.ts), nomi[e.tipo] || e.tipo, dati.tags[e.id] || '']);
    });
    const csv = righe.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const ok = scarica(csv, `smetto-registro-${ymd(Date.now())}.csv`, 'text/csv;charset=utf-8;');
    showToast(ok ? 'Registro scaricato ✅' : 'Non è stato possibile scaricare il file.');
  }

  function handleCheckin() {
    const ts = Date.now();
    salva(aggiungiEvento(dati, 'checkin', ts));
    showToast('Segnato: oggi zero 🌱');
  }

  /* ---------------------------- conteggio ---------------------------- */

  /* La finestra dei 25 secondi in cui si può attaccare un motivo o
     annullare. Tiene l'IDENTIFICATIVO della sigaretta, e il suo istante
     solo per scriverlo a schermo. */
  const apriFinestra = (id, ts) => {
    setUltimoId(id);
    setUltimoTs(ts);
    clearTimeout(finestra.current);
    finestra.current = setTimeout(() => setUltimoId(null), 25000);
  };

  const minutiPer = MINUTI_PER_SIGARETTA[dati?.profile?.sesso || 'non_detto'];
  const unitario = dati?.profile?.prezzoPacchetto
    ? dati.profile.prezzoPacchetto / (dati.profile.perPacchetto || 20)
    : 0;

  function registraSigaretta() {
    const ts = Date.now();
    const precedente = maxTs(dati.cigs);
    const pausa = precedente ? ts - precedente : 0;
    /* La regola sta in conti.js, in un posto solo: durante un'astinenza
       dichiarata qualsiasi sigaretta è una ricaduta, anche a tre ore dalla
       precedente; fuori serve una pausa che una notte di sonno non possa
       raggiungere. A otto ore contava i risvegli, e in trenta giorni di
       fumo regolare il contatore arrivava a «è la 29ª volta che riparti». */
    const ricaduta = eRicaduta(dati, ts, SOGLIA_RICADUTA);

    let next = aggiungiEvento(dati, 'cig', ts);
    /* NON `eventi[eventi.length - 1]`. A parità di istante l'ordine lo
       decide l'identificativo, e un evento con lo stesso millisecondo
       arrivato dall'altro dispositivo può finire dopo questo: la finestra
       dei 25 secondi si ritrovava l'id sbagliato, e «Annulla» cancellava la
       sigaretta dell'altro telefono lasciando dentro questa. Due istanti
       uguali non sono un'ipotesi in questo file — sono lo scenario che
       fusione.js esiste per gestire. */
    const idSigaretta = idsAggiunti(dati, next)[0];
    // la ricaduta è un evento come gli altri, con il suo identificativo:
    // due dispositivi che ricadono non se ne perdono una
    if (ricaduta) next = aggiungiEvento(next, 'ricaduta', ts);
    salva({
      ...next,
      start: dati.start ?? ts,
      tappeViste: { ref: ts, idx: [] },              // il conto del corpo riparte
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
      setRiparti({ id: idSigaretta, ts, pausa, frase: RILANCI[Math.floor(Math.random() * RILANCI.length)] });
    } else {
      apriFinestra(idSigaretta, ts);
      showToast('Registrata. Nessun problema, si continua.');
    }
  }

  /* ------------------------------------------------------------------ */
  /*  DICHIARARE DI AVER SMESSO                                          */
  /*                                                                     */
  /*  È la sola cosa che cambia il significato del silenzio. Finché sei   */
  /*  in riduzione, un giorno senza registrazioni non dice niente e non   */
  /*  produce risparmio. Da qui in poi il silenzio vuol dire «non ho      */
  /*  fumato», e l'unica cosa che devi registrare è una ricaduta.         */
  /*                                                                     */
  /*  Non tocca niente altro: né le sigarette già registrate, né il ritmo */
  /*  di partenza, né il prezzo, né `ripartenze`, né `start` (tranne per  */
  /*  chi non ha mai registrato niente, dove la dichiarazione è l'inizio  */
  /*  del percorso). Si può annullare, e si torna in riduzione.           */
  /* ------------------------------------------------------------------ */
  function dichiaraSmesso() {
    const ts = Date.now();
    const primaVolta = !dati.start;
    salva({
      ...dati,
      start: dati.start ?? ts,
      /* `?? ts`: dichiarare di nuovo mentre sei già dichiarato non sposta
         niente. Spostando la data in avanti si perderebbe la copertura del
         periodo precedente, e chi ricade e si rimette in carreggiata si
         vedrebbe SCENDERE i soldi risparmiati — nello scenario provato,
         nove euro in meno per aver detto «ci riprovo». La dichiarazione è
         un impegno che resta: dopo una ricaduta il contatore dei giorni
         riparte da solo dalla sigaretta, e non serve rifare niente.
         Per azzerarla davvero si passa da «sono tornato in riduzione». */
      smessoDal: dati.smessoDal ?? ts,
      // chi parte da fermo non ha un'ultima sigaretta da cui far partire le
      // tappe del corpo: il riferimento diventa la dichiarazione
      tappeViste: primaVolta ? { ref: ts, idx: [] } : dati.tappeViste,
    });
    showToast('Da adesso i giorni senza fumare si contano da soli.');
  }

  function annullaSmesso() {
    salva({ ...dati, smessoDal: null });
    showToast('Sei tornato in riduzione: i giorni vanno di nuovo confermati.');
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
    const piuVecchia = nuovi[0];
    const riavvio = tappeDaRiavviare(dati.cigs, nuovi);
    /* Durante un'astinenza dichiarata QUALSIASI sigaretta registrata è una
       ricaduta, e le arretrate non fanno eccezione: chi dichiara di aver
       smesso e poi segna tre sigarette di ieri ha ricaduto, anche se lo
       sta dicendo con un giorno di ritardo. Il contatore dei giorni
       ripartiva già da solo — è il riferimento a spostarsi — ma
       `ripartenze` restava fermo, e due numeri raccontavano due storie.
       La schermata resta quella che era: quella della ricaduta serve a chi
       ha appena ceduto, non a chi sta mettendo in ordine il registro. */
    const ricaduta = ricadutaArretrate(dati, nuovi);
    /* La ricaduta si data sulla PRIMA sigaretta successiva alla
       dichiarazione, non sull'istante in cui si è aperto il modulo:
       l'istante è l'identità dell'evento, e datarlo «adesso» lo
       renderebbe diverso su due dispositivi che registrano lo stesso
       arretrato — cioè due ricadute invece di una. */
    const nuoviMin = ricaduta
      ? Math.min(...nuovi.filter((t) => t >= dati.smessoDal))
      : null;

    let next = aggiungiEventi(dati, 'cig', nuovi);
    if (ricaduta) next = aggiungiEvento(next, 'ricaduta', nuoviMin);
    salva({
      ...next,
      // il percorso comincia dalla prima sigaretta conosciuta, anche se
      // quella prima sigaretta la scopriamo adesso
      start: dati.start === null ? piuVecchia : Math.min(dati.start, piuVecchia),
      ...(riavvio === null ? {} : { tappeViste: { ref: riavvio, idx: [] } }),
    });

    if (riavvio !== null) {
      setTappaBanner(null);
      if (dati.avvisiCorpo !== false) programmaTappe(riavvio).catch(() => {});
    }

    setTante(false);
    setUltimoId(null);
    /* IL LOTTO LO COSTRUISCE `costruisciLotto`, in arretrate.js.

       Qui c'era `next.eventi.slice(primaDiTutto.eventi.length)`, cioè gli
       identificativi presi per POSIZIONE. Ma `aggiungiEvento` riordina per
       istante: segnando tre sigarette di IERI, lo slice non restituiva
       quelle tre — restituiva gli ultimi tre eventi per istante, cioè le
       sigarette di OGGI. Toccare «Annulla» le seppelliva, con la lapide, e
       lasciava dentro le arretrate. Verificato, non temuto.

       `ts` NON è un doppione di `ids`: la card scrive «dalle 9:10 alle
       11:40», e per dirlo servono gli ISTANTI, che gli identificativi non
       contengono. `nuovi` esce già ordinato da `distribuisci`, quindi primo
       e ultimo sono davvero primo e ultimo. `riavvio` serve invece
       all'annullamento: dice se le tappe del corpo erano state fatte
       ripartire da questo lotto, e solo in quel caso vanno rimesse
       indietro. */
    setLotto(costruisciLotto(primaDiTutto, next, {
      ts: nuovi,
      quando: finestra.breve,
      riavvio,
    }));
    clearTimeout(timerLotto.current);
    timerLotto.current = setTimeout(() => setLotto(null), 40000);
  }

  /* ANNULLARE IL LOTTO DEVE TOGLIERE IL LOTTO, NON RIAVVOLGERE IL TEMPO.
  
     Qui prima si ripristinava l'istantanea `lotto.prima` e le si
     applicavano le lapidi. Sembra equivalente e non lo è: fra
     l'aggiunta e l'annullamento passano quaranta secondi, e in quei
     quaranta secondi può succedere qualcosa. Si va su Aiuto, si apre la
     voglia, si tocca «Ho fumato» — oppure arriva una fusione dall'altro
     telefono. Quella sigaretta non è nell'istantanea, quindi tornando
     indietro spariva: senza lapide, e non solo dal dispositivo, perché
     il salvataggio successivo partiva con la revisione buona e la
     cancellava anche dal database. Verificato.
  
     Adesso si parte dallo stato CORRENTE e si seppelliscono solo gli
     identificativi del lotto. Le lapidi restano indispensabili: le
     sigarette del lotto possono essere già arrivate al database o
     all'altro dispositivo, e senza lapide tornerebbero indietro alla
     prima fusione.
  
     Dall'istantanea si recupera solo quello che gli eventi non sanno
     ricostruire da soli, cioè `start` e `tappeViste`. E nemmeno quelli
     alla cieca. */
  function annullaLotto() {
    if (!lotto) return;
    const next = togliLotto(datiRef.current || dati, lotto, rimuoviEvento);
    salva(next);
    // dall'ultima sigaretta RIMASTA, che può essere più recente del lotto
    riallineaTappe(next.cigs);
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
    salva({ ...dati, tags: { ...dati.tags, [riparti.id]: causa } });
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
    salva({ ...aggiungiEvento(dati, 'resist', ts), start: dati.start ?? ts });
  }

  /* Il messaggio dopo una voglia superata annunciava «+20 min · +0,30 €».
     Quei numeri non arrivavano da nessuna parte: le resistenze non entrano
     nei conti — e non devono, perché il risparmio è già la differenza fra
     il ritmo di partenza e quello che fumi davvero, quindi sommarle
     significherebbe contarle due volte. Ma leggere dieci volte «+0,30 €»
     e non trovare tre euro da nessuna parte è il modo più veloce per non
     fidarsi più di nessun numero dell'app.
     Adesso il messaggio dice una cosa che l'app tiene per davvero e che si
     ritrova scritta nel Percorso: quante voglie hai superato in settimana. */
  function toastVoglia() {
    const n = (s?.resistSett ?? 0) + 1;
    return n === 1
      ? 'Voglia superata 🌱 · la prima di questa settimana'
      : `Voglia superata 🌱 · ${n} questa settimana`;
  }

  // dopo aver tolto una sigaretta dal registro, le tappe vanno riallineate
  // all'ultima rimasta (o annullate se non ne restano più).
  function riallineaTappe(cigsRimaste) {
    const ultima = maxTs(cigsRimaste);
    if (ultima && dati.avvisiCorpo !== false) programmaTappe(ultima).catch(() => {});
    else annullaTappe().catch(() => {});
  }

  /* Toglie UNA sigaretta, non tutte quelle registrate in quell'istante.
     `filter(t => t !== ts)` sembrava equivalente e non lo è: bastava un
     doppione nel registro — e la vecchia distribuzione delle arretrate ne
     produceva — perché un solo tocco sulla X ne cancellasse due, con tutti
     i conteggi sbagliati da lì in poi e nessun modo di accorgersene.
     L'etichetta si toglie solo se in quell'istante non resta niente. */
  /* CANCELLARE NON È FILTRARE, E NON SI CANCELLA PER ISTANTE.

     Due correzioni sovrapposte, in ordine.
     La prima: togliere l'elemento dalla lista lasciava l'altro
     dispositivo — e il database — con la sua copia intatta, e alla prima
     fusione la sigaretta tornava dentro. L'unione non sa distinguere «io
     non ce l'ho» da «io l'ho cancellata»: serve una lapide.
     La seconda: la lapide era l'ISTANTE, quindi cancellare una sigaretta
     ne cancellava anche un'altra registrata nello stesso millisecondo su
     un altro dispositivo. Adesso la lapide è l'identificativo, e colpisce
     un evento solo — quello che si è chiesto di cancellare. */
  function togliUno(id) {
    if (!dati.eventi?.some((e) => e.id === id)) return null;
    return rimuoviEvento(dati, id);
  }

  function handleAnnulla() {
    if (!ultimoId) return;
    const next = togliUno(ultimoId);
    if (!next) { setUltimoId(null); return; }
    salva(next);
    riallineaTappe(next.cigs);
    setUltimoId(null);
  }

  function handleElimina(id) {
    const evento = dati.eventi?.find((e) => e.id === id);
    if (!evento) return;
    const next = togliUno(id);
    if (!next) return;
    const eraLUltima = evento.ts === maxTs(dati.cigs);
    salva(next);
    if (id === ultimoId) setUltimoId(null);
    // rilevante solo se abbiamo tolto proprio l'ultima sigaretta cronologica
    if (eraLUltima) riallineaTappe(next.cigs);
  }

  /* Le etichette seguono l'IDENTIFICATIVO della sigaretta, non il suo
     istante: due sigarette allo stesso millisecondo hanno due motivi
     diversi, e prima ne condividevano uno. */
  function handleTag(id, t) {
    const tags = { ...dati.tags };
    if (tags[id] === t) delete tags[id]; else tags[id] = t;
    salva({ ...dati, tags });
    setUltimoId(null);
  }

  function handleSalvaPiano(trigger, testo) {
    salva({ ...dati, plans: { ...dati.plans, [trigger]: testo } }, { pubblica: false });
    if (testo) showToast('Piano salvato.');
  }

  /* ---------------------------- calcoli ---------------------------- */

  /* LA COPERTURA — l'unione dei tratti di tempo in cui sappiamo davvero
     cosa stava succedendo. Ricalcolata solo quando cambiano i dati, mai a
     ogni tick: gli intervalli non sono tagliati su `adesso`, il taglio lo
     fa `tempoCoperto` dentro i conti. */
  const intervalli = useMemo(() => intervalliCoperti(dati), [dati]);

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

    const settTot = cigs.filter((t) => t >= inizioSett).length;
    const media = settTot / giorniTrascorsi;

    /* Stessa regola per la media della settimana scorsa, che è il metro
       dell'obiettivo settimanale: una settimana passata senza aprire
       l'app produceva una media vicina allo zero e quindi un obiettivo
       che nessuno può rispettare, presentato come se fosse il risultato
       di un progresso. Se la settimana non è coperta almeno per mezza
       giornata, l'obiettivo non c'è. */
    const precInizio = addGiorni(inizioSett, -7);
    const mediaPrec = sett > 0 ? mediaCoperta(cigs, intervalli, precInizio, inizioSett) : null;

    const obiettivo = mediaPrec === null ? null : prossimaMedia(mediaPrec);
    /* floor e non round: la parola scritta accanto è «massimo». Con un
       obiettivo di 11,9 l'arrotondamento concedeva un tetto di 12, cioè
       più alto dell'obiettivo che sta cercando di far rispettare. */
    const budget = obiettivo === null ? null : Math.floor(obiettivo);

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

    /* LA MEDIA DEI SETTE GIORNI PIENI, oggi escluso.
       Prima oggi entrava al numeratore com'era — mezzo — e al denominatore
       come giorno intero: la media usciva sempre più bassa del vero e
       RISALIVA durante la giornata. Da lì la proiezione annuale in prima
       pagina passava da 1.251 € all'una di notte a 1.095 € alle nove di
       sera, con gli stessi identici dati e senza che l'utente avesse fatto
       niente. Questa media alimenta anche `mediaOra` dei conti, quindi la
       correzione vale per tutte e tre le proiezioni.
       Con meno di un giorno pieno alle spalle non esiste ancora: null, e
       chi la mostra scrive un trattino. */
    /* SUI GIORNI COPERTI, non sui giorni di calendario. Dividere per
       sette conta come «zero sigarette» i giorni in cui l'app non sapeva
       niente, ed è lo stesso errore che i contatori non fanno più. Non è
       un dettaglio estetico: da qui esce la proiezione a un anno, e
       sparire tre giorni su sette faceva scendere la media del 43% e
       salire della stessa quota il risparmio annunciato per i dodici
       mesi successivi. */
    const giorniPieni = Math.min(7, giorno);
    const media7 = giorniPieni === 0
      ? null
      : mediaCoperta(cigs, intervalli, addGiorni(oggiTs, -giorniPieni), oggiTs);

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

    /* `taggateSett` è il denominatore giusto per «lo stress ti ha innescato
       N sigarette su M»: dividere per il totale settimanale mescolava le
       etichettate con quelle su cui non è stato detto niente, e faceva
       sembrare ogni causa meno rilevante di quanto i dati dicano. */
    const conteggio = {};
    let taggateSett = 0;
    // le etichette seguono l'identificativo dell'evento, non il suo istante
    (dati.eventi || []).forEach((e) => {
      if (e.tipo !== 'cig' || e.ts < inizioSett) return;
      const g = dati.tags[e.id];
      if (g) { conteggio[g] = (conteggio[g] || 0) + 1; taggateSett += 1; }
    });
    const topTrigger = Object.entries(conteggio).sort((a, b) => b[1] - a[1])[0] || null;

    /* Quello che non finisce a schermo non sta qui dentro: `ieri`,
       `giorniSottoBudget` e `resistOggi` erano calcolati a ogni render e
       non li leggeva nessuno, cioè costo certo e rischio di divergere in
       silenzio dal resto se un giorno qualcuno li avesse usati.
       Anche `prossimaTappa` è uscita da qui: adesso parte dal riferimento
       dell'astinenza e non dall'ultima sigaretta. */
    return {
      giorno, sett, giorniTrascorsi, oggi, media, media7, mediaPrec, obiettivo, budget,
      perGiorno, indiceOggi, settTot, taggateSett, perFascia, fasciaTop, fasciaTopIndex,
      intervalloMedio, ultima: cigs.length ? cigs[cigs.length - 1] : null,
      resistSett: dati.resists.filter((t) => t >= inizioSett).length,
      topTrigger,
    };
  }, [dati, now, intervalli]);

  /* IL RIFERIMENTO — da quando dura il periodo senza fumare che mostriamo.
     Un solo valore per il numero grande della Home, le tappe del corpo, il
     record e la statistica «giorni senza fumare»: prima ognuno partiva per
     conto suo dall'ultima sigaretta, e chi dichiarava di aver smesso senza
     averne mai registrata una non aveva nessun contatore. */
  const rif = useMemo(() => riferimentoAstinenza(dati, now, intervalli), [dati, now, intervalli]);
  const giorniSenza = giorniSenzaFumare(rif, now);
  const copertoOra = intervalli.some(([da, a]) => da <= now && now <= a);

  /* Il banner della prossima tappa del corpo: sta fuori da `s` perché parte
     dal riferimento dell'astinenza e non dall'ultima sigaretta, così chi
     dichiara di aver smesso senza aver mai registrato niente ha comunque le
     sue tappe. */
  const prossimaTappa = useMemo(() => {
    const minuti = rif ? Math.max(0, now - rif) / 60000 : 0;
    const idxTappa = TAPPE.findIndex((t) => t.min > minuti);
    if (idxTappa < 0) return null;
    return {
      ...TAPPE[idxTappa],
      mancano: (TAPPE[idxTappa].min - minuti) * 60000,
      progresso: idxTappa === 0
        ? minuti / TAPPE[0].min
        : (minuti - TAPPE[idxTappa - 1].min) / (TAPPE[idxTappa].min - TAPPE[idxTappa - 1].min),
    };
  }, [rif, now]);

  /* Tappe del corpo: quando il tempo dal riferimento supera una soglia,
     parte la notifica. Se l'app è rimasta chiusa e ne sono passate più di una,
     avvisa solo della più alta ma le segna tutte come viste. */
  useEffect(() => {
    if (!isAuthenticated || !dati || !rif) return;
    const minuti = (now - rif) / 60000;
    const viste = dati.tappeViste?.ref === rif ? (dati.tappeViste.idx || []) : [];
    const nuove = TAPPE.map((t, i) => i).filter((i) => minuti >= TAPPE[i].min && !viste.includes(i));
    if (nuove.length === 0) return;

    const ultima = TAPPE[nuove[nuove.length - 1]];
    if (dati.avvisiCorpo !== false) {
      notificaSistema(`${ultima.avviso} 🫁`, ultima.avvisoTesto);
      setTappaBanner(ultima);
    }
    salva({ ...dati, tappeViste: { ref: rif, idx: [...viste, ...nuove] } });
    /* IDEM QUI, e per un motivo più stretto ancora: l'ultima riga del corpo
       chiama `salva({ ...dati, tappeViste })`, quindi `dati` cambia per
       causa di questo stesso effetto. Metterlo fra le dipendenze vuol dire
       farlo rientrare subito dopo essere uscito. Si ferma da solo — il
       `return` su `nuove.length === 0` lo taglia al secondo giro — ma
       resterebbe un effetto che si rincorre a ogni tappa del corpo.

       Le dipendenze vere sono il tempo che passa (`now`), il punto da cui
       si contano le tappe (`rif`) e l'essere entrati: quelle ci sono
       tutte. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, rif, isAuthenticated]);

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

  /* Il ritmo di partenza si calcola in UN SOLO POSTO e da lì lo prendono
     tutti. Prima la stessa formula era scritta due volte — qui e dentro
     `mese` — e bastava toccarne una perché due schermate dessero due
     risposte diverse alla stessa domanda. */
  const ritmo = useMemo(
    () => calcolaBaseline(dati?.profile, dati?.start, dati?.cigs || [], oggiChiave),
    [dati?.profile, dati?.start, dati?.cigs, oggiChiave],
  );

  const contiBase = useMemo(() => {
    if (!dati?.profile?.prezzoPacchetto || !dati.start) return null;
    const unit = dati.profile.prezzoPacchetto / (dati.profile.perPacchetto || 20);
    const minPer = MINUTI_PER_SIGARETTA[dati.profile.sesso || 'non_detto'];
    const oggiTs = oggiChiave;
    const giorniTot = dayDiff(dati.start, oggiTs) + 1;

    const oggiFumate = dati.cigs.filter((t) => t >= oggiTs).length;

    const inizioSett = addGiorni(oggiTs, -((giorniTot - 1) % 7));
    const settFumate = dati.cigs.filter((t) => t >= inizioSett).length;

    /* Niente ripiego sulla baseline quando la media dei sette giorni pieni
       non c'è ancora: `media7 ?? baseline` faceva uscire una proiezione di
       zero euro presentata come se fosse una previsione. Meglio un
       trattino, e `calcolaConti` lo propaga come null. */
    const mediaOra = media7;


    // conteggio per giorno degli ultimi 14 giorni: i filter costosi girano
    // una volta al giorno, non una volta al secondo
    const giorniCurva = Math.min(14, giorniTot);
    const inizioCurva = addGiorni(oggiTs, -(giorniCurva - 1));
    const curvaGiorni = [];
    for (let i = giorniCurva - 1; i >= 0; i -= 1) {
      const g = addGiorni(oggiTs, -i);
      const fine = addGiorni(g, 1);
      const n = dati.cigs.filter((t) => t >= g && t < fine).length;
      curvaGiorni.push({ n, da: g, a: fine, label: dataBreve(g) });
    }
    // quante ne sono state fumate PRIMA della finestra della curva: serve a
    // farla partire dal risparmio già accumulato invece che da zero
    const totPrimaCurva = dati.cigs.filter((t) => t < inizioCurva).length;

    return {
      unit, minPer,
      baseline: ritmo.valore,
      baselinePronta: ritmo.pronta,
      baselineDichiarata: ritmo.dichiarata,
      startTs: dati.start,
      // il tempo che i conti hanno il diritto di contare: il silenzio non
      // certificato non produce risparmio
      intervalli,
      oggiTs, inizioSett, mediaOra, curvaGiorni, inizioCurva, totPrimaCurva,
      totCigs: dati.cigs.length, oggiFumate, settFumate,
    };
    // `s` intero NON va nelle dipendenze: è un oggetto nuovo ogni 15 secondi
    // (dipende da `now`) e trascinava con sé tutti i filter costosi qui sopra.
    // Di `s` qui serve un solo numero, e quello basta come dipendenza.
  }, [dati, media7, oggiChiave, ritmo, intervalli]);

  /* Perché la card dei Numeri è vuota, quando è vuota. Sono due cose
     diverse e vanno dette in modo diverso: senza prezzo manca un dato che
     si scrive in dieci secondi, senza ritmo di partenza manca una misura
     che o si dichiara o richiede una settimana. */
  const contiMancanti = !dati?.profile?.prezzoPacchetto
    ? 'prezzo'
    : (dati?.start && !ritmo.pronta ? 'ritmo' : null);

  /* PARTE LEGGERA — pura aritmetica sui numeri già aggregati sopra: questa
     sì può girare a ogni tick di secondo senza mai toccare dati.cigs. */
  /* Il calcolo vive in utils/conti.js: è una funzione pura, quindi
     verifica/controlli.mjs può controllarne la coerenza interna senza
     montare React. Qui resta solo la memoizzazione. */
  /* L'ISTANTE PIÙ FRESCO FRA I DUE BATTITI, ed è l'unica dipendenza che
     serve oltre ai dati.

     `tick` batte ogni secondo ma SOLO nelle schede Oggi e Percorso, per non
     far lavorare il telefono a vuoto; `now` batte ogni quindici secondi
     sempre. Prendendo il maggiore dei due si ottiene esattamente quello che
     succedeva prima, quando `calcolaConti` leggeva l'orologio per conto suo
     e le due variabili servivano solo a farla rieseguire: un secondo dove i
     numeri si vedono, quindici dove non si vedono. */
  const adessoConti = Math.max(tick, now);
  const conti = useMemo(() => calcolaConti(contiBase, adessoConti), [contiBase, adessoConti]);

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
    const minuti = rif ? Math.max(0, now - rif) / 60000 : 0;
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
  }, [rif, now]);

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
    /* `ritmo.valore` e non `profile.baseline`: era l'ultima lettura diretta
       rimasta: il piano scavalcava `calcolaBaseline`, quindi chi non aveva
       dichiarato il ritmo non riceveva mai quello dedotto, e ripiegava su
       `s.media` — che conta il giorno in corso come se fosse pieno. */
    const base = s?.mediaPrec ?? s?.media ?? (ritmo.pronta ? ritmo.valore : null);
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

    /* La settimana a zero è l'ULTIMA RIGA del piano, non quella dopo.
       Il ciclo inserisce la riga e poi esce, quindi quando l'obiettivo
       scende sotto mezza sigaretta quella riga è già la settimana in cui
       si arriva a zero. Contando una settimana in più, la card diceva
       «sigaretta zero il 24 luglio» mentre la tabella sotto — nella stessa
       card — mostrava S6 con obiettivo 0,00 sette giorni prima. */
    const arrivaAZero = righe.length > 0 && righe[righe.length - 1].media < 0.5;
    const settZero = primaSett + righe.length - (arrivaAZero ? 1 : 0);
    return {
      righe: righe.slice(0, 8),
      settimaneRestanti: Math.max(1, settZero - settCorrente),
      dataZero: new Date(lunediSett(settZero))
        .toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }),
    };
    /* `ritmo.pronta` e `ritmo.valore` MANCAVANO, e il piano li legge (riga
       `const base = …` qui sopra). Sono le due dipendenze che decidono la
       base del piano, quindi senza di loro il piano poteva restare quello
       calcolato con il ritmo di prima. Non è un caso di scuola: `ritmo` si
       ricalcola anche quando cambia `oggiChiave`, cioè al cambio di giorno,
       e lì `dati` può non essere cambiato affatto.

       Sono due primitivi — un booleano e un numero — quindi entrano nelle
       dipendenze senza portarsi dietro l'identità di un oggetto nuovo a
       ogni render: il memo si rifà quando cambia il ritmo, non a ogni giro. */
  }, [dati, s, now, ritmo.pronta, ritmo.valore]);

  /* Il record vive in conti.js (D12) perché è una regola, non una
     riga di interfaccia: una pausa fra due sigarette conta solo se è
     interamente dentro un tratto coperto. Prima scorreva le sigarette
     due a due e basta, quindi dieci giorni di silenzio diventavano un
     record di dieci giorni senza fumare — gli stessi dieci giorni che i
     contatori si rifiutano di pagare. */
  const record = useMemo(
    () => ({ piuLungo: recordSenzaFumare(dati, now, intervalli, rif) }),
    [dati, now, intervalli, rif],
  );

  const mese = useMemo(() => {
    if (!dati || !dati.start) return null;
    const cigs = dati.cigs;
    const oggiTs = sod(now);
    const giorniTot = dayDiff(dati.start, now) + 1;
    const finestra30 = Math.min(30, giorniTot);
    const inizio30 = addGiorni(oggiTs, -(finestra30 - 1));
    const totale = cigs.filter((t) => t >= inizio30).length;

    /* Quattro settimane e non cinque: cinque barre coprono 35 giorni,
       mentre tutto il resto della sezione ne guarda 30. Due grafici
       affiancati con due periodi diversi e nessuna etichetta che lo dica
       sono due grafici che non si possono confrontare.
       Ogni finestra è di GIORNI PIENI, oggi escluso: prima l'ultima barra
       comprendeva la giornata in corso ma la divideva comunque per sette,
       quindi era per forza più bassa delle altre e mostrava un calo che in
       parte non era successo. */
    const nSettPossibili = Math.floor(dayDiff(dati.start, now) / 7) + 1;
    const nSett = Math.max(1, Math.min(4, nSettPossibili));
    const perSettimana = Array.from({ length: nSett }, (_, i) => {
      const idx = nSett - 1 - i;
      const fine = addGiorni(oggiTs, -idx * 7);
      const inizio = addGiorni(fine, -7);
      const daQui = Math.max(inizio, sod(dati.start));
      const validi = Math.max(1, Math.min(7, dayDiff(daQui, addGiorni(fine, -1)) + 1));
      const n = cigs.filter((t) => t >= daQui && t < fine).length;
      return { label: idx === 0 ? '7g' : `−${idx}s`, n: Math.round((n / validi) * 10) / 10, futuro: false };
    });

    /* Solo giorni COMPLETI e COPERTI: oggi non è finito, e un giorno in cui
       l'app non ha saputo niente non è un giorno a zero, è un giorno
       ignoto. Senza questa condizione, sparire era il modo più veloce per
       collezionare giorni a zero. */
    const giorniZero = giorniZeroCoperti(dati, now, intervalli, finestra30);

    /* LA STESSA FORMULA DEI CONTATORI, non una seconda versione.
       Qui c'era un secondo calcolo delle «sigarette risparmiate» che
       contava i giorni interi mentre `conti` li conta frazionari: con meno
       di trenta giorni di storico i due coprono lo stesso identico periodo
       e davano numeri diversi nella stessa schermata — «sono 107 sigarette
       che non hai fumato» due centimetri sopra «in questo mese hai fumato
       117 sigarette in meno». Adesso passa da `atteseFra`, che è la
       funzione che usano anche i contatori, con la stessa baseline. */
    /* CON IL SEGNO, come lo scarto dei conti. Prima qui c'era un
       `Math.max(0, ...)` e la frase sotto il grafico compariva solo quando
       il numero era positivo: chi stava fumando più del proprio ritmo di
       partenza non leggeva niente. Nascondere il caso brutto non è
       gentilezza, è la stessa asimmetria che rendeva impossibile fidarsi
       dei numeri — e le due card qui sopra il caso brutto lo dicono. */
    const scarto = ritmo.pronta
      ? ritmo.valore * tempoCoperto(intervalli, Math.max(inizio30, dati.start), now) - totale
      : null;
    const risparmiate = scarto === null ? null : Math.round(scarto);

    return {
      totale, perSettimana, giorniZero, risparmiate,
      resists: dati.resists.filter((t) => t >= inizio30).length,
    };
  }, [dati, now, ritmo, intervalli]);

  /* Il registro porta gli EVENTI, non gli istanti: la riga da cancellare
     e il motivo da mostrare vanno riferiti all'identificativo, altrimenti
     due sigarette nello stesso millisecondo si scambiano il motivo e un
     tocco sulla X ne cancella due. */
  const registro = useMemo(() => {
    if (!dati) return [];
    const g = new Map();
    (dati.eventi || [])
      .filter((e) => e.tipo === 'cig')
      .sort((a, b) => (b.ts - a.ts) || (a.id < b.id ? -1 : 1))
      .forEach((e) => {
        const k = sod(e.ts);
        if (!g.has(k)) g.set(k, []);
        g.get(k).push(e);
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

  /* Chi non DICHIARA la giornata esce dalla classifica: senza dati il
     confronto non vuol dire niente, e "sparire" non deve essere una
     strategia vincente. Un giorno è dichiarato o perché ci sono sigarette
     registrate, o perché è stato confermato "oggi zero" col check-in.

     La regola di prima guardava `lastAttivita`, che si accende anche con
     una voglia superata: bastava toccare un bottone per restare primi in
     classifica con zero sigarette e senza mai dire com'era andata la
     giornata. Chi non registrava niente risultava davanti a chi registrava
     quattro sigarette, cioè l'unica strategia vincente era smettere di
     segnare — e l'app perde esattamente il dato su cui si regge. */
  /* Un giorno è dichiarato se ci sono sigarette registrate, se è stato
     confermato «oggi zero», OPPURE se cade dopo una dichiarazione di aver
     smesso: è la stessa regola che dà significato al silenzio nei conti.
     Chi ha smesso davvero non deve tornare ogni giorno a giustificarsi. */
  const dichiarato = (m, chiave) => (m.days?.[chiave] || 0) > 0
    || !!m.checkins?.[chiave]
    || (!!m.smessoDal && chiave >= ymd(m.smessoDal));

  const ioAttivo = useMemo(() => {
    if (!dati) return false;
    if (Number.isFinite(dati.smessoDal) && dati.smessoDal <= now) return true;
    const oggiTs = sod(now);
    const ieriTs = addGiorni(oggiTs, -1);
    const inGiornata = (da, a) => dati.cigs.some((t) => t >= da && t < a)
      || (dati.checkins || []).some((t) => t >= da && t < a);
    return inGiornata(oggiTs, addGiorni(oggiTs, 1)) || inGiornata(ieriTs, oggiTs);
  }, [dati, now]);

  const classifica = useMemo(() => {
    const oggiKey = ymd(now);
    const ieriKey = ymd(addGiorni(now, -1));
    const giorniPeriodo = gruppoPeriodo === 'giorno' ? 1 : gruppoPeriodo === 'settimana' ? 7 : 30;
    // addGiorni e non `sod(now) − i*DAY`: nei due giorni del cambio d'ora
    // quel calcolo cade alle 23:00 o all'01:00 del giorno prima, e ymd()
    // restituiva la data sbagliata. La classifica saltava o contava due
    // volte un giorno, due volte l'anno, senza nessun segnale evidente.
    const chiavi = Array.from({ length: giorniPeriodo }, (_, i) => ymd(addGiorni(now, -i)));
    /* I sette giorni PIENI, oggi escluso, da tutte e due le parti del
       confronto. Con la giornata in corso dentro solo gli "ultimi", il calo
       usciva alto la mattina e calava da solo fino a sera: misurato su un
       membro che non aveva cambiato niente, −14% a mezzanotte e 0% alle
       23:00. È un criterio di ordinamento, quindi le persone venivano messe
       in fila secondo un numero che si muoveva da sé. */
    const ultimi7 = Array.from({ length: 7 }, (_, i) => ymd(addGiorni(now, -(i + 1))));

    return membriAttuali.map((m) => {
      const n = chiavi.reduce((tot, k) => tot + (m.days?.[k] || 0), 0);
      const resists = chiavi.reduce((tot, k) => tot + (m.resists?.[k] || 0), 0);
      const dichiarati = chiavi.filter((k) => dichiarato(m, k)).length;

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
      if (giorniOrdinati.length && dayDiff(daYmd(giorniOrdinati[0]), now) >= 14) {
        const primoGiorno = daYmd(giorniOrdinati[0]);
        const primi = Array.from({ length: 7 }, (_, i) => ymd(addGiorni(primoGiorno, i)))
          .reduce((t, k) => t + (m.days[k] || 0), 0) / 7;
        const ultimi = ultimi7.reduce((t, k) => t + (m.days[k] || 0), 0) / 7;
        if (primi > 0) calo = Math.round(((primi - ultimi) / primi) * 100);
      }
      // un giorno di tolleranza: chi non ha ancora aperto l'app oggi resta
      // in classifica finché ieri è dichiarato
      const attivo = dichiarato(m, oggiKey) || dichiarato(m, ieriKey);
      return {
        ...m, n, resists, calo, attivo, dichiarati, giorniPeriodo, oggi: m.days?.[oggiKey] || 0,
      };
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
  const giorniPercorso = calcolaGiorniPercorso(dati, now);

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
                  giorniPercorso={giorniPercorso} ultimoId={ultimoId} ultimoTs={ultimoTs}
                  gruppi={gruppi}
                  tappaBanner={tappaBanner} onChiudiBanner={() => setTappaBanner(null)}
                  checkedIn={checkedInOggi} lotto={lotto}
                  onFuma={registraSigaretta} onUmore={() => setUmore(true)}
                  rif={rif} prossimaTappa={prossimaTappa} copertoOra={copertoOra}
                  inAstinenza={Number.isFinite(dati?.smessoDal)} onCheckin={handleCheckin}
                  onTante={() => setTante(true)} onAnnullaLotto={annullaLotto}
                  onVediRegistro={() => { setActiveTab('percorso'); setPercorsoSezione('registro'); setLotto(null); }}
                  onAnnulla={handleAnnulla} onTag={handleTag} onSkipTag={() => setUltimoId(null)}
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
                  mancante={contiMancanti} onVaiAlProfilo={() => setActiveTab('profilo')}
                  rif={rif} giorniSenza={giorniSenza} copertoOra={copertoOra}
                  inAstinenza={Number.isFinite(dati?.smessoDal)}
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
                  smessoDal={dati?.smessoDal ?? null} giorniSenza={giorniSenza}
                  onDichiaraSmesso={dichiaraSmesso} onAnnullaSmesso={annullaSmesso}
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
                  smessoDal={dati?.smessoDal ?? null} giorniSenza={giorniSenza}
                  onDichiaraSmesso={dichiaraSmesso} onAnnullaSmesso={annullaSmesso}
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
            onCeLHoFatta={() => { registraResistenza(); setCraving(false); showToast(toastVoglia()); }}
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
                showToast(toastVoglia());
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
