#!/usr/bin/env python3
"""SIMULACRO — arma el reporte de una noche (HTML para el tablero y para el PDF).

uso: reporte.py semaforo.json salida.html [noche_n] [costo_usd]
"""
import json, sys, html
from collections import defaultdict

d = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
NOCHE_N = sys.argv[3] if len(sys.argv) > 3 else "1"
COSTO = sys.argv[4] if len(sys.argv) > 4 else "—"
e = html.escape
ORDEN = {"rojo": 0, "amarillo": 1, "verde": 2, "gris": 3}
CONDS = [("bueno", "Internet bueno"), ("malo", "Internet malo"), ("cortes", "Con cortes"), ("sin_internet", "Sin internet 1 min")]
CIUDAD = {"frankfurt": "Frankfurt", "londres": "Londres", "madrid": "Madrid", "bogota": "Bogotá", "mexico": "Ciudad de México",
          "saopaulo": "São Paulo", "santiago": "Santiago", "miami": "Miami", "nuevayork": "Nueva York", "losangeles": "Los Ángeles"}
pct = lambda x: "—" if x is None else f"{x*100:.1f} %"
ms = lambda x: "—" if x is None else (f"{x/1000:.1f} s" if x >= 1000 else f"{x:.0f} ms")

# Semáforo: función × posición (peor color entre ciudades) por condición.
celdas = defaultdict(dict)
detalle = defaultdict(list)
for f in d["filas"]:
    k = (f["fn"], f["pos"])
    prev = celdas[k].get(f["cond"])
    if prev is None or ORDEN[f["color"]] < ORDEN[prev["color"]]:
        celdas[k][f["cond"]] = f
    detalle[k].append(f)

rojos = sorted([f for f in d["filas"] if f["color"] == "rojo"], key=lambda f: (f["exito"] or 0))
amar = [f for f in d["filas"] if f["color"] == "amarillo"]
graves = []
vistos = set()
for f in rojos + amar:
    k = (f["fn"], f["cond"])
    if k in vistos:
        continue
    vistos.add(k)
    quienes = sorted({x["pos"] for x in d["filas"] if x["fn"] == f["fn"] and x["cond"] == f["cond"] and x["color"] == f["color"]})
    ciudades = sorted({CIUDAD.get(x["ciudad"], x["ciudad"]) for x in d["filas"] if x["fn"] == f["fn"] and x["cond"] == f["cond"] and x["color"] == f["color"]})
    graves.append((f, quienes, ciudades))
    if len(graves) >= 5:
        break

for v in d["vivo"]:
    v["color"] = "verde" if (v["llego"] or 0) >= 0.99 and (v["union_ok"] or 0) >= 0.99 else ("amarillo" if (v["llego"] or 0) >= 0.9 else "rojo")
    if v["cond"] in ("cortes", "sin_internet") and (v["llego"] or 0) >= 0.85:
        v["color"] = "verde" if (v["llego"] or 0) >= 0.95 else "amarillo"

tot = len(d["filas"])
cuenta = {c: sum(1 for f in d["filas"] if f["color"] == c) for c in ("verde", "amarillo", "rojo")}
llam_rojas = [l for l in d["llamadas"] if l.get("color") == "rojo"]
vivo_rojos = [v for v in d["vivo"] if v["color"] == "rojo"]

css = """
:root{--bg:#f4f5f8;--card:#fff;--fg:#141824;--mut:#5b6275;--line:#e1e4ec;--ok:#1f8a54;--okbg:#e3f5eb;--wa:#a86400;--wabg:#fdf0d8;--ko:#c0352b;--kobg:#fbe5e3;--acc:#6d4cdb;--gr:#9aa1b5}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0f121a;--card:#171b26;--fg:#e9ebf2;--mut:#9ca3b7;--line:#272c3b;--ok:#4fd08f;--okbg:#13291e;--wa:#f0b04a;--wabg:#2d2412;--ko:#ff7b70;--kobg:#2e1715;--acc:#a48cff;color-scheme:dark}}
:root[data-theme=dark]{--bg:#0f121a;--card:#171b26;--fg:#e9ebf2;--mut:#9ca3b7;--line:#272c3b;--ok:#4fd08f;--okbg:#13291e;--wa:#f0b04a;--wabg:#2d2412;--ko:#ff7b70;--kobg:#2e1715;--acc:#a48cff;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font:14px/1.5 Inter,system-ui,sans-serif;margin:0}
.w{max-width:1150px;margin:0 auto;padding-block:28px 60px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:flex;flex-direction:column;gap:22px}
h1,h2{font-family:"Space Grotesk",Inter,system-ui,sans-serif;margin:0}h1{font-size:1.8rem}h2{font-size:1.15rem}
.mut{color:var(--mut)}.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.kpi b{display:block;font-size:1.5rem;font-family:"Space Grotesk",Inter,sans-serif;font-variant-numeric:tabular-nums}
.tbl{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:.84rem;font-variant-numeric:tabular-nums}
th,td{padding:7px 9px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{color:var(--mut);font-weight:600}
.c{display:inline-block;min-width:74px;padding:2px 8px;border-radius:6px;font-size:.78rem;text-align:center}
.verde{background:var(--okbg);color:var(--ok)}.amarillo{background:var(--wabg);color:var(--wa)}.rojo{background:var(--kobg);color:var(--ko)}.gris{color:var(--gr)}
ol li{margin-bottom:8px}.nota{font-size:.82rem;color:var(--mut)}
pre{white-space:pre-wrap;font-size:.72rem;background:var(--bg);padding:8px;border-radius:8px;max-height:220px;overflow:auto}
@media print{.w{max-width:none}pre{max-height:none}}
"""

