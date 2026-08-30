# Audit matematico — cosa era sbagliato e cosa è stato corretto

Rilettura di tutti i calcoli dell'app: soldi, sigarette, medie, date, tempi,
classifica. Non solo letti — **eseguiti**: i `useMemo` di `App.jsx` sono stati
replicati fuori da React per confrontare il valore prodotto dal codice con il
valore teoricamente corretto, su scenari costruiti apposta. Tutti i numeri
"prima" riportati qui sotto vengono da esecuzioni reali.

Esito dell'analisi: **64 algoritmi controllati, 35 corretti, 5 problemi critici,
9 importanti, 17 minori.** Questo documento è il registro delle correzioni.

Verifica: `npm run verifica` — 311 controlli sui calcoli e 56 sulla persistenza
(scritti per fallire con il codice di prima) più 1.001 su markup, CSS e
accessibilità. L'audit della persistenza sta in `PERSISTENZA.md`.

Il livello basso era già solido e non è stato toccato nella sostanza: date,
cambio d'ora nelle chiavi della classifica, anno bisestile, `ymd`/`daYmd` su
400 giorni consecutivi, virgola mobile sui soldi, 36.000 sigarette elaborate in
136 ms. I problemi stavano tutti nel **modello** con cui era definito il
risparmio, e in due punti dove lo stesso dato veniva calcolato in due modi
diversi in due schermate diverse.

---

## I cinque problemi critici

### 1. Il metro si muoveva insieme alla cosa misurata

`src/utils/conti.js` — nuova funzione `calcolaBaseline`

Chi salta la domanda «quanto fumi oggi?» nell'onboarding non ha un ritmo di
partenza dichiarato, e l'app se lo ricavava dai dati con
`sigarette dei primi min(7, giorni) giorni / min(7, giorni)`, ricalcolato a ogni
apertura. Due difetti che si sommavano: la finestra comprendeva il giorno in
corso, ancora a metà, come se fosse pieno; e si allargava ogni giorno.

Una persona che fumava **esattamente dieci sigarette al giorno, senza mai
cambiare niente**, leggeva:

| giorno | baseline calcolata | risparmiato mostrato |
|---:|---:|---:|
| 0 | 3,00 | −0,45 € |
| 3 | 8,25 | −1,24 € |
| 6 | 9,00 | −1,35 € |
| 7 | 10,00 | +0,60 € |

Per una settimana l'app scriveva «sei 4,5 sigarette **sopra** il ritmo da cui sei
partito» a chi non aveva cambiato una virgola. E chi calava davvero da 20 a 5 al
giorno vedeva il risparmio cumulato **scendere** per sei giorni di fila
(−2,15 € → −2,21 € → −2,16 € → −1,99 €), cosa aritmeticamente impossibile.

**Adesso:** o il ritmo lo dichiara la persona — ed è pronto subito — o si misura
sui primi **sette giorni pieni**, saltando il giorno d'inizio che è per forza
parziale, e da lì non cambia più perché la finestra è fissa. Finché non è
affidabile, `calcolaConti` restituisce `null` e il Percorso dice «Manca il ritmo
da cui parti» con un bottone verso il Profilo, dove è stato aggiunto il campo che
prima non esisteva da nessuna parte. Un numero inventato è peggio di un numero
assente.

Verificato: baseline 10,00 a 8, 10, 14 e 21 giorni (un solo valore, mai
ricalcolato), e il risparmio cumulato che sale sempre.

### 2. Due numeri diversi per la stessa cosa, sulla stessa schermata

`src/utils/conti.js` (`atteseFra`) e `src/App.jsx` (`mese`)

`conti.evitate` contava i giorni frazionari, `mese.risparmiate` li contava
interi. Con meno di trenta giorni di storico coprono lo stesso identico periodo,
quindi devono dare lo stesso identico numero. In Percorso → Numeri si leggeva,
a due centimetri di distanza:

> «sono **107** sigarette che non hai fumato rispetto al ritmo da cui sei partito»
> «in questo mese hai fumato **117 sigarette in meno**»

Lo scarto era `baseline × (1 − frazione del giorno trascorsa)`: dieci sigarette
a mezzogiorno, venti a mezzanotte.

**Adesso** esiste una sola funzione, `atteseFra`, e la usano tutti e due. Un
controllo dedicato impone che i due numeri coincidano entro 1e-9.

