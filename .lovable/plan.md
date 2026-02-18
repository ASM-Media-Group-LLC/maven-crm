

## Agregar Project Type Tabs + Agenda Compartida Externa

### Descripcion

Dos funcionalidades principales:

1. **Project Type (Ora, Kash, Trafix, Unlok)**: Agregar un campo `project_type` a la tabla `events`, un tab bar para filtrar eventos por proyecto, mostrarlo en la tabla/grid, y agregarlo al formulario de creacion/edicion.

2. **Agenda Compartida Externa**: Nueva pagina publica que muestra la agenda completa de eventos con calendario mensual, proximos eventos, y listado por dia -- exactamente como la imagen de referencia. Accesible via token unico, sin autenticacion.

---

### Parte 1: Project Type

#### 1.1 Migracion de base de datos

- Agregar columna `project_type text` a la tabla `events` (nullable, sin default)
- Valores posibles: `Ora`, `Kash`, `Trafix`, `Unlok`

#### 1.2 Cambios en `useEventos.ts`

- Agregar `project_type` al tipo `EventRow`
- Agregar campo `projectType` a `EventoFilters` y a `emptyFilters`
- Aplicar filtro en `applyFilters` cuando `projectType` no este vacio

#### 1.3 Cambios en `EventosContent.tsx`

- Agregar tab bar de proyectos (Todos, Ora, Kash, Trafix, Unlok) encima del calendario, usando el patron de tabs existente (`inline-flex items-center gap-1 rounded-lg border...`)
- Conectar la seleccion del tab al filtro `projectType`

#### 1.4 Cambios en `NuevoEventoForm.tsx`

- Agregar campo `project_type` (Select) al formulario, despues del tipo de evento
- Opciones: Ora, Kash, Trafix, Unlok
- Incluir `project_type` en `formData` al crear/editar

#### 1.5 Cambios en `EventosTable.tsx`

- Agregar columna "Proyecto" con badge del project_type (despues de "Tipo")
- Sortable

#### 1.6 Cambios en `EventosGrid.tsx`

- Mostrar badge de project_type en las tarjetas (similar a la imagen de referencia donde se ve "Kash" como badge)

#### 1.7 Calendario y Proximos Eventos

- En `EventosCalendar.tsx`, mostrar badge de project_type en las tarjetas de proximos eventos

---

### Parte 2: Agenda Compartida Externa

Basado en la imagen de referencia, la pagina publica incluye:

#### 2.1 Tabla `agenda_share_tokens`

Nueva tabla para gestionar tokens de agenda compartida:
- `id uuid PK`
- `token text UNIQUE NOT NULL DEFAULT gen_random_uuid()`
- `project_type text` (null = todos los proyectos)
- `created_by uuid`
- `created_at timestamptz`
- `expires_at timestamptz` (nullable)
- RLS permisiva (similar a events)

#### 2.2 Funcion RPC `get_agenda_by_share_token`

Funcion `SECURITY DEFINER` que recibe un token y devuelve los eventos futuros (con sus invitados) correspondientes al project_type del token. Si `project_type` es null, devuelve todos.

#### 2.3 Nueva pagina `AgendaSharePage.tsx`

Pagina publica en ruta `/shared/agenda/:token` que replica la interfaz de la imagen:

- **Header**: "Maven CRM" + buscador + toggle de tema
- **Tab bar**: Todos, Ora, Kash, Trafix, Unlok (filtra localmente)
- **Calendario mensual**: Navegacion mes/semana, indicadores de puntos en dias con eventos, botones Hoy/Mes/Semana
- **Proximos Eventos**: Tarjetas horizontales con nombre, fecha, hora, ubicacion y badge de proyecto
- **Listado por dia**: Agrupado por fecha (ej: "VIERNES 20 FEB - 1 evento"), cada evento con:
  - Hora a la izquierda
  - Tarjeta con badges (tipo, proyecto, status)
  - Nombre, ubicacion, descripcion
  - Lista de invitados pendientes con avatar y handle de Instagram
- **Footer**: "Maven CRM - Kash Agency"

#### 2.4 Boton "Compartir Agenda" en `EventosContent.tsx`

- Nuevo boton en el header al lado de "Crear Evento"
- Al hacer click, genera un token (insert en `agenda_share_tokens`) y copia el link al portapapeles

#### 2.5 Ruta en `App.tsx`

- Agregar ruta publica `/shared/agenda/:token`

---

### Seccion tecnica

**Migracion SQL:**
```sql
ALTER TABLE events ADD COLUMN project_type text;

CREATE TABLE agenda_share_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  project_type text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);
ALTER TABLE agenda_share_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to agenda_share_tokens" ON agenda_share_tokens FOR ALL USING (true) WITH CHECK (true);
```

**Funcion RPC:**
```sql
CREATE OR REPLACE FUNCTION get_agenda_by_share_token(_token text)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _project_type text;
  _expires_at timestamptz;
  result json;
BEGIN
  SELECT project_type, expires_at INTO _project_type, _expires_at
  FROM agenda_share_tokens WHERE token = _token;
  
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Token not found');
  END IF;
  
  IF _expires_at IS NOT NULL AND _expires_at < now() THEN
    RETURN json_build_object('error', 'Token expired');
  END IF;
  
  SELECT json_agg(row_to_json(e))
  INTO result
  FROM (
    SELECT ev.*, 
      (SELECT json_agg(json_build_object(
        'id', g.id, 'guest_name', g.guest_name, 'guest_type', g.guest_type, 
        'status', g.status, 'creator_id', g.creator_id,
        'creator_name', c.name, 'creator_artistic_name', c.artistic_name,
        'creator_instagram', c.instagram_handle, 'creator_photo', c.profile_photo_url
      )) FROM event_guests g LEFT JOIN creators c ON g.creator_id = c.id WHERE g.event_id = ev.id) as guests
    FROM events ev
    WHERE ev.date >= CURRENT_DATE
    AND (_project_type IS NULL OR ev.project_type = _project_type)
    ORDER BY ev.date, ev.start_time
  ) e;
  
  RETURN json_build_object('events', COALESCE(result, '[]'::json), 'project_type', _project_type);
END;
$$;
```

**Archivos a modificar:**
- `src/pages/eventos/useEventos.ts` - agregar `project_type` al tipo y filtros
- `src/pages/eventos/EventosContent.tsx` - agregar tab bar de proyectos
- `src/pages/eventos/NuevoEventoForm.tsx` - agregar campo project_type
- `src/pages/eventos/EventosTable.tsx` - agregar columna Proyecto
- `src/pages/eventos/EventosGrid.tsx` - agregar badge proyecto
- `src/pages/eventos/EventosCalendar.tsx` - agregar badge en proximos eventos

**Archivos nuevos:**
- `src/pages/eventos/AgendaSharePage.tsx` - pagina publica completa
- `src/App.tsx` - agregar ruta publica

