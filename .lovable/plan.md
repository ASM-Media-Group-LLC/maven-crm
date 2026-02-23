

## Ampliacion del Paso 2: Psicologia y Limites

### Resumen

Agregar 14 nuevos campos al Paso 2 del onboarding, distribuidos en las 3 secciones colapsables existentes. Todos los campos son opcionales y se persisten en el JSON `internal_notes`.

---

### 1. Nuevos campos en Step2PsyData (interface)

| Campo | Seccion |
|-------|---------|
| `horariosSueno` | Biografia y Gustos |
| `deporteEquipo` | Biografia y Gustos |
| `colorFavorito` | Biografia y Gustos |
| `estadoCivil` | Biografia y Gustos |
| `queBuscasPareja` | Biografia y Gustos |
| `mejorAtributoFisico` | Biografia y Gustos |
| `metasLargoPlazo` | Biografia y Gustos |
| `queHacesRelajarte` | Personalidad y Tono |
| `queTeHaceReir` | Personalidad y Tono |
| `queTeMotivaCrear` | Personalidad y Tono |
| `respuestaCuantoCobraEncuentro` | Limites y Manejo de Crisis |
| `respuestaMuestraIntimas` | Limites y Manejo de Crisis |
| `estrategiaMaterialGratis` | Limites y Manejo de Crisis |
| `estrategiaProblemasPersonales` | Limites y Manejo de Crisis |

---

### 2. Cambios en la UI de Step2PsychologyLimits.tsx

**Seccion A - Biografia y Gustos** (agregar despues de "Nivel de estudios", antes de "Rutina diaria"):
- `horariosSueno` (Input, placeholder: "Despierta 9am, duerme 1am")
- `deporteEquipo` (Input, placeholder: "Futbol, Real Madrid...")
- `colorFavorito` (Input, placeholder: "Rosa, negro...")
- `estadoCivil` (Input, placeholder: "Soltera, en una relacion...")
- `queBuscasPareja` (Textarea, md:col-span-2)
- `mejorAtributoFisico` (Input)
- `metasLargoPlazo` (Textarea, md:col-span-2)

**Seccion B - Personalidad y Tono** (agregar despues de "Tono de voz"):
- `queHacesRelajarte` (Textarea, md:col-span-2)
- `queTeHaceReir` (Textarea, md:col-span-2)
- `queTeMotivaCrear` (Textarea, md:col-span-2)

**Seccion C - Limites y Manejo de Crisis** (agregar despues de los 3 scripts existentes):
- `respuestaCuantoCobraEncuentro` (Textarea con tooltip Info)
- `respuestaMuestraIntimas` (Textarea con tooltip Info)
- `estrategiaMaterialGratis` (Textarea con tooltip Info)
- `estrategiaProblemasPersonales` (Textarea con tooltip Info)

Los 4 nuevos campos de crisis llevan el mismo icono Info con tooltip "Esto ayudara a nuestros chatters a hablar exactamente como tu".

---

### 3. Cambios en OnboardingWizard.tsx

- **initialStep2Psy**: agregar los 14 campos con valor `""`
- **Hidratacion (useEffect)**: cargar los 14 campos desde `extraData`
- **buildPayload**: serializar los 14 campos nuevos en `extraData`

---

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/creadores/onboarding/steps/Step2PsychologyLimits.tsx` | Agregar 14 campos a la interface y UI en las 3 secciones existentes |
| `src/pages/creadores/onboarding/OnboardingWizard.tsx` | Actualizar initialStep2Psy (linea 24), hidratacion (lineas 87-107) y buildPayload (lineas 215-228) |

### Notas tecnicas

- Todos los campos nuevos son tipo `string` y opcionales
- Los campos tipo "estrategia" y "respuesta" usan Textarea con rows={3}
- No se necesitan cambios en la base de datos: todo se persiste en `internal_notes` (JSON)
- Los tooltips de crisis reutilizan el patron existente con `Tooltip + TooltipTrigger + Info icon`