### 3. Il primo giorno regalava ore che l'app non aveva misurato

`src/utils/conti.js` — il riferimento è `dati.start`, non `sod(dati.start)`

Il conto partiva dalla **mezzanotte** del giorno della prima sigaretta. Tutte
quelle fumate prima dell'installazione non esistevano nel registro, ma il ritmo
di partenza le accreditava comunque come «evitate».

App installata alle 22:00, baseline 20, una sola sigaretta registrata: la Home
scriveva **17 sigarette non fumate · 5,20 €**. Il primo numero che vede un nuovo
utente, ed era falso — la persona sa benissimo di aver fumato tutto il giorno.

**Adesso** il conto parte dall'istante vero. Stesso scenario: meno di 1,1
sigarette, meno di 35 centesimi.

Un effetto voluto di questa correzione: nella prima ora il numero può stare
appena sotto lo zero, perché una sigaretta registrata a tempo trascorso zero
vale letteralmente «una sigaretta sopra il ritmo». Si riassorbe da solo in
un'ora scarsa, resta dentro il trattamento «spento» invece che allarmato, ed è
comunque preferibile all'alternativa: dichiarare 5,20 € di risparmio a chi ha
appena finito di fumare tutto il giorno.

### 4. Il giorno in corso contava come giorno intero in tutte le medie

`src/App.jsx` (`media7`, `mese.perSettimana`, `classifica`), `src/utils/conti.js`

`media7` divideva per sette giorni ma il settimo era ancora a metà: usciva
sempre più bassa del vero e **risaliva durante la giornata**. Stessi dati, stesso
giorno, ore diverse:

| ora | media7 | «di questo passo, in un anno» |
|---:|---:|---:|
| 01:00 | 8,57 | **1.251 €** |
| 12:00 | 9,00 | 1.204 € |
| 21:00 | 10,00 | **1.095 €** |

Il valore corretto è 1.095 €: all'una di notte la Home dichiarava il 14% in più.
La stessa causa sballava la media mostrata come statistica (8,0 invece di 9,0),
l'ultima barra del grafico settimanale — sempre più bassa delle altre per
costruzione — e il «calo» della classifica, che è un criterio di ordinamento:
un membro che non aveva cambiato niente risultava **−14%** a mezzanotte e 0%
alle 23:00.

**Adesso** tutte le medie di periodo guardano solo giorni pieni. Quando non c'è
ancora nemmeno un giorno pieno le proiezioni annuali valgono `null` e a schermo
compare un trattino, invece di uno zero presentato come previsione. Il controllo
legge la media alle 01, 06, 12, 18 e 23 e pretende cinque volte lo stesso valore.

### 5. Il contatore delle ripartenze contava le notti di sonno

`src/constants.js` — `SOGLIA_RICADUTA`

La soglia era otto ore, cioè il sonno di chiunque. Simulazione di trenta giorni
di fumo regolare fra le 7:30 e le 22:30, nessuna sigaretta di notte, **nessuna
ricaduta vera**: la schermata «Ripartiamo da qui» compariva 29 volte e il
contatore arrivava a «È la **29ª volta** che riparti».

**Adesso** la soglia è venti ore, che dormendo non si raggiungono: per superarle
bisogna aver passato senza fumare quasi tutta una giornata di veglia, che è
esattamente la cosa che quella schermata vuole riconoscere. Stessa simulazione:
**zero ripartenze**.

---

## I nove importanti

**Timestamp doppi nelle arretrate, e un tocco che cancellava due sigarette.**
`distribuisci` si arrendeva e inseriva comunque il doppione quando la finestra
era stretta — e le finestre strette sono raggiungibili: alle 07:03 «Stamattina»
dura tre minuti. Venti sigarette dentro tre minuti producevano **quattro istanti
distinti su venti**. Il guaio vero era a valle: `handleElimina` filtrava per
valore, quindi togliere una riga ne cancellava due, e da lì in poi ogni
conteggio era sbagliato senza modo di accorgersene. Ora la grana scende ai
secondi quando serve, `primoLibero` non si arrende, e la rimozione usa
`indexOf` + `slice` per togliere **una** sigaretta sola.

