

## Plan: Closers muestra leads directamente desde LeadGen

### Problema
Hay 79,131 leads en `leadgen_entries` y 0 en `closer_creators`. El flujo actual requiere convertir lead por lead manualmente. El usuario quiere que Closers muestre los leads existentes directamente para poder gestionarlos y asignar closers.

### Solución
Agregar una pestaña principal **"Leads Disponibles"** en Closers que consulta directamente `leadgen_entries`. Desde ahí, el closer/admin puede:
- Ver todos los leads existentes con filtros (fecha, calidad, plataforma, búsqueda)
- **Reclamar/Asignar** un lead con un click, lo cual ejecuta la conversión automática a `closer_creators` (el flujo que ya existe en `ConvertLeadModal`)
- Una vez reclamado, el lead aparece en las pestañas existentes (Mis Creators, Pipeline, etc.)

### Cambios

#### 1. Nuevo tab "Leads Disponibles" (`src/pages/closers/tabs/LeadsDisponiblesTab.tsx`)
- Query paginada a `leadgen_entries` (con límite razonable, ej. últimos 500 o filtrado por fecha)
- Columnas: Handle, Plataforma, Calidad, Cuenta origen, Teléfono, Fecha
- Excluir leads que ya fueron convertidos (que ya tienen un `closer_creators` con ese `leadgen_entry_id`)
- Filtros: búsqueda por handle, calidad (A+/A/B/C), DateRangePicker por `entry_date`
- Botón "Reclamar" por fila que ejecuta la inserción en `closer_creators` (misma lógica de `ConvertLeadModal` pero inline)

#### 2. Hook `useLeadsDisponibles` (`src/pages/closers/hooks/useLeadsDisponibles.ts`)
- Query a `leadgen_entries` con filtros de fecha y calidad
- Excluye leads ya convertidos consultando `closer_creators.leadgen_entry_id`
- Mutation `reclamarLead` que inserta en `closer_creators` y marca el lead como "contactado"

#### 3. Actualizar `ClosersContent.tsx`
- Agregar la nueva pestaña "Leads" como primera pestaña (default)
- Import del nuevo componente

#### 4. Actualizar `ClosersKPICards` 
- Agregar KPI de "Leads disponibles" (count de leads no convertidos) para dar visibilidad

### Archivos
- **Nuevo**: `src/pages/closers/tabs/LeadsDisponiblesTab.tsx`
- **Nuevo**: `src/pages/closers/hooks/useLeadsDisponibles.ts`
- **Editar**: `src/pages/closers/ClosersContent.tsx` — agregar tab
- **Editar**: `src/pages/closers/components/ClosersKPICards.tsx` — agregar KPI leads disponibles

### Flujo resultante
```
leadgen_entries (79K+)
  ↓ consulta directa (filtrada)
Closers → Tab "Leads" → botón "Reclamar"
  ↓ insert closer_creators + marca contactado
Closers → Tab "Mis Creators" / "Pipeline" → gestión normal
```

No se necesitan migraciones SQL adicionales (la política INSERT ya existe).

