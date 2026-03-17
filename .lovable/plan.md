

## Plan: Enriquecer tabla Closers con datos de LeadGen + agregar selector de fechas

### Problema raíz
La tabla `closer_creators` solo tiene 1 registro. Los campos copiados desde LeadGen (`source_account`, `category`, `phone`, `onlyfans_url`) ya se muestran en la tabla, pero falta enriquecerla con datos adicionales del lead original (plataforma, calidad original, agente de LeadGen, enlace fuente) accesibles via `leadgen_entry_id`. Además, no hay selector de fechas.

### Cambios

**1. `useCloserLeads.ts` — Enriquecer con datos de LeadGen + filtro de fechas**

- Agregar join a `leadgen_entries` para traer: `entry_date`, `platform`, `quality`, `source_link`, `company` (como `lg_company`), `lg_user_id`
- Hacer un segundo join a `profiles` para obtener el nombre del agente de LeadGen (`lg_agent_name`)
- Agregar al tipo `CloserCreatorRow`: `leadgen_entry_id`, `lg_entry_date`, `lg_platform`, `lg_quality`, `lg_source_link`, `lg_company`, `lg_agent_name`
- Agregar estados `dateFrom`/`dateTo` y `dateField` (`"passed_date"` | `"lg_entry_date"`) para filtrar por rango de fechas
- Aplicar filtro server-side con `.gte()` / `.lte()` sobre el campo seleccionado
- Exponer estos estados en el return del hook

**2. `ClosersContent.tsx` — Agregar DateRangePicker y selector de campo de fecha**

- Importar `DateRangePicker` de `@/components/ui/date-range-picker` (ya existe en el proyecto)
- Agregar un `Select` para elegir el campo de fecha: "Fecha de paso" (`passed_date`) o "Fecha LeadGen" (`lg_entry_date`)
- Colocar el DateRangePicker y el selector de campo junto a los filtros existentes (Agente, Plataforma)

**3. `LeadTable.tsx` — Mostrar campos enriquecidos de LeadGen**

- En tab "Todas": agregar columnas **Plataforma LG**, **Calidad LG**, **Agente LG**
- En tab "Asignadas": agregar columna **Plataforma LG**
- En la vista Grid: mostrar **Plataforma LG** y **Calidad LG** en las tarjetas
- Actualizar el tipo Props si es necesario para recibir los nuevos campos

### Archivos a modificar
- `src/pages/closers/hooks/useCloserLeads.ts` — Enriquecer query con join a leadgen_entries + filtro de fechas
- `src/pages/closers/ClosersContent.tsx` — Agregar DateRangePicker + selector de campo de fecha
- `src/pages/closers/components/LeadTable.tsx` — Mostrar columnas enriquecidas de LeadGen en la tabla

