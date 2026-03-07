

## Plan: Fase 2 — Feed Público, Entrega Multicanal y Métricas Automáticas

### Resumen

Implementar la experiencia del usuario final: feed de anuncios en el dashboard, banners temporales, popups críticos, registro automático de vistas, filtrado por audiencia del usuario, e integración con el sistema de notificaciones existente.

---

### 1. Actualizar hook público `useAnnouncements.ts`

Ampliar el hook para:
- Traer campos nuevos: `content_html`, `priority`, `visibility`, `delivery_channels`, `image_url`, `announcement_type`, `status`
- Traer `announcement_audience` relacionada para cada anuncio
- Filtrar client-side por audiencia del usuario (cruzando su `department_id` del perfil y sus roles de `user_roles`)
- Separar anuncios por canal: `feed`, `banner`, `popup`
- Registrar vista automáticamente al cargar (upsert en `announcement_views`)

Nuevo hook `useRecordAnnouncementView(announcementId)` que hace upsert en `announcement_views` e incrementa `view_count` en `internal_announcements`.

Nuevo hook `useRecordAnnouncementOpen(announcementId)` que actualiza `opened_at` e incrementa `open_count`.

---

### 2. Rediseñar tarjeta de Avisos en Dashboard

Reemplazar la sección actual "Avisos y Celebraciones" en `DashboardContent.tsx`:

- **Feed de anuncios**: Tarjetas enterprise con indicador de prioridad (barra lateral coloreada), tipo como badge, fecha, preview del contenido markdown truncado, imagen thumbnail si existe
- Click en tarjeta abre un **modal de detalle** (reutilizar/adaptar una versión pública del `AnnouncementDetailModal`)
- Al abrir el detalle se registra `opened_at`
- Mantener los cumpleaños integrados en la misma sección

---

### 3. Banner temporal en Dashboard

Nuevo componente `AnnouncementBanner.tsx`:
- Se renderiza arriba del contenido del dashboard (debajo del header)
- Muestra anuncios activos con `delivery_channels` que incluya `'banner'`
- Diseño: barra horizontal con icono de prioridad, título, mensaje truncado, botón "Ver más" y botón "X" para cerrar
- El cierre se persiste en `sessionStorage` para no mostrar el mismo banner de nuevo en la sesión
- Colores según prioridad (high = destructive, normal = primary, low = muted)

---

### 4. Popup para anuncios críticos

Nuevo componente `AnnouncementPopup.tsx`:
- Dialog modal que aparece automáticamente para anuncios con canal `'popup'`
- Solo se muestra una vez por usuario (verificar si ya existe registro en `announcement_views`)
- Contenido completo en markdown, imagen, adjunto
- Botón "Entendido" que cierra y registra la vista/apertura
- Se monta en `Dashboard.tsx`

---

### 5. Integración con sistema de notificaciones

Al crear un anuncio con canal `'notification'`, insertar notificaciones en la tabla `notifications` para cada usuario de la audiencia:
- Modificar `useCreateAnnouncement` en `useAnnouncementsAdmin.ts`
- Si `delivery_channels` incluye `'notification'` y `status === 'active'`:
  - Consultar usuarios según audiencia (global = todos los perfiles, por departamento = empleados del depto, por rol = user_roles, por usuario = directo)
  - Insertar en `notifications` con: `type: 'announcement'`, `module_origin: 'Comunicación'`, `deep_link_url: '/hr/anuncios'`, `reference_id: announcement.id`, `priority` mapeada

---

### 6. Registro automático de vistas

En el feed del dashboard, al renderizar cada tarjeta de anuncio visible:
- Usar un `useEffect` con `IntersectionObserver` para detectar cuando la tarjeta entra en viewport
- Al ser visible > 1 segundo, registrar vista via upsert en `announcement_views`
- Incrementar `view_count` en `internal_announcements` (usando `.rpc` o update directo)

---

### Archivos a crear/modificar

| Archivo | Acción |
|---|---|
| `src/hooks/useAnnouncements.ts` | Ampliar con audiencia, canales, registro de vistas |
| `src/components/dashboard/DashboardContent.tsx` | Rediseñar sección de avisos con feed enterprise |
| `src/components/dashboard/AnnouncementBanner.tsx` | **Nuevo** — banner temporal |
| `src/components/dashboard/AnnouncementPopup.tsx` | **Nuevo** — popup para anuncios críticos |
| `src/components/dashboard/AnnouncementFeedCard.tsx` | **Nuevo** — tarjeta de anuncio en el feed |
| `src/components/dashboard/AnnouncementPublicDetail.tsx` | **Nuevo** — modal de detalle público |
| `src/pages/hr/announcements/useAnnouncementsAdmin.ts` | Agregar envío de notificaciones al crear/activar |
| `src/pages/Dashboard.tsx` | Montar Banner y Popup |

No se requieren cambios de base de datos — la Fase 1 ya creó todas las tablas y columnas necesarias.

