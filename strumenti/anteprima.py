#!/usr/bin/env python3
"""Anteprima statica delle schermate, per poterle GUARDARE senza avviare Vite.

    pip install playwright && playwright install chromium
    python3 strumenti/anteprima.py          # le schermate per intero
    python3 strumenti/anteprima.py reali    # a 390x844, l'iPhone del brief

Il CSS è quello VERO (src/styles.css): quello che si vede qui è il vero
comportamento del design system. Il markup invece è ricopiato a mano dai
.jsx, quindi è un facsimile — se cambi un componente qui non cambia niente.

ATTENZIONE ALLA GEOMETRIA DELLA PIANTA: è riscritta in Python più sotto,
cioè è una SECONDA copia di quella in src/components/Pianta.jsx. Perché non
diverga in silenzio, verifica/redesign.mjs confronta le due tabelle STADI e
fallisce se non coincidono. Se tocchi una delle due, tocca anche l'altra.
"""
import math
import subprocess
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
CSS = (RADICE / 'src/styles.css').read_text(encoding='utf-8')

# ---------------------------------------------------------------- pianta
FOGLIA = 'M0 0 C7 -9 19 -12 28 -6 C21 3 8 6 0 0 Z'
SUOLO, CENTRO = 166, 80
STADI = [(0, 0, 0, False), (1, 36, 2, False), (3, 58, 3, False), (7, 82, 4, False),
         (14, 104, 5, False), (30, 126, 6, False), (90, 142, 7, True)]


def x_stelo(t):
    return CENTRO + math.sin(t * 2.4) * 3.4


def pianta(giorni, dim=210):
    st = STADI[0]
    for s in STADI:
        if giorni >= s[0]:
            st = s
    _, h, nf, fiore = st
    if h == 0:
        corpo = f'<ellipse cx="{CENTRO}" cy="{SUOLO - 5}" rx="7" ry="9" class="pianta-seme pianta-parte"/>'
    else:
        punti = ' L'.join(f'{x_stelo(i / 26):.1f},{SUOLO - h * i / 26:.1f}' for i in range(27))
        corpo = f'<path d="M{punti}" class="pianta-stelo pianta-parte"/>'
        t_min = 0.5 if nf <= 2 else 0.2
        t_max = 0.84 if fiore else 0.9
        for i in range(nf):
            passo = ((i / (nf - 1)) ** 1.15) if nf > 1 else 1
            t = t_min + passo * (t_max - t_min)
            verso = 1 if i % 2 == 0 else -1
            sc = 1.05 - t * 0.35
            rot = 26 - t * 58
            piena = ' pianta-foglia-piena' if nf > 4 and i < nf / 2 else ''
            corpo += (f'<path d="{FOGLIA}" class="pianta-foglia pianta-parte{piena}" '
                      f'transform="translate({x_stelo(t) - verso * 1.2:.1f} {SUOLO - h * t:.1f}) '
                      f'scale({verso * sc:.3f} {sc:.3f}) rotate({rot:.1f})"/>')
        if fiore:
            cx, cy = x_stelo(1), SUOLO - h - 4
            petali = ''.join(f'<ellipse cx="0" cy="-7" rx="4.6" ry="7.4" class="pianta-fiore" '
                             f'transform="rotate({a})"/>' for a in (0, 72, 144, 216, 288))
            corpo += (f'<g transform="translate({cx:.1f} {cy:.1f})">{petali}'
                      f'<circle cx="0" cy="0" r="3.4" class="pianta-fiore-cuore"/></g>')
    mezzo = 26 + h * 0.14
    return (f'<div class="pianta-wrap" style="height:{dim}px"><span class="pianta-luce"></span>'
            f'<svg class="pianta-svg" width="{dim}" height="{dim}" viewBox="0 0 160 180" fill="none">'
            f'<line x1="{CENTRO - mezzo:.0f}" y1="{SUOLO}" x2="{CENTRO + mezzo:.0f}" y2="{SUOLO}" class="pianta-terra"/>'
            f'<g class="pianta-dondolo">{corpo}</g></svg></div>')


# ---------------------------------------------------------------- icone
def ic(d, size=20, sw=1.9):
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" '
            f'stroke="currentColor" stroke-width="{sw}" stroke-linecap="round" '
            f'stroke-linejoin="round">{d}</svg>')


