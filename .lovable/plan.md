
## Rediseño de la sección "Acciones Rápidas"

### Estado actual vs. referencia visual

**Actual:** Cuatro botones `variant="outline"` de `h-10` pequeños con ícono + texto, sin distinción visual.

**Referencia (imagen):** Cuatro tarjetas grandes tipo card con:
- Fondo con borde sutil y esquinas redondeadas
- Ícono del módulo a la izquierda con fondo de color `primary/10` (igual al cuadro del ícono en las KPI cards)
- Texto del label en `font-medium`
- Flecha `ChevronRight` a la derecha
- Hover con elevación sutil y borde resaltado (patrón estándar de la plataforma)
- Encabezado de sección con ícono ⚡ (Zap) + título "Acciones Rápidas" + subtítulo descriptivo + engranaje de config a la derecha

### Cambios específicos en `src/pages/hr/HRDashboard.tsx`

#### 1. Encabezado de la sección

Cambiar de una fila simple con label uppercase a un encabezado con ícono + título + subtítulo (idéntico al que muestra la imagen de referencia):

```
[⚡] Acciones Rápidas                                   [⚙]
Configura los atajos a las funciones que más utilizas en tu día a día
```

Usando:
- `Zap` icon con `text-primary`
- Título `text-base font-semibold`
- Subtítulo `text-sm text-muted-foreground`
- Botón de configuración con solo el ícono `Settings2` (sin texto)

#### 2. Cards de acción (reemplazar `<Button>` por tarjetas card)

Cada acción pasa de ser un `<Button variant="outline">` a un `<div>` con estilos de tarjeta interactiva:

```tsx
<div
  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 cursor-pointer
             hover:border-primary/40 hover:bg-primary/5 hover:-translate-y-[1px]
             transition-all duration-200 group"
  onClick={() => action.url && navigate(action.url)}
>
  {/* Ícono con fondo */}
  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
    <action.icon className="h-5 w-5 text-primary" />
  </div>

  {/* Label */}
  <span className="flex-1 text-sm font-medium">{action.label}</span>

  {/* Arrow */}
  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
</div>
```

Grid: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3`

#### 3. Iconos más representativos por acción

Actualizar el catálogo de acciones con íconos más descriptivos para cada módulo:

| Acción | Ícono actual | Ícono propuesto |
|---|---|---|
| Registrar Ausencia | `AlertTriangle` | `CalendarDays` |
| Ver Directorio | `Users` | `Users` (ok) |
| Agregar Empleado | `UserPlus` | `UserPlus` (ok) |
| Ver Candidatos | `Briefcase` | `Briefcase` (ok) |
| Ver Incidentes | `AlertTriangle` | `ShieldAlert` |
| Ver Capacitación | `BookOpen` | `BookOpen` (ok) |
| Ver Desempeño | `TrendingUp` | `TrendingUp` (ok) |
| Ver Asistencia | `Activity` | `ClipboardCheck` |

### Archivo a modificar

| Archivo | Sección modificada |
|---|---|
| `src/pages/hr/HRDashboard.tsx` | Lines 258–285 (sección Quick Actions) y catálogo ALL_ACTIONS |

No se tocan otras secciones del dashboard ni otros archivos.
