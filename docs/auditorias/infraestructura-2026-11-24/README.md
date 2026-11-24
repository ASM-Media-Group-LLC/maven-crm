# Simulacro de capacidad de llamadas de Maven

El 24 de noviembre de 2026 se ejecutaron llamadas sintéticas en un laboratorio Docker aislado, con LiveKit Server 1.8.4 y CLI 2.19.4. **La referencia de 33 conexiones completó sus 90 suscripciones de vídeo sin pérdidas notificadas por la CLI. Las cargas de 165 y 330 no aprobaron calidad y estabilidad bajo los límites del laboratorio.** Esto no certifica la capacidad máxima de Maven ni demuestra una caída de producción.

Las pruebas se ejecutaron en el servidor de San Luis. No se dirigieron a las salas, credenciales o servidor de llamadas de Miami. Los servicios que ya estaban en San Luis conservaron su estado, salud y número de reinicios. El laboratorio se retiró al finalizar.

## Alcance y método

La referencia procede de un indicador de 33 usuarios distintos por minuto durante la actividad observada. No es un inventario exacto de conexiones simultáneas. Los escenarios de 165 y 330 representan cinco y diez veces esa referencia numérica.

Cada sala sintética contiene cinco publicadores y seis suscriptores: once conexiones. Se prepararon 3, 15 y 30 salas, con 90, 450 y 900 suscripciones esperadas. La distribución es más concentrada que el indicador observado de 33 usuarios en 23 salas por minuto. No se pretende reproducir exactamente la operación de KASH.

- Vídeo: clips del generador, VP8, perfil alto 720p, simulcast y disposición `speaker`. Cada suscriptor solicita hasta seis participantes; al haber cinco publicadores recibe los cinco vídeos, con calidad adaptada por el generador.
- Audio: escenario adicional de 330 conexiones con audio sintético de la CLI. No reproduce conversaciones, micrófonos, eco ni captura de dispositivos reales.
- Duración: 60 segundos por sala después de terminar sus intentos de conexión. Las duraciones totales incluyen arranque, negociación, cierre y muestreo.
- Incorporación: cada proceso limita a cinco incorporaciones por segundo **por sala**. Se inicia una sala cada 0,1 segundos. Con treinta salas se produce una ráfaga agregada que puede aproximarse a 150 incorporaciones por segundo; también se estresa la negociación inicial.
- Aislamiento: red Docker `--internal`, sin publicar puertos. Claves, salas e identidades sintéticas, imágenes locales fijadas por ID y sin descargas durante la prueba.
- Medición: muestras de Prometheus del SFU, CPU y memoria del host/contenedores, estado de servicios existentes y tablas finales de la CLI. El intervalo efectivo de las muestras suele ser de seis a ocho segundos por la duración de `docker stats`.

SFU y generador comparten host y red interna. No se ejecutan Maven, Electron, navegadores reales, permisos, Argos, grabaciones, pantallas compartidas ni redes domésticas. Una capacidad de producción requiere también verificar esos recorridos.

## Recursos de los ensayos

| Ejecución | SFU | Generador | Límite total | Resultado de la ejecución |
| --- | --- | --- | --- | --- |
| r3 | 2 CPU y 2 GiB | 2 CPU y 2 GiB | 4 CPU y 4 GiB | Terminó 33; el generador falló en 165 y se canceló el escalado |
| r4 | 2 CPU y 3 GiB | 4 CPU y 6 GiB | 6 CPU y 9 GiB | Terminó los procesos de 165, 330 y audio 330; se detectaron fallos de calidad y conexión |

El host dispone de ocho CPU y aproximadamente 24 GiB. El preflight exige conservar al menos dos CPU y seis GiB fuera del presupuesto del laboratorio. Durante r4 la memoria disponible del host no bajó de 15,71 GiB; el máximo observado de CPU del host fue 76,3%.

El SFU ensayado estaba limitado a dos CPU. Miami dispone de cuatro CPU. Por ello no se debe presentar el resultado como una medición de la capacidad máxima del servidor de producción. Tampoco se puede multiplicar linealmente el aforo por el número de CPU.

## Resultados observados

La pérdida que aparece en la tabla es el rango entre los resúmenes de las salas, no una media global ponderada. Los fallos de conexión se cuentan por las líneas `could not connect`; los errores de suscriptores son los de las tablas de la CLI, y pueden representar parte de los mismos incidentes.