**La catena dichiarata nella card non tornava con la calcolatrice.** «367,0
sigarette × 0,33 € l'una» contro un totale di 119,28 €: chi moltiplicava
trovava 121,11 €, cioè 1,83 € di scarto. Il prezzo unitario vero di un
pacchetto da 6,50 € è 0,325 €, non 0,33 €. Nuovo formattatore `eurUnitario`,
che scrive il terzo decimale quando serve.

**Il toast delle voglie prometteva soldi mai contabilizzati.** Diceva «+20 min ·
+0,30 €», ma le resistenze non entrano nei conti — e non devono, perché il
risparmio è già la differenza fra il ritmo di partenza e quello che fumi
davvero, quindi sommarle significherebbe contarle due volte. Dopo dieci voglie
superate i contatori erano aumentati di 0,00 €. Ora il messaggio dice quante
voglie hai superato in settimana: un numero che l'app tiene per davvero e che si
ritrova scritto nel Percorso.

**In classifica era primo chi non registrava niente.** `n = Σ days[chiave]`, e
chi non ha mai registrato ha `days = {}`, quindi zero. Per restare "attivo"
bastava una voglia superata. Un membro con quattro sigarette registrate finiva
dietro a uno con zero registrazioni: l'unica strategia dominante era smettere di
segnare, e l'app perde esattamente il dato su cui si regge. Ora un giorno conta
come **dichiarato** solo se ci sono sigarette registrate o se hai confermato che
eri a zero, si resta in classifica dichiarando oggi o ieri, e ogni riga mostra
«N giorni su M dichiarati».

**Doppio arrotondamento fra Home e Percorso.** La Home riarrotondava
`evitateMostrate`, che era già passato per un decimale: 86,46 → 86,5 → **87**,
mentre il valore vero è 86. Ora l'intero arriva già fatto dai conti
(`evitateIntere`), arrotondato una volta sola.

**La curva non finiva sul numero che le stava sopra.** Accumulava solo gli ultimi
quattordici giorni partendo da zero, dentro una card che mostra il totale di
tutto il percorso: con sessanta giorni di storico la card diceva 218,10 € e la
curva finiva a 48,90 €. Ora parte dal risparmio già accumulato, e un controllo
impone che l'ultimo punto sia il numero grande della card.

**La sigaretta zero era prevista una settimana in ritardo.** Il ciclo del piano
inserisce la riga e poi esce, quindi quando l'obiettivo scende sotto mezza
sigaretta quella riga *è* la settimana dello zero. Contandone una in più, la card
annunciava «sigaretta zero il 24 luglio» mentre la tabella sotto — nella stessa
card — mostrava già S6 con obiettivo 0,00 sette giorni prima.

**Il «massimo» giornaliero poteva essere più alto dell'obiettivo.**
`Math.round(11,9)` dava 12, cioè un tetto sopra l'obiettivo che stava cercando di
far rispettare. Ora `Math.floor`.

**Il calo della classifica dipendeva dall'ora** — vedi il punto 4.

---

## I diciassette minori

- **Ora legale dentro i conti.** La correzione precedente si era fermata alle
  chiavi della classifica: qui i giorni frazionari si calcolavano ancora
  dividendo per 86.400.000, e un'ora di scarto a 20 sigarette al giorno vale
  0,83 sigarette. Nuova `giorniFra`, che conta i giorni interi per calendario e
  le due code come frazione del giorno a cui appartengono.
- **`durata` e `tempoVita` non avevano gli anni** e sbagliavano i singolari:
  trenta giorni diventavano «1 mesi» e un anno intero «12 mesi» — il traguardo
  più grande dell'app scritto nel modo meno riconoscibile possibile. Riscritti,
  con il mese a 30,44 giorni.
- **«media degli ultimi 7 giorni»** con due giorni di storico: ora l'etichetta
  dice «media dei 7 giorni pieni» e il valore è `null` finché non ce n'è almeno
  uno.
- **La nota del piano diceva «togli il 15%»**, ma sotto le sette sigarette al
  giorno comanda la regola del «−1», che è un calo molto più ripido (da 2 a 1 è
  il 50%). Ora il testo dice tutte e due le regole.
- **«A quindici al giorno»** era scritto a mano nell'onboarding: chi dichiarava
  trenta leggeva "quindici" accanto a un numero calcolato su trenta.
