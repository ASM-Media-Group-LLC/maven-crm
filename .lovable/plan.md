

## Hacer opcional la asignacion de Manager y Chatters en el modal de Onboarding

### Problema actual

El modal de "Asignacion Operativa" requiere obligatoriamente seleccionar un Manager para poder completar el onboarding. Si no hay managers o chatters creados en el sistema, el usuario queda bloqueado y no puede finalizar el proceso.

### Solucion

Hacer ambos campos (Manager y Chatters) opcionales, permitiendo completar el onboarding sin asignaciones y agregarlas despues desde el perfil de la creadora.

### Cambios

**Archivo: `src/pages/creadores/onboarding/AssignmentModal.tsx`**

1. Cambiar la interfaz `onConfirm` para aceptar `managerId` como `string | null` en vez de `string`
2. Remover el asterisco rojo (*) del label de Manager
3. Agregar texto "(opcional)" junto al label de Manager, igual que los Chatters
4. Remover la condicion `disabled={!selectedManager}` del boton "Completar Onboarding"
5. Actualizar `handleConfirm` para pasar `null` si no hay manager seleccionado
6. Agregar un mensaje informativo (texto sutil) indicando que se pueden asignar despues

**Archivo: `src/pages/creadores/onboarding/OnboardingWizard.tsx`**

1. Actualizar la firma de `handleAssignmentConfirm` para aceptar `managerId: string | null`
2. Condicionar la escritura de `assigned_manager_profile_id` solo si `managerId` existe
3. Condicionar el `upsert` en `creator_assignments` solo si `managerId` existe
4. Mantener la logica de chatters sin cambios (ya es opcional)

### Detalle tecnico

```text
AssignmentModal
  - onConfirm({ managerId: string | null, chatterIds: string[] })
  - Boton siempre habilitado (sin disabled por manager)
  - Label: "Manager (opcional)" sin asterisco

OnboardingWizard.handleAssignmentConfirm
  - if (managerId) -> asignar manager en creator y creator_assignments
  - if (!managerId) -> solo guardar creator sin manager
  - Chatters: sin cambios
```

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/creadores/onboarding/AssignmentModal.tsx` | Manager opcional, quitar asterisco, quitar disabled, actualizar tipo |
| `src/pages/creadores/onboarding/OnboardingWizard.tsx` | Condicionar asignacion de manager en handleAssignmentConfirm |

