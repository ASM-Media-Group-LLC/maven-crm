

## Plan: Revertir layout y corregir auto-hide de stats cards

### Problema raíz
El scroll real ocurre **dentro** de `DataTableShell` (su div interno `overflow-auto` en línea 48), no en el contenedor externo. Por eso `handleContentScroll` nunca detecta `scrollTop > 40` — el div externo no scrollea realmente.

### Solución

#### 1. Agregar prop `onScroll` a `DataTableShell` (`data-table-shell.tsx`)
- Añadir prop opcional `onScroll?: (e: React.UIEvent<HTMLDivElement>) => void`
- Forwarded al div interno scrollable (línea 48)

#### 2. Revertir layout en `ClosersContent.tsx`
- Sacar `ClosersKPICards` del div scrollable y devolverlo al layout original (como `shrink-0` antes del `DataTableShell`)
- Envolver las cards en el div con transición `max-h` condicional
- Pasar `onScroll={handleContentScroll}` al `DataTableShell`

#### 3. Revertir layout en `LeadGenContent.tsx`
- Sacar `LeadGenCantidadCard` del div scrollable interno
- Colocarlo como hermano anterior al contenido de tabs, envuelto en transición
- Pasar `onScroll={handleContentScroll}` al `DataTableShell` del tab leads
- El div externo (línea 316) vuelve a no tener `onScroll` ni `overflow-auto` propio

### Archivos a modificar
- `src/components/ui/data-table-shell.tsx` — agregar prop `onScroll`
- `src/pages/closers/ClosersContent.tsx` — revertir layout, usar `onScroll` en DataTableShell
- `src/pages/leadgen/LeadGenContent.tsx` — revertir layout, usar `onScroll` en DataTableShell