h = [f"<!doctype html><html lang=es><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1,viewport-fit=cover'><title>Simulacro de Maven</title>"
     f"<meta name='claude:viewport-fit-sides' content='cover'><style>{css}</style></head><body><div class=w>"]
h.append(f"<header><h1>Simulacro de Maven</h1><p class=mut>Noche {e(NOCHE_N)} de 7 · {e(d['noche'])} · 1000 personas inventadas en una copia aparte de Maven (producción no se tocó) · 10 ciudades · 4 tipos de internet · 13 posiciones.</p></header>")
h.append("<section class=kpis>")
for lab, val in [("Pruebas medidas", tot), ("En verde", cuenta["verde"]), ("En amarillo", cuenta["amarillo"]), ("En rojo", cuenta["rojo"]),
                 ("Llamadas con problemas", len(llam_rojas)), ("Gasto acumulado", f"USD {COSTO}")]:
    h.append(f"<div class='card kpi'><span class=mut>{e(lab)}</span><b>{e(str(val))}</b></div>")
h.append("</section>")

h.append("<section class=card><h2>Lo grave de esta noche</h2><ol>")
if not graves and not vivo_rojos and not llam_rojas:
    h.append("<li>Nada en rojo ni en amarillo.</li>")
for f, quienes, ciudades in graves:
    h.append(f"<li><b>{e(f['fn'])}</b> con <b>{e(dict(CONDS)[f['cond']].lower())}</b>: funcionó {pct(f['exito'])} de las veces, "
             f"el 95 % tardó hasta {ms(f['p95'])}. Afecta a {e(', '.join(quienes))} · desde {e(', '.join(ciudades))}.</li>")
for v in vivo_rojos[:2]:
    h.append(f"<li><b>Mensajes en vivo</b> desde {e(CIUDAD.get(v['ciudad'], v['ciudad']))} con {e(dict(CONDS)[v['cond']].lower())}: llegó {pct(v['llego'])} por el canal en vivo.</li>")
for l in llam_rojas[:2]:
    h.append(f"<li><b>Llamada</b> desde {e(CIUDAD.get(l['ciudad'], l['ciudad']))} con {e(dict(CONDS)[l['cond']].lower())}: pistas {e(l['pistas'])}, pérdida {l['perdida']} %, errores {l['errores']}.</li>")
h.append("</ol></section>")

h.append("<section class=card><h2>Semáforo: función × posición</h2><p class=nota>Cada casilla es el peor resultado entre todas las ciudades probadas. Verde: funciona casi siempre y rápido. Amarillo: funciona, pero lento o con fallas ocasionales. Rojo: falla o es demasiado lento.</p><div class=tbl><table><thead><tr><th>Función</th><th>Posición</th>")
for _, lab in CONDS:
    h.append(f"<th>{e(lab)}</th>")
h.append("</tr></thead><tbody>")
for (fn, pos) in sorted(celdas, key=lambda k: (min(ORDEN[c['color']] for c in celdas[k].values()), k)):
    h.append(f"<tr><td>{e(fn)}</td><td>{e(pos)}</td>")
    for c, _ in CONDS:
        f = celdas[(fn, pos)].get(c)
        if not f:
            h.append("<td><span class='c gris'>—</span></td>")
        else:
            h.append(f"<td><span class='c {f['color']}' title='p50 {ms(f['p50'])}, {f['n']} intentos'>{pct(f['exito'])} · {ms(f['p95'])}</span></td>")
    h.append("</tr>")
h.append("</tbody></table></div></section>")

