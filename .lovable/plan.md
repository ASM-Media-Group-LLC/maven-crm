

## Fix: Filtros con placeholder correcto + Headers consistentes

### Problema 1 — Filtros dicen "Todos" en vez del nombre de la categoria

Actualmente el patron es:
```tsx
value={typeFilter || "__all__"}
```
Cuando `typeFilter` es `""`, esto resuelve a `"__all__"`, y Radix renderiza el texto del SelectItem: "Todos los tipos". El placeholder nunca se muestra.

**Fix**: cambiar a `value={typeFilter || undefined}`. Cuando el estado es `""`, Radix recibe `undefined` y muestra el placeholder ("Tipo de Falta", "Estado", "Turno", etc.).

Archivos afectados:

| Archivo | Filtros a corregir |
|---|---|
| `HRAttendance.tsx` | `statusFilter` y `shiftFilter` todavia usan `useState("all")` + `<SelectItem value="all">`. Migrar a `useState("")` + `__all__` + `value \|\| undefined` |
| `HRAbsences.tsx` | `typeFilter` y `statusFilter` ya usan `__all__` pero el `value` resuelve a `"__all__"`. Cambiar a `value \|\| undefined`. Tambien `deptFilter` sigue con `useState("all")` en la logica de filtrado |
| `HRPermisos.tsx` | `typeFilter` y `statusFilter` misma situacion. `deptFilter` sigue con `useState("all")` |
| `HRVacations.tsx` | `statusFilter` mismo problema |
| `EmployeeDirectory.tsx` | `deptFilter` y `statusFilter` misma situacion |

El patron estandar final sera:
```tsx
const [typeFilter, setTypeFilter] = useState("");

<Select
  value={typeFilter || undefined}
  onValueChange={(v) => setTypeFilter(v === "__all__" ? "" : v)}
>
  <SelectTrigger><SelectValue placeholder="Tipo de Falta" /></SelectTrigger>
  <SelectContent>
    <SelectItem value="__all__">Todos</SelectItem>
    ...
  </SelectContent>
</Select>

// Filtrado: const matchType = !typeFilter || item.type === typeFilter;
```

### Problema 2 — Headers inconsistentes (iconos)

Estado actual:
- `HRAttendance` — tiene icono en caja (ClipboardCheck + bg-primary/10)
- `HRAbsences` — tiene icono en caja (AlertTriangle + bg-destructive/10)
- `HRPermisos` — tiene icono en caja (Clock + bg-primary/10)
- `HRVacations` — NO tiene icono, solo texto
- `EmployeeDirectory` — usa HRPageHeader con icono

**Fix**: eliminar las cajas de iconos de los headers de HRAttendance, HRAbsences y HRPermisos para que todos sigan el mismo patron limpio sin icono (como HRVacations). El header queda solo con titulo + subtitulo a la izquierda y boton CTA a la derecha.

Patron estandar de header:
```text
<header shrink-0 border-b bg-background px-6 py-4>
  <div flex items-center justify-between>
    <div>
      <h1>Titulo de la Pagina</h1>
      <p muted>Descripcion breve</p>
    </div>
    <Button>+ Accion Principal</Button>
  </div>
</header>
```

### Archivos a modificar

| Archivo | Cambios |
|---|---|
| `src/pages/hr/HRAttendance.tsx` | Eliminar icono del header; migrar filtros `statusFilter`/`shiftFilter` de `"all"` a `""` + `__all__` + `value \|\| undefined` |
| `src/pages/hr/HRAbsences.tsx` | Eliminar icono del header; cambiar `value` de filtros a `\|\| undefined`; fix `deptFilter` |
| `src/pages/hr/HRPermisos.tsx` | Eliminar icono del header; cambiar `value` de filtros a `\|\| undefined`; fix `deptFilter` |
| `src/pages/hr/HRVacations.tsx` | Cambiar `value` de filtro status a `\|\| undefined` |
| `src/pages/hr/EmployeeDirectory.tsx` | Cambiar `value` de filtros a `\|\| undefined` |
