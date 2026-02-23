

## Refactorizacion del Paso 1: Campos Faltantes

### Resumen

Agregar 7 nuevos campos al Paso 1 del onboarding, organizados en 2 nuevas secciones visuales, mas 2 campos adicionales en la seccion existente de datos basicos.

---

### 1. Nuevos campos en Step1Data (interface)

| Campo | Tipo | Seccion |
|-------|------|---------|
| `segundoNombre` | string | Datos basicos |
| `direccion` | string | Datos basicos (ancho completo, Textarea) |
| `apodos` | string | Perfil Artistico (nuevo bloque) |
| `edadMostrar` | string (numerico) | Perfil Artistico |
| `ubicacionArtistica` | string | Perfil Artistico |
| `redesSociales` | string | Conectividad (nuevo bloque) |
| `wishlistAmazon` | string (URL) | Conectividad |

---

### 2. Cambios en la UI de Step1PersonalInfo.tsx

Orden de secciones resultante:
1. **Datos basicos** (existente) -- agregar `segundoNombre` al lado de "Nombre completo", y `direccion` (Textarea, ancho completo) despues de "Ciudad"
2. **Perfil Artistico** (nuevo SectionLabel) -- antes de "Identidad Visual", con `apodos`, `edadMostrar`, `ubicacionArtistica`
3. **Identidad Visual** (existente, sin cambios)
4. **Idiomas** (existente, sin cambios)
5. **Conectividad** (nuevo SectionLabel) -- antes de "Privacidad", con `redesSociales` (ancho completo) y `wishlistAmazon`
6. **Privacidad** (existente, sin cambios)

---

### 3. Cambios en OnboardingWizard.tsx

- **initialStep1**: agregar los 7 campos con valor `""`
- **Hidratacion (useEffect)**: cargar `segundoNombre`, `direccion`, `apodos`, `edadMostrar`, `ubicacionArtistica` desde `extraData`; `redesSociales` y `wishlistAmazon` tambien desde `extraData`
- **buildPayload**: serializar los 7 campos nuevos en el objeto `extraData` (JSON en `internal_notes`)

No se necesitan cambios en la base de datos ya que todo se persiste en el campo JSON `internal_notes`.

---

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/creadores/onboarding/steps/Step1PersonalInfo.tsx` | Agregar 7 campos a la interface, agregar UI con 2 nuevas secciones |
| `src/pages/creadores/onboarding/OnboardingWizard.tsx` | Actualizar initialStep1, hidratacion y buildPayload con los 7 campos |

### Notas tecnicas

- Los campos `direccion` y `redesSociales` usan `Textarea` con `md:col-span-2` para ancho completo
- `edadMostrar` usa `Input type="number" min={18}` igual que el campo de edad existente
- `wishlistAmazon` usa `Input type="url"` con placeholder de ejemplo
- No se agrega validacion obligatoria a ninguno de estos campos (son opcionales segun el requisito de que solo Paso 1 basico y Paso 4 son obligatorios)

