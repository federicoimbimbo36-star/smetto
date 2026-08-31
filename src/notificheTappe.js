/* ------------------------------------------------------------------ */
/* notificheTappe.js — src/notificheTappe.js                           */
/*                                                                     */
/* Dentro App.jsx le tappe scattano mentre l'app è aperta. Perché       */
/* arrivino anche a telefono in tasca serve programmarle in anticipo:   */
/* si conosce l'orario dell'ultima sigaretta, quindi si conoscono già   */
/* tutti gli istanti futuri in cui devono suonare.                      */
/*                                                                     */
/* Uso:                                                                 */
/*   import { programmaTappe, annullaTappe } from './notificheTappe';   */
/*   // a ogni sigaretta registrata:                                    */
/*   await programmaTappe(ts);   // ts = timestamp della sigaretta      */
/*                                                                     */
/* I testi delle tappe NON sono più ricopiati qui: arrivano da          */
/* constants.TAPPE, che è l'unico posto dove esistono. Prima erano due  */
/* elenchi paralleli — 10 tappe in constants, 8 qui — e le ultime due   */
/* (5 e 10 anni) non venivano mai notificate a app chiusa. Due copie a  */
/* mano degli stessi dati divergono sempre: prima o poi.                */
/* ------------------------------------------------------------------ */

/* L'estensione serve: senza, Node non risolve il percorso e questo file
   resta impossibile da provare fuori dal browser. Vite risolve in
   entrambi i modi, ed è la stessa convenzione che seguono già gli altri
   moduli verificabili (`arretrate.js` importa `./format.js`). */
import { TAPPE } from './constants.js';

const ID_BASE = 4100;      // spazio di id riservato a queste notifiche
const ANTICIPO = 30000;    // sotto i 30 secondi non ha senso programmare niente

/* ---------- 1. App impacchettata con Capacitor (iOS / Android) ---------- */
/* È l'unica strada che funziona davvero a app chiusa sui telefoni.
   npm i @capacitor/local-notifications                                    */

async function capacitor() {
  try {
    const mod = await import('@capacitor/local-notifications');
    return mod?.LocalNotifications || null;
  } catch (e) {
    return null;      // build web senza Capacitor: si prosegue col ramo browser
  }
}

async function programmaConCapacitor(LocalNotifications, daTs, superata) {
  const { display } = await LocalNotifications.checkPermissions();
  if (display !== 'granted') {
    const richiesta = await LocalNotifications.requestPermissions();
    if (richiesta.display !== 'granted') return false;
  }
  if (superata()) return false;

  // via le vecchie: il conto riparte da questa sigaretta
  const inSospeso = await LocalNotifications.getPending();
  /* PRIMA DI CANCELLARE, non solo prima di programmare: la lettura qui
     sopra è un'attesa, e chi è stato sorpassato mentre aspettava
     cancellerebbe le tappe che l'altra catena ha appena programmato — poi
     si ritirerebbe, lasciando il telefono senza nessuna tappa. */
  if (superata()) return false;
  const nostre = inSospeso.notifications.filter((n) => n.id >= ID_BASE && n.id < ID_BASE + 100);
  if (nostre.length) await LocalNotifications.cancel({ notifications: nostre });
  /* ANCHE DOPO LA CANCELLAZIONE. Era l'ultima attesa scoperta: le vecchie
     sono già state tolte, e se qui in mezzo è arrivata una richiesta più
     recente programmare adesso vorrebbe dire rimettere in piedi le tappe
     di una sigaretta superata sopra quelle giuste. */
  if (superata()) return false;

  const adesso = Date.now();
  const notifications = TAPPE
    .map((t, i) => ({ t, i, quando: daTs + t.min * 60000 }))
    .filter(({ quando }) => quando > adesso + ANTICIPO)
    .map(({ t, i, quando }) => ({
      id: ID_BASE + i,
      title: `${t.avviso} 🫁`,
      body: t.avvisoTesto,
      schedule: { at: new Date(quando), allowWhileIdle: true },
    }));

  if (superata()) return false;
  if (notifications.length) await LocalNotifications.schedule({ notifications });
  return true;
}

/* ---------- 2. Web: service worker + Notification Triggers ---------- */
/* Funziona solo su alcuni browser Chromium E solo se un service worker
   è registrato. Dove manca, le tappe restano quelle in-app: è un limite
   del web, non un bug.

   ⚠️  Qui si usa getRegistration() e NON serviceWorker.ready: `ready` è
   una promise che, se nessun service worker viene mai registrato, non si
   risolve MAI. Era il motivo per cui logout ed eliminazione account
   restavano appesi per sempre — annullaTappe() è awaitata, e aspettava
   qualcosa che non sarebbe mai arrivato.                                */

async function registrazioneSW() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration()) || null;
  } catch (e) {
    return null;
  }
}

