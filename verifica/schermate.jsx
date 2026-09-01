/* ------------------------------------------------------------------ */
/*  IL RENDER DELLE SCHERMATE                                          */
/*                                                                     */
/*  redesign.mjs guarda il markup come TESTO: tag bilanciati, import    */
/*  risolti, classi CSS esistenti. Va benissimo per quello che deve     */
/*  fare, ma non può accorgersi di un campo che manca dentro un         */
/*  oggetto passato come prop — perché quel campo, nel testo, non c'è   */
/*  proprio.                                                            */
/*                                                                     */
/*  Qui invece le schermate si RENDONO davvero, con react-dom/server e  */
/*  con gli oggetti costruiti come li costruisce App.jsx. Ogni caso è   */
/*  uno stato che l'app sa produrre: account appena creato, registro    */
/*  pieno, lotto appena aggiunto, anteprima di un gruppo.               */
/*                                                                     */
/*  Serve un passaggio di build perché Node non legge JSX:              */
/*                                                                     */
/*    npx esbuild verifica/schermate.jsx --bundle --platform=node \     */
/*      --format=cjs --jsx=automatic --loader:.css=empty \              */
/*      --outfile=verifica/.schermate.cjs && node verifica/.schermate.cjs */
/*                                                                     */
/*  È l'unica ragione per cui questo banco non sta ancora dentro        */
/*  `npm run verifica`, che gira su Node nudo.                          */
/* ------------------------------------------------------------------ */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToString } from 'react-dom/server';
import {
  OggiScreen, PercorsoScreen, AiutoScreen, GruppoScreen, ProfiloScreen,
  CravingOverlay, RicadutaOverlay, OnboardingScreen,
} from '../src/screens/index.js';
import { normalizzaRegistro, aggiungiEvento } from '../src/utils/fusione.js';
import {
  calcolaConti, intervalliCoperti, riferimentoAstinenza, giorniSenzaFumare,
  recordSenzaFumare, giorniPercorso as gp,
} from '../src/utils/conti.js';
import { sod, ymd, addGiorni, dec, eur } from '../src/utils/format.js';
import { PALETTE, TAPPE, DAY } from '../src/constants.js';

/* deve restare allineato a vuotoLog() in App.jsx */
const vuoto = () => ({
  v: 9, start: null, smessoDal: null, eventi: [], cigs: [], resists: [],
  checkins: [], ricadute: [], rimossi: [], tags: {}, groups: [], notify: true,
  avvisiCorpo: true, onboarded: true,
  profile: { motivo: 'Per la salute', baseline: null, prezzoPacchetto: null, perPacchetto: 20, sesso: 'non_detto' },
  plans: {}, tappeViste: { ref: null, idx: [] }, ripartenzeBase: 0, ripartenze: 0, orologi: {},
});

const now = Date.now();

/* ---------- stato A: account appena creato, niente registrato ---------- */
const nuovo = normalizzaRegistro(vuoto(), vuoto);
const intervalliNuovo = intervalliCoperti(nuovo);
const rifNuovo = riferimentoAstinenza(nuovo, now, intervalliNuovo);
const contiVuoti = calcolaConti(null);          // senza prezzo contiBase è null

/* ---------- stato B: tre settimane di registro, prezzo dichiarato ---------- */
let pieno = normalizzaRegistro({
  ...vuoto(),
  groups: ['ABC234'],
  profile: { motivo: 'Per la salute', baseline: 8, prezzoPacchetto: 6.5, perPacchetto: 20, sesso: 'uomo' },
  plans: { stress: 'esco a camminare' },
}, vuoto);
for (let g = 20; g >= 0; g -= 1) {
  for (let i = 0; i < 8; i += 1) pieno = aggiungiEvento(pieno, 'cig', addGiorni(now, -g) + (8 + i) * 3600000);
}
pieno = normalizzaRegistro(pieno, vuoto);

