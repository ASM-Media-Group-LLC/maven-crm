

## Plan: Validaciones de duplicados + Campo OnlyFans en LeadGen y Contactos

### Resumen

Implementar 3 reglas de validación al crear leads y contactos, y agregar el campo OnlyFans URL a ambos módulos.

---

### 1. Migración DB: Agregar columna `onlyfans_url` a `leadgen_entries` y `closers_contacts`

```sql
ALTER TABLE public.leadgen_entries ADD COLUMN IF NOT EXISTS onlyfans_url text;
ALTER TABLE public.closers_contacts ADD COLUMN IF NOT EXISTS onlyfans_url text;
```

Ambas tablas actualmente no tienen esta columna. `creators` ya la tiene.

---

### 2. Utilidad compartida de validación: `src/lib/lead-validation.ts`

Crear un módulo con 3 funciones async reutilizables:

**`checkCreatorExists(handle, onlyfansUrl?)`**
- Consulta `creators` por `instagram_handle` (normalizado) O `onlyfans_url` (normalizado)
- Retorna `{ exists: boolean, creatorName?: string, creatorId?: string }`

**`checkRecentLead(handle, onlyfansUrl?)`**
- Consulta `leadgen_entries` donde `model_handle` = handle normalizado O `onlyfans_url` = url normalizada
- Filtra `created_at > now() - 24h`
- Retorna `{ exists: boolean, createdAt?: string, agentName?: string }`

**`checkDuplicateOnlyFans(url)`**
- Consulta `leadgen_entries` y `closers_contacts` por `onlyfans_url` normalizada
- Retorna `{ existsInLeads: boolean, existsInContacts: boolean }`

---

### 3. Modificar `AddLeadModal.tsx` — Validación + campo OF

**Antes del insert** (en `onSubmit`), ejecutar en orden:
1. `checkCreatorExists(handle, onlyfansUrl)` → si existe, mostrar alert con opciones "Ver perfil" / "Cancelar"
2. `checkRecentLead(handle, onlyfansUrl)` → si existe, bloquear con toast "Este lead ya fue registrado hace menos de 24 horas"
3. `checkDuplicateOnlyFans(url)` → si existe en leads/contactos, bloquear

**Campo nuevo en el formulario:**
- Agregar `onlyfans_url` al schema zod (opcional, validar formato URL si no vacío)
- Agregar input "OnlyFans URL" debajo del campo URL del Perfil
- Guardar en el insert como `onlyfans_url`

**Alert de "ya es creator":** Usar un Dialog de confirmación (no toast) con botones "Ver perfil" (navega a `/creadoras/{id}`) y "Cancelar".

---

### 4. Modificar `NuevoContactoForm.tsx` — Validación + campo OF

**Antes del insert** (en `handleSubmit`), mismas validaciones:
1. Validar handle contra creators
2. Validar lead reciente (<24h) contra `leadgen_entries`
3. Validar duplicado OF contra `leadgen_entries` y `closers_contacts`

**Campo nuevo:**
- Agregar `onlyfansUrl` al FormData
- Input "OnlyFans URL" en la sección de links
- Guardar como `onlyfans_url` en el insert

---

### 5. Agregar columna OF URL a tablas

**`LeadGenTable.tsx`:**
- Agregar columna "OF URL" después de la columna Handle
- Mostrar como link externo truncado (similar a source_link)
- Actualizar `ENTRY_COLUMNS` en `useLeadGen.ts` para incluir `onlyfans_url`
- Actualizar tipo `LeadGenEntry` con `onlyfans_url?: string | null`

**`ContactosTable.tsx`:**
- Agregar columna "OF URL" en posición similar
- Mostrar como link externo

---

### 6. Normalización de OnlyFans URL

Reutilizar `normalizeHandle` de `handle-utils.ts` que ya soporta `onlyfans.com`. Para la validación de formato, verificar que empiece con `https://onlyfans.com/` o sea un handle simple.

---

### Orden de validación (en ambos formularios)

```text
1. ¿Es creator existente? (instagram_handle O onlyfans_url en creators) → BLOQUEAR
2. ¿Lead reciente <24h? (model_handle O onlyfans_url en leadgen_entries) → BLOQUEAR  
3. ¿Duplicado OF en contactos? (onlyfans_url en closers_contacts) → BLOQUEAR
4. Todo OK → PERMITIR creación
```

---

### Archivos a modificar/crear

| Archivo | Acción |
|---------|--------|
| Migración SQL | Agregar `onlyfans_url` a `leadgen_entries` y `closers_contacts` |
| `src/lib/lead-validation.ts` | **Crear** — Funciones de validación compartidas |
| `src/pages/leadgen/AddLeadModal.tsx` | Agregar campo OF + validaciones pre-submit |
| `src/pages/leadgen/useLeadGen.ts` | Agregar `onlyfans_url` a `ENTRY_COLUMNS` y tipo |
| `src/pages/leadgen/LeadGenTable.tsx` | Agregar columna OF URL |
| `src/pages/contactos/NuevoContactoForm.tsx` | Agregar campo OF + validaciones pre-submit |
| `src/pages/contactos/ContactosTable.tsx` | Agregar columna OF URL |
| `src/pages/contactos/ContactosContent.tsx` | Incluir `onlyfans_url` en el tipo Contacto si necesario |

