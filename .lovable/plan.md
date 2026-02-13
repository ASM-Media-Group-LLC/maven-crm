

## Agregar toasts de exito y error al modal "Editar Promocion"

### Cambios en `src/pages/promolog/PromologEntryCard.tsx`

Se agregaran notificaciones toast usando el hook `useToast` (siguiendo el patron del proyecto) para los botones "Guardar Cambios" y "Cancelar" del modal de edicion.

### Detalle tecnico

1. **Import**: Agregar `import { useToast } from "@/hooks/use-toast";`
2. **Hook**: Agregar `const { toast } = useToast();` dentro del componente
3. **Boton "Guardar Cambios"** (linea 375-380): Mostrar toast de exito con titulo "Promocion actualizada" y descripcion con el nombre del creador, luego cerrar el modal
4. **Boton "Cancelar"** (linea 372-374): Mostrar toast informativo con titulo "Edicion cancelada" (siguiendo el patron existente del proyecto), luego cerrar el modal

### Comportamiento esperado
- Al hacer clic en "Guardar Cambios": toast de exito con `{ title: "Promocion actualizada", description: "Los cambios para [nombre] han sido guardados." }`
- Al hacer clic en "Cancelar": toast con `{ title: "Edicion cancelada" }`
- Si hay un error (futuro con Supabase): toast con `{ title: "Error al guardar", variant: "destructive" }`

