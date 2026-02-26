

## Plan: Traducir SetPermissionsModal al sistema de idiomas

### Diagnóstico

El `SetPermissionsModal.tsx` es el unico modal del módulo admin con textos hardcodeados en inglés. Todos los demás modales (AddUser, EditUser, DeleteUser, ChangeRole, CreateRole, EditRole, DeleteRole, ResetPassword) están en español. El modal de permisos nunca fue conectado al hook `useLanguage()`.

Strings en inglés detectados:
- "Set permissions for" / "Configure granular permissions for this role"
- "Menus" / "Function permissions" / "Data permissions"
- "All data" / "Self and subordinates" / "Data about self"
- "Permiso global — sin subfunciones" (este sí está en español)
- Botones "Cancelar" y "Guardar Permisos" (estos también están en español)

### Cambios propuestos

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | `src/lib/i18n.ts` | Agregar ~12 translation keys para el modal de permisos |
| 2 | `src/pages/admin/SetPermissionsModal.tsx` | Importar `useLanguage`, reemplazar strings hardcodeados por `t()` |

### Detalle

**Nuevas keys en i18n.ts:**

```typescript
// Permissions modal
"permissions.title": { es: "Configurar permisos para", en: "Set permissions for" },
"permissions.description": { es: "Configura los permisos granulares para este rol", en: "Configure granular permissions for this role" },
"permissions.menus": { es: "Menús", en: "Menus" },
"permissions.functions": { es: "Permisos de función", en: "Function permissions" },
"permissions.data": { es: "Permisos de datos", en: "Data permissions" },
"permissions.allData": { es: "Todos los datos", en: "All data" },
"permissions.subordinates": { es: "Propios y subordinados", en: "Self and subordinates" },
"permissions.selfOnly": { es: "Solo datos propios", en: "Data about self" },
"permissions.noSubfunctions": { es: "Permiso global — sin subfunciones", en: "Global permission — no sub-functions" },
"permissions.functions_count": { es: "funciones", en: "functions" },
"permissions.save": { es: "Guardar Permisos", en: "Save Permissions" },
"permissions.saving": { es: "Guardando...", en: "Saving..." },
```

**Cambio en SetPermissionsModal.tsx:**

- Importar `useLanguage` y obtener `t`
- Convertir `DATA_SCOPE_LABELS` y `DATA_SCOPE_OPTIONS` a funciones que usen `t()`
- Reemplazar todos los strings en el JSX por llamadas a `t()`

Esto no afecta la lógica de permisos ni la estructura del modal, solo los textos visibles.

