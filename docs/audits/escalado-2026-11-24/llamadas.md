# Llamadas y crecimiento de Maven

Revisión del 24/11/2026, base `origin/main` `9dadf3250`. Solo lectura: no se modificó producción, no se compró infraestructura y no se ejecutó carga nueva. La auditoría y los simulacros previos son del mismo día, pero no certifican la nueva meta de 230.

## Lo que ya existe

- `frontend/src/hooks/useLiveKit.ts:334–399`: selección adaptativa de video por tamaño visible, transmisión de varias calidades, redundancia de audio y reconexión breve. La política de reentrada completa (2363–2448) espera el regreso de internet y no vuelve si la persona salió voluntariamente o abrió la sesión en otro lugar.
- `perfilDeCamara.ts` y `perfilDePantalla.ts`: Cowork reduce cuadros/calidad y conserva texto legible. Cámara normal: 720p/15 fps, capa alta hasta 1 Mbps. Pantalla liviana: 720p/5 fps y hasta 500 kbps.
- `redBloqueada.ts`: reconoce UDP, TCP y TURN; aplica cámara más liviana también a Meet/chat por TCP. Primera lectura a los 3 segundos y luego cada 15.
- `videoAjeno.ts`: un participante Cowork puede recibir solo audio de compañeros y video del supervisor. El supervisor conserva las pistas necesarias.
- `CoworkRoomMonitor.tsx`: una conexión por sala vigilada, AudioContext compartido y una captura de micrófono/cámara con clones por sala. Las pistas invisibles se pausan, pero permanecen conexiones, tokens y audio.
- Hay telemetría de salud, transporte, corrección de audio y retrasos locales. No corresponde describir Maven como si todavía careciera de adaptación o recuperación.

## Brechas concretas

### P0: la excepción de alta definición contradice la nueva prioridad

`useLiveKit.ts:735–741` calcula `liviano = (perfil liviano && !camaraEnHD(room.name)) || porRedBloqueada()`. `perfilDeCamara.ts:286–296` considera HD toda sala ajena a Cowork y documenta una decisión anterior de calidad.

En UDP con subida débil, Maven no aplica su propio tope liviano a las llamadas directas y Meet. El navegador conserva su control de congestión: esto no significa que no adapte nada. Sí contradice el nuevo objetivo de conservar audio reduciendo video en todo Maven. Propuesta: unificar política, con escalones 1080→720→360 y recuperación gradual; demostrar el resultado con red limitada. No atribuir todas las caídas a esta excepción sin reproducirlas.

### P0: la reentrada completa reutiliza el estado inicial

`useLiveKit.ts:1732` guarda las opciones de entrada; 2382–2402 y 2428–2434 las reutilizan al reconectar. En 2254–2255 se decide micrófono/cámara con `initialMicOn` y `initialCamOn`. Los botones de micrófono y cámara no actualizan esas opciones.

Riesgo por estructura de código: volver al estado inicial en vez del último elegido. Falta reproducción para darlo como fallo demostrado. Prueba obligatoria: entrar con ambos encendidos, apagarlos, cortar red hasta reentrada completa y comprobar que siguen apagados; también probar el caso inverso, salida voluntaria y cambio de sala. La pantalla debe respetar el permiso del sistema, sin forzar una captura nueva silenciosa.

### P0/P1: la política propia tarda demasiado para una congestión súbita

La muestra se toma cada 60 segundos (`useLiveKit.ts:77,888`); el ahorro de pantalla espera dos muestras malas y sale tras cinco buenas (`modoAhorro.ts`). La cámara puede bajar al detectar la primera señal, pero también depende de ese ciclo. La primera muestra llega a los 15 segundos.

Propuesta: separar control local rápido cada 2–5 segundos de telemetría agregada cada 30–60 segundos. Conservar audio primero, bajar cámara y efectos costosos, mantener texto legible a menos cuadros. No multiplicar escrituras a Supabase para acelerar la decisión ni prometer que ningún enlace de internet pueda caerse.

### P1: tormentas de reconexión

Token, reconexión y monitores usan tiempos deterministas. `CoworkRoomMonitor.tsx:330–342` repite esperas iguales entre salas. Después de un corte general pueden concentrar intentos. Añadir dispersión aleatoria acotada, presupuesto de intentos y clasificación de errores: red temporal, sesión vencida y permiso revocado. No convertir un 403 en un reintento permanente ni abrir permisos para reparar la conexión.

### P1: un supervisor representa varias conexiones

`CoworkHostDashboard.tsx:1926` construye fichas para todas las salas; 2737 crea un monitor por ficha. Su habilitación depende de permiso y sala abierta, no de un límite visible. `CoworkCreateDialog.tsx` limita la creación a 30 salas, lo cual no certifica capacidad.

