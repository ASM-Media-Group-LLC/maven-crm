

## Corregir lógica de validación: LeadGen, Contactos y Creators

### Problema actual
- `checkCreatorExists` bloquea siempre sin importar el estado de la creadora (activa, pausada, terminada, etc.)
- Contactos valida por handle contra creators (bloquea incorrectamente)
- Contactos bloquea por teléfono duplicado (debería ser warning)
- LeadGen no tiene bloqueo de 24h para mismo handle
- `AddContactoModal` (LeadGen) tiene validación independiente desalineada

### Estados reales en `creators`
`active`, `onboarding`, `pendiente`, `pendiente_verificacion`, `borrador`, `paused`, `leaving`, `terminated`

### Reglas a implementar

**Creators check (global, antes de todo):**
- Si status es `active`, `onboarding`, `pendiente`, `pendiente_verificacion` → **bloquear**: "Esta creadora ya forma parte de la agencia"
- Si status es `paused`, `leaving`, `terminated`, `borrador` → **permitir**, marcar como `reactivado`, toast informativo

**LeadGen (handle only):**
- Mismo handle < 24h en `leadgen_entries` → bloquear
- Mismo handle > 24h → permitir, marcar `reactivado`
- Nuevo → permitir

**Contactos (teléfono only, NO handle):**
- Mismo teléfono encontrado → warning informativo, **NO bloquear**
- Mismo handle → mensaje informativo, NO bloquear, marcar `reactivado`
- Handle existente en creators inactiva → permitir con toast

---

### Cambios por archivo

**1. `src/lib/lead-validation.ts`**

- **`checkCreatorExists`**: Agregar filtro por status. Retornar `{ exists, isActive, creatorName, creatorId, creatorStatus }`.
  - Estados activos (bloquean): `active`, `onboarding`, `pendiente`, `pendiente_verificacion`
  - Estados inactivos (no bloquean): `paused`, `leaving`, `terminated`, `borrador`
- **`checkPreviousLead`**: Retornar también `lastEntryDate` (la fecha del registro más reciente en `leadgen_entries`) para calcular la regla de 24h.
- **Nueva función `checkExistingContact(handle)`**: Busca en `closers_contacts`, retorna `{ exists, contactName }` — solo informativo.

**2. `src/pages/leadgen/AddLeadModal.tsx` (líneas 106-137)**

- VALIDATION 1 (creators): Usar nuevo `checkCreatorExists` con lógica de estado.
  - Si `isActive` → bloquear con alerta.
  - Si existe pero inactiva → permitir, `recordType = "reactivado"`, toast informativo.
- VALIDATION 2 (handle 24h): Usar `lastEntryDate` de `checkPreviousLead`.
  - Si < 24h → bloquear con toast destructivo.
  - Si > 24h → `recordType = "reactivado"`, toast informativo.
- VALIDATION 3 (OnlyFans): Se mantiene igual (bloqueo por unicidad).

**3. `src/pages/contactos/NuevoContactoForm.tsx` (líneas 148-213)**

- VALIDATION 1 (creators): Misma lógica de estado (bloquear solo activas).
- **Eliminar VALIDATION 2** (checkPreviousLead por handle) → reemplazar por `checkExistingContact` solo informativo, sin bloquear.
- VALIDATION 3 (OnlyFans): Se mantiene.
- **Teléfono**: Cambiar de bloqueo a warning informativo (toast normal, no destructivo). Permitir guardar.

**4. `src/pages/leadgen/AddContactoModal.tsx` (líneas 73-126)**

- Reemplazar check de handle contra `creators` por `checkCreatorExists` con lógica de estado.
- Cambiar bloqueo de teléfono a warning informativo.
- Agregar detección de handle existente en contactos → toast informativo + `record_type: "reactivado"`.

### Archivos a modificar
- `src/lib/lead-validation.ts`
- `src/pages/leadgen/AddLeadModal.tsx`
- `src/pages/contactos/NuevoContactoForm.tsx`
- `src/pages/leadgen/AddContactoModal.tsx`

