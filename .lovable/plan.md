
## Estandarización de Tipografía en Encabezados de Tabla

### Problema
El usuario notó que la palabra "Acciones" en la tabla de Promolog se ve más grande que otros títulos. Esto ocurre porque algunos títulos (los que permiten ordenar) usan explícitamente `text-xs` a través de un botón, mientras que otros heredan el tamaño por defecto `text-sm` del componente `TableHead`.

### Solución
Estandarizar todos los encabezados de tabla de todo el sistema para que utilicen consistentemente `text-xs`. Esto no solo resuelve el problema visual en Promolog, sino que mejora la consistencia y el aspecto profesional de todos los paneles de datos de la aplicación.

### Pasos de implementación

#### 1. Actualización Global del Componente TableHead
Modificar `src/components/ui/table.tsx` para que todos los `TableHead` utilicen `text-xs` por defecto.
- Añadir `text-xs` a la clase del componente `TableHead`.

#### 2. Actualización de Botones de Ordenación (SortHeaders)
Asegurar que los botones utilizados para ordenar columnas también utilicen `text-xs`. Actualmente, algunos lo tienen y otros no.
- **src/pages/promolog/PromologTable.tsx**: (Ya lo tiene, solo verificaremos consistencia).
- **src/pages/contactos/ContactosTable.tsx**: Añadir `text-xs` a `SortHeader`.
- **src/pages/creadores/CreadoresTable.tsx**: Añadir `text-xs` a `SortHeader`.
- **src/pages/leadgen/LeadGenTable.tsx**: Añadir `text-xs` a `SortHeader`.
- **src/pages/eventos/EventosTable.tsx**: Añadir `text-xs` a `SortHeader`.
- **src/pages/tareas/TasksTable.tsx**: Añadir `text-xs` a `SortHeader`.
- **src/pages/tareas/ProjectsTable.tsx**: Añadir `text-xs` a `SortHeader`.
- **src/pages/closers/ClosersTable.tsx**: Añadir `text-xs` a `SortHeader`.

#### 3. Limpieza de Texto en Encabezados Estáticos
Asegurar que los encabezados que son solo texto (como "Acciones", "Notas", "WhatsApp") se vean idénticos al resto ahora que el componente base será `text-xs`.

### Beneficios
- **Consistencia Visual**: Todas las tablas tendrán el mismo tamaño de fuente en sus encabezados.
- **Jerarquía de Información**: Los encabezados en `text-xs` contrastan mejor con los datos en `text-sm`, facilitando la lectura.
- **Densidad de Datos**: Permite tablas más compactas y eficientes en pantallas de gestión.

### Detalles técnicos específicos por archivo

| Archivo | Cambio |
|---------|--------|
| `src/components/ui/table.tsx` | Añadir `text-xs` a `TableHead` |
| `src/pages/promolog/PromologTable.tsx` | (Mantener `text-xs` en SortHeader y el componente base cubrirá "Acciones") |
| `src/pages/contactos/ContactosTable.tsx` | Añadir `text-xs` a `SortHeader` |
| `src/pages/creadores/CreadoresTable.tsx` | Añadir `text-xs` a `SortHeader` |
| `src/pages/leadgen/LeadGenTable.tsx` | Añadir `text-xs` a `SortHeader` |
| `src/pages/eventos/EventosTable.tsx` | Añadir `text-xs` a `SortHeader` |
| `src/pages/tareas/TasksTable.tsx` | Añadir `text-xs` a `SortHeader` |
| `src/pages/tareas/ProjectsTable.tsx` | Añadir `text-xs` a `SortHeader` |
| `src/pages/closers/ClosersTable.tsx` | Añadir `text-xs` a `SortHeader` |

