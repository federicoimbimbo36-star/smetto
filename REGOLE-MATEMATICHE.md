# Le regole matematiche di Smetto

Le definizioni in vigore. Da leggere prima di toccare qualunque cosa produca
una cifra, perché quasi tutti i bug corretti in questo progetto non erano
errori di aritmetica: erano due parti dell'app che rispondevano in modo
diverso alla stessa domanda.

Ogni regola qui sotto ha un controllo corrispondente in
`verifica/controlli.mjs`, scritto per **fallire** con il codice di prima.

---

## Il principio

> **La dichiarazione esplicita di aver smesso dà significato al silenzio.**

Finché sei in riduzione, un giorno senza registrazioni non dice niente: non è
un giorno a zero, è un giorno ignoto, e non produce risparmio. Dal momento in
cui dichiari di aver smesso, il silenzio significa «non ho fumato», e l'unica
cosa che devi registrare è una ricaduta.

Da qui discende tutto il resto.

---

## I numeri delle regole

Le regole hanno due numerazioni in giro: quella di questo documento e quella
dell'elenco delle quattordici grandezze usato nelle richieste. Sono la stessa
cosa detta in due ordini, e confonderle è già costato: nel codice `D5` indicava
i «giorni a zero» mentre qui `D5` sono i «giorni senza fumare». **Vale questa
tabella**, e i commenti di `src/utils/conti.js` adesso la seguono.

| qui | grandezza | dove sta |
|---|---|---|
| D1 | ritmo di partenza | `calcolaBaseline` |
| D2 | copertura | `intervalliCoperti` |
| D3 | tempo contato | `tempoCoperto` |
| D4 | riferimento dell'astinenza | `riferimentoAstinenza` |
| D5 | giorni senza fumare | `giorniSenzaFumare` |
| D6 | giorni di percorso | `giorniPercorso` |
| D7 | scarto, risparmiato, speso in più, vita | `calcolaConti` |
| D8 | ricaduta | `eRicaduta`, `ricadutaArretrate` |
| D9 | dichiarazione di aver smesso | `dichiaraSmesso` / `annullaSmesso` |
| D10 | giorni a zero | `giorniZeroCoperti` |
| D11 | classifica | `dichiarato` in `App.jsx` |
| D12 | record senza fumare | `recordSenzaFumare` |
| D13 | medie di periodo | `mediaCoperta` |
| D14 | il registro come dato condiviso | `utils/fusione.js` |

---

## D1 · Il ritmo di partenza (`calcolaBaseline`)

```
se profile.baseline > 0        → quello, pronto subito
altrimenti, dopo 8 giorni      → sigarette dei giorni 1..7 / 7
altrimenti                     → non pronto: nessun conto viene mostrato
```

La finestra **salta il giorno d'inizio**, che è per forza parziale, ed è
**fissa**: una volta calcolata non cambia più. Prima si allargava ogni giorno e
comprendeva la giornata in corso, quindi il metro si muoveva insieme alla cosa
misurata — chi fumava esattamente dieci sigarette al giorno senza mai cambiare
leggeva per una settimana «sei 4,5 sigarette sopra il ritmo da cui sei
partito».

Chi dichiara di aver smesso senza aver mai registrato una sigaretta non avrà
mai dati da cui dedurlo: per quella persona il ritmo dichiarato è l'unica
strada, e l'app glielo chiede.

**È l'unica fonte di verità.** Onboarding, Profilo, contatori, statistiche del
mese e piano settimanale leggono tutti `ritmo.valore`. Nessuno legge
`profile.baseline` direttamente.

## D2 · La copertura (`intervalliCoperti`)

```
per ogni evento e ∈ {start} ∪ cigs ∪ resists ∪ checkins, con e ≥ start:
    [e, e + TOLLERANZA_COPERTURA]
se smessoDal ≠ null:
    aggiungi [smessoDal, +∞)
C = unione fusa degli intervalli
```

`TOLLERANZA_COPERTURA` vale **48 ore** ed è definita **in un punto solo**,
`src/constants.js`. Nessun altro algoritmo ha una tolleranza propria, e
nemmeno nessun testo: le due schermate che dicono «sono passate più di 48 ore»
leggono `ORE_TOLLERANZA`, che nasce dalla costante. Prima il numero era
scritto a mano, quindi cambiare la tolleranza avrebbe fatto mentire
l'interfaccia senza che nessun controllo se ne accorgesse.

