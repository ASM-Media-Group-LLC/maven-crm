

# Agregar toasts de exito y error en acciones de lineamientos inline

## Contexto actual

El sistema ya usa `toast` de **Sonner** (linea 27 de `LineamientosTabContent.tsx`). Actualmente:
- **Guardar:** muestra `toast.success("Lineamiento creado")` pero **no tiene `onError`** para mostrar error.
- **Guardar y agregar otro:** misma situacion, exito sin manejo de error.
- **Cancelar:** no muestra ningun feedback.

## Cambios propuestos

**Archivo:** `src/pages/creadores/LineamientosTabContent.tsx`

### 1. Agregar `onError` en `handleInlineAddSubmit` (linea ~157-178)
Agregar un callback `onError` a la mutacion para mostrar `toast.error("Error al guardar lineamiento")` cuando falle el guardado. Esto aplica tanto para "Guardar" como para "Guardar y agregar otro" ya que ambos usan la misma funcion.

### 2. Agregar toast en cancelar (linea ~347)
En el `onInlineCancel`, despues de resetear el formulario, agregar `toast("Edicion cancelada")` como feedback informativo (toast neutro sin variante destructiva ni de exito).

## Resultado esperado

| Accion | Toast | Tipo |
|---|---|---|
| Guardar (exito) | "Lineamiento creado" | success (ya existe) |
| Guardar (error) | "Error al guardar lineamiento" | error (nuevo) |
| Guardar y agregar otro (exito) | "Lineamiento creado" | success (ya existe) |
| Guardar y agregar otro (error) | "Error al guardar lineamiento" | error (nuevo) |
| Cancelar | "Edicion cancelada" | neutro (nuevo) |

## Detalles tecnicos

- Se usa `toast` de Sonner, consistente con el resto del proyecto.
- El estilo visual sigue el sistema de diseno existente (Sonner ya esta configurado en `App.tsx`).
- Solo se modifican 2 puntos del archivo `LineamientosTabContent.tsx`: la mutacion inline (~linea 166) y el handler de cancelar (~linea 347).

