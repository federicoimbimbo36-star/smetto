/* ------------------------------------------------------------------ */
/*  CONTROLLI DEL REDESIGN                                             */
/*                                                                     */
/*  Gira senza installare niente: `node verifica/redesign.mjs`.        */
/*                                                                     */
/*  Non verifica la logica (quella è in controlli.mjs, 36 controlli):  */
/*  verifica le cose che si rompono quando si riscrive un'interfaccia  */
/*  da capo, e che una build non sempre segnala perché sono errori     */
/*  silenziosi a schermo:                                              */
/*                                                                     */
/*   1. tag JSX e parentesi bilanciate in ogni file                    */
/*   2. ogni componente usato nel markup è importato o definito lì     */
/*   3. ogni simbolo importato è davvero esportato dal file di origine */
/*   4. ogni classe CSS scritta nel markup esiste in styles.css        */
/*      (è QUESTO il bug tipico di un restyle: la classe muore nel CSS */
/*      e il markup continua a chiamarla, senza che niente si lamenti) */
/*   5. nessuna classe del vecchio sistema è rimasta in giro           */
/*   6. contrasto WCAG AA di tutte le coppie testo/fondo dei token     */
/*   7. i bersagli tattili dichiarati arrivano a 44px                  */
/* ------------------------------------------------------------------ */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(RADICE, 'src');

let passati = 0;
const falliti = [];
const ok = (nome, cond, extra = '') => {
  if (cond) passati += 1;
  else falliti.push(`${nome}${extra ? `\n      ${extra}` : ''}`);
};

/* ---------- raccolta dei file ---------- */
function tuttiIFile(dir, acc = []) {
  for (const voce of readdirSync(dir)) {
    const p = join(dir, voce);
    if (statSync(p).isDirectory()) tuttiIFile(p, acc);
    else if (/\.(jsx|js)$/.test(p) && !p.endsWith('.bak')) acc.push(p);
  }
  return acc;
}
const file = tuttiIFile(SRC);
const jsx = file.filter((f) => f.endsWith('.jsx'));
const css = readFileSync(join(SRC, 'styles.css'), 'utf8');

/* ---------- 1. tokenizzatore ----------
   Due trappole vere, entrambe scoperte facendo fallire questo file su se
   stesso:

   a) l'apostrofo italiano. «Cos'era?» e «l'app» stanno nel TESTO del JSX,
      non in una stringa JavaScript: un tokenizzatore ingenuo apre lì una
      stringa e si mangia mezzo file. Regola: una stringa con apice o
      virgoletta deve chiudersi sulla STESSA riga, altrimenti quel segno è
      testo. (I template letterali con backtick possono andare a capo.)

   b) il minore. `i < 2 && foglie > 4` dentro un className non è un tag.
      I tag si riconoscono solo se dopo `<` c'è subito una lettera, e la
      loro fine si trova camminando in avanti contando le graffe, non con
      una regex.                                                          */