Gli intervalli **non** sono tagliati su `adesso`: si calcolano una volta al
giorno e restano validi mentre i contatori scorrono al secondo. Il taglio lo fa
`tempoCoperto`.

La dichiarazione **non copre all'indietro**: chi dichiara oggi non certifica i
dieci giorni di buio che ha alle spalle.

## D3 · Il tempo contato (`tempoCoperto`)

```
tempoContato(P) = Σ giorniFra(max(a, P.da), min(b, P.a))   su [a,b] ∈ C
```

`giorniFra` conta i giorni interi per calendario e le due code come frazione
del giorno a cui appartengono, quindi non sbaglia nei due giorni del cambio
d'ora.

Invariante: `0 ≤ tempoContato ≤ giorniFra(start, adesso)`.

**Correzione.** Qui c'era scritto «con uguaglianza esatta in astinenza
dichiarata», ed era falso. La dichiarazione non copre all'indietro (D2):
chi ha un buco *prima* di dichiarare se lo tiene per sempre, e il tempo
contato resta minore del tempo di percorso. Un banco da quattromila registri
casuali lo smentiva in centinaia di casi. L'uguaglianza vera è più stretta e
riguarda solo il tratto successivo:

```
tempoContato([smessoDal, adesso]) = giorniFra(smessoDal, adesso)     sempre
tempoContato([start, adesso])     ≤ giorniFra(start, adesso)         sempre
```

La riga sbagliata non era innocua: chi l'avesse presa per buona e avesse
«aggiustato» il codice per farla tornare avrebbe rimesso in piedi esattamente
il bug che la copertura esiste per impedire — dieci giorni di silenzio pagati
come dieci giorni senza fumare.

## D4 · Il riferimento dell'astinenza (`riferimentoAstinenza`)

```
RIF = max(ultimaSigaretta, inizioCertificato)    ignorando i null
```

dove `inizioCertificato` è l'inizio del tratto di copertura che arriva fino ad
`adesso`, o `null` se in questo momento non siamo coperti.

Chi ha registrato o confermato ogni giorno tiene tutto il suo tempo, e
dichiarare di aver smesso **non lo rimanda a zero**. Chi ha smesso il 20 luglio
in silenzio e lo dichiara il 1° agosto non può rivendicare quei dodici giorni,
perché in mezzo l'app non sapeva niente.

## D5 · Giorni senza fumare (`giorniSenzaFumare`)

```
giorniSenzaFumare = floor( max(0, adesso − RIF) / 24h )
```

**Tempo trascorso**, non giorni di calendario. È la stessa grandezza che
alimenta il numero grande della Home, le tappe del corpo e il record, quindi
non possono contraddirsi.

## D6 · Giorni di percorso

```
giorniPercorso = max(0, dayDiff(start, adesso))       → conti.js
```

Giorni di **calendario**. Unità volutamente diversa da D5: uno è tempo
trascorso, l'altro sono giorni sul calendario. Conseguenza da accettare: il
giorno in cui dichiari di aver smesso l'app dice «giorno 42 del percorso» e
«0 giorni senza fumare». **Non si azzera mai**, nemmeno dopo una ricaduta — è
quello che fa crescere la pianta.

## D7 · Lo scarto dal ritmo, e poi i soldi

```
scarto(P)      = baseline × tempoContato(P) − |cigs ∩ P|      HA UN SEGNO
risparmiato(P) = max(0,  scarto(P)) × prezzo                  MAI NEGATIVO
spesoInPiu(P)  = max(0, −scarto(P)) × prezzo                  MAI NEGATIVO
```

Stessa forma per la vita, con `minutiPer` al posto del prezzo unitario. `P` è
il periodo: tutto il percorso, oggi, questa settimana.

Tre invarianti, verificati su ogni periodo e in tutte e due le direzioni:

1. `risparmiato ≥ 0` e `spesoInPiu ≥ 0`, sempre;
2. mai entrambi maggiori di zero;
3. `risparmiato − spesoInPiu = scarto × prezzo`.

**L'interfaccia non può mostrare un valore negativo accanto alla parola
«risparmiati».** Prima nel Profilo si leggeva letteralmente «−12,40 €
risparmiati», con l'etichetta fissa e il segno sul numero.

