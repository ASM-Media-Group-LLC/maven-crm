

## Estandarizar Tab Bar en Permisos y Asistencia

### Problemas detectados

**HRPermisos** (linea 370-373): El tab bar solo muestra departamentos que tienen permisos registrados (`activeDepts` filtra por IDs presentes en los datos). Deberia mostrar **todos** los departamentos activos, igual que en la imagen de referencia (Todos, Direccion, Finanzas, Marketing, Operaciones, Recursos Humanos, Tecnologia, Ventas).

**HRAttendance** (linea 436-443): Usa el componente Radix `Tabs/TabsList/TabsTrigger` en vez del patron estandar con `Button`. Esto produce un tab bar con tamanio y estilo diferente (`text-xs`, fondo y bordes de Radix). El estandar de la plataforma es:

```text
Estandar (Button-based):
<div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
  <Button variant="secondary|ghost" size="sm">...</Button>
</div>

Actual en Asistencia (Radix Tabs - incorrecto):
<Tabs><TabsList className="h-auto flex-wrap gap-1 bg-muted/50">
  <TabsTrigger className="text-xs">...</TabsTrigger>
</TabsList></Tabs>
```

### Cambios

#### 1. `src/pages/hr/HRPermisos.tsx`

- Cambiar `activeDepts` por `departments` directamente en el tab bar (mostrar todos los departamentos activos, no solo los que tienen registros)
- Eliminar la condicion `activeDepts.length > 0` para que siempre se muestre el tab bar (con loading state si es necesario)

#### 2. `src/pages/hr/HRAttendance.tsx`

- Eliminar imports de `Tabs, TabsList, TabsTrigger` de Radix
- Reemplazar el bloque `<Tabs>` (lineas 436-443) por el patron estandar con `<div className="inline-flex...">` y `<Button variant="secondary|ghost" size="sm">`
- Cambiar `deptTab` de `"all"` a `""` (string vacio) para consistencia con HRPermisos
- Ajustar el filtro `matchDept` para usar `!deptTab` en vez de `deptTab === "all"`

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/hr/HRPermisos.tsx` | Mostrar todos los departamentos en el tab bar, no solo los que tienen registros |
| `src/pages/hr/HRAttendance.tsx` | Reemplazar Radix Tabs por Button-based tab bar estandar |

