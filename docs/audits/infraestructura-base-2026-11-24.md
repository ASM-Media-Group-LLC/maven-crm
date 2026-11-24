# Auditoría de base de datos e infraestructura de Maven — 24/11/2026

## Alcance y evidencia

Revisión de lectura sobre Supabase productivo `lsagslbkliprespbyhts` (operación de KASH),
`ezeigddgkaemxpshghmu` (Maven Agencias) y `glzncicyfrjidvkjjaig` (simulacro).
Código base `d00ba1b44`. No se modificaron usuarios, roles ni datos para medir.
Muestreo del 24/11 aproximadamente 05:57–06:10 UTC. Los números de la siguiente tabla
usan una ventana fija: **23/11 06:00 UTC → 24/11 06:00 UTC** (01:00–01:00 Nueva York).
Los avisos del asesor y estadísticas acumuladas tienen sus propios periodos, indicados abajo.

## Punto de partida y objetivos de crecimiento

| Medida | Observado | Objetivo 5× | Objetivo 10× |
|---|---:|---:|---:|
| Cuentas Auth registradas, incluyendo archivo y portal | 72 | — | — |
| Perfiles del equipo no borrados, excluyendo portal | 52 | — | — |
| Perfiles habilitados ahora | 51 | 255 | 510 |
| Usuarios distintos con peticiones autenticadas en 24 h | 46 | 230 | 460 |
| Usuarios distintos con muestras de llamada en 24 h | 39 | 195 | 390 |
| Máximo de usuarios con muestra en el mismo minuto | 33 | 165 | 330 |
| Máximo de salas con muestra en el mismo minuto | 23 | 115 | 230 |
| Peticiones recibidas por la API en 24 h | 3.124.055 | 15.620.275 | 31.240.550 |

**Las columnas 5×/10× son escenarios aritméticos para ensayar, no capacidad certificada.**
Un minuto de muestras no demuestra simultaneidad exacta: una persona puede cambiar de sala,
y una conexión que no logró enviar telemetría no aparece. La base registró 17.419 muestras,
33 salas distintas durante el día y un percentil 95 de 23 usuarios por minuto.
Los 15 inicios de sesión de ese periodo tampoco equivalen a usuarios activos: otros ya tenían sesión.

## Salud actual de la base

- Supabase informa `ACTIVE_HEALTHY`, región `us-east-1`, Postgres `17.6.1.054`.
- Tamaño de base: **4.019 MB**. Conexiones en la instantánea: **36 de 160**, 2 activas,
  cero transacciones abiertas sin actividad. Esto no revela el pico del día ni la CPU máxima.
- En la ventana fija: **2.580 respuestas 5xx** entre 3.124.055 solicitudes (**0,0826 %**);
  **cero HTTP 429**. 1.601.719 peticiones llevaban rol autenticado.
- No hay evidencia en esta instantánea para comprar más base de datos antes de corregir
  las consultas y llamadas repetidas. Tampoco demuestra que aguante 5× o 10×.

## Fallos identificados

### 1. Una fecha de bloqueo rompe la lectura de usuarios en Auth

Los registros de Auth muestran **2.464 errores 500** en la consulta aproximada de 24 h:
2.325 al listar usuarios y 139 al buscar uno. El error es `banned_until` no convertible a
`*time.Time`. La lectura de `auth.users` confirmó **un bloqueo positivo `infinity`**,
ninguno negativo y 15 bloqueos finitos activos; 16 cuentas bloqueadas en total.
No son 2.464 fallos de contraseña o acceso normal: corresponden a rutas administrativas.

Origen comprobado: `public.posiciones_sincronizar(boolean,boolean)` escribe `'infinity'`
al deshabilitar. Su definición vigente coincide con la migración del constructor
`20261123061407`, salvo el punto y coma final del catálogo.

Corrección preparada en `20261124060246_bloqueos_auth_fecha_compatible.sql`:
reemplazar únicamente esa fecha por `9999-12-31T00:00:00Z`, conservar el bloqueo,
la marca de deshabilitada, los roles, la contraseña y las sesiones. La función se
modifica sobre su definición vigente, con una guarda que exige el patrón esperado.
El bloque es atómico y comprueba que el número de cuentas bloqueadas no cambia.

