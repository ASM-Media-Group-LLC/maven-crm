

## Ajustes al Onboarding de Creadoras

Se van a realizar 4 correcciones en el wizard de onboarding:

---

### 1. Arreglar el selector de fecha (Paso 1)

El componente `DateInput` usa un `Popover` con un calendario (`DayPicker`). El problema es que el `PopoverContent` no tiene la clase `pointer-events-auto`, lo que hace que los clics no lleguen al calendario cuando esta dentro de ciertos contenedores. Se agregara esa clase al `PopoverContent`.

**Archivo:** `src/components/ui/date-input.tsx`

---

### 2. Alinear campos desiguales (Paso 1)

Varios campos en `Step1PersonalInfo` no estan correctamente alineados dentro del grid de 2 columnas. Algunos campos como "Medidas" y "Talla de brasier" estan sueltos despues de un campo `md:col-span-2`, causando desalineacion visual. Se revisara que los campos se agrupen correctamente en pares dentro del grid.

**Archivo:** `src/pages/creadores/onboarding/steps/Step1PersonalInfo.tsx`

---

### 3. Quitar Wishlist y Redes Sociales del Paso 1

El Paso 1 (Informacion Personal) tiene una seccion "Conectividad" con campos de "Links de Redes Sociales" y "Wishlist de Amazon" (lineas 253-262). Estos mismos datos ya estan en el Paso 3 (Documentacion) de forma mas completa (con campos individuales para Instagram, TikTok, Twitter, OnlyFans, etc.). Se eliminara la seccion "Conectividad" del Paso 1 y los campos `redesSociales` y `wishlistAmazon` del tipo `Step1Data`.

**Archivos:**
- `src/pages/creadores/onboarding/steps/Step1PersonalInfo.tsx` - Quitar seccion "Conectividad" y campos del tipo
- `src/pages/creadores/onboarding/OnboardingWizard.tsx` - Quitar los campos del `initialStep1` y del `buildCreatorPayload`

---

### 4. Agregar "Seleccionar Todos" en el horario (Paso 4)

En la tabla de horarios del Paso 4, agregar:
- Un checkbox "Todos" en el header de la tabla que seleccione/deseleccione todos los dias y turnos
- Checkboxes en cada header de columna (Manana, Tarde, Noche) para seleccionar ese turno en todos los dias
- Un checkbox por cada fila (Lunes, Martes...) para seleccionar todos los turnos de ese dia

**Archivo:** `src/pages/creadores/onboarding/steps/Step4WorkConfig.tsx`

---

### Resumen de archivos

| Archivo | Cambio |
|---------|--------|
| `src/components/ui/date-input.tsx` | Agregar `pointer-events-auto` al PopoverContent |
| `src/pages/creadores/onboarding/steps/Step1PersonalInfo.tsx` | Quitar seccion Conectividad, alinear campos |
| `src/pages/creadores/onboarding/OnboardingWizard.tsx` | Quitar `redesSociales` y `wishlistAmazon` del estado inicial y payload |
| `src/pages/creadores/onboarding/steps/Step4WorkConfig.tsx` | Agregar checkboxes de "Seleccionar todos" en la tabla de horarios |

