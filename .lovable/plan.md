

## Plan: Hacer editables Cuenta de origen y Categoría, agregar Teléfono con WhatsApp, limpiar columnas innecesarias, renombrar tab, y poblar Closers desde LeadGen

### Diagnóstico del problema "no veo data de LeadGen"

La tabla `closer_creators` solo tiene **1 registro**. Los leads de LeadGen (79K+) solo llegan a Closers cuando alguien usa manualmente el botón "Convertir Lead" en `ConvertLeadModal.tsx`. No hay sincronización automática. Hay dos opciones:

**Opción A**: Mostrar leads de `leadgen_entries` con status `interested` / `meeting_set` directamente en la vista de Closers (como una vista combinada).

**Opción B**: Mantener el flujo actual (conversión manual) pero hacerlo más visible — agregar un botón "Importar desde LeadGen" en Closers que permita buscar y convertir leads en bloque.

Recomiendo **Opción A** porque resuelve el problema de "no veo data": el tab "Todas" mostraría tanto los `closer_creators` existentes como los leads de LeadGen cualificados (`interested`, `meeting_set`) que aún no fueron convertidos, para que el closer los vea y actúe.

### Cambios concretos

**1. `LeadTable.tsx` — Columnas editables y limpieza**

- **Cuenta de origen** (`source_account`): cambiar de texto estático a `InlineText` editable (click-to-edit) en todos los tabs donde aparece.
- **Categoría** (`category`): igual, `InlineText` editable.
- **Teléfono**: agregar columna con link WhatsApp (`wa.me/...`) en tabs Todas, Asignaciones, Confirmadas.
- **Eliminar columnas**: Plataforma LG, Calidad LG, Agente LG — quitar de headers y rows en todos los tabs.
- **Renombrar**: tab "Asignadas" → "Asignaciones" (cambiar en `TABS` de `ClosersContent.tsx`).
- **Fecha asignación**: solo mostrar en tab "Asignaciones", no en "Todas".

**2. `ClosersContent.tsx` — Renombrar tab**

Cambiar `{ value: "asignadas", label: "Asignadas" }` → `{ value: "asignadas", label: "Asignaciones" }`.

**3. `useCloserLeads.ts` — Traer leads de LeadGen como fuente combinada**

Para el tab "Todas", además de `closer_creators`, hacer una segunda query a `leadgen_entries` con status `interested` o `meeting_set` que **no** tengan ya un `closer_creators` asociado (via subquery `NOT IN (SELECT leadgen_entry_id FROM closer_creators WHERE leadgen_entry_id IS NOT NULL)`). Mapear los campos de `leadgen_entries` al formato `CloserCreatorRow` con stage virtual "Pendiente LG" y sin `assigned_to`.

Esto permite que los closers vean en "Todas" los leads cualificados aún no convertidos junto con los que ya están en pipeline.

**4. `LeadTable.tsx` — Grid view**

Actualizar grid cards: quitar Plataforma LG y Calidad LG, agregar Teléfono con WhatsApp link.

### Archivos a modificar
- `src/pages/closers/ClosersContent.tsx` — renombrar tab
- `src/pages/closers/hooks/useCloserLeads.ts` — query combinada con leadgen_entries, quitar campos lg_*
- `src/pages/closers/components/LeadTable.tsx` — columnas editables, quitar LG columns, agregar teléfono, ajustar fecha asignación

