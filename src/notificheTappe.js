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

import { TAPPE } from './constants';

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

async function programmaConCapacitor(LocalNotifications, daTs) {
  const { display } = await LocalNotifications.checkPermissions();
  if (display !== 'granted') {
    const richiesta = await LocalNotifications.requestPermissions();
    if (richiesta.display !== 'granted') return false;
  }

  // via le vecchie: il conto riparte da questa sigaretta
  const inSospeso = await LocalNotifications.getPending();
  const nostre = inSospeso.notifications.filter((n) => n.id >= ID_BASE && n.id < ID_BASE + 100);
  if (nostre.length) await LocalNotifications.cancel({ notifications: nostre });

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

async function programmaSulWeb(daTs) {
  if (typeof Notification === 'undefined') return false;

  const reg = await registrazioneSW();
  if (!reg) return false;

  if (Notification.permission !== 'granted') {
    if ((await Notification.requestPermission()) !== 'granted') return false;
  }

  // Rimuove quelle programmate per la sigaretta precedente. Il filtro per
  // `tag` è un confronto esatto: le nostre notifiche hanno tag "tappa-0",
  // "tappa-1"… quindi chiedere tag "tappa" non trovava mai niente e le
  // vecchie tappe restavano in coda. Si prendono tutte e si filtra a mano.
  const attive = await reg.getNotifications({ includeTriggered: true });
  attive.filter((n) => n.tag?.startsWith('tappa-')).forEach((n) => n.close());

  if (!('showTrigger' in Notification.prototype) || !window.TimestampTrigger) return false;

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

export async function programmaTappe(daTs = Date.now()) {
  const LocalNotifications = await capacitor();
  if (LocalNotifications) return programmaConCapacitor(LocalNotifications, daTs);
  return programmaSulWeb(daTs);
}

export async function annullaTappe() {
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