# Por ciudad (carga total)
porc = defaultdict(lambda: [0, 0, []])
for f in d["filas"]:
    if f["fase"] != "carga":
        continue
    p = porc[f["ciudad"]]
    p[0] += (f["exito"] or 0) * f["n"]; p[1] += f["n"]
    if f["p95"]: p[2].append(f["p95"])
h.append("<section class=card><h2>Las 1000 personas a la vez, por ciudad</h2><div class=tbl><table><thead><tr><th>Ciudad</th><th>Funcionó</th><th>Lo más lento (p95 típico)</th></tr></thead><tbody>")
for c, (okn, n, p95s) in sorted(porc.items(), key=lambda x: CIUDAD.get(x[0], x[0])):
    ex = okn / n if n else None
    med = sorted(p95s)[len(p95s)//2] if p95s else None
    col = "verde" if (ex or 0) >= 0.99 else ("amarillo" if (ex or 0) >= 0.95 else "rojo")
    h.append(f"<tr><td>{e(CIUDAD.get(c, c))}</td><td><span class='c {col}'>{pct(ex)}</span></td><td>{ms(med)}</td></tr>")
h.append("</tbody></table></div></section>")

h.append("<section class=card><h2>Mensajes en vivo (Messenger)</h2><p class=nota>Cuánto tarda un mensaje en aparecerle al otro y si la conexión vuelve sola después de un corte.</p><div class=tbl><table><thead><tr><th>Ciudad</th><th>Internet</th><th>Conecta</th><th>Mensajes que llegan</th><th>Tarda (normal / 95 %)</th><th>Caídas</th><th>Vuelve en (95 %)</th></tr></thead><tbody>")
for v in d["vivo"]:
    h.append(f"<tr><td>{e(CIUDAD.get(v['ciudad'], v['ciudad']))}</td><td>{e(dict(CONDS)[v['cond']])}</td><td>{pct(v['union_ok'])}</td>"
             f"<td><span class='c {v['color']}'>{pct(v['llego'])}</span></td><td>{ms(v['entrega_p50'])} / {ms(v['entrega_p95'])}</td>"
             f"<td>{v['caidas'] or 0:.0f}</td><td>{ms(v['reconexion_p95'])}</td></tr>")
h.append("</tbody></table></div></section>")

h.append("<section class=card><h2>Llamadas (salas tipo Cowork)</h2><p class=nota>Por sala: 6 personas con cámara, 8 con micrófono y 10 mirando, 3 minutos. Servidor de llamadas de pruebas, no el de producción.</p><div class=tbl><table><thead><tr><th>Ciudad</th><th>Internet</th><th>Videos y audios recibidos</th><th>Pérdida</th><th>Errores</th></tr></thead><tbody>")
for l in d["llamadas"]:
    h.append(f"<tr><td>{e(CIUDAD.get(l['ciudad'], l['ciudad']))}</td><td>{e(dict(CONDS)[l['cond']])}</td><td><span class='c {l['color']}'>{e(l['pistas'])}</span></td>"
             f"<td>{'—' if l['perdida'] is None else str(l['perdida'])+' %'}</td><td>{'—' if l['errores'] is None else l['errores']}</td></tr>")
h.append("</tbody></table></div></section>")

h.append("""<section class=card><h2>Hallazgo de seguridad (producción)</h2><p>Al copiar la estructura apareció un aviso automático de la base de producción que, cada vez que cambia una creadora,
la manda a un proyecto de Supabase externo (<code>hmsyrnxbgaaqwnorpkxj</code>) con una contraseña escrita dentro. No es parte de Maven hoy y no se tocó: queda para tu decisión.</p></section>""")
h.append("""<section class=card><h2>Qué cubre y qué todavía no</h2><p class=nota><b>Cubre:</b> entrar, abrir la app con permisos de cada posición, notificaciones, Cowork, Messenger (leer, enviar y en vivo),
subir fotos, Argos (mandar pantallazos, ver presencia, tablero), Creadoras, Closers, Contactos, Finanzas, RR. HH., Promolog, Tickets, Drive, grupos de chatters y llamadas.
Ciudades imitadas por distancia de red desde el servidor de pruebas (EE. UU. central). <b>Todavía no:</b> el correo (Zoho es externo), las funciones del servidor que hablan con terceros
(IA de Argos, push, WhatsApp), la app de escritorio y la grabación de pantalla real; la copia corre en el tamaño de base más chico, así que los tiempos con 1000 personas son el peor caso.</p></section>""")
h.append("</div></body></html>")
open(OUT, "w").write("".join(h))
print("ok", OUT, tot, cuenta)
