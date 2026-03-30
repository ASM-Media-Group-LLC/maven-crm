

## Plan: Comisión por rangos de ingresos en Condiciones Comerciales

### Contexto actual
El campo `agency_percentage` en `creator_business` es un `number | null` que almacena un porcentaje fijo. Se usa en:
- **NuevoCreadorForm.tsx** — input numérico simple
- **InfoTabContent.tsx** — lectura "20%"
- **NuevaComisionModal.tsx** — cálculo de comisión: `base * (agencyPct / 100)`

### Cambios necesarios

#### 1. Migración de base de datos
Agregar una columna `commission_tiers` de tipo `jsonb` a `creator_business`:
```sql
ALTER TABLE creator_business 
ADD COLUMN commission_type text DEFAULT 'fixed',
ADD COLUMN commission_tiers jsonb DEFAULT '[]';
```
- `commission_type`: `'fixed'` o `'tiered'`
- `commission_tiers`: array de objetos `{ min_revenue: number, max_revenue: number | null, percentage: number }`
- Se conserva `agency_percentage` para el modo fijo (retrocompatibilidad total)

#### 2. Componente `CommissionTiersEditor` (nuevo)
Componente reutilizable que renderiza:
- **Toggle** (Switch o RadioGroup): "Fijo" vs "Por rangos"
- **Modo fijo**: Input numérico actual (sin cambios visuales)
- **Modo por rangos**: Tabla/lista editable con filas:
  - Ingreso mínimo ($), Ingreso máximo ($), Porcentaje (%)
  - Botón "Agregar tramo" al final
  - Botón eliminar (X) por fila
  - Validaciones:
    - El mínimo de cada tramo = máximo del anterior (continuidad)
    - No solapamientos
    - El último tramo puede tener máximo vacío (= "sin límite")
    - Porcentaje entre 0 y 100
- Transición animada suave entre modos

#### 3. Integración en `NuevoCreadorForm.tsx`
- Reemplazar el `<Input type="number">` del campo "Porcentaje Agencia (%)" por `<CommissionTiersEditor>`
- Agregar `commission_type` y `commission_tiers` al estado del formulario
- Enviar ambos campos en el `business` payload al guardar

#### 4. Lectura en `InfoTabContent.tsx`
- Si `commission_type === 'fixed'`: mostrar "20%" como antes
- Si `commission_type === 'tiered'`: mostrar tabla resumida con los tramos

#### 5. Cálculo en `NuevaComisionModal.tsx`
- Leer `commission_type` y `commission_tiers` del creator_business
- Si es `fixed`: cálculo actual `base * (pct / 100)`
- Si es `tiered`: buscar el tramo que corresponde al `base_amount` y aplicar el porcentaje de ese tramo

### Archivos a crear/modificar
- **Nuevo**: `src/components/commission/CommissionTiersEditor.tsx`
- **Migración SQL**: nueva columna en `creator_business`
- **Modificar**: `NuevoCreadorForm.tsx` — integrar componente
- **Modificar**: `InfoTabContent.tsx` — renderizar tramos en lectura
- **Modificar**: `NuevaComisionModal.tsx` — lógica de cálculo por tramos

