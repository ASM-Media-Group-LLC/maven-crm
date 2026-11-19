#!/usr/bin/env python3
"""SIMULACRO v2 — junta lo de las 4 máquinas en un resumen (JSON) y un informe (HTML).

  resumen.py <carpeta> [--html salida.html]

Por persona en Chrome: cuánto tardó en ver al otro, congelamientos, resolución,
pérdida, audio cortado, retraso, si usó la red de respaldo, caídas y si volvió.
Por máquina y fase: CPU (si pasa del 85 %, lo de esa máquina en esa fase NO vale).
k6: éxito y tiempos por función y posición desde cada país; mensajes en vivo.
"""
import glob, html, json, os, re, sys
from statistics import median

R = sys.argv[1]
PAISES = {"mia": "Miami", "mad": "Madrid", "sao": "São Paulo", "mex": "Ciudad de México"}
FASES = {"dos": "Llamadas de 2 entre países", "cowork16": "Cowork de 16", "sala24": "Sala de 24 + 1000 en Maven", "larga": "Llamada larga 30 min"}
FASE_CPU = {"dos": "f1", "cowork16": "f2", "sala24": "f3", "larga": "f5"}
COND = {"bueno": "internet bueno", "4g": "4G", "malo": "internet malo", "corte30": "corte de 30 s", "cortes": "cortes cada minuto",
        "sin_udp": "red que bloquea llamadas", "wifi_perdidas": "wifi con pérdidas"}


def cpu_max(pais, fase):
    f = os.path.join(R, pais, f"cpu_{fase}__{pais}.txt")
    if not os.path.exists(f):
        return None
    v = [float(l.split()[1]) for l in open(f) if len(l.split()) == 2]
    return round(max(v)) if v else None


def p95(v):
    v = sorted(x for x in v if x is not None)
    return v[int(len(v) * 0.95)] if v else None


personas = []
for f in glob.glob(os.path.join(R, "*", "*__*__*__*.json")):
    try:
        d = json.load(open(f))
    except Exception:
        continue
    esc, pais, cond, p = os.path.basename(f)[:-5].split("__")
    c = cpu_max(pais, FASE_CPU.get(esc, ""))
    d.update(escenario=esc, pais=pais, cond=cond, cpu=c, valida=(c is None or c <= 85))
    # Veredicto por persona
    malo = []
    if not d.get("ve_al_otro_ms"):
        malo.append("no vio a nadie")
    if (d.get("congelado_s") or 0) > 10:
        malo.append(f"imagen congelada {d['congelado_s']} s")
    if (d.get("audio_cortado_pct") or 0) > 5:
        malo.append(f"audio cortado {d['audio_cortado_pct']} %")
    if d.get("caidas") and not d.get("volvio"):
        malo.append("se cayó y no volvió")
    d["problemas"] = malo
    d["color"] = "gris" if not d["valida"] else ("rojo" if malo else ("amarillo" if (d.get("congelamientos") or 0) > 3 or (d.get("perdida_video_pct") or 0) > 3 else "verde"))
    personas.append(d)

# k6: carga (funciones por posición) y en vivo
carga, vivo = [], []
for f in glob.glob(os.path.join(R, "*", "carga__*.json")):
    pais = os.path.basename(f)[:-5].split("__")[1]
    m = json.load(open(f)).get("metricas", {})
    for k, v in m.items():
        mm = re.match(r"ok__(\w+?)__(\w+)$", k)
        if not mm:
            continue
        t = m.get(f"ms__{mm.group(1)}__{mm.group(2)}", {}).get("values", {})
        if not t.get("count"):
            continue
        carga.append({"pais": pais, "pos": mm.group(1), "fn": mm.group(2), "exito": v["values"].get("rate"), "p95": t.get("p(95)"), "n": int(t["count"])})
for f in glob.glob(os.path.join(R, "*", "vivo__*.json")):
    pais = os.path.basename(f)[:-5].split("__")[1]
    m = json.load(open(f)).get("metricas", {})
    g = lambda k, s: m.get(k, {}).get("values", {}).get(s)
    vivo.append({"pais": pais, "union": g("rt_union_ok", "rate"), "llego": g("rt_mensaje_llego", "rate"),
                 "p50": g("rt_entrega_ms", "p(50)"), "p95": g("rt_entrega_ms", "p(95)"), "caidas": g("rt_caidas", "count")})

cpu = {p: {f: cpu_max(p, f) for f in ("f1", "f2", "f3", "f4", "f5")} for p in PAISES}
validas = [x for x in personas if x["valida"]]
res = {
    "carpeta": R, "personas": personas, "carga": carga, "vivo": vivo, "cpu": cpu,
    "totales": {
        "chrome": len(personas), "validas": len(validas),
        "verde": sum(x["color"] == "verde" for x in validas), "amarillo": sum(x["color"] == "amarillo" for x in validas),
        "rojo": sum(x["color"] == "rojo" for x in validas),
        "ve_al_otro_p50_ms": median([x["ve_al_otro_ms"] for x in validas if x.get("ve_al_otro_ms")] or [0]),
        "congelado_total_s": round(sum(x.get("congelado_s") or 0 for x in validas), 1),
        "funciones_ok": sum(1 for c in carga if (c["exito"] or 0) >= 0.99), "funciones": len(carga),
        "mensajes_llegaron_min": min([v["llego"] for v in vivo if v["llego"] is not None] or [None]) if vivo else None,
    },
}

