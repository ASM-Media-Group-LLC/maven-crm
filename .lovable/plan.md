

# Agregar toasts de exito y error en subida de documentos

## Situacion actual

- `handleFilesUploaded` en `DocumentosTabContent.tsx` ya muestra un toast de **error** cuando falla el insert en la base de datos (linea 53)
- `FileUploadModal` muestra un toast generico de "archivo(s) subido(s) exitosamente" al completar el upload al storage
- Falta un toast de **exito** explicito en `DocumentosTabContent` cuando los registros se insertan correctamente en la tabla

## Cambio

### Modificar `src/pages/creadores/DocumentosTabContent.tsx`

En la funcion `handleFilesUploaded`:
- Agregar un contador de exitos y errores durante el loop de inserts
- Al finalizar el loop, mostrar toast de **exito** si hubo archivos registrados correctamente (titulo: "Documento(s) registrado(s)", descripcion con cantidad)
- Mantener el toast de **error** existente por cada fallo individual
- Usar las variantes del sistema: `variant: "destructive"` para error, variante default para exito (consistente con `FeedbackSection` del design system)

