

## Conectar acciones de la tabla PromologTable

### Situacion actual

El componente `PromologTable` ya esta renderizado correctamente cuando se hace clic en el boton "Tabla". Sin embargo, las acciones de la tabla (Ver detalle, Editar, Eliminar) no estan conectadas: el componente recibe `onView`, `onEdit` y `onDelete` como props opcionales, pero `PromologContent` no pasa ninguno de estos handlers (linea 594).

### Cambios necesarios

| Archivo | Cambio |
|---------|--------|
| `src/pages/promolog/PromologContent.tsx` | Conectar handlers `onView`, `onEdit`, `onDelete` al `PromologTable` |

### Detalle tecnico

1. **Agregar estado para la entrada seleccionada y modales de accion**:
   - `selectedEntry: PromologEntry | null`
   - `viewEntryOpen: boolean`
   - `editEntryOpen: boolean`
   - `deleteEntryOpen: boolean`

2. **Crear funciones handler** siguiendo el patron de `TicketsContent`:
   - `handleViewEntry(entry)` — selecciona la entrada y abre modal de vista
   - `handleEditEntry(entry)` — selecciona la entrada y abre modal de edicion (reutilizando el modal de edicion existente)
   - `handleDeleteEntry(entry)` — selecciona la entrada y abre dialogo de confirmacion de eliminacion

3. **Pasar los handlers al componente `PromologTable`**:
   ```
   <PromologTable
     entries={filteredEntries}
     onView={handleViewEntry}
     onEdit={handleEditEntry}
     onDelete={handleDeleteEntry}
   />
   ```

4. **Tambien pasar los mismos handlers a `PromologGrid`** para mantener consistencia entre vistas:
   ```
   <PromologGrid
     entries={filteredEntries}
     onView={handleViewEntry}
     onEdit={handleEditEntry}
     onDelete={handleDeleteEntry}
   />
   ```

### Lo que NO se cambia

- Diseno visual de la tabla (columnas, badges, iconos, ordenacion)
- Funcionalidades existentes de la tabla (sort, dropdown menu, sticky headers)
- Layout general de la pagina Promolog
- Ningun otro componente fuera de `PromologContent.tsx`