- **«Quei giorno non sono andati persi»** con una pausa fra 24 e 47 ore.
- **Il denominatore dei trigger** mescolava le sigarette etichettate con quelle
  su cui non è stato detto niente: ora conta solo quelle a cui hai dato un nome.
- **Registro ripulito al caricamento**: `null`, `NaN`, stringhe e doppioni
  venivano contati da `cigs.length` ma saltati da tutti i filtri per giorno — due
  totali diversi sugli stessi dati — e il record usciva a schermo come «NaN
  mesi». Serve anche in vista dell'import del backup JSON, che è la porta da cui
  entrerebbero.
- **Numero eroe negativo** con l'orologio del telefono spostato indietro: «−1 min
  senza fumare». Ora è sempre ≥ 0, e `distribuisci` non genera più istanti nel
  futuro.
- **`Math.max(...dati.cigs)`** in `groups.publish` era l'ultima eccezione alla
  regola già scritta in `format.js`: sostituito con `maxTs`.
- **«Settimana» e «Mese»** in classifica erano finestre mobili di 7 e 30 giorni,
  non la settimana e il mese di calendario: il 3 del mese «Mese» comprendeva
  ancora quasi tutto il mese precedente. Ora si chiamano «7 giorni» e
  «30 giorni».
- **Le barre «media per settimana» erano cinque** e coprivano 35 giorni, mentre
  tutto il resto della sezione ne guarda 30. Ora sono quattro, e ognuna è di
  giorni pieni.
- **«N oggi · X €»** nella Home è il costo di oggi, non un risparmio, e stava
  senza etichetta accanto a cifre di risparmio: ora dice «spesi».
- **La frase «sei in pari»** era quasi irraggiungibile, perché il valore
  confrontato era già arrotondato a un decimale: ora la soglia è mezza sigaretta
  e sta nei conti (`inPari`).
- **`eur` su valori a metà centesimo**: risolto dove conta, cioè sul prezzo
  unitario.
- **Valori calcolati e mai mostrati** — `giorniSottoBudget`, `s.ieri`,
  `mese.media`, `mese.mediaPrec`, `resistOggi` — rimossi: costo certo a ogni
  render e rischio di divergere in silenzio dal resto.
- **La soglia del calo** è passata da 13 a 14 giorni, perché le due finestre di
  confronto non si sovrappongano davvero.

---

## Cosa NON è stato toccato

**La virgola mobile non è un problema in questa app**, ed è stato verificato:
non c'è nessun accumulo persistente di denaro, ogni euro nasce da una singola
moltiplicazione `quantità × prezzo` e muore in `toFixed(2)`. Centomila accumuli
di 5,99/20 danno un errore di 2,4 × 10⁻⁸, invisibile a due decimali. **Non serve
passare ai centesimi interi.**

**Restano fuori dalla correzione, per scelta:**

- **I fusi orari diversi dentro un gruppo.** `days` viene scritto con la data
  locale di chi pubblica e letto con la data locale di chi guarda. Sistemarlo
  davvero richiede che le chiavi di giornata le decida il server, quindi va
  insieme al lavoro su Supabase Realtime, non prima.
- **La definizione di «giornata a zero»** in `mese.giorniZero` conta i giorni
  senza sigarette *registrate*, che include quelli in cui l'app non è stata
  aperta. È lo stesso vizio della classifica, ma qui riguarda solo una
  statistica personale e la correzione richiede una scelta di prodotto.
- **`min(m·0.85, m−1)`** resta la formula del piano: sotto le sette al giorno
  accelera la riduzione, e clinicamente si può difendere. È stato allineato il
  testo, non la formula.

---

# Seconda tornata: il silenzio, la dichiarazione, e i soldi che non possono essere negativi

L'audit qui sopra aveva lasciato aperte tre cose. Sono state chiuse.

## Il silenzio veniva pagato

`evitate = baseline × tempo − sigarette registrate` faceva scorrere il tempo
anche quando nessuno stava guardando. Chi spariva per dieci giorni si vedeva
accreditare **200 sigarette evitate e 60 € mai risparmiati**, perché le
sigarette non registrate semplicemente non esistevano.

La prima idea — congelare il contatore alla scadenza della copertura — non
funzionava: al rientro il tempo non coperto veniva ricalcolato tutto insieme e
il salto arrivava lo stesso, solo dopo. La versione in vigore somma gli
**intervalli** di tempo certificato, e un buco resta escluso per sempre.
Verificato: 286,8 sigarette prima del rientro, 285,8 dopo aver registrato la
sigaretta del rientro. Nessun salto.