| Ejecución y objetivo | Suscripciones en los resúmenes | Pérdida por sala | Fallos de conexión | Evaluación |
| --- | --- | --- | --- | --- |
| r3 vídeo 33 | 90 de 90; 3 de 3 informes | 0% | 0 | Referencia completada en laboratorio |
| r3 vídeo 165 | 335 recibidas; solo 12 de 15 informes, frente a 450 esperadas para todo el escenario | 4,175% a 24,181% en los informes disponibles | 2 | Generador limitado; prueba detenida |
| r4 vídeo 165 | 450 de 450; 15 de 15 informes | 7,020% a 15,056% | 0 | Conecta y entrega las pistas, pero no aprueba calidad |
| r4 vídeo 330 | 749 de 900; 30 de 30 informes | 3,986% a 39,296% | 17 | No aprueba conexión ni calidad |
| r4 audio 330 | 801 de 900; 30 de 30 informes | 10,417% a 30,986% | 17 | No aprueba conexión ni calidad |

En r3 el generador llegó a 1,991 GiB sobre un límite de 2 GiB; tres procesos no entregaron resumen y el contenedor coordinador terminó con código 1. La inspección final marca `OOMKilled: true`; junto con el consumo observado, confirma un evento de falta de memoria en el generador. Ese límite y sus fallos internos impiden atribuir el resultado a la capacidad del SFU de producción.

En r4, el vídeo de 165 mantuvo un gauge de 165 sesiones entre las muestras de 6,5 y 58,8 segundos. El proceso del SFU promedió 1,88 núcleos durante todo ese ensayo, cerca de su límite de dos. En vídeo 330 el SFU alcanzó aproximadamente 3.058 MiB sobre su límite de 3.072 MiB. El generador llegó a unos 4.113 MiB de su límite de 6.144 MiB. Esto señala límites del entorno ensayado; no aísla por sí solo una causa única de pérdida.

La CLI registró errores internos recuperados `caught panic in consumeTrack`: nueve en r3 vídeo 165, dos en r4 vídeo 165 y quince en r4 vídeo 330. No hubo esos errores en la referencia de 33 ni en audio 330. Deben tratarse como una limitación del generador y contrastarse con un segundo cliente de prueba antes de atribuir cada pérdida a Maven o al servidor.

## Interpretación de participantes y errores

El analizador usa `livekit_participant_total`, declarado como gauge por Prometheus. **No utiliza `livekit_participant_join_total` como número de personas simultáneas:** ese contador acumula conexiones y reconexiones.

También se detectó una inconsistencia en el gauge durante los escenarios más exigentes. Vídeo 330 alcanzó un valor de 471 y audio 330 un valor de 351, aunque solo se planearon 330 identidades. Los eventos RTC acumulados llegaron a 1.313 y 586, respectivamente. Reconexiones o sesiones pendientes pueden inflar el estado observado. No se comprobó el inventario de identidades por la API de salas durante ese intervalo, por lo que **471 y 351 no son aforos ni usuarios únicos verificados**. Los resúmenes JSON conservan el valor y una alerta explícita, sin ocultar la inconsistencia.

Que el generador termine con código 0 solo significa que su proceso terminó. En esta versión de la CLI puede ocurrir aun con participantes fallidos, pistas ausentes o pérdidas. Por eso el criterio incluye tablas de todas las salas, pistas recibidas frente a esperadas, errores de conexión, errores internos y pérdida de medios. Los escenarios cinco y diez veces la referencia quedan **no aprobados en el laboratorio**, aunque el script haya completado su ejecución.

## Comandos para reproducir

Se requiere un host de laboratorio con Docker, Python 3 e imágenes locales compatibles: `livekit/livekit-server:v1.8.4`, `livekit/livekit-cli:latest` y `denoland/deno:latest`. Los nombres permiten seleccionar imágenes ya presentes; el script fija sus IDs al arrancar y los guarda en la evidencia. Para reproducir exactamente esta ejecución hay que comparar esos IDs con los JSON de resultados y el hash del binario CLI, no confiar en una etiqueta `latest` futura.

La imagen CLI no incluye shell. El script extrae su binario desde un contenedor detenido propio, registra SHA256 y comprueba `--version` sin red en la base glibc disponible. Las comprobaciones anteriores con shell ausente y base Alpine incompatible fallaron antes de crear la red de carga; no se contaron como pruebas de capacidad.

