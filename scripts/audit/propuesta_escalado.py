#!/usr/bin/env python3
"""Propuesta reproducible, sin conectarse a producción ni contratar servicios.

Uso: python3 scripts/audit/propuesta_escalado.py --salida /ruta/informe.pdf
Tarifas consultadas el 24/11/2026. Las capacidades por nodo NO están medidas.
"""
import argparse
import json
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.lib import colors
from informe_infraestructura import Informe, W, H, M, CW, NAVY, LIME, INK, MUTED, LIGHT, LINE, WHITE

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'docs/audits/escalado-2026-11-24'

def num(x, decimals=0):
    return f'{x:,.{decimals}f}'.replace(',', '_').replace('.', ',').replace('_', '.')

def money(x):
    return 'US$ ' + num(x)

def band(xs):
    return money(xs[0]) + ' - ' + num(xs[1])


class Propuesta(Informe):
    def __init__(self, data, output):
        super().__init__({'delivery': {'estado':'propuesta'}, 'livekit':{}}, output)
        self.model = data
        self.page_count = 15
        self.c.setTitle('Maven | Plan de estabilidad y crecimiento: 230 a 10.000')
        self.c.setSubject('Propuesta técnica y presupuesto orientativo. 24 de noviembre de 2026.')

    def start(self, tag, title, subtitle=''):
        if self.page:
            self.c.showPage()
        self.page += 1
        self.c.setFillColor(NAVY)
        self.c.rect(0, H-57, W, 57, fill=1, stroke=0)
        self.c.setFillColor(LIME)
        self.c.setFont('Helvetica-Bold', 20)
        self.c.drawString(M, H-36, 'Maven')
        self.c.setFillColor(WHITE)
        self.c.setFont('Helvetica', 8)
        self.c.drawRightString(W-M, H-32, 'PLAN DE CRECIMIENTO  /  24 NOV 2026')
        self.c.setStrokeColor(LINE)
        self.c.line(M, 40, W-M, 40)
        self.c.setFillColor(MUTED)
        self.c.setFont('Helvetica', 7.5)
        self.c.drawString(M, 26, 'Propuesta para decisión | USD | Capacidad y gastos aún por validar')
        self.c.drawRightString(W-M, 26, f'{self.page} / {self.page_count}')
        y = self.text(tag.upper(), M, H-82, size=8.5, bold=True, color=MUTED)-12
        y = self.text(title, M, y, size=25, leading=29, bold=True, color=NAVY)-12
        if subtitle:
            y = self.text(subtitle, M, y, size=10.2, color=MUTED)-16
        return y

    def p(self, text, y, size=9.7):
        return self.text(text, M, y, size=size)-12

    def item(self, title, text, y):
        y = self.text(title, M, y, size=11.1, bold=True, color=NAVY)-5
        return self.p(text, y)

    def cover(self):
        y=self.start('La decisión principal', 'Primero estabilidad.<br/>Después, crecer con pruebas.',
                     'Plan para 230, 1.000, 3.000 y 10.000 personas simultáneas. Revisión adicional del código y servicios reales.')
        y=self.note('<b>Recomendación:</b> cerrar las caídas actuales y validar 230 personas antes de contratar capacidad para miles. Comprar hardware sin corregir llamadas, supervisión y tareas de fondo dejaría problemas abiertos.',y,80,fill=LIGHT)
        y=self.table(['Decisión recibida','Cómo se incorpora'],[
            ['Conexión que empeora','Priorizar audio y reducir video automáticamente; recuperar calidad de forma gradual.'],
            ['Recuperación del servicio','Evaluar menos de una hora. Propuesta: hasta 15 min de datos y 1 h de archivos pendientes de copiar.'],
            ['Primera meta','230 personas simultáneas, con sus conexiones adicionales de supervisión. No está certificada todavía.'],
            ['Pruebas periódicas','Recorrido diario y carga mensual aislada, con presupuesto previo; revisión antes de cambios importantes.']
        ],[143,CW-143],y,size=9.5)
        y=self.item('Tres problemas que una máquina más grande no resuelve',
                    'La excepción de calidad HD en llamadas; Promolog sin cobertura fiable; la estructura de nuevas empresas que aún falta desplegar y probar.',y)
        y=self.p('<b>Qué contiene este documento:</b> compras por etapa, modelo de costos reproducible, recuperación, funciones pausadas, pruebas de aprobación y trabajo técnico. Los importes son reservas de planificación, no una cotización cerrada ni capacidad garantizada.',y)
        self.note('Esta revisión produjo una propuesta y evidencia de solo lectura. Las correcciones de la auditoría anterior siguen publicadas; este documento no representa nuevas activaciones, compras o ampliaciones.',y,65)

    def findings(self):
        y=self.start('Base comprobada', 'Qué hay hoy y qué encontramos', 'Lecturas del 24/11/2026. Separar evidencia real de diseño pendiente evita comprar sobre una suposición.')
        y=self.table(['Pieza','Estado y consecuencia'],[
            ['Personas y llamadas','51 habilitadas; pico previo de 33 usuarios con muestra por minuto. No es un censo exacto de simultáneos.'],
            ['Miami y San Luis','Miami: 4 CPU / ~8 GB. San Luis: 8 CPU / ~24 GB y ONLYOFFICE. No hay conmutación automática demostrada entre ellos.'],
            ['Pruebas anteriores','33 conexiones completaron el ensayo corto. 165/330 perdieron calidad en un laboratorio de 2 CPU con fallos del generador. No certifica ni condena producción.'],
            ['Base de KASH','~4,23 GB; 45 de 160 conexiones en la nueva instantánea, 2 activas. No es capacidad máxima.'],
            ['Nuevas empresas','La base del edificio existe, pero faltan el árbol de organizaciones y funciones relacionadas. Código previsto no equivale a servicio desplegado.'],
            ['Promolog','246 filas en 7 días: 243 con error de lectura de X. Sin nuevas entradas IG, Telegram o Facebook en esa ventana.'],
            ['Argos','687 rondas en 24 h; 238 registraron trabajo pendiente por presupuesto. Tope actual: US$ 1,50/día.'],
            ['Recuperación','Drive cataloga 33,2 TB. No se ha demostrado restauración ni se confirmó la configuración real de PITR.']
        ],[125,CW-125],y,size=9.1)
        self.note('<b>Ya entregado en la auditoría anterior:</b> reconexión/presencia, menor carga inicial, consultas de chat, limpieza de cachés privadas y monitores. 4.530 pruebas aprobadas. No sustituye la llamada real entre dos equipos.',y,70)

    def calls(self):
        y=self.start('Prioridad 0', 'Que una mala red no arruine la llamada', 'El objetivo es conservar una conversación útil y recuperarla; no prometer que internet nunca falle.')
        for title,body in [
            ('1. Aplicar la misma política en Cowork, Meet y llamada directa',
             'Ya existen video adaptable y varias calidades. Sin embargo, la política propia conserva HD en Meet/llamadas por UDP ante mala subida. Quitar esa excepción y probar audio primero, cámara de menor calidad y menos cuadros.'),
            ('2. Reaccionar rápido, sin saturar la base',
             'Separar decisiones locales cada 2-5 s de informes agregados cada 30-60 s. Hoy parte de la política depende de muestras cada minuto. Evitar cambios constantes de calidad con umbrales de entrada/salida.'),
            ('3. Respetar lo que la persona había apagado',
             'La reconexión completa reutiliza opciones iniciales. Hay riesgo de volver con un estado anterior de micrófono/cámara; falta reproducirlo. Guardar la última intención y comprobar también cambio de sala y salida voluntaria.'),
            ('4. Recuperar sin una avalancha de intentos',
             'Reintentos escalonados con dispersión aleatoria, autorización nueva cuando corresponde y cancelación al salir. Un permiso denegado debe explicar el motivo, sin reintento infinito.'),
            ('5. Compartir pantalla con texto legible',
             'Ante congestión, reducir primero cuadros y cámara; conservar legibilidad de la pantalla. Probar selector, publicación, recepción y ventana flotante en Mac y Windows. No forzar una nueva captura sin permiso del sistema.'),
            ('6. Probar las redes que hoy fallan',
             'Wi-Fi débil, cambio de red, suspensión y redes que bloquean UDP. Validar audio por TURN/TLS 443. El chequeo de puertos anterior no demuestra una llamada completa por esa ruta.')]:
            y=self.item(title,body,y)
        self.note('<b>Prueba de éxito:</b> escuchar a ambos lados, recibir pantalla, conservar controles apagados y recuperar tras el corte. Registrar versión, red y causa observada; no culpar automáticamente a la computadora.',y,65)

    def architecture(self):
        y=self.start('Arquitectura por etapas', 'Qué cambia al pasar a cada nivel', 'Las cifras se refieren a personas simultáneas distribuidas entre empresas y salas, nunca a 10.000 cámaras en una sola reunión.')
        y=self.table(['Meta','Cambio necesario','Antes de aprobar'],[
            ['230','Laboratorio separado, política de red, monitores medidos, copia externa. Probar servidor actual de 4 CPU y candidato dedicado de 8 CPU.','Jornada sostenida, Mac/Windows, pantalla, TURN y recuperación.'],
            ['1.000','Repartir salas entre varios servidores; entrada estable; Redis redundante; colas y trabajadores separados para IA, documentos y grabación.','Una máquina puede fallar sin perder toda la capacidad; aislamiento entre empresas.'],
            ['3.000','Ampliación por carga, límites por cliente, reserva real y retiro gradual de nodos. Datos y tareas pesadas fuera de la respuesta interactiva.','Prueba de reconexión masiva; costo por sesión; restauración y alertas operativas.'],
            ['10.000','Grupos de clientes que no se derriben entre sí, zonas independientes y regiones según uso. Personal responsable de incidentes y acuerdos de servicio.','Prueba distribuida, límites autorizados por proveedores, pérdida de zona y plan de retorno.']
        ],[48,253,CW-301],y,size=9.2)
        y=self.item('Separación que propongo',
             'App y APIs → datos/autorizaciones. Llamadas → servidores de medios + rutas de respaldo. Grabación/IA/Promolog/documentos → trabajadores con colas. Archivos → origen y copia externa accesible. Pruebas → máquinas independientes.',y)
        y=self.p('LiveKit autónomo distribuye salas entre nodos mediante Redis, pero cada sala debe caber en un nodo. El servidor adicional debe absorber la carga de uno caído; no basta escribir “reserva” en el diagrama. [1]',y)
        self.note('No usar San Luis como si estuviera dedicado a llamadas: aloja documentos. Tampoco cambiar una URL de región equivale a trasladar una llamada viva sin corte.',y,60)

    def assumptions(self):
        y=self.start('Cómo se calcula', 'Personas, conexiones y tráfico', 'Son supuestos explícitos para preparar presupuesto; se reemplazarán con datos del ensayo de 230.')
        y=self.table(['Variable','Supuesto de la propuesta'],[
            ['Actividad','8 h/día × 22 días = 176 h/mes. Es un techo de uso sostenido, no una previsión de ventas.'],
            ['Dos escenarios','Mixto: 20% en medios; intensivo: 100%. Todos continúan usando la app.'],
            ['Supervisión','5% de personas como anfitriones con 12 salas monitorizadas cada uno; se redondea el número de supervisores hacia arriba.'],
            ['Tráfico recibido','1,5 Mbps agregados por persona en medios + 0,5 Mbps por monitor; reserva adicional de 20%. No es 1,5 Mbps por cada cámara.'],
            ['Servidor candidato','8 CPU dedicadas / 16 GB: US$ 160/mes. Capacidad por nodo q=100 o q=250 conexiones SOLO como sensibilidad financiera, aún sin medir.'],
            ['Reserva de continuidad','Nodos = techo(conexiones / q) + 1. La capacidad segura y la recuperación se tienen que demostrar.']
        ],[105,CW-105],y,size=9.2)
        rows=[]
        for r in self.model['niveles']:
            a=r['intensivo']
            rows.append([num(r['concurrentes']),str(r['supervisores_supuestos']),num(r['monitores_extra']),num(a['conexiones_media_con_monitores']),num(a['media_gb']/1000,1)+' TB'])
        y=self.table(['Personas','Supervis.','Monitores','Conexiones*','Tráfico/mes*'],rows,[78,75,83,105,CW-341],y,size=9.1)
        y=self.p('* Escenario intensivo. 230 personas son 374 conexiones en este modelo, no 230. Un monitor abre su propia conexión. Ocultar video reduce datos, pero no cierra esa conexión.',y,size=9.1)
        self.note('Monitores: 0,5 Mbps por sala es un supuesto ligero; ensayar también hasta 3 Mbps y varias pistas. Ambos escenarios conservan el mismo 5% de supervisores. Uso 24/7 multiplica horas por ~4,15. Recortar supervisión requiere decisión de producto.',y,70)

    def budgets(self):
        y=self.start('Reserva mensual orientativa', 'Cuánto apartar en cada nivel', 'USD, sin impuestos. Reserva de infraestructura base modelada, no “costo adicional” sobre tu factura. Incluye 25% de contingencia y redondeo hacia arriba.')
        rows=[]
        for r in self.model['niveles']:
            rows.append([num(r['concurrentes']),band(r['mixto']['con_contingencia_25']),band(r['intensivo']['con_contingencia_25'])])
        y=self.table(['Personas simultáneas','Mixto: 20% en medios','Intensivo: 100%'],rows,[120,195,CW-315],y,size=10)
        y=self.p('<b>Estos rangos no son precios cerrados ni garantías.</b> La mayor incertidumbre es cuántas conexiones seguras soporta cada nodo con Maven. Se calculan con q=100 y q=250 sin medir; el ensayo puede reducir o aumentar lo necesario.',y)
        rows=[]
        labels=['Llamadas: nodos candidatos','Tráfico: reserva sin descontar cuota','App, balanceo, Redis, TURN y trabajos','Bases y recuperación temporal','Realtime / exceso de uso','Copia externa de ~33,2 TB','Infraestructura de pruebas periódicas']
        for idx,label in enumerate(labels):
            vals=[]
            for r in self.model['niveles']:
                a=r['intensivo'];v=[band([160*x for x in a['nodos_hipoteticos']]),money(a['media_reserva_usd']),band(r['app_reserva']),band(r['bd_reserva']),band(r['realtime_reserva']),money(300),band(r['pruebas_reserva'])][idx]
                vals.append(v.replace('US$ ',''))
            rows.append([label]+vals)
        y=self.table(['Partida sin contingencia','230','1.000','3.000','10.000'],rows,[169,75,75,83,CW-402],y,size=8.1)
        y=self.p('App/Realtime/pruebas son provisiones de ingeniería, no cotizaciones de proveedores. Bases: KASH y edificio, laboratorio, PITR en dos proyectos y réplicas según etapa. La copia externa mantiene el volumen actual: nuevos archivos se cotizan aparte.',y,size=8.8)
        self.note('<b>Fuera de estos totales:</b> implementación, operación humana/guardia, Argos/Promolog e IA, grabaciones, correos/licencias existentes, crecimiento del almacenamiento principal, servicio alterno de archivos y acuerdos empresariales. Se detallan en las páginas siguientes. Conciliar facturas antes de calcular el incremento real.',y,80)

    def purchase(self):
        y=self.start('Compra inicial propuesta', 'Primero un laboratorio pequeño', 'No contratar decenas de servidores usando hipótesis. La primera compra debe producir evidencia.')
        y=self.table(['Partida temporal','Referencia pública','Importe'],[
            ['Servidor de ensayo de referencia','4 CPU / 8 GB dedicado, 12 horas × US$ 0,110','US$ 1,32'],
            ['Candidato a comparar','8 CPU / 16 GB dedicado, 12 h × US$ 0,219','US$ 2,63'],
            ['Dos generadores separados','8 CPU / 16 GB cada uno, 24 h × 2 × US$ 0,219','US$ 10,51'],
            ['Transferencia, base de ensayo, variación','Reserva técnica, no tarifa de proveedor','US$ 60,54'],
            ['Tope de piloto propuesto','Solo infraestructura temporal; sin trabajo técnico','US$ 75']
        ],[154,267,CW-421],y,size=9.1)
        y=self.item('Después de aprobar 230',
             'Cotizar el grupo de llamadas con el q seguro medido; dos instancias de la app; estado/Redis con respaldo; grabación y documentos separados; copias/PITR; monitores y pruebas. Reutilizar los recursos que realmente cumplan, sin contar el NAS como laboratorio libre.',y)
        y=self.table(['Referencia verificada [2-5,7]','Tarifa publicada'],[
            ['Vultr dedicado 8 CPU / 16 GB, Miami','US$ 160/mes; 7.168 GB de transferencia del plan.'],
            ['Vultr 2 CPU / 4 GB, compartido','US$ 20/mes; útil como referencia para app/servicios livianos.'],
            ['Supabase Pro / cómputo','US$ 25 base; Large 110, XL210, 2 XL410, 4 XL960/mes, antes de créditos.'],
            ['PITR de 7 días','~US$ 100/mes por proyecto; confirmar qué tienes ya contratado.'],
            ['Backblaze B2, copia externa','Desde US$ 6,95/TB/mes; 33,2 TB ≈ US$ 231, o ~US$ 300 con reserva de versiones.']
        ],[257,CW-257],y,size=9.0)
        self.note('Los US$ 75 no autorizan una contratación. Las tarifas y disponibilidad se vuelven a comprobar al comprar; detener una máquina puede seguir generando cargo. El laboratorio debe tener apagado/retiro programado y alertas.',y,65)

    def managed(self):
        y=self.start('Alternativa de operación', 'Servidores propios o video administrado', 'Comparación del mismo escenario intensivo; el precio de video no cubre el resto de Maven.')
        y=self.table(['Opción','Qué compras','Límite importante'],[
            ['Mantener LiveKit autónomo','Máquinas, tráfico y operación. Permite controlar gasto de un Cowork permanente.','Necesita responsable, capacidad probada, actualizaciones y recuperación.'],
            ['LiveKit Cloud','Transporte de medios administrado y red del proveedor.','Cobro por minutos y datos recibidos; los monitores también cuentan. No arregla el cliente de Maven por sí solo.']
        ],[110,199,CW-309],y,size=9.3)
        y=self.p('Referencia Scale [6]: US$ 500/mes; incluye 1,5 millones de minutos y 3 TB. Excedentes: US$ 0,0004/minuto y US$ 0,10/GB. Hasta 5.000 conexiones publicadas; más requiere acuerdo. No son minutos de IA: son conexiones WebRTC.',y)
        rows=[]
        for r in self.model['niveles']:
            a=r['intensivo'];rows.append([num(r['concurrentes']),num(a['conexiones_media_con_monitores']),num(a['livekit_scale_minutos']/1e6,2)+' M',money(a['livekit_scale_usd']) if a['livekit_scale_usd'] is not None else 'Cotización empresarial'])
        y=self.table(['Personas','Conexiones','Minutos/mes','Solo video Cloud/mes'],rows,[85,93,105,CW-283],y,size=9.3)
        y=self.p('Estimación aritmética con el uso sostenido de la página 5; no oferta del proveedor. Excluye grabación, IA, impuestos y el resto de Maven. Con 10.000 personas este modelo suma 16.000 conexiones: supera el plan público. El cálculo usa TB decimales de forma explícita.',y,size=9.1)
        y=self.item('Mi recomendación',
             'Cotizar ambas rutas para el piloto. Para Cowork encendido toda la jornada, comparar el tráfico antes de migrar. En 3.000-10.000 personas solicitar volumen y soporte empresarial; no asumir que el precio público es el contrato final.',y)
        self.note('Grabación va aparte. Como referencia Cloud Scale: US$ 0,015/minuto de video excedente, con 8.000 min incluidos compartidos con importación. Diez grabaciones paralelas durante 176 h suman 105.600 min: ~US$ 1.464 adicionales, más almacenamiento. [6]',y,80)

    def recovery(self):
        y=self.start('Continuidad del negocio', 'Volver a trabajar en menos de una hora', 'Es una meta a presupuestar y demostrar. No es una garantía vigente.')
        y=self.table(['Servicio','Meta propuesta','Qué comprar o construir'],[
            ['Datos: roles, horas, chat','Volver en <60 min; pérdida ≤15 min.','PITR por proyecto, credenciales/configuración recuperables, procedimiento y ensayo de restauración.'],
            ['Archivos de trabajo','Servicio <60 min; cambios pendientes ≤1 h.','Copia externa versionada y ruta para servir desde ella, inventario y permisos.'],
            ['Llamadas','Recuperación en segundos. Meta nodo: P95 ≤30 s.','Servidor alterno listo, rutas TURN y reconexión probada; una llamada puede sufrir un corte.'],
            ['Grabaciones','Definir segmentos pendientes y recuperación.','Trabajador separado, subida confirmada y conservación. No prometer recuperar audio nunca grabado.']
        ],[111,158,CW-269],y,size=9.3)
        y=self.item('El tamaño cambia la estrategia',
             'Drive cataloga 942.623 archivos  / 33,2 TB. A 1 Gbit/s, descargarlos todos toma al menos 73,8 h; a 10 Gbit/s,7,38 h, incluso antes de demoras. Para <1 h hay que poder trabajar desde la copia o recuperar primero un conjunto crítico.',y)
        y=self.item('Reserva económica',
             'PITR de KASH + edificio: ~US$ 200/mes si ambos se protegen y aún no lo tienen. Copia de 33,2 TB: ~US$ 231/mes; reservar US$ 300 para versiones. El costo del servicio alternativo, copia inicial e implementación se cotiza según el recorrido elegido.',y)
        y=self.p('Supabase Pro incluye respaldo diario, pero no confirmé el historial real ni PITR contratado. PITR documenta hasta 2 min de pérdida bajo su mecanismo; no fija una restauración en 1 h y no incluye los archivos de Storage ni el NAS. [4]',y,size=9.2)
        self.note('<b>Prueba para aprobar:</b> restaurar en entorno aislado, abrir y guardar archivos de ensayo, verificar permisos e integridad, medir tiempo desde el incidente y el último dato recuperado. Una réplica que copia borrados no reemplaza una copia versionada.',y,75)

    def promolog(self):
        y=self.start('Función que pediste revisar', 'Promolog necesita reparación funcional', 'Ventana: 17/11 08:30 a 24/11 08:30, Nueva York. No se activó ningún lector ni proveedor de pago durante esta revisión.')
        y=self.table(['Parte','Evidencia','Acción propuesta'],[
            ['X','246 filas en 7 días;243 con x_read_failed.','Reproducir lectura fallida y validar el camino de proveedor/sesión. No atribuirlo a saldo sin evidencia.'],
            ['Instagram','Lector viejo pausado; agente local sin latido reciente. Última entrada 1/11.','Identificar proceso y sesión actual, probar lote autorizado. No activar rutas antiguas en paralelo.'],
            ['Telegram','Horarios activos; última entrada 1/11.','Probar sesión/canal permitido y resultado final.'],
            ['Facebook','Dos barridos activos, cuatro pausados; última entrada 11/11.','Comprobar objetivo/lector y salida; un 200 no prueba lectura.'],
            ['Reportes','Programados, pero con fuentes incompletas; hubo 2 HTTP500 al enviar WhatsApp.','Mostrar cobertura y fallo de entrega. No enviar conclusiones como si el informe fuera completo.']
        ],[90,181,CW-271],y,size=9.1)
        y=self.item('Orden de recuperación',
             'Inventario de lectores → servicio/sesión → lote pequeño → evidencia guardada → programación con presupuesto → alarma por ausencia de resultados. Revisar tres corridas antiguas atascadas sin repetir automáticamente acciones.',y)
        y=self.item('Qué significa que quede terminado',
             'Cada objetivo tiene resultado trazable: leído, sin publicaciones, acceso no disponible o fallo técnico. Cero duplicados; reintento seguro; aviso si el agente no late en 15 min; costo visible. “No se pudo leer” nunca debe convertirse en “la persona incumplió”.',y)
        self.note('Partida propuesta para piloto de proveedores/IA: hasta US$ 100 por una muestra controlada, previa aprobación; no es costo mensual medido. El antiguo cálculoUS$ 10-20/mes corresponde a otro diseño y no sirve como presupuesto actual. Trabajo técnico estimado:24-60 h.',y,80)

    def modules(self):
        y=self.start('Funciones de fondo', 'Qué recuperar y qué mantener pausado', 'KASH tiene 77 tareas periódicas activas y 20 pausadas. Activa no significa sana; pausada no significa rota.')
        y=self.table(['Grupo','Estado real','Decisión propuesta'],[
            ['Argos','Activo; tope US$ 1,50/día.238 de 687 rondas registraron trabajo pendiente por presupuesto.','Medir costo por revisión/persona-hora. Presupuesto por empresa, cola acotada y alertas al 50/80/100%.'],
            ['WhatsApp','11 tareas periódicas pausadas; la entrada de mensajes sigue activa.','Revisar transcripción, resúmenes y seguimiento una por una. Pruebas con destinatarios de ensayo.'],
            ['Resúmenes personales','alvaro-pulse y baja actividad de Grace pausados.','No activarlos como parte de un aumento de hardware. Definir utilidad/responsable.'],
            ['Webhooks de chat','Pausados y sin destinos. Diseño deliberado.','Activar cuando haya integración concreta configurada y probada.'],
            ['BLU','Retirado por instrucción del 11/11. Último ingreso importado 21/10.','Mantener retirado. Marcar histórico el cruce con ingresos o elegir otra fuente.'],
            ['NAS para nuevos clientes','Tres tareas pausadas deliberadamente; NAS actual de KASH.','Diseñar almacenamiento y costos propios de cada empresa. No mezclar archivos de clientes.']
        ],[110,197,CW-307],y,size=9.1)
        y=self.item('Argos no escala cambiando CPU',
             'La suma de omisiones fue 2.910, pero puede repetir una captura: no son 2.910 imágenes únicas. El contador de analizadas suma 296. Falta medir costo real, filtros y volumen para prometer cobertura al crecer.',y)
        self.note('Construir un panel de salud por función: estado, responsable, última ejecución correcta, cobertura, cola y gasto. Promolog/IA/mensajería son módulos optativos con límites por empresa; no sumarlos automáticamente a toda cuenta de Maven.',y,75)

    def tenants(self):
        y=self.start('Antes de vender a otras empresas', 'Completar el producto, no solo la capacidad', 'Hallazgo nuevo de la inspección directa del edificio Maven. KASH sigue siendo un cliente, no el proveedor de software.')
        y=self.item('El diseño existe; el recorrido productivo aún no',
             'En la base del edificio faltan organizaciones, administradores y funciones del árbol. Hay un tenant y cero miembros. Parte de la interfaz está en modo de ejemplo/apagada. Debe completarse alta → organización → posiciones → permisos → personas → módulos → cobros.',y)
        y=self.item('Hay una colisión de números de migración',
             'Una versión de migración registrada corresponde a pausas, no al árbol que usa el mismo número en otra carpeta. Verificar nombre, contenido y postcondiciones; no asumir que un número existente demuestra que se desplegó el cambio.',y)
        y=self.item('Cerrar aislamiento antes de cargar datos',
             'Tres tablas del edificio están vacías, sin protección por fila y con permiso de lectura anónima. No observé una fuga ni probé extracción por HTTP. Hay que cerrar esa configuración y probar permisos propios/cruzados antes de incorporar clientes.',y)
        y=self.item('El modelo de roles que ya elegiste sigue siendo requisito',
             'Cada empresa crea posiciones y funciones; dueño/delegados las administran; alcance propio/equipos/empresa. Conservar las reglas laborales y excepciones acordadas. Soporte de Maven temporal autorizado y registrado. No abrir permisos para ocultar una falla de conexión.',y)
        y=self.item('Para que toda la app se sienta fluida',
             'Paginar tablas y documentos, mostrar solo video útil, eliminar consultas repetidas, aislar trabajos pesados y limitar colas. Medir tiempo de apertura, clics, memoria y consultas por usuario. Reducir carga no significa apagar funciones sin explicar su estado.',y)
        self.note('Prueba mínima: dos empresas de ensayo, varios equipos y posiciones; acceso permitido propio y denegado cruzado en chat, presencia, documentos, horas, Argos y administración. Validar la base y la interfaz desplegadas, no solo pruebas sobre archivos SQL.',y,75)

    def tests(self):
        y=self.start('Evidencia de capacidad', 'Qué debe aprobar la prueba de 230', 'Criterios propuestos, todavía no alcanzados. Los usuarios sintéticos nunca deben mezclarse con la operación de KASH.')
        y=self.table(['Prueba','Criterio propuesto'],[
            ['Carga y duración','33→100→165→230 personas + monitores.1 h sostenida y luego 8 h; generadores separados; identidad única y pistas esperadas.'],
            ['Experiencia normal','≥ 99,5% entradas válidas; P95 de entrada≤5 s. Audio bidireccional y pantalla legible; sin caídas involuntarias durante ensayo normal.'],
            ['Red degradada','Pérdida 0/1/3/5%, subida 0,5/1/3/10 Mbps, retardos y cambio de red. Recuperación P95 ≤10 s tras volver internet; conservar intención de mic/cámara.'],
            ['Fallo de servidor','Retirar un nodo de ensayo; P95 de reentrada≤30 s y margen de capacidad. No prometer cero interrupción.'],
            ['App y datos','P95 de lecturas principales≤500 ms; acciones locales≤200 ms;5xx<0,1%. Memoria estable, sin duplicar escrituras ni saltar permisos.'],
            ['Clientes reales','Mac Intel/Apple Silicon y Windows, equipos modestos, miniatura, pantalla, suspensión, actualización yTURN/TLS.'],
            ['Recuperación','Restauración aislada y reapertura con roles/archivos correctos. Medir RTO y RPO, no solo existencia de un backup.']
        ],[113,CW-113],y,size=9.1)
        y=self.table(['Frecuencia','Recorrido'],[
            ['Diario','Login, chat, horas, documento y llamada entre cuentas de ensayo.'],
            ['Semanal / cambio importante','MatrizMac/Windows y redes; permisos negativos; muestra de restauración.'],
            ['Mensual','Carga aislada, caída de nodo, recuperación y reporte de costos/capacidad.'],
            ['Continuo','Salud, caídas por versión/red, demoras de copias y funciones sin resultado.']
        ],[138,CW-138],y,size=9.0)
        self.note('No está programado todavía este nuevo paquete. La cotización incluye infraestructura de prueba; el seguimiento humano se calcula aparte. Cada informe debe conservar versión, duración, datos brutos, límites del generador y aprobado/rechazado.',y,65)

    def execution(self):
        y=self.start('Plan de ejecución', 'Orden, esfuerzo y decisiones juntas', 'Horas de ingeniería para cotizar con el equipo; no son un cobro de Codex ni una fecha garantizada.')
        y=self.table(['Bloque','Entregable verificable','Esfuerzo estimado'],[
            ['A. Llamadas +230','Reproducción, política adaptable, estado al reconectar, ensayo sostenido y clientes reales.','56-96 h'],
            ['B. Continuidad','Copia/versiones, ruta alterna, PITR comprobado, restauración y procedimiento.','40-80 h'],
            ['C. Nuevas empresas','Despliegue coherente, alta/roles/ámbitos y pruebas entre organizaciones.','48-96 h'],
            ['D. Promolog','Recuperar lectores, resultado trazable, presupuesto y alarma por falta de cobertura.','24-60 h'],
            ['E. Pruebas periódicas','Recorridos, máquinas de ensayo, alertas útiles y reporte automático.','16-32 h'],
            ['Total inicial','Antes de prometer escalado comercial completo.','184-364 h']
        ],[119,284,CW-403],y,size=9.0)
        y=self.p('El esfuerzo puede variar al reproducir fallos o acceder a sesiones/proveedores. Los bloques permiten trabajo paralelo, pero no eliminan las pruebas. Operación mensual propuesta: 230 personas 12-24 h; 1.000, 24-60 h; 3.000, 60-120 h; 10.000, guardia de equipo con cotización propia. No incluye soporte al usuario final.',y,size=9.0)
        y=self.label('Decisiones pendientes para aprobar en un solo bloque',y)
        for title,body in [
            ('Compra inicial sugerida','Tope US$ 75 de laboratorio; piloto Promolog hasta US$ 100 solo si requiere consumo. Elegir antes de contratar; no se han cobrado.'),
            ('Protección de datos sugerida','Aceptar metas de pérdida ≤15 min de datos y ≤1 h de archivos; inventario/copia de 33,2 TB con retención por definir.'),
            ('Supervisión y presupuesto','Conservar 12 salas en vivo si es necesario y dimensionarlas. Si se reduce, mostrar el cambio y su ahorro. Presupuesto por etapa después del ensayo.'),
        ]:
            y=self.item(title,body,y)
        self.note('Recomiendo empezar por llamadas y el laboratorio de 230. Con su evidencia se define la compra exacta y el costo adicional real.',y,49)

    def sources(self):
        y=self.start('Trazabilidad y límites', 'Fuentes y cómo usar este presupuesto', 'Tarifas consultadas el 24/11/2026; confirmar al contratar. Evidencia técnica y cálculo quedan en GitHub junto con este informe.')
        sources=[
            ('1. LiveKit: distribución de salas y redundancia','https://docs.livekit.io/transport/self-hosting/distributed/'),
            ('2. Vultr: catálogo público de planes consultado','https://api.vultr.com/v2/plans?per_page=500'),
            ('3. Vultr: transferencia excedente US$ 0,01/GB','https://docs.vultr.com/support/platform/billing/what-is-the-bandwidth-overage-rate'),
            ('4. Supabase: recuperación y costo PITR','https://supabase.com/docs/guides/platform/backups.md'),
            ('5. Backblaze: precio de copia externa B2','https://www.backblaze.com/cloud-storage/pricing'),
            ('6. LiveKit Cloud: minutos, transferencia y límites','https://livekit.com/pricing.md'),
            ('7. Supabase: planes y tamaños de cómputo','https://supabase.com/pricing'),
            ('8. Supabase: límites reales de Realtime','https://supabase.com/docs/guides/realtime/limits'),
            ('9. Realtime: cobro de conexiones simultáneas','https://supabase.com/docs/guides/platform/manage-your-usage/realtime-peak-connections'),
            ('10. Realtime: cobro por mensajes distribuidos','https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages'),
        ]
        for label,url in sources:
            y=self.p(f'<link href="{escape(url)}" color="#243A55">{escape(label)}</link>',y,size=9.4)
        y=self.item('Los límites del proveedor también cuentan',
             'RealtimePro con límite de gasto publica 500 conexiones; el permiso de más consumo y los límites de mensajes deben acordarse.10.000 personas pueden abrir más sockets. No desactivar el límite de gasto sin presupuesto, alerta y control por empresa. [8-10]',y)
        y=self.item('Cómo leer las cifras',
             'q=100/250 es una variable no medida; el número de nodos solo ilustra sensibilidad de gasto. Transferencia se reserva sin descontar cuotas para evitar ahorro supuesto por reparto. Precios excluyen impuestos. No se comparan usuarios mensuales con conexiones simultáneas.',y)
        y=self.p('Fuentes internas: main 9dadf3250; auditoría previa y resultadosr 3/r 4; nuevas lecturas agregadas de KASH/edificio; notas de llamadas, funciones y recuperación. Las ventanas de Promolog/Argos terminan 24/11 a 08:30 Nueva York. No hubo carga nueva ni restauración real en esta revisión.',y,size=9.0)
        self.note('La propuesta queda lista para revisar. El éxito se declara por recorrido aprobado y evidencia desplegada; un PDF, una compra o un proceso que responde 200 no bastan para declarar resuelto el problema.',y,60)

    def build(self):
        for f in [self.cover,self.findings,self.calls,self.architecture,self.assumptions,self.budgets,self.purchase,self.managed,self.recovery,self.promolog,self.modules,self.tenants,self.tests,self.execution,self.sources]:
            f()
        assert self.page==self.page_count
        self.c.save()


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--salida',type=Path,required=True)
    args=parser.parse_args()
    args.salida.parent.mkdir(parents=True,exist_ok=True)
    model=json.loads((BASE/'modelo-costes.json').read_text())
    Propuesta(model,args.salida).build()
    print(args.salida)

if __name__=='__main__':
    main()
