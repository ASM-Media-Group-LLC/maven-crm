

## Sincronizar roles con la estructura de la imagen

### Situacion actual

La tabla `roles_config` tiene 3 roles:
- **Admin** (sistema) - "Acceso completo..."
- **Employee** (sistema) - "Acceso basico..."
- **Manager** (sistema) - "Gestion de equipos..."

### Roles objetivo (segun la imagen, sin Owner)

| Rol | Descripcion |
|-----|-------------|
| Admin | Full administrative access |
| Agent | Standard agent access |
| Closer | Sales closing and deal management |
| Manager | MG |
| Supervisor | Team supervision and QA access |

### Cambios a realizar

1. **Insertar 3 nuevos roles** en `roles_config`:
   - **Agent** - "Standard agent access" (is_system: true)
   - **Closer** - "Sales closing and deal management" (is_system: true)
   - **Supervisor** - "Team supervision and QA access" (is_system: true)

2. **Eliminar el rol Employee** ya que no aparece en la imagen y sera reemplazado por Agent como el rol de acceso basico. Si hay usuarios asignados con rol "employee" en `user_roles`, se debera considerar migrarlos.

3. **Actualizar descripciones** de Admin y Manager para que coincidan con la imagen.

### Seccion tecnica

**Archivo:** No se requieren cambios de codigo, solo migracion SQL.

**Migracion SQL:**
```sql
-- Insertar nuevos roles
INSERT INTO roles_config (name, description, is_system, is_active)
VALUES
  ('agent', 'Standard agent access', true, true),
  ('closer', 'Sales closing and deal management', true, true),
  ('supervisor', 'Team supervision and QA access', true, true);

-- Actualizar descripcion de admin
UPDATE roles_config SET description = 'Full administrative access' WHERE name = 'admin';

-- Actualizar descripcion de manager  
UPDATE roles_config SET description = 'MG' WHERE name = 'manager';

-- Eliminar rol employee (reemplazado por agent)
DELETE FROM roles_config WHERE name = 'employee' AND id = '34a9686c-a4b7-4aff-8973-465a618dd77e';
```

**Nota sobre el enum `app_role`:** El enum en `user_roles` solo tiene `admin`, `manager`, `employee`. Los nuevos roles (agent, closer, supervisor) existen en `roles_config` para el sistema de permisos granulares pero no necesariamente requieren cambiar el enum base, ya que el sistema de permisos usa `roles_config` + `role_permissions`. Si se necesita asignar estos roles a usuarios via `user_roles`, se debera ampliar el enum en una futura iteracion.

