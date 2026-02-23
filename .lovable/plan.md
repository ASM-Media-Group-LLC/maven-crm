
## Validacion de Campos y Tooltips de Ayuda

### Resumen

Dos cambios principales:
1. Agregar validacion obligatoria en el Paso 4 para que al menos un servicio tenga precio definido (Paso 2 ya es opcional, Paso 1 ya valida campos requeridos)
2. Agregar tooltips informativos en las 3 preguntas de "Como responderias a..." del Paso 2

---

### 1. Validacion del Paso 4 (Precios obligatorios)

**Estado actual:**
- Paso 1: Ya valida nombre, email, telefono (obligatorios)
- Paso 2 (Psicologia): No tiene validacion - ya es opcional, no se toca
- Paso 3 (Documentacion): Ya tiene su propia validacion
- Paso 4: No tiene validacion - hay que agregar

**Cambio en `OnboardingWizard.tsx`:**
- En `validateCurrentStep()`, agregar validacion para `step === 4`: verificar que al menos un servicio en `step4.pricing` tenga un precio mayor a 0
- Mostrar toast de error si no se cumple

**Lineas afectadas:** ~149-161 en OnboardingWizard.tsx

---

### 2. Tooltips en preguntas de crisis (Paso 2)

**Cambio en `Step2PsychologyLimits.tsx`:**
- Importar `Tooltip, TooltipTrigger, TooltipContent, TooltipProvider` y el icono `Info` de lucide-react
- En las 3 preguntas de la seccion "Limites y Manejo de Crisis":
  - "Como responderias si un usuario pide sexo en persona?"
  - "Como manejas a un usuario grosero?"
  - "Como respondes a quiero ver tus desnudos?"
- Agregar un icono `Info` (h-3.5 w-3.5) al lado del Label, envuelto en un Tooltip que muestre: "Esto ayudara a nuestros chatters a hablar exactamente como tu"

**Lineas afectadas:** ~193-218 en Step2PsychologyLimits.tsx

---

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/creadores/onboarding/OnboardingWizard.tsx` | Agregar validacion de precios en Step 4 dentro de `validateCurrentStep()` |
| `src/pages/creadores/onboarding/steps/Step2PsychologyLimits.tsx` | Agregar tooltips con icono Info en las 3 preguntas de respuesta a crisis |

### Detalle tecnico del tooltip

```text
Label + [i icon with tooltip]
  └─ "Esto ayudara a nuestros chatters a hablar exactamente como tu"
```

Se usa el componente `TooltipProvider` envolviendo el accordion completo, y cada icono `Info` dentro de `Tooltip > TooltipTrigger > TooltipContent`.
