
## Aplicar Sticky Headers a todas las tablas del sistema

He verificado todas las tablas principales del sistema. La mayoría ya implementa el patrón de encabezados fijos, pero algunas tablas secundarias o modales aún no lo tienen. Este plan detalla la estandarización de estas tablas restantes.

### Estrategia de estandarización

Para que el encabezado sea fijo (`sticky top-0`), se requiere:
1.  **Contenedor con scroll**: El elemento `Table` debe estar envuelto en un `div` con `overflow-auto` y una altura máxima (`max-h`).
2.  **Clases de TableHeader**: El componente `TableHeader` debe tener las clases `sticky top-0 z-10 bg-card` para que se mantenga visible y opaco sobre el contenido que hace scroll.

### Tablas a actualizar

#### 1. Tabla de Tareas (`src/pages/tareas/TasksTable.tsx`)
Actualmente tiene un borde simple sin límite de altura.
- Añadir contenedor con `max-h-[calc(100vh-24rem)] overflow-auto`.
- Añadir clases sticky al `TableHeader`.

#### 2. Tabla de Proyectos (`src/pages/tareas/ProjectsTable.tsx`)
Similar a la de tareas.
- Añadir contenedor con `max-h-[calc(100vh-24rem)] overflow-auto`.
- Añadir clases sticky al `TableHeader`.

#### 3. Modal de Detalle de Tarjeta (`src/pages/sales-overview/CardDetailModal.tsx`)
Esta tabla se muestra dentro de un modal y puede ser larga.
- Añadir contenedor con `max-h-[500px] overflow-auto`.
- Añadir clases sticky al `TableHeader`.

#### 4. Tab de Documentos en Perfil de Creador (`src/pages/creadores/DocumentosTabContent.tsx`)
- Envolver la tabla en un `div` con `max-h-[400px] overflow-auto`.
- Añadir clases sticky al `TableHeader`.

#### 5. Tab de Monetización en Perfil de Creador (`src/pages/creadores/MonetizacionTabContent.tsx`)
- Envolver la tabla en un `div` con `max-h-[400px] overflow-auto`.
- Añadir clases sticky al `TableHeader`.

#### 6. Tabla Comparativa (`src/pages/sales-overview/comparativas/ComparativaTable.tsx`)
Ya tiene el contenedor, pero usa clases sticky individuales en cada `TableHead`. 
- Simplificar aplicando `sticky top-0 z-10 bg-card` directamente al `TableHeader`.

### Resumen de cambios técnicos

````text
| Archivo | Cambio principal |
|---------|------------------|
| TasksTable.tsx | Añadir wrapper overflow-auto y sticky classes al Header |
| ProjectsTable.tsx | Añadir wrapper overflow-auto y sticky classes al Header |
| CardDetailModal.tsx | Añadir wrapper max-h y sticky classes al Header |
| DocumentosTabContent.tsx | Añadir wrapper max-h y sticky classes al Header |
| MonetizacionTabContent.tsx | Añadir wrapper max-h y sticky classes al Header |
| ComparativaTable.tsx | Centralizar sticky classes en TableHeader |
````

Este cambio garantiza que la experiencia de navegación sea consistente en todo el sistema, permitiendo que los títulos de las columnas siempre sean visibles mientras el usuario explora los datos.
