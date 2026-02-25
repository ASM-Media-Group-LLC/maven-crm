

## Plan: Rediseñar el selector de mes/año del DateInput y documentar en Design System

### Problema actual

El `DateInput` usa `captionLayout="dropdown-buttons"` de `react-day-picker`, que renderiza `<select>` nativos del navegador para mes y año. Estos selectores se ven inconsistentes con el design system (sin estilo, sin bordes redondeados adecuados, sin hover states) y el estilo aplicado via `classNames.dropdown` tiene limitaciones porque sigue siendo un `<select>` nativo.

### Solución

Reemplazar los dropdowns nativos por un header custom con:
1. **Flechas de navegación** (izquierda/derecha) para cambiar mes a mes
2. **Selector de mes**: botón que abre un grid de 12 meses (ene-dic) en un popover interno
3. **Selector de año**: botón que abre una lista scrolleable de años en un popover interno
4. Todo usando componentes Shadcn (Button, Popover, ScrollArea) para consistencia total

### Diseño visual del header

```text
┌─────────────────────────────────────┐
│  ◂   [ Febrero ▾ ] [ 2026 ▾ ]   ▸  │
├─────────────────────────────────────┤
│  lu  ma  mi  ju  vi  sá  do        │
│  ...calendario...                   │
├─────────────────────────────────────┤
│  [ dd/mm/aaaa ]                     │
│  ─────────────────────────────────  │
│               Cancelar   Aplicar    │
└─────────────────────────────────────┘
```

Al hacer click en "Febrero":
```text
┌───────────────────┐
│ Ene  Feb  Mar  Abr│
│ May  Jun  Jul  Ago│
│ Sep  Oct  Nov  Dic│
└───────────────────┘
```

Al hacer click en "2026":
```text
┌─────────────┐
│ 2020        │
│ 2021        │
│ 2022        │
│ ...scroll...│
│ 2030        │
└─────────────┘
```

### Cambios

| Archivo | Cambio |
|---------|--------|
| `src/components/ui/date-input.tsx` | Reescribir: quitar `captionLayout="dropdown-buttons"`, usar `captionLayout="buttons"` con componente custom `Caption` que renderiza popovers estilizados para mes y año |
| `src/pages/design-system/sections/InputsSection.tsx` | Actualizar la documentación del DateInput para reflejar el nuevo diseño del selector de mes/año |

### Detalle técnico

**`date-input.tsx`**:
- Quitar `captionLayout="dropdown-buttons"`, `fromYear`, `toYear` del DayPicker
- Controlar el mes mostrado con state (`displayMonth`) via `month` + `onMonthChange` props del DayPicker
- Renderizar un header custom encima del DayPicker con:
  - Botón `◂` para retroceder un mes
  - Popover con grid 4x3 para selección de mes (nombres cortos en español)
  - Popover con ScrollArea para selección de año (rango fromYear-toYear)
  - Botón `▸` para avanzar un mes
- Eliminar los classNames de `dropdown`, `dropdown_month`, `dropdown_year`, `dropdown_icon`, `caption_dropdowns`
- Ocultar la navegación nativa de DayPicker (`nav: "hidden"`, `caption: "hidden"`) ya que el header custom la reemplaza

**`InputsSection.tsx`**:
- Actualizar el texto descriptivo para mencionar "selectores estilizados de mes y año" en vez de "dropdowns"
- Agregar nota sobre la consistencia con el design system

