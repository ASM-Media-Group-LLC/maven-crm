

## Plan: Cambiar lógica de duplicados en LeadGen de handle a teléfono

### Regla de negocio nueva
- Un agente puede subir el mismo handle/link cuantas veces quiera
- La validación de duplicado se basa en el **número de teléfono**: si el teléfono ya existe en el sistema, se bloquea; si no, pasa

### Problema actual
1. El formulario `AddLeadModal` no tiene campo de teléfono — `phone_raw` existe en la tabla pero no se recolecta
2. Hay 3 checks de duplicado por handle (leadgen_entries, closers_contacts, creators) que bloquean el submit
3. Existe un unique index `uq_leadgen_handle_platform` en `(model_handle, platform)` que impide insertar el mismo handle dos veces

### Cambios

#### 1. Migration SQL — quitar unique index de handle
```sql
DROP INDEX IF EXISTS uq_leadgen_handle_platform;
```
Esto permite insertar el mismo handle múltiples veces.

#### 2. `src/pages/leadgen/AddLeadModal.tsx` — agregar campo teléfono y cambiar validación
- Agregar `phone_raw: z.string().min(5, "Teléfono requerido")` al schema
- Agregar campo de input de teléfono en el formulario
- **Eliminar** los 3 checks de duplicado por handle (leadgen_entries, closers_contacts, creators)
- **Agregar** check de duplicado por teléfono: buscar `phone_raw` en `leadgen_entries`, `closers_contacts` (campo `phone`), y `creators` (campo `phone`)
- Si el teléfono ya existe en cualquiera de las 3 tablas → bloquear con toast "Este número ya está registrado"
- Si no existe → permitir el insert
- Incluir `phone_raw` en el insert a `leadgen_entries`

### Archivos a modificar
1. **Migration SQL** — drop unique index `uq_leadgen_handle_platform`
2. **`src/pages/leadgen/AddLeadModal.tsx`** — agregar campo teléfono, reemplazar validación de handle por validación de teléfono

