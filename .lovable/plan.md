

# Limpiar cards operacionales y hacer el FAB mas sutil

## Resumen

Se eliminaran las cards "Calendario" y "Todas" del grid operacional, y se simplificara el boton flotante de Clari AI para que sea mas sutil (sin el circulo "AI" girando).

## Cambios

### 1. Eliminar cards "Calendario" y "Todas" de `SalesOperationalCards.tsx`

Remover los objetos con `id: "calendar"` y `id: "todas"` del array de cards. El grid pasara de 7 a 5 cards (Comparativas, Top 10, Bajando, Alto Potencial, Alertas). Tambien se eliminaran los imports no usados (`CalendarDays`, `LayoutGrid`) y el prop `eventCount` que ya no sera necesario.

### 2. Simplificar el boton flotante en `ClariAiFab.tsx`

**Quitar**: El badge circular con texto "AI" que flota sobre el boton (el `<span>` con `absolute -top-1 -right-1`).

**Simplificar animacion**: Reemplazar `animate-clari-pulse` (box-shadow pulsante) por un efecto mas sutil: solo un brillo suave en reposo usando `shadow-md` y en hover `hover:shadow-xl hover:scale-110`. Sin animacion continua, el boton se vera elegante pero sin distracciones.

### 3. Verificacion de headers (sin cambios necesarios)

Se revisaron todos los headers de las paginas internas (Top10Page, SubiendoPage, BajandoPage, AltoPotencialPage, EnRiesgoPage, ComparativasHeader) y todos usan el mismo patron consistente:
- Breadcrumb: `text-xs text-muted-foreground` con `ChevronRight h-3 w-3`
- Titulo: `text-2xl font-bold text-foreground`
- Subtitulo: `text-sm text-muted-foreground`
- Filtros de periodo: `flex gap-1 bg-muted/50 rounded-lg p-1` con `Button size="sm" className="text-xs"`

No se requieren cambios en los headers ya que son consistentes.

## Archivos a modificar

- `src/pages/sales-overview/SalesOperationalCards.tsx` -- eliminar cards "calendar" y "todas", limpiar imports y props
- `src/components/ClariAiFab.tsx` -- quitar badge "AI", simplificar animacion

