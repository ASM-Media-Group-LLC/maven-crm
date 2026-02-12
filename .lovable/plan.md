
# Agregar vista de Agentes al tab "Agentes" en LeadGen

## Resumen

Cuando el usuario hace clic en la pestana "Agentes", se mostrara una vista especifica con:
1. **Barra de filtros adaptada**: placeholder "Buscar agente...", selector de fecha (Hoy), selector "Rendimiento", y toggle lista/grid (sin los filtros de Estado, Calidad y QA).
2. **Card de resumen**: "Rendimiento de Agentes" con fecha actual, fondo con gradiente purpura, y contador "0 Agentes Activos" a la derecha.
3. **Estado vacio**: Card con icono de usuarios y texto "No hay datos para esta fecha".

## Detalle tecnico

### Archivo a modificar: `src/pages/leadgen/LeadGenContent.tsx`

**1. Hacer la barra de filtros condicional segun el tab activo:**

- Cuando `activeTab === "agentes"`:
  - Placeholder del input: "Buscar agente..."
  - Mostrar solo: input de busqueda, selector de fecha (Hoy), selector de "Rendimiento", toggle lista/grid
  - Ocultar: selectores de Estado, Calidad y QA
- Cuando es otro tab, mantener los filtros actuales sin cambios.

**2. Agregar contenido del tab "agentes" en la seccion de Content (linea 155-171):**

Agregar un bloque condicional `activeTab === "agentes"` que renderice:

- **Card de resumen** con:
  - Fondo gradiente purpura (de violeta a purpura oscuro)
  - Borde superior izquierdo con acento purpura/magenta
  - Titulo "Rendimiento de Agentes" en color primary/magenta
  - Subtitulo con la fecha actual formateada: "12 de febrero, 2026"
  - A la derecha: numero grande "0" en color primary y texto "Agentes Activos" con icono de Users

- **Card de estado vacio** debajo:
  - Icono grande de Users (estilizado como en la imagen)
  - Texto "No hay datos para esta fecha"

### Imports adicionales

- Usar `date-fns` (ya instalado) con locale `es` para formatear la fecha actual.

### Sin archivos nuevos

Todo se agrega directamente en `LeadGenContent.tsx` para mantener simplicidad. Si el componente crece mucho, se puede extraer despues.
