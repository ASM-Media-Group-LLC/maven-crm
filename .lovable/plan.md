

# Mejoras de UI: Logo gradient, iconos sociales e interacciones en KPI cards

## 1. Logo con gradiente violeta a azul

Modificar `src/components/Logo.tsx` para que la palabra "Maven" use un gradiente CSS que va de violeta (`accent` / purple) a azul (`primary`), usando `bg-gradient-to-r`, `bg-clip-text` y `text-transparent`.

**Archivo:** `src/components/Logo.tsx`

## 2. Iconos de redes sociales estilo Instagram

Reemplazar el icono generico de Lucide `Instagram` por un SVG custom con el gradiente caracteristico de Instagram (rosa-violeta-naranja), usando los tokens `instagram-pink`, `instagram-purple` e `instagram-orange` ya definidos en el sistema. Se creara un componente `InstagramIcon` en `src/components/icons/InstagramIcon.tsx` con un SVG que aplica un `linearGradient` con esos colores.

Se usara este componente en los 4 archivos donde aparece el icono de Instagram:
- `src/pages/creadores/CreadoresTable.tsx`
- `src/pages/creadores/CreadoresGrid.tsx`
- `src/pages/creadores/ViewCreadorModal.tsx`
- `src/pages/creadores/CreadorProfileContent.tsx`

Para TikTok y X, se crearan componentes SVG similares (`TikTokIcon`, `XIcon`) con sus colores respectivos (blanco/negro para TikTok, blanco para X) para reemplazar los textos "TT" y el caracter unicode.

**Archivos nuevos:**
- `src/components/icons/InstagramIcon.tsx`
- `src/components/icons/TikTokIcon.tsx`
- `src/components/icons/XIcon.tsx`

**Archivos modificados:**
- `src/pages/creadores/CreadoresTable.tsx`
- `src/pages/creadores/CreadoresGrid.tsx`
- `src/pages/creadores/ViewCreadorModal.tsx`
- `src/pages/creadores/CreadorProfileContent.tsx`

## 3. Hover con sombra de color en KPI cards

Agregar una transicion `hover` a cada card en `CreadoresKPICards.tsx` que aplique un `box-shadow` del color correspondiente:

- **Activas** (success/verde): `hover:shadow-[0_0_20px_hsl(var(--success)/0.3)]`
- **Onboarding** (primary/azul): `hover:shadow-[0_0_20px_hsl(var(--primary)/0.3)]`
- **Pausadas** (warning/amarillo): `hover:shadow-[0_0_20px_hsl(var(--warning)/0.3)]`
- **Retiros** (destructive/rojo): `hover:shadow-[0_0_20px_hsl(var(--destructive)/0.3)]`
- **Terminadas** (muted/gris): `hover:shadow-[0_0_20px_hsl(var(--muted-foreground)/0.15)]`

Cada card tambien recibira una propiedad `hoverClass` con la sombra correspondiente, aplicada con `transition-shadow duration-200`.

**Archivo:** `src/pages/creadores/CreadoresKPICards.tsx`

## Resumen de archivos

| Archivo | Accion |
|---|---|
| `src/components/Logo.tsx` | Modificar -- gradiente violeta-azul |
| `src/components/icons/InstagramIcon.tsx` | Crear -- SVG con gradiente |
| `src/components/icons/TikTokIcon.tsx` | Crear -- SVG de TikTok |
| `src/components/icons/XIcon.tsx` | Crear -- SVG de X |
| `src/pages/creadores/CreadoresKPICards.tsx` | Modificar -- hover shadow coloreado |
| `src/pages/creadores/CreadoresTable.tsx` | Modificar -- usar iconos custom |
| `src/pages/creadores/CreadoresGrid.tsx` | Modificar -- usar iconos custom |
| `src/pages/creadores/ViewCreadorModal.tsx` | Modificar -- usar iconos custom |
| `src/pages/creadores/CreadorProfileContent.tsx` | Modificar -- usar icono Instagram custom |
