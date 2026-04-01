

## Agregar opción de eliminar (solo admin) en Contactos y LeadGen

### Resumen
Agregar un botón/opción "Eliminar" visible solo para administradores en los menús de acción de Contactos (tabla y grid) y en la vista de leads de LeadGen (tabla y modal).

### Cambios

**1. `src/pages/contactos/ContactosTable.tsx`**
- Agregar prop `onDelete?: (contacto: Contacto) => void`
- Agregar `<DropdownMenuItem>` con icono `Trash2` y texto "Eliminar" al final del menú dropdown (solo si `onDelete` está definido), con clase `text-destructive`

**2. `src/pages/contactos/ContactosGrid.tsx`**
- Agregar prop `onDelete?: (contacto: Contacto) => void`
- Agregar `<DropdownMenuItem>` "Eliminar" al final del menú dropdown (solo si `onDelete` está definido)

**3. `src/pages/contactos/ContactosContent.tsx`**
- Pasar `onDelete={isAdmin ? handleDelete : undefined}` a `ContactosTable` y `ContactosGrid`
- `handleDelete` = `(c) => { setSelectedContacto(c); setDeleteOpen(true); }`
- Ya existe `DeleteContactoDialog` montado — solo falta conectar el trigger desde tabla/grid

**4. `src/pages/leadgen/LeadGenTable.tsx`**
- Agregar prop `onDelete?: (lead: LeadGenEntry) => void`
- En `LeadRow`: si `onDelete` está definido, cambiar el botón `Eye` por un `DropdownMenu` con "Ver detalle" y "Eliminar" (destructive)
- Pasar `onDelete` desde el componente padre

**5. `src/pages/leadgen/ViewLeadModal.tsx`**
- Agregar prop `onDelete?: () => void`
- Si `onDelete` está definido, mostrar botón "Eliminar" destructive en el footer del modal

**6. Crear `src/pages/leadgen/DeleteLeadDialog.tsx`**
- Componente AlertDialog similar a `DeleteContactoDialog`
- Elimina de la tabla `leadgen_entries` por `id`
- Invalida queries `["leadgen"]`

**7. `src/pages/leadgen/LeadGenContent.tsx`** (o donde se montan los modales de leads)
- Importar `useUserRole`, verificar `isAdmin`
- Agregar estado `deleteOpen` y `deleteLead`
- Pasar `onDelete={isAdmin ? handleDeleteLead : undefined}` a `LeadGenTable` y `ViewLeadModal`
- Montar `DeleteLeadDialog`

### Seguridad
- Las opciones de eliminar solo se renderizan si el usuario es admin (`isAdmin` del hook `useUserRole`)
- La eliminación se hace via Supabase client con las RLS policies existentes