async function programmaSulWeb(daTs, superata) {
  if (typeof Notification === 'undefined') return false;

  const reg = await registrazioneSW();
  if (!reg) return false;

  if (Notification.permission !== 'granted') {
    if ((await Notification.requestPermission()) !== 'granted') return false;
  }
  if (superata()) return false;

  // Rimuove quelle programmate per la sigaretta precedente. Il filtro per
  // `tag` è un confronto esatto: le nostre notifiche hanno tag "tappa-0",
  // "tappa-1"… quindi chiedere tag "tappa" non trovava mai niente e le
  // vecchie tappe restavano in coda. Si prendono tutte e si filtra a mano.
  const attive = await reg.getNotifications({ includeTriggered: true });
  // vedi la nota nel ramo Capacitor: chi è stato sorpassato non cancella
  if (superata()) return false;
  attive.filter((n) => n.tag?.startsWith('tappa-')).forEach((n) => n.close());

  if (!('showTrigger' in Notification.prototype) || !window.TimestampTrigger) return false;
  if (superata()) return false;

  const Trigger = window.TimestampTrigger;
  const adesso = Date.now();

  await Promise.all(TAPPE.map((t, i) => {
    const quando = daTs + t.min * 60000;
    if (quando <= adesso + ANTICIPO) return null;
    // icon e badge esistono davvero in public/ (li genera
    // strumenti/genera-icone.py): prima puntavano a due file mancanti e
    // ogni tappa programmata lasciava dietro una richiesta fallita.
    return reg.showNotification(`${t.avviso} 🫁`, {
      body: t.avvisoTesto,
      tag: `tappa-${i}`,
      showTrigger: new Trigger(quando),
      icon: '/icon-192.png',
      badge: '/badge.png',
    });
  }).filter(Boolean));

  return true;
}

/* ---------- API pubblica ---------- */

/* IL NUMERO DELL'ULTIMA RICHIESTA.

   Programmare le tappe non è un'operazione sola: è un import dinamico, un
   controllo dei permessi, una lettura di quelle in sospeso, una
   cancellazione e infine la programmazione. Cinque attese, e nel frattempo
   l'utente può registrare un'altra sigaretta.

   Le notifiche hanno identificativi fissi (`ID_BASE + i`) e sul web tag
   fissi (`tappa-i`), quindi l'ULTIMA programmazione che arriva vince. Se
   le due chiamate si sovrappongono e la più vecchia finisce per ultima,
   restano programmate le tappe della sigaretta di PRIMA: il telefono
   avvisa «sono passate due ore» contando da una sigaretta che non è più
   l'ultima, cioè dà una notizia falsa su una cosa che l'utente sta
   cercando di misurare.

   Ogni chiamata prende un numero. Prima di ogni passo che scrive
   davvero controlla di essere ancora l'ultima; se non lo è, si ritira
   senza toccare niente. `annullaTappe` alza il numero a sua volta, così
   una programmazione in volo non può ricomparire dopo un logout o dopo
   l'eliminazione dell'account. */
let ultimaRichiesta = 0;

/* UNA CODA SERIALE, oltre al numero.

   Il numero da solo non bastava, e i casi che restavano scoperti sono
   tre. Programmare e annullare sono catene di attese, e senza un ordine
   si intrecciano:

   - un annullamento LENTO poteva finire dopo una programmazione veloce e
     cancellare le notifiche appena messe: il telefono restava senza
     nessuna tappa, e nessuno se ne accorgeva finché non mancava
     l'avviso;
   - `annullaTappe` non aveva un numero suo, quindi non poteva accorgersi
     di essere stata superata;
   - fra la cancellazione delle vecchie e la programmazione delle nuove
     c'era un'attesa senza controllo.

   La coda mette le operazioni in fila: la seconda comincia quando la
   prima ha finito, quindi due catene non si intrecciano più. Il numero
   resta e serve a un'altra cosa: scartare in partenza quello che è già
   stato superato mentre aspettava il proprio turno. Le due cose insieme
   coprono tutti e tre i casi, e valgono per il ramo Capacitor come per
   quello web perché stanno qui sopra, prima del bivio. */
let coda = Promise.resolve();

function accoda(operazione) {
  const esito = coda.then(operazione);
  coda = esito.then(() => {}, () => {});
  return esito;
}

export function programmaTappe(daTs = Date.now()) {
  ultimaRichiesta += 1;
  const mia = ultimaRichiesta;
  const superata = () => mia !== ultimaRichiesta;

  return accoda(async () => {
    // superata mentre aspettava il turno: non tocca niente
    if (superata()) return false;
    const LocalNotifications = await capacitor();
    if (superata()) return false;
    if (LocalNotifications) return programmaConCapacitor(LocalNotifications, daTs, superata);
    return programmaSulWeb(daTs, superata);
  });
}

/* L'annullamento prende un numero come la programmazione — così una
   programmazione in volo si accorge di essere stata superata — ma NON si
   ritira mai per conto suo: cancellare è sempre sicuro, e rinunciare
   perché è arrivata dopo una programmazione lascerebbe delle notifiche
   in piedi dopo un logout. Ci pensa la coda a metterlo nell'ordine
   giusto. */
export function annullaTappe() {
  ultimaRichiesta += 1;
  return accoda(() => annullaAdesso());
}

async function annullaAdesso() {
  const LocalNotifications = await capacitor();
  if (LocalNotifications) {
    const inSospeso = await LocalNotifications.getPending();
    const nostre = inSospeso.notifications.filter((n) => n.id >= ID_BASE && n.id < ID_BASE + 100);
    if (nostre.length) await LocalNotifications.cancel({ notifications: nostre });
    return;
  }

  const reg = await registrazioneSW();
  if (!reg) return;      // niente service worker: niente da annullare, e si torna subito
  const attive = await reg.getNotifications({ includeTriggered: true });
  attive.filter((n) => n.tag?.startsWith('tappa-')).forEach((n) => n.close());
}
