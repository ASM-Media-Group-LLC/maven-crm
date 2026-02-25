

## Plan: Simplificar cards de proyecto y rediseñar header interno

### Cambios en cards de proyecto (`ProjectsListContent.tsx`)

**Conteos de tareas**: Mostrar solo iconos + número (sin texto), formato compacto:
- `🕐 1` `▶ 0` `✅ 0` — iconos con contador, sin labels como "pendientes", "en curso", etc.
- Mantener el icono de vencidas solo si > 0.

**Líder de equipo**: Mostrar con icono `Crown` (corona) + nombre completo en `text-sm font-semibold`, sin el prefijo "Líder:". Usar un estilo más integrado (no badge con fondo) sino como línea dedicada con icono + nombre.

**Progress bar**: Mantener como está (h-2.5), ya es razonable.

### Cambios en header interno del proyecto (`TareasContent.tsx`)

**Descripción**: Sacarla de la card/banner y colocarla como texto simple debajo del título `h1`, como un subtítulo normal (`text-sm text-muted-foreground max-w-2xl`), similar a como se hacía antes pero con ancho limitado.

**Líder del proyecto**: Sacarlo del banner y mostrarlo también debajo de la descripción con icono `Crown` + nombre, como línea independiente, visible y prominente.

**Progress bar**: Eliminar la barra lineal del banner. En su lugar, agregar una card de progreso circular antes de las KPI cards. La card mostrará:
- Un indicador circular (SVG donut) con el porcentaje en el centro.
- Los conteos de tareas debajo como referencia compacta.
- Título "Progreso del proyecto".

**Eliminar el banner `bg-card` completo** — la info se redistribuye: descripción y líder van al header, progreso va a una card dedicada.

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/tareas/ProjectsListContent.tsx` | Conteos solo icono+número, líder con Crown+nombre sin badge |
| `src/pages/tareas/TareasContent.tsx` | Descripción como subtítulo, líder debajo, eliminar banner, card circular de progreso antes de KPIs |

