

# Documentar patrones de UI en Design System + Corregir layout de Nuevo Creador

## 1. Corregir layout de /creadores/nuevo

El problema: `NuevoCreadorForm.tsx` usa `<main className="flex-1 overflow-auto">` sin padding directo, y envuelve en `<div className="max-w-4xl mx-auto p-6">`. Ademas, `NuevoCreador.tsx` no tiene `min-w-0` en el contenedor flex. La pagina principal `/creadores` usa `<main className="flex-1 overflow-auto p-6 space-y-6 min-w-0">`.

**Cambios:**
- `src/pages/NuevoCreador.tsx`: agregar `min-w-0` al div `flex flex-1 flex-col`
- `src/pages/creadores/NuevoCreadorForm.tsx` (linea 277): cambiar `<main className="flex-1 overflow-auto">` a `<main className="flex-1 overflow-auto p-6 min-w-0">` y ajustar el div interior para que no duplique padding (quitar `p-6` del div, mantener `max-w-4xl mx-auto pb-24 space-y-6`)

## 2. Documentar KPI Cards con hover en Design System

Agregar una subseccion en `CardsSection.tsx` titulada "KPI / Metric Cards" que documente:
- La estructura estandar: icono + label + valor + subtitulo
- El patron de hover con gradiente y escala (`hover:scale-[1.03]`, `hover:bg-gradient-to-br`, `hover:from-[color]/15`, `hover:to-transparent`, `hover:border-[color]/40`)
- Ejemplo visual con 3 cards de diferentes colores (success, primary, warning)
- Regla: cada KPI card debe tener un color tematico asociado y aplicar el hover con gradiente correspondiente

**Archivo:** `src/pages/design-system/sections/CardsSection.tsx`

## 3. Documentar iconos custom de redes sociales en Design System

Agregar una subseccion en `IconsSection.tsx` titulada "Iconos de marca / Redes Sociales" que documente:
- Los 3 iconos custom: `InstagramIcon` (con gradiente), `TikTokIcon`, `XIcon`
- Ruta de importacion: `@/components/icons/[Name]Icon`
- Regla: para redes sociales siempre usar estos componentes custom en lugar de Lucide
- Ejemplo visual mostrando los 3 iconos

**Archivo:** `src/pages/design-system/sections/IconsSection.tsx`

## 4. Documentar Tab Bars / Filtros en Design System

Agregar una nueva subseccion en `DataDisplaySection.tsx` (o en la seccion de Inputs/Dropdowns) titulada "Tab Bars & Filtros" que documente:
- El patron de Tab Bar inline: `inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1` con botones `variant="secondary"` (activo) / `variant="ghost"` (inactivo)
- El patron de Select Filters: usar `SelectValue placeholder={nombre_descriptivo}` sin valor por defecto, con opcion "Todos" en el dropdown para limpiar filtros
- Regla: los selects de filtros siempre muestran el nombre del campo como placeholder, nunca "Todos" por defecto

Se agregara en `InputsSection.tsx` por ser mas relevante a inputs/controles de filtrado.

**Archivo:** `src/pages/design-system/sections/InputsSection.tsx`

## Resumen de archivos

| Archivo | Cambio |
|---|---|
| `src/pages/NuevoCreador.tsx` | Agregar `min-w-0` al contenedor flex |
| `src/pages/creadores/NuevoCreadorForm.tsx` | Corregir padding/layout del main |
| `src/pages/design-system/sections/CardsSection.tsx` | Documentar KPI cards + hover con gradiente |
| `src/pages/design-system/sections/IconsSection.tsx` | Documentar iconos custom de redes sociales |
| `src/pages/design-system/sections/InputsSection.tsx` | Documentar Tab Bars y Select Filters |