Desde la raíz del repositorio, en el host de laboratorio:

```sh
python3 scripts/audit/simulacro-livekit-aislado.py --plan --audio

python3 scripts/audit/simulacro-livekit-aislado.py --run --audio \
  --output /var/tmp/maven-simulacro-referencia-NUEVA

python3 scripts/audit/simulacro-livekit-aislado.py --run --audio \
  --connections 165,330 --generator-cpus 4 \
  --generator-memory-gb 6 --server-memory-gb 3 \
  --output /var/tmp/maven-simulacro-ampliado-NUEVA

python3 scripts/audit/analizar_simulacro.py \
  /var/tmp/maven-simulacro-ampliado-NUEVA \
  --output /var/tmp/maven-simulacro-ampliado-resumen.json
```

Cada carpeta de salida debe ser nueva. No se borran ejecuciones anteriores. El resumen del analizador elimina identidades, direcciones y nombres de los servicios existentes; conserva imágenes, hash CLI, límites, métricas agregadas y errores contados. La evidencia completa contiene `resultado.json`, `metricas.prom.jsonl` y logs por sala; no se incorpora a GitHub para evitar ruido y detalles innecesarios del entorno.

## Guardias y limpieza

Se detiene el laboratorio si la CPU del host supera 85% durante tres muestras consecutivas, si quedan menos de seis GiB de RAM disponibles, si un servicio previo desaparece/reinicia/pasa de sano a no sano, si el generador termina con error, o si un escenario supera su duración solicitada más 120 segundos. Una pérdida detectada solo en las tablas finales no activa por sí misma esa guardia; debe interpretarse con el analizador.

`finally` retira solo los nombres de contenedor y red creados por esa ejecución, incluso ante señales SIGINT o SIGTERM. No utiliza comodines ni `docker system prune`. La limpieza conserva los archivos de evidencia. Un SIGKILL o una caída completa del host no ejecutan `finally`; en ese caso se deben inspeccionar los recursos con la etiqueta del laboratorio y confirmar sus nombres antes de retirarlos.

Comprobación de que no quedaron contenedores ni redes del laboratorio:

```sh
docker ps -a --filter label=maven.auditoria.simulacro \
  --format '{{.Names}} {{.Status}}'
docker network ls --filter label=maven.auditoria.simulacro
```

Para una limpieza manual, elegir el nombre exacto de la ejecución pendiente a partir de esas salidas y de `cleanup_names` en su `resultado.json`; inspeccionar su etiqueta antes de usar `docker rm -f NOMBRE_EXACTO` y `docker network rm RED_EXACTA`. No retirar recursos de otras ejecuciones ni servicios sin esa comprobación.

## Siguiente validación

La próxima prueba de capacidad debe separar el host generador del SFU, igualar la configuración de cuatro CPU de Miami y comprobar tanto incorporación gradual como ráfagas. Debe consultar identidades activas por sala para contrastar los gauges, medir la calidad sostenida después de la incorporación y revisar o cambiar la versión del generador si persisten sus errores internos. Después corresponde repetir recorridos de Maven en Windows y Mac con cámara, pantalla compartida, desconexión y recuperación sobre redes limitadas.

No se amplía la infraestructura productiva basándose únicamente en este ensayo. El resultado útil de hoy es que la referencia pequeña funciona en el laboratorio y que cinco y diez veces la carga requieren validar y dimensionar antes de prometer ese crecimiento.

## Evidencia y verificación

- [Resultado sanitizado r3](simulacro-r3.json)
- [Resultado sanitizado r4](simulacro-r4.json)
- [Hashes de scripts y resultados](SHA256SUMS)
- [Simulador](../../../scripts/audit/simulacro-livekit-aislado.py)
- [Analizador](../../../scripts/audit/analizar_simulacro.py)

Los hashes corresponden a los scripts finales conservados en el repositorio y los resúmenes publicados. La ejecución r3 usó la revisión previa a parametrizar recursos y escribir el JSON de forma atómica; sus parámetros efectivos quedan guardados en su plan. Los hashes de imágenes y del ejecutable CLI se registran separadamente dentro de cada resumen.

Referencias del fabricante: [metodología oficial de benchmark](https://docs.livekit.io/transport/self-hosting/benchmark/) y [código de ejecución y resúmenes de CLI 2.19.4](https://github.com/livekit/livekit-cli/blob/v2.19.4/pkg/loadtester/loadtest.go).
