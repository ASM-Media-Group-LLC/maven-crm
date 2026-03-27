

## Plan: Cambiar "Extras" por "Plataformas" y agregar acciones en Completadas

### Resumen
1. Reemplazar la columna "Extras" por "Plataformas" (editable inline con select) en la pestaña Completadas.
2. Agregar columna "Acciones" con dropdown que permita: **Convertir a Creadora** (inserta en tabla `creators`) y **Devolver a Contacto** (cambia stage de vuelta a "Asignada" o "Nuevo").

### Cambios

**Archivo: `src/pages/closers/components/LeadTable.tsx`**

**1. Header de "completadas" (línea 502)**
- Cambiar `<TableHead>Extras</TableHead>` → `<TableHead>Plataformas</TableHead>`
- Agregar `<TableHead>Acciones</TableHead>` al final

**2. Filas de "completadas" (líneas 722-724)**
- Reemplazar la celda `InlineNumber` de `extras` por un `Select` de plataformas (igual al que ya existe en "asignadas" línea 674) usando `main_platform` y `onFieldChange`
- Agregar celda de acciones con `DropdownMenu` que incluya:
  - "Convertir a Creadora" → llama nuevo callback `onConvertToCreator(c)`
  - "Devolver a Contacto" → llama `onStageChange(c.id, "Asignada")`

**3. Props del componente (línea 21)**
- Agregar prop `onConvertToCreator: (creator: CloserCreatorRow) => void`

**Archivo: `src/pages/closers/ClosersContent.tsx`** (o donde se renderiza `LeadTable`)

**4. Lógica de conversión a creadora**
- Crear función `handleConvertToCreator` que:
  1. Inserta en tabla `creators` (name: instagram_handle, instagram_handle, category, phone, source: "closer", status: "pendiente")
  2. Opcionalmente marca el closer_creator con un flag o lo deja en "Completada"
  3. Muestra toast de confirmación
- Pasar como prop `onConvertToCreator` al `LeadTable`

**5. Grid view completadas (líneas 410-414)**
- Cambiar "Extras" por "Plataforma" en el resumen del grid view, mostrando `c.main_platform` en lugar de extras

### Detalle técnico

```tsx
// Completadas header
<TableHead>Plataformas</TableHead>
<TableHead className="text-right sticky top-0 right-0 z-30 bg-card">Acciones</TableHead>

// Completadas row - reemplazar extras por plataforma select
<TableCell>
  <Select value={c.main_platform || ""} onValueChange={(v) => onFieldChange(c.id, "main_platform", v)}>
    <SelectTrigger className="h-7 w-28 text-xs">
      <SelectValue placeholder="Plataforma" />
    </SelectTrigger>
    <SelectContent>
      {PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
    </SelectContent>
  </Select>
</TableCell>

// Acciones dropdown
<TableCell className="text-right sticky right-0 bg-background z-20">
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onClick={() => onConvertToCreator(c)}>
        Convertir a Creadora
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => onStageChange(c.id, "Asignada")}>
        Devolver a Asignada
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</TableCell>
```

La conversión a creadora reutiliza la lógica existente de `ConvertContactoModal` (insertar en `creators` con datos mapeados del closer_creator). "Devolver a Contacto" simplemente mueve el stage de vuelta a "Asignada" usando `onStageChange` que ya existe.

### Archivos a modificar
- `src/pages/closers/components/LeadTable.tsx`
- `src/pages/closers/ClosersContent.tsx` (o el componente padre que maneja la lógica)

