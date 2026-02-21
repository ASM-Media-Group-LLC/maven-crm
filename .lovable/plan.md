

## Mejora del Modulo de Capacitacion: Gestion Completa de Programas

El problema actual es que la pagina principal solo muestra asignaciones y redirige a sub-paginas para crear/gestionar programas. Se necesita que la vista general tambien permita crear, configurar y gestionar programas completos, dandole una sensacion de herramienta integral.

---

### Cambios en la Pagina Principal (`/hr/capacitacion`)

**Header actualizado**: Se agrega un boton "Configuracion" (outline) al lado de "Asignar Capacitacion" que lleva a una vista de gestion de TODOS los programas (sin filtro de rol).

**Nueva seccion "Programas Activos"**: Debajo de las Navigation Cards, se agrega una seccion con cards compactas mostrando TODOS los programas activos (de cualquier rol). Cada card muestra:
- Nombre del programa
- Badge del rol target (Chatters / Tecnologia / General)
- Duracion, cantidad de modulos
- Indicador de contenido subido (ej: "3/5 con contenido")
- Boton rapido para ver modulos

Esto da visibilidad inmediata de que programas existen en el sistema.

**Nuevas vistas internas**: Se agregan los estados `'config'` y `'modules'` al componente principal, permitiendo crear/editar programas y gestionar modulos directamente desde la pagina general (sin necesidad de ir a Chatters o Tecnologia primero).

---

### Flujo Completo Visible

El flujo de trabajo queda claro en la pagina principal:

```text
1. Crear Programa (Configuracion -> Nuevo Programa -> seleccionar rol target)
2. Agregar Modulos (dentro del programa -> definir titulo, tipo, duracion)
3. Subir Contenido (por modulo -> archivo o URL)
4. Asignar a Empleado (seleccionar programa + empleado + fecha)
5. Hacer Seguimiento (vista detalle con checkboxes por modulo)
```

---

### Detalle de Cambios

**`src/pages/hr/HRTraining.tsx`**:

1. Agregar `ViewState` ampliado: `'list' | 'assign' | 'config' | 'modules' | 'detail'`
2. Agregar estado `selectedProgram` para navegacion a modulos
3. En el header, agregar boton "Configuracion" que lleva a `currentView = 'config'`
4. Agregar seccion "Programas Activos" en el dashboard (entre Navigation Cards y Filtros), mostrando cards de TODOS los programas con badge de rol
5. Reutilizar los componentes `ProgramConfigView` y `ModuleManagementView` que ya existen en `RoleTrainingPage.tsx`, pero adaptados para manejar TODOS los roles (no filtrado por uno solo). Se crearan versiones "generales" de estos componentes dentro de HRTraining.tsx:
   - `GeneralProgramConfigView`: igual que `ProgramConfigView` pero sin filtro de `target_role`, muestra todos los programas y al crear uno se debe seleccionar el rol target
   - `GeneralModuleManagementView`: identico al existente (no necesita cambios ya que recibe el programa como prop)

**Formulario de Nuevo Programa (desde la vista general)**:
- Se agrega un campo "Rol Target" (Select con opciones: Chatters, Tecnologia, General, etc.) al formulario de creacion de programa, ya que desde la vista general se pueden crear programas para cualquier rol

**Seccion "Programas Activos" en el dashboard**:
- Query de TODOS los programas activos (sin filtro de rol)
- Grid de cards compactas (4 columnas)
- Cada card: nombre, badge de rol, duracion, modulos, indicador de contenido
- Clic en la card lleva a la vista de modulos del programa

---

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/hr/HRTraining.tsx` | Agregar boton "Configuracion", seccion de programas activos en el dashboard, vistas internas de config/modules con soporte multi-rol, formulario de programa con selector de rol target |

No se requieren cambios en la base de datos ni en RoleTrainingPage.tsx, ya que la estructura existente ya soporta multiples roles.

---

### Detalle tecnico

**ViewState ampliado:**
```text
type ViewState = "list" | "assign" | "config" | "modules" | "detail";
```

**Seccion de programas en el dashboard:** Se reutiliza el hook `useTrainingPrograms()` existente (que ya trae todos los programas activos) y se agrega un query de conteo de modulos por programa. Las cards muestran un Badge coloreado segun el `target_role`:
- `chatter` -> violeta
- `technology` -> cyan  
- otros -> gris

**Formulario de programa general:** Identico al de ProgramConfigView pero con un Select adicional de "Rol Target" que usa `TRAINING_TARGET_ROLES` de hrConstants. Al crear, el `target_role` se toma del formulario en lugar de estar hardcodeado.

**Reutilizacion de ModuleManagementView:** Como el componente ya recibe `program` como prop y no depende del rol, se puede usar directamente. Solo se importa la logica (se duplica el componente dentro de HRTraining.tsx para evitar dependencias circulares, siguiendo el patron actual donde ambos archivos tienen sus propias versiones de AssignmentDetailView y similares).

