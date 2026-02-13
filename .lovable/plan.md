
## Ajustar ancho de los dropdowns de filtros para que ocupen todo el ancho disponible

### Problema
Los tres dropdowns (Creador/a, Red Social, Estado) en la sección de Filtros no ocupan todo el ancho de su contenedor. Se ven estrechos comparado con otros elementos de la página.

### Causa Técnica
Los `Select` components de shadcn/ui utilizan `w-full` en el `SelectTrigger`, pero como están dentro de divs con `space-y-2`, necesitan que su contenedor padre también tenga `w-full` para expandirse correctamente.

### Solución
Agregar `w-full` a cada div contenedor dentro del grid de filtros para asegurar que los Select components tengan espacio suficiente para expandirse.

**Archivo:** `src/pages/promolog/PromologContent.tsx`

**Cambio (líneas 383-425):**

Actualizar el grid de filtros para que cada columna tenga `w-full`:

```tsx
<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
  <div className="space-y-2 w-full">
    <label className="text-sm font-medium">Creador/a</label>
    <Select>
      <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">Todos</SelectItem>
        {creators.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}{c.artistic_name ? ` (${c.artistic_name})` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
  <div className="space-y-2 w-full">
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
  <div className="space-y-2 w-full">
    <label className="text-sm font-medium">Estado</label>
    <Select>
      <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">Todos</SelectItem>
        <SelectItem value="si">Sí</SelectItem>
        <SelectItem value="parcial">Parcial</SelectItem>
        <SelectItem value="no">No</SelectItem>
      </SelectContent>
    </Select>
  </div>
</div>
```

### Cambios clave
- Agregar `w-full` a cada div contenedor (`space-y-2 w-full`) para que los `Select` components puedan expandirse al ancho completo de su celda en el grid
- Los `SelectTrigger` ya tienen `w-full` en el componente base, pero necesitan que su padre tenga ancho definido para funcionar correctamente

