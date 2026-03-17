

## Diagnóstico

El problema **no es de z-index ni de Popover**. La edición solo funciona en la fila 1 porque las filas 2 y 3 tienen `_source: "leadgen"` (estado "Pendiente LG"), y el código usa `isCloserRow(c)` para decidir si renderiza un selector inline o un `<span>` plano:

```typescript
// Líneas 717-721 — solo filas "closer" obtienen selectores
{isCloser ? (
  <InlineSourceSelect ... />
) : (
  <span>{c.source_account || "—"}</span>  // ← filas leadgen quedan sin edición
)}
```

Esto afecta las columnas Estado, Cuenta origen, Categoría y Notas en el tab "Todas", y Cuenta origen + Categoría en "Asignadas".

## Plan

### 1. Hacer editables TODAS las filas (LeadTable.tsx)

Eliminar la condición `isCloser` para los selectores inline de **Categoría**, **Cuenta origen**, **Estado** y **Notas**. Todas las filas deben ser editables independientemente de `_source`. La condición `isCloser` solo debe usarse para las acciones del DropdownMenu (mover estado, reasignar) que solo aplican a registros `closer_creators`.

### 2. Rediseñar InlineCategorySelect con badges de colores (imagen de referencia)

Cambiar los badges del selector de categoría para que cada opción tenga un color distinto, como muestra la imagen:
- **A+** → verde brillante (border + text green)
- **A** → amarillo/dorado
- **B+** → azul
- **B** → gris/default
- **C** → rojo

El badge del trigger también debe mostrar el color correspondiente.

### 3. Cuenta origen: usar LEADGEN_COMPANIES como opciones

Reemplazar el uso del prop `sourceAccounts` (que puede estar incompleto) por `LEADGEN_COMPANIES` importado de `leadgenConstants.ts`, que ya incluye todas las agencias/plataformas (UNLOK, Blu app, Trafix, LeakHunter, etc.). Mantener la opción "Otra..." para agregar nuevas.

### Archivos a modificar
- `src/pages/closers/components/LeadTable.tsx` — eliminar condición `isCloser` en selectores inline, rediseñar colores de categoría, importar y usar `LEADGEN_COMPANIES` para cuenta origen

