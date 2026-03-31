

## Plan: Acceso de Closers a Creadores (ver lista + agregar, sin editar/eliminar/dar de baja)

### Cambios necesarios

**1. Base de datos — Agregar permisos para el rol Closer**

Insertar en `role_permissions` los permisos `Lista` y `Nuevo` del módulo `Creadores` para el rol closer:

```sql
INSERT INTO public.role_permissions (role_id, module, submodule, can_access, data_scope)
SELECT rc.id, 'Creadores', 'Lista', true, 'self'
FROM public.roles_config rc WHERE rc.name = 'closer'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, module, submodule, can_access, data_scope)
SELECT rc.id, 'Creadores', 'Nuevo', true, 'self'
FROM public.roles_config rc WHERE rc.name = 'closer'
ON CONFLICT DO NOTHING;
```

Esto habilita automáticamente las rutas `/creadores` y `/creadores/nuevo` y los ítems del sidebar para closers.

**2. `CreadoresTable.tsx` — Ocultar botones de editar y dar de baja para closers**

En la sección de acciones (línea ~319-357), agregar una variable `isCloser` desde `useUserRole()` y condicionar:

- **Botón Editar (Pencil)**: solo visible si `!isCloser`
- **Botón Offboarding (LogOut)**: solo visible si `!isCloser`
- **Botón Ver (Eye)**: se mantiene visible para todos

```tsx
const { isAgent, isAdmin, isManager, role } = useUserRole();
const isCloser = role === "closer";

// En las acciones:
{!isCloser && (
  <Button variant="ghost" size="icon" onClick={() => setEditingCreator(c)}>
    <Pencil className="h-4 w-4" />
  </Button>
)}
<Button variant="ghost" size="icon" onClick={() => setViewingCreator(c)}>
  <Eye className="h-4 w-4" />
</Button>
{!isCloser && (c.status === "leaving" || c.status === "terminated") && (
  // botón LogOut offboarding
)}
```

### Resultado
- El closer verá "Listado" y "Nuevo" en el sidebar bajo Creadoras
- Podrá ver la lista (filtrada a sus creators, lógica ya existente) y agregar nuevos
- No verá botones de editar ni dar de baja en la tabla

