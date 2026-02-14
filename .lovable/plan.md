

## Ajuste de logo y contraste tipografico en Auth

### Problemas detectados

1. **Logo demasiado pequeno**: `size="sm"` usa `text-2xl` (1.5rem). Necesita ser `size="md"` que usa `text-4xl` (2.25rem) - un punto intermedio entre el sm actual y el lg anterior.

2. **"CRM" poco legible**: El Logo usa `text-muted-foreground` para "CRM", que sobre el fondo casi negro (`hsl(240,10%,2%)`) no tiene suficiente contraste. Solucion: usar `text-white/60` en vez de `text-muted-foreground` cuando se usa en contexto auth.

3. **Tagline poco legible**: `text-white/40` con `text-sm` es demasiado tenue. Subir a `text-white/60` y `text-sm` (mantener tamano pero mejorar opacidad).

4. **Textos dentro de la card**: Los labels usan `text-white/70` y subtitulos `text-white/50` - estos estan bien pero vale revisar consistencia.

### Cambios por archivo

#### `src/components/auth/AuthLayout.tsx`
- Logo: cambiar `size="sm"` a `size="md"`
- Tagline: cambiar `text-white/40` a `text-white/60`

#### `src/components/Logo.tsx`
- No modificar el componente global. En su lugar, pasar un className desde AuthLayout para sobreescribir el color de "CRM" en contexto oscuro. Alternativa: agregar una prop `variant` al Logo.

La solucion mas limpia sin modificar Logo.tsx globalmente es pasar `className` con un override CSS. Pero `text-muted-foreground` en el span interno no se puede sobreescribir facilmente con className en el wrapper.

Solucion: modificar Logo.tsx para aceptar una prop `lightCRM` o simplemente cambiar `text-muted-foreground` a `text-white/50` que funciona bien tanto en el sidebar (fondo oscuro) como en auth. Revisando el sidebar tambien usa fondo oscuro, asi que `text-white/50` es consistente.

**Cambio en Logo.tsx**: reemplazar `text-muted-foreground` por `text-white/50` en el span de "CRM". Esto mantiene legibilidad en todos los contextos oscuros del app.

### Resumen de cambios

| Archivo | Cambio |
|---------|--------|
| `src/components/auth/AuthLayout.tsx` | Logo `size="md"`, tagline `text-white/60` |
| `src/components/Logo.tsx` | "CRM" span: `text-muted-foreground` a `text-white/50` |

