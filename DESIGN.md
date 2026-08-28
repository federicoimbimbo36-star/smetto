# Germoglio — il linguaggio visivo di Smetto

Vive tutto in `src/styles.css`, che è anche il posto dove queste regole sono
scritte come commenti, accanto al codice che le applica.

Sostituisce **Brace** (nero, oro, aloni caldi, due caratteri con due mestieri).
Brace era coerente e curato, e sbagliava bersaglio: comunicava lusso, finanza,
automobili. Un'app che accompagna qualcuno mentre smette di fumare deve
comunicare calma, crescita e respiro, e deve farlo anche — soprattutto — nel
momento in cui quella persona sta male.

## L'idea

**Smettere non è una privazione, è una cosa che cresce.**

Da qui viene tutto il resto: il verde invece dell'oro, lo spazio invece della
densità, una pianta che diventa protagonista al posto di una dashboard, e una
schermata della ricaduta che non contiene un solo elemento rosso.

## Le quattro regole

**1. Lo spazio è il materiale.** Se una schermata sembra piena, è sbagliata.
Fra un blocco e l'altro non meno di 28px, e ogni schermata risponde a **una**
domanda sola:

| | |
|---|---|
| Oggi | come sta andando il mio percorso? |
| Percorso | quanto sono arrivato lontano? |
| Aiuto | come supero questo momento? |
| Profilo | chi sono e perché lo sto facendo? |

**2. Il numero è il protagonista.** Un dato grande (84px, peso 800), la sua
etichetta piccolissima (11px). Mai due numeri grandi nella stessa schermata: se
ce ne sono due, uno appartiene a un'altra schermata.

**3. Mai il rosso.** Non è una preferenza cromatica, è la regola che tiene in
piedi il prodotto. Chi ricade dopo venti giorni non deve leggere «hai fallito»:
quando un dato va male si **spegne** (`--neutro`, un grigio-salvia), non si
accende. Vale ovunque, compresi i bottoni distruttivi e chi esce dalla
classifica — dove peraltro si spegne il numero, mai il nome della persona.

**4. Il verde porta il percorso, l'azzurro porta la difficoltà.** Verde =
crescita, salute, progresso. Azzurro = respiro, calma, craving: quando arriva
la voglia l'app cambia proprio stanza, e si vede. Il pesca è un dettaglio
emotivo e basta: il fiore a 90 giorni, il traguardo, il pallino dei non letti.
Un solo accento forte per schermata.

## La palette

| token | | |
|---|---|---|
| `--sfondo` | `#F7F8F4` | crema: il fondo di tutta l'app |
| `--bianco` | `#FFFFFF` | le superfici sollevate |
| `--verde` | `#286B5A` | il colore del percorso |
| `--verde-velo` | `#DDEDE6` | fondi tenui, CTA secondarie |
| `--azzurro` | `#7BB8C8` | respiro, calma |
| `--azzurro-velo` | `#DCEEF2` | il fondo delle schermate difficili |
| `--pesca` | `#F2B79E` | il dettaglio emotivo |
| `--t1` | `#18312C` | il testo |
| `--t2` | `#586863` | il testo secondario |
| `--neutro` | `#6E807B` | il dato spento, al posto del rosso |

**Due colori di testo, non tre.** Con tre livelli il terzo finisce sempre sotto
la soglia di contrasto. Il brief chiedeva `#71817C` per il secondario: su crema
dà 3.8:1 e non passa AA a dimensione di corpo. `--t2` è quel colore scurito
finché non regge **4.85:1 su tutti i fondi dell'app** — crema, verde velo,
azzurro velo, pesca. A occhio è lo stesso grigio-salvia; alla lettura è un'altra
cosa. `--neutro` regge 3:1 ed è ammesso **solo** sulle cifre grandi.

I contrasti non sono stimati: `npm run verifica` li ricalcola tutti a ogni giro.

## Tipografia

**Manrope**, un peso solo per ruolo. Niente serif editoriale: è un'app mobile
consumer, non una rivista.

| | | |
|---|---|---|
| cifra eroe | 84px | 800, `-.045em`, tabellare |
| titolo schermata | 30px | 800, `-.03em` |
| titolo sezione | 19px | 700 |
| corpo | 15px | 500, interlinea 1.62 |
| etichetta | 11px | 600, `+.13em`, maiuscoletto |

## La pianta — l'elemento firma

`src/components/Pianta.jsx`. Sette stadi, da seme a fioritura, disegnati con lo
stesso tratto: uno stelo campionato su una curva appena ondulata e delle foglie
a mandorla che in basso sono grandi e cadenti, in cima piccole e rivolte
all'insù. Sotto, un alone verde chiarissimo; a 90 giorni, un fiore pesca.

**Cresce sui giorni di PERCORSO, non sui giorni senza fumare, e non torna mai
indietro.** È la regola più importante del sistema: una ricaduta azzera il
contatore in alto, non la cosa che sta crescendo. La schermata della ricaduta
dice «quei giorni non sono andati persi» — la pianta lo dimostra invece di
dirlo, e infatti compare lì dentro.

La stessa forma di foglia è nel marchio (`BrandMark.jsx`), nel favicon e nelle
icone dell'app: marchio e illustrazione parlano la stessa lingua.

