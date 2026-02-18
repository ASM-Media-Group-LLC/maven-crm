

## Mejoras en Eventos: Tab Bars sin etiquetas + Shared Agenda moderna

### 1. Quitar etiquetas "Proyecto:" y "Estado:" en EventosContent.tsx

Se eliminaran las etiquetas de texto que se agregaron junto a cada tab bar. Los tabs quedaran apilados verticalmente sin prefijos, como estaban antes pero con la separacion visual correcta.

**Cambio**: Quitar los `<span>` con "Proyecto:" y "Estado:" y los wrappers `flex items-center gap-3`, dejando solo los tab bars con su contenedor `inline-flex`.

---

### 2. Rediseno moderno de SharedAgendaPage.tsx

#### Tab Bar de proyectos con colores distintivos
- Cada tab tendra un indicador visual de color cuando este activo:
  - "Todos": estilo secondary normal
  - "Ora": borde inferior o fondo azul sutil
  - "Kash": purpura
  - "Trafix": ambar
  - "Unlok": esmeralda
- Cuando un tab esta seleccionado, usara el color del proyecto como fondo sutil y texto coloreado
- Cada tab incluira un punto de color a la izquierda del nombre

#### Cards de proximos eventos con borde lateral de color
- Cada tarjeta tendra un borde izquierdo de 3px con el color del proyecto (azul para Ora, purpura para Kash, etc.)
- Hover con transicion suave de elevacion (shadow) y escala sutil
- Badge de proyecto con fondo coloreado mas prominente

#### Cards de detalle de evento con acento de color
- Borde superior de 3px con el color del proyecto
- Badges de proyecto mas grandes y prominentes
- Mejor separacion visual entre secciones (hora, ubicacion, descripcion, invitados)

#### Calendario con indicadores de color por proyecto
- Los puntos indicadores de eventos en el calendario usaran el color del proyecto en lugar de un punto generico primary
- Si hay eventos de multiples proyectos en un dia, se mostraran multiples puntos de colores

#### Mejoras de interactividad
- Transiciones suaves en hover de cards y botones del calendario
- Efecto hover en dias del calendario mas pronunciado
- Scroll horizontal de proximos eventos con snap suave

---

### Seccion tecnica

**Archivos a modificar:**

1. `src/pages/eventos/EventosContent.tsx` (lineas 122-154): Quitar spans de etiquetas y wrappers flex, dejar solo los contenedores de tabs

2. `src/pages/eventos/SharedAgendaPage.tsx`:
   - **Tab bar** (lineas 200-214): Reemplazar botones genericos por botones con indicador de color por proyecto (punto coloreado + fondo/texto coloreado cuando activo)
   - **UpcomingEventCard** (lineas 327-361): Agregar `border-l-[3px]` con el color del proyecto, mejorar hover con `hover:shadow-lg hover:scale-[1.02] transition-all duration-200`
   - **EventDetailCard** (lineas 377-457): Agregar `border-t-[3px]` con color del proyecto, mejorar layout visual
   - **Calendario** (lineas 255-282): Cambiar el punto indicador para usar el color del proyecto del primer evento de ese dia, y mostrar hasta 3 puntos si hay eventos de diferentes proyectos

