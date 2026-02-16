

## Rediseño del Header de Promolog

### Cambio Visual

Simplificar el header de Promolog para que siga el mismo patron de la pagina de Creadores:
- **Fila unica**: titulo y subtitulo a la izquierda, botones de accion a la derecha
- Los botones "Agregar Campaña" y "Agregar Entrada" se mueven a la derecha del header (misma fila que el titulo)
- El DateRangePicker y los botones de "Ver Agentes" / "Ver Campañas" se mueven abajo del header, a la barra de filtros existente

### Estructura resultante

```text
+---------------------------------------------------------------+
| Promolog                              [+ Agregar Campaña]     |
| Seguimiento promocional diario        [+ Agregar Entrada]     |
+---------------------------------------------------------------+
| [DateRangePicker] [Ver Agentes] [Ver Campañas] [Filtros...]   |
+---------------------------------------------------------------+
```

### Archivo a modificar

| Archivo | Cambios |
|---------|---------|
| `src/pages/promolog/PromologContent.tsx` | Reestructurar el header: mover solo los botones de accion (Agregar Campaña, Agregar Entrada) al lado derecho del titulo. Mover DateRangePicker y botones de vista (Ver Agentes, Ver Campañas) a la barra de filtros debajo del header. |

### Detalles tecnicos

- El `div` de la linea 327 se mantiene con `flex items-center justify-between` pero ahora incluye los botones de accion a la derecha
- El `div` de la linea 333 (con DateRangePicker y botones de vista) se elimina del header y su contenido se integra en la barra de filtros (linea 360)
- Los botones de accion usan variante `outline` siguiendo las reglas del Design System para acciones principales en header
- Se elimina el `mb-4` del primer div ya que no habra segunda fila en el header