SOLE = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>'
GERMOGLIO = '<path d="M7 20h10M12 20c0-4 0-7 0-9"/><path d="M12 11c0-3 2-5 5-5 0 3-2 5-5 5zM12 14c0-3-2-5-5-5 0 3 2 5 5 5z"/>'
VENTO = '<path d="M12.8 19.6A2 2 0 1 0 14 16H2M17.5 8a2.5 2.5 0 1 1 2 4H2M9.6 4.6A2 2 0 1 1 11 8H2"/>'
UTENTE = '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'
PIU = '<path d="M12 5v14M5 12h14"/>'
CUORE = '<path d="M19 14c1.5-1.5 3-3.3 3-5.5A5.5 5.5 0 0 0 12 5 5.5 5.5 0 0 0 2 8.5c0 2.2 1.5 4 3 5.5l7 7Z"/>'
SPUNTA = '<path d="M20 6 9 17l-5-5"/>'
MESCOLA = '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>'
CHAT = '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.2a8.4 8.4 0 0 1 3.8-11.6 8.4 8.4 0 0 1 12.3 7.3Z"/>'
ANCORA = '<circle cx="12" cy="5" r="3"/><path d="M12 22V8M5 12H2a10 10 0 0 0 20 0h-3"/>'
BANDIERA = '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>'
FRECCIA = '<path d="m9 18 6-6-6-6"/>'
GRUPPO = '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/>'
SCINTILLA = '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>'
CHIUDI = '<path d="M18 6 6 18M6 6l12 12"/>'


def nav(attiva):
    voci = [('oggi', SOLE, 'Oggi'), ('percorso', GERMOGLIO, 'Percorso'),
            ('aiuto', VENTO, 'Aiuto'), ('profilo', UTENTE, 'Profilo')]
    out = ''
    for id_, d, lab in voci:
        cls = 'nav-item nav-item-attivo' if id_ == attiva else 'nav-item'
        badge = '<span class="nav-pallino">3</span>' if id_ == 'aiuto' else ''
        out += (f'<button class="{cls}"><span class="nav-icona">'
                f'{ic(d, 22, 2.3 if id_ == attiva else 1.8)}{badge}</span><span>{lab}</span></button>')
    return f'<nav class="bottom-nav">{out}</nav>'


# ---------------------------------------------------------------- schermate
OGGI = f'''
<div class="app-shell"><div class="screen">
  <header>
    <h1 class="oggi-saluto">Buongiorno, Federico 👋</h1>
    <p class="oggi-invito">Continua il tuo percorso · Quelli che smettono</p>
  </header>

  <div class="banner banner-pesca">
    <span class="banner-icona">{ic(SCINTILLA, 17)}</span>
    <div class="banner-corpo">
      <div class="banner-titolo">Torna il sapore</div>
      <p class="banner-testo">Due giorni: le terminazioni nervose ricrescono. Nei prossimi pasti sentirai la differenza.</p>
    </div>
    <button class="btn-icona">{ic(CHIUDI, 18)}</button>
  </div>

  <div class="oggi-eroe">
    <div class="oggi-eroe-num"><span class="cifra-eroe">12</span></div>
    <div class="etichetta oggi-eroe-label">giorni senza fumare</div>
    <p class="oggi-frase">Stai costruendo una nuova abitudine.</p>
  </div>

  {pianta(12, 210)}
  <p class="pianta-stadio">Piccola pianta</p>

  <button class="oggi-cifre">
    <span class="oggi-cifra"><span class="oggi-cifra-val num">186</span>
      <span class="oggi-cifra-lab">sigarette non fumate</span></span>
    <span class="oggi-cifra"><span class="oggi-cifra-val num">93,40 €</span>
      <span class="oggi-cifra-lab">risparmiati</span></span>
  </button>

  <div class="oggi-azioni">
    <button class="btn btn-primario btn-blocco">Come ti senti oggi?</button>
    <button class="btn btn-secondario btn-blocco">{ic(PIU, 19)} Ho fumato una sigaretta</button>
  </div>

  <div class="card card-tenue stacco">
    <h3 class="titolo-sezione">Le due settimane che contano</h3>
    <p class="testo-piccolo" style="margin-top:8px">È qui che avviene la maggior parte delle ricadute.
      Non è ancora automatico: continua a segnare.</p>
  </div>

  <p class="nota" style="text-align:center;margin-top:32px">Di questo passo, in un anno: 2.847 €.</p>

  <div class="motto"><span class="motto-testo">Non smettere mai di provare a smettere.</span>
    <span class="motto-coda">Se ricadi, riprova.</span></div>
</div></div>{nav('oggi')}'''

