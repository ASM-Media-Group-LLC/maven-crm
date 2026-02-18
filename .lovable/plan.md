

## Cambios en Gestion de Usuarios

### 1. Quitar rol desde la columna de rol en la tabla

En la columna "Rol" de `UsersTable.tsx`, cada badge de rol mostrara un icono "X" al lado. Al hacer clic en la X, se eliminara el rol del usuario (se borrara su entrada en `user_roles`). Los usuarios "Sin rol" no mostraran la X.

Se necesita:
- Agregar un callback `onRemoveRole` al componente `UsersTable`
- Mostrar el badge con un boton X integrado (similar a la imagen de referencia)
- Agregar la accion `remove_role` en la edge function `admin-user-actions` que haga `DELETE FROM user_roles WHERE user_id = ...`
- Conectar todo desde `AdminUsuarios.tsx`

### 2. Mover toggle lista/grid a la esquina derecha

Actualmente el toggle esta pegado al buscador. Se movera a la derecha usando `justify-between` o `ml-auto` en el contenedor de filtros, separando el buscador (izquierda) del toggle (derecha).

---

### Seccion tecnica

**Archivos a modificar:**

- `src/pages/admin/UsersTable.tsx`
  - Agregar prop `onRemoveRole: (user: AdminUser) => void`
  - En la celda de Rol, mostrar badge con boton X al lado (solo si tiene rol)

- `src/pages/admin/UsersGrid.tsx`
  - Agregar la misma prop `onRemoveRole` para consistencia

- `src/pages/admin/AdminUsuarios.tsx`
  - Lineas 147-165: Cambiar el contenedor de filtros para separar buscador (izquierda) y toggle (derecha) con `justify-between`
  - Agregar handler `handleRemoveRole` que llame a la edge function con `action: "remove_role"`
  - Pasar `onRemoveRole` a `UsersTable` y `UsersGrid`

- `supabase/functions/admin-user-actions/index.ts`
  - Agregar accion `remove_role`: ejecuta `DELETE FROM user_roles WHERE user_id = $user_id`
  - Proteger contra auto-eliminacion de rol del admin que ejecuta la accion

**Estilo del badge con X (referencia de la imagen):**

```text
[Admin x]   -- badge con X clickeable
[Agent x]   -- badge con X clickeable
Sin posicion -- texto sin X
```

