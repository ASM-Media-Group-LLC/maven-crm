# Funciones pausadas, Promolog y presupuesto de operación — 24/11/2026

## Resultado para la propuesta

**Promolog necesita recuperación funcional, no solo encender un interruptor.** La aplicación conserva el módulo y sus funciones publicadas, pero no hay evidencia de cobertura reciente de Instagram, Telegram o Facebook. X sí produce filas nuevas, mayoritariamente con fallo de lectura. Argos está activo, aunque ya deja revisiones pendientes por su límite diario. No se activó ninguna función, no se cambió ningún permiso, no se compró servicio y no se enviaron mensajes.

Consulta de lectura a KASH `lsagslbkliprespbyhts` y al edificio Maven `ezeigddgkaemxpshghmu`; código `origin/main` (`9dadf3250`). Inventario observado el 24/11/2026 entre 13:33 y 13:38 UTC (08:33–08:38 Nueva York). Evidencia agregada en `propuesta-maven-funciones.json`. Ventana fija de actividad: **17/11 13:30 UTC → 24/11 13:30 UTC** (08:30–08:30 Nueva York). Registros de funciones y Argos: **23/11 13:30 UTC → 24/11 13:30 UTC**. Son mediciones distintas de las de la auditoría nocturna anterior.

## Qué está activo, pausado o retirado

| Función | Estado comprobado | Qué falta antes de ofrecerla como operativa |
|---|---|---|
| Promolog / Instagram | Cron antiguo `promolog-story-read-staggered` pausado. Reemplazo local existe; el agente más reciente dejó de enviar latido el 23/11 21:59 UTC y su versión figura «?». Última entrada IG: 1/11; última sin `error_reason`: 21/09. | Identificar equipo y proceso actual, versión, sesiones válidas, programación, lectura autorizada y recepción de resultados. No reactivar el lector viejo en paralelo. |
| Promolog / X | Cron de mañana y noche activos; 8 respuestas HTTP 200 en 24 h. En 7 días: **246 filas; 243 con `x_read_failed` (98,8%) y 3 sin ese error**. | Reparar el camino de lectura/proveedor y medir cobertura. HTTP 200 significa que respondió la función, no que leyó los perfiles. Las 3 filas sin error no prueban 3 promociones ni análisis IA: el indicador también se usa en reglas de texto/marcadores de ausencia de actividad. |
| Promolog / Telegram | Tres horarios activos; 3 HTTP 200. Última entrada: 1/11. | Comprobar sesiones/pertenencia autorizada a canales, lector y resultado por objetivo. Causa raíz actual no establecida. |
| Promolog / Facebook | Dos barridos activos, cuatro pausados; 2 HTTP 200. Última entrada: 11/11. | Comprobar lector, objetivos y errores por perfil antes de aumentar frecuencia. No hay evidencia que permita atribuirlo a falta de saldo o a un bloqueo concreto. |
| Chequeo de perfiles IG | `promolog-handle-check-daily` activo; 1 HTTP 200. | Su resultado no demuestra que se estén leyendo historias: son procesos diferentes. |
| Reportes de Promolog | Resúmenes y rankings diarios/semanales programados; supervisor de managers pausado. Hubo 2 HTTP 200 de `promolog-highlights`, pero también 2 HTTP 500 de `whatsapp-send` en la ventana. | Probar contenido fresco y entrega final. No enviar reportes de negocio basados en una cobertura rota como si fueran completos. |
| WhatsApp | **11 tareas periódicas pausadas** (transcripción, imagen, resumen, seguimiento, recordatorios, etc.). La entrada sigue funcionando: `whatsapp-ingest` tuvo 961 HTTP 200 y 4 HTTP 546. | La pausa de tareas no significa que toda la bandeja esté apagada. Motivo de cada pausa no documentado de forma concluyente; revisar y decidir por función y coste. |
| Resumen personal y baja actividad | `alvaro-pulse` y `reporte-baja-actividad-grace` pausados. | Mantenerlos así hasta definir si se quieren; no presumir que son fallos de infraestructura. |
| Webhooks de Messenger | Cron pausado, **0 destinos y 0 entregas**. Migración indica que nace apagado hasta tener un destino probado. | No necesita encenderse para que el chat funcione. Se activa al contratar/configurar una integración concreta. |
| Argos | Configuración activa, intervalo de IA 120 s, filtros activos, muestreo al azar 10%, límite **US$1,50/día**. | Dimensionar por personas vigiladas, capturas, coste real y política de cada empresa; el límite actual no escala automáticamente. |
| Integración BLU | **Retirada por instrucción expresa del dueño el 11/11**, no fallo accidental. Últimos ingresos importados: 21/10. | No reactivarla por encontrar reportes que la referencian. Sustituir la fuente o dejar claramente histórico el cruce promoción/ingreso. |
| Funciones NAS del edificio para nuevos clientes | 40 cron activos y 3 pausados: `argos-al-nas`, `drive-aporte-nas`, `grabaciones-al-drive`. Cero cron de integraciones propias de KASH. | Pausa deliberada: el NAS actual pertenece a KASH. Antes de ofrecer Drive/grabaciones a otras compañías hay que definir almacenamiento, permisos, retención y presupuesto de ellas. |