function ripulisci(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let precedente = '';                      // ultimo carattere significativo
  const finoAFineRiga = (da) => {
    const fine = src.indexOf('\n', da);
    return fine === -1 ? n : fine;
  };

  while (i < n) {
    const c = src[i];
    const due = src.slice(i, i + 2);

    if (due === '//') { while (i < n && src[i] !== '\n') { out += ' '; i += 1; } continue; }
    if (due === '/*') {
      while (i < n && src.slice(i, i + 2) !== '*/') { out += src[i] === '\n' ? '\n' : ' '; i += 1; }
      out += '  '; i += 2; continue;
    }

    // letterale di espressione regolare: solo dove una divisione non
    // avrebbe senso, altrimenti `a / b` verrebbe letto come regex
    // attenzione: `}` NON va in questa lista. In JSX `} />` è la fine di un
    // tag autochiuso, e leggerlo come inizio di regex cancellava sia il
    // `/>` sia il `</tag>` della riga — con tutti i tag che sballavano.
    if (c === '/' && src[i + 1] !== '>' && /[(,=:[!&|?;+\-*%]|^$/.test(precedente)) {
      let j = i + 1;
      let dentroClasse = false;
      let chiusa = false;
      while (j < n && src[j] !== '\n') {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') dentroClasse = true;
        else if (src[j] === ']') dentroClasse = false;
        else if (src[j] === '/' && !dentroClasse) { chiusa = true; break; }
        j += 1;
      }
      if (chiusa) {
        while (i <= j) { out += ' '; i += 1; }
        while (i < n && /[gimsuy]/.test(src[i])) { out += ' '; i += 1; }
        precedente = 'r';
        continue;
      }
    }

    if (c === '"' || c === "'") {
      // si chiude sulla stessa riga? altrimenti è testo JSX
      const limite = finoAFineRiga(i);
      let j = i + 1;
      let chiusa = false;
      while (j < limite) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === c) { chiusa = true; break; }
        j += 1;
      }
      if (!chiusa) { out += ' '; i += 1; continue; }   // apostrofo di parola
      while (i <= j) { out += ' '; i += 1; }
      precedente = 's';
      continue;
    }

    if (c === '`') {
      out += ' '; i += 1;
      while (i < n && src[i] !== '`') {
        if (src[i] === '\\') { out += '  '; i += 2; continue; }
        if (src.slice(i, i + 2) === '${') {          // qui dentro è codice vero
          out += '  '; i += 2;
          let liv = 1;
          while (i < n && liv > 0) {
            if (src[i] === '{') liv += 1;
            if (src[i] === '}') liv -= 1;
            out += liv === 0 ? ' ' : src[i];
            i += 1;
          }
          continue;
        }
        out += src[i] === '\n' ? '\n' : ' '; i += 1;
      }
      out += ' '; i += 1;
      precedente = 's';
      continue;
    }

    out += c;
    if (!/\s/.test(c)) precedente = c;
    i += 1;
  }
  return out;
}

/* Trova i tag camminando: da `<` in poi si conta l'annidamento delle
   graffe, così un `>` dentro `className={a > b ? …}` non chiude il tag. */
function tagDi(src) {
  const trovati = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    if (src[i] !== '<') { i += 1; continue; }
    const dopo = src.slice(i + 1, i + 3);
    const frammento = src[i + 1] === '>';
    const frammentoChiuso = dopo === '/>';
    const apre = /^[A-Za-z]/.test(src[i + 1] || '');
    const chiude = src[i + 1] === '/' && /^[A-Za-z]/.test(src[i + 2] || '');
    if (frammento) { trovati.push({ tag: '', chiude: false, auto: false }); i += 2; continue; }
    if (frammentoChiuso) { trovati.push({ tag: '', chiude: true, auto: false }); i += 3; continue; }
    if (!apre && !chiude) { i += 1; continue; }

    let j = i + (chiude ? 2 : 1);
    let nome = '';
    while (j < n && /[A-Za-z0-9.]/.test(src[j])) { nome += src[j]; j += 1; }

    let liv = 0;
    let auto = false;
    while (j < n) {
      const c = src[j];
      if (c === '{') liv += 1;
      else if (c === '}') liv -= 1;
      else if (c === '>' && liv === 0) { auto = src[j - 1] === '/'; break; }
      j += 1;
    }
    trovati.push({ tag: nome, chiude, auto });
    i = j + 1;
  }
  return trovati;
}

/* elementi HTML che si possono lasciare aperti: qui non ne usiamo, ma
   segnalarli come "mai chiusi" sarebbe un falso allarme */
const VUOTI = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source']);

