

# Ajustar footer del modal "Nuevo Lead"

## Cambio

En `src/pages/leadgen/AddLeadModal.tsx`, modificar el `DialogFooter`:

1. Eliminar el botón "Cancelar" (ghost)
2. Hacer que el botón "Guardar Lead" ocupe el ancho completo con `w-full`

## Archivo a modificar

**`src/pages/leadgen/AddLeadModal.tsx`** - Reemplazar el contenido del `DialogFooter` actual (que tiene dos botones) por un solo botón de ancho completo.

## Detalle técnico

Cambiar de:
```text
<DialogFooter className="pt-4">
  <Button variant="ghost" ...>Cancelar</Button>
  <Button type="submit" ...>Guardar Lead</Button>
</DialogFooter>
```

A:
```text
<DialogFooter className="pt-4">
  <Button type="submit" className="w-full" ...>Guardar Lead</Button>
</DialogFooter>
```

Se mantiene el icono Phone y el estado de carga "Guardando...".
