

## Plan: Estandarizar tablas de Agentes y Detalle de Agente con DataTableShell

### Problema
1. **Tab Agentes** (LeadGenContent líneas 417-464): la tabla de agentes se renderiza con `<Table>` directo, sin `DataTableShell` — no tiene bordes redondeados ni paginador
2. **AgentDetailView** (línea 290): `<LeadGenTable>` se renderiza sin `DataTableShell` — tampoco tiene bordes redondeados ni paginador

### Cambios

#### 1. Tab Agentes — envolver en DataTableShell (`LeadGenContent.tsx`)
- Envolver la tabla de agentes (listView === "list") en `<DataTableShell>` con los mismos props estándar (currentPage, totalPages, totalCount, pageSize, onPageChange)
- Agregar estado de paginación local para agentes (probablemente no necesite server-side ya que son pocos, pero mantener la consistencia visual)
- pageSize de 50, paginación client-side sobre `agentStats`

#### 2. AgentDetailView — envolver LeadGenTable en DataTableShell (`AgentDetailView.tsx`)
- Agregar estado de paginación client-side (`agentPage`)
- Paginar `filteredLeads` con slice
- Envolver `<LeadGenTable>` en `<DataTableShell>` con bordes redondeados y paginador
- pageSize de 100 para consistencia con la tabla principal

### Archivos a modificar
- `src/pages/leadgen/LeadGenContent.tsx` — DataTableShell en tabla de agentes
- `src/pages/leadgen/AgentDetailView.tsx` — DataTableShell envolviendo LeadGenTable