CRAVING = f'''
<div class="craving">
  <button class="btn-icona craving-chiudi">{ic(CHIUDI, 22)}</button>
  <div class="craving-corpo">
    <h1 class="craving-titolo">Hai voglia di fumare?</h1>
    <p class="craving-sub">Non devi superare tutta la giornata. Superiamo insieme questi prossimi minuti.</p>
    <div class="craving-scelte">
      <button class="craving-scelta"><span class="craving-scelta-icona">{ic(VENTO, 22)}</span>Respira con me</button>
      <button class="craving-scelta"><span class="craving-scelta-icona">{ic(ANCORA, 22)}</span>Aiutami a superarlo</button>
      <button class="craving-scelta"><span class="craving-scelta-icona">{ic(MESCOLA, 22)}</span>Distrai la mia attenzione</button>
      <button class="craving-scelta"><span class="craving-scelta-icona">{ic(CHAT, 22)}</span>Voglio parlarne</button>
    </div>
  </div>
  <div class="pila">
    <button class="btn btn-primario btn-blocco">Ce l'ho fatta</button>
    <button class="btn btn-testo btn-testo-tenue btn-testo-centro craving-cedi">Ho fumato lo stesso — registrala</button>
  </div>
</div>'''

RESPIRO = '''
<div class="respiro-schermo">
  <div class="respiro-cerchio-wrap">
    <span class="respiro-alone" style="transform:scale(1)"></span>
    <span class="respiro-cerchio" style="transform:scale(1)"></span>
    <div class="respiro-dentro">
      <div class="respiro-fase">Inspira</div>
      <div class="respiro-conta num">3</div>
    </div>
  </div>
  <p class="respiro-cicli num">4 respiri completi</p>
  <div class="respiro-fine pila">
    <button class="btn btn-primario btn-blocco">Sto meglio</button>
    <button class="btn btn-testo btn-testo-tenue btn-testo-centro">Ho fumato lo stesso — registrala</button>
  </div>
</div>'''

RICADUTA = f'''
<div class="ricaduta">
  <div class="ricaduta-corpo">
    <h1 class="ricaduta-titolo">Va bene.<br>Ripartiamo da qui.</h1>
    <p class="ricaduta-sub">Quei 12 giorni non sono andati persi.</p>
    <div class="ricaduta-tenuto">
      {pianta(20, 92)}
      <div class="card-riga-corpo">
        <div class="ricaduta-tenuto-val num">12g 4h</div>
        <div class="ricaduta-tenuto-lab">è quanto sei riuscito a stare senza. Il tuo percorso è al giorno 21 e da lì continua.</div>
      </div>
    </div>
    <p class="ricaduta-frase">Quei giorni non sono andati persi. Sono già dentro di te.</p>
    <div class="ricaduta-domanda">
      <h2 class="titolo-sezione">Cosa è successo?</h2>
      <p class="testo-piccolo" style="margin:8px 0 16px">Saperlo serve: torna fuori nel Percorso e diventa il se–allora da scrivere.</p>
      <div class="pastiglie">
        <button class="pastiglia pastiglia-on">stress</button><button class="pastiglia">noia</button>
        <button class="pastiglia">alcol</button><button class="pastiglia">con altri</button>
        <button class="pastiglia">abitudine</button><button class="pastiglia">ansia</button>
        <button class="pastiglia">dopo mangiato</button><button class="pastiglia">preferisco non dirlo</button>
      </div>
    </div>
    <p class="ricaduta-conta">È la 3ª volta che riparti. Chi smette davvero ci prova in media più volte:
      ogni tentativo conta, compreso questo.</p>
  </div>
  <div class="ricaduta-azioni"><button class="btn btn-primario btn-blocco">Riparto adesso</button></div>
</div>'''

