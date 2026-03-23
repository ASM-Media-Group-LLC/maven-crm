

## Plan: Corregir alineación de columnas en Contactos y Closers

### Problema 1: Contactos — columnas desalineadas
La tabla tiene **7 headers** pero **8 celdas** por fila. Al quitar las columnas Estado e Inter. de los headers, no se quitó la celda `creadoPor` (línea 103) que quedó huérfana. Resultado: el header "Instagram" muestra el dato de `creadoPor`, el header "Contacto" muestra el link de Instagram, etc.

**Solución**: Agregar header "Agente" entre Nombre e Instagram para que las 8 celdas coincidan con 8 headers. Actualizar `colSpan` del empty state a 8.

### Problema 2: Closers — Creación no es la 1era columna en varios tabs
Los tabs "asignadas", "todas", "confirmadas", "completadas" y "no_interesadas" tienen Instagram antes de Creación. Solo "nuevo" y "pendiente_lg" ya están correctos.

**Solución**: En `renderHeaders()` y `renderRow()`, mover Creación antes de Instagram en todos los tabs restantes (asignadas, todas, confirmadas, completadas, no_interesadas).

### Problema 3: Closers — tab Pendiente LG con 822 entradas sin sentido
El tab Pendiente LG muestra leads masivos de LeadGen que no encajan en el flujo de contactos manuales. El usuario no lo considera útil.

**Solución**: Ocultar la pestaña "Pendiente LG" del UI en `ClosersContent.tsx`. Los datos siguen en la DB pero no se muestran en el pipeline de Closers.

### Archivos a modificar

1. **`src/pages/contactos/ContactosTable.tsx`**
   - Agregar header "Agente" (con SortHeader) entre Nombre e Instagram
   - Actualizar colSpan del empty state

2. **`src/pages/closers/components/LeadTable.tsx`**
   - Tabs asignadas, todas, confirmadas, completadas, no_interesadas: swap headers y celdas para que Creación vaya antes de Instagram

3. **`src/pages/closers/ClosersContent.tsx`**
   - Ocultar tab "Pendiente LG" de la lista de pestañas visibles

