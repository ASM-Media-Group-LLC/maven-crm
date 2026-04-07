

# Plan: Card ancho completo + Navegación libre entre pasos

## Cambios en `NuevoCreadorForm.tsx`

### 1. Card ocupa ancho completo
- **Línea 371**: Cambiar `max-w-4xl mx-auto` → eliminar la restricción de ancho máximo, dejando solo el contenedor con padding existente para que las cards ocupen todo el ancho disponible.

### 2. Permitir avanzar sin llenar campos obligatorios
- **Función `goNext` (línea 214)**: Eliminar la validación bloqueante. Solo validar al hacer submit final (paso 5, botón Guardar).
- **Función `goToStep` (línea 227)**: Permitir saltar a cualquier paso sin validar los intermedios.
- La validación se mantiene solo en `handleSubmit` para que al guardar sí se verifiquen los campos obligatorios.

## Archivo modificado
| Archivo | Cambio |
|---------|--------|
| `NuevoCreadorForm.tsx` | Quitar `max-w-4xl`, hacer navegación libre sin validación bloqueante |

