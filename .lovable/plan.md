

## Cambios en la tabla de precios del Step 4

### 1. Agregar categoria "Zings" al array SERVICES

Se agrega un nuevo servicio al final del array `SERVICES` en `Step4WorkConfig.tsx`:

```text
{ key: "zings", label: "Zings" }
```

Esto automaticamente agrega la fila a la tabla y al payload de persistencia (ya que `pricing` es un `Record<string, ServicePricing>` dinamico).

### 2. Mover selector de moneda al lado del campo de precio

Actualmente el selector de moneda esta arriba de la tabla como un campo separado. Se movera para que aparezca integrado en el header de la columna "Precio sugerido", quedando el selector compacto justo al lado del titulo de la columna.

**Antes:**
```text
Moneda: [USD ($) v]
---------------------------------
| Servicio | Precio ($) | Notas |
---------------------------------
```

**Despues:**
```text
-----------------------------------------------
| Servicio | Precio sugerido [USD v] | Notas |
-----------------------------------------------
```

### Archivo a modificar

- `src/pages/creadores/onboarding/steps/Step4WorkConfig.tsx`
  - Linea 15-24: Agregar `{ key: "zings", label: "Zings" }` al array SERVICES
  - Lineas 92-104: Eliminar el bloque del selector de moneda separado
  - Lineas 109-111: Integrar el Select de moneda dentro del TableHead de "Precio sugerido"

No se requieren cambios en `OnboardingWizard.tsx` ya que el pricing es dinamico (Record) y la nueva key "zings" se guarda automaticamente.