for (const f of jsx) {
  const pulito = ripulisci(readFileSync(f, 'utf8'));
  const nome = basename(f);

  for (const [ap, ch, eti] of [['(', ')', 'tonde'], ['{', '}', 'graffe'], ['[', ']', 'quadre']]) {
    const a = (pulito.match(new RegExp(`\\${ap}`, 'g')) || []).length;
    const b = (pulito.match(new RegExp(`\\${ch}`, 'g')) || []).length;
    ok(`${nome} · parentesi ${eti} bilanciate`, a === b, `aperte ${a}, chiuse ${b}`);
  }

  const pila = [];
  let squilibrio = null;
  for (const { tag, chiude, auto } of tagDi(pulito)) {
    if (auto || VUOTI.has(tag)) continue;
    if (chiude) {
      const atteso = pila.pop();
      if (atteso !== tag && !squilibrio) {
        squilibrio = `</${tag || ''}> chiude <${atteso === undefined ? 'niente' : atteso}>`;
      }
    } else {
      pila.push(tag);
    }
  }
  ok(`${nome} · tag JSX bilanciati`, pila.length === 0 && !squilibrio,
    squilibrio || (pila.length ? `restano aperti: ${pila.map((t) => t || '<>').join(', ')}` : ''));
}

/* ---------- 2 e 3. import e componenti ---------- */
const esportati = new Map();
for (const f of file) {
  const src = readFileSync(f, 'utf8');
  const nomi = new Set();
  if (/export default/.test(src)) nomi.add('default');
  for (const mm of src.matchAll(/export\s+(?:async\s+)?(?:const|let|function\*?|class)\s+([A-Za-z_$][\w$]*)/g)) nomi.add(mm[1]);
  for (const mm of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const pezzo of mm[1].split(',')) {
      const as = pezzo.split(/\s+as\s+/);
      nomi.add((as[1] ?? as[0]).trim());
    }
  }
  esportati.set(resolve(f).replace(/\.jsx?$/, ''), nomi);
}

const risolvi = (dalFile, spec) => {
  if (!spec.startsWith('.')) return null;
  return resolve(dirname(dalFile), spec).replace(/\.jsx?$/, '');
};

for (const f of jsx) {
  const src = readFileSync(f, 'utf8');
  const nome = basename(f);
  const disponibili = new Set();

  /* `[^;]*?` e non `[\s\S]*?`: la clausola può andare a capo (gli import
     multiriga di App.jsx) ma non può scavalcare un punto e virgola —
     altrimenti `import './installStorage';` più la riga dopo venivano
     letti come un unico import, e `App` non risultava importato. */
  for (const mm of src.matchAll(/^\s*import\s+([^;]*?)\s+from\s+['"]([^'"]+)['"]/gm)) {
    const [, clausola, spec] = mm;
    const simboli = [];
    const graffe = clausola.match(/\{([\s\S]*)\}/);
    if (graffe) {
      for (const pezzo of graffe[1].split(',')) {
        const t = pezzo.trim();
        if (t) simboli.push(t.split(/\s+as\s+/).pop().trim());
      }
    }
    const def = clausola.replace(/\{[\s\S]*\}/, '').replace(/,/g, '').trim();
    if (def) simboli.push(def);
    simboli.forEach((x) => disponibili.add(x));

    const base = risolvi(f, spec);
    if (!base) continue;
    const cartella = esportati.has(base) ? base : join(base, 'index');
    const set = esportati.get(cartella);
    ok(`${nome} · il modulo ${spec} esiste`, !!set);
    if (!set) continue;
    if (graffe) {
      for (const pezzo of graffe[1].split(',')) {
        const t = pezzo.trim();
        if (!t) continue;
        const orig = t.split(/\s+as\s+/)[0].trim();
        ok(`${nome} · ${spec} esporta ${orig}`, set.has(orig),
          `esporta: ${[...set].join(', ')}`);
      }
    }
    if (def) ok(`${nome} · ${spec} ha un export default`, set.has('default'));
  }

  for (const mm of src.matchAll(/function\s+([A-Z][\w]*)/g)) disponibili.add(mm[1]);
  for (const mm of src.matchAll(/const\s+([A-Z][\w]*)\s*=/g)) disponibili.add(mm[1]);
  // componenti che arrivano da una destrutturazione: const { id, Icona } = voce
  for (const mm of src.matchAll(/[{,]\s*([A-Z][\w]*)\s*[,}:]/g)) disponibili.add(mm[1]);

  // ogni componente maiuscolo usato nel markup dev'essere raggiungibile
  const usati = new Set();
  for (const mm of ripulisci(src).matchAll(/<([A-Z][A-Za-z0-9]*)/g)) usati.add(mm[1]);
  for (const u of usati) {
    ok(`${nome} · <${u}> è importato o definito`, disponibili.has(u));
  }
}

