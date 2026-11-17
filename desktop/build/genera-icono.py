"""Iconos de la app de computador: la misma M de frontend/scripts/genera-iconos.py.

Mac: baldosa redondeada de 824 sobre lienzo de 1024 (el margen que usan los
iconos de macOS). Windows: la baldosa a sangre, en un .ico de varios tamaños.
Uso: python3 desktop/build/genera-icono.py
"""
import importlib.util, os
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location(
    "iconos", os.path.join(AQUI, "..", "..", "frontend", "scripts", "genera-iconos.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)   # su bloque __main__ no corre al importarlo

mac = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
baldosa = mod.icono(824, True, 0.66)
mac.paste(baldosa, (100, 100), baldosa)
mac.save(os.path.join(AQUI, "icon.png"))

win = mod.icono(256, True, 0.68)
win.save(os.path.join(AQUI, "icon.ico"), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

# Bandeja: la M sola, 16/32 px (plantilla en Mac, a color en Windows).
bandeja = mod.icono(64, True, 0.8).resize((32, 32), Image.LANCZOS)
bandeja.save(os.path.join(AQUI, "bandeja.png"))
print("listo")