Un supervisor con 30 salas puede sumar 30 conexiones aunque sea una persona. Propuesta: limitar video por visibilidad y capacidad del equipo, paginar/virtualizar el tablero y separar presencia de video. Mantener el audio solicitado. No prometer que un navegador mostrará 1.000 videos simultáneamente.

### P1: dos servidores no equivalen a recuperación automática

`.github/workflows/livekit-region.yml` cambia manualmente el único `LIVEKIT_URL`. No se comprobó un clúster compartido de estado/ruteo entre Miami y St. Louis. Cambiar esa variable no migra una llamada viva.

Propuesta: destino estable, afinidad por sala, Redis con alta disponibilidad, retiro gradual de servidores y conmutación probada. Si muere el servidor de medios, las conexiones se reconstruyen; no prometer recuperación sin ningún corte.

### P1: redes corporativas, certificados y versiones

TURN 5349 y STUN 3478 respondieron en la auditoría. Falta probar una llamada real bloqueando UDP y otra red que solo permita TLS 443. Tener señalización por 443 no prueba TURN por 443. La documentación recomienda 443 para TURN/TLS sin balanceador delante.

Actualizar LiveKit 1.8.4 y Egress 1.9 requiere laboratorio de compatibilidad. El compose antiguo del repositorio no representa el montaje actual. No se identificó todavía una relación causal entre versiones viejas y todas las caídas.

## Dimensionamiento de los cuatro niveles

Contar por separado: cuentas registradas, usuarios diarios, personas simultáneas en la app y conexiones simultáneas de medios. Estas últimas incluyen monitores. La primera meta pedida se interpreta como 230 personas simultáneas, con evidencia.

Para un presupuesto preliminar se puede comparar 30% de las personas en llamada frente a un escenario de estrés del 100%. Ese porcentaje es un supuesto de planificación, no un dato medido de Maven.

LiveKit autónomo distribuye muchas salas entre nodos; una sala debe caber en un solo nodo. Agregar máquinas no demuestra que una reunión de 10.000 cámaras pueda funcionar.

Regla de compra tras las pruebas: `nodos = ceil(conexiones / capacidad_segura_por_nodo) + 1`. Incluir conexiones de supervisores y medir capacidad segura con margen de CPU, memoria y red. El nodo adicional debe soportar la redistribución tras un fallo: escribir “N+1” no sustituye la prueba.

- **230:** laboratorio equivalente a Miami (4 CPU), generador separado y comparación con 8 CPU dedicadas como candidato. Ensayar personas más monitores, llamadas directas, pantalla, TURN y reentrada masiva. Aislar grabación y documentos para que no compitan con voz.
- **1.000:** reparto automático de salas, balanceo, Redis redundante, trabajadores separados para grabación/IA y límites por empresa. Reducir consultas repetidas y validar aislamiento entre dos organizaciones.
- **3.000:** grupo de servidores ampliable, reserva ante fallo, control de admisión, límites de sesiones y monitores por empresa, presupuesto de tráfico y restauración/conmutación demostradas. Operación con responsable y objetivos medidos.
- **10.000:** fallos aislados por grupos de clientes, al menos dos zonas independientes, regiones según distribución real, observabilidad por organización y continuidad operativa. No se resuelve comprando un VPS más grande.

St. Louis aloja ONLYOFFICE: sus recursos no son una reserva exclusiva de llamadas. Evitar dimensionar el respaldo como si toda esa máquina estuviera libre.

## La transferencia puede pesar más que el servidor

Fórmula orientativa: `GB/mes = participantes medios × horas/mes × Mbps recibidos medios × 0,45`.

A 1 Mbps recibido durante 176 horas al mes, cada persona sostenida representa 79,2 GB; 1.000 representarían 79,2 TB y 10.000, 792 TB. Si solo el 30% está en llamada, multiplicar por 0,3; si recibe 3 Mbps, por 3. Añadir protocolos, monitores, TURN y grabación según el proveedor, evitando contar el mismo tráfico dos veces. Son supuestos, no medidas ni una cotización. Operación 24/7 implica unas 4,15 veces las horas de este ejemplo.

## Banco de aceptación propuesto para 230

Estos objetivos son una propuesta, no resultados alcanzados:

