

## Corregir visibilidad de controles en Eventos + Redisenar Agenda Compartida

### Problema 1: Tab Bar de proyectos y boton "Compartir Agenda"

El codigo ya incluye ambos elementos (lineas 98-134 de EventosContent.tsx). Si no se ven, puede deberse a que la preview no ha recargado los cambios mas recientes. Se verificara que el codigo esta correcto y se asegurara que ambos controles sean visibles.

### Problema 2: Redisenar SharedAgendaPage segun la imagen de referencia

La pagina actual es funcional pero muy basica. Se rediseñara completamente para replicar el diseño de alta fidelidad de la imagen de referencia.

---

### Cambios en `src/pages/eventos/EventosContent.tsx`

Verificar que los controles existen y son visibles. El codigo actual ya los tiene:
- Boton "Compartir Agenda" en el header (linea 99)
- Tab Bar de proyectos (lineas 122-134)

Si hay algun problema de renderizado, se ajustara.

---

### Rediseno completo de `src/pages/eventos/SharedAgendaPage.tsx`

La pagina se rediseñara desde cero para coincidir con la imagen de referencia:

#### Header
- Logo "Maven CRM" a la izquierda
- Buscador de eventos centrado con icono de busqueda y placeholder "Buscar eventos..."
- Toggle de tema claro/oscuro (Sun/Moon) a la derecha

#### Barra de filtros por proyecto
- Tab Bar con: Todos, Ora, Kash, Trafix, Unlok
- Estilo redondeado con borde, variante secondary/ghost segun seleccion
- Filtra los eventos mostrados por project_type

#### Calendario mensual completo
- Card con controles: boton "Hoy", navegacion mes anterior/siguiente, nombre del mes capitalizado
- Toggle Mes/Semana (solo visual por ahora, funcional en Mes)
- Grid 7 columnas con dias de la semana (Su, Mo, Tu, We, Th, Fr, Sa)
- Dia actual resaltado con fondo primary (circulo purpura)
- Dias con eventos marcados con punto indicador debajo del numero
- Click en dia filtra los eventos del listado inferior

#### Seccion "Proximos Eventos"
- Titulo con icono de calendario
- Tarjetas horizontales scrollables mostrando:
  - Nombre del evento
  - Badge de proyecto (coloreado: Kash purpura, Ora azul, etc.)
  - Fecha y hora formateada (ej: "vie 20 feb - 03:00 PM")
  - Ubicacion con icono MapPin

#### Listado diario detallado
- Header con dia de la semana en mayuscula, numero grande + mes, conteo de eventos
- Hora del evento a la izquierda
- Tarjeta de evento con:
  - Badges de tipo (Podcast, Shooting, etc.) y proyecto (Kash, Ora, etc.) y status (Upcoming, etc.)
  - Nombre del evento en negrita
  - Ubicacion con icono
  - Descripcion del evento (si tiene)
  - Links de Instagram (si los hay en la descripcion)
  - Seccion de invitados con conteo "Pendientes (N)"
  - Grid de invitados con Avatar, nombre y handle de Instagram con icono

#### Footer
- Texto centrado "Maven CRM - Kash Agency"
- Color muted

#### Funcionalidades
- Buscador: filtra eventos por nombre o ubicacion
- Filtro de proyecto: Tab Bar filtra por project_type
- Calendario interactivo: click en dia muestra eventos de ese dia
- Tema claro/oscuro: toggle funcional usando next-themes
- Responsive: funciona en desktop y mobile

---

### Seccion tecnica

**Archivo a modificar:**
- `src/pages/eventos/SharedAgendaPage.tsx` - rediseno completo

**Dependencias existentes utilizadas:**
- `date-fns` y `date-fns/locale/es` para formateo
- `next-themes` para toggle de tema
- `lucide-react` para iconos (Sun, Moon, Search, MapPin, Clock, CalendarDays, ChevronLeft, ChevronRight, Users)
- Componentes UI: Card, Button, Avatar, Badge, Input

**Estado del componente:**
- `currentMonth` - mes visible en el calendario
- `selectedDate` - dia seleccionado (null = mostrar proximos)
- `searchQuery` - texto del buscador
- `projectFilter` - filtro de proyecto activo ("" = todos)

**No se requieren cambios en backend** - la funcion RPC `get_agenda_by_share_token` ya devuelve todos los datos necesarios (project_type, event_type, status, guests con instagram_handle y profile_photo_url).