/* ---------- 4. import mai usati ----------
   Dopo una riscrittura restano sempre import orfani. Non rompono niente,
   ma allargano il bundle e soprattutto mentono su cosa fa un file. */
for (const f of jsx) {
  const src = readFileSync(f, 'utf8');
  const nome = basename(f);
  /* Si tolgono gli import PRIMA di ripulire, e fermandosi al punto e
     virgola. Una versione che cercava `from` si mangiava 33.000 caratteri
     di App.jsx: dopo `import './styles.css';` (che un `from` non ce l'ha)
     il primo `from` del file era quello di `Array.from`. */
  const corpo = ripulisci(src.replace(/^\s*import\s[^;]*;/gm, ''));
  for (const mm of src.matchAll(/^\s*import\s+([^;]*?)\s+from\s+['"][^'"]+['"]/gm)) {
    const graffe = mm[1].match(/\{([\s\S]*)\}/);
    const simboli = graffe ? graffe[1].split(',').map((x) => x.trim().split(/\s+as\s+/).pop().trim()) : [];
    const def = mm[1].replace(/\{[\s\S]*\}/, '').replace(/,/g, '').trim();
    if (def) simboli.push(def);
    for (const sim of simboli.filter(Boolean)) {
      ok(`${nome} · ${sim} è importato e usato`,
        new RegExp(`[^\\w$.]${sim}[^\\w$]`).test(` ${corpo} `));
    }
  }
}

/* ---------- 5 e 6. classi CSS ---------- */
const classiCss = new Set();
for (const mm of css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) classiCss.add(mm[1]);

/* Il valore di className si legge camminando: può essere "una stringa",
   {`un template ${con espressioni}`} oppure {a ? 'x' : 'y'}. Prenderlo a
   regex faceva finire fra le "classi" pezzi di codice come `foglie` o
   `null`, cioè falsi allarmi che nascondono quelli veri. */
function valoreClassName(src, da) {
  let i = da;
  while (i < src.length && /\s/.test(src[i])) i += 1;
  if (src[i] === '"' || src[i] === "'") {
    const fine = src.indexOf(src[i], i + 1);
    return fine === -1 ? '' : src.slice(i + 1, fine);
  }
  if (src[i] !== '{') return '';
  let liv = 0;
  const inizio = i;
  while (i < src.length) {
    if (src[i] === '{') liv += 1;
    else if (src[i] === '}') { liv -= 1; if (liv === 0) return src.slice(inizio + 1, i); }
    i += 1;
  }
  return '';
}

