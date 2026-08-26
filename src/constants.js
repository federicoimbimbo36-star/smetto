/* ------------------------------------------------------------------ */
/* CONFIG                                                              */
/* ------------------------------------------------------------------ */

export const PALETTE = ['#E24A17', '#3E6B52', '#BE8850', '#17181A', '#3A5A6B', '#6B3A52'];
export const TRIGGER = ['stress', 'noia', 'caffè', 'dopo mangiato', 'con altri'];
export const RIDUZIONE = 0.15;              // −15% sulla media della settimana precedente
export const ATTESA = 180;                  // secondi del "aspetta prima di accendere"
export const DAY = 86400000;

/* Jackson, Jarvis & West — "The price of a cigarette: 20 minutes of life?",
   Addiction (2024), studio UCL commissionato dal Dipartimento della Salute UK.
   Media 20 minuti per sigaretta: 17 per gli uomini, 22 per le donne.
   Sostituisce la vecchia stima di 11 minuti (BMJ 2000, solo dati maschili). */
export const MINUTI_PER_SIGARETTA = { uomo: 17, donna: 22, non_detto: 20 };

export const AUTH_KEY = 'smetto:auth:v1';
export const logKey = (uid) => `smetto:log:${uid}`;
export const seenKey = (uid) => `smetto:seen:${uid}`;
/* groupKey / memberPrefix / memberKey sono spariti insieme al vecchio KV
   condiviso: i gruppi stanno su tabelle vere (vedi data/groups.js) e non
   hanno più una chiave di storage. Tenerli qui significava lasciare in giro
   il nome di uno schema che non esiste più. */

export const FASCE = [
  { id: 'notte', label: 'notte', from: 0, to: 6 },
  { id: 'mattina', label: 'mattina', from: 6, to: 10 },
  { id: 'metà mattina', label: 'metà mattina', from: 10, to: 13 },
  { id: 'pomeriggio', label: 'pomeriggio', from: 13, to: 17 },
  { id: 'sera', label: 'sera', from: 17, to: 21 },
  { id: 'tarda sera', label: 'tarda sera', from: 21, to: 24 },
];

export const TAPPE = [
  {
    min: 20, titolo: 'Battito e pressione', testo: 'Tornano ai valori che avevi prima di accendere.',
    avviso: 'Battito e pressione a posto',
    avvisoTesto: 'Venti minuti senza fumare: il cuore è già tornato al suo ritmo normale. Continua così.',
  },
  {
    min: 60 * 8, titolo: 'Ossigeno nel sangue', testo: 'Il monossido di carbonio si dimezza e l\u2019ossigeno risale.',
    avviso: 'Monossido dimezzato',
    avvisoTesto: 'Otto ore pulite: il monossido di carbonio nel sangue si è dimezzato e l\u2019ossigeno è risalito. Continua così.',
  },
  {
    min: 60 * 24, titolo: 'Cuore', testo: 'Comincia a scendere il rischio di infarto.',
    avviso: 'Ventiquattro ore',
    avvisoTesto: 'Un giorno intero senza fumare: il rischio di infarto ha già cominciato a scendere.',
  },
  {
    min: 60 * 48, titolo: 'Gusto e olfatto', testo: 'Le terminazioni nervose ricrescono: il cibo torna ad avere sapore.',
    avviso: 'Torna il sapore',
    avvisoTesto: 'Due giorni: le terminazioni nervose ricrescono. Nei prossimi pasti sentirai la differenza.',
  },
  {
    min: 60 * 72, titolo: 'Respiro', testo: 'I bronchi si rilassano. È anche il picco dell\u2019astinenza: da qui in poi cala.',
    avviso: 'Respiri meglio',
    avvisoTesto: 'Tre giorni: i bronchi si sono rilassati. È il momento più duro dell\u2019astinenza — da qui in poi cala.',
  },
  {
    min: 60 * 24 * 14, titolo: 'Circolazione', testo: 'Camminare e fare le scale costa meno fatica.',
    avviso: 'Due settimane',
    avvisoTesto: 'La circolazione è migliorata: scale e camminate costano meno fatica. Stai andando forte.',
  },
  {
    min: 60 * 24 * 90, titolo: 'Polmoni', testo: 'Le ciglia bronchiali tornano a lavorare: meno tosse e meno infezioni.',
    avviso: 'Tre mesi',
    avvisoTesto: 'Le ciglia bronchiali sono tornate a lavorare: meno tosse, meno infezioni. Tre mesi non si cancellano.',
  },
  {
    min: 60 * 24 * 365, titolo: 'Un anno', testo: 'Il rischio di malattia coronarica è circa la metà di quello di un fumatore.',
    avviso: 'Un anno',
    avvisoTesto: 'Un anno senza fumare: il rischio di malattia coronarica è circa la metà di quello di un fumatore.',
  },
  {
    min: 60 * 24 * 365 * 5, titolo: 'Cinque anni', testo: 'Il rischio di ictus si avvicina a quello di chi non ha mai fumato.',
    avviso: 'Cinque anni',
    avvisoTesto: 'Cinque anni: il rischio di ictus si avvicina a quello di chi non ha mai fumato.',
  },
  {
    min: 60 * 24 * 365 * 10, titolo: 'Dieci anni', testo: 'Il rischio di tumore al polmone è circa la metà di quello di un fumatore.',
    avviso: 'Dieci anni',
    avvisoTesto: 'Dieci anni: il rischio di tumore al polmone è circa la metà di quello di un fumatore.',
  },
];

export const MANTRA = 'Non smettere mai di provare a smettere.';

/* cosa dire quando qualcuno ricade: mai colpevolizzare, sempre rilanciare */
export const RILANCI = [
  'Una sigaretta non cancella quello che hai fatto prima. Riparti da adesso, non da lunedì.',
  'Quasi nessuno smette al primo tentativo. Chi ce la fa è chi ci riprova.',
  'Questa è una caduta, non la fine. Il conto riparte, il percorso no.',
  'Il tempo che avevi tenuto resta tuo: il corpo non te lo toglie indietro.',
];

export const CONSIGLI = [
  'La voglia sale, tocca un picco e scende. Non cresce all\u2019infinito: dura pochi minuti.',
  'Bevi un bicchiere d\u2019acqua a piccoli sorsi. Occupa la bocca e le mani.',
  'Esci dalla stanza in cui sei. Gran parte della voglia è attaccata al posto, non alla nicotina.',
  'Fai dieci respiri lunghi contando fino a quattro. Serve davvero, non è un modo di dire.',
  'Tieni le mani occupate: la gestualità pesa quanto la sostanza.',
  'Scrivi a qualcuno del gruppo. Dirlo a voce alta la sgonfia.',
  'Se cedi, non è un fallimento: è un dato. Registralo e vai avanti.',
  'Lavati i denti o mangia qualcosa di aspro: cambia il sapore che stai cercando.',
];

export const MOTIVI = ['Per i miei figli', 'Per la salute', 'Per i soldi', 'Per l\u2019odore', 'Per riprendere fiato'];
