"""Iconos de Maven (favicon, PWA, iOS): la M gruesa de producción, CENTRADA.

En el icono de #1625 la M quedaba un 8% arriba del centro y sobraba azul
abajo (Jhon, 05/09/2026). Acá la geometría va en fracciones del lado de la
baldosa, medida de ese icono, y la M se centra en vertical. Se dibuja a 8x y se
reduce con LANCZOS, así queda suave a 16 px igual que a 512.

Uso:  python3 frontend/scripts/genera-iconos.py            (escribe en frontend/public)
      python3 frontend/scripts/genera-iconos.py /otra/carpeta
Requiere Pillow y numpy.
"""
from PIL import Image, ImageDraw
import numpy as np, sys, os

AQUI = os.path.dirname(os.path.abspath(__file__))
DEST = sys.argv[1] if len(sys.argv) > 1 else os.path.join(AQUI, "..", "public")

# Gradiente medido del icono original (ajuste lineal sobre el icon-512): diagonal
# arriba-izquierda → abajo-derecha (CSS `to bottom right`), violeta → azul.
C0 = (138.6, 91.5, 246.0)   # esquina arriba-izquierda
C1 = (58.6, 129.5, 246.0)   # esquina abajo-derecha
RADIO = 0.195               # radio de la baldosa, fracción del lado

# La M, en fracciones del lado (mismas proporciones que la M de Lucide del logo).
ANCHO = 0.625    # entre los centros de las patas
ALTO = 0.469     # largo de las patas, entre centros
VERTICE = 0.273  # del tope de las patas al vértice de la V
TRAZO = 0.15     # grosor del trazo


def gradiente(size):
    yy, xx = np.mgrid[0:size, 0:size]
    t = ((xx + .5) / size + (yy + .5) / size) / 2
    img = np.zeros((size, size, 4), np.uint8)
    for c in range(3):
        img[:, :, c] = np.clip(C0[c] + (C1[c] - C0[c]) * t, 0, 255)
    img[:, :, 3] = 255
    return Image.fromarray(img)


def baldosa(size, ss=8):
    big = size * ss
    g = gradiente(big)
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, big - 1, big - 1], radius=RADIO * big, fill=255)
    g.putalpha(mask)
    return g.resize((size, size), Image.LANCZOS)


def letra(size, ss=8):
    big = size * ss
    w = TRAZO * big
    top = (1 - (ALTO + TRAZO)) / 2 * big + w / 2   # centrada en vertical
    bot = top + ALTO * big
    xl, xr = (0.5 - ANCHO / 2) * big, (0.5 + ANCHO / 2) * big
    pts = [(xl, bot), (xl, top), (big / 2, top + VERTICE * big), (xr, top), (xr, bot)]
    layer = Image.new("L", (big, big), 0)
    d = ImageDraw.Draw(layer)
    d.line(pts, fill=255, width=int(round(w)), joint="curve")
    for p in (pts[0], pts[-1]):   # puntas redondas
        d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=255)
    return layer.resize((size, size), Image.LANCZOS)


def icono(size):
    b = baldosa(size)
    blanco = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    blanco.putalpha(letra(size))
    b.alpha_composite(blanco)
    return b


if __name__ == "__main__":
    frames = [icono(s) for s in (16, 32, 48, 64, 128, 256)]
    frames[-1].save(os.path.join(DEST, "favicon.ico"), format="ICO",
                    sizes=[f.size for f in frames], append_images=frames[:-1])
    icono(192).save(os.path.join(DEST, "icon-192.png"))
    icono(512).save(os.path.join(DEST, "icon-512.png"))
    icono(180).save(os.path.join(DEST, "apple-touch-icon.png"))
    print("iconos escritos en", os.path.abspath(DEST))
