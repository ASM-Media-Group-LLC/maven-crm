

## Plan: Limpiar closer_creators — conservar solo los que tienen teléfono

### Hallazgos

De los 483 registros en `closer_creators`:
- **428** con stage "Nuevo" **tienen teléfono** → se conservan
- **52** con stage "Nuevo" **no tienen teléfono** (vienen del viejo flujo directo de LeadGen) → se eliminan
- **3** en otros stages (2 Completada, 1 Asignada) → se conservan

### Cambios

#### 1. Migración SQL — Eliminar registros sin teléfono
```sql
DELETE FROM closer_creators
WHERE (phone IS NULL OR trim(phone) = '')
  AND stage = 'Nuevo';
```
Esto elimina los 52 registros que entraron directamente desde LeadGen sin pasar por `/contactos`.

#### 2. No se requieren cambios de código
El trigger `sync_closers_contact_to_creators` ya valida que el contacto tenga teléfono antes de sincronizar, por lo que esto no volverá a ocurrir.

### Resultado
- De ~483 registros → ~431 registros legítimos con teléfono
- Solo contactos que pasaron por `/contactos` con teléfono validado

### Archivos a modificar
- Una migración SQL (DELETE)

