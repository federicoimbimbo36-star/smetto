# Brace — il linguaggio visivo di Smetto

File Figma: **Smetto — Brace** (`xc5mo1wxOIoUXyp3Ni9gXB`) — tre schermate
costruite e una pagina *Fondamenta* che documenta il sistema.
Nel codice vive tutto in `src/styles.css`.

## L'idea

Al buio l'unica luce è la brace. Nell'app quella luce non è più la sigaretta —
sei tu: i soldi che tieni, il tempo che non bruci, le voglie che superi.
**Tutto ciò che va bene è caldo.**

Da qui discende tutto il resto, e il motivo per cui l'app è scura non è estetico:
è che una sola luce calda su un fondo quasi nero è il modo più diretto per dire
quell'idea. È anche, non per caso, il registro di ogni oggetto costoso — orologi,
distillati, automobili, bar d'albergo — ottenuto senza un solo ornamento «di lusso».

## Le tre regole

**1. Un solo accento.** La brace `#F0A23C` è l'unica luce della palette. Se
compare due volte nella stessa schermata, una delle due è di troppo. Un'interfaccia
sembra costosa per i colori che toglie, non per quelli che aggiunge.

**2. Mai il rosso.** Questa è un'app per chi sta smettendo di fumare: il momento
in cui ricade è il momento in cui deve essergli più amica, non quello in cui si
accende di allarme. L'asse semantico non è giusto/sbagliato, è **caldo/freddo**:
quando sei sopra il tuo ritmo il numero si *raffredda* (`--fredda`, un
grigio-azzurro di cenere spenta). Constata, non accusa. Vale ovunque, compresi
i bottoni distruttivi e chi esce dalla classifica.

**3. Due caratteri, due mestieri.** Non due stili: due ruoli.
*Schibsted Grotesk* porta i dati — numeri, etichette, bottoni: preciso, tabellare,
silenzioso. *Instrument Serif* porta la voce — titoli, il motivo per cui stai
smettendo, le frasi dopo una ricaduta: è l'app che ti parla come una persona,
non come un referto.

## La palette

| | | |
|---|---|---|
| `--base` | `#0E0D0B` | terra: nero caldo, mai bluastro — è cenere, non schermo spento |
| `--rilievo` | `#191712` | le superfici sollevate |
| `--t1` | `#F2EDE4` | osso: il testo, mai bianco puro |
| `--t2` `--t3` | `#A8A093` `#6E675C` | secondario e terziario |
| `--brace` | `#F0A23C` | l'unica luce |
| `--fredda` | `#7E8D96` | al posto del rosso, ovunque |

Le superfici **non hanno bordi**: sono separate dal tono e dalla luce. Dove serve
una linea è un filo di bianco all'8%, non un contorno.

## Cosa è cambiato nell'interfaccia

- **I mozziconi disegnati sono diventati tacche.** Nove segni sottili, quelli
  fumati accesi di brace. Contare per tacche è il gesto più antico che esista,
  è astratto abbastanza da restare elegante a qualunque numero, e non somiglia a
  nessun'altra app.
- **Il bottone «+» è una brace.** Un cerchio con un alone caldo che si accende
  al passaggio: è l'oggetto che tocchi venti volte al giorno, e sostituisce il
  gesto fisico che stai perdendo.
- **Via le scatole.** Le carte con bordo e ombra sono diventate sezioni separate
  da un filo e da molto spazio. Lo spazio è la parte costosa.
- **Le classifiche non hanno più medaglie colorate.** Il primo posto è brace, gli
  altri sono osso, chi non registra da un giorno si raffredda. Nessuno viene
  barrato o messo in rosso.
- **Il marchio.** La sigaretta in orizzontale con la brace accesa all'estremità.
  In verticale (primo tentativo) leggeva come un punto esclamativo — il segnale
  opposto a quello che quest'app vuole dare.

## Le referenze

Non altre app per smettere di fumare: quelle si somigliano tutte. Il riferimento
sono le app **più scaricate al mondo** — Instagram, TikTok, WhatsApp, ChatGPT,
Telegram, Threads — e la lezione che danno non è estetica ma strutturale:
sono radicalmente ridotte. Quasi nessun colore, quasi nessuna cornice, un'azione
ovvia per schermata. Miliardi di persone sono già allenate a quella grammatica,
e per fortuna la riduzione è anche ciò che fa sembrare costosa una cosa.

## Rigenerare le icone

```bash
python3 strumenti/genera-icone.py
```

Ridisegna tutti i PNG di `public/` dal marchio. Se cambi i colori qui, cambiali
anche in `src/styles.css`, `public/favicon.svg` e `src/components/BrandMark.jsx`.
