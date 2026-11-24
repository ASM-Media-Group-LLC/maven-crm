# Maven: propuesta de estabilidad y crecimiento

Fecha: 24/11/2026. Revisión de `origin/main` `9dadf3250` y consultas de solo lectura a KASH y al edificio de Maven. Esta entrega es una **propuesta y presupuesto orientativo**; no incluye nuevas compras, activaciones, restauraciones ni pruebas de carga. Las reparaciones de PR283 son una entrega anterior ya publicada.

## Decisiones incorporadas

- Conservar audio y reducir video automáticamente si empeora la conexión.
- Evaluar recuperación del servicio en menos de una hora, con presupuesto previo.
- Primera meta de prueba: **230 personas simultáneas**, más las conexiones de sus monitores. No se ha certificado esa capacidad.
- Cotizar recorrido diario y carga mensual aislada, además de pruebas antes de cambios importantes.
- Entregar plan para 1.000, 3.000 y 10.000 personas activas; el presupuesto distingue actividad simultánea de usuarios mensuales.

La pérdida máxima propuesta (15 minutos de datos / una hora de archivos) no fue elegida expresamente por el dueño: se presenta para aprobar con la política de recuperación. Tampoco hay autorización de compra implícita en esos objetivos.

## Entregables y evidencia

- [Propuesta formal en PDF](Maven-plan-de-crecimiento-y-presupuesto-2026-11-24.pdf).
- [Llamadas, supervisión y arquitectura](llamadas.md).
- [Promolog, Argos y funciones pausadas](funciones.md), con [datos agregados](funciones-evidencia.json).
- [Recuperación y estado real de organizaciones](recuperacion.md).
- [Modelo de costos](modelo-costes.json) y [tarifas públicas de referencia](tarifas-publicas.json).

Promolog/Argos se midieron con ventanas fijas que terminan el 24/11 a las 08:30 de Nueva York. Las lecturas de esquema y configuración se hicieron alrededor de 08:33-08:38. No son las mismas ventanas que la auditoría nocturna anterior.

## Hallazgos que cambian el plan

1. Existe adaptación de video, pero la política propia exceptúa Meet/llamadas directas de ciertos recortes por mala subida. La causa de todas las caídas aún no está establecida.
2. Los anfitriones con permiso de pantallas abren una conexión por sala monitorizada. Ocultar un video no elimina esa conexión; dimensionar solo por personas subestima capacidad y minutos facturados.
3. Promolog: 243 de 246 filas recientes tienen fallo de lectura de X; IG, Telegram y Facebook no presentan entradas nuevas en siete días. Un HTTP 200 no acredita cobertura correcta.
4. Argos alcanza su límite económico: 238 de 687 rondas registran omisiones por presupuesto. El contador acumulado no representa imágenes únicas.
5. El árbol de organizaciones existe en archivos, pero no en el esquema real del edificio revisado. Hay una colisión de identificadores de migración. No basta una comparación por número.
6. Tres tablas vacías del edificio carecen de RLS y tienen privilegios de lectura anónima. No se probó extracción por HTTP ni se observó fuga; cerrar y probar antes de poblar clientes.
7. Drive cataloga 33,2 TB. Recuperación del servicio <1 h requiere servir desde una copia accesible o un conjunto crítico; no descargar todo tras la falla. Historial real de backups/PITR aún no confirmado.

## Modelo financiero reproducible

Todos los importes son USD antes de impuestos y no equivalen a cotización ni capacidad demostrada. La factura actual no se concilió: las tablas son reservas de partidas de infraestructura, **no costo incremental**. La implementación, operación humana, módulos de IA/Promolog, grabaciones, correo/licencias existentes, ampliación de almacenamiento principal y servicio alterno de archivos requieren presupuesto separado.

Supuestos de sensibilidad:

- `N`: personas simultáneas en la app.
- `H = ceil(0,05 × N)`: anfitriones, supuesto no medido.
- `R = 12`: salas monitorizadas por anfitrión.
- `M = ceil(f × N)`: personas con conexión principal de medios; `f=1` intensivo, `f=0,2` mixto. Ambos escenarios conservan el mismo número de supervisores.
- `C = M + H × R`: conexiones, sin incluir grabadores/bots adicionales.
- `q=100 o q=250`: conexiones por nodo, **hipótesis financiera sin medir**. No representa aforo previsto ni recomendación de compra.
- `nodos = ceil(C/q) + 1`: reserva de un nodo. La recuperación y el reparto real se deben probar.
- `GB = (M × 1,5 + H × R × 0,5) × 176 × 0,45 × 1,2`: tráfico decimal mensual, con 176 h, Mbps recibidos agregados y 20% de reserva. Los 0,5 Mbps por sala son una hipótesis ligera; probar hasta 3 Mbps y varias pistas.
- Reserva de transferencia: `GB × US$0,01`; no se descuentan las cuotas incluidas del proveedor para no suponer un reparto o ahorro no validado.
- Subtotal: nodos a US$160 + transferencia + provisiones de app/BD/Realtime/backup/pruebas. Total: 25% de contingencia, redondeado hacia arriba al siguiente múltiplo de US$50.

