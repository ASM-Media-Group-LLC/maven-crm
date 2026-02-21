

## Correcciones en HRSchedules.tsx

### Cambios a realizar

#### 1. Eliminar boton "Ver Calendario"
Remover el boton `Ver Calendario` que esta junto a `Crear Turno` en el header (lineas 360-362). La vista calendario ya es accesible desde el toggle de vistas en los filtros.

#### 2. Agregar efectos hover a las KPI Cards
Aplicar el patron estandar de hover premium usando el prop `hoverClass` de `DashboardMetricCard`:
- Turnos Esta Semana: hover con gradiente primary
- Turnos Hoy: hover con gradiente accent
- Horas Extra: hover con gradiente warning
- Banco de Horas: hover con gradiente success

Patron: `hover:scale-[1.03] hover:shadow-lg hover:bg-gradient-to-br hover:from-{color}/10 hover:to-transparent`

#### 3. Corregir filtro de tipo
- Cambiar estado inicial de `typeFilter` de `"all"` a `""`
- Usar `value={typeFilter || undefined}` en el Select para que muestre el placeholder
- Cambiar placeholder de `"Tipo"` a `"Tipo"`  (ya esta correcto)
- Eliminar la opcion `SelectItem value="all"` que dice "Todos los tipos"
- Usar el valor centinela `__all__` mapeado a cadena vacia, o simplemente filtrar solo cuando `typeFilter !== ""`
- Agregar boton "Limpiar filtros" visible solo cuando hay filtros activos

### Detalle tecnico

| Linea(s) | Cambio |
|---|---|
| 62 | `useState("all")` -> `useState("")` |
| 214 | Condicion de filtro: `typeFilter !== "all"` -> `typeFilter !== ""` |
| 360-362 | Eliminar boton "Ver Calendario" |
| 372-378 | Agregar `hoverClass` a cada KPI card |
| 415-421 | Corregir Select: `value={typeFilter \|\| undefined}`, eliminar opcion "Todos los tipos", usar `__all__` -> `""` en onValueChange |
| ~427 | Agregar boton "Limpiar filtros" condicional |

### Archivo a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/hr/HRSchedules.tsx` | Eliminar boton calendario, hover cards, corregir filtros |

