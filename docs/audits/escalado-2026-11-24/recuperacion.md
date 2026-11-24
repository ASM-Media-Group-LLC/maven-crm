# Revisión de recuperación, pruebas y preparación multiempresa — 24/11/2026

Responsable de revisión: agente recuperacion_datos. Solo lectura. Código `9dadf3250809756cce564989426bdac6a5df45ab` (`origin/main`), consultado desde `/private/tmp/maven-propuesta-escalado`. Datos en vivo consultados aproximadamente 13:32–13:38 UTC (08:32–08:38 Nueva York). No se activaron servicios, cobraron extras, hicieron restauraciones ni modificaron datos.

## Decisión operativa recomendada

Meta elegida por Alvaro: evaluar recuperación del servicio en menos de una hora, con presupuesto previo. Esto todavía **no está demostrado**. Para poder presupuestar, proponemos pérdida máxima de 15 minutos en datos de negocio y una hora en archivos; son supuestos pendientes de aprobación conjunta, no promesas existentes.

**No se debe prometer recuperar todo el archivo histórico en una hora descargándolo desde una copia fría.** Hace falta una copia ya disponible para servir los archivos o definir qué conjunto crítico vuelve primero. Reponer físicamente todos los bytes puede continuar después sin dejar al equipo detenido.

## Estado real comprobado

| Pieza | Evidencia actual | Consecuencia |
|---|---|---|
| Supabase organización ASM TECH | Plan Pro, confirmado por MCP `get_organization` | El producto incluye respaldo diario según documentación; no confirma el historial real ni PITR contratado. |
| KASH `lsagslbkliprespbyhts` | ACTIVE_HEALTHY, Postgres 17.6.1.054, 4.226.493.587 bytes, 45/160 conexiones, 2 activas | Instantánea, no capacidad máxima certificada. Cero bloqueos `infinity`: reparación anterior sigue presente. |
| Edificio `ezeigddgkaemxpshghmu` | ACTIVE_HEALTHY, Postgres 17.11.0.019, 68.794.035 bytes, 14 conexiones | Un tenant y cero miembros; no representa carga de empresas reales. |
| Historial de respaldos/PITR | Las herramientas actuales no mostraron configuración ni lista de respaldos | **No confirmado**, no afirmar que está apagado o contratado. Requiere consulta del panel o Management API de solo lectura. |
| NAS | Auditoría anterior: dos volúmenes, 73 % y 71 % ocupados, ~13,87 TB decimales libres | Dos discos no equivalen a dos copias. |
| Recuperación del Drive | `infra/nas-drive/CLAUDE.md`: decisión del 28/09 de no tener copia ni espejo. Auditoría anterior no validó restauración | Riesgo documentado; no repetir decisión como si fuera protección actual. Necesita una política nueva con presupuesto. |
| Catálogo Drive KASH | 942.623 archivos listos fuera de papelera, **33.199.437.477.588 bytes (33,2 TB decimales / 30,2 TiB)** | Tamaño registrado en DB; no demuestra integridad física ni archivos recuperables. |
| Verificación de integridad | Solo 6.791 de esos archivos tienen `sha256` en `drive_items` | Diseñar inventario y comprobaciones sin castigar el NAS durante la jornada. Tener tamaño no prueba integridad. |
| Otros objetos Supabase Storage | 239.550 objetos, 111.655.383.749 bytes declarados, 21 buckets | ~111,7 GB adicionales; separar clasificación/retención. No sumar dos veces si alguno es copia del NAS. |
| Pruebas | Hay guardas por PR y push, pero no se encontró programación diaria de recorridos completos ni carga mensual en workflows | CI verde no sustituye ensayo real de llamada ni restauración. |
| Mini5 | Sirve Drive y ejecuta runner CI en usuario aislado | Aislamiento de credenciales sí; recursos/energía/red siguen compartidos. Cotizar runner separado y recuperación de archivos. |

Transferencia mínima teórica de 33,2 TB: a 1 Gbit/s ~73,8 horas; a 10 Gbit/s ~7,38 horas. Excluye cifrado, protocolo, lecturas de disco, archivos pequeños y validación. Por tanto el objetivo de <1 h necesita réplica accesible/conmutación o acceso a almacenamiento secundario, no una descarga masiva tras el incidente.

## Hallazgo nuevo: lo diseñado en GitHub no está habilitado en el edificio

