/* ------------------------------------------------------------------ */
/* CONFIG                                                              */
/* ------------------------------------------------------------------ */

/* I colori dell'avatar. Sono tutti mezzi toni desaturati della stessa
   famiglia della palette (vedi styles.css): un colore acceso qui dentro
   spaccherebbe la calma di ogni schermata in cui compare una classifica.
   Tutti reggono le iniziali in BIANCO sopra con almeno 5.8:1 di contrasto,
   che è come li disegna .avatar. */
export const PALETTE = ['#286B5A', '#2F6470', '#6B5470', '#7A5A3C', '#4F6B3A', '#8A5560'];

/* Le situazioni che innescano. Servono a due cose insieme: sono le
   etichette del registro ("cos'era?") e sono le chiavi dei se–allora.
   La stessa lista compare dopo una ricaduta come «cosa è successo?»:
   una risposta data lì diventa un dato nel registro, non una confessione
   che finisce nel vuoto. */
export const TRIGGER = ['stress', 'noia', 'alcol', 'con altri', 'abitudine', 'ansia', 'dopo mangiato'];
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

/* Le quattro risposte del check-in. Ognuna porta da qualche parte:
   non è un sondaggio, è uno smistamento. */
export const UMORI = [
  { id: 'bene', faccia: '🙂', testo: 'Sto bene', sub: 'Oggi non è un problema' },
  { id: 'cosi', faccia: '😐', testo: 'Così così', sub: 'Ci penso, ma tengo' },
  { id: 'voglia', faccia: '😣', testo: 'Ho voglia di fumare', sub: 'Superiamo insieme i prossimi minuti' },
  { id: 'fatica', faccia: '😔', testo: 'Sto facendo fatica', sub: 'Vediamo cosa può aiutarti adesso' },
];

/* La riga sotto il numero grande della Home. Cambia ogni giorno (indice
   dal giorno di percorso, non a caso: due aperture nello stesso giorno
   devono dire la stessa cosa, altrimenti sembra una slot machine). */
export const FRASI = [
  'Un passo alla volta.',
  'Stai costruendo una nuova abitudine.',
  'Non devi essere perfetto.',
  'Devi solo affrontare il prossimo momento.',
  'Guarda quanto sei arrivato lontano.',
  'Il corpo se ne sta già accorgendo.',
  'Quello che stai facendo è difficile. Lo stai facendo.',
];

/* Cosa dire quando qualcuno ricade: mai colpevolizzare, mai contare
   quello che ha perso, sempre rimettere davanti quello che resta. */
export const RILANCI = [
  'Quei giorni non sono andati persi. Sono già dentro di te.',
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

/* Perché vuoi smettere: le sei risposte dell'onboarding. L'icona serve
   a rendere la scelta leggibile in mezzo secondo, non a decorare. */
export const MOTIVI = [
  { id: 'salute', icona: '🫁', testo: 'Per la salute', frase: 'Voglio tornare a respirare bene.' },
  { id: 'soldi', icona: '💶', testo: 'Per i soldi', frase: 'Non voglio più bruciare quei soldi.' },
  { id: 'famiglia', icona: '🏠', testo: 'Per la famiglia', frase: 'Per le persone con cui vivo.' },
  { id: 'liberta', icona: '🕊️', testo: 'Per la libertà', frase: 'Non voglio più dipendere da niente.' },
  { id: 'sport', icona: '🏃', testo: 'Per lo sport', frase: 'Voglio riprendere fiato quando corro.' },
  { id: 'altro', icona: '✍️', testo: 'Un altro motivo', frase: '' },
];
