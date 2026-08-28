#!/usr/bin/env python3
"""
Genera le icone PNG dell'app a partire dal marchio Germoglio.

Perché uno script e non i file "e basta": le icone sono cinque, in quattro
misure, e prima o poi il logo cambia. Con lo script si rifanno tutte in un
comando e restano identiche fra loro; a mano, dopo il primo ritocco, non lo
sono più.

    python3 strumenti/genera-icone.py

Serve Pillow:  pip install Pillow

NOTA SUL DISEGNO
Il marchio precedente era una sigaretta con la brace accesa. Un'app che
aiuta a smettere di fumare non ha motivo di tenere una sigaretta come icona
sulla schermata Home: è la cosa da cui ci si sta allontanando, e la si
guarda venti volte al giorno. Adesso è un germoglio a due foglie — la
stessa identica forma di foglia disegnata da src/components/Pianta.jsx,
così il marchio e l'illustrazione dentro l'app parlano la stessa lingua.
"""

from PIL import Image, ImageDraw

# Il disegno è definito su una griglia 64x64, la stessa del favicon SVG.
GRIGLIA = 64
VERDE = (40, 107, 90)          # #286B5A — il colore del percorso
CREMA = (247, 248, 244)        # #F7F8F4
# la foglia dietro è la stessa crema più trasparente: due tinte diverse
# sporcavano il marchio, l'opacità dà profondità senza aggiungere colore
VELO = (247, 248, 244, 168)

# Si disegna a 8x e poi si rimpicciolisce: è il modo più semplice per avere
# bordi lisci senza dipendere da un rasterizzatore SVG.
SUPER = 8

# La foglia, identica al path di Pianta.jsx:
#   M0 0 C7 -9 19 -12 28 -6 C21 3 8 6 0 0 Z
FOGLIA = [
    ((0, 0), (7, -9), (19, -12), (28, -6)),
    ((28, -6), (21, 3), (8, 6), (0, 0)),
]

# Lo stelo, come curva cubica dalla base alla cima.
STELO = ((32, 54), (30.2, 44), (31, 31), (32.4, 19))


def cubica(p0, p1, p2, p3, passi=24):
    """Campiona una curva di Bézier cubica. Pillow non le disegna da sola."""
    punti = []
    for i in range(passi + 1):
        t = i / passi
        u = 1 - t
        x = u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0]
        y = u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]
        punti.append((x, y))
    return punti


PUNTI_STELO = cubica(*STELO, passi=80)


def steloA(y):
    """La x dello stelo all'altezza y: serve ad attaccarci le foglie.
    Senza questo le foglie galleggiavano staccate di due pixel — poco, ma
    a 192px si vede benissimo e il marchio sembra rotto."""
    return min(PUNTI_STELO, key=lambda q: abs(q[1] - y))[0]


def foglia(y, scala, verso):
    """La foglia attaccata allo stelo all'altezza y. verso=-1 la specchia."""
    # mezzo pixel dentro lo stelo: si sovrappongono, non si sfiorano
    cx = steloA(y) - 0.6 * verso
    return [
        (cx + x * scala * verso, y + y2 * scala)
        for seg in FOGLIA for x, y2 in cubica(*seg)
    ]


def disegna(lato, angoli_tondi=True, scala_contenuto=1.0, monocromatico=False):
    """Un'icona quadrata di `lato` pixel.

    scala_contenuto < 1 lascia margine attorno al disegno: serve alle icone
    "maskable" di Android, che vengono ritagliate a cerchio dal launcher.
    """
    L = lato * SUPER
    img = Image.new("RGBA", (L, L), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if monocromatico:
        # il badge delle notifiche: una silhouette bianca, niente fondo
        pianta = retro = (255, 255, 255, 255)
        fondo = None
    else:
        pianta, retro, fondo = CREMA, VELO, VERDE

    if fondo is not None:
        if angoli_tondi:
            d.rounded_rectangle([0, 0, L - 1, L - 1], radius=int(14 / GRIGLIA * L), fill=fondo)
        else:
            d.rectangle([0, 0, L - 1, L - 1], fill=fondo)

    margine = (1 - scala_contenuto) / 2
    u = L * scala_contenuto / GRIGLIA

    def p(x, y):
        return (margine * L + x * u, margine * L + y * u)

    # Si disegna su un livello a parte e poi si centra sul suo ingombro
    # reale: a occhio il marchio risultava spostato in basso a destra,
    # perché le foglie non sono simmetriche e il baricentro non sta dove
    # sembra. Così il centraggio è misurato, non stimato.
    livello = Image.new("RGBA", (L, L), (0, 0, 0, 0))
    dl = ImageDraw.Draw(livello)

    # foglia dietro: a sinistra, più in basso, più piccola
    dl.polygon([p(x, y) for x, y in foglia(38, 0.70, -1)], fill=retro)
    # Lo stelo, timbrando un cerchio lungo la curva invece di usare
    # d.line(width=…): con ottanta segmenti corti Pillow lascia delle
    # tacche visibili sui giunti, e a 512px si vedono benissimo. Il
    # pennello dà anche i capi arrotondati gratis.
    r = 1.75 * u
    for x, y in cubica(*STELO, passi=420):
        c = p(x, y)
        dl.ellipse([c[0] - r, c[1] - r, c[0] + r, c[1] + r], fill=pianta)
    # foglia davanti: a destra, più in alto, più grande
    dl.polygon([p(x, y) for x, y in foglia(28, 0.80, 1)], fill=pianta)

    ingombro = livello.getbbox()
    if ingombro:
        ritaglio = livello.crop(ingombro)
        dx = (L - ritaglio.width) // 2
        dy = (L - ritaglio.height) // 2
        centrato = Image.new("RGBA", (L, L), (0, 0, 0, 0))
        centrato.paste(ritaglio, (dx, dy))
        livello = centrato

    img = Image.alpha_composite(img, livello)
    return img.resize((lato, lato), Image.LANCZOS)


DA_FARE = [
    # file,                        lato, angoli tondi, scala, monocromatico
    ("public/icon-192.png",         192, True,  1.0, False),
    ("public/icon-512.png",         512, True,  1.0, False),
    # Android ritaglia a cerchio: il disegno sta nel 62% centrale
    ("public/icon-maskable.png",    512, False, 0.62, False),
    # iOS applica da solo la maschera agli angoli: qui va quadrata
    ("public/apple-touch-icon.png", 180, False, 1.0, False),
    ("public/badge.png",             96, False, 1.0, True),
]

if __name__ == "__main__":
    for nome, lato, tondi, scala, mono in DA_FARE:
        disegna(lato, tondi, scala, mono).save(nome)
        print(f"  {nome}  {lato}x{lato}")
    print("\nFatto.")
