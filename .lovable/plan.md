

## Modulo de Administracion de Usuarios y Roles

### Ubicacion en la plataforma

Se creara un nuevo grupo **"Administracion"** en el sidebar, entre "Operaciones" y "Recursos", con un enlace "Usuarios" que lleva a `/admin/usuarios`. Solo sera visible para usuarios con rol `admin`.

### Infraestructura existente

Ya se cuenta con:
- Tabla `user_roles` con enum `app_role` (admin, manager, employee)
- Tabla `profiles` (id, full_name, avatar_url, company_id)
- Funcion `has_role()` (security definer)
- Trigger que asigna rol `employee` automaticamente al registrarse

### Lo que falta construir

#### 1. Edge Function: `manage-user-roles`

Se necesita una edge function porque el cliente no tiene permisos INSERT/UPDATE/DELETE sobre `user_roles`. Esta funcion:
- Recibe `user_id` y `role` en el body
- Valida que quien llama sea admin (usando el JWT del request)
- Realiza el upsert o delete en `user_roles` con el service role key
- Soporta acciones: `assign_role`, `remove_role`

#### 2. RLS: Politica para que admins lean todos los perfiles

Actualmente `profiles` solo permite ver el propio perfil. Se necesita una politica adicional para que los admins puedan ver todos los perfiles:

```sql
CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
```

#### 3. Hook: `useUserRole`

Un hook que consulte el rol del usuario actual desde `user_roles` y lo cache. Se usara para:
- Mostrar/ocultar la seccion "Administracion" en el sidebar
- Proteger la ruta `/admin/usuarios`

#### 4. Pagina: `/admin/usuarios`

Componentes y funcionalidad:
- **Header** con titulo "Gestion de Usuarios" y KPIs (total usuarios, admins, managers, employees)
- **Barra de busqueda** por nombre o email
- **Tabla de usuarios** con columnas: Avatar, Nombre, Email, Rol actual, Fecha de registro, Acciones
- **Toggle list/grid** siguiendo el patron existente en otros modulos
- **Modal de cambio de rol**: al hacer clic en "Editar rol", un modal con selector de rol (admin/manager/employee) y boton de confirmar
- **Proteccion**: solo accesible para admins; si un usuario no-admin intenta acceder, se redirige al dashboard

#### 5. Cambios en el Sidebar

Agregar un nuevo `SidebarGroup` con label "Administracion" y un enlace "Usuarios" con icono `Shield`. Este grupo solo se renderiza si `useUserRole` retorna `admin`.

#### 6. Ruta en App.tsx

Agregar la ruta protegida con validacion adicional de rol admin:

```text
/admin/usuarios -> AdminUsuarios (protegida + solo admin)
```

### Archivos a crear/modificar

| Archivo | Accion |
|---------|--------|
| `supabase/functions/manage-user-roles/index.ts` | Crear - edge function |
| `src/hooks/useUserRole.ts` | Crear - hook para obtener rol del usuario |
| `src/pages/admin/AdminUsuarios.tsx` | Crear - pagina principal |
| `src/pages/admin/UsersTable.tsx` | Crear - tabla de usuarios |
| `src/pages/admin/UsersGrid.tsx` | Crear - grid de usuarios |
| `src/pages/admin/ChangeRoleModal.tsx` | Crear - modal cambio de rol |
| `src/pages/admin/useAdminUsers.ts` | Crear - hook datos y mutaciones |
| `src/components/dashboard/DashboardSidebar.tsx` | Modificar - agregar grupo Administracion |
| `src/components/AdminRoute.tsx` | Crear - wrapper de ruta solo-admin |
| `src/App.tsx` | Modificar - agregar ruta `/admin/usuarios` |
| Migracion SQL | Agregar politica RLS para que admins lean perfiles |

### Seguridad

- La asignacion de roles se hace exclusivamente via edge function con service role key
- La edge function valida el JWT y confirma que el llamador es admin antes de ejecutar cambios
- Nunca se expone la logica de roles al cliente directamente
- Un admin no puede removerse su propio rol de admin (proteccion contra auto-bloqueo)

