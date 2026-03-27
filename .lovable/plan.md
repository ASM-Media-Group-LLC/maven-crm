

## Plan: Reemplazar "Fees & Ajustes" por "Comisiones" en Facturación

### Resumen
Renombrar el tab "Fees & Ajustes" a "Comisiones", rediseñar su contenido con barra de filtros completa (buscador, rango de fechas, vista, botón crear) y tabla de comisiones, y rehacer el modal de creación con todos los campos solicitados.

### 1. Migración de base de datos
Agregar columnas faltantes a la tabla `commissions`:

```sql
ALTER TABLE commissions
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS period_name text,
  ADD COLUMN IF NOT EXISTS payment_date date,
  ADD COLUMN IF NOT EXISTS payment_method text;
```

Los campos existentes que se reutilizan:
- `creator_id` → selector de creador
- `base_amount` → ganancia total (USD)
- `percentage` → porcentaje de comisión
- `commission_type` → "percentage" o "fixed"
- `estimated_amount` → valor de la comisión calculado
- `final_amount` → valor para la empresa (ganancia - comisión)
- `status` → "pendiente", "pagado", "en_proceso"
- `notes` → observaciones

### 2. Modificar FacturacionPage.tsx

- Renombrar `"Fees & Ajustes"` → `"Comisiones"` en `FACTURA_TABS` y `filtersByTab`
- Reemplazar el `case "Fees & Ajustes"` por `case "Comisiones"` con:
  - Query independiente a `commissions` con join a `creators`
  - Barra de filtros usando `renderFilterBar()` con botón "+ Crear Comisión" y exportar
  - Tabla con columnas: Creador, Periodo, Ganancia (base_amount), Comisión (estimated_amount), Estado
  - Acciones: Ver y Eliminar
- Modal de detalle y confirmación de eliminación para comisiones
- Realtime subscription para la tabla `commissions`

### 3. Rehacer NuevaComisionModal.tsx

Formulario completo con los campos:
- **Creador**: Combobox searchable consultando la tabla `creators` (ordenado alfabéticamente)
- **Fecha inicio / Fecha fin**: Popovers con Calendar (patrón Shadcn DatePicker)
- **Nombre del periodo**: Input texto opcional
- **Ganancia total (USD)**: Input numérico
- **Tipo de comisión**: Select — "Porcentaje" o "Fijo"
- **Porcentaje de comisión**: Input numérico (visible solo si tipo = porcentaje)
- **Valor fijo**: Input numérico (visible si tipo = fijo)
- **Cálculo automático**: Preview mostrando valor comisión y valor empresa
- **Estado de pago**: Select — Pendiente, Pagado, En Proceso
- **Fecha de pago**: DatePicker (opcional)
- **Método de pago**: Select con métodos configurados
- **Observaciones**: Textarea

### Archivos
- **Migración SQL**: nueva migración con 5 columnas
- **Modificar**: `src/pages/finanzas/facturacion/FacturacionPage.tsx`
- **Rehacer**: `src/pages/finanzas/comisiones/NuevaComisionModal.tsx`

