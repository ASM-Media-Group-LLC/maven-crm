

# Ajustar tabla de Creadores segun mockup

## Resumen
Actualizar `CreadoresTable.tsx` para que coincida con el diseno del mockup: badges de categoria con colores, banderas emoji en ubicacion, icono de edificio en agencia, iconos de redes sociales con color, y columna de acciones con botones individuales (refresh, editar, ver) en lugar del dropdown.

## Cambios en `src/pages/creadores/CreadoresTable.tsx`

### 1. Categoria con badge coloreado
Reemplazar el badge generico `variant="secondary"` por badges con colores segun la categoria, reutilizando el mismo mapeo que usa `CreadoresGrid`:
- A+: `success-soft`
- A: `primary-soft`
- B+: `warning-soft`
- B: `secondary-soft`
- C: `destructive-soft`

### 2. Estado con label traducido
Agregar mapeo de labels para mostrar "Onboarding", "Activa", "Pausada", etc. en lugar del valor crudo de la base de datos. Usar el mismo `statusLabel` que `CreadoresGrid`.

### 3. Ubicacion con bandera emoji
Agregar la funcion `getFlagEmoji` (misma que usa `CreadoresGrid`) para mostrar la bandera del pais junto a la ciudad. Formato: `[bandera] Ciudad`.

### 4. Agencia con icono de edificio
Agregar el icono `Building2` antes del nombre de la agencia. Si hay `kash_type`, concatenar con " . Mas..." truncado.

### 5. Redes sociales con iconos de color
Mostrar iconos de Instagram, TikTok y Twitter con estilos visibles (no solo gris). Agregar soporte para `tiktok_handle` y `twitter_handle` ademas del `instagram_handle` existente.

### 6. Columna Acciones con botones individuales
Reemplazar el dropdown menu con 3 botones de icono visibles:
- `RefreshCw` (actualizar/sync)
- `Pencil` (editar)
- `Eye` (ver perfil)

Cambiar el header de la columna vacia a "Acciones".

### 7. Avatar mas grande
Aumentar el avatar de `h-8 w-8` a `h-10 w-10` para coincidir mejor con el mockup.

## Archivo modificado
- `src/pages/creadores/CreadoresTable.tsx`

