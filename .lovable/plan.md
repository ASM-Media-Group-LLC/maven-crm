

## Plan: Estandarizar badges en todas las tablas

### Problema identificado

Hay **3 sistemas de colores diferentes** para los mismos conceptos:

| Concepto | LeadGen / Contactos / Creadores | Closers LeadTable | Closers CreatorTable |
|----------|---|----|-----|
| **Categoría (A+/A/B+/B/C)** | `Badge variant="success-soft"` etc. | Clases hardcoded: `border-emerald-500 text-emerald-500 bg-emerald-500/10` | No aplica |
| **Stage** | No aplica | `stageColor()` con `bg-green-100 text-green-800` | `stageBadgeColor()` con colores similares pero diferentes |

Los módulos de LeadGen, Contactos y Creadores ya usan el estándar correcto (`Badge` con variantes `-soft`). **Closers es el que está desalineado.**

### Cambios

#### 1. `LeadTable.tsx` — Categoría: usar Badge `-soft` variants

Reemplazar `CATEGORY_BADGE_COLORS` (clases hardcoded) por el mismo mapa `calidadVariant` que usa LeadGen:

```tsx
// ANTES (hardcoded)
"A+": "border-emerald-500 text-emerald-500 bg-emerald-500/10"

// DESPUÉS (Badge variant)
"A+": "success-soft"   // verde
"A":  "primary-soft"   // azul
"B+": "warning-soft"   // amarillo
"B":  "secondary-soft"  // gris
"C":  "destructive-soft" // rojo
```

Modificar `InlineCategorySelect` para usar `<Badge variant={...}>` en vez de clases manuales.

#### 2. `LeadTable.tsx` — Stage: usar Badge `-soft` variants

Reemplazar `stageColor()` por variantes del componente Badge:

| Stage | Variant |
|-------|---------|
| Nuevo | `primary-soft` |
| Asignada | `info` o `secondary-soft` |
| Confirmada | `success-soft` |
| Completada | `success` |
| No interesada | `destructive-soft` |
| Default (En negociación, etc.) | `warning-soft` |

Modificar `InlineStageSelect` para renderizar `<Badge variant={...}>`.

#### 3. `CreatorTable.tsx` — Unificar `stageBadgeColor` con el mismo sistema

Reemplazar `stageBadgeColor()` por el mismo mapa de variantes del punto 2, usando `<Badge variant={...}>`.

#### 4. Eliminar `EmployeeStatusBadge` de HR si usa colores hardcoded

El componente `EmployeeStatusBadge` usa `getStatusColors()` con clases manuales (`bg-*`, `text-*`). Se migra al mismo patrón `Badge variant`.

### Archivos a modificar
- `src/pages/closers/components/LeadTable.tsx` — categoría y stage badges → Badge variants
- `src/pages/closers/components/CreatorTable.tsx` — stage badges → Badge variants
- `src/components/hr/EmployeeStatusBadge.tsx` — migrar a Badge component

### Resultado
Todos los badges de categoría, estado y stage usarán el componente `Badge` con las variantes `-soft` del design system, eliminando colores hardcoded.

