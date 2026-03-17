

## Plan: Selects inline para Categoría/Cuenta origen/Estado + Contactos como popover + Restricción de tabs por rol

### Resumen

Tres bloques de cambios:
1. Reemplazar campos de texto editables (`InlineText`) por selects inline para Categoría, Cuenta de origen y Estado
2. Convertir el badge "# Contactos" en un popover clickeable con historial + formulario de registro
3. Restringir tab "Todas" solo a admin/manager; closers ven solo sus propios tabs

### Cambios detallados

**1. `src/pages/closers/components/LeadTable.tsx`**

- **InlineCategorySelect**: Nuevo componente — Popover con badges clickeables para opciones fijas `["A+", "A", "B+", "B", "C"]`. Reemplaza `InlineText` de `category` en tabs "todas" y "asignadas".

- **InlineSourceSelect**: Nuevo componente — Popover con lista de valores únicos existentes de `source_account` (extraídos del array `creators` via prop) + input para agregar una nueva. Reemplaza `InlineText` de `source_account`.

- **InlineStageSelect**: Nuevo componente — Select con las opciones de `CLOSER_STAGES` coloreadas con `stageColor()`. Reemplaza el `<Badge>` estático del estado en tab "todas". Solo habilitado para filas `_source === "closer"` (las de LeadGen con "Pendiente LG" quedan como badge estático).

- **ContactCountCell**: Nuevo componente — el badge `X/6` se convierte en un Popover clickeable que muestra:
  - Mini historial de contactos (fecha, canal, resultado) usando `useContactHistory`
  - Formulario rápido abajo (Canal, Resultado, Notas) — misma lógica que `ContactQuickForm` pero integrado
  - Se aplica en tabs "todas" y "asignadas"

- **Limpieza**: Eliminar import y uso de `ContactQuickForm` en las filas (su funcionalidad queda integrada en `ContactCountCell`).

- Pasar prop `sourceAccounts: string[]` al componente para alimentar `InlineSourceSelect`.

**2. `src/pages/closers/ClosersContent.tsx`**

- Filtrar `TABS` dinámicamente: solo incluir `{ value: "todas", label: "Todas" }` si `isAdmin || isManager`.
- Computar `sourceAccounts` como valores únicos de `source_account` del array `creators` y pasarlo como prop a `CloserTable`.

**3. `src/pages/closers/hooks/useCloserLeads.ts`**

- Cambiar `useState("todas")` por `useState("asignadas")` como default.
- Agregar `useEffect`: cuando `isAdmin || isManager` se resuelva a `true` y el tab actual es "asignadas", cambiar a "todas".

### Archivos a modificar
- `src/pages/closers/components/LeadTable.tsx` — Nuevos componentes inline, ContactCountCell, eliminar ContactQuickForm
- `src/pages/closers/ClosersContent.tsx` — Filtrar tabs por rol, pasar sourceAccounts
- `src/pages/closers/hooks/useCloserLeads.ts` — Default tab según rol

