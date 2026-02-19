
## Añadir banner de resumen y vista de calendario semanal a Agentes y Supervisores

### Contexto actual

| Módulo | Pestaña | Banner | Vista Calendario |
|---|---|---|---|
| LeadGen | Agentes | ✅ Ya existe | ❌ Falta |
| LeadGen | Supervisores | ❌ No tiene | ❌ Falta |
| Promolog | Agentes | ✅ Ya existe | ❌ Falta |

### Qué se va a construir

Siguiendo exactamente la imagen de referencia, se añade:

1. **Banner de resumen** (donde falta, en LeadGen > Supervisores) con el mismo estilo que ya existe en Agentes: gradiente `primary`, recuento de activos a la derecha, fecha de la semana seleccionada.

2. **Vista de calendario semanal** en las tres pestañas afectadas, activada mediante un tercer botón de vista (icono de calendario) junto a los botones Lista/Grid existentes. La vista muestra:
   - Navegación de semana: botones "Semana anterior" / "Semana siguiente"
   - Encabezado con el rango de fechas de la semana actual
   - Tabla con columnas: Agente | LUN | MAR | MIÉ | JUE | VIE | SÁB | DOM | Total
   - La columna del día actual resaltada en azul (igual que en la imagen)
   - Celdas vacías mostradas como `—`
   - Fila de **Total** al final con el gran número acumulado
   - El total general en badge de color primario

### Datos mostrados por módulo

- **LeadGen > Agentes**: número de leads por día filtrados por `compania` del agente (datos reales de Supabase)
- **LeadGen > Supervisores**: número de QA reviews por día (datos del mock `mockSupervisores`, que actualmente todos son 0)
- **Promolog > Agentes**: número de promociones (entries) "Sí" registradas por agente por día (datos reales de `promolog_entries`, campo `reviewed_by`)

### Archivos a modificar

**1. `src/pages/leadgen/LeadGenContent.tsx`**

- Añadir estado `weekOffset` (número entero, 0 = semana actual, -1 = semana anterior, etc.)
- Crear función `getWeekDays(offset)` que devuelve los 7 días de la semana seleccionada (lunes a domingo) usando `date-fns`
- Añadir icono `Calendar` a los imports de `lucide-react` y agregar el tercer botón de vista `calendar` en la barra de controles de ambas pestañas (Agentes y Supervisores)
- **Agentes tab**: añadir el bloque de calendario que calcula `leadsInDay(agente, day)` consultando el array `leads` ya disponible, filtrando por `compania` y la fecha
- **Supervisores tab**: añadir banner de resumen (igual al de Agentes) + bloque de calendario (con datos del mock)
- Añadir el tipo `"calendar"` al estado `viewMode`

**2. `src/pages/promolog/PromologContent.tsx`**

- Añadir estado `agentWeekOffset` separado del estado de fecha principal
- Crear función `getWeekDays(offset)` local
- Añadir el botón de vista `calendar` (con icono `Calendar` ya importado como `CalendarIcon`) en la fila de filtros de la pestaña Agentes
- Crear el bloque de calendario semanal en la pestaña Agentes: filtra `promologEntries` donde `reviewed_by === agente.name` y la fecha caiga en el día correspondiente, mostrando solo entradas con `promoted = 'true'` (Sí)
- Añadir el tipo `"calendar"` al `agentesView`

### Comportamiento del calendario

```text
[ < Semana anterior ]    16 De Febrero – 22 De Febrero, 2026    [ Semana siguiente > ]

Agente         LUN 16  MAR 17  MIÉ 18  JUE 19  VIE 20  SÁB 21  DOM 22   Total
yeison.bello     167     126     154      64       —       —       —       511
julieth.rojano    17      79      72      79       —       —       —       247
─────────────────────────────────────────────────────────────────────────────────
Total            364     267     226     143       —       —       —      1000
```

- La columna del día actual se resalta con `bg-primary/10 text-primary font-bold`
- Días futuros o sin datos muestran `—` en `text-muted-foreground`
- El total general (esquina inferior derecha) usa un `Badge` con variante `default`
- La navegación de semanas no hace llamadas adicionales a Supabase; filtra los datos ya cargados en memoria (los últimos 200 registros de leads o promolog_entries)

### Resumen de cambios

| Archivo | Cambio |
|---|---|
| `src/pages/leadgen/LeadGenContent.tsx` | Nuevo viewMode `calendar`, navegación de semana, tabla semanal en Agentes y Supervisores; banner en Supervisores |
| `src/pages/promolog/PromologContent.tsx` | Nuevo agentesView `calendar`, navegación de semana, tabla semanal en Agentes |
