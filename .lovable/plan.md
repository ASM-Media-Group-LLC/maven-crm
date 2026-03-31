

## Plan: Dar acceso al rol Closer a Promolog y Tickets

### Problema
El rol "closer" tiene `can_access = false` para los módulos "Promolog" y "Tickets" en la tabla `role_permissions`.

### Cambio
Una migración SQL que actualiza los dos registros existentes:

```sql
UPDATE role_permissions
SET can_access = true
WHERE role_id = (SELECT id FROM roles_config WHERE name = 'closer')
  AND module IN ('Promolog', 'Tickets')
  AND submodule IS NULL;
```

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| Migración SQL | UPDATE de 2 filas en `role_permissions` |

No se requieren cambios en código frontend — el sistema RBAC (`usePermissions` / `canAccess`) ya lee dinámicamente de la tabla.

