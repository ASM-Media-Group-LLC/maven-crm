

## Plan: Estandarizar tabla de Templates con DataTableShell

### Problema
La tabla de Templates usa `<Table>` directamente sin el wrapper `DataTableShell`, lo que resulta en:
- Sin borde redondeado ni contenedor visual consistente
- Sin paginación (aunque el dataset es pequeño, la estructura debe ser consistente)
- Sin sticky headers
- Inconsistente visualmente con Contactos, Closers, Promolog, LeadGen

### Cambio

**Archivo: `src/pages/finanzas/facturacion/TemplatesPage.tsx`**

1. Importar `DataTableShell`
2. Envolver la `<Table>` con `<DataTableShell>` usando `className="flex-1 min-h-0"`, pasando paginación básica (1 página si hay pocos registros)
3. Agregar columna `#` al inicio (número de fila) para consistencia con otras tablas
4. Aplicar sticky headers por celda (`sticky top-0 z-10 bg-background`)
5. Cambiar el contenedor padre de `overflow-auto p-6` a `flex-1 min-h-0 flex flex-col px-6 py-4` para que DataTableShell controle el scroll

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `TemplatesPage.tsx` | Envolver tabla con DataTableShell, agregar columna #, sticky headers |

