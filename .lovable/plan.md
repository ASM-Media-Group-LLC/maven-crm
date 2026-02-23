

## Paso 3: Documentacion - Agregar Wishlist y Redes Sociales

### Resumen

Enriquecer el Step 3 (Documentacion) agregando campos de texto para el link de Wishlist de Amazon y links de redes sociales para validacion de identidad cruzada. Los uploads de documentos y foto de perfil se mantienen intactos.

---

### Archivos a modificar

**1. `src/pages/creadores/onboarding/steps/Step2Documentation.tsx`** - Agregar campos de links
**2. `src/pages/creadores/onboarding/OnboardingWizard.tsx`** - Extender Step2Data, initialStep3Doc, carga y payload

---

### Campos nuevos en Step2Data

| Campo | Tipo | Columna BD | Almacenamiento |
|-------|------|------------|----------------|
| `wishlistUrl` | string (input) | `wishlist_url` | Columna directa |
| `instagramHandle` | string (input) | `instagram_handle` | Columna directa |
| `tiktokHandle` | string (input) | `tiktok_handle` | Columna directa |
| `twitterHandle` | string (input) | `twitter_handle` | Columna directa |
| `onlyfansUrl` | string (input) | `onlyfans_url` | Columna directa |
| `otrasPlataformas` | string (textarea) | -- | `internal_notes` JSON |

---

### Cambio 1: Step2Documentation.tsx (UI)

Despues de los uploads (ID y Foto) y antes del checkbox de confirmacion, agregar dos secciones:

**Seccion "Wishlist":**
- Input para "Link de Wishlist (Amazon)" con placeholder "https://amazon.com/..."

**Seccion "Redes Sociales (Verificacion)":**
- Texto explicativo: "Estos links nos ayudan a verificar tu identidad"
- Grid de 2 columnas con inputs para:
  - Instagram (con icono)
  - TikTok (con icono)
  - Twitter/X (con icono)
  - OnlyFans URL
- Textarea a ancho completo para "Otras plataformas donde vendes contenido"

Actualizar la interfaz `Step2Data` para incluir los 6 campos nuevos (todos string, default `""`).

### Cambio 2: OnboardingWizard.tsx

- Actualizar `initialStep3Doc` con los 6 campos nuevos (strings vacios)
- En el `useEffect` de carga, leer `wishlist_url`, `instagram_handle`, `tiktok_handle`, `twitter_handle`, `onlyfans_url` de columnas directas y `otrasPlataformas` de `internal_notes`
- En `buildPayload`, mapear:
  - `wishlist_url` -> columna directa
  - `instagram_handle` -> columna directa
  - `tiktok_handle` -> columna directa
  - `twitter_handle` -> columna directa
  - `onlyfans_url` -> columna directa
  - `otrasPlataformas` -> `extraData` en `internal_notes`

### Layout visual actualizado del Paso 3

```text
[Upload: Documento de Identidad]
[Archivos subidos...]

[Upload: Foto de Perfil]
[Archivos subidos...]

--- Wishlist ---
[Link de Wishlist (Amazon) - full width]

--- Redes Sociales (Verificacion de Identidad) ---
[Instagram]              [TikTok]
[Twitter/X]              [OnlyFans URL]
[Otras plataformas (textarea full width)]

[x] Confirmo que los datos son correctos
[Estado: Pendiente]
```

