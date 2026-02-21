

## Reestructuracion de Incidentes Laborales

### Problemas detectados en la pagina actual

1. **Header**: Usa `HRPageHeader` con icono en caja (patron prohibido). Debe usar `text-xl font-semibold` sin caja de icono.
2. **Boton CTA**: Dice "Nuevo Incidente", debe decir **"Reportar Incidente"**.
3. **Creacion por Dialog**: Actualmente usa un modal simple. Debe ser una **pagina dedicada con stepper de 4 pasos** (como en la imagen de referencia y como `EmployeeNew.tsx`).
4. **Filtros**: Usan `value="all"` con texto "Todas/Todos". Deben usar placeholder con el nombre de la categoria (Severidad, Estado) y estado inicial vacio.
5. **Sin KPIs**: No hay tarjetas de resumen. Se agregaran KPIs con hover effects.
6. **Sin acciones en tabla**: Faltan botones de Ver, Editar y Eliminar (patron estandarizado en HR).
7. **DB**: Faltan columnas para soportar los nuevos campos del stepper (categoria, impacto, comentarios internos).

---

### 1. Migracion de Base de Datos

Agregar columnas a `employee_incidents` para soportar el flujo de 4 pasos:

| Columna | Tipo | Descripcion |
|---|---|---|
| `category` | text | Categoria del incidente (Paso 1) |
| `impact` | text | Nivel de impacto - evaluacion RRHH (Paso 2) |
| `internal_notes` | text | Comentarios internos solo RRHH (Paso 3) |
| `follow_up_date` | date | Fecha de seguimiento (Paso 4) |
| `follow_up_responsible` | uuid | Responsable del seguimiento (Paso 4) |
| `follow_up_notes` | text | Notas de seguimiento (Paso 4) |

Nuevas constantes en `hrConstants.ts`:

```text
INCIDENT_CATEGORIES: Leve, Moderada, Grave, Muy Grave
INCIDENT_IMPACTS: Bajo, Medio, Alto, Critico
```

---

### 2. Pagina de listado: `HRIncidents.tsx` (refactorizar)

- **Header**: Titulo "Incidentes Laborales" con subtitulo dinamico, sin icono en caja.
- **CTA**: "Reportar Incidente" que navega a `/hr/incidentes/nuevo`.
- **KPI Cards** (4): Total Incidentes, Abiertos, En Proceso, Criticos. Con hover effects premium.
- **Filtros**: Severidad y Estado con placeholders (no "Todos"), boton "Limpiar filtros" condicional.
- **Tabla**: Agregar columna "Acciones" con botones Eye (ver modal), Pencil (editar modal) y Trash2 (eliminar con AlertDialog).
- Eliminar el Dialog de creacion.

---

### 3. Nueva pagina stepper: `HRIncidentNew.tsx`

Pagina dedicada con layout fijo (header + stepper + contenido scrollable + footer), siguiendo el patron de `EmployeeNew.tsx`.

**Estructura del stepper (4 pasos):**

**Paso 1 - Clasificacion**
- Empleado (EmployeeSearchCombobox, requerido)
- Tipo de Incidente (Select, requerido)
- Categoria (Select: Leve/Moderada/Grave/Muy Grave, requerido)
- Fecha del Incidente (DateInput, requerido)

**Paso 2 - Evaluacion Interna RRHH**
- Severidad (Select: Baja/Media/Alta/Critica, requerido)
- Impacto (Select: Bajo/Medio/Alto/Critico, requerido)

**Paso 3 - Detalle del Incidente**
- Titulo (Input, requerido, min 5, max 100 caracteres con contador)
- Descripcion (Textarea, requerido, min 10, max 2000 caracteres con contador)
- Evidencias (zona de drop visual, opcional - UI only, no upload real por ahora)
- Comentarios internos solo RRHH (Textarea, opcional)

**Paso 4 - Seguimiento**
- Accion Correctiva (Textarea, requerido)
- Fecha de Seguimiento (DateInput, opcional)
- Responsable del Seguimiento (EmployeeSearchCombobox, opcional)
- Notas de Seguimiento (Textarea, opcional)

**Header de la pagina:**
- Breadcrumb: Empleados > Gestion de Empleados > Seguimiento y Control > Reportar Incidente
- Boton ArrowLeft "Volver a Incidentes"
- Titulo "Reportar Incidente" / subtitulo "Registra un nuevo incidente siguiendo el flujo de 4 pasos"

**Footer fijo:**
- Izquierda: Cancelar (paso 1) / Atras (pasos 2-4)
- Derecha: Siguiente (pasos 1-3) / Registrar Incidente (paso 4)

**Stepper visual:** Gradiente `from-accent to-primary`, iconos por paso (ClipboardList, Shield, FileText, Settings), barra de progreso, halo en paso activo, check en completados.

---

### 4. Ruta y navegacion

- **`App.tsx`**: Agregar ruta `/hr/incidentes/nuevo` con `HRLayout` + `ProtectedRoute`, importando `HRIncidentNew`.
- **Sidebar**: Sin cambios (ya esta en Seguimiento).

---

### Archivos a modificar/crear

| Archivo | Cambio |
|---|---|
| **DB Migration** | Agregar 6 columnas a `employee_incidents` |
| `src/lib/hrConstants.ts` | Agregar `INCIDENT_CATEGORIES` e `INCIDENT_IMPACTS` |
| `src/pages/hr/HRIncidents.tsx` | Refactorizar: quitar Dialog, agregar KPIs, arreglar filtros, agregar acciones en tabla |
| `src/pages/hr/HRIncidentNew.tsx` | **Nuevo** - Stepper de 4 pasos para reportar incidente |
| `src/App.tsx` | Agregar ruta `/hr/incidentes/nuevo` |