La tolleranza è **48 ore**, definita in `constants.js` e in nessun altro posto,
con sette controlli che ne fissano il comportamento esatto (23h59m, 24h, 36h,
47h59m, 48h, 48h1m, 72h) più uno che verifica la continuità attraverso la
soglia e uno che esclude le doppie contabilizzazioni.

## Mancava il modo di dire «ho smesso»

Il modello non aveva nessuna nozione di data di quit: `start` è la prima
sigaretta registrata. Chi smetteva davvero e non riapriva l'app finiva fuori
dalla classifica, perché la regola anti-gaming pretendeva una dichiarazione
quotidiana.

Adesso c'è `smessoDal`, e la regola è una sola: **la dichiarazione dà
significato al silenzio**. Prima è ignoto, dopo è astinenza. La dichiarazione
non copre all'indietro, e non si sposta ridichiarando — altrimenti chi ricade e
ci riprova si vedrebbe scendere i soldi risparmiati.

Le definizioni complete stanno in `REGOLE-MATEMATICHE.md`, con la tabella degli
otto scenari e i numeri che l'app deve mostrare in ciascuno.

## «−12,40 € risparmiati»

Era scritto così, letteralmente, nella card in cima al Profilo: etichetta fissa,
segno sul numero. Adesso lo scarto dal ritmo ha un segno e i soldi no, e sono
due grandezze separate in `calcolaConti`. Tre invarianti lo tengono fermo, su
ogni periodo e in tutte e due le direzioni: nessuno dei due valori è mai
negativo, non sono mai entrambi maggiori di zero, e la loro differenza è sempre
lo scarto per il prezzo.

---

# Terza tornata: rileggere l'implementazione, non la specifica

Le due tornate qui sopra hanno definito il modello e l'hanno scritto. Questa è
partita dal presupposto opposto: dare per **non** dimostrato che il codice
faccia quello che i documenti dicono, e provare a smontarlo.

Lo strumento nuovo è il **banco delle invarianti** (`controlli.mjs`, sezione
23): quattromila registri generati a caso — storici da zero a quattrocento
giorni, fino a trecento sigarette, prezzi da un centesimo a mille euro,
pacchetti da 10/20/25/30, ritmo dichiarato o dedotto, dichiarazione di aver
smesso in un istante qualsiasi — e su ognuno le tredici invarianti pretese
tutte insieme. Il seme è fisso, quindi il banco è sempre lo stesso: se domani
qualcuno cambia una formula, salta fuori con lo scenario preciso.

Il modello ha retto: nessuna violazione. **Hanno ceduto altre nove cose**, e
nessuna era un errore di aritmetica.

## Il campo del ritmo di partenza rifiutava i decimali

`ProfiloScreen.jsx`, `OnboardingScreen.jsx`

È lo stesso identico difetto già corretto sul prezzo del pacchetto, rimasto in
due punti. Il campo tiene una bozza di testo con la virgola — la riga sopra fa
`String(baseline).replace('.', ',')` — ma era un `type="number"`, e un input
numerico la virgola la rifiuta: il browser gli assegna la stringa vuota.

Chi fumava dodici sigarette e mezza al giorno apriva il Profilo e trovava il
campo **vuoto**, senza modo di riscriverlo. Nessun controllo poteva accorgersene,
perché i controlli non aprono un browser: è il tipo di bug che si vede solo
rileggendo il codice con in mano la domanda «questo numero, chi lo può davvero
scrivere?».

## Cambiare le sigarette per pacchetto riscriveva lo storico in silenzio

`ProfiloScreen.jsx`

L'avviso «questo cambia anche il passato» copriva prezzo e ritmo, non il numero
di sigarette nel pacchetto — che divide il prezzo unitario esattamente come
l'altro fattore. Da venti a dieci, il risparmio di tutto il percorso raddoppia,
senza una parola.

## E non scattava proprio nello scenario che doveva coprire

La condizione era `attuale !== null && valore !== null`. Lasciava passare in
silenzio i due casi che spostano di più:

- il ritmo **dedotto dai dati** che diventa un ritmo **dichiarato** — cioè lo
  scenario F, quello per cui l'avviso era stato scritto;
