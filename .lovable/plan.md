

## Reestructuracion de Capacitacion: Modelo Horarios y Turnos

Se rediseñara el modulo de Capacitacion siguiendo el mismo patron que Horarios y Turnos, donde Chatters y Tecnologia son **sub-paginas independientes** (como Horas Extras y Banco de Horas) accesibles mediante Navigation Cards. La pagina principal se simplifica como vista general de todas las asignaciones.

---

### Arquitectura de Navegacion

La pagina principal `/hr/capacitacion` tendra:

```text
Header: "Capacitacion" + subtitulo + botones "Configuracion" (outline) y "+ Asignar" (default)

KPI Cards (4):
  - Total Asignadas | En Progreso | Completadas | Vencidas

Navigation Cards (2, igual que Horarios):
  - "Capacitacion Chatters" -> /hr/capacitacion/chatters
    Subtitulo: "Programas, contenidos y seguimiento para chatters"
  - "Capacitacion Tecnologia" -> /hr/capacitacion/tecnologia
    Subtitulo: "Programas, contenidos y seguimiento del equipo tech"

Filtros: Buscador + Select estado (sin "Todos" por default) + Select departamento + DateRangePicker + Toggle vista (lista/grid/calendario)

Tabla/Grid/Calendario de TODAS las asignaciones
```

Las dos sub-paginas seran paginas completas (con HRLayout) dedicadas a gestionar los programas, modulos, contenidos y asignaciones especificos de cada rol.

---

### Sub-pagina: Capacitacion Chatters (`/hr/capacitacion/chatters`)

Pagina independiente con header ArrowLeft + "Capacitacion Chatters". Internamente maneja sus propias vistas:

```text
Vistas internas (estado local):
  'list'    -> Dashboard con programas de chatters + asignaciones filtradas
  'config'  -> Crear/editar programas (pre-filtrado target_role='chatter')
  'modules' -> Modulos de un programa especifico
  'assign'  -> Asignar programa de chatter a empleado
  'detail'  -> Detalle de asignacion con tracking por modulo
```

Contenido de la vista 'list':
- KPIs filtrados solo para asignaciones de chatters
- Seccion de programas disponibles (cards con nombre, duracion, modulos, badge obligatorio, boton Modulos/Editar/Eliminar)
- Tabla de asignaciones filtrada automaticamente por `target_role = 'chatter'`
- Filtros: buscador, estado, toggle vista

---

### Sub-pagina: Capacitacion Tecnologia (`/hr/capacitacion/tecnologia`)

Identica estructura que Chatters pero filtrada por `target_role = 'technology'`. Se reutilizara un componente `RoleTrainingPage` que recibe el `targetRole` como prop.

---

### Vista de Calendario (nueva)

En la vista principal y en las sub-paginas, se agrega una tercera opcion de visualizacion: Calendario mensual. Muestra las asignaciones segun su `start_date` y `completion_date` en una rejilla mensual, similar al calendario de Horarios. Cada dia muestra badges con las asignaciones activas.

---

### Mejoras UX adicionales

1. **Select de estado sin "Todos" por default**: El select de estado arranca vacio (placeholder "Estado") y las opciones incluyen "Todos los estados" como primera opcion seleccionable, pero no es el default.

2. **DateRangePicker**: Se agrega un selector de rango de fechas para filtrar asignaciones por fecha de inicio. Usa el componente `DateRangePicker` existente con placeholder "Selecciona fechas".

3. **KPIs clickeables**: Al hacer clic en un KPI, se aplica el filtro correspondiente (ej: clic en "En Progreso" filtra por status in_progress).

4. **Indicador de contenido subido**: En las cards de programas, mostrar un indicador visual de cuantos modulos tienen contenido subido vs total (ej: "3/5 con contenido").

5. **Badge de vencimiento proximo**: En la tabla, resaltar asignaciones cuya fecha limite esta a menos de 7 dias con un badge naranja "Por vencer".

---

### Rutas nuevas

| Ruta | Componente | Descripcion |
|---|---|---|
| `/hr/capacitacion` | `HRTraining` | Vista general (simplificada, sin tabs de Chatters/Tech) |
| `/hr/capacitacion/chatters` | `HRTrainingChatters` | Sub-pagina dedicada a chatters |
| `/hr/capacitacion/tecnologia` | `HRTrainingTech` | Sub-pagina dedicada a tecnologia |

---

### Archivos a crear/modificar

| Archivo | Cambio |
|---|---|
| `src/pages/hr/HRTraining.tsx` | Simplificar: quitar tabs Chatters/Tecnologia, agregar Navigation Cards, agregar vista calendario, DateRangePicker, KPIs clickeables, badge "Por vencer", fix default del select de estado |
| `src/pages/hr/HRTrainingChatters.tsx` | **NUEVO** - Sub-pagina dedicada para chatters con gestion completa de programas, modulos, contenidos y asignaciones |
| `src/pages/hr/HRTrainingTech.tsx` | **NUEVO** - Sub-pagina dedicada para tecnologia (wrapper de componente reutilizable) |
| `src/App.tsx` | Agregar rutas `/hr/capacitacion/chatters` y `/hr/capacitacion/tecnologia` con HRLayout |

---

### Detalle tecnico

**Componente reutilizable `RoleTrainingPage`**: Se creara un componente interno (dentro de HRTrainingChatters.tsx o como componente separado) que recibe `targetRole`, `roleLabel`, `roleIcon` como props. Tanto HRTrainingChatters como HRTrainingTech lo usan con sus respectivos valores. Este componente contiene toda la logica de vistas internas (list, config, modules, assign, detail) ya existente pero scoped al rol.

**Vista Calendario**: Reutiliza el patron de HRSchedules. Muestra un grid mensual donde cada celda contiene las asignaciones cuyo rango start_date - completion_date incluye ese dia. Las asignaciones se muestran como badges coloreados por estado.

**Filtro de estado sin default**: Se cambia `useState("all")` por `useState("")` y en el filtrado se verifica `if (statusFilter && statusFilter !== "all")`. El placeholder del Select muestra "Estado".

**DateRangePicker**: Filtra asignaciones donde `start_date` esta dentro del rango seleccionado. Se integra al lado del select de departamento.

**KPIs clickeables**: Cada HRMetricCard recibe un `onClick` que setea el `statusFilter` correspondiente (ej: "in_progress" para "En Progreso").