En KASH hay **77 tareas periódicas activas y 20 pausadas**. No son 77 funciones necesariamente sanas: el reloj de Postgres puede completar el despacho mientras el proveedor falla o no devuelve resultados. Se requiere una prueba del resultado final por módulo.

## Qué se comprobó de Promolog y qué no

- Hay dos registros de agentes. Uno no late desde agosto. El más reciente informó cuatro redes programadas y sesiones contadas (2 IG, 1 X, 1 Telegram, 1 Facebook), pero su último latido tiene unas 15,6 horas de antigüedad. El código intenta latir cada 5 minutos. Un contador de sesiones o un archivo existente tampoco garantiza que la sesión siga autenticada hoy.
- Tres corridas antiguas conservan estado `running`, iniciadas entre agosto y septiembre. No son tres trabajos que debamos reiniciar automáticamente: primero se deben reconciliar como históricos con auditoría, sin repetir cobros ni datos.
- La última corrida registrada empezó el 1/11. La tabla anota US$0 de costes en 30 días; **eso no demuestra coste cero**. El campo no cubre necesariamente proveedores, agentes locales o llamadas de IA.
- El documento de mayo `docs/promolog-apify-migration.md` quedó histórico. Promete Apify + Gemini y una estimación US$10–20/mes que no sirve como presupuesto actual. En julio se retiró aquel pipeline; después existen agente local, extensión, rutas alternativas y proveedor de visión. El archivo y el código no sustituyen comprobar el servicio realmente usado.
- `promolog-hiker-scan` es un experimento que lee datos y no guarda resultados de Promolog; no es un reemplazo terminado. `promolog-ig-apify-dispatch` conserva un camino de pago alternativo. No se ejecutaron por el coste y efectos que producirían.
- La causa verificable de las 243 filas de X es «lectura fallida» por el camino Apify según el código; **no quedó establecido si fue cuota, credencial, cambio de la red o proveedor**. No se inventó esa conclusión.
- `salud-vigilante` revisa NAS, correo, Argos y dos cron críticos. No encontré allí una comprobación de cobertura/latido de Promolog; el agente puede dejar de producir sin que ese monitor lo marque.

## Argos: límite económico ya visible

En la ventana fija de 24 horas hubo **687 rondas finalizadas** de Argos; **238** registraron que dejaron trabajo sin juzgar al alcanzar el presupuesto. La suma del contador de omisiones es **2.910**; puede contar repetidamente la misma captura y **no debe presentarse como 2.910 imágenes únicas ni empleados sin vigilar**. El contador de analizadas suma 296.

No basta comprar un servidor mayor: el tope US$1,50/día seguirá frenando la revisión. Para presupuestar por nivel hay que medir:

1. Personas a las que cada empresa habilita Argos (no todos los usuarios de Maven por defecto).
2. Horas efectivas de turno, frecuencia, filtros, capturas revisadas y tokens/modelo.
3. Coste por 1.000 revisiones y por persona/hora; alertas al 50/80/100% del presupuesto.
4. Separación entre «pausado por presupuesto», «sin actividad», «proveedor caído» y «revisión pendiente».
5. Comportamiento al agotarse: no perjudicar chat/llamadas ni afirmar un veredicto sin revisión; dejar trazabilidad y cola acotada.

## Roles y otras empresas

Promolog es hoy una integración de KASH; no debe inflar automáticamente el precio o el consumo de toda empresa de Maven. El catálogo publicado para el edificio excluye Promolog, BLU, WhatsApp/Telegram de KASH y sus automatizaciones.

El módulo usa permisos Promolog/Promobot y alcance en la base. Sin embargo:
- `promolog_dispatch_runs_tenant_scoped` todavía compara con un identificador fijo de KASH.
- `promolog_agents` permite lectura a admin/manager; no tiene organización por registro.
- Varios lectores y reportes fijan la empresa y el grupo receptor en el código.
- El agente local comparte un token de integración y sus peticiones se procesan con privilegios de servidor.

