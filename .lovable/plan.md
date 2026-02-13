

## Agregar fondos de color a las cards de Red Social y Plataforma

### Problema
Las cards de "Red Social" y "Plataforma" no tienen fondo de color. Actualmente usan el fondo default del componente Card (bg-card). Segun el diseno de referencia, cada card deberia tener un fondo sutil del color de su marca.

### Solucion

**Archivo:** `src/pages/promolog/PromologContent.tsx`

**Cambio 1 - Agregar propiedad `bg` a los datos mock:**

Agregar un campo `bg` (clase de Tailwind) a cada elemento de `socialCards` y `platformCards`:

| Card | Fondo |
|---|---|
| Instagram | `bg-pink-500/10` |
| TikTok | `bg-slate-500/10` |
| X | `bg-slate-500/10` |
| Telegram | `bg-blue-500/10` |
| OnlyFans | `bg-blue-500/10` |
| Unlok | `bg-purple-500/10` |
| Otra | `bg-muted/50` |

Los fondos usan opacidad baja (`/10`) para ser sutiles y no interferir con la legibilidad del texto.

**Cambio 2 - Aplicar el fondo en el render:**

En ambos `.map()` (lineas 315 y 333), pasar la clase `bg` al componente `Card`:

```tsx
<Card key={s.name} className={s.bg}>
```

Esto sobreescribe el `bg-card` default del componente Card con el fondo de color sutil correspondiente a cada red/plataforma.

