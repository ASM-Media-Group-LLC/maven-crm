#!/usr/bin/env python3
"""SIMULACRO — junta los resultados de una noche en el semáforo.

Verde / amarillo / rojo por función × posición × ciudad × conexión, con la
regla de cada condición (con cortes o sin internet se espera que algo falle
mientras no hay red; lo que se juzga es que vuelva solo y no se pierda nada).
"""
import json, os, re, sys, glob

R = sys.argv[1]

# Umbrales: (éxito mínimo verde, éxito mínimo amarillo) y p95 en ms (verde, amarillo).
EXITO = {"bueno": (0.99, 0.95), "malo": (0.97, 0.90), "cortes": (0.85, 0.70), "sin_internet": (0.80, 0.65)}
LENTO = {"subir_foto": (6000, 15000), "entrar": (2500, 6000)}
LENTO_DEF = (1500, 4000)
NOMBRES = {
    "entrar": "Entrar a Maven", "cargar_app": "Abrir la app (menú y permisos)", "notificaciones": "Notificaciones",
    "cowork_estado": "Cowork (estado)", "messenger_lista": "Messenger: lista de chats", "messenger_leer": "Messenger: leer",
    "messenger_enviar": "Messenger: enviar", "subir_foto": "Subir foto/archivo", "argos_captura": "Argos: mandar pantallazo",
    "argos_presencia": "Argos: ver presencia", "argos_hub": "Argos: tablero supervisores", "creadoras": "Creadoras",
    "closers": "Closers", "contactos": "Contactos", "finanzas": "Finanzas", "rrhh": "RR. HH.", "promolog": "Promolog",
    "tickets": "Tickets", "drive": "Drive", "chatters_grupos": "Grupos de chatters",
}
POS = {"dueno": "Dueño", "admin": "Admin", "hhrr": "HHRR", "closer": "Closer", "operations": "Operations Sales",
       "supervisor": "Chatter Supervisor", "chatter": "Chatter", "finanzas": "Finanzas", "pr": "PR", "marketing": "Marketing",
       "editores": "Editores", "freelance": "Freelance", "comunicacion": "Agente + Comunicación"}


def color(cond, fn, exito, p95):
    v, a = EXITO.get(cond, EXITO["bueno"])
    lv, la = LENTO.get(fn, LENTO_DEF)
    if exito is None:
        return "gris"
    if exito >= v and (p95 is None or p95 <= lv or cond in ("cortes", "sin_internet")):
        return "verde"
    if exito >= a and (p95 is None or p95 <= la or cond in ("cortes", "sin_internet")):
        return "amarillo"
    return "rojo"


filas = []
for f in sorted(glob.glob(os.path.join(R, "*.json"))):
    base = os.path.basename(f)[:-5]
    partes = base.split("__")
    if len(partes) != 3 or partes[0] not in ("carga", "red"):
        continue
    fase, ciudad, cond = partes
    d = json.load(open(f))["metricas"]
    for k, m in d.items():
        mm = re.match(r"ok__(\w+?)__(\w+)$", k)
        if not mm:
            continue
        pos, fn = mm.groups()
        exito = m.get("values", {}).get("rate")
        t = d.get(f"ms__{pos}__{fn}", {}).get("values", {})
        p95 = t.get("p(95)")
        n = int(t.get("count", 0) or 0)
        if n == 0 and exito is None:
            continue
        filas.append({"fase": fase, "ciudad": ciudad, "cond": cond, "pos": POS.get(pos, pos), "fn": NOMBRES.get(fn, fn),
                      "exito": exito, "p95": p95, "p50": t.get("p(50)"), "n": n, "color": color(cond, fn, exito, p95)})

vivo = []
for f in sorted(glob.glob(os.path.join(R, "vivo__*.json"))):
    _, ciudad, cond = os.path.basename(f)[:-5].split("__")
    d = json.load(open(f))["metricas"]
    g = lambda k, s: d.get(k, {}).get("values", {}).get(s)
    vivo.append({"ciudad": ciudad, "cond": cond, "union_ok": g("rt_union_ok", "rate"), "union_p95": g("rt_union_ms", "p(95)"),
                 "llego": g("rt_mensaje_llego", "rate"), "entrega_p50": g("rt_entrega_ms", "p(50)"), "entrega_p95": g("rt_entrega_ms", "p(95)"),
                 "caidas": g("rt_caidas", "count"), "reconexion_p95": g("rt_reconexion_ms", "p(95)")})

llamadas = []
for f in sorted(glob.glob(os.path.join(R, "llamada__*.txt"))):
    _, ciudad, cond = os.path.basename(f)[:-4].split("__")
    txt = open(f, errors="ignore").read()
    m = re.search(r"Total\s*│\s*(\d+)/(\d+)\s*│[^│]*│\s*\d+ \(([\d.]+)%\)\s*│\s*(\d+)", txt)
    if m:
        rec, esp, perd, err = int(m.group(1)), int(m.group(2)), float(m.group(3)), int(m.group(4))
    else:
        rec, esp, perd, err = 0, 0, None, None
    col = "rojo" if (not m or rec < esp or (err or 0) > 0 or (perd or 0) > 5) else ("amarillo" if (perd or 0) > 1.5 else "verde")
    llamadas.append({"ciudad": ciudad, "cond": cond, "pistas": f"{rec}/{esp}", "perdida": perd, "errores": err, "color": col,
                     "salida": txt[-1800:]})

print(json.dumps({"noche": os.path.basename(R.rstrip("/")), "filas": filas, "vivo": vivo, "llamadas": llamadas}, ensure_ascii=False))