const intervalli = intervalliCoperti(pieno);
const rif = riferimentoAstinenza(pieno, now, intervalli);
const conti = calcolaConti({
  unit: 6.5 / 20, minPer: 17, baseline: 8, baselinePronta: true, baselineDichiarata: true,
  startTs: pieno.start, intervalli, oggiTs: sod(now),
  inizioSett: addGiorni(sod(now), -6), mediaOra: 8,
  curvaGiorni: [{ n: 8, da: addGiorni(sod(now), -1), a: sod(now), label: 'ieri' }],
  inizioCurva: addGiorni(sod(now), -13), totPrimaCurva: 0,
  totCigs: pieno.cigs.length, oggiFumate: 8, settFumate: 56,
});

const tappe = TAPPE.map((t, i) => ({
  ...t, raggiunta: i < 2, corrente: i === 2, manca: '3 ore', progresso: 0.4, quando: '24 ore',
}));

const registro = (() => {
  const m = new Map();
  pieno.eventi.filter((e) => e.tipo === 'cig').sort((a, b) => b.ts - a.ts).forEach((e) => {
    const k = sod(e.ts);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(e);
  });
  return [...m.entries()].slice(0, 14);
})();

const days = {};
pieno.cigs.forEach((t) => { const k = ymd(t); days[k] = (days[k] || 0) + 1; });
const membro = {
  id: 'altro', name: 'Ada', color: PALETTE[1], days, resists: {}, checkins: {},
  total: pieno.cigs.length, lastEvent: now - 3600000, lastResist: null,
  lastAttivita: now - 3600000, smessoDal: null, updatedAt: now,
  n: 8, calo: 12, attivo: true, dichiarati: 1, giorniPeriodo: 1, oggi: 8,
};

const sPieno = {
  giorno: 20, sett: 2, giorniTrascorsi: 7, oggi: 8, media: 8, media7: 8,
  mediaPrec: 9, obiettivo: 7.65, budget: 7,
  perGiorno: Array.from({ length: 7 }, (_, i) => ({ ts: addGiorni(sod(now), i - 6), futuro: false, n: 8, label: 'L' })),
  indiceOggi: 6, settTot: 56, taggateSett: 2,
  perFascia: [1, 2, 1, 2, 1, 1], fasciaTop: { label: 'sera' }, fasciaTopIndex: 4,
  intervalloMedio: 3600000, ultima: pieno.cigs[pieno.cigs.length - 1], resistSett: 1,
  topTrigger: ['stress', 4],
};

const oggiBase = {
  nome: 'Test', now, gruppi: [], tappaBanner: null, onChiudiBanner() {},
  checkedIn: false, lotto: null, onFuma() {}, onUmore() {}, prossimaTappa: null,
  inAstinenza: false, onCheckin() {}, onTante() {}, onAnnullaLotto() {},
  onVediRegistro() {}, onAnnulla() {}, onTag() {}, onSkipTag() {}, onVaiAlPercorso() {},
  ultimoId: null, ultimoTs: null,
};

const gruppoBase = {
  setAttivo() {}, me: { id: 'u', name: 'Tu', color: PALETTE[0] },
  onIndietro() {}, setStep() {}, nome: '', setNome() {}, setCodiceInput() {},
  joinError: '', onCrea() {}, onVerifica() {}, onConfermaJoin() {}, onEsci() {}, onCopia() {},
  ordine: 'meno', setOrdine() {}, periodo: 'giorno', setPeriodo() {},
};

