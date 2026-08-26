/* estensione esplicita: Vite la risolve uguale, ma così questo file si può
   importare anche da Node "nudo" — è quello che fa verifica/controlli.mjs,
   che deve poter girare senza installare niente */
import { DAY, RIDUZIONE } from '../constants.js';

export const sod = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const dayDiff = (a, b) => Math.round((sod(b) - sod(a)) / DAY);

/* Mezzanotte di N giorni prima o dopo, ora legale compresa.
   Perché serve: `ts − 1 * 86400000` è esatto solo se tutti i giorni durano
   24 ore. In Italia due volte l'anno ne durano 23 e 25, e da lì in poi i
   confini di giornata restano spostati di un'ora: le sigarette fumate a
   ridosso della mezzanotte finivano nel giorno sbagliato, e la classifica
   del gruppo — che costruisce le chiavi con ymd(sod(now) − i·DAY) — poteva
   saltare o ripetere una data. setDate() ragiona per giorni di calendario. */
export const addGiorni = (ts, n) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.getTime();
};

/* Math.max(...array) passa ogni elemento come argomento: su uno storico
   lungo (anni di sigarette) si arriva al limite di argomenti del motore JS
   e parte un RangeError. Qui si scorre e basta. Su array vuoto torna null
   invece di −Infinity, così `if (ultima)` si comporta come ci si aspetta. */
export const maxTs = (lista) => {
  if (!lista || !lista.length) return null;
  let m = lista[0];
  for (let i = 1; i < lista.length; i += 1) if (lista[i] > m) m = lista[i];
  return m;
};

/* "2026-08-25" → mezzanotte locale di quel giorno.
   new Date('2026-08-25') sarebbe mezzanotte UTC: a Roma è il giorno prima. */
export const daYmd = (chiave) => {
  const [a, m, g] = String(chiave).split('-').map(Number);
  return new Date(a, m - 1, g).getTime();
};
export const ora = (ts) => new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
export const dec = (n) => n.toFixed(1).replace('.', ',');
export const eur = (n) => `${n.toFixed(2).replace('.', ',')} €`;
/* col segno esplicito: il meno tipografico, non il trattino */
export const eurSegno = (n) => `${n < -0.004 ? '−' : ''}${Math.abs(n).toFixed(2).replace('.', ',')} €`;
export const eur0 = (n) => `${Math.round(n).toLocaleString('it-IT')} €`;
export const ymd = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const initials = (n = '') =>
  n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

/* minuti → "3g 4h", "5h 20m", "42m"; se negativo antepone il meno */
export const tempoVita = (minuti) => {
  const segno = minuti < -0.5 ? '−' : '';
  const m = Math.floor(Math.abs(minuti));
  if (m < 60) return `${segno}${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${segno}${h}h ${String(m % 60).padStart(2, '0')}m`;
  const g = Math.floor(h / 24);
  if (g < 60) return `${segno}${g}g ${h % 24}h`;
  const mesi = Math.floor(g / 30);
  return `${segno}${mesi} mesi ${g % 30}g`;
};

export const durata = (ms) => {
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'adesso';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const g = Math.floor(h / 24);
  if (g < 30) return `${g}g ${h % 24}h`;
  return `${Math.floor(g / 30)} mesi`;
};

export const mmss = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
export const relativeTime = (ts) => (Date.now() - ts < 60000 ? 'ora' : `${durata(Date.now() - ts)} fa`);

export const etichettaGiorno = (ts, oggi) => {
  const d = dayDiff(ts, oggi);
  if (d === 0) return 'oggi';
  if (d === 1) return 'ieri';
  return new Date(ts).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
};

export const dataBreve = (ts) => new Date(ts).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

/* nuovoCodice() è stato tolto: i codici invito li genera il database
   (funzione nuovo_codice), che è l'unico posto in grado di garantire che
   non ne esca uno già in uso. Generarlo anche qui voleva dire avere due
   sorgenti di verità per la stessa cosa. */

export const prossimaMedia = (m) => Math.max(0, Math.min(m * (1 - RIDUZIONE), m - 1));

export const normalizePhone = (raw) => {
  const digits = String(raw).replace(/[^0-9+]/g, '');
  if (digits.startsWith('+')) return digits;
  const senzaZeri = digits.replace(/^0+/, '');
  // un cellulare italiano locale ha 10 cifre: se dopo aver tolto eventuali
  // zeri iniziali (es. "0039...") restano 12 cifre che iniziano già per 39,
  // il prefisso c'è già e non va raddoppiato.
  const giaConPrefisso = senzaZeri.startsWith('39') && senzaZeri.length === 12;
  return giaConPrefisso ? `+${senzaZeri}` : `+39${senzaZeri}`;
};
