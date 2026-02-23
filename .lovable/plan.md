
## Ajuste del Paso 3: Documentacion y Verificacion

### Resumen

Dividir el cargador de documentos de identidad en 3 cargadores separados, agregar un campo de URLs para otras plataformas, e implementar tooltips informativos en Wishlist y Redes Sociales.

---

### 1. Cambios en la interface Step2Data

| Campo actual | Cambio |
|-------------|--------|
| `idDocuments: UploadedFile[]` | Reemplazar por `idDocumentFront`, `idDocumentBack`, `selfieDocument` (todos `UploadedFile[]`) |
| (nuevo) `linkOtrasPlataformas: string` | Campo para URLs exactas de otras plataformas |

Interface resultante:

```text
Step2Data {
  idDocumentFront: UploadedFile[]    // antes: idDocuments
  idDocumentBack: UploadedFile[]     // nuevo
  selfieDocument: UploadedFile[]     // nuevo (opcional)
  profilePhotos: UploadedFile[]      // sin cambio
  dataConfirmed: boolean             // sin cambio
  wishlistUrl: string                // sin cambio
  instagramHandle: string            // sin cambio
  tiktokHandle: string               // sin cambio
  twitterHandle: string              // sin cambio
  onlyfansUrl: string                // sin cambio
  otrasPlataformas: string           // sin cambio
  linkOtrasPlataformas: string       // nuevo
}
```

---

### 2. Cambios en la UI de Step2Documentation.tsx

**A. Seccion de Documentos de Identidad** -- reemplazar el cargador unico por 3 cargadores:
- "Documento de Identidad (Frente)" -- cargador con icono Upload
- "Documento de Identidad (Reverso)" -- cargador con icono Upload
- "Selfie con Documento (Opcional)" -- cargador con icono Camera, texto indicando que es opcional

**B. Seccion de Wishlist** -- agregar tooltip con icono Info:
- Texto: "Permite a tu equipo gestionar regalos de tus fans y aumentar tu monetizacion"

**C. Seccion de Redes Sociales** -- agregar tooltip con icono Info al titulo:
- Texto: "Vital para la auditoria de marca y sincronizacion del tono de voz"

**D. Nuevo campo "Link de otras plataformas"** -- debajo del Textarea existente de "Otras plataformas":
- Input type="url" con placeholder "https://fansly.com/usuario, https://chaturbate.com/usuario"
- Label: "URLs exactas de otras plataformas"

**E. Estado interno de upload** -- cambiar `uploadCategory` de `"contracts" | "extras"` a `"id-front" | "id-back" | "selfie" | "extras"`, y mapear los 3 primeros a la categoria "contracts" del FileUploadModal.

---

### 3. Cambios en OnboardingWizard.tsx

- **initialStep3Doc**: reemplazar `idDocuments: []` por `idDocumentFront: [], idDocumentBack: [], selfieDocument: []`; agregar `linkOtrasPlataformas: ""`
- **Hidratacion (useEffect)**: sin cambios significativos (los documentos se cargan por separado desde creator_documents, no desde internal_notes)
- **buildPayload**: actualizar la seccion `documents` para mapear los 3 arrays de documentos con descripciones distintas ("Documento de identidad (frente)", "Documento de identidad (reverso)", "Selfie con documento"); agregar `linkOtrasPlataformas` a `extraData`

---

### 4. Imports adicionales en Step2Documentation.tsx

- `Info` de lucide-react (para tooltips)
- `Camera` de lucide-react (para icono de selfie)
- `Tooltip, TooltipTrigger, TooltipContent, TooltipProvider` de `@/components/ui/tooltip`

---

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/creadores/onboarding/steps/Step2Documentation.tsx` | Dividir cargador en 3, agregar campo linkOtrasPlataformas, agregar tooltips |
| `src/pages/creadores/onboarding/OnboardingWizard.tsx` | Actualizar initialStep3Doc, buildPayload con nuevos arrays de documentos y campo linkOtrasPlataformas |

### Notas tecnicas

- Los 3 cargadores de identidad comparten la categoria "contracts" del FileUploadModal para reutilizar las restricciones de formato existentes (PDF, Word, Imagenes, max 10MB)
- El campo `linkOtrasPlataformas` se persiste en `extraData` (JSON en `internal_notes`)
- No se requieren cambios en la base de datos
- Los tooltips usan el patron `TooltipProvider > Tooltip > TooltipTrigger > TooltipContent` con `max-w-xs`
