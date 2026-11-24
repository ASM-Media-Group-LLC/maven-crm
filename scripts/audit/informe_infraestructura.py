#!/usr/bin/env python3
"""Genera el informe de Maven desde datos verificados, sin consultar producción.

Uso: python3 scripts/audit/informe_infraestructura.py [--datos archivo.json]
       [--salida archivo.pdf]
Actualizar delivery y livekit en el JSON antes de regenerar la entrega definitiva.
Requiere reportlab. El PDF conserva cuatro grupos de respuestas seleccionables.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


NAVY = colors.HexColor("#101A2A")
BLUE = colors.HexColor("#243A55")
LIME = colors.HexColor("#BED464")
INK = colors.HexColor("#203047")
MUTED = colors.HexColor("#607084")
LIGHT = colors.HexColor("#F1F4F7")
LINE = colors.HexColor("#DCE3E9")
WHITE = colors.white
AMBER = colors.HexColor("#A66513")
W, H = A4
M = 43
CW = W - 2 * M


def n(value: int | float, decimals: int = 0) -> str:
    return f"{value:,.{decimals}f}".replace(",", "_").replace(".", ",").replace("_", ".")


class Informe:
    def __init__(self, data: dict, output: Path):
        self.d = data
        self.c = canvas.Canvas(str(output), pagesize=A4, pageCompression=1)
        self.c.setTitle("Maven | Infraestructura, rendimiento y capacidad")
        self.c.setAuthor("Maven")
        self.c.setSubject("Diagnóstico verificado del 24 de noviembre de 2026")
        self.page = 0
        self.extra_load_page = len(data["livekit"].get("casos", [])) > 2
        self.page_count = 9 if self.extra_load_page else 8

    def text(self, text: str, x: float, top: float, width: float = CW,
             size: float = 10, leading: float | None = None, color=INK,
             bold: bool = False) -> float:
        style = ParagraphStyle("body", fontName="Helvetica-Bold" if bold else "Helvetica",
                               fontSize=size, leading=leading or size * 1.42,
                               textColor=color, alignment=TA_LEFT, spaceAfter=0)
        p = Paragraph(text, style)
        _, height = p.wrap(width, H)
        if top - height < 46:
            raise ValueError(f"Contenido fuera del área útil en página {self.page} (y={top:.1f}, alto={height:.1f}): {text[:65]}")
        p.drawOn(self.c, x, top - height)
        return top - height

    def rect(self, x, top, width, height, fill=LIGHT, radius=10, stroke=None):
        self.c.setFillColor(fill)
        self.c.setStrokeColor(stroke or fill)
        self.c.roundRect(x, top - height, width, height, radius,
                         fill=1, stroke=int(stroke is not None))

    def page_start(self, number, tag, title, subtitle=None):
        if self.page:
            self.c.showPage()
        self.page += 1
        number = self.page
        self.c.setFillColor(NAVY)
        self.c.rect(0, H - 57, W, 57, fill=1, stroke=0)
        self.c.setFillColor(LIME)
        self.c.setFont("Helvetica-Bold", 20)
        self.c.drawString(M, H - 36, "Maven")
        self.c.setFillColor(WHITE)
        self.c.setFont("Helvetica", 8)
        self.c.drawRightString(W - M, H - 32, "INFRAESTRUCTURA  /  24 NOV 2026")
        self.c.setStrokeColor(LINE)
        self.c.line(M, 40, W - M, 40)
        self.c.setFillColor(MUTED)
        self.c.setFont("Helvetica", 7.5)
        state = self.d["delivery"]["estado"]
        self.c.drawString(M, 26, f"Maven  |  Informe de auditoría  |  Entrega: {state}")
        self.c.drawRightString(W - M, 26, f"{number} / {self.page_count}")
        y = self.text(tag.upper(), M, H - 82, size=8.5, color=MUTED, bold=True)
        y = self.text(title, M, y - 12, size=25, leading=29, color=NAVY, bold=True)
        if subtitle:
            y = self.text(subtitle, M, y - 12, size=10.5, color=MUTED)
        return y - 23

    def label(self, text, top):
        return self.text(text, M, top, size=13, bold=True, color=NAVY) - 12

    def note(self, text, top, height=62, fill=LIGHT):
        self.rect(M, top, CW, height, fill)
        self.text(text, M + 14, top - 12, CW - 28, size=9.5)
        return top - height - 18

    def table(self, headers, rows, widths, top, size=9.2):
        self.c.setFillColor(NAVY)
        self.c.rect(M, top - 34, CW, 34, fill=1, stroke=0)
        x = M
        for h, width in zip(headers, widths):
            self.text(h, x + 9, top - 8, width - 17, size=8.5,
                      leading=10, bold=True, color=WHITE)
            x += width
        y = top - 34
        for index, row in enumerate(rows):
            heights = []
            for item, width in zip(row, widths):
                p = Paragraph(str(item), ParagraphStyle("cell", fontName="Helvetica",
                             fontSize=size, leading=size * 1.35))
                heights.append(p.wrap(width - 18, H)[1])
            height = max(heights) + 19
            self.c.setFillColor(LIGHT if index % 2 == 0 else WHITE)
            self.c.rect(M, y - height, CW, height, fill=1, stroke=0)
            x = M
            for item, width in zip(row, widths):
                self.text(str(item), x + 9, y - 9, width - 18, size=size,
                          leading=size * 1.35)
                x += width
            y -= height
        return y - 18

    def metric(self, x, top, width, value, label, note=""):
        self.rect(x, top, width, 105)
        self.text(value, x + 14, top - 11, width - 28, size=27, color=NAVY, bold=True)
        self.text(label, x + 14, top - 47, width - 28, size=10, bold=True)
        if note:
            self.text(note, x + 14, top - 76, width - 28, size=8, color=MUTED)

    def cover(self):
        y = self.page_start(1, "Diagnóstico ejecutivo", "Mejorar hoy.\nCrecer con evidencia.".replace("\n", "<br/>"),
                            "Qué está funcionando, qué se está corrigiendo y qué falta para crecer cinco o diez veces.")
        self.rect(M, y, CW, 86, NAVY)
        headline = ("Los servidores revisados tienen margen hoy.<br/>El ensayo no valida todavía crecer 5x o 10x." if self.d["livekit"].get("casos") else
                    "Hay margen en los servidores revisados.<br/>Los problemas no se resuelven solo comprando más capacidad.")
        self.text(headline,
                  M + 17, y - 16, CW - 34, size=15, leading=21, color=WHITE, bold=True)
        y -= 108
        gap = 10
        width = (CW - 2 * gap) / 3
        self.metric(M, y, width, "51", "personas habilitadas", "Equipo actual")
        self.metric(M + width + gap, y, width, "33", "pico observado", "Personas con muestra/minuto")
        self.metric(M + 2 * (width + gap), y, width, "165 / 330", "metas de ensayo", "5x / 10x del pico observado")
        y -= 130
        items = [
            ("1. Corregir fallos concretos", "Reintentos de llamadas, consultas repetidas, bloqueo de cuentas y un monitor que ocultaba un error."),
            ("2. Proteger antes de ampliar clientes", "Separar los datos de cada empresa, validar una restauración y completar la revisión del servidor web."),
            ("3. Medir la experiencia completa", "Un servidor con poca carga no garantiza que la app sea fluida en Windows, Mac o una conexión inestable.")]
        for title, body in items:
            y = self.text(title, M, y, size=11.5, bold=True) - 5
            y = self.text(body, M, y, size=10) - 18
        y = self.note("<b>Estado de entrega:</b> " + escape(self.d["delivery"]["resumen"]), y, 66)
        pages = "5 a 7" if self.extra_load_page else "5 y 6"
        self.text("No se certifica todavía una operación completa con 330 participantes simultáneos. Los ensayos y sus límites se detallan en las páginas " + pages + ".",
                  M, y, size=9, color=MUTED)

    def baseline(self):
        b = self.d["baseline"]
        y = self.page_start(2, "Cuánto se usa Maven", "El punto de partida real", self.d["ventana_local"] + ".")
        rows = [
            ["Personas habilitadas", n(b["habilitados"]), "255", "510"],
            ["Personas activas en la API / día", n(b["activos_api_24h"]), "230", "460"],
            ["Personas con llamadas / día", n(b["usuarios_llamadas_24h"]), "195", "390"],
            ["Pico de personas con muestra/minuto", "33", "165", "330"],
            ["Pico de salas con muestra/minuto", "23", "115", "230"]]
        y = self.table(["Medida", "Observado", "Meta 5x", "Meta 10x"], rows, [CW - 192, 64, 64, 64], y)
        y = self.note("<b>Personas registradas, activas y simultáneas son medidas diferentes.</b> Hay 72 cuentas de acceso y 52 perfiles de equipo no borrados; 51 están habilitados. Un minuto de muestras aproxima el pico, pero no prueba simultaneidad exacta.", y, 77)
        y = self.label("Una carga alta de peticiones para este tamaño de equipo", y)
        y = self.text(f"<b>{n(b['api_solicitudes'])} peticiones al día: 36,2 por segundo de media.</b> Multiplicar sin optimizar daría 180,8/s a 5x y 361,6/s a 10x. El pico no se midió; no es un pronóstico tras las mejoras ni una previsión de gasto.", M, y, size=10) - 18
        maxvalue = max(r["solicitudes"] for r in b["api_rutas"])
        for r in b["api_rutas"]:
            self.text(r["nombre"], M, y, 170, size=9.5)
            self.rect(M + 175, y - 2, 242, 12, LIGHT, 3)
            self.rect(M + 175, y - 2, 242 * r["solicitudes"] / maxvalue, 12, BLUE, 3)
            self.text(n(r["solicitudes"]), M + 427, y, 80, size=9.2)
            y -= 24
        y -= 9
        self.note("<b>Base de datos, instantánea:</b> 4.019 MB; 36 conexiones de 160, solo 2 activas. En 24 horas hubo 2.580 respuestas 5xx (0,083 %) y ningún 429 por límite de peticiones. La instantánea no revela los picos de recursos del día ni certifica el crecimiento.", y, 79)

    def architecture(self):
        y = self.page_start(3, "Mapa de servicios", "Cómo se conecta Maven", "La app de escritorio y la web dependen de varios servicios. Cada uno requiere una comprobación distinta.")
        central_y = y
        self.rect(M + 140, central_y, CW - 280, 64, NAVY)
        self.text("Maven", M + 150, central_y - 11, CW - 300, size=17, bold=True, color=WHITE)
        self.text("Mac · Windows · navegador", M + 150, central_y - 37, CW - 300, size=8.2, color=WHITE)
        nodes = [
            (M, central_y - 103, "Web / Dokploy", "Interfaz y actualizaciones\nServidor 147.93.3.97"),
            (M + 174, central_y - 103, "Supabase", "Accesos, datos y permisos\nProducción en us-east-1"),
            (M + 348, central_y - 103, "LiveKit / Miami", "Audio, vídeo y pantallas\nSt. Louis como alternativa"),
            (M + 86, central_y - 208, "NAS / archivos", "Almacenamiento de documentos\nRecuperación por validar"),
            (M + 260, central_y - 208, "ONLYOFFICE", "Edición de documentos\nRecorrido completo por probar")]
        self.c.setStrokeColor(LINE)
        self.c.setLineWidth(1.5)
        for x, top, title, body in nodes:
            self.c.line(W / 2, central_y - 64, x + 80, top)
        for x, top, title, body in nodes:
            self.rect(x, top, 161, 76, LIGHT)
            self.text(title, x + 11, top - 10, 139, size=10.5, bold=True)
            self.text(body.replace("\n", "<br/>"), x + 11, top - 30, 139, size=8.3, color=MUTED)
        y = central_y - 309
        s = self.d["servidores"]
        rows = [
            ["Miami / llamadas", f"{n(s['miami']['cpu_24h_promedio_pct'], 2)} % CPU media; {n(s['miami']['cpu_10min_max_pct'], 2)} % máximo de muestras de 10 min.", "0 reinicios; sin falta de memoria."],
            ["St. Louis / alternativa", "8 núcleos; 23,47 GiB RAM; 6 % disco usado.", "Responde; no es una prueba de capacidad."],
            ["NAS / archivos", "73 % y 71 % de uso; 13,87 TB libres en conjunto.", "Salud responde; restauración no validada."],
            ["Web / entrada", "Una muestra pública: 209 ms de respuesta y transferencia.", "Sin acceso SSH para revisar por dentro."]]
        y = self.table(["Servicio", "Comprobado", "Límite de la evidencia"], rows, [119, 202, CW - 321], y, 8.5)
        self.text("Miami: 143 muestras de recursos; el máximo por intervalos no descarta picos breves. Los 13,87 TB son almacenamiento libre, no una copia de seguridad. KASH es el primer cliente de Maven.", M, y, size=8.7, color=MUTED)

    def repairs(self):
        y = self.page_start(4, "Qué cambia", "Siete frentes de reparación", "La etiqueta de cada punto distingue trabajo preparado de publicación verificada.")
        for idx, item in enumerate(self.d["reparaciones"], 1):
            self.rect(M, y, 28, 28, LIME, 8)
            self.text(str(idx), M + 9, y - 5, 18, size=12, bold=True, color=NAVY)
            x = M + 40
            self.text(escape(item["nombre"]), x, y, CW - 40, size=11.5, bold=True)
            line = f"{escape(item['accion'])} <font color='#607084'>[{escape(item['estado'])}]</font>"
            end = self.text(line, x, y - 21, CW - 40, size=9.5, leading=13)
            y = min(y - 69, end - 17)
        bundle = self.d["bundle"]
        if bundle.get("reduccion_gzip_pct") is not None:
            summary = f"<b>{n(bundle['reduccion_gzip_pct'], 1)} % menos bytes comprimidos en la medición indicada.</b> " + escape(bundle["nota"])
        else:
            summary = "<b>Cómo se confirma el resultado:</b> pruebas que reproducen cada fallo, compilación, publicación y revisión del servicio activo. Reducir bytes descargados no permite prometer el mismo porcentaje de mejora en velocidad."
        self.note(summary, y, 74)

    def calls(self):
        y = self.page_start(5, "Llamadas e internet", "Hay dos problemas que separar", "Una red inestable y una app que se atasca pueden sentirse igual. Los datos muestran señales de ambos.")
        l = self.d["llamadas"]
        self.metric(M, y, (CW - 12) / 2, "92,18 %", "muestras excelentes", "17.418 muestras; ventana aproximada")
        self.metric(M + (CW + 12) / 2, y, (CW - 12) / 2, "3,36 %", "muestras de mala calidad", "Afectan a 23 personas en la muestra")
        y -= 125
        y = self.text("<b>También hay retrasos dentro de la app:</b> en las muestras de mala calidad, la red promedió 154 ms, mientras el atraso del procesamiento de la interfaz llegó a 1.470 ms en el percentil 95. No corresponde atribuir todo al internet del cliente.", M, y, size=10) - 20
        y = self.label("Miami está mejor ubicado para el uso observado", y)
        y = self.table(["Región", "Latencia media del sondeo", "Muestra"],
                       [["Miami", "84,2 ms", "Ganó en 95,9 % de comparaciones"],
                        ["St. Louis", "124,0 ms", "1.884 mediciones de 39 personas"]],
                       [105, 175, CW - 280], y, 9)
        y = self.text("Un sondeo de red no sustituye una llamada de audio y vídeo de extremo a extremo.", M, y, size=8.8, color=MUTED) - 20
        test = self.d["livekit"]
        y = self.label(escape(test["titulo"]), y)
        y = self.text(escape(test["resumen"]), M, y, size=10) - 14
        cases = test.get("casos", [])
        if self.extra_load_page:
            y = self.note("Los resultados de cada nivel de carga y el alcance del laboratorio se muestran en la página siguiente. Se distinguen las conexiones de prueba de una operación real con cámaras, pantallas y redes variables.", y, 73)
        elif cases:
            rows = [[str(x.get("participantes", "-")), str(x.get("duracion", "-")),
                     escape(str(x.get("resultado", "Sin resultado")))] for x in cases]
            y = self.table(["Participantes", "Duración", "Resultado observado"], rows,
                           [90, 85, CW - 175], y, 8.7)
        else:
            y = self.note("<b>Sin resultado certificado aún.</b> El ensayo separado debe medir conexiones, estabilidad, recursos y recuperación con 165 y 330 participantes, sin usar las salas de los clientes para generar carga.", y, 73)
        self.text(escape(test["limites"]) + " " + escape(test["entorno"]), M, y, size=8.8, color=MUTED)

    def load_test(self):
        test = self.d["livekit"]
        y = self.page_start(6, "Laboratorio de llamadas", "Resultados del simulacro", "Mediciones del ensayo aislado. No son una garantía comercial de capacidad ni una medición de toda la aplicación.")
        y = self.text(escape(test["resumen"]), M, y, size=11) - 23
        rows = [[escape(str(x.get("participantes", "-"))) +
                 (f"<br/>{int(x['salas'])} salas" if x.get("salas") is not None else ""),
                 escape(str(x.get("duracion", "-"))),
                 escape(str(x.get("resultado", "Sin resultado")))] for x in test["casos"]]
        y = self.table(["Conexiones", "Duración", "Resultado observado"], rows, [81, 73, CW - 154], y, 8.8)
        if test.get("duracion_nota"):
            y = self.text(escape(test["duracion_nota"]), M, y, size=8.1, color=MUTED) - 14
        y = self.label("Cómo se hizo", y)
        y = self.text(escape(test["entorno"]), M, y, size=9.2) - 8
        if test.get("topologia"):
            y = self.text(escape(test["topologia"]), M, y, size=9.2) - 8
        if test.get("ensayo_previo"):
            y = self.text(escape(test["ensayo_previo"]["nota"]), M, y, size=8.6, color=MUTED) - 13
        y = self.text("<b>Límite:</b> " + escape(test["limites"]), M, y, size=9.1) - 15
        self.text("<b>Siguiente paso:</b> " + escape(test.get("siguiente", "Validar el recorrido completo con aplicaciones y redes reales.")), M, y, size=9.2)

    def sql_monitoring(self):
        y = self.page_start(6, "Ensayos y vigilancia", "Qué se probó y qué sigue activo", "Una prueba de permisos, una prueba de carga y un monitor de salud responden preguntas distintas.")
        y = self.label("Roles y Cowork: ensayo con datos sintéticos", y)
        y = self.text("Se compararon los accesos de dueño, delegado, empleado, anfitrión y personas sin permiso o de otra empresa. La muestra incluyó varias posiciones, denegaciones y cuentas deshabilitadas; sin escribir sobre personas reales.", M, y, size=10) - 16
        rows = [[x["escala"], n(x["personas"]), n(x["asignaciones"]),
                 n(x["actual_ms"], 2) + " ms", n(x["experimental_ms"], 2) + " ms"] for x in self.d["sql"]["casos"]]
        y = self.table(["Escala", "Personas", "Asignaciones", "Consulta actual", "Experimento"], rows,
                       [48, 64, 105, 137, CW - 354], y, 9)
        y = self.note("<b>Se descartó la optimización experimental.</b> Conservó los accesos de la muestra, pero no mejoró de forma consistente. Son medianas de cinco lecturas locales secuenciales: 520 personas en datos no son 520 usuarios concurrentes ni una garantía para 330 llamadas.", y, 76)
        y = self.text("<b>La demora anterior de Cowork ya estaba corregida:</b> desde el 23/11 a las 19:00 UTC hasta las 06:00 UTC del 24/11 hubo 466 respuestas correctas, cero errores y un tiempo P95 de 115 ms. Es resultado de la entrega previa, no de esta auditoría.", M, y, size=9.5) - 19
        y = self.label("Los monitores están funcionando", y)
        rows = [[x["nombre"], x["cada"], n(x["ejecuciones"])] for x in self.d["monitores"]]
        y = self.table(["Monitor", "Frecuencia", "Ejecuciones / 24 h"], rows, [225, 120, CW - 345], y, 9)
        self.text("<b>No se encontró un simulacro periódico de usuarios</b> en los cron ni en el CI revisado. El proyecto de simulacro existe, pero mantenerlo encendido y recibir respuestas de salud no prueba la experiencia completa.", M, y, size=9.3)

    def risks(self):
        y = self.page_start(7, "Siguiente nivel", "Lo que falta antes de crecer", "Priorizar evidencia, recuperación y separación entre empresas. Sin estimar costes que todavía no se han medido.")
        for r in self.d["riesgos"]:
            self.text(escape(r["prioridad"]).upper(), M, y, size=8, bold=True, color=AMBER)
            y = self.text(escape(r["nombre"]), M, y - 15, size=12, bold=True) - 6
            y = self.text(escape(r["detalle"]), M, y, size=9.3) - 5
            y = self.text("<b>Acción:</b> " + escape(r["siguiente"]), M, y, size=9.3) - 21
        self.note("<b>Orden recomendado:</b> primero cerrar fallos y verificar la entrega; después aislamiento entre empresas y restauración; luego validar 165 participantes y, con el resultado, avanzar a 330. Comprar recursos solo cuando las pruebas identifiquen el límite.", y, 79)

    def decisions(self):
        y = self.page_start(8, "Decisiones del negocio", "Cuatro elecciones para avanzar", "Puedes marcar una respuesta por pregunta en un lector de PDF compatible. Estas elecciones no realizan compras ni cambian producción.")
        questions = [
            ("audio_red", "1. Si la conexión empeora, ¿qué priorizamos?", [
                ("audio", "Mantener el audio y reducir vídeo automáticamente (recomendado)."),
                ("preguntar", "Avisar y dejar que la persona elija la calidad.")]),
            ("recuperacion", "2. ¿Qué nivel de recuperación quieres presupuestar?", [
                ("mismo_dia", "Recuperar el servicio el mismo día y medir la pérdida máxima de datos."),
                ("una_hora", "Evaluar recuperación en menos de una hora y su coste adicional.")]),
            ("capacidad", "3. ¿Cuál será la primera meta de capacidad en las pruebas?", [
                ("165", "165 participantes; luego ampliar a 330 con evidencia (recomendado)."),
                ("330", "Preparar desde ahora la validación completa de 330 participantes.")]),
            ("simulacros", "4. ¿Qué programa de pruebas periódicas cotizamos?", [
                ("semanal", "Recorrido semanal y ensayo de carga antes de cambios importantes."),
                ("diario", "Recorrido diario y ensayo mensual de carga, con presupuesto previo.")])]
        for name, question, choices in questions:
            y = self.text(question, M, y, size=10.5, bold=True) - 11
            for value, label in choices:
                self.c.acroForm.radio(name=name, value=value, selected=False,
                                     tooltip=question, x=M + 2, y=y - 13, size=12,
                                     buttonStyle="circle", borderWidth=1,
                                     borderColor=MUTED, fillColor=WHITE,
                                     textColor=NAVY, fieldFlags="radio noToggleToOff")
                y = self.text(escape(label), M + 24, y, CW - 24, size=9.1) - 10
            y -= 13
        y = self.label("Fuentes y alcance", y)
        self.c.setStrokeColor(LINE)
        self.c.line(M, y + 5, W - M, y + 5)
        for source in self.d["fuentes"]:
            label = escape(source["titulo"])
            if source.get("url"):
                label = f'<link href="{escape(source["url"], {chr(34): "&quot;"})}" color="#243A55">{label}</link>'
            y = self.text(label + ". " + escape(source["referencia"]), M, y - 3, size=7.7, leading=10.4) - 3
        delivery = self.d["delivery"]
        revision = delivery.get("commit") or self.d["base_revision"] + " (base revisada)"
        self.text("Ventana principal: " + escape(self.d["ventana"]) + ". Las muestras de servidores y de calidad indican su propio alcance. Revisión: " + escape(revision) + ". No se incluyen contraseñas, identificadores personales ni contenido de los clientes.", M, y - 5, size=7.5, leading=10.2, color=MUTED)

    def build(self):
        pages = [self.cover, self.baseline, self.architecture, self.repairs, self.calls]
        if self.extra_load_page:
            pages.append(self.load_test)
        pages.extend([self.sql_monitoring, self.risks, self.decisions])
        for page in pages:
            page()
        self.c.save()


def main():
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--datos", type=Path, default=root / "docs/audits/infraestructura-2026-11-24.json")
    parser.add_argument("--salida", type=Path, default=Path.home() / "Documents/Codex/output/pdf/Maven-infraestructura-y-capacidad-2026-11-24.pdf")
    args = parser.parse_args()
    data = json.loads(args.datos.read_text(encoding="utf-8"))
    if data.get("schema_version") != 1:
        raise ValueError("Versión de fuente de datos no compatible")
    args.salida.parent.mkdir(parents=True, exist_ok=True)
    Informe(data, args.salida).build()
    print(f"PDF generado: {args.salida}")


if __name__ == "__main__":
    main()