const casi = {
  /* --- account appena creato: è il primo schermo che vede chi si iscrive --- */
  'Oggi — account nuovo': [OggiScreen, {
    ...oggiBase, s: null, conti: contiVuoti, giorniPercorso: gp(nuovo, now),
    rif: rifNuovo, copertoOra: false,
  }],
  'Percorso — account nuovo': [PercorsoScreen, {
    s: null, mese: null, registro: [], tags: {}, now, conti: contiVuoti, tappe,
    piano: null, record: { piuLungo: recordSenzaFumare(nuovo, now, intervalliNuovo, rifNuovo) },
    giorniPercorso: gp(nuovo, now), sezione: 'traguardi', setSezione() {},
    onElimina() {}, onTante() {}, mancante: 'prezzo', onVaiAlProfilo() {},
    rif: rifNuovo, giorniSenza: giorniSenzaFumare(rifNuovo, now), copertoOra: false, inAstinenza: false,
  }],
  'Aiuto — nessun gruppo': [AiutoScreen, {
    motivo: 'Per la salute', plans: {}, gruppi: [], nonLetti: 0,
    onCraving() {}, onRespira() {}, onApriGruppo() {}, onSalvaPiano() {},
    onModificaMotivo() {}, smessoDal: null, giorniSenza: null,
    onDichiaraSmesso() {}, onAnnullaSmesso() {},
  }],
  'Gruppo — menu vuoto': [GruppoScreen, {
    ...gruppoBase, gruppi: [], attivo: null, membri: [], ioAttivo: false,
    step: 'menu', codiceInput: '', joinPreview: null, classifica: [], feed: [], ultimoSync: null,
  }],
  'Profilo — account nuovo': [ProfiloScreen, {
    user: { id: 'u', name: 'Tu', nickname: '', email: '', phone: '+39333', avatarColor: PALETTE[0] },
    setUser() {}, nicknameDraft: '', setNicknameDraft() {},
    pwFields: { current: '', next: '', confirm: '' }, setPwFields() {},
    onSave() {}, onRecovery() {}, onChangePassword() {}, onDelete() {},
    onLogout() {}, onResetLog() {}, totale: 0, notifiche: true, onToggleNotifiche() {},
    avvisiCorpo: true, onToggleCorpo() {}, profile: nuovo.profile, onProfileChange() {},
    onExportJSON() {}, onExportCSV() {}, start: null, conti: contiVuoti,
    giorniPercorso: gp(nuovo, now), motivo: 'Per la salute', obiettivo: null,
    onModificaMotivo() {}, smessoDal: null, giorniSenza: null,
    onDichiaraSmesso() {}, onAnnullaSmesso() {},
  }],
  'Onboarding': [OnboardingScreen, {
    iniziale: nuovo.profile, onChiediPermesso: async () => true, onFine() {},
  }],

  /* --- stati pieni --- */
  'Oggi — banner tappa e finestra del motivo': [OggiScreen, {
    ...oggiBase, s: sPieno, conti, giorniPercorso: gp(pieno, now), rif, copertoOra: true,
    ultimoId: pieno.eventi[pieno.eventi.length - 1].id, ultimoTs: now - 60000,
    tappaBanner: TAPPE[1], prossimaTappa: { ...TAPPE[2], mancano: 3600000, progresso: 0.4 },
  }],
  /* L'OGGETTO È COPIATO ALLA LETTERA DA App.jsx:875 — se un giorno lì
     dentro cambia una chiave, è qui che si deve sentire. */
  'Oggi — lotto di arretrate appena aggiunto': [OggiScreen, {
    ...oggiBase, s: sPieno, conti, giorniPercorso: gp(pieno, now), rif, copertoOra: true,
    gruppi: [{ code: 'ABC234', name: 'Casa', members: [] }],
    lotto: {
      ids: ['a', 'b'],
      ts: [addGiorni(sod(now), 0) + 9 * 3600000, addGiorni(sod(now), 0) + 11 * 3600000],
      quante: 2,
      quando: 'stamattina',
      riavvio: null,
      prima: pieno,
    },
  }],
  'Percorso — registro pieno': [PercorsoScreen, {
    s: sPieno,
    mese: {
      totale: 168,
      perSettimana: [{ label: '−3s', n: 8, futuro: false }, { label: '7g', n: 8, futuro: false }],
      giorniZero: 0, risparmiate: -12, resists: 3,
    },
    registro, tags: { [pieno.eventi[0].id]: 'stress' }, now, conti, tappe,
    piano: {
      righe: [{ n: 3, media: 6.8, data: '1 set', perc: 85, corrente: true }],
      settimaneRestanti: 6, dataZero: '10 ottobre 2026',
    },
    record: { piuLungo: recordSenzaFumare(pieno, now, intervalli, rif) },
    giorniPercorso: gp(pieno, now), sezione: 'registro', setSezione() {},
    onElimina() {}, onTante() {}, mancante: null, onVaiAlProfilo() {},
    rif, giorniSenza: giorniSenzaFumare(rif, now), copertoOra: true, inAstinenza: false,
  }],
  'Gruppo — classifica e bacheca': [GruppoScreen, {
    ...gruppoBase,
    gruppi: [{ code: 'ABC234', name: 'Casa', ownerId: 'u', createdAt: now - 30 * DAY, members: [] }],
    attivo: 'ABC234', membri: [membro], ioAttivo: true, step: 'menu',
    codiceInput: '', joinPreview: null, classifica: [membro],
    feed: [{ id: 'altro', name: 'Ada', color: PALETTE[1], ts: now - 3600000, tipo: 'cig', oggi: 8 }],
    ultimoSync: now - 60000,
  }],
  'Gruppo — anteprima prima di entrare': [GruppoScreen, {
    ...gruppoBase, gruppi: [], attivo: null, membri: [], ioAttivo: false,
    step: 'entra', codiceInput: 'ABC234',
    joinPreview: { code: 'ABC234', name: 'Casa', memberCount: 3 },
    classifica: [], feed: [], ultimoSync: null,
  }],
  'Voglia — con il se–allora scritto': [CravingOverlay, {
    motivo: 'Per la salute', piano: 'esco a camminare', minuti: 17, costo: 0.325,
    gruppi: [{ code: 'ABC234', name: 'Casa', members: [] }],
    onRespira() {}, onApriGruppo() {}, onCeLHoFatta() {}, onHoFumato() {}, onChiudi() {},
  }],
  'Ricaduta — dopo 26 ore di pausa': [RicadutaOverlay, {
    pausa: 26 * 3600000, frase: 'Il conto riparte, il percorso no.',
    ripartenze: 2, giorniPercorso: gp(pieno, now), onCausa() {}, onChiudi() {},
  }],
};