if "--html" in sys.argv:
    out = sys.argv[sys.argv.index("--html") + 1]
    T = res["totales"]
    col = {"verde": "#1f9d55", "amarillo": "#d69e2e", "rojo": "#e53e3e", "gris": "#888"}
    filas = "".join(
        f"<tr><td>{html.escape(FASES.get(x['escenario'], x['escenario']))}</td><td>{PAISES.get(x['pais'], x['pais'])}</td>"
        f"<td>{COND.get(x['cond'], x['cond'])}</td><td style='color:{col[x['color']]};font-weight:600'>{'no válida (CPU '+str(x['cpu'])+' %)' if not x['valida'] else x['color']}</td>"
        f"<td>{(x.get('ve_al_otro_ms') or 0)/1000:.1f} s</td><td>{x.get('congelamientos')} / {x.get('congelado_s')} s</td>"
        f"<td>{x.get('resolucion_recibida_mediana') or '—'}p</td><td>{x.get('perdida_video_pct')} %</td><td>{x.get('audio_cortado_pct')} %</td>"
        f"<td>{x.get('rtt_p50_ms') or '—'} ms</td><td>{html.escape(str(x.get('camino')))}</td><td>{x.get('caidas')}{' ✓volvió' if x.get('caidas') and x.get('volvio') else ''}</td>"
        f"<td>{html.escape(', '.join(x['problemas']) or '—')}</td></tr>"
        for x in sorted(personas, key=lambda x: (list(FASES).index(x["escenario"]) if x["escenario"] in FASES else 9, x["pais"])))
    malas = sorted([c for c in carga if (c["exito"] or 1) < 0.99], key=lambda c: c["exito"])[:15]
    fcarga = "".join(f"<tr><td>{PAISES.get(c['pais'])}</td><td>{c['pos']}</td><td>{c['fn']}</td><td>{c['exito']*100:.1f} %</td><td>{(c['p95'] or 0)/1000:.1f} s</td></tr>" for c in malas) or "<tr><td colspan=5>Todas las funciones ≥ 99 %</td></tr>"
    fvivo = "".join(f"<tr><td>{PAISES.get(v['pais'])}</td><td>{(v['llego'] or 0)*100:.1f} %</td><td>{(v['p50'] or 0)/1000:.2f} s</td><td>{(v['p95'] or 0)/1000:.2f} s</td></tr>" for v in vivo)
    fcpu = "".join(f"<tr><td>{PAISES[p]}</td>" + "".join(f"<td style='color:{'#e53e3e' if (c or 0) > 85 else 'inherit'}'>{c if c is not None else '—'} %</td>" for c in cpu[p].values()) + "</tr>" for p in PAISES)
    open(out, "w").write(f"""<!doctype html><html lang=es><meta charset=utf-8><title>Simulacro v2</title>
<style>body{{font:13px -apple-system,Segoe UI,sans-serif;color:#1a202c;margin:28px}}h1{{font-size:22px;margin:0}}h2{{font-size:15px;margin:22px 0 6px}}
table{{border-collapse:collapse;width:100%;font-size:11px}}td,th{{border-bottom:1px solid #e2e8f0;padding:4px 6px;text-align:left}}th{{background:#f7fafc}}
.k{{display:inline-block;margin:8px 14px 0 0}}.k b{{font-size:20px;display:block}}</style>
<h1>Simulacro v2 — Chrome reales desde 4 países</h1><p>Miami, Madrid, São Paulo y Ciudad de México · copia de Maven en Large · réplica del servidor de llamadas · producción no se tocó.</p>
<div><span class=k><b>{T['validas']}/{T['chrome']}</b>Chrome válidos</span><span class=k><b style=color:#1f9d55>{T['verde']}</b>bien</span>
<span class=k><b style=color:#d69e2e>{T['amarillo']}</b>regular</span><span class=k><b style=color:#e53e3e>{T['rojo']}</b>mal</span>
<span class=k><b>{T['ve_al_otro_p50_ms']/1000:.1f} s</b>en ver al otro</span><span class=k><b>{T['funciones_ok']}/{T['funciones']}</b>funciones ≥99 %</span></div>
<h2>Cada persona en Chrome</h2><table><tr><th>Prueba</th><th>País</th><th>Internet</th><th>Resultado</th><th>Ve al otro</th><th>Congel. (veces/s)</th><th>Resol.</th><th>Pérdida</th><th>Audio cortado</th><th>Retraso</th><th>Camino</th><th>Caídas</th><th>Problemas</th></tr>{filas}</table>
<h2>1000 personas usando Maven desde 4 países — lo que falló</h2><table><tr><th>País</th><th>Puesto</th><th>Función</th><th>Éxito</th><th>p95</th></tr>{fcarga}</table>
<h2>Mensajes en vivo</h2><table><tr><th>País</th><th>Llegaron</th><th>Mediana</th><th>p95</th></tr>{fvivo}</table>
<h2>CPU de las máquinas de prueba (si pasa de 85 %, esa fase no vale)</h2><table><tr><th>País</th><th>F1</th><th>F2</th><th>F3</th><th>F4</th><th>F5</th></tr>{fcpu}</table>
</html>""")

print(json.dumps(res, ensure_ascii=False, default=str))