Proiezione a un anno: `scartoAnno = (baseline − media7) × 365`, oppure `null`
se `media7` è `null`. `media7` è la media dei **giorni pieni**, oggi escluso:
comprendendolo, la proiezione passava da 1.251 € all'una di notte a 1.095 €
alle nove di sera con gli stessi dati.

## D8 · La ricaduta (`eRicaduta`)

```
primaDopoLaDichiarazione = smessoDal ≠ null e (U è null oppure U < smessoDal)
pausaLunga               = U ≠ null e (ts − U) ≥ SOGLIA_RICADUTA
ricaduta                 = primaDopoLaDichiarazione oppure pausaLunga
```

`SOGLIA_RICADUTA` vale **20 ore**: dormendo non si raggiungono. A otto ore
contava i risvegli, e in trenta giorni di fumo regolare fra le 7:30 e le 22:30
il contatore arrivava a «è la 29ª volta che riparti».

Durante un'astinenza dichiarata **qualsiasi** sigaretta è una ricaduta, anche a
tre ore dalla precedente. La seconda condizione evita di contarne un'altra
venti minuti dopo: solo la prima.

**Anche le arretrate** (`ricadutaArretrate`). Chi dichiara di aver smesso e poi
mette in ordine il registro segnando tre sigarette di ieri ha ricaduto, e lo
sta dicendo con un giorno di ritardo. Prima `registraArretrate` non passava di
qui: il contatore dei giorni ripartiva da solo — è il riferimento a spostarsi —
mentre `ripartenze` restava fermo, e due numeri raccontavano due storie sugli
stessi dati. Vale solo la prima condizione, non la pausa lunga: mettere in
ordine il registro dopo tre giorni di silenzio, in fase di riduzione, non è
ricadere. La schermata «Ripartiamo da qui» resta fuori — serve a chi ha appena
ceduto, non a chi sta compilando.

## D9 · Dichiarare di aver smesso

Imposta `smessoDal = adesso` **solo se non è già impostata**, e `start = adesso`
se il percorso non era ancora partito. Non tocca `cigs`, `ripartenze`,
baseline, prezzo.

**Ridichiarare mentre si è già dichiarati non sposta niente.** Spostando la
data in avanti si perderebbe la copertura del periodo già certificato, e chi
ricade e ci riprova si vedrebbe *scendere* i soldi risparmiati — nello scenario
D, nove euro in meno per aver detto «ci riprovo». La dichiarazione è un impegno
che resta: dopo una ricaduta il contatore dei giorni riparte da solo dalla
sigaretta, perché è il **riferimento** a spostarsi, non la dichiarazione.

Per azzerarla davvero si passa da «sono tornato in riduzione»
(`annullaSmesso`).

## D10 · Giorni a zero (`giorniZeroCoperti`)

Solo in fase di **riduzione**. Un giorno conta se è **completo** (oggi non è
finito, quindi non partecipa), **interamente coperto** e senza sigarette
registrate. Senza la condizione di copertura, sparire dall'app era il modo più
veloce per collezionare giorni a zero.

In astinenza dichiarata la statistica non si mostra: al suo posto va D5, che è
più preciso e non ha il tetto della finestra di trenta giorni.

## D11 · La classifica

```
dichiarato(m, k) = days[k] > 0 || checkins[k] || (m.smessoDal ≠ null && k ≥ ymd(m.smessoDal))
attivo           = dichiarato(oggi) || dichiarato(ieri)
```

Stessa regola dei conti: la dichiarazione dà significato al silenzio. Chi ha
smesso davvero non deve tornare ogni giorno a giustificarsi, e chi non registra
niente non può restare primo per inerzia.
## D12 · Il record senza fumare (`recordSenzaFumare`)

```
record = max( adesso − RIF ,  max{ c[i] − c[i−1] : [c[i−1], c[i]] ⊆ C } )
```

Una pausa fra due sigarette conta come record **solo se sta tutta dentro
un tratto coperto**. È la stessa condizione dei giorni a zero (D10), e per
la stessa ragione: dieci giorni di silenzio non sono dieci giorni senza
fumare, sono dieci giorni ignoti.

