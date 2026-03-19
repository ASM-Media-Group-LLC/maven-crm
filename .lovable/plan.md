

## Plan: Mostrar correo del usuario en la tabla de admin

El modelo `AdminUser` ya tiene el campo `email` (se obtiene via edge function). Solo falta mostrarlo en la tabla.

### Cambio único en `src/pages/admin/UsersTable.tsx`

1. Agregar columna "Correo" en el `TableHeader` después de "Usuario"
2. Agregar celda con `user.email` en cada fila, con texto truncado y estilo `text-muted-foreground text-sm`

No se requieren cambios en el hook ni en el backend — el dato ya existe.

