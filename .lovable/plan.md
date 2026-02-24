

## Modal de Asignacion Operativa al Finalizar Onboarding

### Resumen

Al hacer clic en "Finalizar" en el Paso 4 del wizard de onboarding, en lugar de guardar directamente, se abrira un modal de "Asignacion Operativa" donde se selecciona el equipo que gestionara a la creadora. El onboarding no se puede completar sin asignar al menos un Manager.

---

### 1. Nuevo componente: AssignmentModal

**Archivo nuevo:** `src/pages/creadores/onboarding/AssignmentModal.tsx`

Un Dialog modal con:

- **Titulo:** "Asignacion Operativa"
- **Descripcion:** "Asigna el equipo que gestionara esta cuenta antes de completar el onboarding."
- **Selector de Manager (obligatorio):** Dropdown searchable que lista todos los usuarios con rol `manager` (consultando `user_roles` + `profiles`). Si no se selecciona, el boton "Completar" permanece deshabilitado.
- **Multi-selector de Chatters (opcional, max 3):** Lista de usuarios con rol `agent`. Se pueden seleccionar entre 1 y 3 chatters usando checkboxes dentro de un Command/Popover similar al patron de `EmployeeSearchCombobox`.
- **Botones:** "Cancelar" (cierra modal sin guardar) y "Completar Onboarding" (deshabilitado si no hay manager).

**Datos que consulta el modal:**
```sql
-- Para listar managers
SELECT p.id, p.full_name FROM profiles p
INNER JOIN user_roles ur ON ur.user_id = p.id
WHERE ur.role = 'manager';

-- Para listar chatters/agents  
SELECT p.id, p.full_name FROM profiles p
INNER JOIN user_roles ur ON ur.user_id = p.id
WHERE ur.role = 'agent';
```

---

### 2. Flujo del boton "Finalizar"

**Archivo modificado:** `src/pages/creadores/onboarding/OnboardingWizard.tsx`

Cambios en la logica:

1. Agregar estado `showAssignmentModal` (boolean).
2. El boton "Finalizar" (linea 611) ya no llama directamente a `handleSubmit(false)`. En su lugar:
   - Ejecuta las validaciones existentes (Step 1, Step 4 pricing).
   - Si pasan, abre el modal: `setShowAssignmentModal(true)`.
3. Cuando el modal confirma con los datos de asignacion (managerId, chatterIds[]):
   - Ejecuta el `handleSubmit(false)` existente.
   - Tras el insert/update exitoso del creator, inserta el registro de asignacion en `creator_assignments` con los profile_ids seleccionados.
   - Actualiza `creators.assigned_manager_profile_id` con el manager seleccionado.

---

### 3. Persistencia de la asignacion

Se usara la tabla existente `creator_assignments` que ya tiene las columnas necesarias:
- `creator_id` (uuid, FK a creators)
- `manager_profile_id` (uuid)
- `specialist_profile_id` (uuid) -- se usara para los chatters (1 registro por chatter, o se usara el campo para el primer chatter)

**Problema:** `creator_assignments` solo tiene un campo `specialist_profile_id` y un `closer_profile_id`, no soporta multiples chatters.

**Solucion:** Crear una nueva tabla `creator_chatter_assignments` para soportar multiples chatters por creador.

---

### 4. Migracion de base de datos

**Nueva tabla:** `creator_chatter_assignments`

```sql
CREATE TABLE public.creator_chatter_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  chatter_profile_id uuid NOT NULL,
  assigned_at timestamptz DEFAULT now(),
  assigned_by uuid,
  is_active boolean DEFAULT true,
  UNIQUE(creator_id, chatter_profile_id)
);

ALTER TABLE creator_chatter_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage creator_chatter_assignments"
  ON creator_chatter_assignments FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

Ademas, se insertara un registro en `creator_assignments` con el `manager_profile_id` seleccionado al completar el onboarding.

---

### 5. Archivos a crear/modificar

| Archivo | Accion |
|---------|--------|
| Migracion SQL | Crear tabla `creator_chatter_assignments` |
| `src/pages/creadores/onboarding/AssignmentModal.tsx` | **Nuevo.** Modal con selector de Manager y multi-selector de Chatters |
| `src/pages/creadores/onboarding/OnboardingWizard.tsx` | Agregar estado del modal, interceptar "Finalizar" para abrir modal, ejecutar la asignacion tras el submit exitoso |
| `src/integrations/supabase/types.ts` | Se actualiza automaticamente tras la migracion |

---

### 6. Detalle tecnico del modal

**Hook interno del modal** para cargar managers y chatters:
- Query `profiles` + `user_roles` filtrado por rol
- Cache con `staleTime: 5min`

**Estado del modal:**
- `selectedManager: string | null` -- profile_id del manager
- `selectedChatters: string[]` -- array de profile_ids (max 3)

**Validacion:**
- Boton "Completar Onboarding" deshabilitado si `!selectedManager`
- Al seleccionar mas de 3 chatters, mostrar toast de advertencia y no agregar

**Al confirmar:**
1. Callback `onConfirm({ managerId, chatterIds })` al wizard
2. El wizard ejecuta el flujo normal de `handleSubmit`
3. Tras exito, inserta en `creator_assignments` y `creator_chatter_assignments`
4. Actualiza `creators.assigned_manager_profile_id`

