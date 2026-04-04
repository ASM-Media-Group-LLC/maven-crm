# Plan: Tabs de Miembros + Adjuntos en Tareas

## 1. Base de datos — Tabla `task_attachments`

Nueva tabla para almacenar archivos adjuntos a tareas/subtareas:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `task_id` | uuid FK → tasks | Tarea padre |
| `file_name` | text | Nombre original |
| `file_url` | text | Ruta en storage |
| `file_type` | text | MIME type (image/png, video/mp4, etc.) |
| `file_size` | bigint | Tamaño en bytes |
| `uploaded_by` | uuid | Quién subió |

**RLS**: Miembros del proyecto pueden ver/crear/eliminar adjuntos de tareas en sus proyectos. Admins ven todo.

## 2. Storage — Bucket `task-files`

- Bucket **privado** (acceso mediante signed URLs, consistente con `creator-files`)
- Políticas: authenticated puede subir/leer/eliminar archivos bajo su path

## 3. UI — Tabs de miembros dentro del proyecto

En `TareasContent.tsx`, agregar una fila de tabs/chips debajo de los filtros:
- **"Todos"** (default) — muestra todas las tareas
- Un tab por cada miembro del proyecto con tareas asignadas
- Al seleccionar un tab, filtra `assignedFilter` automáticamente
- Estilo: chips/botones pequeños como los tabs de ClickUp (similar a los agency tabs en CreadoresContent)

## 4. UI — Adjuntos en `TaskDetailSheet`

Dentro del panel lateral de detalle de tarea:
- Sección **"Adjuntos"** después de las subtareas
- Botón para subir archivos (cualquier tipo)
- Lista de archivos con preview para imágenes/videos, icono para otros
- Botón eliminar por archivo (solo el que subió o admin)
- Hook `useTaskAttachments.ts` para CRUD

## 5. UI — Thumbnails en tarjetas Kanban

En `TaskKanbanView.tsx`:
- Si la tarea tiene adjuntos de tipo imagen, mostrar thumbnail del primero arriba del título (como en ClickUp)
- Mostrar icono 📎 + conteo de adjuntos en el footer de la tarjeta
- Query: traer conteo de adjuntos + primer archivo imagen por tarea (batch query)

## Archivos

### Nuevos
| Archivo | Descripción |
|---------|-------------|
| `useTaskAttachments.ts` | Hook para CRUD de adjuntos + upload a storage |
| `TaskAttachmentsSection.tsx` | Sección de adjuntos en el panel de detalle |

### Modificados
| Archivo | Cambio |
|---------|--------|
| `TareasContent.tsx` | Agregar fila de tabs/chips por miembro |
| `TaskDetailSheet.tsx` | Incluir sección de adjuntos |
| `TaskKanbanView.tsx` | Thumbnail de imagen + conteo de adjuntos en tarjetas |
| `useTareas.ts` | Incluir attachment_count y first_image_url en la query de tareas |

### Dependencias
- No se requieren nuevas dependencias