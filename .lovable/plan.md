

# Formulario inline al hacer clic en "+" en cada card de lineamiento

## Resumen

Reemplazar el comportamiento actual del boton "+" en cada GuidelineItemRow (que abre un modal) por un formulario inline que se despliega dentro de la misma card, similar a la imagen de referencia. El formulario mostrara un campo "Contenido" con textarea y botones "Cancelar" / "Guardar" al pie.

## Cambios

### 1. `src/pages/creadores/lineamientos/GuidelineItemRow.tsx`

- Agregar nuevas props: `inlineAdding: boolean`, `inlineContent: string`, `onInlineContentChange: (value: string) => void`, `onInlineSubmit: () => void`, `onInlineCancel: () => void`, `isSaving: boolean`
- Cuando `inlineAdding` es `true`, la card se expande automaticamente mostrando:
  - Label "Contenido" con un `Textarea` debajo
  - Botones "Cancelar" (ghost) y "Guardar" (primary, disabled si el contenido esta vacio o si `isSaving`)
- El boton "+" ahora llama a `onAdd` que activara el modo inline en lugar de abrir modal

### 2. `src/pages/creadores/LineamientosTabContent.tsx`

- Agregar estado `inlineAddingKey: string | null` para rastrear cual item tiene el formulario inline abierto
- Agregar estado `inlineAddContent: string` para el contenido del textarea
- Modificar `openAddForItem` para que en lugar de abrir el modal, active el formulario inline en esa card (`setInlineAddingKey(key)`)
- Agregar handler `handleInlineAddSubmit` que inserta el lineamiento via `upsertMutation` y limpia el estado inline
- Pasar las nuevas props a cada `GuidelineItemRow`: `inlineAdding`, `inlineContent`, `onInlineContentChange`, `onInlineSubmit`, `onInlineCancel`, `isSaving`

### Visual del formulario inline (dentro de la card)

```text
+-----------------------------------------------+
| [icon] Titulo del item                    [+] [v] |
|-----------------------------------------------|
|  Contenido                                      |
|  +-------------------------------------------+  |
|  | Describe el lineamiento...                 |  |
|  |                                            |  |
|  |                                            |  |
|  +-------------------------------------------+  |
|                                                  |
|                     Cancelar    [Guardar]         |
+-----------------------------------------------+
```

- El formulario se muestra en la zona expandida de la card (pl-16 para alinear con el contenido)
- Textarea con placeholder "Describe el lineamiento..."
- Botones alineados a la derecha
- "Guardar" deshabilitado si el contenido esta vacio
