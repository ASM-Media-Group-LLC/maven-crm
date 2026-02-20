

## Renombrar servicios en la tabla de precios

### Cambios

**Archivo:** `src/pages/creadores/onboarding/steps/Step4WorkConfig.tsx`

Dos cambios de label en el array `SERVICES`:

| Key | Antes | Despues |
|---|---|---|
| `sesiones_video` | Sesiones de Video en Vivo | Videollamadas |
| `envio_articulos` | Envío de Artículos Físicos | Venta de Ropa Interior |

Las keys internas se mantienen para no romper datos existentes en `precios_contenido`.

