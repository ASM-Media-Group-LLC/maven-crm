

## Conectar filtros de Promolog a datos reales de `promolog_entries`

### Situacion actual
- La seccion "Entradas Recientes" usa un array `mockEntries` con 5 entries hardcodeadas.
- La tabla `promolog_entries` tiene **4,427 registros reales** con campos: `id`, `creator_id`, `network`, `platform`, `promoted` (true/false/partial/pending), `date`, `ticket_number`, `notes`, `evidence_url`, `contact_type`, `action_taken`, `reviewed_by`.
- Los valores reales de `promoted` son strings como `"true"`, `"false"` (no "Si"/"No").
- Los valores de `network` son `"Instagram"` (con mayuscula), no `"instagram"`.

### Cambios planificados

#### 1. Actualizar la interfaz `PromologEntry` (`src/pages/promolog/PromologEntryCard.tsx`)

Ampliar la interfaz para aceptar los campos reales de la base de datos:
- `network`: cambiar de `"instagram" | "x"` a `string` para aceptar cualquier red.
- Agregar campo opcional `creator_id`.
- Mantener compatibilidad con los componentes existentes (PromologTable, PromologGrid).

#### 2. Agregar query real en `PromologContent.tsx`

Reemplazar `mockEntries` por un query a Supabase:

```sql
SELECT pe.*, c.name as creator_name, c.artistic_name, c.instagram_handle
FROM promolog_entries pe
LEFT JOIN creators c ON pe.creator_id = c.id
ORDER BY pe.date DESC
LIMIT 200
```

Se usara `useQuery` con react-query, filtrando por el rango de fechas seleccionado (`dateFrom`/`dateTo`).

#### 3. Mapear datos reales a `PromologEntry`

Transformar los campos de la DB al formato que usan los componentes:
- `promoted: "true"` -> `result: "Si"`
- `promoted: "false"` -> `result: "No"`
- `promoted: "partial"` -> `result: "Parcial"`
- `promoted: "pending"` -> `result: "Pendiente"`
- `network: "Instagram"` -> `network: "instagram"` (lowercase)
- `date` timestamp -> separar en `date` y `time` formateados
- `creator_name` / `artistic_name` -> `name` y `handle`

#### 4. Actualizar logica de filtrado

Ajustar `filteredEntries` para usar datos reales:
- **Creador/a**: comparar `creator_id` directamente (ya no necesita buscar por nombre).
- **Red Social**: comparar `network` (ya normalizado a lowercase).
- **Estado**: mapear los valores del select a los valores de `promoted` en la DB.
- **Busqueda**: mantener busqueda por nombre y ticket.

#### 5. Actualizar KPIs y cards de redes/plataformas

Calcular los conteos de las cards de redes sociales y plataformas dinamicamente a partir de los datos reales en vez de valores hardcodeados.

### Archivos a modificar
- `src/pages/promolog/PromologContent.tsx` - Query real, mapeo, filtros, KPIs dinamicos
- `src/pages/promolog/PromologEntryCard.tsx` - Ampliar tipo `network` en la interfaz

