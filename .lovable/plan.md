

## Plan: Priorizar `created_by` en columna Agente + Mostrar duplicados

### Cambios

**1. Priorizar `created_by` sobre `reviewed_by` en la columna "Agente"**
- **Archivo**: `src/pages/promolog/PromologContent.tsx` (línea 243)
- Cambiar el orden de resolución: primero `created_by` (quien subió), luego `reviewed_by` como fallback
- La columna sigue llamándose "Agente" — solo cambia qué dato se muestra
- Antes: `reviewed_by → created_by → "Sin asignar"`
- Después: `created_by → reviewed_by → "Sin asignar"`

**2. Eliminar la deduplicación para mostrar todos los registros**
- **Archivo**: `src/pages/promolog/PromologContent.tsx` (líneas 202-224)
- Eliminar el bloque de deduplicación que agrupa por `creator_id|día|network|platform|promoted`
- Devolver `data` directamente en lugar de `deduped`
- Esto permitirá ver todos los registros tal cual están en la base de datos

### Resultado
- La columna "Agente" mostrará quién subió la promo (no quién la revisó)
- Se verán todos los registros incluyendo duplicados
- No se cambia nombre de columna ni estructura visual