PERCORSO = f'''
<div class="app-shell"><div class="screen">
  <h1 class="titolo-schermata">Il tuo percorso</h1>
  <div class="segmenti">
    <button class="segmento segmento-on">Traguardi</button>
    <button class="segmento">Numeri</button>
    <button class="segmento">Registro</button>
  </div>
  {pianta(12, 190)}
  <p class="testo" style="text-align:center;margin-top:4px">Giorno 13 del tuo percorso. Questa cresce
    coi giorni, e non torna mai indietro — nemmeno dopo una ricaduta.</p>

  <div class="card stacco">
    <div class="traguardo">
      <span class="traguardo-icona">{ic(BANDIERA, 20)}</span>
      <div class="card-riga-corpo">
        <div class="etichetta">Sigaretta zero prevista</div>
        <div class="traguardo-data">4 novembre 2026</div>
        <div class="testo-piccolo num" style="margin-top:4px">tra 9 settimane, se tieni questo passo</div>
      </div>
    </div>
    <div class="piano-lista">
      <div class="piano-riga piano-ora"><span class="piano-n num">S3</span><span class="piano-data">1 set</span>
        <div class="piano-barra"><div class="piano-barra-fill" style="width:78%"></div></div><span class="piano-val num">9,4</span></div>
      <div class="piano-riga"><span class="piano-n num">S4</span><span class="piano-data">8 set</span>
        <div class="piano-barra"><div class="piano-barra-fill" style="width:66%"></div></div><span class="piano-val num">8,0</span></div>
      <div class="piano-riga"><span class="piano-n num">S5</span><span class="piano-data">15 set</span>
        <div class="piano-barra"><div class="piano-barra-fill" style="width:56%"></div></div><span class="piano-val num">6,8</span></div>
      <div class="piano-riga"><span class="piano-n num">S6</span><span class="piano-data">22 set</span>
        <div class="piano-barra"><div class="piano-barra-fill" style="width:47%"></div></div><span class="piano-val num">5,8</span></div>
    </div>
    <p class="nota">Ogni settimana togli il 15% alla media della precedente. Il piano si ricalcola
      sui numeri veri, non su questa previsione.</p>
  </div>

  <h2 class="titolo-sezione stacco">Cosa sta recuperando il corpo</h2>
  <p class="testo-piccolo" style="margin-top:8px">Il conto riparte da ogni sigaretta. Sei a 12g 4h dall'ultima.</p>
  <ol class="timeline" style="list-style:none;padding:0 0 0 34px;margin:0">
    <li class="tappa tappa-ok"><span class="tappa-punto">{ic(SPUNTA, 11, 3.4)}</span>
      <div class="tappa-quando">20 min</div><h3 class="tappa-titolo">Battito e pressione</h3>
      <p class="tappa-testo">Tornano ai valori che avevi prima di accendere.</p></li>
    <li class="tappa tappa-ok"><span class="tappa-punto">{ic(SPUNTA, 11, 3.4)}</span>
      <div class="tappa-quando">3 giorni</div><h3 class="tappa-titolo">Respiro</h3>
      <p class="tappa-testo">I bronchi si rilassano. È anche il picco dell'astinenza: da qui in poi cala.</p></li>
    <li class="tappa tappa-ora"><span class="tappa-punto"></span>
      <div class="tappa-quando">14 giorni</div><h3 class="tappa-titolo">Circolazione</h3>
      <p class="tappa-testo">Camminare e fare le scale costa meno fatica.</p>
      <div class="tappa-barra"><div class="barra barra-sottile"><div class="barra-fill" style="width:82%"></div></div></div>
      <div class="tappa-manca num">tra 1g 20h</div></li>
    <li class="tappa tappa-futura"><span class="tappa-punto"></span>
      <div class="tappa-quando">3 mesi</div><h3 class="tappa-titolo">Polmoni</h3></li>
    <li class="tappa tappa-futura"><span class="tappa-punto"></span>
      <div class="tappa-quando">1 anni</div><h3 class="tappa-titolo">Un anno</h3></li>
  </ol>
</div></div>{nav('percorso')}'''

