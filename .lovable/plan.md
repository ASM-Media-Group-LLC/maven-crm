

## Plan: Sistema Avanzado de Comunicación Interna

Este es un rediseño completo del submódulo de Anuncios. Dado el alcance, se divide en fases implementables de forma incremental. La **Fase 1** cubre la base de datos, el CRUD avanzado y el panel administrativo. La **Fase 2** cubre el feed público, métricas y entrega multicanal.

---

### Fase 1 -- Base de datos + Panel Administrativo

#### 1. Migración de base de datos

**Alterar tabla `internal_announcements`** -- agregar columnas:

| Columna | Tipo | Descripción |
|---|---|---|
| `content_html` | text | Contenido rich text (HTML) |
| `status` | text (default 'draft') | draft, scheduled, active, expired, archived |
| `visibility` | text (default 'global') | global, segmented, personal |
| `delivery_channels` | text[] | {'feed','notification','banner','popup'} |
| `related_module` | text | Módulo relacionado (opcional) |
| `recurrence_type` | text | none, weekly, monthly |
| `recurrence_end_at` | timestamptz | Fin de recurrencia |
| `attachment_url` | text | URL de archivo adjunto |
| `attachment_name` | text | Nombre del archivo |
| `image_url` | text | URL de imagen |
| `view_count` | int (default 0) | Contador de vistas |
| `open_count` | int (default 0) | Contador de aperturas |

**Crear tabla `announcement_audience`** (segmentación):

```text
announcement_audience
├── id (uuid, pk)
├── announcement_id (uuid, fk → internal_announcements)
├── target_type (text) -- 'all', 'department', 'role', 'user', 'project'
├── target_id (text, nullable) -- ID del departamento/rol/usuario/proyecto
├── target_label (text) -- Label legible para UI
└── created_at (timestamptz)
```

**Crear tabla `announcement_views`** (métricas):

```text
announcement_views
├── id (uuid, pk)
├── announcement_id (uuid, fk)
├── user_id (uuid, fk → auth.users)
├── viewed_at (timestamptz)
├── opened_at (timestamptz, nullable)
└── unique(announcement_id, user_id)
```

**Bucket de storage**: Crear `announcement-files` (público) para imágenes y adjuntos.

**RLS**: Lectura autenticada en las 3 tablas. Escritura en `internal_announcements` y `announcement_audience` solo para usuarios con permiso de HR/Announcements. Escritura en `announcement_views` solo para el propio user_id.

#### 2. Componentes UI -- Panel Administrativo (`/hr/anuncios`)

**Vista principal rediseñada** con tabs:

```text
[Todos] [Activos] [Programados] [Borradores] [Expirados] [Archivados]
```

- KPIs actualizados: Total, Activos, Programados, Alcance promedio
- Tabla con columnas: Título, Tipo, Prioridad, Audiencia, Estado, Alcance, Publicación, Acciones
- Filtros: Estado, Tipo, Prioridad, Autor, Fecha (DateRangePicker)
- Acciones por fila: Editar, Duplicar, Archivar, Cancelar, Ver métricas

**Modal de creación/edición ampliado** -- Stepper de 3 pasos:

1. **Contenido**: Título, contenido rich text (Textarea con Markdown support via `react-markdown`), tipo, prioridad, imagen/archivo adjunto, módulo relacionado
2. **Programación**: Fecha/hora publicación, fecha/hora expiración, recurrencia (ninguna/semanal/mensual), fecha fin recurrencia
3. **Audiencia**: Selector de visibilidad (global/segmentada/personal) con selectores dinámicos de departamentos (desde tabla `departments`), roles (desde `roles_config`), usuarios individuales (desde `profiles`), y canales de entrega (checkboxes: feed, notificación, banner, popup)

**Vista de detalle/métricas del anuncio**: Modal o página con contenido completo, info del autor, adjuntos, y tabla de visualizaciones (usuario, fecha vista, fecha apertura, departamento).

#### 3. Archivos a crear/modificar

| Archivo | Acción |
|---|---|
| `src/pages/hr/HRAnnouncements.tsx` | Rediseño completo con tabs y filtros avanzados |
| `src/pages/hr/announcements/useAnnouncementsAdmin.ts` | Ampliar queries, agregar duplicar/archivar |
| `src/pages/hr/announcements/CreateAnnouncementModal.tsx` | Reescribir como stepper de 3 pasos |
| `src/pages/hr/announcements/EditAnnouncementModal.tsx` | Actualizar con los mismos campos |
| `src/pages/hr/announcements/AnnouncementDetailModal.tsx` | **Nuevo** -- vista detalle + métricas |
| `src/pages/hr/announcements/AudienceSelector.tsx` | **Nuevo** -- componente de segmentación |
| `src/pages/hr/announcements/AnnouncementFilters.tsx` | **Nuevo** -- barra de filtros avanzados |
| `src/hooks/useAnnouncements.ts` | Actualizar para filtrar por audiencia del usuario |
| Migration SQL | Alter table + crear tablas nuevas + bucket + RLS |

---

### Fase 2 -- Feed Público + Entrega (siguiente iteración)

- **Feed de anuncios** en dashboard: tarjetas enterprise con prioridad visual, tipo, fecha, preview del contenido
- **Banner temporal** en dashboard para anuncios con canal `banner`
- **Popup modal** para anuncios críticos con canal `popup`
- **Registro automático de vistas** al renderizar un anuncio en el feed
- **Integración con sistema de notificaciones** existente para canal `notification`
- **Edge function con pg_cron** para activar/expirar anuncios programados y manejar recurrencias

---

### Notas técnicas

- Para rich text se usará Textarea con soporte Markdown (ya existe `react-markdown` + `remark-gfm` en dependencias) en lugar de un editor WYSIWYG pesado. El contenido se almacena como Markdown en `content_html` y se renderiza con `ReactMarkdown`
- Los archivos adjuntos se suben al bucket `announcement-files` usando el storage client de Supabase
- La segmentación se resuelve en el frontend al consultar `announcement_audience` y cruzar con el perfil del usuario logueado (departamento, rol)
- El campo `status` se calcula en base a `is_active`, `starts_at`, `expires_at` y se persiste para facilitar filtros