La propuesta previa describía la **arquitectura prevista** de organizaciones y agencias. La nueva consulta directa demuestra que en `ezeigddgkaemxpshghmu` no están desplegadas esas piezas:

- `public.organizaciones`, `public.organizacion_admins`, `public.agencia_en_foco` y `public.arbol_respaldo`: inexistentes.
- Cero funciones con nombres `crear_organizacion`, `organizaciones_del_dueno`, `puedo_administrar_organizacion`.
- `public.tenants` tiene solo `id`, `slug`, `name`, `active`, `created_at`; no tiene `organizacion_id`.
- Un tenant, cero miembros.
- No hay migraciones registradas con nombre que contenga `arbol`, `organizacion` o `cobros`.
- **La versión `20261119210000` sí existe, pero su nombre es `pausas_solo_por_puesto`; no es el árbol.** Su MD5 de sentencias almacenadas es `7cd61618669bba8ee3d9cb7962b36d07`. No comparar numéricamente ese MD5 con el SHA256 de un archivo: algoritmos y normalización diferentes.

En GitHub sí existen:

| Archivo | SHA256 del archivo esperado |
|---|---|
| `infra/edificio/migraciones/20261119210000_arbol.sql` | `1e1eedd26bc66b7025f4f18d2b62e6a86879a301529ca2b7795f850e100b027f` |
| `infra/edificio/migraciones/20261119211000_arbol_funciones.sql` | `23d143611cb0e4380d174b29ec655ae5a370c39c40042015c45f769efd0f2156` |
| `infra/edificio/migraciones/20261120090000_cobros.sql` | `e8653970816e789889e0071011e6cc699bf2d205acbdb45b9f213808622266bc` |

Además, `frontend/src/lib/plataforma/index.ts` solo ofrece modo `mock` o `apagada`; `frontend/src/lib/plataforma/supabase.ts` indica que todavía no se usa, con métodos `no_disponible`. La puerta de base en `frontend/src/integrations/supabase/client.ts:35` utiliza `elegirConexion`; `frontend/src/lib/puerta.ts:44` exige `VITE_PUERTA_EDIFICIO=1`, URL/llave válidas y selección de destino. Sin eso vuelve a KASH. Esta lectura describe el código actual, no inspecciona las variables reales del contenedor.

**Conclusión para el plan de crecimiento:** hoy hay base preparada para agencias y diseño en código, pero no está listo el ciclo de alta y gestión de organizaciones reales. Para vender a más compañías no basta con comprar servidores.

### Cómo cerrarlo con evidencia

1. Crear manifiesto de despliegue por proyecto: archivo de origen, nombre, versión, SHA256 del archivo, hash de sentencias con normalización definida y postcondiciones (tablas, columnas, funciones, grants).
2. Comparar estado esperado y real. No saltarse una migración solo porque coincide su número; resolver la colisión con una nueva migración identificada, sin reescribir historial de producción a ciegas.
3. Ensayar sobre base aislada del edificio: esquema real + cambios, ida/vuelta, con datos sintéticos de dos organizaciones y tres agencias.
4. Probar la puerta, altas, posiciones y excepciones, sillas, cobros/invitaciones, Argos, chat, archivos y presencia. Una empresa no debe leer ni escribir ni inferir miembros de otra.
5. Activar un cliente piloto únicamente al pasar el recorrido completo y verificar resultado desplegado.

## Hallazgo nuevo de aislamiento: tres tablas también requieren atención en el edificio

En KASH siguen sin RLS `corte_notas_excluidos`, `corte_objetivos`, `hubstaff_reporte_exentos`; `authenticated` tiene SELECT/INSERT, `anon` no tiene SELECT. La revisión previa lo había identificado.

En el edificio las mismas tres tablas están **sin RLS**, `authenticated` tiene SELECT/INSERT y **anon tiene SELECT y USAGE del esquema public**. Sus tres conteos son **cero filas** en esta inspección. No se probaron peticiones HTTP ni se encontró fuga de información. Es una configuración que debe cerrarse antes de poblar clientes; no justifica afirmar que datos de KASH se filtraron.

La solución debe respetar dueño/delegados/roles y el ámbito de agencia. Probar rechazo anónimo, acceso permitido propio, rechazo cruzado, RPC/vistas y altas. No aplicar una política genérica a ciegas ni aflojar permisos para que desaparezca el error.

## Objetivos de recuperación a presupuestar

