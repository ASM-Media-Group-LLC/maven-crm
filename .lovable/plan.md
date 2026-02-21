

## Nueva Pagina: Horarios Chatters

### Resumen

Crear una pagina de gestion de horarios y turnos para el equipo de chatters, identica a la pagina actual de HR (`HRSchedules`), reutilizando la misma tabla `work_schedules` con un campo `team` para diferenciar los registros.

### Cambios en la base de datos

**Migracion**: Agregar columna `team` a la tabla `work_schedules`.

- `ALTER TABLE work_schedules ADD COLUMN team text NOT NULL DEFAULT 'hr';`
- Valores posibles: `'hr'` (default, para la pagina actual) y `'chatters'` (para la nueva pagina)

### Nuevos archivos

#### `src/pages/hr/HRChatterSchedules.tsx`

Copia funcional de `HRSchedules.tsx` con las siguientes diferencias:
- Titulo: "Horarios Chatters" / subtitulo: "Gestion de turnos para el equipo de chatters"
- Query filtra por `team = 'chatters'`: `.eq("team", "chatters")`
- Crear turno inserta con `team: "chatters"`
- Las navigation cards de "Horas Extras" y "Banco de Horas" NO se incluyen (son exclusivas de HR)
- Las KPI cards se limitan a: Turnos Esta Semana y Turnos Hoy (filtrados por chatters)
- Vista calendario, grid y lista identicas
- CRUD completo: Ver, Editar, Eliminar con los mismos patrones

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| **DB Migration** | Agregar columna `team` a `work_schedules` |
| `src/pages/hr/HRChatterSchedules.tsx` | **Nuevo** - Pagina de horarios para chatters |
| `src/pages/hr/HRSchedules.tsx` | Agregar filtro `.eq("team", "hr")` en la query y `team: "hr"` en el insert |
| `src/App.tsx` | Agregar ruta `/hr/horarios-chatters` con HRLayout |
| `src/components/dashboard/DashboardSidebar.tsx` | Agregar item "Horarios Chatters" despues de "Horarios y Turnos" en el grupo Operaciones |

### Patron de acciones en tabla

Mismo patron que HRSchedules:
```text
[ Eye (ver) ] [ Pencil (editar) ] [ Trash2 (eliminar) ]
```

### Secuencia de implementacion

1. Migracion DB (agregar columna `team`)
2. Actualizar `HRSchedules.tsx` para filtrar por `team = 'hr'`
3. Crear `HRChatterSchedules.tsx`
4. Actualizar `App.tsx` y `DashboardSidebar.tsx`

