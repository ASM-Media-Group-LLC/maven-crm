

## Paso 4: Actualizar Modal de Nueva Solicitud con campos adicionales y toast mejorado

### Resumen

Se agregaran dos nuevos campos al modal "Nueva Solicitud de Contenido" (selector de Chatter/Usuario y input de Valor Pagado), se crearan las columnas correspondientes en la base de datos, y se actualizara el toast de exito con el mensaje especifico solicitado usando `useToast` en lugar de `sonner`.

---

### 1. Migracion de base de datos

Crear una nueva migracion SQL para agregar dos columnas a `custom_content_requests`:

- `assigned_chatter_id UUID REFERENCES public.profiles(id)` -- para el chatter/usuario asignado
- `paid_amount NUMERIC` -- para el valor pagado

---

### 2. Actualizar tipos en useCustomRequests.ts

- Agregar `assigned_chatter_id` y `paid_amount` al tipo `CustomContentRequest`
- Agregar un join adicional en la query para obtener el nombre del chatter asignado: `assigned_chatter:profiles!custom_content_requests_assigned_chatter_id_fkey(id, full_name)`
- Ampliar los parametros de `createRequest.mutationFn` para aceptar `assigned_chatter_id` y `paid_amount`
- Cambiar el toast de exito de `toast.success()` (sonner) a `toast()` de `@/hooks/use-toast` con el mensaje: "Solicitud creada exitosamente" como titulo y "Correos automaticos enviados a Creadora y Manager" como descripcion

---

### 3. Actualizar NewRequestModal.tsx

**Nuevos estados:**
- `chatterId` (string | null) -- para el selector de chatter
- `paidAmount` (string) -- para el input numerico de valor pagado
- `chatterOpen` (boolean) -- para el combobox de chatter

**Nueva query:** Obtener la lista de perfiles (chatters/usuarios) desde la tabla `profiles` con `id` y `full_name`.

**Nuevos campos en el formulario** (insertados entre la fila de Creadora y Fecha Limite):

1. **Chatter / Usuario Asignado**: Un Combobox (Popover + Command) identico en estilo al selector de Creadora existente, que lista los perfiles disponibles y permite buscar por nombre.

2. **Valor Pagado**: Un input numerico con placeholder "$0.00", en una fila de 2 columnas junto a la Fecha Limite.

**Actualizacion del handleSubmit:**
- Pasar `assigned_chatter_id: chatterId` y `paid_amount: parseFloat(paidAmount) || undefined` al mutate
- Resetear los nuevos campos en onSuccess
- Reemplazar el toast de sonner por `useToast` con titulo y descripcion especificos

---

### 4. Actualizar el toast en useCustomRequests.ts

Cambiar el import de `toast` de `sonner` a `@/hooks/use-toast` y actualizar el `onSuccess` de `createRequest`:

```text
toast({
  title: "Solicitud creada exitosamente",
  description: "Correos automaticos enviados a Creadora y Manager",
})
```

Los demas toasts (update, delete) tambien se migraran a `useToast` para mantener consistencia con la memoria del proyecto.

---

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| Nueva migracion SQL | Agregar columnas `assigned_chatter_id` y `paid_amount` |
| `src/pages/creadores/personalizados/useCustomRequests.ts` | Actualizar tipo, query, mutacion y toasts |
| `src/pages/creadores/personalizados/NewRequestModal.tsx` | Agregar campos de chatter y valor pagado, actualizar submit |

