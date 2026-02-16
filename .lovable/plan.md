

## Mostrar siempre el boton "Limpiar filtros"

### Cambio unico en `src/pages/promolog/PromologContent.tsx`

**Linea 534**: Eliminar la condicion que oculta el boton cuando no hay filtros activos.

Actualmente el boton esta envuelto en:
```
{(selectedCreatorFilter !== "" || selectedNetwork !== "" || selectedStatus !== "") && (...)}
```

Se removera esa condicion para que el `div` con el boton siempre se renderice. El boton seguira reseteando los tres filtros al hacer clic, pero estara visible en todo momento independientemente del estado de los filtros.

