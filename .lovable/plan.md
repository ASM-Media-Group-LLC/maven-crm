
# Dropdown para cambiar estado del creador en la tabla

## Cambio

Reemplazar el Badge estatico de estado en la celda de la tabla por un `DropdownMenu` interactivo que permita cambiar el estado del creador directamente, similar a la imagen de referencia donde se ve un dropdown con opciones y un checkmark en la opcion activa.

## Detalle tecnico

### Archivo: `src/pages/creadores/CreadoresTable.tsx`

1. **Imports nuevos**:
   - `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger` desde `@/components/ui/dropdown-menu`
   - `ChevronDown` desde `lucide-react`
   - `Check` desde `lucide-react`
   - `useUpdateCreador` desde `./useCreadores`
   - `toast` desde `sonner`

2. **Hook**: Agregar `const updateCreador = useUpdateCreador();` dentro del componente.

3. **Reemplazar la celda de estado** (actualmente un Badge estatico) por un DropdownMenu:

```tsx
<TableCell>
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button className="flex items-center gap-1 cursor-pointer focus:outline-none">
        <Badge variant={statusVariant[c.status ?? ""] ?? "secondary-soft"}>
          {statusLabel[c.status ?? ""] ?? c.status ?? "---"}
        </Badge>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start">
      {Object.entries(statusLabel).map(([value, label]) => (
        <DropdownMenuItem
          key={value}
          disabled={c.status === value}
          onClick={() => {
            updateCreador.mutate(
              { id: c.id, data: { status: value } },
              {
                onSuccess: () => toast.success(`Estado actualizado a ${label}`),
                onError: () => toast.error("Error al actualizar estado"),
              }
            );
          }}
        >
          {c.status === value && <Check className="mr-2 h-4 w-4" />}
          <Badge variant={statusVariant[value] ?? "secondary-soft"}>
            {label}
          </Badge>
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
</TableCell>
```

## Comportamiento

- Click en el badge de estado abre un dropdown con todas las opciones de estado.
- La opcion activa muestra un checkmark a la izquierda (como en la imagen de referencia).
- Al seleccionar una opcion distinta, se actualiza en Supabase via `useUpdateCreador` y se muestra un toast de confirmacion.
- Cada opcion muestra su badge con el color correspondiente.
- El dropdown tiene fondo opaco (`bg-popover`) y `z-50` (ya configurado en el componente base).

## Sin cambios en otros archivos

`useUpdateCreador` ya existe y actualiza el campo en la tabla `creators` e invalida la query. No se requieren migraciones ni componentes nuevos.