Antes de venderlo a otra compañía: credenciales/cola/presupuesto/almacenamiento por organización, asignación de objetivos con autorización real, permisos configurables para ver/ejecutar/configurar/exportar y pruebas entre dos compañías (incluidas negativas). No basta duplicar el panel o añadir un rol. Este hallazgo **no prueba una fuga actual entre clientes del edificio**, donde estas integraciones están excluidas.

## Orden propuesto para recuperar y escalar

**P0 — llamadas y entrada de Maven:** no mezclar procesos de scraping/IA pesada con la ruta de llamadas. Promolog puede recuperarse como trabajo independiente sin retrasar la prueba de 230 personas.

**P1 — recuperación controlada de Promolog:** inventario por red → comprobar servicio/sesión → un pequeño lote de objetivos autorizados → confirmar evidencia/resultados → programación con límite de gasto y señal de última lectura correcta. Primero recuperar lo existente; cotizar un lector alternativo solo si falla el actual. No contratar cinco máquinas o nuevos proveedores sin esa comparación.

**P2 — salud útil:** panel por función con estado (activo, pausado por decisión, sin saldo, fallo, retirado), responsable, última ejecución correcta, última cobertura y coste; alertar por ausencia de resultado, no solo por proceso encendido. Vincular configuración a roles y empresa.

**P3 — pruebas periódicas:** recorrido diario en cuenta de ensayo; pruebas mensuales de carga en entorno aislado; antes de un cambio relevante repetir llamadas, roles, documentos y Promolog. Para Promolog probar legible/sin publicaciones/privado/sesión vencida/proveedor lento/cuota; nunca convertir «no leído» en «no hizo su trabajo».

**Criterios propuestos de aceptación:** lote con resultado trazable para cada objetivo; cero duplicados; error técnico separado de ausencia de actividad; cola recuperable e idempotente; aviso de agente sin latido en 15 minutos; presupuesto visible; ninguna lectura o envío entre empresas; no mensajes automáticos reales de prueba.

## Partidas que deben cotizarse aparte

- Recuperación inicial, pruebas de selectores/sesiones, actualización del agente y tablero de salud: trabajo técnico, una vez.
- Lector autorizado / proveedor de redes, si se elige sustituirlo: coste por objetivo y frecuencia, con límite mensual.
- IA de clasificación: por volumen real de imágenes/tokens; no por «1.000 usuarios» a ciegas.
- Almacenamiento de evidencias y tiempo de retención; copia externa y prueba de restauración.
- Operación: una persona/proveedor responsable de renovar accesos y resolver cambios de las redes; el hardware solo no da garantía.
- Argos: presupuesto por empresa y usuarios supervisados, separado del coste base de comunicación.
- Integraciones y mensajería: únicamente para compañías que las habilitan; no activar los 20 cron pausados como paquete.

No se da un precio inventado para Apify, OpenRouter, Gemini o Hiker: debe tomarse el camino elegido, su tarifa vigente y una muestra de uso. La propuesta principal puede reservar una partida limitada, claramente **no contratada**, y solicitar precio final antes de un alta o una recarga.

## Fuentes de código y comprobación

- `infra/promolog-agent/README.md`, `ui.mjs:96–131,339–353`, `schedules.mjs`: agente, programación, latidos.
- `supabase/functions/x-scan/index.ts:637–670`: diferencia lectura fallida/ausencia de actividad.
- `supabase/functions/fb-scan/index.ts:617–624`: errores por objetivo contenidos en respuesta 200.
- `supabase/functions/promolog-hiker-scan/index.ts`: experimento sin persistencia.
- `supabase/functions/salud-vigilante/index.ts:1–18`: alcance del monitor actual.
- `supabase/migrations/20260716140000_promolog_retire_apify_story_scraper.sql`: pipeline retirado.
- `supabase/migrations/20260926160100_api_webhooks_cron.sql`: cron apagado deliberadamente.
- `supabase/migrations/20261111130000_sin_blu.sql`: decisión de retirar BLU.
- `infra/casas/funciones-edificio.txt` y `edificio-migraciones/20261119230000_edificio_crons.sql`: exclusión de KASH y NAS pausado.
- Lectura real: `cron.job`, `cron.job_run_details`, `promolog_entries`, `promolog_dispatch_runs`, `promolog_agents`, `monitor_config`, `argos_diag`, `creator_daily_earnings`, `pg_policies`; registros agregados `function_edge_logs`.

