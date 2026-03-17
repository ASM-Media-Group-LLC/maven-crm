

## Plan: Restaurar columna "Cuenta de origen", agregar select filters y vista List/Grid

### Problemas identificados

1. **Columna "Cuenta de origen" (source_account)** — existe en la tabla `closer_creators` (el registro actual tiene `source_account: "UNLOK"`) pero no se muestra en ningún tab de `LeadTable.tsx`.
2. **Datos de LeadGen** — la tabla `closer_creators` tiene `leadgen_entry_id` como FK pero no se hace join para traer datos del lead original (categoría, company, etc.). Sin embargo, `closer_creators` ya tiene campos propios (`source_account`, `category`, `phone`, `onlyfans_url`) que se copian al crear el registro. El problema es que las columnas no se renderizan.
3. **No hay select filters** — solo hay búsqueda por texto. Faltan filtros por Agente, Plataforma, etc.
4. **No hay vista Grid** — el patrón `viewMode: "list" | "grid"` con botones `List`/`LayoutGrid` se usa en todo el sistema (Finanzas, HR, LeadGen, Tareas).

### Cambios

**1. `LeadTable.tsx` — Restaurar columnas faltantes en tab "Todas"**

Agregar columnas: **Cuenta de origen** (`source_account`), **Categoría** (`category`), **OnlyFans URL**. Estas columnas existen en `closer_creators` y en el tipo `CloserCreatorRow` pero no se renderizan.

En tab "Asignadas", agregar también **Cuenta de origen** y **Teléfono** (WhatsApp link).

**2. `ClosersContent.tsx` — Agregar select filters y view mode toggle**

- **View mode toggle** (List / Grid) — mismo patrón de `FacturacionPage.tsx`: botones `List` y `LayoutGrid` con estado `viewMode`.
- **Select filters** junto al search:
  - **Agente** — select con lista de agentes asignados (obtenido del hook)
  - **Plataforma** — select con las opciones PLATFORMS (OnlyFans, Trafix, Blu, Piclink, Otra)
- Los filtros se pasan al hook para aplicar client-side.

**3. `useCloserLeads.ts` — Agregar soporte para filtros**

- Agregar estados `agentFilter` y `platformFilter`.
- Aplicar filtrado client-side sobre `creators` (similar al search actual).
- Exponer lista única de agentes para el select.

**4. `LeadTable.tsx` — Agregar vista Grid**

Crear un modo Grid con tarjetas que muestren: Instagram (handle), Stage badge, Agente, Cuenta de origen, # contactos, Revenue calculado. Patrón de Card con KPI como en el resto del sistema.

### Archivos a modificar
- `src/pages/closers/ClosersContent.tsx` — view mode toggle + select filters
- `src/pages/closers/components/LeadTable.tsx` — restaurar columnas faltantes + agregar renderizado Grid
- `src/pages/closers/hooks/useCloserLeads.ts` — agregar estados de filtro y lista de agentes

