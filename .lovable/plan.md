

## Nuevos campos de configuracion en el Paso 4 del Onboarding

### Campos a agregar

| Campo | Tipo de control | Opciones |
|---|---|---|
| Permiso de uso de identidad real | Select | Si / No |
| Preferencia de terminos de afecto | Input de texto | Libre |
| Restricciones de seguridad y contenido no permitido | Textarea | Libre |
| Orientacion declarada para el perfil | Select | Heterosexual, Bisexual, Lesbiana, Gay, Otro |

### Almacenamiento

La tabla `creators` no tiene columnas dedicadas para estos campos. Se almacenaran dentro del campo JSON `internal_notes`, junto con los datos existentes (schedule, monthlyGoal, timezone). Al guardar, el JSON quedara asi:

```json
{
  "schedule": {...},
  "monthlyGoal": "5000",
  "timezone": "America/Bogota",
  "permisoIdentidadReal": "si",
  "terminosAfecto": "mi amor, bebe",
  "restriccionesSeguridad": "No mostrar rostro...",
  "orientacionPerfil": "Bisexual"
}
```

### Layout visual

Los 4 campos nuevos se colocan entre la tabla de precios y el objetivo mensual, distribuidos en una grilla de 2 columnas:

```text
┌─────────────────────────────┬─────────────────────────────┐
│ Permiso de identidad real   │ Orientacion del perfil      │
│ [Select: Si / No]           │ [Select: Hetero/Bi/...]     │
├─────────────────────────────┼─────────────────────────────┤
│ Preferencia de terminos     │ Restricciones de seguridad  │
│ de afecto [Input texto]     │ [Textarea]                  │
└─────────────────────────────┴─────────────────────────────┘
```

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/creadores/onboarding/steps/Step4WorkConfig.tsx` | Agregar 4 campos al interface `Step4Data`, agregar seccion UI con grid de 2 columnas usando Select e Input/Textarea |
| `src/pages/creadores/onboarding/OnboardingWizard.tsx` | Actualizar `initialStep4` con valores vacios para los 4 campos nuevos, incluirlos en el JSON de `internal_notes` dentro de `buildPayload` |

### Detalles tecnicos

- Se importa `Select, SelectTrigger, SelectValue, SelectContent, SelectItem` de `@/components/ui/select` en Step4WorkConfig
- Los 4 campos nuevos en `Step4Data`: `permisoIdentidadReal: string`, `terminosAfecto: string`, `restriccionesSeguridad: string`, `orientacionPerfil: string`
- Los selects usan las opciones fijas mencionadas arriba
- El textarea de restricciones tiene 3 filas por defecto

