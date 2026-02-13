

## Estandarizar Closers: Header, Botones y Vistas Tabla/Grid

### 1. Reestructurar header de ClosersContent

**Problema:** El header esta dentro de un `<main>` con scroll general (sin sticky). El boton "Nuevo Deal" usa `variant="default"` (azul) en lugar de `variant="outline"`.

**Solucion:** Aplicar el patron estandarizado:

```text
<main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
  <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
    <div className="flex items-center justify-between">
      <div>
        <h1>Closers</h1>
        <p>Gestion de deals y llamadas</p>
      </div>
      <Button variant="outline">
        <Plus /> Nuevo Deal
      </Button>
    </div>
  </header>
  <div className="flex-1 overflow-auto p-6 space-y-6">
    {/* KPIs, Contactos placeholder, filtros + toggle, pipeline/tabla/grid */}
  </div>
</main>
```

---

### 2. Agregar filtros inline y toggle tabla/grid/pipeline

Agregar una fila de filtros antes de los deals con:
- Buscador por handle
- Select de Etapa (placeholder "Etapa", no preseleccionado)
- Select de Fuente (placeholder "Fuente", no preseleccionado)
- Toggle de 3 vistas alineado a la derecha: Pipeline (icono Columns3), Tabla (icono List), Grid (icono LayoutGrid)
  - Activo: `variant="secondary"`, Inactivo: `variant="ghost"`

---

### 3. Crear componente ClosersTable

Nuevo archivo `src/pages/closers/ClosersTable.tsx` con el patron estandar de tablas:
- Columnas: Handle, Fuente, Etapa (Badge), Fecha, Acciones (sticky right)
- Header sticky (`sticky top-0 z-10 bg-card`)
- Columna Acciones con DropdownMenu: Ver detalle, Editar, Separador, Eliminar
- Todas las columnas con ordenacion

---

### 4. Crear componente ClosersGrid

Nuevo archivo `src/pages/closers/ClosersGrid.tsx`:
- Cards con handle, fuente, etapa (Badge con color), fecha
- Grid responsive (1/2/3 columnas)
- DropdownMenu con las mismas acciones

---

### Resumen de archivos

| Archivo | Accion | Cambio |
|---------|--------|--------|
| `src/pages/closers/ClosersContent.tsx` | Modificar | Header sticky, boton outline, filtros inline, toggle 3 vistas |
| `src/pages/closers/ClosersTable.tsx` | Crear | Tabla de deals con columnas ordenables y acciones |
| `src/pages/closers/ClosersGrid.tsx` | Crear | Grid de cards de deals con acciones |

