"""Iconos de Maven (favicon, PWA, iOS): la M de cinta verde sobre azul marino.

La M es la de src/components/MarcaM.tsx (logo nuevo que trajo Alvaro el
16/11/2026): dos «Λ» de trazo grueso con puntas redondas, en una caja de
96 x 56. Las SUBIDAS van en el verde de la marca y las BAJADAS, debajo, con un
pliegue que arranca en un verde más hondo junto a la cima y se aclara hacia el
pie. Fondo: azul marino oficial con un degradado suave.

Se dibuja a 8x y se reduce con LANCZOS, así queda suave a 16 px igual que a 512.
El favicon lleva baldosa redondeada; los iconos de celular van a sangre (el
sistema les pone su propia máscara, y una esquina transparente sale negra).

Uso:  python3 frontend/scripts/genera-iconos.py            (escribe en frontend/public)
      python3 frontend/scripts/genera-iconos.py /otra/carpeta
Requiere Pillow y numpy.
"""
from PIL import Image, ImageDraw
import numpy as np, sys, os

AQUI = os.path.dirname(os.path.abspath(__file__))
DEST = sys.argv[1] if len(sys.argv) > 1 else os.path.join(AQUI, "..", "public")

VERDE = (79, 216, 141)        # #4fd88d, el de los botones de la portada
HONDO = (42, 154, 92)         # #2a9a5c, el pliegue
FONDO0 = (24, 35, 58)         # arriba-izquierda
FONDO1 = (12, 18, 29)         # abajo-derecha (#0c121d)
RADIO = 0.22                  # radio de la baldosa del favicon, fracción del lado

# La M en su caja de 96 x 56 (igual que MarcaM.tsx).
M_W, M_H, M_SW = 96.0, 56.0, 16.0
SUBIDAS = (((10, 46), (29, 10)), ((48, 46), (67, 10)))
BAJADAS = (((29, 10), (48, 46)), ((67, 10), (86, 46)))
PLIEGUE_HASTA = 0.6           # el verde hondo se aclara hasta el 60% de la bajada


def fondo(w, h, redondo=False, ss=8):
    big_w, big_h = w * ss, h * ss
    yy, xx = np.mgrid[0:big_h, 0:big_w]
    t = ((xx + .5) / big_w + (yy + .5) / big_h) / 2
    img = np.zeros((big_h, big_w, 4), np.uint8)
    for c in range(3):
        img[:, :, c] = np.clip(FONDO0[c] + (FONDO1[c] - FONDO0[c]) * t, 0, 255)
    img[:, :, 3] = 255
    im = Image.fromarray(img)
    if redondo:
        mask = Image.new("L", (big_w, big_h), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, big_w - 1, big_h - 1], radius=RADIO * min(big_w, big_h), fill=255)
        im.putalpha(mask)
    return im


def _trazo(size, a, b, w):
    capa = Image.new("L", size, 0)
    d = ImageDraw.Draw(capa)
    d.line([a, b], fill=255, width=int(round(w)))
    for p in (a, b):
        d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=255)
    return capa


def pinta_m(img, cx, cy, alto):
    """Dibuja la M centrada en (cx, cy) con `alto` = alto de la caja de 96 x 56.
    `img` es RGBA y ya está a la resolución final de trabajo (sin reducir)."""
    esc = alto / M_H
    x0, y0 = cx - M_W * esc / 2, cy - alto / 2
    P = lambda p: (x0 + p[0] * esc, y0 + p[1] * esc)
    w = M_SW * esc
    W, H = img.size

    for a, b in BAJADAS:
        pa, pb = P(a), P(b)
        mask = _trazo((W, H), pa, pb, w)
        yy, xx = np.mgrid[0:H, 0:W]
        vx, vy = pb[0] - pa[0], pb[1] - pa[1]
        t = ((xx - pa[0]) * vx + (yy - pa[1]) * vy) / (vx * vx + vy * vy)
        t = np.clip(t / PLIEGUE_HASTA, 0, 1)
        col = np.zeros((H, W, 4), np.uint8)
        for c in range(3):
            col[:, :, c] = np.clip(HONDO[c] + (VERDE[c] - HONDO[c]) * t, 0, 255)
        col[:, :, 3] = np.array(mask)
        img.alpha_composite(Image.fromarray(col))

    for a, b in SUBIDAS:
        mask = _trazo((W, H), P(a), P(b), w)
        capa = Image.new("RGBA", (W, H), VERDE + (255,))
        capa.putalpha(mask)
        img.alpha_composite(capa)
    return img


def icono(size, redondo, ancho_m, ss=8):
    """`ancho_m`: ancho de la M como fracción del lado del icono."""
    big = size * ss
    im = fondo(size, size, redondo, ss)
    alto = ancho_m * big * M_H / M_W
    pinta_m(im, big / 2, big / 2, alto)
    return im.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    frames = [icono(s, True, 0.70) for s in (16, 32, 48, 64, 128, 256)]
    frames[-1].save(os.path.join(DEST, "favicon.ico"), format="ICO",
                    sizes=[f.size for f in frames], append_images=frames[:-1])
    # A sangre y con margen: Android recorta los «maskable» a un círculo del 80%.
    icono(192, False, 0.58).save(os.path.join(DEST, "icon-192.png"))
    icono(512, False, 0.58).save(os.path.join(DEST, "icon-512.png"))
    icono(180, False, 0.60).save(os.path.join(DEST, "apple-touch-icon.png"))
    print("iconos escritos en", os.path.abspath(DEST))
