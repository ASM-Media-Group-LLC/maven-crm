

## Rediseno Completo de Capacitacion por Puesto

Se rediseñara la pagina de Capacitacion para que coincida con el layout estandarizado del proyecto y las referencias visuales proporcionadas. La pagina tendra 3 tabs principales, vista de configuracion de programas con modulos, y un formulario de asignacion a pantalla completa.

---

### Estructura de Navegacion

La pagina principal tendra:
- **Header**: Titulo "Capacitacion por Puesto" con subtitulo "Programas de entrenamiento especializados por rol", botones "Configuracion" (outline) y "+ Asignar Capacitacion" (default)
- **4 KPI Cards**: Total Asignadas, En Progreso, Completadas, Vencidas
- **3 Tabs**: "Asignaciones", "Capacitacion Chatters", "Programas por Puesto"
- **Filtros**: Buscador + Select de estado + Toggle vista (lista/grid)

Vistas internas (sin ruta nueva, usando estado):
1. **Vista de Asignacion** (formulario pantalla completa con ArrowLeft)
2. **Vista de Configuracion de Programas** (listado de programas con ArrowLeft)
3. **Vista de Modulos de un Programa** (detalle del programa con sus modulos)

---

### Base de Datos

Se necesita una nueva tabla `training_modules` para almacenar los modulos/contenido de cada programa:

```text
training_modules
- id (uuid, PK)
- training_program_id (uuid, FK -> training_programs.id)
- title (text, NOT NULL)
- description (text)
- position (integer, default 0) -- orden del modulo
- duration_minutes (integer)
- content_type (text) -- video, documento, quiz, practica
- content_url (text) -- URL del contenido subido
- is_required (boolean, default true)
- created_at (timestamptz)
- updated_at (timestamptz)
```

Tambien se agrega el campo `target_role` a `training_programs` para clasificar programas por puesto (chatter, closer, leadgen, content, manager, technology, general).

---

### Tab "Asignaciones"

Tabla con columnas: Empleado (avatar + nombre + area), Programa, Supervisor, Fecha Inicio, Fecha Limite, Progreso (X/Y modulos con barra), Estado, Acciones (ver, editar, eliminar).

El progreso se calculara basandose en los modulos completados vs total de modulos del programa.

---

### Tab "Capacitacion Chatters"

Misma estructura que Asignaciones pero filtrada automaticamente para mostrar solo asignaciones donde el programa tiene `target_role = 'chatter'`. Los programas de chatters tendran contenido especifico diferente al resto.

---

### Tab "Programas por Puesto"

Lista de programas agrupados visualmente por rol/puesto. Cada programa muestra: icono, nombre, badge de rol, badge obligatorio/opcional, descripcion, duracion, cantidad de modulos, y botones de Modulos, Editar, Eliminar.

---

### Vista "Asignar Capacitacion" (pantalla completa)

Se activa al presionar "+ Asignar Capacitacion". Layout con ArrowLeft + "Volver a Capacitacion" en header. Formulario con:
- Empleado (EmployeeSearchCombobox)
- Programa de Capacitacion (Select filtrado)
- Fecha de Inicio (DateInput)
- Supervisor (opcional, EmployeeSearchCombobox)
- Notas adicionales (Textarea)
- Botones: Cancelar / Asignar Capacitacion

---

### Vista "Configuracion de Programas" (pantalla completa)

Se activa al presionar "Configuracion". Header con ArrowLeft + "Configuracion de Programas", buscador y boton "+ Nuevo Programa".

Lista de programas como cards con: icono segun rol, nombre, badge de rol, badge obligatorio, descripcion, duracion, cantidad de modulos, y botones: Modulos, Editar (lapiz), Eliminar (trash).

---

### Vista "Modulos de un Programa" (pantalla completa)

Se activa al presionar "Modulos" en un programa. Header con ArrowLeft + nombre del programa. Lista de modulos del programa con:
- Posicion/orden
- Titulo
- Tipo de contenido (video, documento, quiz)
- Duracion
- Boton para subir contenido (FileUploadModal o input file)
- Editar / Eliminar

Boton "+ Nuevo Modulo" para agregar modulos al programa.

---

### Archivos a modificar/crear

| Archivo | Cambio |
|---|---|
| `src/pages/hr/HRTraining.tsx` | Reescritura completa: layout estandarizado, KPIs, 3 tabs, vistas internas con estado, formulario de asignacion a pantalla completa, configuracion de programas, gestion de modulos |
| `src/lib/hrConstants.ts` | Agregar constantes `TRAINING_TARGET_ROLES` y `TRAINING_CONTENT_TYPES` |
| **Migracion SQL** | Crear tabla `training_modules`, agregar columna `target_role` a `training_programs` |

---

### Detalle tecnico

**Patron de vistas internas**: Se usara un estado `currentView` con valores como `'list'`, `'assign'`, `'config'`, `'modules'`. Segun el valor se renderiza la vista correspondiente. Cada vista interna tiene un ArrowLeft que vuelve a `'list'`.

```text
currentView:
  'list'    -> Vista principal (KPIs + Tabs + Tabla)
  'assign'  -> Formulario asignar capacitacion
  'config'  -> Configuracion de programas
  'modules' -> Modulos de un programa especifico (+ selectedProgram state)
```

**Filtrado de Chatters**: El tab "Capacitacion Chatters" filtra las asignaciones haciendo join con `training_programs` y verificando `target_role = 'chatter'`. Los programas de tecnologia se manejan de forma similar con `target_role = 'technology'`.

**Subida de contenido**: Se reutilizara el componente `FileUploadModal` existente o un input file directo para subir contenido a cada modulo (PDF, video, etc.) al storage de Supabase.

**Progreso real por modulos**: El progreso de cada asignacion se calculara como `modulos_completados / total_modulos * 100` en lugar del mapeo estatico actual basado en el estado.

