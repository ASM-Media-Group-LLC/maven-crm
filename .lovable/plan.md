

## Plan: Corregir Closers (tab Todas, velocidad, inline editing) y reducir KPIs en LeadGen

### Problemas identificados

1. **Tab "Todas" muestra "Sin registros"**: La query para "todas" usa `TAB_STAGE_MAP["todas"] = []` (sin filtro de stage), pero aplica filtro de rol (`assigned_to = user.id` para non-admin). Si el usuario es admin, debería ver todo. El problema real: para admins se redirige a "todas" en el `useEffect`, pero la query probablemente incluye stages como "Pendiente LG" que tienen `assigned_to = NULL`. Necesita excluir "Pendiente LG" del tab "Todas" para que solo muestre el pipeline manual.

2. **Tab "Nuevo" con 420 registros**: El count viene del RPC `get_closer_stage_counts` que cuenta TODOS los `closer_creators` con stage "Nuevo", incluyendo los que vienen de leadgen. Pero la query del tab "Nuevo" filtra por `source_contact_id IS NOT NULL`. El count del badge no coincide con los datos reales del tab. Necesito verificar si realmente hay 420 contactos legítimos con `source_contact_id`.

3. **Inline editing falta en tabs "asignadas" y "todas"**: Cuenta origen, categoría, estado y notas necesitan dropdowns inline en todos los tabs, no solo en "nuevo".

4. **Badges de alertas cortados en "asignadas"**: Los badges "Follow-up" y "Último intento" se truncan visualmente.

5. **KPIs de LeadGen ocupan demasiado espacio**: Las 2 cards ocupan ~50% de la pantalla. Necesitan ser más compactas.

6. **Filtro "Calidad" en LeadGen**: En la barra de filtros (línea 284) aún dice "Calidad" como placeholder en lugar de "Categoría".

### Cambios

#### 1. `src/pages/closers/hooks/useCloserLeads.ts`
- **Tab "todas"**: Excluir stage "Pendiente LG" de la query. Cambiar `TAB_STAGE_MAP["todas"]` o agregar `.not("stage", "eq", "Pendiente LG")` en la query cuando `stageFilter` está vacío.
- **Badge count para "Nuevo"**: El RPC cuenta todos los "Nuevo" incluyendo los sin `source_contact_id`. Considerar ajustar o aceptar la discrepancia.

#### 2. `src/pages/closers/components/LeadTable.tsx`
- **Tab "asignadas"**: Cambiar cuenta origen a `InlineSourceSelect`, categoría ya usa `InlineCategorySelect` (ok). Agregar columna de notas con `InlineText`.
- **Tab "todas"**: Ya tiene inline editing para estado, cuenta origen, categoría y notas — verificar que funcione.
- **Badges cortados en "asignadas"**: Agregar `whitespace-nowrap` a los badges de alerta para evitar truncamiento.

#### 3. `src/pages/leadgen/LeadGenContent.tsx`
- Reducir el padding y spacing de las KPI cards: cambiar `gap-6` a `gap-3`, reducir `py-2` container.

#### 4. `src/pages/leadgen/LeadGenCantidadCard.tsx` y `LeadGenEstadosCard.tsx`
- Reducir padding interno de las cards para que sean más compactas.
- Cambiar `p-4` a `p-3`, reducir tamaños de fuente donde sea posible.

#### 5. `src/pages/leadgen/LeadGenContent.tsx` línea 284
- Cambiar placeholder "Calidad" a "Categoría".

### Archivos a modificar
1. `src/pages/closers/hooks/useCloserLeads.ts` — excluir "Pendiente LG" del tab "todas"
2. `src/pages/closers/components/LeadTable.tsx` — inline editing en asignadas, badges sin truncar
3. `src/pages/leadgen/LeadGenContent.tsx` — KPIs más compactas, label "Categoría"
4. `src/pages/leadgen/LeadGenCantidadCard.tsx` — padding reducido
5. `src/pages/leadgen/LeadGenEstadosCard.tsx` — padding reducido

