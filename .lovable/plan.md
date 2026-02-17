

## Conectar boton "Agregar Entrada" al flujo existente

### Situacion actual

El flujo completo ya existe en `PromologContent.tsx`:
- **Modal de seleccion de creadora** (linea 612-688): busqueda, filtros, grid de creadoras
- **Modal de registro de promocion** (linea 691-800): card de creadora, botones Si/No, campos condicionales

Sin embargo, el boton **"Agregar Entrada"** en el header (linea 354) tiene un `onClick` vacio (`() => { /* open entry modal */ }`).

### Cambios necesarios

**Archivo: `src/pages/promolog/PromologContent.tsx`**

1. **Conectar el boton**: Cambiar el onClick del boton "Agregar Entrada" de `() => {}` a `() => setCreatorsModalOpen(true)` para que abra el modal de seleccion de creadora (que ya existe y funciona cuando se hace clic en el KPI "Total Modelos").

2. **Ajustar texto del boton de guardar**: En el modal de registro (linea 795), cambiar el texto "Guardar Entrada" por "Guardar Promocion" para que coincida con la imagen de referencia.

### Resultado

Al hacer clic en "Agregar Entrada":
1. Se abre el modal "Selecciona una Creadora" con busqueda y filtros
2. Al seleccionar una creadora, se cierra ese modal y se abre "Registrar Promocion"
3. El usuario elige Si/No Promociono, llena los campos y guarda con "Guardar Promocion"

Es un cambio minimo (2 lineas) porque todo el flujo ya esta construido.

