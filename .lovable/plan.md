

## Diferenciar Empleados Activos vs Directorio + Crear Organigrama

### Contexto del problema

Actualmente, "Empleados Activos" (en Employee Lifecycle, ruta `/hr/directorio`) y "Directorio" (en Organizacion) apuntan a la misma pagina. Son conceptos diferentes:

- **Empleados Activos**: Gestion del empleado dentro del lifecycle (filtros avanzados, cambio de estado, acciones de gestion, ficha 360)
- **Directorio**: Consulta rapida de datos basicos de contacto (solo lectura, sin acciones de gestion)
- **Organigrama**: Estructura organizacional con multiples vistas (Tabla, Arbol, Grid, Por Departamento)

### Cambios propuestos

---

### 1. Separar rutas y paginas

| Ruta | Pagina | Proposito |
|------|--------|-----------|
| `/hr/directorio` | `EmployeeDirectory.tsx` (actual) | **Empleados Activos** - gestion completa del lifecycle |
| `/hr/organizacion/directorio` | `HRDirectoryLookup.tsx` (nueva) | **Directorio** - consulta rapida solo lectura |
| `/hr/organizacion/organigrama` | `HROrganigrama.tsx` (nueva) | **Organigrama** - estructura organizacional |

### 2. Sidebar - Actualizar navegacion

En `DashboardSidebar.tsx`, cambiar el grupo "Organizacion":

- "Empleados Activos" en Employee Lifecycle mantiene su ruta `/hr/directorio` (sin cambios)
- "Organizacion" pasa a tener:
  - **Directorio** -> `/hr/organizacion/directorio`
  - **Organigrama** -> `/hr/organizacion/organigrama` (ya no estara deshabilitado)

### 3. Directorio de consulta (`HRDirectoryLookup.tsx`)

Pagina de solo lectura, liviana, para buscar datos basicos de cualquier empleado:

- **Header**: "Directorio", subtitulo "Consulta rapida de datos del equipo"
- **Busqueda global** prominente (nombre, email, telefono, cargo)
- **Filtro por departamento** (select)
- **Vista**: Tabla simple con columnas:
  - Avatar + Nombre completo
  - Cargo
  - Departamento (badge)
  - Email
  - Telefono / Movil
  - Ubicacion (ciudad, pais)
  - Modalidad
- **Sin acciones de gestion** (no editar, no cambiar estado, no eliminar)
- Click en un empleado navega a su ficha 360 en `/hr/empleado/:id` (solo lectura contextual)

### 4. Organigrama (`HROrganigrama.tsx`)

Pagina completa con estructura organizacional, inspirada en las imagenes de referencia:

**Header:**
- Titulo: "Organigrama"
- Subtitulo: "Estructura organizacional y jerarquias"
- Filtro de empresa (Select con "Todas las Empresas" por defecto, listando de la tabla `companies`)

**KPIs (4 cards):**
- Total Empleados (count de employees activos)
- Empresas (count de companies, o 1 si no hay registros)
- Departamentos (count de departments activos)
- Ubicaciones (count distinct de city de employees)

**Leyenda de empresas:** Badges de colores con count de empleados por empresa

**Tabs de vista (4):**

a) **Tabla** (vista por defecto):
- Columnas: Empleado (avatar+email), Posicion, Departamento (badge color), Empresa (badge), Reporta a (nombre del supervisor), Ubicacion, Reportes (count de subordinados)
- Ordenable por cada columna

b) **Arbol** (jerarquia visual):
- Estructura de arbol con nodos conectados por lineas
- Cada nodo muestra: avatar, nombre, cargo
- Expandible/colapsable por nivel
- Raiz: empleados sin `reports_to` (CEO/Directores)
- Implementacion con divs/flex anidados y lineas CSS (sin dependencia externa)

c) **Grid** (tarjetas):
- Cards con avatar, nombre, cargo, departamento, empresa
- Layout responsive en grid

d) **Por Departamento**:
- Agrupacion visual por departamento
- Cada departamento como seccion con su nombre, head (si existe), y lista de empleados

**Base de datos - Cambios necesarios:**

La tabla `employees` ya tiene `reports_to` (uuid) para la jerarquia. La tabla `companies` existe pero esta vacia y no esta vinculada a `employees`. Para soportar multi-empresa como en las imagenes de referencia, se necesita:

- Agregar columna `company_id` (uuid, FK a companies, nullable) en la tabla `employees`
- Esto permite filtrar por empresa y mostrar la leyenda de colores

### 5. Archivos a crear/modificar

| Archivo | Accion |
|---------|--------|
| Migracion SQL | Agregar `company_id` a `employees` con FK a `companies` |
| `src/pages/hr/HRDirectoryLookup.tsx` | Nueva pagina - directorio de consulta |
| `src/pages/hr/HROrganigrama.tsx` | Nueva pagina - organigrama con 4 vistas |
| `src/components/dashboard/DashboardSidebar.tsx` | Actualizar grupo Organizacion con nuevas rutas |
| `src/App.tsx` | Agregar rutas `/hr/organizacion/directorio` y `/hr/organizacion/organigrama` |
| `src/hooks/useEmployees.ts` | Agregar query con join a `companies` para organigrama |

### 6. Detalle tecnico

**Vista Arbol del Organigrama:**
Se construye un arbol recursivo a partir de los datos de empleados. Los nodos raiz son empleados donde `reports_to IS NULL`. Cada nodo renderiza sus subordinados (empleados cuyo `reports_to` coincide con el id del nodo). Se usan lineas CSS (`border-left` + `before/after` pseudo-elementos) para conectar visualmente los nodos.

**Filtro de empresa:**
La tabla `companies` ya existe con RLS. El select en el header filtra todos los datos (KPIs, tabla, arbol, grid) por `company_id`. "Todas las Empresas" muestra todos sin filtro.

**Diferenciacion clara Directorio vs Empleados Activos:**
- Empleados Activos (lifecycle): Tiene KPIs de modalidad, filtros avanzados, acciones CRUD, modal de cambio de estado con historial
- Directorio (organizacion): Solo busqueda y lectura, sin acciones de gestion, enfocado en datos de contacto

