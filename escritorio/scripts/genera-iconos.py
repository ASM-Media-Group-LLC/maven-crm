"""Iconos de la app de escritorio: la misma M de cinta de la web
(frontend/scripts/genera-iconos.py), en los formatos que piden Mac y Windows.

  · recursos/icono.png  1024 x 1024 para el Mac: baldosa redondeada de 824 px
    con margen transparente, como los iconos nativos de macOS (electron-builder
    arma el .icns desde aquí).
  · recursos/icono.ico  16 a 256 px para Windows: baldosa redondeada a sangre,
    igual que el favicon.

Uso (desde la raíz del repo):  python3 escritorio/scripts/genera-iconos.py
Requiere Pillow y numpy.
"""
import importlib.util
import os

from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, "..", ".."))
DEST = os.path.join(AQUI, "..", "recursos")

spec = importlib.util.spec_from_file_location("iconos_web", os.path.join(RAIZ, "frontend", "scripts", "genera-iconos.py"))
web = importlib.util.module_from_spec(spec)
spec.loader.exec_module(web)

os.makedirs(DEST, exist_ok=True)

# Mac: lienzo de 1024 con la baldosa de 824 al centro (la grilla de Apple).
# Se dibuja a 2x y no a 8x: a 1024 px ya queda suave y a 8x no cabe en memoria.
baldosa = web.icono(824, True, 0.66, ss=2)
lienzo = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
lienzo.alpha_composite(baldosa, (100, 100))
lienzo.save(os.path.join(DEST, "icono.png"))

# Windows: baldosa redondeada a sangre, como el favicon.
cuadros = [web.icono(s, True, 0.78, ss=4) for s in (16, 24, 32, 48, 64, 128, 256)]
cuadros[-1].save(os.path.join(DEST, "icono.ico"), format="ICO",
                 sizes=[c.size for c in cuadros], append_images=cuadros[:-1])
print("iconos escritos en", os.path.abspath(DEST))
