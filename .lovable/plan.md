

## Plan: Edición inline + optimización de rendimiento en LeadGen

### Problema actual
1. **Calidad y Estado son solo lectura** — los badges son estáticos, el usuario no puede cambiar directamente desde la celda (solo calidad tiene un dropdown en la columna de Acciones, separado de la columna visual).
2. **Carga lenta** — `fetchEntriesByDateRange` usa `select("*")` trayendo todas las columnas, y el loop de paginación puede hacer múltiples requests si hay más de 1000 leads en el rango. Además, `useUpdateLeadQuality` y `useUpdateLeadStatus` invalidan queries completas, forzando refetch total.

### Cambios

**1. Edición inline en `LeadGenTable.tsx`**
- **Columna Calidad**: Reemplazar el Badge estático (línea 157-159) por un click-to-edit usando `Popover` — al hacer click en el badge se muestran las opciones (A+, A, B+, B, C) y al seleccionar se guarda inmediatamente.
- **Columna Estado**: Reemplazar el badge/button estático (líneas 161-166) por el mismo patrón click-to-edit con `Popover` mostrando todas las opciones de STATUS_OPTIONS.
- Eliminar el dropdown duplicado de calidad en la columna Acciones (líneas 180-201) ya que será redundante.

**2. Optimización de queries en `useLeadGen.ts`**
- Cambiar `select("*")` a solo las columnas necesarias: `id, lg_user_id, model_handle, platform, status, quality, notes, source_link, created_at, phone_raw, country_code, entry_date, ticket_number, company`.
- Agregar actualizaciones optimistas en `useUpdateLeadQuality` y `useUpdateLeadStatus` usando `queryClient.setQueryData` para actualizar el cache local sin refetch.
- Invalidar solo `["leadgen-entries-range"]` en lugar de ambas queries.

**3. Rendimiento de rendering en `LeadGenTable.tsx`**
- Usar `React.memo` en el componente de fila para evitar re-renders innecesarios cuando solo cambia un lead.

### Archivos a modificar
- `src/pages/leadgen/LeadGenTable.tsx` — Click-to-edit para calidad y estado
- `src/pages/leadgen/useLeadGen.ts` — Select específico, updates optimistas

