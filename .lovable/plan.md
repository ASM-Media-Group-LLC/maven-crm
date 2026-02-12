
# Registrar Interaccion inline en ViewContactoModal

## Resumen

Reemplazar el boton "Registrar Interaccion" que actualmente muestra un toast placeholder por un formulario inline que se despliega dentro del mismo modal, sin abrir un modal separado. El formulario seguira el diseno de la imagen de referencia.

## Cambios

**Archivo a modificar:** `src/pages/contactos/ViewContactoModal.tsx`

### 1. Estado nuevo
- `showForm`: boolean para mostrar/ocultar el formulario inline.
- `tipoContacto`: `"nota" | "llamada"` (radio group).
- `notas`: string (textarea).
- `estadoContacto`: string (select: "Sin cambio", "Nuevo", "Contactado", "Interesado", "Convertido", "Rechazado").
- `archivos`: `File[]` (input file nativo, max 10).

### 2. UI del formulario inline
Al hacer clic en "+ Registrar Interaccion", se activa `showForm = true` y el boton cambia a "Cancelar". Se despliega debajo del titulo "Historial de Interacciones":

- **Titulo**: "Registrar Nota" / subtitulo "Contacto: {nombre}"
- **Tipo de Contacto**: RadioGroup con dos opciones: "Nota / Mensaje Escrito" y "Llamada"
- **Notas**: Textarea con placeholder "Notas sobre esta interaccion"
- **Estado del Contacto**: Select con opciones (Sin cambio, Nuevo, Contactado, Interesado, Convertido, Rechazado)
- **Adjuntar Archivos (Fotos/Videos - max. 10)**: Input file nativo con `accept="image/*,video/*"` y `multiple`
- **Footer del formulario**: Cancelar (cierra el form) + Guardar (muestra toast confirmacion y resetea form)

### 3. Imports adicionales
- `RadioGroup, RadioGroupItem` de `@/components/ui/radio-group`
- `Label` de `@/components/ui/label`
- `Textarea` de `@/components/ui/textarea`
- `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` de `@/components/ui/select`
- `Upload` de lucide-react

### 4. Logica de Guardar
- Por ahora (sin Supabase), al guardar se muestra un toast "Interaccion registrada" y se resetea el formulario (showForm = false, campos vacios).
- El boton Guardar esta deshabilitado si `notas` esta vacio.

### 5. ScrollArea
Envolver el contenido del DialogContent en un ScrollArea para que el modal no crezca demasiado cuando el formulario esta visible.

## Preservacion
- No se modifica ningun otro archivo.
- Toda la funcionalidad existente del modal (header, metadata, acciones, Instagram, WhatsApp, historial) se mantiene intacta.
