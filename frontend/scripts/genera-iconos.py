"""Iconos de Maven (favicon, PWA, iOS): la M de cinta verde sobre azul marino.

La M es la de src/components/MarcaM.tsx: la «M de cinta» de la imagen que
trajo Alvaro el 16/11/2026, medida píxel a píxel (caja de 336 x 158, trazo 68).
Cada «Λ» es una cinta: la SUBIDA, clara, sube desde el pie, pasa por la cima y
baja un poco; la BAJADA va encima, arranca con su punta redonda en sombra (el
pliegue) y se aclara hacia el pie. La subida del segundo «Λ» tapa el pie de la
primera bajada. Fondo: azul marino oficial con un degradado suave.

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

VERDE = (79, 216, 141)        # #4fd88d, el de los botones
HONDO = (36, 124, 79)         # #247c4f, el pliegue (misma proporción que la imagen original)
FIN = (71, 194, 127)          # #47c27f, el pie de la bajada
FONDO0 = (24, 35, 58)         # arriba-izquierda
FONDO1 = (12, 18, 29)         # abajo-derecha (#0c121d)
RADIO = 0.22                  # radio de la baldosa del favicon, fracción del lado

# La M en su caja de 336 x 158 (igual que MarcaM.tsx).
M_W, M_H, R = 336.0, 158.0, 34.0
CINTAS = (
    ((34, 124), (99, 34), (142, 90), (168, 124)),     # pie, cima, punta de la bajada, fin
    ((168, 124), (233, 34), (276, 90), (302, 124)),
)
SOMBRA = np.array([1.0, 0.45]) / np.hypot(1.0, 0.45)   # hacia dónde se aclara el pliegue
LARGO_SOMBRA = 2.6 * R


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


def _cinta(size, puntos, w):
    capa = Image.new("L", size, 0)
    d = ImageDraw.Draw(capa)
    d.line(puntos, fill=255, width=int(round(w)), joint="curve")
    for p in puntos:
        d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=255)
    return capa


def pinta_m(img, cx, cy, alto):
    """Dibuja la M centrada en (cx, cy); `alto` es el alto de la caja de 336 x 158.
    `img` es RGBA y ya está a la resolución de trabajo (sin reducir)."""
    esc = alto / M_H
    x0, y0 = cx - M_W * esc / 2, cy - alto / 2
    P = lambda p: (x0 + p[0] * esc, y0 + p[1] * esc)
    w = 2 * R * esc
    W, H = img.size
    yy, xx = np.mgrid[0:H, 0:W]
    for pie, cima, punta, fin in CINTAS:
        subida = _cinta((W, H), [P(pie), P(cima), P(punta)], w)
        capa = Image.new("RGBA", (W, H), VERDE + (255,))
        capa.putalpha(subida)
        img.alpha_composite(capa)

        bajada = _cinta((W, H), [P(punta), P(fin)], w)
        g0 = np.array(P(punta)) - R * esc * SOMBRA
        t = np.clip(((xx - g0[0]) * SOMBRA[0] + (yy - g0[1]) * SOMBRA[1]) / (LARGO_SOMBRA * esc), 0, 1) ** 0.75
        col = np.zeros((H, W, 4), np.uint8)
        for c in range(3):
            col[:, :, c] = np.clip(HONDO[c] + (FIN[c] - HONDO[c]) * t, 0, 255)
        col[:, :, 3] = np.array(bajada)
        img.alpha_composite(Image.fromarray(col))
    return img


def icono(size, redondo, ancho_m, ss=8):
    """`ancho_m`: ancho de la M como fracción del lado del icono."""
    big = size * ss
    im = fondo(size, size, redondo, ss)
    alto = ancho_m * big * M_H / M_W
    pinta_m(im, big / 2, big / 2, alto)
    return im.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    frames = [icono(s, True, 0.78) for s in (16, 32, 48, 64, 128, 256)]
    frames[-1].save(os.path.join(DEST, "favicon.ico"), format="ICO",
                    sizes=[f.size for f in frames], append_images=frames[:-1])
    # A sangre y con margen: Android recorta los «maskable» a un círculo del 80%.
    icono(192, False, 0.68).save(os.path.join(DEST, "icon-192.png"))
    icono(512, False, 0.68).save(os.path.join(DEST, "icon-512.png"))
    icono(180, False, 0.70).save(os.path.join(DEST, "apple-touch-icon.png"))
    print("iconos escritos en", os.path.abspath(DEST))
