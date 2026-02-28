

## Agregar campos al modal de Nueva Solicitud y renombrar label

### Resumen

Se agregaran 4 campos nuevos al formulario y se renombrara el label del chatter. Dos de los campos nuevos requieren columnas adicionales en la base de datos.

---

### 1. Migracion de base de datos

Agregar 3 columnas a `custom_content_requests`:

- `request_date DATE DEFAULT CURRENT_DATE` -- fecha de solicitud (con valor por defecto hoy)
- `fan_username TEXT` -- nombre del fan/suscriptor externo
- `fan_spent_amount NUMERIC` -- cuanto ha gastado el fan

El campo "Estado" ya existe en la tabla como `status` (default `'pendiente'`).

---

### 2. Actualizar useCustomRequests.ts

- Agregar `request_date`, `fan_username`, `fan_spent_amount` al tipo `CustomContentRequest`
- Ampliar los parametros de `createRequest.mutationFn` para aceptar los nuevos campos

---

### 3. Actualizar NewRequestModal.tsx

**Renombrar label:**
- "Chatter / Usuario Asignado" pasa a ser "Chatter Asignado"

**Nuevos estados:**
- `requestDate` (string) -- inicializado con la fecha de hoy
- `status` (string) -- inicializado en "pendiente"
- `fanUsername` (string) -- nombre del fan
- `fanSpentAmount` (string) -- monto gastado por el fan

**Nuevos campos en el formulario (despues de Descripcion, antes de Tipo de Contenido):**

1. **Fecha de Solicitud + Estado**: Fila de 2 columnas. La fecha usa un input date con valor por defecto hoy. El estado usa un Select con opciones: Pendiente, En Progreso, Completado, Cancelado.

2. **Usuario (Fan) + Cuanto ha Gastado**: Fila de 2 columnas. El usuario es un input de texto libre. El monto es un input numerico con placeholder "$0.00".

**Actualizacion del handleSubmit:**
- Pasar `request_date`, `status`, `fan_username`, `fan_spent_amount` al mutate
- Resetear los nuevos campos en onSuccess

---

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| Nueva migracion SQL | Agregar columnas `request_date`, `fan_username`, `fan_spent_amount` |
| `src/pages/creadores/personalizados/useCustomRequests.ts` | Actualizar tipo y mutacion |
| `src/pages/creadores/personalizados/NewRequestModal.tsx` | Agregar 4 campos, renombrar label del chatter |

