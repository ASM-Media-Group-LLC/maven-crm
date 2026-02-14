

## Fix Creator Sales hover + Glass Effect system-wide + Documentacion en Design System

### Problema 1: Creator Sales sin hover azul

El `CollapsibleTrigger` y el `DropdownMenuTrigger` de "Creator Sales" usan `SidebarMenuButton` sin clases custom de hover. Esto hace que hereden el estilo base gris (`hover:bg-sidebar-accent`) del componente sidebar en lugar del azul (`hover:bg-primary/10`) que tienen los demas items del grupo Menu.

**Solucion**: Agregar `className` con las clases de hover azul al `SidebarMenuButton` de Creator Sales, tanto en la version colapsada (dropdown) como expandida (collapsible). Tambien aplicar hover azul a los sub-items.

**Archivo**: `src/components/dashboard/DashboardSidebar.tsx`

Cambios especificos:
- Linea 111: Agregar `hover:bg-primary/10 hover:text-primary` al SidebarMenuButton del dropdown
- Linea 136: Agregar `hover:bg-primary/10 hover:text-primary` al SidebarMenuButton del collapsible trigger
- Lineas 146-150: Agregar hover azul a los SidebarMenuSubButton items

---

### Problema 2: Glass Effect como utilidad reutilizable

El efecto glass existe en `AuthLayout.tsx` (linea 20) como clases inline:
```
backdrop-blur-2xl bg-white/[0.03] border border-white/[0.08] rounded-2xl shadow-[0_0_80px_-20px_hsl(271,91%,50%,0.3)]
```

Se creara una clase CSS reutilizable `.glass-card` en `src/index.css` y una variante mas ligera `.glass-card-subtle` para uso en el dashboard.

**Archivo**: `src/index.css`

Nuevas clases utilitarias:
| Clase | Uso | Propiedades |
|-------|-----|-------------|
| `.glass-card` | Modales, cards destacadas | `backdrop-blur-2xl`, `bg-white/[0.03]`, `border border-white/[0.08]`, sombra violeta |
| `.glass-card-subtle` | Cards de dashboard, paneles | `backdrop-blur-md`, `bg-white/[0.02]`, `border border-white/[0.06]`, sin sombra de color |

---

### Problema 3: Documentar en Design System

Agregar una seccion "Glass Cards & Effects" dentro de la seccion de Cards del design system.

**Archivo**: `src/pages/design-system/sections/CardsSection.tsx`

Agregar al final de la seccion:
- Titulo "Glass Cards"
- Descripcion del patron
- 2-3 ejemplos visuales (glass-card y glass-card-subtle) con fondo oscuro para que se aprecie el efecto
- Codigo de referencia con las clases CSS
- Reglas de uso (cuando usar glass vs card normal)

Tambien agregar documentacion de las animaciones hover de cards en la seccion de GlobalStatesSection.

**Archivo**: `src/pages/design-system/sections/GlobalStatesSection.tsx`

Agregar:
- Seccion "Card Hover Animations" con los patrones documentados (translate-y, gradient hover, border-color transitions)
- Referencia a las animaciones wave del auth

---

### Resumen de archivos

| Archivo | Cambio |
|---------|--------|
| `src/components/dashboard/DashboardSidebar.tsx` | Agregar hover azul a Creator Sales (trigger + sub-items) |
| `src/index.css` | Crear clases `.glass-card` y `.glass-card-subtle` |
| `src/pages/design-system/sections/CardsSection.tsx` | Documentar Glass Cards con ejemplos visuales |
| `src/pages/design-system/sections/GlobalStatesSection.tsx` | Documentar patrones de hover animado en cards |

