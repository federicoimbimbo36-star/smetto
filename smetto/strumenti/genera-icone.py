#!/usr/bin/env python3
"""
Genera le icone PNG dell'app a partire dal disegno di public/favicon.svg.

Perché uno script e non i file "e basta": le icone sono cinque, in quattro
misure, e prima o poi il logo cambia. Con lo script si rifanno tutte in un
comando e restano identiche fra loro; a mano, dopo il primo ritocco, non lo
sono più.

    python3 strumenti/genera-icone.py

Serve Pillow:  pip install Pillow
"""

from PIL import Image, ImageDraw

# Il disegno è definito su una griglia 64x64, la stessa del favicon SVG.
GRIGLIA = 64
FONDO = (14, 13, 11)           # #0E0D0B — il nero caldo del sistema
OSSO = (242, 237, 228)         # #F2EDE4
BRACE = (240, 162, 60)         # #F0A23C
BRACE_PROF = (201, 106, 30)    # #C96A1E

# Si disegna a 8x e poi si rimpicciolisce: è il modo più semplice per avere
# bordi lisci senza dipendere da un rasterizzatore SVG.
SUPER = 8


def disegna(lato, angoli_tondi=True, scala_contenuto=1.0, monocromatico=False):
    """Un'icona quadrata di `lato` pixel.

    Il marchio: una sigaretta vista di taglio, sottile come le tacche che
    l'app usa per contare, e sopra la brace staccata — che nel linguaggio
    dell'app non è più la sigaretta accesa ma la luce che resta a te.

    scala_contenuto < 1 lascia margine attorno al disegno: serve alle icone
    "maskable" di Android, che vengono ritagliate a cerchio dal launcher.
    """
    L = lato * SUPER
    img = Image.new("RGBA", (L, L), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if monocromatico:
        osso = brace = profonda = (255, 255, 255, 255)
        fondo = None
    else:
        osso, brace, profonda, fondo = OSSO, BRACE, BRACE_PROF, FONDO

    if fondo is not None:
        if angoli_tondi:
            d.rounded_rectangle([0, 0, L - 1, L - 1], radius=int(14 / GRIGLIA * L), fill=fondo)
        else:
            d.rectangle([0, 0, L - 1, L - 1], fill=fondo)

    margine = (1 - scala_contenuto) / 2
    u = L * scala_contenuto / GRIGLIA

    def p(x, y):
        return (margine * L + x * u, margine * L + y * u)

    def rett(x, y, w, h, r, colore):
        x0, y0 = p(x, y)
        x1, y1 = p(x + w, y + h)
        d.rounded_rectangle([x0, y0, x1, y1], radius=r * u, fill=colore)

    def cerchio(cx, cy, r, colore, strato=None):
        bersaglio = d if strato is None else ImageDraw.Draw(strato)
        c = p(cx, cy)
        rr = r * u
        bersaglio.ellipse([c[0] - rr, c[1] - rr, c[0] + rr, c[1] + rr], fill=colore)

    # ATTENZIONE, lezione imparata: la prima versione metteva la sigaretta
    # in verticale con la brace sopra. Composta così leggeva come un punto
    # esclamativo — il segnale d'allarme, esattamente il contrario di quello
    # che quest'app vuole dire a chi la apre. In orizzontale la sigaretta si
    # riconosce subito e la brace resta l'unica luce.

    # l'alone attorno alla brace: cerchi concentrici sempre più trasparenti,
    # composti a parte per non sporcare il fondo
    if fondo is not None:
        alone = Image.new("RGBA", (L, L), (0, 0, 0, 0))
        passi = 26
        for i in range(passi, 0, -1):
            raggio = 5.5 + (i / passi) * 10
            alfa = int(11 * (1 - i / passi) ** 1.6)
            if alfa > 0:
                cerchio(15, 32, raggio, brace + (alfa,), alone)
        img = Image.alpha_composite(img, alone)
        d = ImageDraw.Draw(img)

    # la brace, all'estremità accesa
    cerchio(15, 32, 5.5, brace)
    # la sigaretta: corpo chiaro, filtro più scuro dalla parte del bocchino
    rett(22, 29, 28, 6, 3, osso)
    rett(41, 29, 9, 6, 3, profonda)

    return img.resize((lato, lato), Image.LANCZOS)


DA_FARE = [
    # file,                      lato, angoli tondi, scala, monocromatico
    ("public/icon-192.png",       192, True,  1.0, False),
    ("public/icon-512.png",       512, True,  1.0, False),
    # Android ritaglia a cerchio: il disegno sta nel 62% centrale
    ("public/icon-maskable.png",  512, False, 0.62, False),
    # iOS applica da solo la maschera agli angoli: qui vanno quadrati
    ("public/apple-touch-icon.png", 180, False, 1.0, False),
    ("public/badge.png",           96, False, 1.0, True),
]

if __name__ == "__main__":
    for nome, lato, tondi, scala, mono in DA_FARE:
        disegna(lato, tondi, scala, mono).save(nome)
        print(f"  {nome}  {lato}x{lato}")
    print("\nFatto.")