> Due trappole imparate a caro prezzo, entrambe annotate in `styles.css`: per il
> browser l'attributo `transform` di un nodo SVG **è** la proprietà CSS
> `transform`. Quindi un `transform-origin` scritto nel CSS sposta anche il
> posizionamento delle foglie — l'origine di default è il centro del viewBox —
> e le scaglia lontano dallo stelo, a specchio; e un `transform` dentro un
> keyframe **sostituisce** quel posizionamento, facendole collassare
> sull'origine per tutta la durata dell'animazione. L'animazione di entrata
> tocca solo l'opacità.

## Il numero della Home

Il brief chiedeva «12 / GIORNI LIBERO». Smetto è un'app di **riduzione
graduale**: chi fuma ancora quindici sigarette al giorno si troverebbe uno zero
fisso in faccia ogni mattina, e quello zero è esattamente il messaggio che fa
chiudere un'app.

Il numero eroe è il **tempo dall'ultima sigaretta**: dice «12 giorni» a chi ha
smesso e «4 ore» a chi sta ancora tagliando. È anche la prima metrica che cresce
davvero quando si comincia a scendere, quindi premia il gesto giusto (aspettare)
invece di premiare solo l'astinenza totale.

## Cosa è cambiato rispetto a Brace

- **Cinque schede diventano quattro.** Oggi · Percorso · Aiuto · Profilo. Il
  gruppo non è stato eliminato: è dentro Aiuto, che è poi quello che è — la
  forma di aiuto che funziona meglio di tutte le altre. Piano e Recap, che erano
  due schede per tre periodi ciascuna, sono diventati tre sezioni piatte.
- **Il tasto «+» gigante è sparito.** Al suo posto la CTA primaria è **«Come ti
  senti oggi?»**, e registrare una sigaretta è l'azione secondaria — presente, a
  un tocco, mai scritta come una sconfitta. Se registrare costa vergogna la
  gente smette di registrare, e l'app perde l'unico dato che ha.
- **Il check-in non è un sondaggio, è uno smistamento.** «Sto bene» conferma la
  giornata a zero e tiene in classifica; «ho voglia di fumare» apre il craving.
- **Il craving è di un altro colore.** Azzurro, una domanda, quattro strade,
  nessun conto alla rovescia che metta fretta. I dettagli arrivano solo dentro
  la strada scelta.
- **La respirazione è una micro-esperienza vera.** 4–2–6, con l'espirazione più
  lunga dell'inspirazione perché è quella che abbassa la frequenza cardiaca. Il
  cerchio non è decorazione: è l'istruzione, leggibile a occhi socchiusi.
- **La ricaduta è stata ripensata.** Il numero grande è il tempo che avevi
  *tenuto*. Poi una domanda sola, «cosa è successo?», e la risposta diventa
  l'etichetta di quella sigaretta nel registro: risale nel Percorso come «lo
  stress ti ha innescato 6 sigarette» e come suggerimento di scrivere il
  se–allora giusto. La ricaduta diventa un dato, non una confessione.
- **Il marchio.** Era una sigaretta con la brace accesa. Un'app che aiuta a
  smettere non ha motivo di tenere una sigaretta sulla schermata Home, guardata
  venti volte al giorno. Adesso è un germoglio a due foglie.
- **Si possono segnare più sigarette insieme.** Capita di non aprire l'app per
  mezza giornata, e toccare venti volte lo stesso bottone non è un'espiazione.
  Il foglio chiede due cose: quante, e quando all'incirca. Il «quando» non è
  burocrazia: qui i timestamp reggono l'intervallo medio, la fascia oraria a
  rischio e il confine di giornata della classifica, quindi le sigarette
  vengono distribuite dentro la finestra scelta invece di collassare tutte
  nello stesso minuto. E segnare adesso delle sigarette di ieri **non** azzera
  le ore pulite di oggi: sarebbe la punizione perfetta per chi è stato onesto.
- **Il prefisso telefonico si sceglie.** Bandiera, paese e prefisso a sinistra,
  numero a destra. Prima il codice metteva `+39` a chiunque: per un'app
  italiana sembra ragionevole finché non ci prova un rumeno o un albanese, che
  sono le due comunità straniere più numerose in Italia. Si registravano con un
  numero sbagliato senza che niente lo segnalasse, e l'account restava
  irrecuperabile. Se incolli un numero che comincia con `+`, il paese si adegua
  da solo.
- **Le medaglie sono sparite dalla classifica.** Il primo posto è verde, gli
  altri sono neri, chi non registra da un giorno si spegne. Nessun podio.

## Accessibilità

Non è una casella spuntata alla fine. `npm run verifica` esegue anche il
contrasto AA di ogni coppia testo/fondo, i bersagli tattili da 44px su ogni
controllo interattivo, la presenza di `prefers-reduced-motion`, il focus
visibile da tastiera e le safe area di iPhone.

Nessuna informazione è affidata al solo colore: dove un dato «si spegne» cambia
anche l'etichetta («risparmiati» → «spesi in più»).

## Rigenerare le icone

```bash
python3 strumenti/genera-icone.py
```

Ridisegna tutti i PNG di `public/` dal marchio. Se cambi i colori qui, cambiali
anche in `src/styles.css`, `public/favicon.svg` e `src/components/BrandMark.jsx`.
