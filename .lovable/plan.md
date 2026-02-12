
# Agregar funcionalidad de subida de archivos en Nuevo Contacto

## Resumen

Integrar el componente `FileUploadModal` existente en el formulario `NuevoContactoForm.tsx` para habilitar la subida real de foto de perfil y fotos/videos extras al bucket `creator-files` de Supabase Storage. Se reutilizara el mismo patron usado en `NuevoCreadorForm.tsx`.

## Cambios

**Archivo a modificar:** `src/pages/contactos/NuevoContactoForm.tsx`

### 1. Imports adicionales
- Importar `FileUploadModal`, `UploadCategory`, `UploadedFile` desde `@/components/FileUploadModal`.
- Importar `AvatarImage` de `@/components/ui/avatar`.
- Importar `X, ImageIcon, Film, FileText` de lucide-react.

### 2. Estado nuevo
- `uploadModal`: `{ open: boolean; category: UploadCategory }` para controlar el modal.
- `profilePhoto`: `UploadedFile | null` para la foto de perfil subida.
- `extraFiles`: `UploadedFile[]` para los archivos extras subidos.
- `tempId`: string generado con `crypto.randomUUID()` (o `Date.now()`) como prefijo de ruta en Storage.

### 3. Handlers
- `handleFilesUploaded(files)`: Si la categoria es `"piclink"` (reutilizada para foto de perfil), toma el primer archivo y lo guarda en `profilePhoto`. Si es `"extras"`, agrega al array `extraFiles`.
- `removeExtraFile(index)`: Remueve un archivo extra del array por indice.

### 4. Seccion "Foto de Perfil" (lineas 222-234)
- El boton "Subir Foto" abrira el `FileUploadModal` con categoria `"piclink"` (acepta imagenes).
- Si hay `profilePhoto`, mostrar el `AvatarImage` con la URL subida en lugar del fallback, y un boton X para removerla.

### 5. Seccion "Fotos y Videos Extras" (lineas 236-246)
- El boton "Subir Archivos" abrira el `FileUploadModal` con categoria `"extras"`.
- Debajo, listar los archivos subidos con nombre, tamano, icono por tipo y boton X para remover cada uno.

### 6. Componente FileUploadModal
- Renderizar una unica instancia de `FileUploadModal` controlada por `uploadModal.open` y `uploadModal.category`, con `tempId` y `onFilesUploaded`.

### 7. Incluir archivos en submit
- Agregar `profilePhoto` y `extraFiles` al log/toast de confirmacion (para futura persistencia en DB).

## Preservacion
- No se modifican los campos existentes del formulario, header, footer ni navegacion.
- Se reutiliza el bucket `creator-files` ya configurado con politicas RLS publicas.
