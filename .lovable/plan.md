

## Ajustes al modal de Nueva Solicitud

### 1. Actualizar opciones del dropdown "Estado"

Cambiar las opciones actuales (Pendiente, En Progreso, Completado, Cancelado) por las que aparecen en la referencia:
- **Solicitado** (valor: `solicitado`)
- **En proceso** (valor: `en_proceso`)
- **Pendiente** (valor: `pendiente`)
- **Entregado** (valor: `entregado`)
- **Denegado** (valor: `denegado`)

El valor por defecto sera `solicitado`.

### 2. Actualizar opciones del dropdown "Tipo de Contenido"

Eliminar "Texto" y "Otro" del array `CONTENT_TYPES`, dejando solo:
- Foto, Video, Audio, Articulo, Prenda

### 3. Mover "Notas" a una sola columna

Sacar "Notas" de la fila compartida con "Tiempo o Cantidad" y colocarlo como un campo de ancho completo debajo de esa fila.

### 4. Agregar campo de subida de archivo (imagen/video)

- Crear un **storage bucket** `custom-request-attachments` (publico) via migracion SQL con politicas RLS para usuarios autenticados.
- Agregar columna `attachment_url TEXT` a la tabla `custom_content_requests`.
- En el modal, agregar un campo de subida de archivo (input type="file" con accept="image/*,video/*") debajo de Notas.
- Al seleccionar archivo, subirlo a Supabase Storage y guardar la URL publica en `attachment_url`.
- Mostrar una preview del archivo seleccionado (thumbnail para imagenes, nombre para videos).
- Actualizar `useCustomRequests.ts` para incluir `attachment_url` en el tipo y mutacion.

### Archivo a modificar

**`src/pages/creadores/personalizados/NewRequestModal.tsx`** - Todos los cambios de UI (opciones, layout, campo de subida).

**`src/pages/creadores/personalizados/useCustomRequests.ts`** - Agregar `attachment_url` al tipo y mutacion.

**Migracion SQL** - Crear bucket + agregar columna `attachment_url`.

