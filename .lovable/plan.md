

## Agregar campo "Categoria" (Normal/Buster) con reactividad al modal

### Resumen

Se agrega un nuevo campo "Categoria" al formulario de Nueva Solicitud con dos opciones (Normal / Buster). Seleccionar "Buster" produce efectos reactivos en otros campos del formulario y modifica el payload enviado al backend.

---

### 1. Migracion de base de datos

Agregar columna `category` a `custom_content_requests`:

```sql
ALTER TABLE public.custom_content_requests
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'normal';
```

---

### 2. Actualizar tipos y hook (`useCustomRequests.ts`)

- Agregar `category: string` al tipo `CustomContentRequest`
- Agregar `category?: string` a los parametros de `createRequest.mutationFn`

---

### 3. Actualizar el modal (`NewRequestModal.tsx`)

**Nuevo estado:**
- `category` (string, default `"normal"`)

**Nuevo campo en el formulario:**
- Agregar un Select "Categoria" con opciones "Normal" y "Buster", ubicado en la fila junto a "Estado" (reorganizar a una fila de 3 columnas: Fecha de Solicitud | Estado | Categoria) o como fila independiente antes de "Usuario (Fan)"

**Reactividad cuando `category === "buster"`:**

1. **Helper text en "Cuanto ha Gastado"**: Mostrar debajo del input un texto sutil (`text-xs text-amber-500`) que diga: "Aplicar tarifa Buster (Sugerido: +20% o cuota fija)"

2. **Resaltado visual en "Fecha Limite"**: Agregar un borde sutil rojo/amber al input (`border-red-400`) y un icono de rayo al lado del label de "Fecha Limite"

3. **Override del payload en handleSubmit**: Cuando `category === "buster"`, forzar `priority: "alta"` en el objeto enviado al backend (independientemente de lo que el usuario haya seleccionado en el campo Prioridad), e incluir `category: "buster"` en el payload

**Reset en onSuccess:**
- Resetear `category` a `"normal"`

---

### 4. Contenido adicional de la imagen de referencia

La imagen muestra tipos de contenido adicionales ("Articulo", "Prenda") que no estan en la lista actual. Se agregaran al array `CONTENT_TYPES` para mantener consistencia con el sistema real:
- `{ value: "articulo", label: "Articulo" }`
- `{ value: "prenda", label: "Prenda" }`

---

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| Nueva migracion SQL | Agregar columna `category` |
| `useCustomRequests.ts` | Agregar `category` al tipo y mutacion |
| `NewRequestModal.tsx` | Nuevo campo Categoria, reactividad visual, override de payload |

