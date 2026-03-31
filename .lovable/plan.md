

## Plan: Fix — Agente no ve sus entradas en Promolog

### Problema raíz

Al insertar una entrada en `promolog_entries` (línea 1171), **no se incluye `reviewed_by`**. Todas las entradas tienen `reviewed_by = NULL` en la base de datos (verificado con query directa). Cuando un agente abre Promolog, el filtro `.eq("reviewed_by", user.id)` no encuentra nada porque todo es `null`.

### Solución (2 partes)

**1. Fix en el insert** — `PromologContent.tsx` línea 1171

Agregar `reviewed_by: user?.id` al objeto de insert:

```tsx
const { error } = await supabase.from("promolog_entries").insert({
  creator_id: selectedCreatorForEntry.id,
  date: new Date().toISOString(),
  promoted: entryResult === "si" ? "true" : "false",
  network: entryResult === "si" ? entryNetwork : "n/a",
  platform: entryResult === "si" ? platformValue : null,
  contact_type: entryResult === "si" ? entryContactType : null,
  notes: entryNotes || null,
  action_taken: entryResult === "si" ? entryStrategy || null : null,
  evidence_url: entryEvidencePreview || null,
  reviewed_by: user?.id,  // ← FIX: asignar al usuario actual
});
```

**2. Fix datos existentes** — Migración SQL

Actualizar las entradas huérfanas que ya existen con `reviewed_by = NULL`. Como no sabemos quién las creó (no hay campo `created_by`), hay dos opciones:
- Si el usuario actual (admin) es quien las creó todas, asignarlas a su ID
- Si no se puede determinar, dejarlas visibles solo para management

Propongo agregar una columna `created_by` como fallback para futuras entradas y actualizar las existentes solo si el usuario lo indica.

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `PromologContent.tsx` | Agregar `reviewed_by: user?.id` en el insert (línea 1171) |

### Opcional: verificar otros inserts

Buscar si hay edge functions o webhooks que también insertan en `promolog_entries` (ej: `sync-promolog-external`) y asegurar que también setean `reviewed_by`.

