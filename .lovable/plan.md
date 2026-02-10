

# Ajustar tab Redes al sistema de diseno

## Problemas detectados

1. **Divs manuales en lugar de Card**: El sistema de diseno indica "Usar siempre el componente Card, no crear divs con estilos manuales". Actualmente se usan `<div className="rounded-lg border border-border bg-card p-4 ...">` en lugar del componente `Card`.
2. **Hover incorrecto**: Se usa `hover:bg-primary hover:border-primary` (color solido). El sistema de diseno define el patron de hover como: `hover:scale-[1.03] hover:bg-gradient-to-br hover:from-primary/15 hover:to-transparent hover:border-primary/40` con `transition-all duration-200`.
3. **Transicion incorrecta**: Se usa `transition-colors` en lugar de `transition-all`.

## Cambios

**Archivo unico:** `src/pages/creadores/RedesTabContent.tsx`

### 1. Reemplazar divs manuales por componente Card

Cada card de plataforma pasara a usar el componente `Card` de shadcn importado desde `@/components/ui/card`. Se aplicara el hover con gradiente primary del sistema de diseno en lugar del color solido actual.

### 2. Aplicar hover del sistema de diseno

Reemplazar:
```
hover:bg-primary hover:border-primary transition-colors duration-200
```

Por el patron documentado en CardsSection:
```
cursor-pointer transition-all duration-200 hover:scale-[1.03] hover:bg-gradient-to-br hover:from-primary/15 hover:to-transparent hover:border-primary/40
```

### 3. Eliminar clases de hover en textos e iconos hijos

Ya no es necesario cambiar texto a `primary-foreground` en hover (el fondo ahora es un gradiente sutil, no un color solido). Se eliminan todas las clases `group-hover:text-primary-foreground` y `group-hover:bg-primary-foreground/20`.

### 4. Agregar import de Card

Agregar `import { Card } from "@/components/ui/card"` y eliminar las clases manuales de borde/fondo/sombra que el componente Card ya provee.

## Resultado visual

Las cards tendran un efecto hover sutil con escala 1.03 y gradiente primary semitransparente, consistente con las KPI/Metric Cards del design system, en lugar del cambio de color solido actual.
