

## Quitar campo de Observaciones del modal de crear comisión

**Archivo**: `src/pages/finanzas/comisiones/NuevaComisionModal.tsx`

Eliminar el bloque del campo "Observaciones" (Label + Textarea) y la variable de estado `notes` asociada. Remover también `notes` del objeto que se pasa a `onSubmit`.

