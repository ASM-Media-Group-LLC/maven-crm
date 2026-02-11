

# Extension del Modulo de Eventos

## Resumen

Ampliar el modulo de eventos existente con: rastreo de asistencia con historial, checklist logistico, sistema de doble enlace (interno + sharelink externo), invitaciones extendidas con email/telefono/motivo de cancelacion, y metricas del evento. Todo sin redisenar lo que ya funciona.

---

## Fase 1: Esquema de Base de Datos

### 1.1 Extender tabla `event_guests`

Agregar columnas a la tabla existente:

- `email` (text, nullable) - email del invitado
- `phone` (text, nullable) - telefono del invitado
- `cancellation_reason` (text, nullable) - motivo de cancelacion
- `status_updated_at` (timestamptz, default now()) - ultimo cambio de estado
- `status_changed_by` (text, nullable) - quien cambio el estado ("internal" o "external")

Agregar constraint unique para evitar duplicados: `UNIQUE(event_id, creator_id)` donde creator_id no es null, y `UNIQUE(event_id, guest_name, guest_type)` donde creator_id es null.

Ampliar los estados de guest a: `pending`, `confirmed`, `cancelled`, `attended`, `no_show` (reemplazando `rejected` y `no_response` con los nuevos).

### 1.2 Nueva tabla `event_attendance_log`

Registra cada cambio de estado de un invitado:

- `id` (uuid, PK)
- `event_guest_id` (uuid, FK a event_guests)
- `event_id` (uuid, FK a events)
- `old_status` (text, nullable)
- `new_status` (text)
- `changed_by` (text) - "internal" o "external" o nombre de usuario
- `notes` (text, nullable)
- `created_at` (timestamptz, default now())

RLS: permitir acceso completo (mismo patron que event_guests actual).

### 1.3 Nueva tabla `event_checklist_items`

- `id` (uuid, PK)
- `event_id` (uuid, FK a events)
- `title` (text, not null)
- `status` (text, default 'pending') - pending, in_progress, completed
- `assigned_to` (text, nullable)
- `notes` (text, nullable)
- `updated_at` (timestamptz, default now())
- `created_at` (timestamptz, default now())

RLS: permitir acceso completo.

### 1.4 Extender tabla `events`

Agregar columnas:

- `internal_token` (text, unique, default gen_random_uuid()::text) - token para enlace interno
- `external_token` (text, unique, default gen_random_uuid()::text) - token para sharelink externo
- `external_link_expires_at` (timestamptz, nullable) - fecha de expiracion del sharelink

### 1.5 Trigger para log automatico

Crear un trigger en `event_guests` que al cambiar el campo `status`, inserte automaticamente un registro en `event_attendance_log` con el estado anterior y nuevo.

---

## Fase 2: Edge Function para Sharelink Externo

### 2.1 `event-external-action`

Edge function que maneja las acciones del sharelink sin requerir autenticacion:

- `GET /event-external-action?token=xxx` - Retorna info basica del evento (nombre, fecha, hora, ubicacion) + lista de invitados con sus nombres (solo para que el invitado se identifique)
- `POST /event-external-action` con body `{ token, guest_id, action: "confirm" | "cancel", cancellation_reason? }` - Actualiza el estado del invitado y registra en el log

Validaciones:
- Token debe existir y no estar expirado
- Solo permite cambiar estado del invitado especificado
- No expone notas internas ni datos sensibles

---

## Fase 3: Frontend - Pagina de Detalle Interno del Evento

### 3.1 Nueva ruta `/eventos/:id`

Pagina completa de detalle del evento (reemplaza el modal ViewEventoModal como vista principal). Incluye:

**Header fijo**: Nombre del evento, tipo, estado, botones de editar/compartir/cerrar

**Contenido con tabs**:

- **Invitados**: Tabla completa con nombre, tipo, email/telefono, estado (con selector), motivo de cancelacion. Filtros por estado. Boton agregar invitados.
- **Checklist**: Lista de items con titulo, estado (pending/in_progress/completed), asignado, notas. CRUD inline.
- **Historial**: Log de todos los cambios de estado de invitados, con timestamps y quien hizo el cambio.
- **Metricas**: Cards con total invitados, confirmados, cancelados, asistieron, no asistieron, tasas porcentuales. Timeline de confirmaciones.
- **Enlaces**: Seccion para copiar enlace interno y sharelink externo. Opcion de configurar fecha de expiracion del sharelink.

### 3.2 Navegacion

- Click en un evento desde la tabla/grid navega a `/eventos/:id` en lugar de abrir modal
- El modal ViewEventoModal se mantiene como vista rapida (accesible desde el dropdown "Ver detalles rapido" si se desea)

### 3.3 Archivos nuevos

