

## Reestructurar header y filtros de Promolog

### Problema actual

1. Los filtros estan en un contenedor separado debajo del header, no coinciden con el patron estandar (como Eventos)
2. "Ver Agentes" y "Ver Campanas" son botones sueltos en la barra de filtros que duplican funcionalidad de navegacion
3. El buscador y los selectores de filtro no estan en la misma linea como en el resto de la plataforma

### Estructura objetivo (igual que Eventos)

```text
HEADER: [Titulo + subtitulo]                    [Agregar Campaña] [Agregar Entrada]
─────────────────────────────────────────────────────────────────────────────────────
TAB BAR: [Dashboard] [Agentes] [Campañas]

FILTROS: [🔍 Buscar entrada...]  [Estado v]  [Red Social v]  [Categoría v]  [📅 Fechas]  [≡] [⊞]

42 entradas
TABLE / GRID...
```

### Cambios

**Archivo**: `src/pages/promolog/PromologContent.tsx`

1. **Mover los tabs "Dashboard / Agentes / Campanas"** de la barra de filtros al area de contenido, como un `inline-flex rounded-lg bg-muted/50 p-1` con `Button variant="secondary"/"ghost"` (patron estandar de tab bar). Esto reemplaza los botones "Ver Agentes" y "Ver Campanas".

2. **Unificar la barra de filtros** en una sola linea debajo de los tabs:
   - Buscador con icono de Search y `flex-1 max-w-xs`
   - Select de Estado (Resultado): Sí, No, Parcial, Pendiente
   - Select de Red Social: Instagram, TikTok, X, Telegram
   - Select de Categoría (ya existe)
   - DateRangePicker
   - Boton "Limpiar filtros" (siempre visible)
   - Toggles de vista List/Grid alineados a la derecha

3. **Los filtros se muestran siempre** (en las 3 tabs: dashboard, agentes, campanas), no solo en dashboard.

4. **Eliminar** el contenedor separado `px-6 py-3` de filtros y moverlo todo dentro del area de contenido scrollable, justo despues de los tabs.

### Detalle tecnico

- Reemplazar las lineas 364-405 (barra de filtros actual) por un espacio vacio (la barra se mueve al contenido)
- Dentro del area `flex-1 overflow-auto p-6`, colocar primero los tabs y luego la barra de filtros unificada
- Los tabs usan el patron estandar: contenedor `inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1`, botones con `variant={active ? "secondary" : "ghost"} size="sm"`
- El "Calendario" tab se elimina ya que no tiene contenido implementado y no es parte del scope actual
- Contador de entradas debajo de los filtros: `{filteredEntries.length} entradas`

