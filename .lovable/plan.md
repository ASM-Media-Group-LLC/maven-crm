

## Plan: Agregar campo "Dirección de facturación" en Condiciones Comerciales

### Cambios

#### 1. Migración de base de datos
Agregar columna `billing_address` (text, nullable) a `creator_business`:
```sql
ALTER TABLE public.creator_business
ADD COLUMN IF NOT EXISTS billing_address text;
```

#### 2. `NuevoCreadorForm.tsx`
- Agregar `billing_address: string` al estado del formulario (inicializado en `""`)
- Después del campo "Periodicidad de Cobro" (línea 552), insertar un nuevo `<Field>` con un `<Input>` o `<Textarea>` para la dirección
- Incluir `billing_address` en el payload de guardado junto a `billing_frequency`

#### 3. `InfoTabContent.tsx`
- Mostrar el campo "Dirección de facturación" en la sección de lectura de condiciones comerciales

### Archivos
- **Migración SQL**: nueva columna en `creator_business`
- **Modificar**: `NuevoCreadorForm.tsx` — estado + campo + guardado
- **Modificar**: `InfoTabContent.tsx` — lectura del campo