AIUTO = f'''
<div class="app-shell"><div class="screen">
  <h1 class="titolo-schermata">Aiuto</h1>
  <p class="sotto-schermata">Non devi superare tutta la giornata. Solo i prossimi minuti.</p>
  <div class="pila">
    <button class="aiuto-grande"><span class="aiuto-grande-icona">{ic(CUORE, 24)}</span>
      <span class="card-riga-corpo"><span class="aiuto-grande-titolo" style="display:block">Ho voglia di fumare</span>
      <span class="aiuto-grande-sub" style="display:block">Superiamo insieme questo momento</span></span>
      <span style="color:var(--t2)">{ic(FRECCIA, 20)}</span></button>
    <button class="aiuto-grande"><span class="aiuto-grande-icona">{ic(VENTO, 24)}</span>
      <span class="card-riga-corpo"><span class="aiuto-grande-titolo" style="display:block">Respira con me</span>
      <span class="aiuto-grande-sub" style="display:block">Due minuti, solo il respiro</span></span>
      <span style="color:var(--t2)">{ic(FRECCIA, 20)}</span></button>
  </div>

  <h2 class="titolo-sezione stacco">Chi ci sta provando con te</h2>
  <button class="card card-tocco" style="margin-top:12px">
    <div class="card-riga"><span class="banner-icona" style="background:var(--verde-velo)">{ic(GRUPPO, 17)}</span>
      <span class="card-riga-corpo"><span class="banner-titolo" style="display:block">Quelli che smettono</span>
      <span class="banner-testo" style="display:block">Classifica, attività e codice invito</span></span>
      <span class="nav-pallino" style="position:static">3</span>
      <span style="color:var(--t2)">{ic(FRECCIA, 20)}</span></div>
  </button>

  <h2 class="titolo-sezione stacco">Perché lo stai facendo</h2>
  <button class="card card-tocco card-tenue" style="margin-top:12px">
    <p style="font-size:19px;font-weight:700;line-height:1.4;margin:0;color:var(--t1)">“Voglio rincorrere mio figlio senza fermarmi”</p>
    <span class="nota" style="display:block">Tocca per cambiarlo</span>
  </button>

  <h2 class="titolo-sezione stacco">I tuoi se–allora</h2>
  <p class="testo-piccolo" style="margin-top:8px">Decidere prima cosa farai al posto della sigaretta funziona
    molto meglio che resistere sul momento.</p>
  <div class="piano-se">
    <div class="piano-se-riga"><div class="piano-se-trigger">se stress</div>
      <button class="piano-se-valore">allora esco a fare due passi</button></div>
    <div class="piano-se-riga"><div class="piano-se-trigger">se noia</div>
      <button class="piano-se-valore"><span class="piano-se-nulla">tocca per scriverlo</span></button></div>
    <div class="piano-se-riga"><div class="piano-se-trigger">se alcol</div>
      <button class="piano-se-valore"><span class="piano-se-nulla">tocca per scriverlo</span></button></div>
  </div>

  <div class="card stacco">
    <h2 class="titolo-sezione">Non sei obbligato a farlo a mani nude</h2>
    <p class="testo-piccolo" style="margin-top:10px">Cerotti, gomme e farmaci su prescrizione raddoppiano
      le probabilità di riuscirci rispetto alla sola forza di volontà. Usare un aiuto non è barare.</p>
    <div class="numero-verde"><span class="banner-icona">{ic(CHAT, 17)}</span>
      <div class="card-riga-corpo"><div class="numero-verde-cifra num">800 554 088</div>
      <div class="testo-piccolo">Telefono Verde contro il Fumo · gratuito</div></div></div>
  </div>
</div></div>{nav('aiuto')}'''

ONBOARDING = f'''
<div class="app-shell"><div class="screen onb">
  <div class="onb-passi"><span class="onb-passo onb-passo-on"></span><span class="onb-passo onb-passo-on"></span>
    <span class="onb-passo"></span><span class="onb-passo"></span><span class="onb-passo"></span></div>
  <div class="onb-corpo">
    <h1 class="titolo-schermata">Perché vuoi smettere?</h1>
    <p class="sotto-schermata">Te lo rimetto davanti agli occhi nel momento in cui starai per accendere.</p>
    <div class="onb-scelte">
      <button class="onb-scelta"><span class="onb-scelta-icona">🫁</span>Per la salute</button>
      <button class="onb-scelta"><span class="onb-scelta-icona">💶</span>Per i soldi</button>
      <button class="onb-scelta onb-scelta-on"><span class="onb-scelta-icona">🏠</span>Per la famiglia</button>
      <button class="onb-scelta"><span class="onb-scelta-icona">🕊️</span>Per la libertà</button>
      <button class="onb-scelta"><span class="onb-scelta-icona">🏃</span>Per lo sport</button>
      <button class="onb-scelta"><span class="onb-scelta-icona">✍️</span>Un altro motivo</button>
    </div>
    <div class="campo" style="margin-top:24px">
      <label class="campo-label">Scrivilo come lo diresti a voce</label>
      <input class="campo-input" value="Per le persone con cui vivo.">
    </div>
  </div>
  <div class="onb-piede pila">
    <button class="btn btn-primario btn-blocco">Continua</button>
    <button class="btn btn-testo btn-testo-tenue btn-testo-centro">Lo faccio dopo</button>
  </div>
</div></div>'''