| Servicio | Propuesta de tiempo de recuperación | Propuesta de pérdida máxima | Qué hace falta | Prueba de aceptación |
|---|---|---|---|---|
| Login, roles, chat, horas y metadatos | <60 min desde inicio del incidente, incluyendo detección/validación | ≤15 min (propuesta) | PITR verificado por proyecto productivo, configuración/secretos recuperables, procedimiento probado y responsable de respuesta | Restaurar punto temporal a entorno aislado; leer, escribir y comprobar roles/horas sin duplicar operaciones; medir tiempo real y punto más reciente recuperado. |
| Archivos de trabajo | Servicio disponible <60 min; archivo histórico puede rehacerse después | ≤60 min (propuesta) | Copia independiente versionada y posibilidad de servir desde ella; inventario, cola de cambios, copia inicial y reconciliación con DB | Apagar origen solo en laboratorio; abrir/descargar documentos reales de ensayo desde destino, hashes y permisos iguales. Registrar pendientes y ventana de copia. |
| Llamadas | Reconectar en segundos; <60 min es demasiado para una llamada | No existe recuperación retroactiva del audio no grabado | Servicio alterno listo, rutas TURN, capacidad sobrante y reconexión conservando micrófono/cámara apagados | Caer un nodo de laboratorio y medir reentrada, no prometer llamada sin corte. |
| Grabaciones | Disponibilidad según cierre del archivo; no prometer recuperar segmentos aún no cerrados | Definir segmento máximo perdido y cola pendiente | Egress separado, segmentos/objeto final, confirmación de subida, política de retención | Matar proceso de grabación en ensayo, verificar segmentos recuperables y estado honesto del archivo. |
| Correo externo | Depende del proveedor y de credenciales/conectores | No borrar cola local; reenvío idempotente | Registro de entregas, reintento controlado y credenciales recuperables | Envío a buzón de ensayo, fallo temporal y reintento sin duplicados. |

PITR no garantiza por sí solo recuperar en una hora: la documentación advierte que la base queda inaccesible y la duración depende de volumen/restauración. Tampoco incluye objetos Storage ni NAS. Las réplicas en vivo sin versionado tampoco sustituyen una copia: pueden copiar el mismo borrado accidental.

El informe del proveedor consultado por MCP indica PITR con objetivo de pérdida de hasta 2 min y ~US$100 por proyecto/mes para 7 días. El padre detectó diferencia entre versión `.md` y contenido indexado sobre requisito de tamaño Small: **no incluir dicho requisito sin confirmación al contratar**. Presupuestar KASH y edificio por separado si ambos pasan a ser productivos. El precio no prueba que ya esté comprado ni que exista restauración validada.

## Programa de pruebas propuesto (presupuesto previo)

- **Diario:** recorrido sintético aislado de login → roles → Cowork → llamada directa y reunión → compartir pantalla → mensaje → abrir/guardar documento → entrada/pausa/salida. Dos empresas de ensayo; permisos positivos y negativos; Mac/Windows en rotación y web en cada ejecución. 15–30 minutos de recorrido como objetivo inicial, costo medido por runner y proveedor. No usar personas o notificaciones de KASH.
- **Semanal:** matriz completa Mac/Windows, equipo modesto, Wi-Fi degradado, cambio de red, suspensión, reconexión y micrófono/cámara apagados; restauración de una muestra de archivos/DB en aislado. Ejecutar también antes de cambios importantes de roles, autenticación, vídeo, base o actualizador.
- **Mensual:** carga de capacidad con generadores separados del servicio, más recuperación completa en aislado; informe de capacidad y costos por perfil. No automatizar cargas grandes contra producción.
- **Cada cambio:** guardas existentes por PR antes del merge y comprobación real posterior al despliegue; un HTTP 200 no basta.
- **Continuo:** salud de extremos públicos, calidad WebRTC, fallos por versión/OS/región/operador y retraso de copias. Avisar solo por fallos/umbral, no mensajes rutinarios al dueño.

Actualidad confirmada 24/11 13:35 UTC: cron salud 2min/720 ejecuciones en24h; cortes5min/288; saldoIA10min/144; equipo3min/480, todos sin fallos SQL en esa tabla. Estos éxitos solo prueban que el cron terminó; no prueban éxito del flujo funcional o envío.

## Primera certificación: 230 simultáneos

Es necesario distinguir 230 usuarios de app conectados de 230 participantes RTC activos. Para la primera meta conviene ensayar ambos por separado y luego un perfil mixto explícito. Nada de lo siguiente está certificado aún.