function classiDa(grezzo) {
  /* Dentro un template, `ordine === 'meno' ? 'pastiglia-on' : ''` contiene
     DUE stringhe ma una sola è una classe: l'altra è il termine di un
     confronto. Si tolgono gli operandi di confronto, altrimenti il
     controllo si riempie di falsi allarmi (.meno, .calo, .non_detto) e i
     falsi allarmi nascondono quelli veri. */
  const valore = grezzo
    .replace(/(===|!==|==|!=|<=|>=|\|\||\?\?)\s*(['"])[^'"]*\2/g, ' ')
    .replace(/(['"])[^'"]*\1\s*(===|!==|==|!=|<=|>=)/g, ' ');

  const fuori = [];
  // le stringhe quotate rimaste sono rami di ternario, cioè classi
  for (const m of valore.matchAll(/'([^']*)'|"([^"]*)"/g)) fuori.push(m[1] ?? m[2] ?? '');
  // le parti letterali dei template, tolte le espressioni
  for (const m of valore.matchAll(/`([^`]*)`/g)) fuori.push(m[1].replace(/\$\{[^}]*\}/g, ' '));
  if (!/['"`]/.test(valore)) fuori.push(valore);
  return fuori.flatMap((t) => t.split(/\s+/)).filter((c) => /^[a-zA-Z][\w-]*$/.test(c));
}

const usateNelMarkup = new Map();
for (const f of jsx) {
  const src = readFileSync(f, 'utf8');
  let i = src.indexOf('className');
  while (i !== -1) {
    const eq = src.indexOf('=', i);
    for (const cl of classiDa(valoreClassName(src, eq + 1))) {
      if (!usateNelMarkup.has(cl)) usateNelMarkup.set(cl, basename(f));
    }
    i = src.indexOf('className', i + 1);
  }
}

for (const [cl, dove] of usateNelMarkup) {
  ok(`classe .${cl} definita in styles.css`, classiCss.has(cl), `usata in ${dove}`);
}

const VECCHIE = [
  'screen-title', 'screen-sub', 'brace', 'butt', 'butt-row', 'big-plus', 'conti-val',
  'hero-conto', 'leaderboard', 'stat-cell', 'text-input', 'btn-primary', 'btn-ghost',
  'btn-danger', 'chip-mint', 'segmented', 'segmented-item', 'field-group', 'field-label',
  'trigger-chip', 'eyebrow-row', 'toggle-row', 'modal-overlay', 'avatar-circle', 'log-row',
];
for (const v of VECCHIE) {
  ok(`la classe .${v} del vecchio tema è sparita dal markup`, !usateNelMarkup.has(v),
    usateNelMarkup.get(v) ? `ancora in ${usateNelMarkup.get(v)}` : '');
  ok(`la classe .${v} del vecchio tema è sparita dal CSS`, !classiCss.has(v));
}

/* ---------- 7. costanti usate prima di essere dichiarate ----------
   `const` non viene sollevato: una costante di modulo usata da un'altra
   costante scritta più in alto esplode all'import, non in fase di build,
   e in un'app a schermo intero si vede solo come pagina bianca. Questo
   controllo è nato da un errore vero commesso durante il redesign. */
for (const f of file) {
  const src = readFileSync(f, 'utf8');
  const nome = basename(f);
  const righe = src.split('\n');
  const dichiarate = new Map();
  righe.forEach((riga, i) => {
    const m = riga.match(/^const\s+([A-Za-z_$][\w$]*)\s*=/);
    if (m) dichiarate.set(m[1], i);
  });
  for (const [simbolo, riga] of dichiarate) {
    // solo il codice a livello di modulo: dentro le funzioni l'ordine non conta
    const prima = righe.slice(0, riga).filter((r) => /^[A-Za-z_$const]/.test(r)).join('\n');
    const usato = new RegExp(`[^\\w$.]${simbolo}[^\\w$]`).test(` ${prima} `);
    ok(`${nome} · ${simbolo} non è usato prima di essere dichiarato`, !usato);
  }
}

/* ---------- 8. contrasto ---------- */
const token = {};
for (const mm of css.matchAll(/^\s*(--[\w-]+):\s*(#[0-9A-Fa-f]{6});/gm)) token[mm[1]] = mm[2];

const lin = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const contrasto = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const FONDI = ['--sfondo', '--bianco', '--verde-velo', '--azzurro-velo', '--pesca-velo', '--neutro-velo'];
// testo a dimensione di corpo: soglia AA 4.5
for (const f of FONDI) {
  for (const t of ['--t1', '--t2', '--verde']) {
    const r = contrasto(token[t], token[f]);
    ok(`contrasto AA · ${t} su ${f}`, r >= 4.5, `${r.toFixed(2)}:1`);
  }
}
// cifre grandi e spente: soglia AA per testo grande, 3
for (const f of FONDI) {
  const r = contrasto(token['--neutro'], token[f]);
  ok(`contrasto AA grande · --neutro su ${f}`, r >= 3, `${r.toFixed(2)}:1`);
}
ok('contrasto AA · bianco sul bottone primario', contrasto('#FFFFFF', token['--verde']) >= 4.5,
  `${contrasto('#FFFFFF', token['--verde']).toFixed(2)}:1`);
ok('contrasto AA · toast (sfondo su --t1)', contrasto(token['--sfondo'], token['--t1']) >= 4.5);
ok('contrasto AA · --pesca-scuro sul suo velo',
  contrasto(token['--pesca-scuro'], token['--pesca-velo']) >= 4.5);

const costanti = readFileSync(join(SRC, 'constants.js'), 'utf8');
const palette = costanti.match(/export const PALETTE = \[([^\]]*)\]/)[1]
  .split(',').map((x) => x.trim().replace(/['"]/g, '')).filter(Boolean);
for (const c of palette) {
  ok(`contrasto AA · iniziali bianche sull'avatar ${c}`, contrasto('#FFFFFF', c) >= 4.5,
    `${contrasto('#FFFFFF', c).toFixed(2)}:1`);
}

/* ---------- 9. bersagli tattili e accessibilità ---------- */
const regolaDi = (sel) => {
  const m = css.match(new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : '';
};
for (const sel of ['.btn', '.campo-input', '.pastiglia', '.nav-item', '.btn-icona', '.segmento', '.btn-testo']) {
  const r = regolaDi(sel);
  const m = r.match(/(?:min-)?height:\s*(\d+)px/);
  const w = r.match(/width:\s*(\d+)px/);
  const alto = m ? Number(m[1]) : 0;
  ok(`bersaglio tattile · ${sel} arriva a 44px`, alto >= 44,
    `altezza dichiarata ${alto || '—'}px`);
  if (sel === '.btn-icona') ok('bersaglio tattile · .btn-icona è largo 44px', Number(w?.[1]) >= 44);
}

ok('il movimento si può disattivare (prefers-reduced-motion)',
  /@media \(prefers-reduced-motion: reduce\)/.test(css));
ok('il focus da tastiera è visibile', /:focus-visible/.test(css) && /outline:/.test(css));
ok('le safe area di iPhone sono rispettate', (css.match(/env\(safe-area-inset/g) || []).length >= 5);
ok('il font del brief (Manrope) è caricato', /family=Manrope/.test(css));
ok('nessun rosso nel sistema: nessun token con R molto maggiore di G e B',
  !Object.entries(token).some(([, v]) => {
    const n = parseInt(v.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return r > 150 && r - g > 80 && r - b > 80;
  }));

/* ---------- 10. l'anteprima non deve divergere dal componente ----------
   strumenti/anteprima.py riscrive in Python la geometria di Pianta.jsx per
   poterla disegnare senza Vite. Due copie della stessa cosa divergono
   sempre: qui si confrontano le tabelle degli stadi, e se non coincidono
   il controllo fallisce invece di lasciare un'anteprima che mente. */
const pianta = readFileSync(join(SRC, 'components/Pianta.jsx'), 'utf8');
const stadiJs = [...pianta.matchAll(/\{\s*da:\s*(\d+),\s*h:\s*(\d+),\s*foglie:\s*(\d+)/g)]
  .map((m) => `${m[1]}-${m[2]}-${m[3]}`);

let stadiPy = null;
try {
  const py = readFileSync(join(RADICE, 'strumenti/anteprima.py'), 'utf8');
  const blocco = py.match(/STADI = \[([\s\S]*?)\]/);
  stadiPy = [...blocco[1].matchAll(/\((\d+),\s*(\d+),\s*(\d+),/g)].map((m) => `${m[1]}-${m[2]}-${m[3]}`);
} catch { stadiPy = null; }

ok('anteprima.py conosce gli stessi stadi della pianta',
  stadiPy !== null && stadiPy.join(' ') === stadiJs.join(' '),
  stadiPy ? `jsx: ${stadiJs.join(' ')}\n      py:  ${stadiPy.join(' ')}` : 'anteprima.py non trovato');

/* ---------- esito ---------- */
console.log('');
if (falliti.length === 0) {
  console.log(`  ${passati} controlli superati`);
  console.log('  nessun fallimento\n');
} else {
  console.log(`  ${passati} controlli superati, ${falliti.length} FALLITI:\n`);
  falliti.forEach((f) => console.log(`   ✗ ${f}`));
  console.log('');
  process.exit(1);
}