let passati = 0;
const falliti = [];
const ok = (nome, cond, extra = '') => {
  if (cond) passati += 1;
  else falliti.push(`${nome}${extra ? `\n      ${extra}` : ''}`);
};

const reso = {};
for (const [nome, [Componente, props]] of Object.entries(casi)) {
  try {
    reso[nome] = renderToString(<Componente {...props} />);
    passati += 1;
  } catch (e) {
    falliti.push(`${nome}\n      ${e.constructor.name}: ${e.message}`);
  }
}

/* ---------- il patto fra App.jsx e la schermata ----------
   Il caso qui sopra costruisce `lotto` a mano, e un caso costruito a mano
   è una COPIA: se domani App.jsx smette di mettere un campo, il render
   continuerebbe a passare mentre l'app va in eccezione — che è
   esattamente com'è andata. Quindi il patto si controlla sui sorgenti:
   ogni campo che OggiScreen legge da `lotto` deve comparire fra le
   chiavi che App.jsx scrive dentro `setLotto({...})`, e nel caso di
   prova qui sopra. */
{
  const app = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8');
  const schermo = readFileSync(resolve(process.cwd(), 'src/screens/OggiScreen.jsx'), 'utf8');

  /* Le chiavi si estraggono contando le graffe, non contando gli spazi:
     con una regex sull'indentazione bastava riformattare `setLotto` su
     una riga sola perché il controllo fallisse senza che niente fosse
     rotto, e un controllo che grida al lupo è un controllo che fra sei
     mesi qualcuno spegne. Si prendono gli identificativi al primo
     livello, quelli seguiti da `:` o da `,` (forma abbreviata). */
  const chiaviDi = (sorgente, chiamata) => {
    /* La PRIMA occorrenza non va bene: `setLotto(null)` compare prima di
       `setLotto({...})` e manderebbe il conteggio delle graffe a spasso
       per mezzo file. Si cerca la chiamata che apre davvero un oggetto. */
    let apre = -1;
    for (let k = sorgente.indexOf(chiamata); k !== -1; k = sorgente.indexOf(chiamata, k + 1)) {
      const dopo = sorgente.slice(k + chiamata.length).match(/^\s*/)[0].length;
      if (sorgente[k + chiamata.length + dopo] === '{') { apre = k; break; }
    }
    if (apre === -1) return new Set();
    let i = sorgente.indexOf('{', apre);
    let profondita = 0;
    const chiavi = new Set();
    let parola = '';
    for (; i < sorgente.length; i += 1) {
      const c = sorgente[i];
      if (c === '{' || c === '[' || c === '(') { profondita += 1; parola = ''; continue; }
      if (c === '}' || c === ']' || c === ')') {
        profondita -= 1; parola = '';
        if (profondita === 0) break;
        continue;
      }
      if (profondita === 1 && /[\w$]/.test(c)) { parola += c; continue; }
      if (profondita === 1 && (c === ':' || c === ',') && parola) chiavi.add(parola);
      if (!/[\w$]/.test(c)) parola = '';
    }
    return chiavi;
  };

  /* IL LOTTO NON LO COMPONE PIÙ App.jsx. Lo costruisce `costruisciLotto`
     in `src/utils/arretrate.js`, perché la lista `ids` va verificata e non
     guardata: finché la costruzione stava dentro App.jsx, il banco di
     `annulla-lotto.mjs` se la ricopiava — difetto compreso — e quindi non
     poteva accorgersi che gli identificativi erano presi per posizione.

     Quindi il patto si controlla dove l'oggetto nasce davvero. E si
     controlla anche che App.jsx CHIAMI quel costruttore: se domani
     ricomincia a comporre il lotto a mano, le due forme possono divergere
     di nuovo senza che niente strilli. */
  /* I COMMENTI NON SONO CODICE. Senza questo passaggio il controllo qui
     sotto trovava lo `slice` citato dentro il commento che SPIEGA il
     difetto — cioè bocciava la correzione perché la correzione è
     documentata. Un controllo che punisce chi scrive i commenti è un
     controllo che li fa cancellare. */
  const senzaCommenti = (t) => t
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  const codiceApp = senzaCommenti(app);
  const arretrate = senzaCommenti(
    readFileSync(resolve(process.cwd(), 'src/utils/arretrate.js'), 'utf8'),
  );
  const daCostruttore = arretrate.slice(arretrate.indexOf('export function costruisciLotto'));
  const scritte = chiaviDi(daCostruttore, 'return ');
  const lette = new Set([...schermo.matchAll(/\blotto\.(\w+)/g)].map((m) => m[1]));
  const finte = Object.keys(casi['Oggi — lotto di arretrate appena aggiunto'][1].lotto);

  ok('patto · il costruttore del lotto esiste in arretrate.js',
    arretrate.includes('export function costruisciLotto'));
  ok('patto · App.jsx usa il costruttore invece di comporre il lotto a mano',
    /setLotto\(\s*costruisciLotto\(/.test(codiceApp),
    'App.jsx compone di nuovo il lotto per conto suo');
  ok('patto · e non prende più gli eventi per posizione',
    !/eventi\.slice\(\s*\w+(\?\.|\.)eventi/.test(codiceApp),
    'in App.jsx è tornato uno slice posizionale sugli eventi');
  ok('patto · né l\'ultimo evento della lista per la registrazione singola',
    !/eventi\[\s*\w+\.eventi\.length\s*-\s*1\s*\]/.test(codiceApp),
    'in App.jsx è tornato eventi[length - 1]');
  ok('patto · il costruttore mette davvero delle chiavi', scritte.size > 0);
  [...lette].forEach((campo) => {
    ok(`patto · OggiScreen legge lotto.${campo}, e App.jsx lo scrive`, scritte.has(campo),
      `App.jsx mette: ${[...scritte].join(', ')}`);
    ok(`patto · e il caso di prova lo contiene`, finte.includes(campo));
  });
}

/* ---------- il testo del lotto, non solo l'assenza di eccezioni ----------
   Un render che non lancia ma scrive «dalle alle» sarebbe un bug diverso e
   altrettanto brutto. Qui si guarda cosa è finito davvero a schermo. */
const html = reso['Oggi — lotto di arretrate appena aggiunto'];
if (html) {
  const lotto = casi['Oggi — lotto di arretrate appena aggiunto'][1].lotto;
  const orario = (ts) => new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const testo = html.replace(/<[^>]*>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ');
  ok('lotto · la card dice quante sigarette sono state aggiunte',
    /2 sigarette aggiunte/.test(testo), testo.slice(0, 200));
  ok('lotto · e in che parte della giornata', testo.includes('stamattina'), testo.slice(0, 200));
  ok('lotto · con l\'ora della prima', testo.includes(orario(lotto.ts[0])),
    `manca ${orario(lotto.ts[0])} in: ${testo.slice(0, 200)}`);
  ok('lotto · e l\'ora dell\'ultima', testo.includes(orario(lotto.ts[lotto.ts.length - 1])),
    `manca ${orario(lotto.ts[lotto.ts.length - 1])}`);
  ok('lotto · nessun buco al posto degli orari', !/dalle\s+alle/.test(testo), testo.slice(0, 200));
  ok('lotto · e si può ancora annullare', testo.includes('Annulla'));
}

/* ---------- le due cifre della Home devono raccontare la stessa cosa ----------
   La cifra delle sigarette era arrotondata all'intero e quella dei soldi no:
   19,94 sigarette diventavano «20», ma il costo accanto restava 6,78 €. Chi
   moltiplicava venti sigarette per il prezzo che conosce otteneva un numero
   che non tornava, e il primo sospetto cadeva sui soldi — cioè sulla cifra
   giusta. Qui si guarda cosa finisce DAVVERO a schermo, non come è scritto
   il sorgente. */
{
  const testoDi = (h) => (h || '').replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;|\u00a0/g, ' ').replace(/\s+/g, ' ');

  Object.entries(casi).forEach(([nome, [Componente, props]]) => {
    if (Componente !== OggiScreen) return;
    const conti = props.conti;
    if (!conti || conti.scartoMostrato === undefined) return;
    const testo = testoDi(reso[nome]);

    ok(`cifre · «${nome}» mostra lo scarto con una cifra decimale`,
      testo.includes(dec(conti.scartoMostrato)),
      `manca ${dec(conti.scartoMostrato)} in: ${testo.slice(0, 240)}`);

    /* e le due cifre devono essere coerenti fra loro: lo scarto mostrato
       per il prezzo unitario deve dare il costo mostrato, a meno
       dell'arrotondamento a un decimale delle sigarette */
    const soldi = conti.inRosso ? conti.spesoInPiu : conti.risparmiato;
    ok(`cifre · «${nome}» mostra anche i soldi`, testo.includes(eur(soldi)),
      `manca ${eur(soldi)} in: ${testo.slice(0, 240)}`);
    const atteso = conti.scartoMostrato * conti.unitario;
    ok(`cifre · «${nome}» le due cifre tornano fra loro`,
      Math.abs(atteso - Math.abs(soldi)) <= conti.unitario * 0.05 + 0.005,
      `${conti.scartoMostrato} x ${conti.unitario} = ${atteso.toFixed(2)}, a schermo ${eur(soldi)}`);

    /* l'intero non deve più comparire da solo al posto dello scarto */
    if (conti.scartoIntero !== conti.scartoMostrato) {
      ok(`cifre · «${nome}» non mostra la versione intera`,
        !new RegExp(`(^|[^0-9,])${conti.scartoIntero}([^0-9,]|$)`).test(testo)
          || testo.includes(dec(conti.scartoMostrato)),
        `l'intero ${conti.scartoIntero} compare al posto di ${dec(conti.scartoMostrato)}`);
    }

    /* l'etichetta del costo fa coppia con quella delle sigarette */
    if (conti.inRosso && !conti.inPari) {
      ok(`cifre · «${nome}» l'etichetta del costo è «costo oltre il tuo ritmo»`,
        testo.includes('costo oltre il tuo ritmo'), testo.slice(0, 240));
      ok(`cifre · «${nome}» e non dice più «spesi in più»`,
        !/[^é] spesi in più/.test(testo), testo.slice(0, 240));
      ok(`cifre · «${nome}» accanto a «sigarette sopra il tuo ritmo»`,
        testo.includes('sigarette sopra il tuo ritmo'), testo.slice(0, 240));
    }
  });
}

console.log('');
if (falliti.length) {
  falliti.forEach((f) => console.log(`  ✗ ${f}`));
  console.log(`\n  ${passati} stati renderizzati, ${falliti.length} rotti\n`);
  process.exit(1);
}
console.log(`  ${passati} stati renderizzati\n  nessun fallimento\n`);
