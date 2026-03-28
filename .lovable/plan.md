

## Plan: Limpiar registros huérfanos y agregar validación de teléfono en contactos

### Diagnóstico
Confirmado: hay **84,573 registros** en `closer_creators` con `stage = 'Nuevo'` que vinieron del trigger de LeadGen (ahora eliminado). La migración anterior cambió su stage de "Pendiente LG" a "Nuevo" en vez de eliminarlos, inflando el pipeline.

Solo **427** registros legítimos provienen de contactos reales (`source_contact_id` presente).

### Cambios

#### 1. Migración SQL — limpiar registros huérfanos de LeadGen
Eliminar de `closer_creators` todos los registros que tengan `leadgen_entry_id IS NOT NULL` y `source_contact_id IS NULL`. Estos son los 84,573 registros fantasma que nunca debieron estar ahí.

```sql
DELETE FROM closer_creators
WHERE leadgen_entry_id IS NOT NULL
  AND source_contact_id IS NULL;
```

#### 2. Validación de teléfono en `AddContactoModal.tsx` (LeadGen)
Antes de insertar en `closers_contacts`, si el agente ingresó un número de teléfono:
- Concatenar `paisCodigo + telefono` y buscar en `closers_contacts` y `creators` si ese número ya existe
- Si existe, mostrar toast de duplicado y bloquear el guardado
- Si no tiene teléfono, permitir guardar (el teléfono es opcional en este modal)

#### 3. Validación de teléfono en `NuevoContactoForm.tsx` (Contactos)
Misma lógica: antes de insertar, validar el número de teléfono contra `closers_contacts` y `creators`. Bloquear si ya existe.

#### 4. Actualizar `sync_closers_contact_to_creators` (trigger DB)
Agregar validación adicional: solo sincronizar a `closer_creators` si el contacto tiene un número de teléfono (`phone IS NOT NULL AND phone != ''`). Esto garantiza que solo contactos con teléfono validado lleguen a Closers.

### Archivos a modificar
- **Migración SQL**: limpieza de datos + actualización del trigger de sincronización
- `src/pages/leadgen/AddContactoModal.tsx`: validación de teléfono duplicado
- `src/pages/contactos/NuevoContactoForm.tsx`: validación de teléfono duplicado

### Resultado
- Se eliminan ~84,500 registros fantasma de Closers
- Solo contactos con teléfono validado (no duplicado) pasan al pipeline
- Los entries de LeadGen (links) pueden repetirse libremente sin afectar Closers

