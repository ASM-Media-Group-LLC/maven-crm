

## Enriquecer el Configurador de Interaccion - Step 4

### Resumen

Agregar 4 nuevos campos al accordion "Configuracion de Interaccion" del Step 4, debajo de la seccion existente de apodos y restricciones. Tambien actualizar el modelo de datos y la persistencia en `internal_notes`.

---

### Campos nuevos

| Campo | Tipo UI | Opciones | Persistencia |
|-------|---------|----------|--------------|
| `gfeDisponible` | Switch | Si / No | `internal_notes` JSON |
| `personalidadMarca` | Dropdown (Select) | Dulce, Directa, Juguetona, Dominante | `internal_notes` JSON |
| `estrategiaRechazo` | Dropdown (Select) | Humor, Firmeza, Rechazo suave | `internal_notes` JSON |
| `tonoEmocional` | Dropdown (Select) | Romantico, Sensual | `internal_notes` JSON |

---

### Archivos a modificar

**1. `src/pages/creadores/onboarding/steps/Step4WorkConfig.tsx`**

- Agregar import de `Switch` desde `@/components/ui/switch`
- Agregar 4 campos nuevos a la interfaz `Step4Data`:
  - `gfeDisponible: boolean`
  - `personalidadMarca: string`
  - `estrategiaRechazo: string`
  - `tonoEmocional: string`
- En la seccion "Configuracion de Interaccion" (lineas 162-195), despues del Textarea de restricciones (linea 194), agregar:
  1. Switch con label "Disponible para modalidad de Acompanamiento Virtual (GFE)?"
  2. Grid 2 columnas con:
     - Dropdown "Personalidad de Marca" (Dulce, Directa, Juguetona, Dominante)
     - Dropdown "Estrategia de Rechazo" (Humor, Firmeza, Rechazo suave)
  3. Dropdown "Tono Emocional" (Romantico, Sensual)

**2. `src/pages/creadores/onboarding/OnboardingWizard.tsx`**

- Actualizar `initialStep4` con los 4 nuevos campos (defaults: `false`, `""`, `""`, `""`)
- En el `useEffect` de carga (datos existentes), leer los 4 campos de `extraData` (internal_notes JSON)
- En `buildPayload`, agregar los 4 campos al objeto `extraData` que se serializa en `internal_notes`

---

### Layout visual de la seccion actualizada

```text
--- Configuracion de Interaccion ---

[Orientacion declarada v]

[Preferencia de terminos de afecto - full width]

[Restricciones de seguridad (textarea) - full width]

[Switch: Disponible para Acompanamiento Virtual (GFE)?]

[Personalidad de Marca v]    [Estrategia de Rechazo v]

[Tono Emocional v]
```

