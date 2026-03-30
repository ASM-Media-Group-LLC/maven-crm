

## Plan: Agregar campos "Fecha de inicio de cobro" y "Periodicidad de Cobro"

### Resumen
Agregar dos nuevos campos en la sección "Condiciones Comerciales" del formulario de nuevo creador, justo después de "Método de Pago".

### Cambios

#### 1. Migración — Agregar columnas a `creator_business`
```sql
ALTER TABLE creator_business
  ADD COLUMN billing_start_date date,
  ADD COLUMN billing_frequency text;
```

#### 2. `src/pages/creadores/NuevoCreadorForm.tsx`
- Agregar `billing_start_date: string` y `billing_frequency: string` al `FormData` interface y `defaultForm`
- En la sección "Condiciones Comerciales", después del campo "Método de Pago", agregar:
  - **Fecha en la que inicia a cobrar**: campo tipo date input
  - **Periodicidad de Cobro**: Select con opciones: **Semanal**, **Quincenal**, **Mensual**
- Incluir ambos campos en el objeto `business` que se envía al hook de guardado

#### 3. Regenerar tipos de Supabase
Los tipos se actualizarán automáticamente al crear la migración.

### Archivos a modificar
- Nueva migración SQL
- `src/pages/creadores/NuevoCreadorForm.tsx`

