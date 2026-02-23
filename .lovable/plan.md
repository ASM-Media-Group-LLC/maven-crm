

## Paso 4: Nuevos campos de Conectividad, Fidelizacion y Dinamicas Especiales

### Resumen

Agregar 3 nuevos elementos a la seccion "Configuracion de Interaccion" del Paso 4: un selector de plataforma para videollamadas, un campo de texto para estrategia de recuperacion, y un switch para dinamicas grupales.

---

### 1. Nuevos campos en Step4Data (interface)

| Campo nuevo | Tipo | Descripcion |
|-------------|------|-------------|
| `plataformaVideollamada` | `string` | Plataforma preferida (Telegram, WhatsApp, Zoom, Skype, Otro) |
| `estrategiaRecuperacion` | `string` | Estrategia de recuperacion de suscriptores y manejo de quejas |
| `interesaDinamicasGrupales` | `boolean` | Switch para juegos, rifas o metas de ventas grupales |

---

### 2. Cambios en la UI de Step4WorkConfig.tsx

**A. Plataforma preferida para Videollamadas** -- Nuevo Select en el grid de 2 columnas junto a "Orientacion declarada":
- Opciones: Telegram, WhatsApp, Zoom, Skype, Otro
- Label: "Plataforma preferida para Videollamadas"

**B. Estrategia de recuperacion** -- Nuevo Textarea debajo de "Estrategia de Rechazo":
- Label: "Estrategia de recuperacion de suscriptores y manejo de quejas"
- Placeholder: "Describe como recuperar suscriptores inactivos y manejar quejas..."
- 3 filas

**C. Dinamicas Especiales (Switch)** -- Nuevo bloque Switch debajo del GFE existente:
- Label: "Interesada en participar en juegos, rifas o metas de ventas grupales?"
- Descripcion: "Actividades grupales de engagement y ventas"

---

### 3. Cambios en OnboardingWizard.tsx

- **initialStep4**: agregar `plataformaVideollamada: ""`, `estrategiaRecuperacion: ""`, `interesaDinamicasGrupales: false`
- **Hidratacion (useEffect linea 133-147)**: leer los 3 nuevos campos desde `extraData`
- **buildPayload (linea 209-266)**: agregar los 3 campos al JSON de `extraData`

---

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/creadores/onboarding/steps/Step4WorkConfig.tsx` | Agregar 3 campos a interface + UI |
| `src/pages/creadores/onboarding/OnboardingWizard.tsx` | Actualizar initialStep4, hidratacion y buildPayload |

### Notas tecnicas

- Los 3 campos se persisten en `internal_notes` (JSON) sin cambios en la base de datos
- El Select de plataforma reutiliza el patron existente de los demas selectores
- El Switch de dinamicas grupales sigue el patron visual del switch GFE existente

