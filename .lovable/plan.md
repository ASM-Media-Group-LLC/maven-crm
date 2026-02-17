

## Ajustes en Promolog: Tab bar, Limpiar filtros y Grid cards

### 1. Eliminar "Dashboard" del tab bar

Quitar la opcion "Dashboard" del array `tabItems`. Las dos tabs restantes seran **Agentes** y **Campanas**. El contenido que actualmente se muestra en "Dashboard" (Entradas Recientes con tabla/grid) pasara a mostrarse siempre, fuera de cualquier condicional de tab activo.

### 2. Corregir "Limpiar filtros"

El boton actualmente resetea search, status, network, category y creator filter, pero **no resetea las fechas** (`dateFrom` y `dateTo`). Se agregara el reset de ambas fechas a `undefined` en el handler del boton.

### 3. Redisenar las cards del Grid

Actualmente `PromologEntryCard` muestra toda la informacion en formato horizontal (notas completas visibles). Segun la imagen de referencia, las cards deben tener un diseno vertical compacto:

```text
┌──────────────────────────────┐
│ PL652558              [Sí]  │  <- ticket + badge resultado
│ ✅ Isabella Gomez Jaramillo │  <- icono resultado + nombre
│ 📸 @isabellasantos1273      │  <- icono red + handle
│                              │
│ [Instagram] [OnlyFans]       │  <- badges red + plataforma
│ 🕐 04:46 PM · 👤 Fabiana    │  <- hora + agente
│                              │
│ (notas ocultas o truncadas)  │
│                              │
│ [────── ✏️ Editar ──────]    │  <- boton editar full width
└──────────────────────────────┘
```

Cambios clave vs el diseno actual:
- El badge de resultado (Si/No/Parcial/Pendiente) va en la esquina superior derecha, con color (verde=Si, rojo=No, amarillo=Parcial, gris=Pendiente)
- El icono de resultado (check verde, X rojo) va junto al nombre
- Las notas se ocultan (no se muestran en la card del grid)
- El boton "Editar" ocupa todo el ancho de la card
- Layout vertical en vez de horizontal

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/promolog/PromologContent.tsx` | (1) Quitar "dashboard" de `tabItems`, tab por defecto pasa a "agentes". (2) Mover el contenido de Entradas Recientes fuera del condicional de tab. (3) Agregar reset de fechas en "Limpiar filtros". |
| `src/pages/promolog/PromologEntryCard.tsx` | Redisenar la card para que tenga layout vertical compacto segun la imagen de referencia, sin mostrar las notas. |
| `src/pages/promolog/PromologGrid.tsx` | Ajustar grid a `lg:grid-cols-3` (sin xl:grid-cols-4) para dar mas espacio a las cards. |

