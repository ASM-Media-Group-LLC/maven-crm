

## Rediseno visual del Calendario y Proximos Eventos

### Objetivo

Transformar la vista actual del calendario y la tarjeta de proximos eventos en una interfaz mas moderna, visualmente atractiva y con mejor experiencia de usuario.

### Cambios planificados

#### 1. Calendario mejorado (`EventosCalendar.tsx`)

**Header del calendario:**
- Tipografia mas grande y bold para el mes/ano
- Botones de navegacion con estilo pill/rounded mas moderno
- Indicador visual del conteo de eventos en el header (badge con numero)

**Dias del calendario:**
- Celdas mas grandes y espaciadas
- El dia actual tendra un circulo con gradiente primary en lugar de un simple fondo gris
- Los dias con eventos tendran un dot indicator con animacion pulse sutil
- Al hacer hover sobre un dia con evento, se mostrara un efecto de elevacion suave

**Footer del calendario:**
- Barra de resumen con gradiente sutil y borde redondeado
- Iconos decorativos junto al conteo

#### 2. Tarjeta de Proximos Eventos

**Header de la tarjeta:**
- Titulo con icono animado
- Linea decorativa con gradiente debajo del titulo

**Tarjetas de evento individual:**
- Borde izquierdo de color segun el tipo de evento (Shooting=azul, Podcast=violeta, Casting=verde, Reunion=naranja, Otro=gris)
- Icono del tipo de evento con fondo gradiente en lugar de color solido
- Fecha formateada mas prominente (dia + mes en columna a la izquierda)
- Efecto hover con elevacion y transicion suave
- Badge de "Hoy" cuando el evento es del dia actual (distinto al de "Proximo")
- Mostrar hora del evento si esta disponible (`start_time`)

#### 3. Estilos CSS (`index.css`)

- Mejorar el indicador de punto del calendario con animacion pulse
- Agregar clases utilitarias para los bordes de color por tipo de evento

---

### Detalle tecnico

| Archivo | Cambio |
|---------|--------|
| `src/pages/eventos/EventosCalendar.tsx` | Rediseno completo del componente: layout mejorado, tarjetas de evento con borde de color por tipo, fecha prominente, efecto hover, badge "Hoy", hora visible |
| `src/index.css` | Agregar animacion pulse para el dot indicator del calendario y clases de color por tipo de evento |

### Colores por tipo de evento

| Tipo | Color del borde izquierdo |
|------|--------------------------|
| Shooting | `hsl(211, 100%, 50%)` (primary/azul) |
| Podcast | `hsl(271, 91%, 50%)` (accent/violeta) |
| Casting | `hsl(145, 63%, 32%)` (success/verde) |
| Reunion | `hsl(40, 96%, 40%)` (warning/naranja) |
| Otro | `hsl(240, 4%, 46%)` (muted) |

### Visualizacion de la tarjeta de evento (proximos)

```text
+--+--------------------------------------+
|  | [Icon]  Nombre del evento    [Badge] |
|14|         en 3 dias                     |
|FEB        10:00 - 12:00                  |
|  |         Plaza Central                 |
+--+--------------------------------------+
 ^borde color por tipo
```

No se requieren cambios en la base de datos ni nuevas dependencias.

