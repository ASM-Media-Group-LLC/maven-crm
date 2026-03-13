

## Plan: Hacer que los leads de LeadGen lleguen a Closers + filtros de fecha + limpiar UI

### Causa raíz: No hay data en Closers
Las políticas RLS de `closer_creators` solo permiten INSERT a admins (`has_role(auth.uid(), 'admin')`). Cuando un closer o agent convierte un lead desde LeadGen via `ConvertLeadModal`, el INSERT falla silenciosamente. Necesitamos una política INSERT para usuarios autenticados.

### Cambios

#### 1. Migración SQL: Política INSERT para closer_creators
Agregar política que permita a cualquier usuario autenticado insertar registros donde `created_by` sea su propio ID:
```sql
CREATE POLICY "Authenticated users can insert closer_creators"
  ON public.closer_creators FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
```
Esto desbloquea el flujo ConvertLeadModal → closer_creators para todos los roles.

#### 2. Eliminar botón "Nueva Creator" y NewCreatorModal
En `src/pages/closers/ClosersContent.tsx`:
- Eliminar el botón "Nueva Creator", el estado `showNew`, el componente `<NewCreatorModal />` y sus imports
- Las creators solo entran al pipeline via conversión desde LeadGen, garantizando trazabilidad

#### 3. Agregar DateRangePicker en MisCreatorsTab
En `src/pages/closers/tabs/MisCreatorsTab.tsx`:
- Agregar el componente `DateRangePicker` (ya existe en el proyecto) para filtrar por `passed_date`
- Ubicarlo junto a los filtros existentes de búsqueda y etapa

#### 4. Agregar DateRangePicker en PipelineTab
En `src/pages/closers/tabs/PipelineTab.tsx`:
- Mismo filtro de fecha por `passed_date` junto al filtro de etapa existente

### Archivos a modificar
- **Migración SQL**: política INSERT en `closer_creators`
- `src/pages/closers/ClosersContent.tsx`: eliminar botón y modal de nueva creator
- `src/pages/closers/tabs/MisCreatorsTab.tsx`: agregar DateRangePicker
- `src/pages/closers/tabs/PipelineTab.tsx`: agregar DateRangePicker

### Resultado
Una vez aplicado, cualquier usuario que convierta un lead desde LeadGen verá esa creator aparecer automáticamente en su pipeline de Closers, con toda la trazabilidad (leadgen_entry_id, datos originales del lead).

