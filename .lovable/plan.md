
## Quitar campo "Título" del modal de Nueva Solicitud

### Cambio principal

Eliminar el campo de texto "Título" del formulario y auto-generar el título al momento de crear la solicitud, usando el tipo de contenido y la creadora seleccionada.

**Formato auto-generado:** `"Video - NombreCreadora"` o `"Foto - Sin asignar"` si no hay creadora.

---

### Archivos a modificar

**1. `NewRequestModal.tsx`**
- Eliminar el estado `title` y su `setTitle`
- Eliminar el bloque JSX del campo "Título" (Label + Input)
- En `handleSubmit`: construir el título automaticamente con `contentType` + nombre de la creadora seleccionada
- Eliminar `setTitle("")` del reset en `onSuccess`
- Quitar la validacion `disabled={!title.trim()}` del boton (ya no depende de titulo)

**2. Sin cambios en otros archivos** - El campo `title` sigue existiendo en la base de datos y se sigue mostrando en la tabla, tracking drawer y modal de vista. Solo se deja de pedir manualmente.
