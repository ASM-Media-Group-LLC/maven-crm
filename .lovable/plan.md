

# Implementar tab de Documentos segun imagen de referencia

## Lo que muestra la imagen

La pestana "Documentos" muestra:
- Titulo **"Documentos"** (h2/bold) alineado a la izquierda
- Boton **"Subir Archivo"** (primario, con icono de upload) alineado a la derecha en el header
- Empty state centrado: **"No hay documentos"**
- Todo dentro de un Card con header y contenido

## Recursos existentes

- Tabla `creator_documents` con columnas: `id`, `creator_id`, `file_name`, `file_type`, `file_url`, `description`, `uploaded_by`, `uploaded_at`
- Componente `FileUploadModal` ya existente con logica de upload a Supabase Storage (bucket `creator-files`)

## Cambios tecnicos

### 1. Crear `src/pages/creadores/DocumentosTabContent.tsx`

Nuevo componente que:
- Recibe `creatorId` como prop
- Consulta `creator_documents` filtrado por `creator_id`, ordenado por `uploaded_at` descendente
- **Header**: Titulo "Documentos" a la izquierda + Boton "Subir Archivo" (primario, icono `Upload`) a la derecha
- **Lista de documentos**: Si hay registros, muestra cada documento con nombre, tipo, fecha de subida y enlace de descarga/vista
- **Empty state**: "No hay documentos" centrado cuando no hay registros
- Al hacer clic en "Subir Archivo", abre el `FileUploadModal` existente con category `contracts`
- Al completar el upload, inserta el registro en `creator_documents` y refresca la query

### 2. Modificar `src/pages/creadores/CreadorProfileContent.tsx`

- Importar `DocumentosTabContent`
- Extraer "documentos" del array de tabs placeholder
- Agregar `TabsContent` dedicado para `value="documentos"` con `<DocumentosTabContent creatorId={id!} />`
- El array de placeholders queda: `["notas", "tickets", "historial"]`

### Estructura visual

```text
+----------------------------------------------------------+
|  Documentos                        [Subir Archivo]        |
|                                                           |
|  file_name.pdf   |  PDF   |  10 Feb 2025   [Descargar]   |
|  foto.jpg        |  IMG   |  08 Feb 2025   [Descargar]   |
+----------------------------------------------------------+
```

O si no hay datos:

```text
+----------------------------------------------------------+
|  Documentos                        [Subir Archivo]        |
|                                                           |
|              No hay documentos                            |
+----------------------------------------------------------+
```

### Detalles de implementacion

- Reutilizar `FileUploadModal` para el flujo de subida
- Al recibir archivos del modal, insertar en `creator_documents` con `creator_id`, `file_name`, `file_type`, `file_url`
- Usar `useQuery` para fetch y `useMutation` / invalidacion de cache para refresh post-upload
- Componentes del sistema: `Card`, `CardHeader`, `CardTitle`, `CardContent`, `Button`, `Table`, `Skeleton`
- Seguir el patron visual de MonetizacionTabContent para consistencia

