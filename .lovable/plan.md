

## Reestructurar Gestion de Usuarios con Tabs: Usuarios y Roles

### Resumen

Se dividira la pagina `/admin/usuarios` en dos pestanas: **Usuarios** (gestion individual) y **Roles** (configuracion de roles y permisos). La pestana de Usuarios se enriquecera con acciones adicionales (editar, cambiar contrasena, eliminar, asignar rol). La pestana de Roles mostrara una tabla de roles con descripcion, usuarios asignados, estado y configuracion de permisos granulares por modulo/submodulo.

---

### Base de datos

Se creara una nueva tabla `roles_config` para almacenar roles personalizados y una tabla `role_permissions` para los permisos granulares:

**Tabla `roles_config`:**
| Columna | Tipo | Descripcion |
|---------|------|-------------|
| id | uuid (PK) | Identificador |
| name | text (NOT NULL, UNIQUE) | Nombre del rol (Admin, Manager, etc.) |
| description | text | Descripcion del rol |
| is_active | boolean (default true) | Si el rol esta activo |
| is_system | boolean (default false) | Si es un rol del sistema (no se puede eliminar) |
| created_at | timestamptz | Fecha de creacion |
| updated_at | timestamptz | Fecha de actualizacion |

**Tabla `role_permissions`:**
| Columna | Tipo | Descripcion |
|---------|------|-------------|
| id | uuid (PK) | Identificador |
| role_id | uuid (FK -> roles_config) | Rol asociado |
| module | text (NOT NULL) | Modulo (Dashboard, Creadores, etc.) |
| submodule | text | Submodulo o funcion especifica |
| can_access | boolean (default true) | Si tiene acceso al modulo |
| data_scope | text (default 'all') | Alcance de datos: all, subordinates, self |
| created_at | timestamptz | Fecha de creacion |

Se insertaran los 3 roles del sistema como datos iniciales (admin, manager, employee) con `is_system = true`.

RLS: politicas que permitan lectura a usuarios autenticados y escritura solo a admins (via `has_role`).

---

### Cambios en el frontend

#### 1. AdminUsuarios.tsx - Agregar tab bar

Se agregara una barra de pestanas con el patron estandar del proyecto debajo del titulo:
- **Usuarios** (pestana por defecto) - vista actual mejorada
- **Roles** (nueva pestana) - gestion de roles y permisos

#### 2. Pestana de Usuarios - Acciones mejoradas

Se actualizara `UsersTable.tsx` para incluir las siguientes acciones por usuario (iconos como en la imagen de referencia):
- **Editar** (icono lapiz): Abrir modal para editar nombre del usuario
- **Asignar rol** (icono engranaje/llave): Abrir el ChangeRoleModal existente
- **Cambiar contrasena** (icono llave): Enviar email de reset de contrasena via Supabase admin API (edge function)
- **Eliminar** (icono basura): Dialogo de confirmacion para eliminar usuario

Se actualizara tambien `UsersGrid.tsx` con las mismas acciones.

Se creara una edge function `admin-user-actions` para operaciones privilegiadas:
- `reset_password`: Envia email de reset via `auth.admin.generateLink`
- `delete_user`: Elimina usuario via `auth.admin.deleteUser`

#### 3. Pestana de Roles - Nuevos componentes

Se crearan dentro de `src/pages/admin/`:

- **RolesContent.tsx** - Contenido principal con tabla de roles y boton "Crear rol"
- **RolesTable.tsx** - Tabla con columnas: Rol, Descripcion, Usuarios (muestra nombres con "+N"), Status (switch), Acciones (Set permissions, Editar, Eliminar)
- **CreateRoleModal.tsx** - Modal para crear nuevo rol con campos: nombre (max 50 chars), descripcion (max 300 chars)
- **EditRoleModal.tsx** - Modal para editar nombre y descripcion del rol
- **DeleteRoleDialog.tsx** - Confirmacion para eliminar rol (solo si no es de sistema)
- **SetPermissionsModal.tsx** - Modal completo para configurar permisos granulares

#### 4. SetPermissionsModal - Configuracion de permisos

El modal mostrara todos los modulos y submodulos de la plataforma organizados en secciones expandibles:

| Modulo | Submodulos |
|--------|------------|
| Dashboard | (sin submodulos) |
| Creator Sales | Dashboard, Sales Report, Sales Report V1, AI Sales, AI Config |
| Contactos | Contactos, Agencias |
| Creadores | Lista, Perfil, Nuevo |
| Eventos | Lista, Detalle, Nuevo, Editar |
| Promolog | (sin submodulos) |
| LeadGen | (sin submodulos) |
| Closers | (sin submodulos) |
| Tickets | (sin submodulos) |
| Tareas | Proyectos, Tareas |
| Administracion | Usuarios, Roles |

Para cada modulo se podra configurar:
- **Menu access** (checkbox): Si el modulo aparece en el sidebar
- **Function permissions** (conteo de funciones habilitadas, expandible)
- **Data permissions** (radio): All data / Self and subordinates / Data about self

Habra checkboxes "All" globales para menus y funciones.

#### 5. Hook useRoles.ts

Nuevo hook para gestionar roles:
- Query para obtener roles con conteo de usuarios
- Mutaciones para crear, editar, eliminar roles
- Query para permisos por rol
- Mutacion para guardar permisos

---

### Seccion tecnica

- La tab bar usa estado local `activeTab: "usuarios" | "roles"` en `AdminUsuarios.tsx`
- Los roles del sistema (admin, manager, employee) no pueden eliminarse (`is_system = true`)
- La edge function `admin-user-actions` utiliza `SUPABASE_SERVICE_ROLE_KEY` para operaciones admin
- Los permisos se guardan como filas en `role_permissions`, una por modulo/submodulo por rol
- El `SetPermissionsModal` carga los permisos existentes al abrirse y los guarda en batch con upsert
- La configuracion de modulos/submodulos se define como constante en el frontend (no en DB) para mantener sincronizacion con el sidebar

