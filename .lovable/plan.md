
## Quitar hover y agregar filtros a la seccion de Filtros

### Cambios en `src/pages/promolog/PromologContent.tsx`

**1. Quitar hover del boton trigger**
Reemplazar `variant="ghost"` por clases manuales sin hover: `hover:bg-transparent hover:text-muted-foreground` o usar un `div` con cursor pointer en lugar de Button.

**2. Agregar 3 selectores dentro del CollapsibleContent**
Segun la imagen de referencia, cuando se expande la seccion de Filtros se muestran 3 dropdowns en un grid de 3 columnas:

| Filtro | Placeholder | Opciones |
|---|---|---|
| Creador/a | Todos | Lista de creadores (mock) |
| Red Social | Todas | Instagram, TikTok, X, Telegram |
| Estado | Todos | Si, Parcial, No |

### Detalle tecnico

- Linea 360: cambiar el `Button` para quitar el hover, agregando `hover:bg-transparent hover:text-muted-foreground` al className
- Lineas 368-372: reemplazar el placeholder text con un grid de 3 columnas con componentes `Select` de shadcn:

```tsx
<CollapsibleContent className="pt-4">
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
    <div className="space-y-2">
      <label className="text-sm font-medium">Creador/a</label>
      <Select>
        <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Todos</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div className="space-y-2">
      <label className="text-sm font-medium">Red Social</label>
      <Select>
        <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Todas</SelectItem>
          <SelectItem value="instagram">Instagram</SelectItem>
          <SelectItem value="tiktok">TikTok</SelectItem>
          <SelectItem value="x">X</SelectItem>
          <SelectItem value="telegram">Telegram</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div className="space-y-2">
      <label className="text-sm font-medium">Estado</label>
      <Select>
        <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Todos</SelectItem>
          <SelectItem value="si">Si</SelectItem>
          <SelectItem value="parcial">Parcial</SelectItem>
          <SelectItem value="no">No</SelectItem>
        </SelectContent>
      </Select>
    </div>
  </div>
</CollapsibleContent>
```

- Agregar imports de `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` desde `@/components/ui/select` (ya importado en otros archivos del proyecto)
