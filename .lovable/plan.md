
# Funcionalidad de Subir Archivos con Modal

## Resumen
Crear un modal reutilizable para subir archivos (fotos y documentos) en la seccion de Documentacion. Se configurara un bucket de Supabase Storage y se conectaran los 3 botones "Subir Archivos" al modal. Los archivos subidos se almacenan en Supabase Storage y se registran en la tabla `creator_documents` existente.

## Cambios

### 1. Crear bucket de Supabase Storage (migracion SQL)
- Crear bucket `creator-files` (publico) para almacenar contratos, fotos de PickLink y fotos/videos extras
- Agregar politicas RLS para permitir lectura publica y subida autenticada (o anonima si no hay auth configurado)

### 2. Nuevo componente `src/components/FileUploadModal.tsx`
Modal reutilizable con las siguientes funcionalidades:
- Se abre al hacer clic en cualquiera de los botones "Subir Archivos"
- Titulo dinamico segun el contexto (ej: "Contrato Firmado & Documentos", "Fotos de PickLink", "Fotos y Videos Extras")
- Zona de drag & drop con icono de upload y texto instructivo
- Boton "Seleccionar archivos" que abre el file picker nativo
- Filtro de tipos de archivo segun el contexto:
  - Contratos: PDF, DOC, DOCX, imagenes
  - Fotos PickLink: imagenes (JPG, PNG, GIF)
  - Fotos/Videos Extras: imagenes + videos (MP4, MOV)
- Vista previa de archivos seleccionados con nombre, tamano y boton para eliminar
- Barra de progreso durante la subida
- Boton "Subir" para confirmar
- Validacion de tamano maximo por archivo

### 3. Logica de subida en el modal
- Subir cada archivo a Supabase Storage en la ruta `creator-files/{creatorId o 'temp'}/{categoria}/{filename}`
- Como el creador aun no existe al momento del formulario, se usara un ID temporal (UUID generado al montar el formulario)
- Al guardar el creador exitosamente, los archivos quedan vinculados via `creator_documents`

### 4. Actualizar `src/pages/creadores/NuevoCreadorForm.tsx`
- Importar y usar el nuevo `FileUploadModal`
- Agregar estado para archivos subidos por categoria (contratos, picklink, extras)
- Reemplazar los 3 botones "Subir Archivos" deshabilitados por botones funcionales que abren el modal
- Mostrar lista de archivos ya subidos debajo de cada boton con miniatura (si es imagen) y nombre
- Al hacer submit del formulario, insertar registros en `creator_documents` con el `creator_id` real

### 5. Actualizar `src/pages/creadores/useCreadores.ts`
- Agregar funcion para insertar registros en `creator_documents` despues de crear el creador

## Detalle Tecnico

**Estructura del modal:**
```text
+------------------------------------------+
|  [X]  Subir Archivos - {Titulo}          |
+------------------------------------------+
|                                          |
|     +------------------------------+     |
|     |    [Icono Upload]            |     |
|     |  Arrastra archivos aqui o    |     |
|     |  [Seleccionar archivos]      |     |
|     |  Formatos: ...               |     |
|     +------------------------------+     |
|                                          |
|  Archivos seleccionados:                 |
|  +------------------------------------+  |
|  | archivo1.pdf  2.3MB         [X]    |  |
|  | foto.jpg      1.1MB         [X]    |  |
|  +------------------------------------+  |
|                                          |
|            [Cancelar]  [Subir]           |
+------------------------------------------+
```

**Estado de archivos en el formulario:**
```typescript
interface UploadedFile {
  name: string;
  url: string;
  type: string;
  size: number;
  category: "contracts" | "piclink" | "extras";
}
```

**Ruta en Storage:** `creator-files/{tempId}/{category}/{filename}`

**Migracion SQL:**
```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('creator-files', 'creator-files', true);
CREATE POLICY "Allow public read" ON storage.objects FOR SELECT USING (bucket_id = 'creator-files');
CREATE POLICY "Allow uploads" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'creator-files');
CREATE POLICY "Allow deletes" ON storage.objects FOR DELETE USING (bucket_id = 'creator-files');
```

## Archivos nuevos
- `src/components/FileUploadModal.tsx`

## Archivos modificados
- `src/pages/creadores/NuevoCreadorForm.tsx` (conectar botones al modal, estado de archivos, insertar en creator_documents al submit)
- `src/pages/creadores/useCreadores.ts` (funcion para insertar en creator_documents)
- Migracion SQL para crear el bucket de storage