- `src/pages/eventos/EventoDetailPage.tsx` - Pagina principal de detalle
- `src/pages/eventos/detail/GuestsTab.tsx` - Tab de invitados
- `src/pages/eventos/detail/ChecklistTab.tsx` - Tab de checklist
- `src/pages/eventos/detail/HistoryTab.tsx` - Tab de historial
- `src/pages/eventos/detail/MetricsTab.tsx` - Tab de metricas
- `src/pages/eventos/detail/LinksTab.tsx` - Tab de enlaces
- `src/pages/EventoDetail.tsx` - Wrapper con sidebar/topbar

### 3.4 Hooks nuevos en `useEventos.ts`

- `useEventDetail(id)` - fetch de un evento individual con tokens
- `useEventChecklist(eventId)` - CRUD del checklist
- `useEventAttendanceLog(eventId)` - historial de cambios
- `useEventMetrics(eventId)` - metricas calculadas
- Extender `useUpdateGuestStatus` para incluir cancellation_reason y registrar en log

---

## Fase 4: Frontend - Sharelink Externo

### 4.1 Nueva ruta `/eventos/share/:token`

Pagina publica (sin sidebar, sin autenticacion) que muestra:

- Nombre del evento, fecha, hora, ubicacion
- Lista de invitados (solo nombres) para que el invitado se identifique
- Al seleccionar su nombre: botones para "Confirmar asistencia" o "Cancelar" (con campo de motivo)
- Mensaje de confirmacion/cancelacion exitosa
- Si el enlace esta expirado, muestra mensaje de error

### 4.2 Archivos nuevos

- `src/pages/eventos/EventoSharePage.tsx` - Pagina publica del sharelink

---

## Fase 5: Notificaciones internas

### 5.1 Registro de notificaciones

En esta primera iteracion, las "notificaciones" se registran como entradas en `event_attendance_log` con un campo indicando que fue un cambio relevante. No se implementa un sistema de notificaciones push ni email en esta fase (se puede extender despues).

Las notificaciones visibles seran los cambios reflejados en la tab de Historial de la pagina de detalle interna.

---

## Seccion Tecnica

### Migracion SQL

```sql
-- Extender event_guests
ALTER TABLE event_guests
  ADD COLUMN email text,
  ADD COLUMN phone text,
  ADD COLUMN cancellation_reason text,
  ADD COLUMN status_updated_at timestamptz DEFAULT now(),
  ADD COLUMN status_changed_by text;

-- Unique constraint para evitar duplicados
CREATE UNIQUE INDEX idx_event_guests_creator 
  ON event_guests(event_id, creator_id) WHERE creator_id IS NOT NULL;
CREATE UNIQUE INDEX idx_event_guests_external 
  ON event_guests(event_id, guest_name, guest_type) WHERE creator_id IS NULL;

-- Extender events
ALTER TABLE events
  ADD COLUMN internal_token text UNIQUE DEFAULT gen_random_uuid()::text,
  ADD COLUMN external_token text UNIQUE DEFAULT gen_random_uuid()::text,
  ADD COLUMN external_link_expires_at timestamptz;

-- Tabla de log de asistencia
CREATE TABLE event_attendance_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_guest_id uuid NOT NULL REFERENCES event_guests(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by text,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE event_attendance_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to event_attendance_log" 
  ON event_attendance_log FOR ALL USING (true) WITH CHECK (true);

-- Tabla de checklist
CREATE TABLE event_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  assigned_to text,
  notes text,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE event_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to event_checklist_items" 
  ON event_checklist_items FOR ALL USING (true) WITH CHECK (true);

-- Trigger para log automatico de cambios de estado
CREATE OR REPLACE FUNCTION log_guest_status_change()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO event_attendance_log (event_guest_id, event_id, old_status, new_status, changed_by)
    VALUES (NEW.id, NEW.event_id, OLD.status, NEW.status, NEW.status_changed_by);
    NEW.status_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guest_status_change
  BEFORE UPDATE ON event_guests
  FOR EACH ROW EXECUTE FUNCTION log_guest_status_change();
```

### Estructura de archivos nuevos

```text
src/pages/
  EventoDetail.tsx              (wrapper con sidebar)
  eventos/
    EventoDetailPage.tsx        (pagina de detalle)
    EventoSharePage.tsx         (sharelink publico)
    detail/
      GuestsTab.tsx
      ChecklistTab.tsx
      HistoryTab.tsx
      MetricsTab.tsx
      LinksTab.tsx

supabase/functions/
  event-external-action/
    index.ts
```

### Rutas nuevas en App.tsx

```text
/eventos/:id          -> EventoDetail (con sidebar, autenticado)
/eventos/share/:token -> EventoSharePage (sin sidebar, publico)
```

### Flujo del Sharelink Externo

```text
1. Usuario interno copia el sharelink desde la tab de Enlaces
2. Invitado abre el enlace en su navegador
3. La pagina llama al edge function con GET para obtener info del evento
4. Invitado selecciona su nombre de la lista
5. Invitado confirma o cancela su asistencia
6. Edge function actualiza el estado en event_guests
7. El trigger automaticamente registra el cambio en event_attendance_log
8. El equipo interno ve el cambio reflejado en tiempo real en la pagina de detalle
```

