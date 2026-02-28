

## Agregar campos "Tiempo o Cantidad" y "Notas" al modal de Nueva Solicitud

### Resumen

Agregar dos campos nuevos al formulario de creacion de solicitudes:
1. **Tiempo o Cantidad** - campo de texto libre para indicar duracion del contenido (ej: "5 minutos", "3 fotos", "10 segundos")
2. **Notas** - campo de texto largo para observaciones adicionales al momento de crear la solicitud

### Cambios necesarios

**1. Migracion de base de datos** - Agregar columna `quantity_or_duration` (TEXT, nullable) a la tabla `custom_content_requests`. El campo `notes` ya existe en la tabla.

**2. `NewRequestModal.tsx`** - Agregar dos estados nuevos (`quantityOrDuration` y `notes`), agregar los campos al JSX (en una fila de 2 columnas: Tiempo o Cantidad + Notas), incluirlos en el `handleSubmit` y resetearlos en `onSuccess`.

**3. `useCustomRequests.ts`** - Agregar `quantity_or_duration` y `notes` como parametros opcionales en el tipo de `createRequest.mutationFn`.

### Ubicacion en el formulario

Los nuevos campos se colocaran despues de "Tipo de Contenido / Prioridad" y antes de "Chatter Asignado":

```text
Creadora
Descripcion
Fecha Solicitud | Estado | Categoria
Usuario (Fan) | Cuanto ha Gastado
Tipo de Contenido | Prioridad
Tiempo o Cantidad | Notas        <-- NUEVO
Chatter Asignado
Valor Pagado | Fecha Limite
```

### Detalle tecnico

- Nueva columna: `ALTER TABLE custom_content_requests ADD COLUMN quantity_or_duration TEXT;`
- El campo "Notas" usa la columna `notes` que ya existe en la tabla
- "Tiempo o Cantidad" sera un Input de texto (ej: "5 min", "3 fotos")
- "Notas" sera un Textarea de 2 filas

