

## Animaciones hover en cards del Dashboard y colores de acento en el Sidebar

### 1. Cards del Dashboard - Animaciones hover mejoradas

#### KPI Cards (ya tienen hover con scale y gradiente - se mantienen)
Las 5 KPI cards superiores ya tienen animaciones hover avanzadas. No se modifican.

#### Cards de graficos y contenido (Row 2 y Row 3) - NUEVAS animaciones
Las 6 cards de contenido (Rendimiento Semanal, Actividad Reciente, Pipeline, Top 5, Deals Semanales) actualmente no tienen hover. Se agregara:
- Transicion suave de borde: `hover:border-primary/30` (o color semantico correspondiente)
- Elevacion sutil sin sombra: `hover:translate-y-[-2px]` con `transition-all duration-300`

#### Cards operacionales (Row 4) - NUEVAS animaciones
Las 3 cards con borde superior de color (Customer Service, Closers, Scripts) recibiran:
- `hover:translate-y-[-2px]` para efecto de elevacion
- Fondo con gradiente sutil del color correspondiente: `hover:bg-gradient-to-b hover:from-[color]/5 hover:to-transparent`
- `transition-all duration-300`

Mapeo de colores por card operacional:
| Card | Color del borde | Hover gradient |
|------|----------------|----------------|
| Customer Service | destructive | `hover:from-destructive/5` |
| Closers | primary | `hover:from-primary/5` |
| Scripts & Tools | accent | `hover:from-accent/5` |

### 2. Sidebar - Colores de acento diferenciados

Actualmente todos los items del sidebar usan el mismo `hover:bg-sidebar-accent` gris. Se diferenciaran por grupo usando colores del sistema:

#### Grupo "Menu" (items principales)
- Hover: `hover:bg-primary/10 hover:text-primary`
- Activo: `bg-primary/15 text-primary border-l-2 border-l-primary font-medium`

#### Grupo "Operaciones"
- Hover: `hover:bg-accent/10 hover:text-accent`
- Activo: `bg-accent/15 text-accent border-l-2 border-l-accent font-medium`

#### Grupo "Recursos"
- Hover: `hover:bg-muted hover:text-foreground` (mantener neutro)
- Activo: `bg-muted text-foreground font-medium`

Esto crea una jerarquia visual clara: azul para navegacion principal, violeta para operaciones, neutro para recursos.

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/dashboard/DashboardContent.tsx` | Agregar clases hover a las 9 cards de contenido y operacionales |
| `src/components/dashboard/DashboardSidebar.tsx` | Diferenciar colores hover/active por grupo de navegacion |

### Detalles tecnicos

En `DashboardContent.tsx`:
- Cards Row 2-3: agregar `className="transition-all duration-300 hover:translate-y-[-2px] hover:border-primary/30"` (variando color por card)
- Cards Row 4: agregar hover gradient al className existente, ej: `"border-t-[3px] border-t-destructive transition-all duration-300 hover:translate-y-[-2px] hover:bg-gradient-to-b hover:from-destructive/5 hover:to-transparent"`

En `DashboardSidebar.tsx`:
- Reemplazar las clases `hover:bg-sidebar-accent hover:text-sidebar-accent-foreground` y `activeClassName` por las variantes coloreadas segun el grupo
- Para el submenu "Creator Sales", mantener el color primary heredado del grupo Menu

