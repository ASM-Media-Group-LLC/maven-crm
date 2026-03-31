

## Plan: Filtrar tab QA por reviews realizados y permitir a closers crear creators

### Problema 1: Tab QA muestra leads incorrectos
En `AgentDetailView.tsx` línea 497, el tab QA filtra por `l.quality` (categoría del lead), no por si tiene un QA review realizado. Debería mostrar solo leads que tienen una entrada en `leadgen_qa` (es decir, que existen en `qaMap`).

### Problema 2: Closers no pueden convertir a creadora
La política RLS de INSERT en `creators` solo permite `admin` y `manager`. Cuando un closer ejecuta `handleConvertToCreator` en `ClosersContent.tsx`, Supabase rechaza la inserción.

### Cambios

#### 1. `AgentDetailView.tsx` — Filtrar tab QA por reviews existentes
- Cambiar línea 497 de `agentLeads.filter(l => l.quality)` a `agentLeads.filter(l => qaMap[l.id])`
- Actualizar el texto descriptivo de "Leads con categoría asignada" a "Leads con QA realizado"

#### 2. Migración SQL — Ampliar política INSERT en `creators`
- Modificar la política `Managers and admins can insert creators` para incluir los roles `closer` y `supervisor`:
```sql
DROP POLICY "Managers and admins can insert creators" ON creators;
CREATE POLICY "Authorized roles can insert creators" ON creators
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'manager'::app_role) OR
    has_role(auth.uid(), 'closer'::app_role) OR
    has_role(auth.uid(), 'supervisor'::app_role)
  );
```

### Archivos a modificar
- `src/pages/leadgen/AgentDetailView.tsx` — filtro del tab QA
- Migración SQL — política RLS de INSERT en `creators`

