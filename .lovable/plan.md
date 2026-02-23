

## Refactorizacion del Paso 1: Informacion Personal Enriquecido

### Resumen

Enriquecer el formulario del Paso 1 del onboarding agregando campos de identidad visual, idiomas y privacidad. Los datos se guardaran en columnas existentes de la BD cuando sea posible, y en el campo JSON `internal_notes` para los campos nuevos que no tienen columna dedicada.

---

### Archivos a modificar

**1. `src/pages/creadores/onboarding/steps/Step1PersonalInfo.tsx`** - Agregar nuevos campos al formulario
**2. `src/pages/creadores/onboarding/OnboardingWizard.tsx`** - Actualizar `Step1Data`, `initialStep1`, carga de datos y `buildPayload`

---

### Campos nuevos a agregar en Step1Data

| Campo | Tipo | Columna BD | Almacenamiento |
|-------|------|------------|----------------|
| `signoZodiacal` | string (select) | `signo_zodiacal` | Columna directa |
| `etnicidad` | string (input) | -- | `internal_notes` JSON |
| `tatuajesPiercings` | string (textarea) | `tatuajes_piercings_detalle` | Columna directa |
| `cicatrices` | string (input) | -- | `internal_notes` JSON |
| `idiomas` | string (input multi) | `languages` (ARRAY) | Columna directa (split por coma) |
| `nivelLectura` | string (select) | -- | `internal_notes` JSON |
| `permisoNombreReal` | string ("si"/"no") | -- | `internal_notes` JSON |
| `permisoEdadReal` | string ("si"/"no") | -- | `internal_notes` JSON |
| `permisoUbicacion` | string ("si"/"no") | -- | `internal_notes` JSON |

---

### Cambio 1: Step1PersonalInfo.tsx

Agregar tres secciones visuales despues de los campos existentes, separadas con titulos de seccion:

**Seccion "Identidad Visual"** (despues de Talla de brasier):
- Signo zodiacal: Select con los 12 signos
- Etnicidad/Nacionalidad: Input de texto libre
- Tatuajes/Piercings: Textarea (cantidad y ubicacion)
- Cicatrices: Input de texto

**Seccion "Idiomas"** (despues de identidad visual):
- Idiomas que habla: Input (ej: "Espanol, Ingles, Portugues")
- Nivel de lectura/escritura: Select (Basico, Intermedio, Avanzado, Nativo)

**Seccion "Privacidad"** (al final, ancho completo):
Tres filas con Switch (Si/No) para:
- "Podemos mencionar tu nombre real?"
- "Podemos decir tu edad real?"
- "Podemos mencionar tu ubicacion actual?"

Cada seccion tendra un separador visual con un label en texto pequeno y gris.

### Cambio 2: OnboardingWizard.tsx

- Extender la interfaz `Step1Data` con los 9 campos nuevos (todos string, default `""`)
- Actualizar `initialStep1` con los valores por defecto
- En el `useEffect` de carga (editCreatorId), leer los campos desde las columnas directas y desde `internal_notes` JSON
- En `buildPayload`, mapear:
  - `signo_zodiacal` -> columna directa
  - `tatuajes_piercings_detalle` -> columna directa
  - `languages` -> columna directa (split del string por coma a array)
  - Los demas campos nuevos -> agregar al objeto `extraData` que se serializa en `internal_notes`

### Cambio 3: Mover "Permiso de identidad real" de Step4 a Step1

El campo `permisoIdentidadReal` que actualmente esta en Step4 (Configuracion de Interaccion) se reemplaza por los tres switches mas granulares en Step1 (nombre, edad, ubicacion). Se eliminara el campo original de Step4 y su referencia en `Step4Data`.

---

### Constantes nuevas

```text
SIGNOS_ZODIACALES = ["Aries", "Tauro", "Geminis", "Cancer", "Leo", "Virgo",
                     "Libra", "Escorpio", "Sagitario", "Capricornio", "Acuario", "Piscis"]

NIVELES_IDIOMA = ["Basico", "Intermedio", "Avanzado", "Nativo"]
```

### Layout visual del Paso 1 actualizado

```text
[Nombre completo *]          [Nombre artistico]
[Email *]                    [Telefono *]
[Edad]                       [Fecha de nacimiento]
[Pais]                       [Ciudad]
[Medidas (cm)]               [Talla de brasier]
                [Zona horaria (full width)]

--- Identidad Visual ---
[Signo zodiacal]             [Etnicidad/Nacionalidad]
[Tatuajes/Piercings (full width textarea)]
[Cicatrices (full width)]

--- Idiomas ---
[Idiomas que habla]          [Nivel de lectura/escritura]

--- Privacidad ---
[Switch] Podemos mencionar tu nombre real?
[Switch] Podemos decir tu edad real?
[Switch] Podemos mencionar tu ubicacion actual?
```