1. Tres mezclas: llamadas 1:1; salas de 6–12 con pantalla; supervisor con 12 salas visibles y 30 asignadas. Contar personas, conexiones y pistas por separado.
2. Generadores en otras máquinas, con capacidad disponible. Registrar versiones exactas y medir clientes Mac Intel, Apple Silicon y Windows modestos.
3. Rampa 33→100→230, sostener 60 minutos y después una jornada de ocho horas; probar ráfagas, 30% de conexiones TURN, pantalla y grabación simultáneas. Separar el generador de cualquier fallo del producto.
4. Metas iniciales: al menos 99,5% de entradas exitosas, P95 de entrada menor a 5 segundos, P95 de recuperación menor a 10 segundos después de restablecer internet. Ningún bucle de identidad duplicada ni encendido de micrófono/cámara que el usuario había apagado.
5. Probar pérdida 0/1/3/5%, subida 0,5/1/3/10 Mbps, jitter 30/80 ms y RTT 100/250/500 ms. Medir audio, congelaciones, texto legible y tiempo de recuperación; un HTTP 200 no confirma una conversación audible.
6. Metas de plataforma: lecturas principales P95 menor a 500 ms, 5xx menor a 0,1%, acciones básicas de interfaz P95 menor a 200 ms, memoria estable durante la jornada y recursos críticos con margen. Errores de permisos deliberados se cuentan aparte.
7. Medir caídas involuntarias por 1.000 horas de participante, con versión y causa observada. No dividir eventos heterogéneos ni usar la cantidad instantánea de conexiones como censo de usuarios únicos.
8. Entregar resultados brutos, resumen, reproducción y plan de retorno. Recorrido pequeño diario, carga mensual aislada y pruebas antes de cambios relevantes, con presupuesto previo conforme a la elección del dueño. No programar carga masiva en producción.

## Fuentes oficiales consultadas

- [LiveKit: distribución y regiones](https://docs.livekit.io/transport/self-hosting/distributed/): Redis compartido, asignación de salas y retiro gradual; una sala por nodo.
- [LiveKit: pruebas de carga](https://docs.livekit.io/transport/self-hosting/benchmark/): productores, suscriptores y bitrate determinan carga; generadores con CPU y red suficientes. Las cifras del proveedor no certifican Maven.
- [LiveKit: puertos y firewall](https://docs.livekit.io/transport/self-hosting/ports-firewall/): TURN/TLS 443 cuando no hay balanceador y puertos de medios TCP/UDP.
- [LiveKit: grabación Egress](https://docs.livekit.io/transport/self-hosting/egress/): servicio separado, recomendación de 4 CPU y 4 GB por instancia; capacidad depende del tipo de grabación.

## Aclaración del costo de supervisión (segunda lectura)

No todos los usuarios abren monitores. `CoworkPage.tsx:817` reserva el tablero a `cowork.isHost`; los demás usan `CoworkParticipantView`. El tablero además exige `N:cowork.verpantallas` (`CoworkHostDashboard.tsx:171,2764`). Las salas sin personas asignadas no montan monitor (2933). Las salas con asignados mantienen el monitor aunque temporalmente parezcan vacías, para detectar el regreso de la gente.

Pasar a avatares o silenciar el audio NO elimina la conexión. La conexión se cierra al desmontar/deshabilitar el componente, entrar a esa misma sala, abrir su hoja móvil (la nueva vista sustituye al monitor), o rehacer el efecto por token/reintento. El administrador en modo incógnito abre otro monitor por sala más el Hub. No se observa límite de conexiones basado en el área visible.

Modelo financiero más fiel: `C = conexiones principales + supervisores × salas monitorizadas + observadores adicionales + grabadores/bots`. Si cada persona tiene una conexión principal, 10% son supervisores y cada uno vigila 12 salas, entonces C es aproximadamente 2,2 veces las personas. Es un escenario supuesto, no el reparto actual de KASH.

| Personas simultáneas | Conexiones de ese escenario | Nodos con q=250 | Nodos con q=100 |
|---:|---:|---:|---:|
| 230 | 506 | 4 | 7 |
| 1.000 | 2.200 | 10 | 23 |
| 3.000 | 6.600 | 28 | 67 |
| 10.000 | 22.000 | 89 | 221 |

Se aplica `ceil(C/q)+1`. **q=100–250 no está medido ni proviene de un benchmark: es únicamente una sensibilidad financiera que el ensayo debe reemplazar.** Además, conexiones que solo observan no cuestan lo mismo que una llamada bidireccional con cámara/pantalla; q debe medir la mezcla completa. No usar esta tabla como recomendación de compra.

Reducir video por visibilidad o hacer `unsubscribe` baja CPU/tráfico, pero NO reduce automáticamente el número de conexiones Room. Un objetivo de una conexión por persona preservando 12 salas simultáneas exige un agregador/puente de medios o rediseño, que no existe hoy y necesita aislamiento y pruebas. Alternativa más pequeña: presupuesto de 2–4 monitores simultáneos por supervisor más los explícitamente abiertos; con la misma proporción del 10%, el escenario sería aproximadamente 1,2–1,4 conexiones por persona. Eso modifica la supervisión disponible y necesita decisión de producto; no ocultarlo como un ajuste técnico sin efecto.
