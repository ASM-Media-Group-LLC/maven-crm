

## Ajuste de Navegacion: Estado "En Revision" al Finalizar

### Resumen

El boton "Finalizar" ya guarda toda la informacion y establece el estado `pendiente_verificacion` en la base de datos. El unico cambio necesario es **renombrar la etiqueta visible** de "Pendiente Verificacion" a "En Revision" en todos los componentes de la interfaz.

No se cambia el valor interno en la base de datos (`pendiente_verificacion`) para no romper logica existente (verificacion, KPIs, filtros). Solo se actualiza el texto que ve el usuario.

---

### Archivos a modificar (cambio de label)

| Archivo | Cambio |
|---------|--------|
| `src/pages/creadores/CreadoresTable.tsx` | `pendiente_verificacion: "Pendiente Verificación"` → `"En Revisión"` |
| `src/pages/creadores/CreadoresGrid.tsx` | `pendiente_verificacion: "Pendiente Verificación"` → `"En Revisión"` |
| `src/pages/creadores/onboarding/OnboardingWizard.tsx` | Badge text `"Pendiente verificación"` → `"En Revisión"` |
| `src/pages/creadores/onboarding/useOnboarding.ts` | `getStepLabel`: `"Pendiente de aprobación"` → `"En Revisión"` |

### Sin cambios en

- Base de datos: el valor interno sigue siendo `pendiente_verificacion`
- Logica de verificacion (`VerificationSection.tsx`): sigue funcionando igual
- KPIs y conteos: sin cambios
- `buildPayload` en OnboardingWizard: ya establece correctamente `status: "pendiente_verificacion"` al finalizar

### Seccion tecnica

El flujo actual al presionar "Finalizar":
1. Valida Step 1 (campos requeridos)
2. Llama `buildPayload(false)` que establece `status: "pendiente_verificacion"`
3. Inserta/actualiza en tabla `creators` y `creator_business`
4. Inserta notificacion de tipo `onboarding_complete`
5. Cierra el wizard y vuelve a la lista

Todo esto ya funciona. Solo se renombra el label visible en 4 archivos.