Prima il record scorreva le sigarette due a due e prendeva la distanza più
grande. «Assenza di dati ≠ zero» valeva per i soldi e per i giorni a zero,
non qui — ed è peggio che nei contatori: un record resta scritto, diventa
il numero da battere, e sta accanto alla scritta «il tuo record senza
fumare» come se qualcuno l'avesse verificato.

Con la tolleranza a 48 ore la regola dice: una pausa più lunga di due
giorni conta solo se in mezzo ti sei fatto vivo — una voglia superata, un
«oggi zero», o una dichiarazione di aver smesso, che copre tutto da lì in
avanti. Che è esattamente la persona che quel record se lo merita.

La pausa **in corso** vale sempre, perché si misura da RIF (D4), che è già
prudente per costruzione.

## D13 · Le medie di periodo (`mediaCoperta`)

```
media(P) = |cigs ∩ P| / tempoContato(P)        null se tempoContato(P) < 0,5 g
```

Stessa regola, applicata al denominatore: dividere per i giorni di
calendario significa contare come «zero sigarette» i giorni in cui l'app
non sapeva niente.

Non è un dettaglio estetico. Da `media7` esce la proiezione a un anno:
sparire tre giorni su sette faceva scendere la media del 43% e salire
della stessa quota il risparmio annunciato per i dodici mesi successivi.
E da `mediaPrec` esce l'obiettivo settimanale: una settimana passata senza
aprire l'app produceva un obiettivo vicino a zero, irraggiungibile,
presentato come se fosse il risultato di un progresso.

Sotto il mezzo giorno coperto il valore è `null` e chi lo mostra scrive un
trattino, oppure — per l'obiettivo — dice che non lo sa.


---

## Gli otto scenari

`adesso` = 11 agosto 2026, 10:00 · baseline 20/g · pacchetto 6,00 € da 20 →
0,30 €/sig · tolleranza 48h. Ricalcolati a ogni `npm run verifica`.

| | **A** riduzione, 10g di silenzio | **A-bis** riduzione, 25/g su baseline 20 | **B** dichiara, poi 10g di silenzio | **C** dichiara, 1 sig. dopo 3g | **D** dichiara, ricade, ridichiara | **E** mai fumato, dichiara | **F** come B, baseline 20→15 | **G** come B, prezzo 6,00→6,50 |
|---|---|---|---|---|---|---|---|---|
| inizio percorso | 1 lug 09:00 | 1 lug 09:00 | 1 lug 09:00 | 1 lug 09:00 | 1 lug 09:00 | 1 ago 09:00 | 1 lug 09:00 | 1 lug 09:00 |
| ultima sigaretta | 1 ago 22:00 | 11 ago 09:45 | 1 ago 08:00 | 4 ago 20:00 | 7 ago 22:00 | nessuna | 1 ago 08:00 | 1 ago 08:00 |
| `smessoDal` | — | — | 1 ago 09:00 | 1 ago 09:00 | 1 ago 09:00 | 1 ago 09:00 | 1 ago 09:00 | 1 ago 09:00 |
| riferimento | 1 ago 22:00 | 11 ago 09:45 | 1 ago 08:00 | 4 ago 20:00 | 7 ago 22:00 | 1 ago 09:00 | 1 ago 08:00 | 1 ago 08:00 |
| giorni senza fumare | 9 | 0 | 10 | 6 | 3 | 10 | 10 | 10 |
| giorni di percorso | 41 | 41 | 41 | 41 | 41 | 10 | 41 | 41 |
| tempo contato | 33,54 g | 41,04 g | 41,04 g | 41,04 g | 41,04 g | 10,04 g | 41,04 g | 41,04 g |
| scarto dal ritmo | 286,8 | −208,2 | 447,8 | 446,8 | 422,8 | 200,8 | 242,6 | 447,8 |
| risparmiati | 86,05 € | 0,00 € | 134,35 € | 134,05 € | 126,85 € | 60,25 € | 72,79 € | 145,55 € |
| speso in più | 0,00 € | 62,45 € | 0,00 € | 0,00 € | 0,00 € | 0,00 € | 0,00 € | 0,00 € |
| giorni a zero | 1 | 0 | *non mostrato* | *non mostrato* | *non mostrato* | *non mostrato* | — | — |

