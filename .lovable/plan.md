

## Plan: Rediseño Completo de Configuración de Notificaciones

### Resumen

Transformar la página actual (una lista plana de toggles por módulo) en un centro de configuración con 6 secciones navegables por tabs verticales, persistencia en base de datos, y respeto del sistema RBAC existente.

---

### 1. Migración de Base de Datos

Ampliar la tabla `notification_preferences` con columnas para las nuevas funcionalidades:

| Columna | Tipo | Default | Descripción |
|---|---|---|---|
| `channel_push` | boolean | false | Canal push (futuro) |
| `channel_digest` | boolean | false | Canal resumen periódico |
| `delivery_mode` | text | 'all' | 'all', 'popup', 'banner', 'center_only' |

Crear tabla `notification_settings` (preferencias generales por usuario, 1 fila por usuario):

```text
notification_settings
├── id (uuid, pk)
├── user_id (uuid, fk → auth.users, unique)
├── notifications_enabled (boolean, default true)
├── realtime_enabled (boolean, default true)
├── group_similar (boolean, default false)
├── auto_mark_read_on_open (boolean, default false)
├── sound_enabled (boolean, default false)
├── show_critical_banners (boolean, default true)
├── dnd_enabled (boolean, default false)
├── dnd_start_time (time, nullable)
├── dnd_end_time (time, nullable)
├── dnd_allow_critical (boolean, default true)
├── digest_enabled (boolean, default false)
├── digest_frequency (text, default 'daily') -- 'daily', 'weekly', 'per_module'
├── digest_time (time, default '09:00')
├── digest_channel (text, default 'in_app') -- 'in_app', 'email'
├── created_at (timestamptz)
├── updated_at (timestamptz)
```

RLS: cada usuario solo lee/escribe su propia fila.

---

### 2. Arquitectura UI -- Tabs Verticales

Reemplazar el contenido actual por un layout con sidebar de tabs a la izquierda y contenido a la derecha:

```text
┌──────────────────────────────────────────────┐
│ Configuración de Notificaciones              │
├────────────┬─────────────────────────────────┤
│ General    │  [Contenido de la tab activa]   │
│ Canales    │                                 │
│ Eventos    │                                 │
│ Prioridad  │                                 │
│ Resúmenes  │                                 │
│ No Molestar│                                 │
└────────────┴─────────────────────────────────┘
```

En mobile: tabs horizontales scrollables arriba.

### 3. Contenido de cada Tab

**General**: 6 switches con label y descripción (notifications_enabled, realtime, group_similar, auto_mark_read, sound, critical_banners). Leídos/escritos desde `notification_settings`.

**Canales**: Tabla con canales como filas (In-app, Email, Push, Digest) y estado (activo/próximamente). In-app siempre activo. Email y Push con badges "Próximamente". Digest enlaza a la tab Resúmenes.

**Eventos por Módulo**: La vista actual mejorada. Para cada módulo accesible (filtrado por RBAC), mostrar los tipos de notificación con toggles por canal (In-app, Email, Push). Usar los campos `channel_in_app`, `channel_email`, `channel_push` de `notification_preferences`. Los canales no disponibles muestran badge "Próximamente".

**Prioridad**: Configurar comportamiento por nivel de prioridad (Crítica, Importante, Informativa). Cada nivel tiene opciones: mostrar popup, mostrar banner, solo notification center. Usa el campo `delivery_mode` mapeado por prioridad.

**Resúmenes**: Configurar digest: activar/desactivar, frecuencia (diario/semanal/por módulo), hora de entrega, canal de entrega. Leído desde `notification_settings`.

**No Molestar**: Activar/desactivar DND, configurar horario (start/end time inputs), permitir excepciones para críticas. Leído desde `notification_settings`.

### 4. Hook `useNotificationSettings`

Nuevo hook para CRUD de la tabla `notification_settings`:
- Query que trae la fila del usuario (o retorna defaults si no existe)
- Mutation upsert para actualizar cualquier campo
- Usado por las tabs General, Resúmenes y No Molestar

### 5. Archivos a crear/modificar

| Archivo | Acción |
|---|---|
| Migration SQL | Alter `notification_preferences` + crear `notification_settings` + RLS |
| `src/hooks/useNotificationSettings.ts` | **Nuevo** -- CRUD para `notification_settings` |
| `src/hooks/useNotificationPreferences.ts` | Ampliar para `channel_push`, `channel_digest`, `delivery_mode` |
| `src/pages/ajustes/NotificacionesSettings.tsx` | Reescribir con layout de tabs verticales |
| `src/pages/ajustes/notificaciones/GeneralTab.tsx` | **Nuevo** |
| `src/pages/ajustes/notificaciones/CanalesTab.tsx` | **Nuevo** |
| `src/pages/ajustes/notificaciones/EventosTab.tsx` | **Nuevo** (lógica actual de módulos movida aquí) |
| `src/pages/ajustes/notificaciones/PrioridadTab.tsx` | **Nuevo** |
| `src/pages/ajustes/notificaciones/ResumenesTab.tsx` | **Nuevo** |
| `src/pages/ajustes/notificaciones/NoMolestarTab.tsx` | **Nuevo** |

### 6. Notas técnicas

- Las preferencias generales (`notification_settings`) se aplican globalmente: si `notifications_enabled = false`, el sistema no muestra ninguna notificación (filtro en `useNotifications`)
- DND se evalúa client-side comparando hora actual con `dnd_start_time`/`dnd_end_time` (preparado para futura evaluación server-side)
- Digest y Push son preparatorios: la UI existe pero los canales muestran "Próximamente" hasta que se implementen las integraciones
- Todo filtrado por RBAC: solo aparecen módulos a los que el usuario tiene acceso via `canAccess()`

