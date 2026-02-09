
# Ajustar opciones de dropdowns y etiquetas en el formulario Nuevo Creador

## Resumen
Actualizar las constantes del formulario en `NuevoCreadorForm.tsx` para ajustar las opciones de Agencia, Estado, Pais, Idiomas y Categorias segun lo solicitado.

## Cambios en `src/pages/creadores/NuevoCreadorForm.tsx`

### 1. Agencia Asignada (linea 18-26 aprox)
Cambiar el campo de Input a Select con opciones fijas:
- Kash Agency, Atomic Agency, Unlok Platform, Elite Models, ORA Agency, Exchange, Otra

### 2. Estados en espanol
Cambiar de valores crudos a etiquetas en espanol en el dropdown:
- onboarding -> "En Onboarding"
- active -> "Activa"
- paused -> "Pausada"
- leaving -> "En Retiro"
- terminated -> "Terminada"

(El value interno sigue siendo el codigo en ingles, solo cambia la etiqueta visible)

### 3. Paises - lista completa
Reemplazar la lista corta de 11 paises por una lista completa de paises hispanohablantes y del mundo (~50+ paises mas relevantes, ordenados alfabeticamente).

### 4. Idiomas
Cambiar "Russkiy" por "Русский" en la constante LANGUAGES.

### 5. Categorias de modelo
Cambiar las etiquetas del select de categorias:
- "A+" -> "A+ (Premium)"
- "A" -> "A (Alta)"
- "B+" -> "B+ (Media Alta)"
- "B" -> "B (Media)"
- "C" -> "C (Basica)"

(El value almacenado sigue siendo "A+", "A", etc.)

## Detalle tecnico

```typescript
const AGENCIES = ["Kash Agency", "Atomic Agency", "Unlok Platform", "Elite Models", "ORA Agency", "Exchange", "Otra"];

const STATUSES = [
  { value: "onboarding", label: "En Onboarding" },
  { value: "active", label: "Activa" },
  { value: "paused", label: "Pausada" },
  { value: "leaving", label: "En Retiro" },
  { value: "terminated", label: "Terminada" },
];

const CATEGORIES = [
  { value: "A+", label: "A+ (Premium)" },
  { value: "A", label: "A (Alta)" },
  { value: "B+", label: "B+ (Media Alta)" },
  { value: "B", label: "B (Media)" },
  { value: "C", label: "C (Basica)" },
];

const LANGUAGES = ["Español", "English", "Italiano", "Português", "Français", "Deutsch", "Русский"];
```

Ademas se cambia el campo "Agencia Asignada" de `<Input>` a `<Select>` con las opciones de AGENCIES, y se actualizan los renders de STATUSES y CATEGORIES para usar `s.value` / `s.label`.

La lista de paises se amplia a incluir todos los paises de America Latina, Europa, Norteamerica y otros relevantes.

## Archivos modificados
- `src/pages/creadores/NuevoCreadorForm.tsx`