Prueba aislada con Postgres/PGlite: valores positivos y negativos infinitos, nulos,
pasados y finitos; ACL/propietario/seguridad/roles intactos; reaplicación; simulación;
una nueva deshabilitación usando la función real del constructor; rechazo seguro
si la definición tiene una forma desconocida. **Aprobada**.
Estado de despliegue: **aplicada el 24/11/2026, aproximadamente 06:30 UTC**. Verificación independiente: 72 cuentas, las mismas 16 bloqueadas, cero fechas infinitas; propietario, ACL, SECURITY DEFINER y search_path conservados. La interfaz de administración recuperó 52/52 correos, cuyo origen es `auth.admin.listUsers`.

Fuentes técnicas: [modelo de usuario de Supabase Auth](https://github.com/supabase/auth/blob/master/internal/models/user.go)
y [serialización de fechas de Go](https://pkg.go.dev/time#Time.MarshalJSON).
GoTrue compara la fecha con el momento actual; un bloqueo futuro finito sigue bloqueando.

### 2. El fallo de ocho segundos de Cowork ya estaba corregido

`cowork_mis_sesiones_activas`: **989 peticiones**, media **969 ms**, percentil 95
**8.074,8 ms**, con **79 respuestas 500** en la inspección de 24 h.
Un registro de Postgres confirma tiempo agotado en la cadena:
`tiene_funcion → posicion_decision → is_cowork_host → cowork_mis_sesiones_activas`.

**El desglose por hora cambia el diagnóstico:** los 79 errores ocurrieron el 23/11 entre
16:00 y 19:00 UTC, antes/durante la corrección de ese día. Desde 19:00 UTC hasta las
06:00 del 24/11 se observaron **466 respuestas HTTP 200 y ningún timeout**, media
**58,1 ms**, P95 **115 ms** y máximo **151 ms**. La migración `20261123180749_rendimiento_cowork_permisos.sql`
ya resolvía la identidad una vez para usar el índice de usuario. Ese resultado se atribuye
a la entrega previa, no a esta auditoría.

Se ensayó otro atajo con CASE y un índice compuesto por usuario/sesión/fecha en una base
PGlite aislada. Se conservaron los resultados para dueño, delegado, empleado, anfitrión,
usuario sin posiciones e intruso de otra empresa, con cero/una/dos posiciones, denegaciones
individuales, acceso total y cuenta deshabilitada. Se rechazaron escrituras y lectura anónima.
La búsqueda utilizó el nuevo índice en `EXPLAIN ANALYZE`.

| Datos sintéticos | Personas | Salas | Asignaciones | Mediana actual | Mediana experimental |
|---|---:|---:|---:|---:|---:|
| 1× | 52 | 42 | 5.748 | 11,91 ms | 12,96 ms |
| 5× | 260 | 210 | 28.740 | 27,84 ms | 20,46 ms |
| 10× | 520 | 420 | 57.480 | 11,06 ms | 13,96 ms |

Cinco lecturas medidas por configuración en un proceso local; no son pruebas de carga
concurrente ni tiempos de la nube. La variación no demuestra una mejora consistente.
**Se descartó el cambio de producción**. El ensayo queda reproducible en
`supabase/tests/cowork_ultima_sala_rendimiento.mjs`; su propuesta está solo en
`supabase/tests/fixtures/`, fuera de las migraciones. La prueba confirma equivalencia
de accesos en la muestra, no capacidad de 330 usuarios simultáneos.

### 3. Muchas peticiones prescindibles al abrir Maven

| Ruta | Peticiones en 24 h | Tiempo medio en origen | P95 |
|---|---:|---:|---:|
| Reacciones de chat | 271.206 | 36,4 ms | 98 ms |
| Recibos de chat, lecturas y escrituras | 248.059 | 51,4 ms | 136 ms |
| Comprobación de salud de Auth | 243.635 | 32,2 ms | 92 ms |
| Membresías de Cowork | 105.123 | 62,9 ms | 98 ms |

Los tiempos son del servidor de origen; no incluyen la descarga completa, renderizado
ni todos los retrasos de internet del usuario. Reducir consultas repetidas tiene más
valor que ampliar servidores a ciegas. El frontend debe compartir mediciones y cachés,
evitar solicitudes sin sesión y dejar de sondear pantallas ocultas cuando sea apropiado.

### 4. Errores que requieren reparación específica, no abrir permisos

- 2.871 errores de permisos en `mail_programados`; la mayoría de respuestas analizadas
  fueron solicitudes con rol **anon** (2.667 HTTP 401). Las columnas permitidas coinciden
  con lo que selecciona el código actual; no se justifica dar acceso anónimo a los correos.
- 280 errores de permisos en `latir_llamada_maven`, 24 en `salir_llamada_maven`.
  Ambas funciones sí admiten `authenticated`; las denegaciones observadas llegan sin
  sesión/como anon. Revisar llamadas públicas y fase de renovación de sesión.
- 481 consultas de `equipo-vigilante` usan `tardanzas_registro.min_tarde`, columna
  inexistente; la columna real es **`tarde_min`**. El proceso contesta HTTP 200 aunque
  esa parte de la detección falla: un cron verde no prueba el recorrido completo.
- 2.890 inserciones rechazadas en `argos_uso_apps`: RLS exige que la persona esté en turno.
  Verificar que el recolector deje de enviar al terminarlo, conservando esa protección.

## Internet, equipo y llamadas

Consulta aproximada de 24 h: 17.418 muestras de salud de llamadas.
92,18 % `excellent`, 4,46 % `good`, 3,36 % `poor` y una `lost`.
Las muestras `poor` incluyen 23 usuarios: latencia media de red 154 ms y
percentil 95 de atraso del hilo principal de **1.470 ms**. Por tanto hay degradación
local de la aplicación además de los cortes de internet; no corresponde culpar
automáticamente al equipo o conexión del cliente.

Comparación de regiones con 1.884 muestras de 39 personas:
**Miami 84,2 ms** de media frente a **St. Louis 124,0 ms**; Miami ganó en
1.806 muestras (**95,9 %**). P95: 109,95 frente a 168,05 ms.
Estas mediciones son de sondeo, no pruebas de audio/vídeo extremo a extremo.

Ocho registros de caídas de la app: tres refrescos por memoria en Windows
(tres personas, media 1.204 MB de app), tres procesos terminados de Windows 2.0.29,
una congelación y un proceso terminado de Mac 2.1.2611212204.
Corresponden a versiones previas a los instaladores de esta madrugada.
Registros de llamadas: cuatro caídas `STATE_MISMATCH` en dos personas,
21 inicios de reconexión breve, 60 reconexiones breves completas y tres reentradas
completas. No se puede inferir tasa de éxito dividiendo esos eventos: una recuperación
puede empezar antes de la ventana y terminar dentro de ella.

## Monitores y simulacro

- `salud-vigilante` está activo cada 2 minutos: **720 ejecuciones y 720 HTTP 200** en 24 h.
  Al iniciar la auditoría, su comprobación del cron de aportes usaba `drive-aporte-nas-ping`; el nombre
  activo consultado es `drive-aporte-nas`. Corregido y comprobado en la función publicada el 24/11, 06:53 UTC.
- `vigia-cortes-de-llamada` está activo cada 5 minutos: **288 ejecuciones**.
- `vigilar-saldo-ia` está activo cada 10 minutos: **144 ejecuciones**.
- `equipo-vigilante` está activo cada 3 minutos: **480 ejecuciones de cron** y 479 respuestas
  HTTP 200 observadas. El fallo de columna descrito arriba mostraba una falsa señal de éxito; la función publicada ya consulta `tarde_min` y comprueba el error.
- No se encontró un simulacro de usuarios periódico en los cron de producción ni en
  los archivos de CI revisados. El proyecto **maven-simulacro sí existe y está activo**:
  base 1.579 MB, un único cron `hub-estado-supervisores` cada 15 s. Sus registros de 24 h
  solo muestran Postgres/pooler, sin tráfico Auth/API/funciones en la consulta realizada.
  Tener ese proyecto encendido no equivale a que se esté simulando una operación completa.

## Deuda de mantenimiento y aislamiento

El asesor informa 136 claves foráneas sin índice, 342 políticas que recalculan funciones
de sesión por fila, cinco pares de índices duplicados y 295 índices sin uso registrado.
Las estadísticas de consultas se acumulan desde **23/10/2026 16:14 UTC**: no confundir
sus llamadas totales con el último día. No borrar índices solo por esa etiqueta.

También informa tres tablas públicas sin RLS y 12 vistas con privilegios de su propietario,
además de funciones públicas con permisos amplios. Son señales para auditar grants y
aislamiento, no prueba por sí solas de una fuga. Se comprobó además que
`corte_notas_excluidos`, `corte_objetivos` y `hubstaff_reporte_exentos` sí conceden lectura
e inserción a `authenticated` sin RLS; ninguna permite lectura anónima. Esa protección
falta en el nivel de tabla y no se debe confiar solo en ocultar la pantalla.
Debe resolverse antes de ampliar clientes
con pruebas entre dos empresas y conservando las funciones que sí son deliberadamente públicas.
Maven Agencias no presentó alertas de salud en el momento consultado; esto no valida aún
su contratación, pagos o todos sus permisos.

Referencias del asesor: [rendimiento de RLS](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan),
[índices de claves foráneas](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys),
[RLS desactivada](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public),
[vistas con privilegios](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view).

## Comprobaciones antes de certificar 5×/10×

1. Ensayo separado con datos sintéticos: abrir Cowork, recuperar sesiones, chat, permisos,
   llamadas y cargas de archivos. Medir mediana/P95, errores, CPU, memoria y conexiones.
2. Ensayar 165 y 330 participantes de llamadas representativos del pico observado,
   con distribución real de salas, cámaras y pantallas; no equivale a una sola sala gigante.
3. Interrumpir y recuperar red en cuentas de ensayo: no duplicar presencia, perder permisos,
   congelar el selector ni reactivar cámara/micrófono que la persona apagó.
4. Medir en clientes Windows/Mac modestos además del servidor. Un servidor vacío no evita
   que 12 vídeos, pantallas, detección y consultas bloqueen el hilo de la aplicación.
5. Certificar resultados observados; presentar hardware y costo solo si el ensayo muestra
   el recurso que se agota. Los números anteriores no autorizan todavía prometer 330 llamadas.


## Verificación de la entrega

PR [283](https://github.com/ASM-Media-Group-LLC/maven-crm/pull/283), integrado en main el 24/11/2026 a las 06:52:58 UTC (`ddd71cc186e9f4bd84618a4ebda9a253326ec45a`). Las tres guardas aprobaron: 489 archivos / 4.530 pruebas, tipos sin diagnósticos nuevos (228 heredados tanto en base como en cabeza), compilación, imagen Docker/nginx y bancos de permisos/funciones. Los dos vigilantes desplegados se consultaron por MCP: columna y nombre de cron corregidos. Publicación web comprobada a las 06:57:22 UTC: HTTP 200, entrada `index-Dnh9Z-Du.js`, build `1795503316298`, carga diferida recuperable presente, service worker sin respuestas privadas y limpieza de ambas cachés. En el navegador la sesión siguió abierta, administración mostró 52/52 correos y cero alertas. No sustituye la prueba física de llamadas entre Mac/Windows.

La comparación final de entrada JS/CSS, con la misma compresión Node zlib, pasó de 2.886.567 a 2.484.332 bytes y de 803.847 a 682.452 bytes gzip: ahorro de 121.395 bytes, 15,1 %. No es una medición de velocidad ni reduce el peso de los instaladores ya publicados.

## Actualizaciones de medios y perímetro

La revisión oficial del 24/11 encontró LiveKit 1.13.11 (25/10/2026), frente al 1.8.4 instalado, y Egress 1.15.0 (06/10/2026), frente al 1.9 instalado. Las notas incluyen correcciones de memoria, retransmisión y Chrome. Hay cambios de autenticación TURN y una regresión de Egress corregida en 1.13.9: actualizar exige banco de compatibilidad, grabación, reconexión, Mac/Windows y plan de retorno. No se actualizaron servidores ni se atribuyen las pérdidas del laboratorio a una versión antigua sin una comparación controlada.

Fuentes: [LiveKit 1.13.11](https://github.com/livekit/livekit/releases/tag/v1.13.11), [Egress 1.15.0](https://github.com/livekit/egress/releases/tag/v1.15.0), [corrección 1.13.9](https://github.com/livekit/livekit/releases/tag/v1.13.9).

Lectura del perímetro: Miami tiene UFW activo; en St. Louis UFW está inactivo, lo que requiere verificar su firewall externo antes de concluir protección o exposición. Caddy administra por 127.0.0.1:2019 y no se observó un listener de Redis 6379 en el host de ninguno. No se cambiaron reglas ni se hicieron pruebas intrusivas. Esto no sustituye una auditoría de red completa.

La arquitectura actual separa KASH del edificio Maven Agencias. Los nuevos clientes comparten el edificio con organizaciones/agencias y RLS; no se presupone una base independiente para cada cliente. Los hallazgos de tablas de KASH no demuestran una fuga entre empresas del edificio, cuyo aislamiento debe validarse con pruebas propias antes de contratar más clientes.
