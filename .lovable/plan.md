
# Agregar toasts de exito y cancelacion al modal de tickets

## Cambios

**Archivo**: `src/pages/creadores/CreateTicketModal.tsx`

### 1. Toast de cancelacion
Agregar un toast cuando el usuario presiona el boton "Cancel", siguiendo el patron existente en otros modales del proyecto (RedesTabContent, LineamientosTabContent):

```text
toast("Edicion cancelada")
```

Se reemplazara el `onClick` del boton Cancel para incluir el toast y el reset del formulario antes de cerrar.

### 2. Toast de exito (ya existe)
El toast de exito `"Ticket creado exitosamente"` ya esta implementado en linea 76. No requiere cambios.

### 3. Toast de error (ya existe)  
El toast de error con `variant: "destructive"` ya esta implementado en linea 73. No requiere cambios.

## Seccion tecnica

- Crear una funcion `handleCancel` que ejecute: `reset()`, `toast("Edicion cancelada")` y `onOpenChange(false)`
- Actualizar el boton Cancel (linea 218) para usar `handleCancel` en lugar del lambda actual
- Se usa `toast("...")` directamente (string) siguiendo el patron de `RedesTabContent.tsx` y `LineamientosTabContent.tsx`
