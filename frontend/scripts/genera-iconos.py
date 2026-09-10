"""Iconos de Maven (favicon, PWA, iOS): la baldosa con la M nueva, CENTRADA.

La M es la del mock que aprobó Jhon el 10/09/2026 (la misma de
src/components/MarcaM.tsx): caja apaisada de 53 x 33 con cuatro cintas de
ancho 10 y puntas redondas, las patas de afuera apagadas y la V del medio
blanca por encima. La geometría va en fracciones del lado de la baldosa y la
M queda centrada. Se dibuja a 8x y se reduce con LANCZOS, así queda suave a
16 px igual que a 512.

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

# La M, en su caja propia de 53 x 33 (ver components/MarcaM.tsx).
M_W, M_H, M_SW = 53.0, 33.0, 10.0
M_CIMA_I, M_CIMA_D, M_CIMA_Y = 14.5, 38.5, 5.5
M_PIE_I, M_PIE_D, M_PIE_Y = 5.0, 48.0, 27.0
M_VERT_X, M_VERT_Y = 26.5, 27.5
ALTO_M = 0.46        # alto de la M, fracción del lado de la baldosa (74% de ancho)
ALFA_PATAS = 0.55    # las patas de afuera, más apagadas que la V


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
    """Dos máscaras: las patas de afuera y la V del medio, que va por encima."""
    big = size * ss
    alto = ALTO_M * big
    esc = alto / M_H
    x0 = (big - M_W * esc) / 2
    y0 = (big - alto) / 2
    P = lambda x, y: (x0 + x * esc, y0 + y * esc)
    w = M_SW * esc

    def trazo(puntos):
        capa = Image.new("L", (big, big), 0)
        d = ImageDraw.Draw(capa)
        d.line(puntos, fill=255, width=int(round(w)), joint="curve")
        for p in (puntos[0], puntos[-1]):   # puntas redondas
            d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=255)
        return capa

    patas = trazo([P(M_CIMA_I, M_CIMA_Y), P(M_PIE_I, M_PIE_Y)])
    dcha = trazo([P(M_CIMA_D, M_CIMA_Y), P(M_PIE_D, M_PIE_Y)])
    patas.paste(dcha, (0, 0), dcha)
    uve = trazo([P(M_CIMA_I, M_CIMA_Y), P(M_VERT_X, M_VERT_Y), P(M_CIMA_D, M_CIMA_Y)])
    return (patas.resize((size, size), Image.LANCZOS),
            uve.resize((size, size), Image.LANCZOS))


def icono(size):
    b = baldosa(size)
    patas, uve = letra(size)
    for mascara, alfa in ((patas, ALFA_PATAS), (uve, 1.0)):
        capa = Image.new("RGBA", (size, size), (255, 255, 255, 255))
        capa.putalpha(mascara if alfa == 1.0 else mascara.point(lambda v: int(v * alfa)))
        b.alpha_composite(capa)
    return b


if __name__ == "__main__":
    frames = [icono(s) for s in (16, 32, 48, 64, 128, 256)]
    frames[-1].save(os.path.join(DEST, "favicon.ico"), format="ICO",
                    sizes=[f.size for f in frames], append_images=frames[:-1])
    icono(192).save(os.path.join(DEST, "icon-192.png"))
    icono(512).save(os.path.join(DEST, "icon-512.png"))
    icono(180).save(os.path.join(DEST, "apple-touch-icon.png"))
    print("iconos escritos en", os.path.abspath(DEST))
