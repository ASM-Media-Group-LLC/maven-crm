

# Plan: Usar PhoneInput en formularios de Closers

## Problema
En `/contactos` los teléfonos se capturan con `PhoneInput` (incluye código de país automáticamente), por eso los enlaces WhatsApp funcionan. En `/closers`, se usa un `<Input>` de texto libre sin validación de formato — si el usuario escribe el número sin código de país, el enlace `wa.me/` falla.

## Solución
Reemplazar el `<Input>` de teléfono por `<PhoneInput>` en los 3 formularios de Closers:

| Archivo | Cambio |
|---------|--------|
| `NewCreatorModal.tsx` | Cambiar `<Input>` por `<PhoneInput>` en campo Teléfono |
| `EditCreatorModal.tsx` | Cambiar `<Input>` por `<PhoneInput>` en campo Teléfono |
| `NuevoCreadorForm.tsx` (stepper) | Verificar y cambiar a `<PhoneInput>` si aplica |

Esto garantiza que todos los números se almacenen con código de país (ej. `+573001234567`) y los enlaces `wa.me/` funcionen correctamente, igual que en `/contactos`.

