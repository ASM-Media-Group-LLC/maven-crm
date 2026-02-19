
## Mejora de las cards de Cantidad y Estados en LeadGen

### Problema actual

Las cards **Cantidad** y **Estados** son componentes estáticos (`LeadGenCantidadCard` y `LeadGenEstadosCard`) que muestran siempre `0` para todos los valores. Los datos reales ya están cargados en `LeadGenContent.tsx` mediante el query de Supabase (array `leads`), pero no se pasan a estas cards.

### Columnas reales de la tabla `leads`

Consultando la base de datos se confirma:
- `categoria` → valores como `a+`, `a`, `b+`, `b`, `c` (para la card de Cantidad)
- `status` → valores como `nuevo`, `contactado`, etc.
- `url_perfil`, `compania`, `pais`, `notas`, `evidence_urls`, `created_at`, `updated_at`

> No existe columna `estado` ni columna para "respondieron/interesadas" — los **Estados** se derivarán de `status` con mapeo lógico.

### Qué se va a cambiar

**1. `LeadGenCantidadCard.tsx`** — Recibir `leads` como prop y calcular conteos reales:

| Categoría | Derivación |
|---|---|
| A+ | `leads.filter(l => l.categoria?.toLowerCase() === 'a+').length` |
| A | `leads.filter(l => l.categoria?.toLowerCase() === 'a').length` |
| B+ | `leads.filter(l => l.categoria?.toLowerCase() === 'b+').length` |
| B | `leads.filter(l => l.categoria?.toLowerCase() === 'b').length` |
| C | `leads.filter(l => l.categoria?.toLowerCase() === 'c').length` |
| Total | `leads.length` |
| QA | leads con evidencia: `leads.filter(l => l.evidence_urls?.length > 0).length` |

**2. `LeadGenEstadosCard.tsx`** — Recibir `leads` como prop y calcular conteos reales:

| Estado | Derivación |
|---|---|
| Respondieron | `leads.filter(l => l.status === 'contactado' \|\| l.status === 'respondio').length` |
| Interesadas | `leads.filter(l => l.status === 'interesado').length` |
| No interesadas | `leads.filter(l => l.status === 'no_interesado').length` |
| Otros | leads con status distinto a los anteriores y a 'nuevo' |
| Con Teléfono | `leads.filter(l => l.notas?.includes('+') \|\| ...).length` — se puede detectar si la URL o notas incluyen un teléfono, o simplemente contar los que tienen notas |

> Para "Estados" se calculará con los valores reales de `status`. Si los valores exactos difieren, se mostrará el total real del campo `status`.

**3. `LeadGenContent.tsx`** — Pasar el array `leads` como prop a ambas cards:
```tsx
<LeadGenCantidadCard leads={leads} />
<LeadGenEstadosCard leads={leads} />
```

### Mejora visual adicional

Aprovechando la refactorización, se añadirá un pequeño **progress bar** o **porcentaje** junto al número en la card de Cantidad, para visualizar la distribución relativa de cada categoría respecto al total. Esto hace la card más informativa sin cambiar su layout.

```
A+  |████░░░░░░|  12  (24%)
A   |██████░░░░|  28  (56%)
...
```

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/leadgen/LeadGenCantidadCard.tsx` | Recibir `leads` prop, calcular conteos reales, añadir barra de progreso |
| `src/pages/leadgen/LeadGenEstadosCard.tsx` | Recibir `leads` prop, calcular conteos reales por `status` |
| `src/pages/leadgen/LeadGenContent.tsx` | Pasar `leads` como prop a ambas cards |
