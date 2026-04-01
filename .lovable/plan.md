

## Añadir acción de eliminar en la tabla de Templates

### Cambios

**Archivo**: `src/pages/finanzas/facturacion/TemplatesPage.tsx`

1. Añadir estado `deleteTemplate` para controlar el diálogo de confirmación
2. Añadir botón de eliminar (icono `Trash2`) en la columna de acciones, junto a Ver y Editar
3. Añadir un `AlertDialog` de confirmación (mismo patrón que `DeleteEventoDialog`) que al confirmar ejecute `supabase.from("invoice_templates").delete().eq("id", id)` e invalide la query
4. Importar `Trash2` de lucide-react y los componentes de `AlertDialog`

### Resultado
Cada fila tendrá 3 acciones: Ver | Editar | Eliminar, con confirmación antes de borrar.