Las provisiones de app/Realtime/pruebas son estimaciones de ingeniería, no tarifas verificadas. El cálculo de BD supone una base KASH, el edificio y un laboratorio: Pro25 - crédito10, KASH Large110, PITR200 para los dos proyectos productivos, más cómputo del edificio y ensayos. Escenarios:

| Personas | Edificio | Réplicas de lectura | Laboratorio | Reserva BD resultante |
| --- | --- | --- | --- | --- |
| 230 | Medium60 a Large110 | 0 | 10-30 | 395-465 |
| 1.000 | XL210 a 2XL410 | 0-210 | 30 | 565-975 |
| 3.000 | 2XL410 a 4XL960 | 210-410 | 60 | 1.005-1.755 |
| 10.000 | 4XL960 a 8XL1.870 | 820-1.920 | 110 | 2.215-4.225 |

Es una elección de tamaños para presupuesto, no una relación probada entre usuarios y CPU. Una réplica de lectura no constituye respaldo de errores lógicos ni alta disponibilidad automática. Si se necesita HA contractual, otras regiones o réplicas operativas adicionales, se cotizan aparte. Los créditos/plan compartidos con otros proyectos se concilian al comprar.

Copia externa: 33,2 TB × US$6,95/TB ≈ US$231; se reserva US$300/mes para versiones. Eso no define retención ni prueba integridad. No incluye el servicio alternativo desde el cual operar ni el crecimiento de archivos de nuevos clientes.

Alternativa Cloud: `500 + max(minutos-1.500.000,0)×0,0004 + max(GB-3.000,0)×0,10`; solo se presenta precio Scale cuando `C≤5.000`. Más conexiones requieren cotización empresarial. Los monitores consumen minutos aunque no se reciban videos. El modelo público no incluye grabaciones, IA ni las otras piezas de Maven.

## Regenerar y verificar

```sh
python3 scripts/audit/calcular_presupuesto_escalado.py
python3 scripts/audit/propuesta_escalado.py --salida /ruta/propuesta.pdf
pdftoppm -scale-to 1100 -png /ruta/propuesta.pdf /ruta/revision/pagina
```

El PDF necesita ReportLab. Su generador reutiliza los estilos del informe anterior y rechaza texto que sale del área útil. La revisión incluye los 15 renders, recálculo independiente de las ocho combinaciones y comparación de cifras de Promolog/Argos con la evidencia. No se ejecutó la suite de aplicación porque esta entrega no cambia su código ni comportamiento.

## Compra recomendada por fases

1. Presupuestar **hasta US$75 de infraestructura temporal** para comparar 4 CPU, 8 CPU dedicadas y generadores separados. Trabajo técnico aparte. Es un tope propuesto, no aprobado ni gastado.
2. Reparar llamadas y medir la mezcla real de supervisión. Ejecutar el banco de aceptación de 230 con al menos una hora sostenida y una jornada de ocho horas.
3. Medir q seguro con margen y fallo de nodo; reemplazar la variable financiera por evidencia. Cotizar recursos exactos y diferencia respecto de contratos existentes.
4. Cerrar recuperación y aislamiento multiempresa, recuperar Promolog por red sin activar indiscriminadamente las 20 tareas pausadas, y programar las pruebas elegidas después de aprobar presupuesto.
5. Repetir en 1.000, 3.000 y 10.000. Una prueba de 230 no autoriza multiplicar el aforo ni afirmar capacidad mayor.

## Fuentes externas

Se usó Stripe Directory por su API HTTP pública documentada: resolvió Supabase; no devolvió las referencias exactas de LiveKit/Vultr/Backblaze, por lo que se consultaron sus fuentes oficiales. No se provisionó ningún servicio ni se contactó a proveedores.

- [Directorio: guía de consulta](https://www.stripe.directory/llms.txt)
- [Catálogo público Vultr](https://api.vultr.com/v2/plans?per_page=500)
- [Exceso de transferencia Vultr](https://docs.vultr.com/support/platform/billing/what-is-the-bandwidth-overage-rate)
- [Precios Supabase](https://supabase.com/pricing)
- [Backups y PITR](https://supabase.com/docs/guides/platform/backups.md)
- [Límites de Realtime](https://supabase.com/docs/guides/realtime/limits)
- [Cobro de conexiones](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-peak-connections)
- [Cobro de mensajes](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages)
- [LiveKit: distribución](https://docs.livekit.io/transport/self-hosting/distributed/)
- [LiveKit Cloud: tarifas](https://livekit.com/pricing.md)
- [Backblaze B2](https://www.backblaze.com/cloud-storage/pricing)
