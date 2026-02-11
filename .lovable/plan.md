
# Integrar Modal de Cambio de Estado en la Tabla de Creadores

## Descripción
Reemplazar el actual **DropdownMenu** de cambio de estado en `CreadoresTable.tsx` (líneas 172-202) con el modal `ChangeStatusModal` que ya existe en el perfil. De esta forma, el usuario verá un modal consistente con experiencia unificada para cambiar estado tanto en la tabla como en el perfil.

## Cambios propuestos

### 1. Editar: `src/pages/creadores/CreadoresTable.tsx`

**Sección 1 - Importaciones (línea 29):**
- Agregar import: `import ChangeStatusModal from "./ChangeStatusModal";`

**Sección 2 - Estado del componente (después de línea 75):**
- Agregar estado para manejar el modal:
  ```typescript
  const [statusChangeCreator, setStatusChangeCreator] = useState<CreatorWithBusiness | null>(null);
  ```

**Sección 3 - Reemplazar DropdownMenu (líneas 172-202):**
- Reemplazar todo el `<DropdownMenu>` con un simple `<button>` que abre el modal:
  ```typescript
  <button
    onClick={() => setStatusChangeCreator(c)}
    className="flex items-center gap-1 focus:outline-none cursor-pointer hover:opacity-80 transition-opacity"
  >
    <Badge variant={statusVariant[c.status ?? ""] ?? "secondary-soft"}>
      {statusLabel[c.status ?? ""] ?? c.status ?? "—"}
    </Badge>
    <ChevronDown className="h-3 w-3 text-muted-foreground" />
  </button>
  ```
  - Esto hace el badge clickeable con hover effect, sin el DropdownMenu

**Sección 4 - Agregar Modal al final (antes del cierre de `<>`, línea 355):**
- Insertar el componente ChangeStatusModal después de los modales existentes (ViewCreadorModal):
  ```typescript
  {statusChangeCreator && (
    <ChangeStatusModal
      creatorId={statusChangeCreator.id}
      creatorName={statusChangeCreator.name}
      currentStatus={statusChangeCreator.status ?? ""}
      open={!!statusChangeCreator}
      onOpenChange={(open) => {
        if (!open) setStatusChangeCreator(null);
      }}
    />
  )}
  ```

## Flujo de interacción
1. Usuario hace clic en el badge de estado en la tabla
2. Se abre el modal `ChangeStatusModal`
3. El modal permite seleccionar nuevo estado y escribir nota obligatoria
4. Al confirmar, se actualiza el estado y se registra en historial/notas
5. El modal se cierra y se invalidan las queries (ya implementado en `ChangeStatusModal`)

## Ventajas
- **Consistencia UX**: El mismo modal y flujo en tabla y perfil
- **Experiencia mejorada**: Modal con justificación obligatoria es más formal que dropdown rápido
- **Auditoria**: Todos los cambios de estado se registran en `creator_history` y `creator_notes`
- **Eliminación de código**: Se borra el DropdownMenu innecesario
