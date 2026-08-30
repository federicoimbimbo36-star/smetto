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

/* Quanto dura DAVVERO il giorno di quel timestamp: 24 ore quasi sempre,
   23 o 25 nei due giorni del cambio d'ora. */
const durataGiorno = (ts) => { const i = sod(ts); return addGiorni(i, 1) - i; };

/* Giorni FRAZIONARI fra due istanti, ora legale compresa.
   `(b − a) / 86400000` sbaglia di un'ora tutte le volte che nell'intervallo
   c'è un cambio d'ora, e quell'ora resta dentro per sempre: a 20 sigarette
   al giorno vale 0,83 sigarette, cioè un quarto di euro che compare o
   sparisce dai contatori senza motivo. Qui i giorni interi li conta
   dayDiff (che ragiona per calendario) e le due code si misurano come
   frazione del giorno a cui appartengono. */
export const giorniFra = (a, b) => {
  const frazione = (ts) => (ts - sod(ts)) / durataGiorno(ts);
  return dayDiff(a, b) + frazione(b) - frazione(a);
};

/* Math.max(...array) passa ogni elemento come argomento: su uno storico
   lungo (anni di sigarette) si arriva al limite di argomenti del motore JS
   e parte un RangeError. Qui si scorre e basta. Su array vuoto torna null
   invece di −Infinity, così `if (ultima)` si comporta come ci si aspetta. */
