
# Dropdown para cambiar estado del creador en la tabla

## Cambio

Reemplazar el Badge estatico de estado en `CreadoresTable.tsx` por un `DropdownMenu` que permita cambiar el estado del creador directamente desde la tabla, similar a la referencia donde se ve un badge con un chevron desplegable.

## Detalle tecnico

### Archivo: `src/pages/creadores/CreadoresTable.tsx`

1. **Importar** `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger` desde `@/components/ui/dropdown-menu` y `ChevronDown` desde `lucide-react`.

2. **Importar** `useUpdateCreador` desde `./useCreadores` para persistir el cambio de estado en Supabase.

3. **Reemplazar la celda de estado** (lineas 157-163) que actualmente muestra un Badge estatico:

Antes:
```tsx
<TableCell>
  {c.status && (
    <Badge variant={statusVariant[c.status] ?? "secondary-soft"}>
      {statusLabel[c.status] ?? c.status}
    </Badge>
  )}
</TableCell>
```

Despues:
```tsx
<TableCell>
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button className="flex items-center gap-1 focus:outline-none">
        <Badge variant={statusVariant[c.status ?? ""] ?? "secondary-soft"}>
          {statusLabel[c.status ?? ""] ?? c.status ?? "—"}
        </Badge>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start">
      {Object.entries(statusLabel).map(([value, label]) => (
        <DropdownMenuItem
          key={value}
          onClick={() => updateCreator({ id: c.id, data: { status: value } })}
          disabled={c.status === value}
        >
          <Badge variant={statusVariant[value] ?? "secondary-soft"} className="mr-2">
            {label}
          </Badge>
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
</TableCell>
```

4. **Agregar el hook** dentro del componente:
```tsx
const updateCreador = useUpdateCreador();
```

Y usar `updateCreador.mutate(...)` en el onClick de cada item.

5. **Feedback visual**: Mostrar un toast de confirmacion al cambiar el estado usando `sonner`.

### Sin cambios en otros archivos
- `useUpdateCreador` ya existe en `useCreadores.ts` y actualiza el campo e invalida la query.
- No se requieren cambios en el schema ni migraciones.