UMORE = f'''
<div class="app-shell"><div class="screen" style="filter:blur(0)">
  <header><h1 class="oggi-saluto">Buongiorno, Federico 👋</h1>
  <p class="oggi-invito">Continua il tuo percorso.</p></header>
  <div class="oggi-eroe"><div class="oggi-eroe-num"><span class="cifra-eroe">12</span></div>
  <div class="etichetta oggi-eroe-label">giorni senza fumare</div></div>
  {pianta(12, 180)}
</div></div>
<div class="umore-velo"><div class="umore-foglio">
  <div class="umore-maniglia"></div>
  <h2 class="titolo-schermata" style="margin-bottom:0">Come ti senti oggi?</h2>
  <p class="testo" style="margin-top:8px">Non c'è una risposta giusta. Serve solo a capire cosa ti serve adesso.</p>
  <div class="umore-lista">
    <button class="umore-scelta"><span class="umore-faccia">🙂</span><span class="card-riga-corpo">
      <span class="umore-testo">Sto bene</span><span class="umore-sub" style="display:block">Oggi non è un problema</span></span></button>
    <button class="umore-scelta"><span class="umore-faccia">😐</span><span class="card-riga-corpo">
      <span class="umore-testo">Così così</span><span class="umore-sub" style="display:block">Ci penso, ma tengo</span></span></button>
    <button class="umore-scelta"><span class="umore-faccia">😣</span><span class="card-riga-corpo">
      <span class="umore-testo">Ho voglia di fumare</span><span class="umore-sub" style="display:block">Superiamo insieme i prossimi minuti</span></span></button>
    <button class="umore-scelta"><span class="umore-faccia">😔</span><span class="card-riga-corpo">
      <span class="umore-testo">Sto facendo fatica</span><span class="umore-sub" style="display:block">Vediamo cosa può aiutarti adesso</span></span></button>
  </div>
  <button class="btn btn-testo btn-testo-tenue btn-testo-centro" style="margin-top:12px">Non adesso</button>
</div></div>'''

SCHERMATE = [('Oggi', OGGI), ('Come ti senti', UMORE), ('Craving', CRAVING), ('Respiro', RESPIRO),
             ('Ricaduta', RICADUTA), ('Percorso', PERCORSO), ('Aiuto', AIUTO), ('Onboarding', ONBOARDING)]


def pagina(indici, altezza=880):
    telefoni = ''
    for i in indici:
        nome, corpo = SCHERMATE[i]
        telefoni += (f'<div class="riquadro"><div class="etichetta-anteprima">{nome}</div>'
                     f'<div class="page-bg" style="height:{altezza}px;width:390px">'
                     f'<div class="phone-frame" style="height:{altezza}px">{corpo}</div></div></div>')
    return f'''<!doctype html><html lang="it"><head><meta charset="utf-8"><style>
{CSS}
body {{ background:#DFE3DC; margin:0; padding:28px; font-family:var(--font); }}
.fila {{ display:flex; gap:26px; align-items:flex-start; }}
.riquadro {{ }}
.page-bg {{ border-radius:22px; overflow:hidden;
  box-shadow:0 18px 50px -18px rgba(24,49,44,.4); }}

.app-shell {{ overflow-y:auto; }}
.etichetta-anteprima {{ font-size:12px; font-weight:700; letter-spacing:.12em;
  text-transform:uppercase; color:#4A5A55; margin:0 0 10px 4px; }}
.pianta-dondolo {{ animation:none; }}
.pianta-parte {{ animation:none; }}
.screen {{ animation:none; }}
.banner, .toast, .modale, .umore-foglio, .craving, .ricaduta, .respiro-schermo {{ animation:none; }}
</style></head><body><div class="fila">{telefoni}</div></body></html>'''


def scatta(indici, uscita, altezza=880):
    html = Path('/tmp/anteprima.html')
    html.write_text(pagina(indici, altezza), encoding='utf-8')
    larghezza = 28 * 2 + len(indici) * 390 + (len(indici) - 1) * 26
    subprocess.run(['python3', '-c', f'''
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={{"width": {larghezza}, "height": {altezza + 90}}},
                    device_scale_factor=2)
    pg.goto("file:///tmp/anteprima.html")
    pg.wait_for_timeout(400)
    pg.screenshot(path="{uscita}", full_page=True)
    b.close()
'''], check=True)
    print(uscita)


if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == 'reali':
        # 390x844: l'iPhone su cui il brief chiede di ottimizzare
        scatta([2, 3, 4, 7], 'anteprima-390x844.png', 844)
    else:
        scatta([0, 1, 2], 'anteprima-1.png', 1500)
        scatta([3, 4, 5], 'anteprima-2.png', 1500)
        scatta([6, 7], 'anteprima-3.png', 1500)
