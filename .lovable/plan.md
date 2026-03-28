

## Plan: Agregar fecha+hora en tablas LeadGen y Closers + diagnóstico de datos de hoy

### Diagnóstico de datos de hoy
- **imm.sally**: Contacto creado hoy con teléfono `611145051`, pero ya existe en la tabla `creators` con handle `imm.sally`. El trigger correctamente lo omite (no es un contacto nuevo, ya es creadora oficial).
- **flordepibitaa**: No aparece como contacto creado hoy — no se ha creado un contacto desde esa entry de LeadGen aún.
- **Conclusión**: No hay datos perdidos. El sistema funciona correctamente.

### Cambios de fecha+hora

#### 1. `src/pages/leadgen/LeadGenTable.tsx` — mostrar fecha + hora
- Actualmente solo muestra hora (`hh:mm a`)
- Cambiar formato a `dd/MM/yyyy hh:mm a` para incluir la fecha
- Columna "Hora" → renombrar a "Fecha"

#### 2. `src/pages/closers/components/LeadTable.tsx` — agregar hora
- Actualmente solo muestra fecha (`dd/MM/yyyy`) en ~6 lugares distintos donde se renderiza `created_at`
- Cambiar formato a `dd/MM/yyyy hh:mm a` en todas las instancias
- Esto aplica a las pestañas: Nuevo, Asignada, Confirmada, Completada, No interesada, y Todas

### Archivos a modificar
- `src/pages/leadgen/LeadGenTable.tsx`
- `src/pages/closers/components/LeadTable.tsx`