1. Equivalencia del laboratorio: servidor de llamadas con al menos los 4 núcleos de Miami, configuración real/versiones registradas; generadores en otras máquinas; base y almacenamiento de ensayo; salida a internet equivalente.
2. Escalones 25, 50, 100, 165 y **230**; medir una hora sostenida al nivel objetivo y una permanencia prolongada de cuatro horas antes de certificar operación diaria. Incluir entrada gradual y ráfaga, cierre y reentrada.
3. Perfiles de salas basados en operación: individuales con cámara/pantalla alternada, dos personas y grupos; no una sala gigante artificial ni solo emisores/solo receptores. Supervision real consume múltiples recepciones y debe estar representada.
4. Ensayos de fallo: internet breve/largo, UDP bloqueado (TURN/TLS), nodo caído, actualización del cliente, recuperación tras suspensión y sesión renovada.
5. Criterios propuestos: ≥99 % de intentos válidos conectan; P95 de entrada ≤5s con red normal; P95 de recuperación de corte corto ≤10s y de nodo ≤30s; cero permisos cruzados; cero pérdidas de escrituras confirmadas fuera del RPO en un desastre. Afinar calidad de audio/vídeo con la política de degradación, sin equiparar gauge de sesiones a personas únicas.
6. Medir aplicación: retraso de interfaz, memoria por cliente a lo largo de horas, CPU, red por sesión, consultas/usuario/minuto, colas, límites de conexiones, gastos. Reservar margen: sostener carga con un nodo retirado cuando se venda continuidad.
7. Guardar versión, escenario, duración, número único de participantes, flujos esperados/recibidos, errores y percentiles, grabación/capturas de ensayo y resultado aprobado/rechazado. No aprobar por exit code 0 ni por una única prueba de 60s.

## Qué cambia al crecer

- **230:** resolver caídas actuales con trazas, certificar perfil, completar alta multiempresa, cerrar aislamiento, copia externa/recuperación probada, separar carga de pruebas de la operación. Comprar solo lo que el ensayo justifique.
- **1.000:** operación redundante, administración de capacidad por empresa y colas de trabajo; observabilidad de extremo a extremo; reemplazo probado de nodo; cuotas de IA, documentos, llamadas y transferencia; runner separado del NAS. No confiar en un único Mac para desarrollo, archivos y recuperación.
- **3.000:** distribución por varios nodos y dominios de fallo; pruebas de evacuación con N+1; procesos pesados (grabaciones, documentos, Promolog, IA) separados de la respuesta interactiva; presupuesto de ancho de banda y retención por cliente.
- **10.000:** pruebas distribuidas y modelo multiempresa por capacidad, límites por cliente y aislamiento de vecinos ruidosos; datos agrupados o separados según carga medida, no particionar por superstición; operaciones y respuesta a incidentes con guardia y runbooks; acuerdo de recuperación probado por cada categoría de servicio. Un servidor más potente por sí solo no completa esto.

## Fuentes y límites

Fuentes locales: `docs/audits/infraestructura-base-2026-11-24.md`, `docs/audits/infraestructura-2026-11-24.json`, `infra/nas-drive/CLAUDE.md`, `infra/casas/edificio-migraciones/20261119230000_edificio_crons.sql`, `infra/edificio/migraciones/README.md`, las tres migraciones del árbol, `frontend/src/integrations/supabase/client.ts`, `frontend/src/lib/puerta.ts`, `frontend/src/lib/plataforma/index.ts`, `frontend/src/lib/plataforma/supabase.ts`, workflows de guardas. Consultas MCP de solo lectura a proyectos y organización identificados arriba.

Fuentes oficiales consultadas 24/11/2026:
- https://supabase.com/docs/guides/platform/backups (backups, PITR, límites y objetos excluidos).
- https://supabase.com/docs/guides/platform/backups.md (versión actual señalada por padre; comprobar diferencias de requisitos).
- https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery (cargo por proyecto, horas y retención).
- https://supabase.com/changelog.md (cambios de CLI, restauración, credenciales y disponibilidad; no se actualizó nada).

No se leyó contenido de archivos ni información de personas para el inventario. No se obtuvo la configuración real de PITR/backup en esta tarea. No se ensayó restauración ni carga nueva. La cifra de archivos es catálogo, no verificación de existencia. Los umbrales anteriores son propuesta de aceptación y presupuesto, no SLA actual ni garantía vendida.
