

# Abrir modal de detalle al hacer clic en el badge de Estado

## Problema
Actualmente el badge de "Estado" en la tabla (linea 182-184) es estatico y no abre nada. El modal de detalle solo se abre desde el menu de acciones ("Ver detalle"). El usuario quiere que al hacer clic en el badge de Estado se abra el modal de detalle del lead.

## Solucion

Hacer el badge de Estado clickeable, de modo que al hacer clic ejecute `onView(lead)` y abra el modal `ViewLeadModal`.

## Cambio

### `src/pages/leadgen/LeadGenTable.tsx` (linea 181-185)

Envolver el badge de Estado en un `Button` ghost clickeable que llame a `onView`:

**Antes:**
```tsx
<TableCell>
  <Badge variant={statusVariant[lead.status] ?? "secondary-soft"}>
    {statusLabels[lead.status] || lead.status}
  </Badge>
</TableCell>
```

**Despues:**
```tsx
<TableCell>
  <Button
    variant="ghost"
    size="sm"
    className="h-8 -ml-2"
    onClick={() => onView?.(lead)}
  >
    <Badge variant={statusVariant[lead.status] ?? "secondary-soft"}>
      {statusLabels[lead.status] || lead.status}
    </Badge>
  </Button>
</TableCell>
```

## Archivos a modificar
- `src/pages/leadgen/LeadGenTable.tsx` -- Envolver el badge de Estado en un boton clickeable que llame a `onView(lead)`

