

## Correccion de 3 problemas en Incidentes Laborales

### 1. Reemplazar "Desde/Hasta" con DateRangePicker

Actualmente se usan dos Popovers separados (Desde y Hasta) para filtrar por fecha. Se reemplazaran por el componente `DateRangePicker` ya estandarizado en el proyecto, que incluye presets rapidos, vista dual de meses y entrada manual.

**Cambio**: Eliminar los dos Popovers de fecha (lineas 238-272), los estados `dateFromOpen`/`dateToOpen` (lineas 103-104), y reemplazar con un solo `DateRangePicker` importado de `@/components/ui/date-range-picker`.

```text
// Antes (2 popovers separados)
<Popover> Desde </Popover>
<Popover> Hasta </Popover>

// Despues (1 componente unificado)
<DateRangePicker from={dateFrom} to={dateTo} onApply={(f, t) => { setDateFrom(f); setDateTo(t); }} />
```

---

### 2. Tooltips ocultos en acciones de tabla

Los tooltips de Ver/Editar/Eliminar quedan cortados por el `overflow-auto` del contenedor de la tabla. La solucion es agregar `overflow-visible` al contenedor de acciones y asegurar que los `TooltipContent` usen `side="left"` para que no se corten por el borde derecho.

**Cambio**: Agregar `side="left"` a cada `TooltipContent` en la columna de acciones (lineas 354-366).

---

### 3. Error al eliminar incidente

Hay una condicion de carrera: al hacer clic en "Eliminar" dentro del AlertDialog, el `onOpenChange` del AlertDialog se dispara y ejecuta `setDeleteItem(null)` **antes** de que la mutacion use `deleteItem!.id`. Esto causa que `deleteItem` sea `null` y la mutacion falle.

**Solucion**: Cambiar la mutacion para recibir el ID como parametro en lugar de depender del estado. Patron identico al usado en `HRAttendance.tsx` (linea 462: `mutationFn: async (id: string)`).

```text
// Antes (depende del estado, puede ser null)
const deleteMutation = useMutation({
  mutationFn: async () => {
    await supabase.from("employee_incidents").delete().eq("id", deleteItem!.id);
  },
  onSuccess: () => { setDeleteItem(null); }
});

// Despues (recibe ID como parametro)
const deleteMutation = useMutation({
  mutationFn: async (id: string) => {
    const { error } = await supabase.from("employee_incidents").delete().eq("id", id);
    if (error) throw error;
  },
  onSuccess: () => { setDeleteItem(null); }
});

// En el AlertDialogAction:
onClick={() => deleteItem && deleteMutation.mutate(deleteItem.id)}
```

---

### Archivo a modificar

| Archivo | Cambios |
|---|---|
| `src/pages/hr/HRIncidents.tsx` | 1) Importar DateRangePicker, eliminar estados dateFromOpen/dateToOpen, reemplazar 2 Popovers por 1 DateRangePicker. 2) Agregar `side="left"` a TooltipContent. 3) Corregir deleteMutation para recibir ID como parametro. |

Sin cambios en DB, rutas ni otros archivos.