export const maxTs = (lista) => {
  if (!lista || !lista.length) return null;
  /* Solo numeri veri. Con una stringa in mezzo — e da un backup JSON
     reimportato ci arriva — il confronto `'x' > 12345` è falso in tutti e
     due i versi, quindi maxTs poteva restituire la stringa; da lì
     `Math.max(ultima, certificato)` faceva NaN e il riferimento
     dell'astinenza, che è la fonte del numero grande della Home, spariva
     senza nessun errore visibile. */
  let m = null;
  for (let i = 0; i < lista.length; i += 1) {
    const v = lista[i];
    if (!Number.isFinite(v)) continue;
    if (m === null || v > m) m = v;
  }
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

/* Il PREZZO DI UNA SIGARETTA va scritto per intero, non arrotondato al
   centesimo. Un pacchetto da 6,50 € costa 0,325 € a sigaretta: mostrando
   «0,33 €» la card dichiarava una catena che non tornava — su 367
   sigarette il lettore con la calcolatrice trovava 1,83 € in più di
   quanto la card stessa dichiarava come totale. Tre decimali coprono
   tutti i formati di pacchetto reali (10, 20, 25, 30 sigarette). */
export const eurUnitario = (n) => {
  const s = n.toFixed(3).replace(/0$/, '').replace(/\.$/, '');
  return `${s.replace('.', ',')} €`;
};
/* col segno esplicito: il meno tipografico, non il trattino */
export const eurSegno = (n) => `${n < -0.004 ? '−' : ''}${Math.abs(n).toFixed(2).replace('.', ',')} €`;
/* stesso meno tipografico di eurSegno: il trattino ASCII di toLocaleString
   stonava accanto alle altre cifre negative della stessa riga */
export const eur0 = (n) => `${n < -0.5 ? '−' : ''}${Math.round(Math.abs(n)).toLocaleString('it-IT')} €`;
export const ymd = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const initials = (n = '') =>
  n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

/* Mesi e anni delle durate lunghe. Un mese vale 30,44 giorni, non 30
   tondi: con i mesi da 30 giorni un anno intero usciva «12 mesi 5g», che
   è il traguardo più grande dell'app scritto nel modo meno
   riconoscibile possibile. Sotto il mese si continua a contare a giorni,
   perché «1 mese» per trenta giorni sarebbe una promessa in anticipo. */
const GIORNI_MESE = 30.4375;
const GIORNI_ANNO = 365;
const plurale = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;

/* La parte lunga, comune a tempoVita e durata: da un mese in su. */
const lunga = (g) => {
  if (g < GIORNI_ANNO) {
    const mesi = Math.floor(g / GIORNI_MESE);
    const resto = Math.floor(g - mesi * GIORNI_MESE);
    return `${plurale(mesi, 'mese', 'mesi')}${resto ? ` ${resto}g` : ''}`;
  }
  const anni = Math.floor(g / GIORNI_ANNO);
  const mesi = Math.floor((g - anni * GIORNI_ANNO) / GIORNI_MESE);
  return `${plurale(anni, 'anno', 'anni')}${mesi ? ` ${plurale(mesi, 'mese', 'mesi')}` : ''}`;
};

/* minuti → "1 anno 2 mesi", "3 mesi 4g", "3g 4h", "5h 20m", "42m".
   Se negativo antepone il meno tipografico. */
export const tempoVita = (minuti) => {
  const segno = minuti < -0.5 ? '−' : '';
  const m = Math.floor(Math.abs(minuti));
  if (m < 60) return `${segno}${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${segno}${h}h ${String(m % 60).padStart(2, '0')}m`;
  const g = Math.floor(h / 24);
  if (g < 31) return `${segno}${g}g ${h % 24}h`;
  return `${segno}${lunga(g)}`;
};

/* Durate "quanto è passato / quanto manca". Stessa scala di tempoVita:
   prima questa si fermava ai mesi e un anno intero senza fumare veniva
   annunciato come «12 mesi», mentre trenta giorni diventavano «1 mesi». */
export const durata = (ms) => {
  const m = Math.floor(Math.max(0, ms) / 60000);
  if (m < 1) return 'adesso';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const g = Math.floor(h / 24);
  if (g < 31) return `${g}g ${h % 24}h`;
  return lunga(g);
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

/* Le cifre utili di un numero locale: via spazi, trattini, parentesi e lo
   zero iniziale che in mezza Europa si scrive e non si compone. */
export const cifreLocali = (raw) => String(raw).replace(/[^0-9]/g, '').replace(/^0+/, '');

/* Paese scelto + numero digitato → il numero in formato internazionale.

   La parte delicata è capire se il numero digitato porta già il prefisso.
   La regola ingenua — «se comincia con le cifre del prefisso, toglile» —
   è sbagliata e lo dimostra un caso solo: 391 è un prefisso mobile
   italiano vero, quindi «3912345678» è un numero legittimo che quella
   regola trasformava in «+39 12345678», cioè in niente.

   Qui si toglie il prefisso in due soli casi, entrambi non ambigui:
     1. l'utente ha scritto esplicitamente un numero internazionale, col +
        o con lo 00 davanti;
     2. tenendo il prefisso il numero sarebbe TROPPO LUNGO per il paese
        scelto, e togliendolo torna di una lunghezza valida.
   Fuori da questi due casi le cifre restano quelle che sono: meglio un
   errore visibile («un numero Italia ha fra 9 e 11 cifre») che un numero
   accorciato in silenzio. */
export const componiTelefono = (paese, numero) => {
  const pref = String(paese?.prefisso ?? paese ?? '').replace(/[^0-9]/g, '');
  const min = paese?.min ?? 6;
  const max = paese?.max ?? 14;

  const grezzo = String(numero).replace(/[^0-9+]/g, '');
  const esplicito = grezzo.startsWith('+') || grezzo.startsWith('00');
  let cifre = grezzo.replace(/^\+/, '').replace(/^00/, '');

  const restante = cifre.slice(pref.length).replace(/^0+/, '');
  const dopoIlTaglio = cifre.startsWith(pref) && pref.length > 0;
  const troppoLungoCosi = cifre.replace(/^0+/, '').length > max;
  const giustoSenza = restante.length >= min && restante.length <= max;

  if (dopoIlTaglio && (esplicito || (troppoLungoCosi && giustoSenza))) cifre = cifre.slice(pref.length);

  return `+${pref}${cifre.replace(/^0+/, '')}`;
};

/* Resta per i numeri già salvati e per quelli scritti a mano in un campo
   solo (il recupero password). Se non c'è nessun prefisso, si assume +39. */
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