**A** senza la copertura direbbe 436,8 sigarette e 131,05 €: quarantacinque
euro che non ha risparmiato.

**E** richiede il ritmo dichiarato: non avendo mai registrato una sigaretta,
non c'è niente da cui dedurlo.

**F** e **G** cambiano lo storico all'indietro. È corretto — hai cambiato il
metro, non i dati — ma è un salto visibile, e il Profilo lo dice **prima** di
salvare.

---

## Le soglie della tolleranza

Comportamento fissato dai test, misurato su un solo evento:

| tempo dall'evento | coperto | tempo contato |
|---|---|---|
| 23h59m | sì | 0,999 g |
| 24h | sì | 1,000 g |
| 36h | sì | 1,500 g |
| 47h59m | sì | 1,999 g |
| **48h** | **sì** | **2,000 g** |
| 48h1m | no | 2,000 g |
| 72h | no | 2,000 g |

Il passaggio è **continuo**: il minuto prima e il minuto dopo differiscono di
un minuto, non di un salto. Due eventi vicini producono intervalli sovrapposti
che vengono fusi, quindi il tempo si conta **una volta sola**. E rientrare dopo
dieci giorni non ricredita il silenzio: era il difetto della prima versione
della regola, dove congelare il contatore rimandava il salto invece di
eliminarlo.

---

## Limiti dichiarati

**Fusi orari nei gruppi.** `days` viene scritto con la data locale di chi
pubblica e letto con quella di chi guarda. Per utenti **nello stesso fuso non
c'è nessun errore**, ed esiste un controllo che lo verifica su 400 giorni
consecutivi e attorno a entrambi i cambi d'ora. Chi viaggia sposta di un giorno
i propri conteggi passati agli occhi del gruppo, perché `publish` ricostruisce
`days` da zero a ogni scrittura; al ritorno si riallinea da solo. La soluzione
vera è far decidere al server le chiavi di giornata, ed è rimandata al lavoro
su Realtime.

**Nessuno storico dei prezzi.** Cambiando il prezzo del pacchetto, tutte le
sigarette del passato vengono ricalcolate al valore nuovo. Semplificazione
consapevole: l'alternativa è una tabella di prezzi datati.

**Il silenzio dopo una dichiarazione non è verificabile.** Chi dichiara di aver
smesso e poi fuma senza registrarlo accumula giorni che non ha fatto. Non c'è
modo di saperlo dai dati: la contromisura è sociale, non algoritmica — nel
gruppo la riga mostra la natura dello zero, e chi vuole può tornare in
riduzione.

---

## D14 · Il registro come dato condiviso

Le regole D1–D13 dicono come si contano le sigarette. Questa dice che
cosa **è** una sigaretta quando la stessa persona ha due telefoni.

```
cigs(A ⊕ B)    = ( cigs(A) ∪ cigs(B) ) \ ( rimossi(A) ∪ rimossi(B) )
rimossi(A ⊕ B) = rimossi(A) ∪ rimossi(B)
campo(A ⊕ B)   = quello con l'orologio più alto, campo per campo
start(A ⊕ B)   = min
```

**L'istante in millisecondi è l'identità dell'evento.** Lo era già di
fatto — su quello sono indicizzate le etichette del registro — e adesso lo
è anche formalmente: due sigarette non possono condividere un
millisecondo, e la stessa sigaretta ha lo stesso identificativo su tutti i
dispositivi.

Da qui discende tutto: due dispositivi non si perdono niente, i tentativi
ripetuti non duplicano, e **l'ordine con cui le sincronizzazioni arrivano
non cambia il risultato finale**. La fusione è commutativa, associativa e
idempotente.

Le cancellazioni sono **lapidi**, non assenze: senza, l'unione farebbe
risorgere ogni sigaretta tolta dal registro alla prima sincronizzazione.

Le ricadute sono diventate un **insieme di istanti** invece di un
contatore. Un contatore scalare non si fonde: due dispositivi che salgono
da 3 a 4 ciascuno, riconciliati con «vince il più recente», danno 4 e non
5. `ripartenzeBase` porta avanti il numero delle versioni precedenti senza
inventare istanti che nessuno ha registrato, e il numero mostrato è la
somma dei due.

Definizioni e dimostrazioni: `src/utils/fusione.js` e
`verifica/persistenza.mjs`.
