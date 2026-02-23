
## Mejoras visuales en la Agenda Compartida (SharedAgendaPage)

### Objetivo

Aplicar las mismas mejoras de UI del calendario interno (`EventosCalendar.tsx`) a la pagina de agenda compartida (`SharedAgendaPage.tsx`), incluyendo el calendario y las tarjetas de proximos eventos.

### Cambios en `src/pages/eventos/SharedAgendaPage.tsx`

#### 1. Calendario

- **Header**: Tipografia mas grande y bold para el mes/ano, botones de navegacion con estilo pill/rounded, badge con conteo de eventos del mes
- **Boton "Hoy"**: Estilo pill con rounded-full igual que en EventosCalendar
- **Dia actual**: Aplicar clase `calendar-day-today` (gradiente primary-to-accent) en lugar del simple `bg-primary/15`
- **Dias con evento**: Agregar animacion pulse sutil a los dots de proyecto
- **Celdas**: Aumentar altura de `h-10` a `h-11`, agregar `hover:scale-105` para efecto de elevacion
- **Footer del calendario**: Agregar barra de resumen con gradiente sutil (igual que EventosCalendar), mostrando icono + conteo de eventos del mes

#### 2. Tarjetas de Proximos Eventos

- **Header de seccion**: Agregar icono Sparkles animado y linea decorativa con gradiente debajo del titulo (como en EventosCalendar)
- **Tarjetas individuales**: Aplicar el nuevo estilo de tarjeta con:
  - Borde izquierdo de 3px de color segun `event_type` (Shooting=azul/primary, Podcast=violeta/accent, Casting=verde/success, Reunion=naranja/warning)
  - Columna de fecha prominente a la izquierda (dia grande + mes abreviado)
  - Icono del tipo de evento con fondo redondeado y color correspondiente
  - Badge "Hoy" con estilo primary cuando el evento es del dia actual
  - Tiempo relativo ("en 3 dias") debajo del nombre
  - Efecto hover con elevacion (`hover:shadow-md hover:-translate-y-0.5`)

#### 3. Mapping de tipos de evento a estilos

Reutilizar la misma funcion `getEventTypeStyle` y el mapeo `typeIcons` del EventosCalendar:

| Tipo | Borde | Fondo icono | Color icono |
|------|-------|-------------|-------------|
| Shooting | `border-l-primary` | `bg-primary/10` | `text-primary` |
| Podcast | `border-l-accent` | `bg-accent/10` | `text-accent` |
| Casting | `border-l-success` | `bg-success/10` | `text-success` |
| Reunion | `border-l-warning` | `bg-warning/10` | `text-warning` |
| Otro | `border-l-muted-foreground` | `bg-muted` | `text-muted-foreground` |

### Detalle tecnico

| Archivo | Cambio |
|---------|--------|
| `src/pages/eventos/SharedAgendaPage.tsx` | Modernizar calendario (header, celdas, today gradient, footer con resumen) y tarjetas de proximos eventos (borde color, fecha prominente, iconos por tipo, badge Hoy, hover effects) |

### Sin cambios adicionales

- No se requieren modificaciones en `index.css` (las clases necesarias ya existen del cambio anterior)
- No se requieren nuevas dependencias
- No se modifica la logica de datos ni las queries RPC
