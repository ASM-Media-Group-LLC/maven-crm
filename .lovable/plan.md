

## Plan: Estandarizar badges de categoría en QA y agregar funcionalidad de QA para supervisores/admins

### Problemas identificados

1. **Badges inconsistentes**: En `AgentDetailView` (tab QA, línea 515), las categorías usan `qualityBadgeColors` con clases hardcoded (`bg-emerald-500 text-white`, etc.) en vez del componente `Badge` con variantes `-soft` estándar (`calidadVariant` de `LeadGenTable`).

2. **Columna QA sin funcionalidad**: En `LeadGenTable` (línea 233), la columna QA siempre muestra "—". No hay forma de que un supervisor/admin haga QA review de un lead desde la tabla principal.

3. **Tab QA en AgentDetailView**: Solo muestra leads con categoría asignada en una tabla pasiva — no permite al supervisor/admin dar feedback o calificar leads.

### Cambios

#### 1. `AgentDetailView.tsx` — Estandarizar badges en tab QA
- Eliminar `qualityBadgeColors` (líneas 35-41)
- Importar `calidadVariant` o replicar el mismo mapeo de variantes `-soft`
- Reemplazar el `<span className={badgeClass}>` (línea 515) por `<Badge variant={calidadVariant[cat]}>` 

#### 2. `LeadGenTable.tsx` — Columna QA funcional (solo supervisor/admin)
- Importar `useUserRole` y `useCreateQAReview` + `useAuth`
- En `LeadRow`, si el usuario es supervisor o admin, mostrar un botón/popover en la celda QA que permita:
  - Seleccionar un rating (Bien / Regular / Mal)
  - Agregar un comentario opcional
  - Guardar con `useCreateQAReview`
- Si el usuario NO es supervisor/admin, mostrar el estado QA existente (check si ya fue revisado) o "—"
- Si ya tiene QA review, mostrar badge con el rating

#### 3. `LeadGenTable.tsx` — Mostrar estado QA de leads
- Usar `useLeadGenQA` para fetch QA reviews de los leads visibles
- Mostrar badge con el rating si ya fue revisado
- Si no ha sido revisado y el user es supervisor/admin, mostrar botón "Revisar"

#### 4. `AgentDetailView.tsx` — Tab QA con funcionalidad de review
- Agregar botón de acción en cada fila del tab QA para que supervisor/admin pueda:
  - Dar feedback (rating + comentario) usando `useCreateQAReview`
  - Modificar la categoría del lead
- Usar `useUserRole` para condicionar la visibilidad de estas acciones

### Archivos a modificar
- `src/pages/leadgen/LeadGenTable.tsx` — badges QA, celda QA funcional con popover de review
- `src/pages/leadgen/AgentDetailView.tsx` — badges estandarizados, acciones de QA en tab

