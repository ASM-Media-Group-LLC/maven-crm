

# Agregar iconos a acciones del dropdown + Modales de Ver Detalle, Editar y Eliminar Contacto

## Resumen

Se agregaran iconos a cada opcion del dropdown de acciones en la tabla y grid de contactos, y se crearan tres modales: **Ver Detalle** (con info completa, enlaces sociales, historial de interacciones, botones Editar/Eliminar/Convertir y editar categoria), **Editar Contacto** (formulario pre-llenado con todos los campos del formulario de creacion), y **Eliminar Contacto** (confirmacion con AlertDialog). Tambien se agregara "Convertir a Creador" con icono de sparkles. Todo siguiendo los patrones existentes (ViewCreadorModal, EditCreadorModal, DeleteEventoDialog).

## Archivos a crear

### 1. `src/pages/contactos/ViewContactoModal.tsx`
Modal de detalle del contacto (Dialog) basado en la imagen de referencia:
- **Header**: Nombre, Ticket, pais (flag emoji), "Ingresado por: X", badge de categoria (grande, esquina derecha)
- **Fila de metadata**: Badges outline con "Creado: fecha", "0 llamadas", "0 notas", "Compania"
- **Acciones**: Boton "Editar" (Pencil icon), boton "Eliminar" (Trash2 icon, variant destructive), boton "Editar categoria" (Pencil icon, alineado a la derecha)
- **Boton superior derecho**: "Convertir a Creadora" con icono Sparkles
- **Seccion Instagram**: Icono Instagram + handle + link externo
- **Seccion WhatsApp**: Icono MessageCircle + "Abrir chat" link
- **Seccion "Historial de Interacciones"**: Boton "+ Registrar Interaccion", empty state "No hay interacciones registradas para este contacto. Puedes registrar llamadas, mensajes, emails, reuniones o notas."
- Props: open, onOpenChange, contacto (Contacto), onEdit (abre EditContactoModal), onDelete (abre DeleteContactoDialog)

### 2. `src/pages/contactos/EditContactoModal.tsx`
Modal de edicion (Dialog) basado en la imagen de referencia:
- **Header**: icono Pencil + "Editar Contacto"
- **Formulario** (ScrollArea, max-h-[60vh]) con los mismos campos de NuevoContactoForm:
  - Nombre del Contacto * + Categoria Fisica (grid 2 cols)
  - Compania / Cuenta de Origen
  - Email + Telefono (con select pais + input)
  - Plataforma + Handle/Usuario *
  - Notas (textarea)
  - Foto de Perfil (con upload via FileUploadModal)
  - Galeria de Medios / Fotos y Videos Extras (con upload)
- **Footer**: Cancelar + "Guardar Cambios" (boton primario)
- Pre-llena los campos con datos del contacto seleccionado

### 3. `src/pages/contactos/DeleteContactoDialog.tsx`
AlertDialog de confirmacion (patron DeleteEventoDialog):
- Icono de alerta (AlertTriangle)
- Titulo: "Eliminar contacto"
- Descripcion: "Esta accion eliminara permanentemente a **{nombre}** y todas sus interacciones asociadas. Esta accion no se puede deshacer."
- Footer: Cancelar + Eliminar (destructive)
- Muestra toast de confirmacion

## Archivos a modificar

### 4. `src/pages/contactos/ContactosTable.tsx`
- Importar `Eye, Pencil, Sparkles` de lucide-react
- Agregar iconos a cada DropdownMenuItem:
  - `Eye` + "Ver detalle"
  - `Pencil` + "Editar"
  - `Sparkles` + "Convertir a Creador"
- Agregar callbacks en props: `onView(contacto)`, `onEdit(contacto)`, `onConvert(contacto)`
- Conectar cada MenuItem al callback correspondiente

### 5. `src/pages/contactos/ContactosGrid.tsx`
- Agregar DropdownMenu con las mismas acciones e iconos que la tabla
- Conectar callbacks: `onView`, `onEdit`, `onConvert`

### 6. `src/pages/contactos/ContactosContent.tsx`
- Agregar estado para modales: `selectedContacto`, `viewOpen`, `editOpen`, `deleteOpen`
- Renderizar ViewContactoModal, EditContactoModal, DeleteContactoDialog
- Pasar callbacks onView/onEdit/onConvert a ContactosTable y ContactosGrid
- ViewContactoModal recibe onEdit y onDelete para encadenar acciones desde el detalle

## Detalles tecnicos

- Los modales usan datos mock (no hay tabla en Supabase aun), asi que editar/eliminar solo mostraran toasts de confirmacion y actualizaran estado local
- El modal de detalle usa Dialog (sm:max-w-lg), el de editar usa Dialog (sm:max-w-[600px]), el de eliminar usa AlertDialog
- Se reutiliza FileUploadModal en EditContactoModal con el mismo patron de NuevoContactoForm
- El boton "Convertir a Creadora" en ViewContactoModal muestra un toast informativo por ahora

