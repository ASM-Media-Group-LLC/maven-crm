

# Implementar Modal de Cambio de Estado de Creadora

## Descripcion

Crear un modal "Cambiar Estado de Creadora" que se abra al hacer clic en el Badge de estado en el perfil. El modal permite seleccionar un nuevo estado, escribir una nota obligatoria, y al confirmar actualiza el estado en la tabla `creators`, registra el cambio en `creator_history` y guarda la nota en `creator_notes`. Incluye toasts de exito, cancelacion y error.

## Diseno visual (basado en la imagen)

- Dialog con titulo "Cambiar Estado de Creadora" y subtitulo con el nombre de la creadora
- Seccion "Estado Actual" mostrando el estado con indicador de color (circulo verde/azul/amarillo/rojo)
- Select "Nuevo Estado *" con los mismos indicadores de color por opcion
- Textarea "Nota Obligatoria *" con placeholder "Explica el motivo del cambio de estado..."
- Texto informativo: "Esta nota se guardara en el historial y en las notas de la creadora"
- Botones: "Cancelar" (outline) y "Cambiar Estado" (primary)

## Archivos

### 1. Nuevo: `src/pages/creadores/ChangeStatusModal.tsx`

Componente modal con:
- Props: `creatorId`, `creatorName`, `currentStatus`, `open`, `onOpenChange`
- Select con las 5 opciones de estado (active, onboarding, paused, leaving, terminated) con indicadores de color
- Textarea para nota obligatoria (minimo contenido requerido)
- Al confirmar:
  1. Actualiza `creators.status` via Supabase
  2. Inserta registro en `creator_history` con action "Cambio de estado", old_value y new_value
  3. Inserta nota en `creator_notes` con el motivo
  4. Invalida queries de `creators`, `creator`, `creator_history`, `creator_notes`
- Toasts: exito ("Estado actualizado exitosamente"), error (destructive con mensaje), cancelacion ("Edicion cancelada")

### 2. Editar: `src/pages/creadores/CreadorProfileContent.tsx`

- Importar `ChangeStatusModal` y agregar estado `useState` para controlar apertura del modal
- Hacer el Badge de estado clickeable (cursor-pointer, hover) para abrir el modal
- Renderizar el `ChangeStatusModal` pasando las props necesarias

## Seccion tecnica

**Colores por estado (indicador circular):**
- active: `bg-green-500`
- onboarding: `bg-blue-500`
- paused: `bg-gray-400`
- leaving: `bg-yellow-500`
- terminated: `bg-red-500`

**Flujo de datos al confirmar:**
```text
1. UPDATE creators SET status = newStatus WHERE id = creatorId
2. INSERT INTO creator_history (creator_id, action, old_value, new_value, user_id)
3. INSERT INTO creator_notes (creator_id, note_text, created_by)
4. Invalidate queries: ["creators"], ["creator", id], ["creator_history", id], ["creator_notes", id]
```

**Validaciones:**
- No permitir seleccionar el mismo estado actual
- Nota obligatoria no puede estar vacia (trim)
- Boton deshabilitado mientras guarda

**Patron de toast (siguiendo NotasTabContent):**
- Usa `toast()` importado de `@/hooks/use-toast`
- Exito: `toast({ title: "Estado actualizado exitosamente" })`
- Error: `toast({ title: "Error al cambiar estado", description: error.message, variant: "destructive" })`
- Cancelacion: `toast({ title: "Edicion cancelada" })`

