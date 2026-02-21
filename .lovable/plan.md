

## Mejoras al Modulo de Desempeno: Eliminar + UX

### 1. Agregar accion "Eliminar Evaluacion"

Se anade un boton de eliminar (icono Trash2) en las acciones de tabla y grid, con dialogo de confirmacion AlertDialog (mismo patron que otros modulos HR).

**Cambios en `HRPerformance.tsx`**:
- Importar `Trash2` de lucide-react y `AlertDialog` components
- Agregar estado `deleteId` para controlar el dialogo
- Agregar `deleteMutation` con `useMutation` que hace DELETE de `performance_evaluations` e invalida queries
- Agregar boton Trash2 en acciones de tabla y grid
- Agregar AlertDialog de confirmacion al final del componente

### 2. Mejoras funcionales y de UX adicionales

**a) Exportar evaluaciones (boton en header)**
- Boton "Exportar" junto a "Nueva Evaluacion" que genera CSV con los datos filtrados (empleado, periodo, scores, estado)
- Usa la libreria `xlsx` ya instalada

**b) Badge de estado con colores diferenciados**
- completed = verde, pending = amarillo/warning, draft = gris, reviewed = azul
- Actualmente solo usa "default" vs "secondary", se mejora con clases de color especificas

**c) Tooltip en scores individuales en la tabla (hover sobre el rating muestra desglose)**
- Al hacer hover sobre el score en la tabla, un tooltip muestra Puntualidad/Calidad/Equipo/Iniciativa

**d) Empty state mejorado en el wizard (paso 4)**
- Agregar iconografia y texto motivacional para cuando no hay objetivos definidos

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/hr/HRPerformance.tsx` | Agregar: boton eliminar con AlertDialog, delete mutation, exportar CSV, badges de color por estado, tooltip de desglose en score |
| `src/pages/hr/HRPerformanceNew.tsx` | Mejora visual menor en paso 4 (empty state) |

### Detalle tecnico

**Delete mutation**:
```text
const deleteMutation = useMutation({
  mutationFn: async (id: string) => {
    const { error } = await supabase.from("performance_evaluations").delete().eq("id", id);
    if (error) throw error;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["performance-all"] });
    toast({ title: "Evaluacion eliminada" });
    setDeleteId(null);
  },
});
```

**AlertDialog**: Mismo patron estandar de otros modulos HR - titulo "Eliminar evaluacion?", descripcion "Esta accion no se puede deshacer", botones Cancelar/Eliminar.

**Exportar CSV**: Boton que filtra `filtered` y genera un archivo .xlsx con columnas Empleado, Periodo, Fecha, Score, Estado. Usa la libreria `xlsx` ya disponible.

**Badges de estado con color**:
- completed: `bg-green-100 text-green-700 border-green-200`
- pending: `bg-amber-100 text-amber-700 border-amber-200`
- draft: `bg-gray-100 text-gray-600 border-gray-200`
- reviewed: `bg-blue-100 text-blue-700 border-blue-200`

**Tooltip de desglose**: En la celda de Rating de la tabla, se envuelve el ScoreStars en un Tooltip que muestra los 4 scores individuales al hacer hover.

