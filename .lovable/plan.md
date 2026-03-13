

## Plan: Closers lee directamente de LeadGen (sin "Reclamar")

### Cambio de enfoque
En lugar de duplicar datos en `closer_creators`, Closers trabaja directamente sobre `leadgen_entries`. Los leads aparecen automáticamente y se gestionan actualizando su `status`. Sin botón "Reclamar".

### Datos actuales en `leadgen_entries`
| Status | Count |
|---|---|
| no_response | 78,843 |
| replied | 125 |
| interested | 105 |
| meeting_set | 57 |
| contactado | 1 |

### Columnas (match con el spreadsheet)
`#` | `Instagram` (link) | `Categoría` | `Fecha de paso` | `Cuenta origen` | `Contactada?` | `Numero` | `Notas` | `Onlyfans`

Mapeo directo a campos de `leadgen_entries`: `model_handle` + `platform`, `quality`, `entry_date`, `company`, status-based, `phone_raw`, `notes`, `source_link`.

### Pestanas (filtran por `leadgen_entries.status`)
- **Todos**: todos los leads (default)
- **Sin contactar**: `no_response`
- **Contactados**: `contactado`, `replied`
- **Interesadas**: `interested`
- **En negociación**: `meeting_set`
- **Confirmadas**: `confirmed` (nuevo status)
- **Completadas**: `completed` (nuevo status)
- **No Interesadas**: `not_interested` (nuevo status)

### Acciones por lead
Usar el patron existente de `DropdownMenu` con `MoreHorizontal` (como `CreatorTable`) en lugar de botones sueltos. Opciones: cambiar status, ver detalle, agregar nota.

### Cambios

#### 1. Nuevo hook `useCloserLeads`
- Query a `leadgen_entries` con filtros (fecha, calidad, busqueda, status)
- Mutation para actualizar `status` directamente en `leadgen_entries`
- Reemplaza tanto `useCloserCreators` como `useLeadsDisponibles`

#### 2. Reescribir `ClosersContent.tsx`
- Tabs basados en status de `leadgen_entries`
- Cada tab filtra por status, todos comparten la misma tabla con las columnas del spreadsheet
- KPIs basados en conteo por status

#### 3. Nuevo componente de tabla `LeadTable`
- Columnas que coinciden exactamente con el spreadsheet
- Acciones via `DropdownMenu` (cambiar etapa, ver, notas)
- Reutiliza el patron visual de `CreatorTable`

#### 4. Actualizar `ClosersKPICards`
- KPIs por status: Sin contactar, Contactados, Interesadas, En negociacion, Confirmadas

#### 5. Limpiar archivos obsoletos
- Eliminar `LeadsDisponiblesTab.tsx`, `useLeadsDisponibles.ts`
- Simplificar o eliminar tabs individuales (Confirmadas, Completadas, etc.) ya que ahora son filtros sobre la misma fuente

### Archivos
- **Nuevo**: `src/pages/closers/hooks/useCloserLeads.ts`
- **Nuevo**: `src/pages/closers/components/LeadTable.tsx`
- **Reescribir**: `src/pages/closers/ClosersContent.tsx`
- **Reescribir**: `src/pages/closers/components/ClosersKPICards.tsx`
- **Eliminar**: `src/pages/closers/tabs/LeadsDisponiblesTab.tsx`, `useLeadsDisponibles.ts`
- Tabs individuales se eliminan o simplifican (la logica queda en ClosersContent)

