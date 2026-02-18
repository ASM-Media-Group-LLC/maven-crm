

## Implementacion completa: Categorización por Proyecto y Agenda Compartida en Eventos

### Alcance

Implementar las dos funcionalidades pendientes solicitadas para el modulo de Eventos:
1. Categorización por tipo de proyecto (Ora, Kash, Trafix, Unlok)
2. Agenda compartida publica accesible mediante token

---

### Parte 1: Categorización por Proyecto

#### 1.1 Migracion de base de datos
- Agregar columna `project_type TEXT` a la tabla `events` con valores permitidos: `'Ora'`, `'Kash'`, `'Trafix'`, `'Unlok'`
- Columna nullable para no romper eventos existentes

#### 1.2 Tipos de Supabase (`src/integrations/supabase/types.ts`)
- Agregar `project_type` al tipo `events` en Row, Insert y Update

#### 1.3 Hook `useEventos.ts`
- Agregar `project_type` a la interfaz `EventRow`
- Agregar filtro `projectType` a `EventoFilters`
- Aplicar filtrado client-side por `project_type`

#### 1.4 Tab Bar de proyectos en `EventosContent.tsx`
- Agregar un segundo Tab Bar (encima del de estados) con las opciones: Todos, Ora, Kash, Trafix, Unlok
- Mismo estilo que el tab de estados existente (`inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1`)
- Filtrar eventos por `project_type` seleccionado

#### 1.5 Campo en formulario `NuevoEventoForm.tsx`
- Agregar un Select "Proyecto *" (obligatorio) debajo del tipo de evento
- Opciones: Ora, Kash, Trafix, Unlok
- Incluir en `formData` del submit

#### 1.6 Columna en `EventosTable.tsx`
- Agregar columna "Proyecto" con Badge coloreado entre "Tipo" y "Fecha"
- Sortable como las demas columnas
- Colores diferenciados por proyecto (ej: Ora=blue, Kash=purple, Trafix=amber, Unlok=emerald)

#### 1.7 Badge en `EventosGrid.tsx`
- Mostrar badge de proyecto en las tarjetas del grid

---

### Parte 2: Agenda Compartida Publica

#### 2.1 Tabla de tokens de agenda
- Crear tabla `agenda_share_tokens` con columnas: `id`, `token` (uuid, unique), `created_by`, `created_at`, `expires_at`
- RLS: authenticated puede insertar/seleccionar sus propios tokens; anon no accede directamente

#### 2.2 Funcion RPC `get_agenda_by_share_token`
- Funcion con `SECURITY DEFINER` que recibe un token UUID
- Valida que el token existe y no ha expirado
- Retorna los eventos futuros (proximos 30 dias) con sus invitados y datos de creadoras (nombre, artistic_name, profile_photo_url, instagram)
- Accesible por `anon` role

#### 2.3 Ruta publica `/shared/agenda/:token`
- Nueva pagina en `src/pages/eventos/SharedAgendaPage.tsx`
- Sin autenticacion requerida (fuera de ProtectedRoute)
- Llama a `get_agenda_by_share_token` con el token de la URL

#### 2.4 Interfaz de la agenda publica
La pagina muestra:
- **Calendario mensual** con indicadores en dias con eventos
- **Tarjetas de proximos eventos** con hora, badges de proyecto y tipo
- **Listado diario** al seleccionar un dia: hora, nombre, badges, lista de invitados con handles de Instagram y fotos de perfil
- Diseno de alta fidelidad, solo lectura

#### 2.5 Boton para generar/compartir enlace de agenda
- En `EventosContent.tsx`, agregar boton "Compartir Agenda" en el header
- Al hacer click: genera un token en `agenda_share_tokens`, muestra modal con el enlace copiable
- Si ya existe un token activo, reutilizarlo

#### 2.6 Registro de ruta en `App.tsx`
- Agregar ruta publica `/shared/agenda/:token` apuntando a `SharedAgendaPage`

---

### Seccion tecnica

**Archivos nuevos:**
- Migracion SQL para `project_type` y `agenda_share_tokens`
- Migracion SQL para funcion RPC `get_agenda_by_share_token`
- `src/pages/eventos/SharedAgendaPage.tsx` - pagina publica completa

**Archivos a modificar:**
- `src/integrations/supabase/types.ts` - agregar `project_type` a events
- `src/pages/eventos/useEventos.ts` - agregar campo y filtro
- `src/pages/eventos/EventosContent.tsx` - Tab Bar de proyectos + boton compartir agenda
- `src/pages/eventos/NuevoEventoForm.tsx` - campo Select de proyecto
- `src/pages/eventos/EventosTable.tsx` - columna Proyecto con badge
- `src/pages/eventos/EventosGrid.tsx` - badge de proyecto en tarjetas
- `src/App.tsx` - ruta publica `/shared/agenda/:token`

**Colores de proyecto:**
```text
Ora     -> blue (bg-blue-500/15, text-blue-600)
Kash    -> purple (bg-purple-500/15, text-purple-600)
Trafix  -> amber (bg-amber-500/15, text-amber-600)
Unlok   -> emerald (bg-emerald-500/15, text-emerald-600)
```

**Estructura de la funcion RPC:**
```text
get_agenda_by_share_token(p_token UUID)
  RETURNS TABLE(id, name, event_type, project_type, date, start_time, end_time, location, guests JSONB)
  SECURITY DEFINER
  - Valida token en agenda_share_tokens (no expirado)
  - Retorna eventos con date >= CURRENT_DATE ordenados por date, start_time
  - Guests como JSON array con nombre, artistic_name, profile_photo_url
```

