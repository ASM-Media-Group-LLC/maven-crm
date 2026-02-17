

## Agregar pestaña "Promos" y reorganizar el Tab Bar de Promolog

### Situacion actual

El tab bar tiene 2 pestañas: **Agentes** y **Campanas**. La tabla principal de entradas (con filtros y toggle list/grid) esta **fuera** del tab bar, siempre visible. El usuario quiere reorganizar esto para que las entradas vivan dentro de una nueva pestaña "Promos".

### Nuevo orden del Tab Bar

| Pestaña | Contenido | Vista list/grid |
|---------|-----------|:---:|
| **Promos** (nueva, default) | Tabla/grid de entradas con filtros actuales | Si (ya existe) |
| **Agentes** | Rendimiento por agente (cards actuales) | Si (agregar toggle) |
| **Campanas** | Vista de campanas (placeholder mejorado) | Si (agregar toggle) |

### Cambios en `src/pages/promolog/PromologContent.tsx`

1. **Actualizar `tabItems`**: Agregar "Promos" como primera pestaña con icono `Table2` y cambiar el estado default de `activeTab` a `"promos"`

2. **Mover contenido al tab "Promos"**: Envolver la fila de filtros, el contador de entradas y la seccion de tabla/grid dentro de `{activeTab === "promos" && (...)}` -- actualmente estan fuera de cualquier tab (lineas 473-539)

3. **Agregar toggle list/grid a "Agentes"**: Dentro del tab de agentes (lineas 542-598), agregar un estado `agentesView` con botones list/grid. En vista "list" se muestra el listado actual de cards; en vista "grid" se muestran las mismas cards en un grid de 2-3 columnas

4. **Agregar toggle list/grid a "Campanas"**: Dentro del tab de campanas (lineas 601-608), agregar un estado `campanasView` con botones list/grid y placeholder mejorado para ambas vistas

5. **Actualizar tipo de `activeTab`**: Cambiar de `"agentes" | "campanas"` a `"promos" | "agentes" | "campanas"`

### Resultado visual

```text
[KPIs]
[Social / Platform cards]
[ Promos | Agentes | Campanas ]
  -- En Promos: [Filtros] [List|Grid] + Tabla/Grid de entradas
  -- En Agentes: [List|Grid] + Cards de rendimiento por agente
  -- En Campanas: [List|Grid] + Vista de campanas (placeholder)
```

