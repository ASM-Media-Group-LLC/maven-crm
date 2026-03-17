

## Plan: Selects inline para Categoría/Cuenta origen/Estado + Contactos como popover + Restricción de tabs por rol

### Resumen
Implementar los dos planes aprobados previamente que no se aplicaron:
1. Reemplazar `InlineText` por selects inline para Categoría, Cuenta de origen y Estado
2. Convertir `# Contactos` en un popover con historial + formulario de registro
3. Restringir tab "Todas" solo a admin/manager; closers ven solo sus tabs

### Cambios en `LeadTable.tsx`

**Nuevos componentes inline:**
- `InlineCategorySelect`: Select con opciones fijas `["A+", "A", "B+", "B", "C"]` — reemplaza `InlineText` para `category` en tabs "todas" y "asignadas"
- `InlineSourceSelect`: Popover con opciones dinámicas (valores únicos existentes de `source_account`) + input "Otra..." para agregar nuevas — reemplaza `InlineText` para `source_account`
- `InlineStageSelect`: Select con `CLOSER_STAGES` coloreado — reemplaza el `<Badge>` estático del estado en tab "todas" para filas `_source === "closer"`
- `ContactCountCell`: Popover que al hacer click en el badge `X/6` muestra historial de contactos + formulario rápido (Canal, Resultado, Notas) usando `useContactHistory` — reemplaza el badge estático y elimina el botón separado `ContactQuickForm`

**Limpieza:**
- Eliminar import de `ContactQuickForm` y su uso en filas
- El formulario de contacto ahora vive dentro de `ContactCountCell`

### Cambios en `ClosersContent.tsx`

- Filtrar `TABS` dinámicamente: solo mostrar "Todas" si `isAdmin || isManager`
- Para closers, el array de tabs comienza en "Asignaciones"

### Cambios en `useCloserLeads.ts`

- Cambiar `activeTab` default: si no es admin/manager, iniciar en `"asignadas"` en lugar de `"todas"`
- Esto se puede lograr con: `const [activeTab, setActiveTab] = useState(() => (isAdmin || isManager) ? "todas" : "asignadas")`
- Nota: como `isAdmin`/`isManager` vienen de `useUserRole` que es async, usar un `useEffect` para redirigir el tab cuando el rol se resuelva

### Archivos a modificar
- `src/pages/closers/components/LeadTable.tsx` — Nuevos componentes inline, eliminar ContactQuickForm
- `src/pages/closers/ClosersContent.tsx` — Filtrar tabs por rol
- `src/pages/closers/hooks/useCloserLeads.ts` — Default tab según rol