- un valore **cancellato**, che non sposta i conti: li fa sparire.

Adesso la domanda è una sola: questo cambiamento tocca numeri che la persona ha
già visto? Se sì, glielo si dice prima.

## Il record contraddiceva la Home

`App.jsx` — `record`

Scenario E, chi dichiara di aver smesso senza aver mai registrato una sigaretta:
`record` leggeva `dati.cigs.length` e usciva un trattino, mentre due centimetri
sopra la Home diceva «10 giorni senza fumare». Due schermate, due risposte alla
stessa domanda — che è esattamente la famiglia di bug che questo progetto ha
passato due audit a estirpare. Adesso senza sigarette il record è la pausa in
corso, misurata dal riferimento.

## Le arretrate non contavano la ricaduta

`App.jsx` — `registraArretrate`, `conti.js` — `ricadutaArretrate`

La regola dice che durante un'astinenza dichiarata qualsiasi sigaretta
registrata è una ricaduta. Le arretrate non facevano eccezione a parole ma la
facevano nei fatti: il contatore dei giorni ripartiva da solo — è il riferimento
a spostarsi — mentre `ripartenze` restava fermo.

Non si riusa `eRicaduta` così com'è: la sua seconda condizione, la pausa lunga,
scatterebbe anche fuori dall'astinenza, e mettere in ordine il registro non è
ricadere. La schermata «Ripartiamo da qui» resta comunque fuori, per la stessa
ragione.

## «48 ore» scritto a mano in due schermate

`constants.js` — `ORE_TOLLERANZA`

La tolleranza era definita in un punto solo, come previsto; il numero **detto
all'utente** no. Cambiare la costante avrebbe fatto mentire due schermate senza
che nessun controllo se ne accorgesse. Un numero visibile che nasce altrove non
è una fonte di verità sola: è due.

## `giorniZeroCoperti` esplodeva

`conti.js`

`mese` passa `dati` così com'è, e `dati.cigs` può mancare. Verificato, non
supposto: `TypeError: Cannot read properties of undefined (reading 'some')`, e
con lui l'intera schermata dei Numeri.

## `maxTs` poteva restituire una stringa

`format.js`

Con una stringa nel registro il confronto `'x' > 12345` è falso in tutti e due i
versi, quindi `maxTs` poteva restituire la stringa; da lì
`Math.max(ultima, certificato)` faceva `NaN` e **il riferimento dell'astinenza
spariva**, cioè la fonte del numero grande della Home, delle tappe del corpo e
del record. Senza nessun errore visibile. Il registro oggi viene ripulito al
caricamento, quindi la strada è chiusa a monte — ma sarà riaperta il giorno che
si potrà reimportare un backup JSON, che è l'unica funzione già in lista.

## Il mese sapeva dire solo il caso bello

`App.jsx` — `mese`, `PercorsoScreen.jsx`

Il valore passava per un `Math.max(0, …)`, quindi la frase sotto il grafico
compariva solo col segno positivo: chi fumava più del proprio ritmo di partenza
non leggeva niente. Le due card sopra il caso brutto lo dicono; nascondere solo
lì non è gentilezza, è la stessa asimmetria che rende impossibile fidarsi dei
numeri. Nella stessa riga: l'etichetta «Sopra il ritmo di partenza» conviveva
con «sei in pari» dentro la stessa card, quando lo scarto era negativo ma sotto
la mezza sigaretta.

## E una riga sbagliata nella specifica

`REGOLE-MATEMATICHE.md` — D3

Diceva che in astinenza dichiarata il tempo contato è **esattamente** il tempo
di percorso. Il banco l'ha smentita in centinaia di casi: la dichiarazione non
copre all'indietro, quindi un buco precedente resta escluso per sempre — ed è
corretto che sia così.

È il difetto più pericoloso dei nove, perché non è nel codice. Chi avesse letto
quella riga e «aggiustato» il codice per farla tornare avrebbe rimesso in piedi
esattamente il bug che la copertura esiste per impedire.

Stessa famiglia: i commenti di `conti.js` numeravano le regole in un ordine e la
specifica in un altro — `D5` erano i «giorni a zero» nel codice e i «giorni
senza fumare» nel documento. Adesso c'è una tabella sola, in cima alle regole.
