

# Ampliar formulario inline de lineamientos con campos adicionales

## Resumen

Actualizar el formulario inline que aparece al hacer clic en "+" para incluir los campos: Titulo/Concepto, Precio, Moneda, Nota (opcional), y tres botones de accion (Cancelar, Guardar y agregar otro, Guardar con icono).

## Cambios en Base de Datos

### Migracion: agregar columnas a `creator_guidelines`

Nuevas columnas opcionales (nullable):
- `price` (numeric) -- Precio
- `currency` (text, default 'USD') -- Moneda
- `note` (text) -- Nota opcional

Estas columnas son nullable para no romper los lineamientos existentes que solo usan `content`.

## Cambios en Codigo

### 1. `src/integrations/supabase/types.ts`
Se regenerara automaticamente tras la migracion.

### 2. `src/pages/creadores/lineamientos/GuidelineItemRow.tsx`

Reemplazar el formulario inline actual (solo Contenido/textarea) por el nuevo layout:

```text
+--------------------------------------------------+
| Titulo / Concepto                                 |
| [Ej: Foto personalizada, Videollamada 15min...]   |
|                                                   |
| Precio                    Moneda                  |
| [Ej: 50]                 [USD]                    |
|                                                   |
| Nota (opcional)                                   |
| [Ej: Incluye nombre del fan, entrega en 24h...]   |
|                                                   |
|           Cancelar  Guardar y agregar otro  Guardar|
+--------------------------------------------------+
```

- Agregar nuevas props: `inlineTitle`, `inlinePrice`, `inlineCurrency`, `inlineNote`, y sus handlers `onChange`
- Agregar prop `onSubmitAndAddAnother` para el boton "Guardar y agregar otro"
- Campo "Titulo / Concepto": Input con placeholder "Ej: Foto personalizada, Videollamada 15min, Pack semanal..."
- "Precio" y "Moneda": dos inputs en una fila (grid de 2 columnas), placeholders "Ej: 50" y "USD"
- "Nota (opcional)": Textarea con placeholder "Ej: Incluye nombre del fan, entrega en 24h..."
- Tres botones al pie alineados a la derecha:
  - "Cancelar" (variant ghost)
  - "Guardar y agregar otro" (variant outline, disabled si titulo vacio)
  - "Guardar" (variant default con icono Save, disabled si titulo vacio)

### 3. `src/pages/creadores/LineamientosTabContent.tsx`

- Agregar estados para los nuevos campos: `inlineAddTitle`, `inlineAddPrice`, `inlineAddCurrency` (default "USD"), `inlineAddNote`
- Actualizar `FormData` para incluir `price`, `currency`, `note`
- Actualizar `handleInlineAddSubmit` para enviar los nuevos campos a Supabase
- Agregar `handleInlineAddSubmitAndAnother` que guarda y luego resetea el formulario manteniendo la misma card abierta
- Pasar todas las nuevas props a `GuidelineItemRow`
- El campo `content` se seguira usando, y se llenara con el valor del titulo/concepto (o se puede dejar como campo separado)

### 4. Mutacion `upsertMutation`

Actualizar el payload del insert para incluir `price`, `currency`, `note` como campos opcionales en la insercion a `creator_guidelines`.

## Secuencia de implementacion

1. Crear migracion SQL para las nuevas columnas
2. Actualizar tipos de Supabase
3. Modificar `GuidelineItemRow.tsx` con el nuevo formulario
4. Modificar `LineamientosTabContent.tsx` con estados y handlers
5. Probar flujo completo

