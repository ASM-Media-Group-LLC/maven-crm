

## Toggle de vista en ambos tabs + Roles actualizados

### Cambios

#### 1. Toggle lista/grid visible en ambos tabs (`AdminUsuarios.tsx`)

Actualmente el toggle de vista (List/Grid) solo aparece cuando `activeTab === "usuarios"`. Se removera esa condicion para que aparezca siempre, y se usara el estado `view` tambien para el tab de roles.

En el tab de roles, se pasara la prop `view` a `RolesContent` para que alterne entre tabla y grid.

#### 2. Grid de roles (`RolesGrid.tsx` - nuevo archivo)

Se creara un componente `RolesGrid` que muestra cada rol como una card, similar al patron de `UsersGrid`. Cada card mostrara: nombre del rol, descripcion, cantidad de usuarios, badge de sistema, switch de activo/inactivo, y botones de acciones.

#### 3. RolesContent recibe prop `view`

`RolesContent` recibira una prop `view: "list" | "grid"` y renderizara `RolesTable` o `RolesGrid` segun corresponda.

#### 4. Roles en la base de datos

Se insertaran los roles faltantes en `roles_config`: **Supervisor**, **Agente** y **Closer**. El rol "employee" existente se mantiene ya que es de sistema, pero se agregaran los nuevos roles solicitados.

Se creara una migracion SQL para insertar los roles faltantes:

```
INSERT INTO roles_config (name, description, is_active, is_system)
VALUES
  ('supervisor', 'Supervision de equipos y revision de operaciones', true, false),
  ('agente', 'Gestion operativa de creadores y tareas asignadas', true, false),
  ('closer', 'Cierre de ventas y seguimiento de prospectos', true, false)
ON CONFLICT (name) DO NOTHING;
```

---

### Seccion tecnica

**Archivos a crear:**
- `src/pages/admin/RolesGrid.tsx` - Vista grid para roles (cards)

**Archivos a modificar:**
- `src/pages/admin/AdminUsuarios.tsx` - Remover condicion `activeTab === "usuarios"` del toggle de vista, pasar `view` a `RolesContent`
- `src/pages/admin/RolesContent.tsx` - Aceptar prop `view`, alternar entre `RolesTable` y `RolesGrid`

**Migracion SQL:**
- Insertar roles: supervisor, agente, closer en `roles_config`

