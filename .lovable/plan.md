

## Sistema de Feedback Triangular para Creadoras

### 1. Nueva tabla en Supabase: `creator_feedback`

Se crea una tabla para almacenar los registros de feedback asociados a cada creadora.

| Columna | Tipo | Descripcion |
|---|---|---|
| id | uuid (PK) | Identificador unico |
| creator_id | uuid (NOT NULL) | Referencia a `creators.id` |
| user_id | uuid (NOT NULL) | Usuario que crea el registro (auth.uid) |
| feedback_type | text (NOT NULL) | `chatter_report`, `manager_evaluation`, `model_request` |
| message | text (NOT NULL) | Contenido del feedback |
| author_name | text | Nombre del autor (denormalizado para la timeline) |
| author_role | text | Rol del autor al momento de crear |
| created_at | timestamptz | Fecha de creacion |

RLS: Politica permisiva para usuarios autenticados (consistente con el patron existente en el proyecto).

### 2. Nuevo archivo: `src/pages/creadores/FeedbackTabContent.tsx`

Componente que contiene:

**Timeline (historial)**:
- Lista vertical estilo bitacora/chat corporativo ordenada de mas reciente a mas antiguo
- Cada entrada muestra: timestamp formateado, nombre + badge de rol del autor, badge de color segun tipo de feedback (Azul = Reporte de Chatter, Verde = Evaluacion de Manager, Naranja = Solicitud de Modelo), y el mensaje
- Linea vertical conectora entre entradas (borde izquierdo con indicador de color)
- Empty state cuando no hay registros

**Boton "+ Nuevo Registro"**:
- Abre un formulario inline (colapsable) con:
  - Selector de tipo de feedback (3 opciones con colores)
  - Textarea para el mensaje
  - Boton "Guardar"
- **Permisos**: Si `isAgent` es true, solo se muestra la opcion "Reporte de Chatter". Managers/Admins ven las 3 opciones.

### 3. Nuevo hook: `src/pages/creadores/useCreatorFeedback.ts`

- `useCreatorFeedback(creatorId)`: Query para obtener feedback ordenado por `created_at DESC`
- `useCreateFeedback()`: Mutacion para insertar nuevo feedback, incluyendo `author_name` y `author_role` del usuario actual

### 4. Modificacion: `src/pages/creadores/CreadorProfileContent.tsx`

- Importar `FeedbackTabContent`
- Agregar la pestana "Feedback y Rendimiento" visible para **todos los roles** (tanto chatters como managers)
- Se ubica despues de "Operaciones/Insights" en el TabsList

### Archivos a crear/modificar

| Archivo | Accion |
|---|---|
| Migracion SQL | Crear tabla `creator_feedback` con RLS |
| `src/pages/creadores/useCreatorFeedback.ts` | Crear hook de datos |
| `src/pages/creadores/FeedbackTabContent.tsx` | Crear componente de timeline + formulario |
| `src/pages/creadores/CreadorProfileContent.tsx` | Agregar tab "Feedback y Rendimiento" |

### Detalle tecnico

**Colores por tipo de feedback**:
```text
chatter_report     -> primary-soft (Azul)    -> "Reporte de Chatter"
manager_evaluation -> success-soft (Verde)   -> "Evaluacion de Manager"
model_request      -> warning-soft (Naranja) -> "Solicitud de Modelo"
```

**Logica de permisos en el formulario**:
```text
if (isAgent) {
  // Solo muestra opcion "Reporte de Chatter"
  feedbackTypes = [{ value: "chatter_report", label: "Reporte de Chatter" }]
} else {
  // Manager/Admin: las 3 opciones
  feedbackTypes = [todos]
}
```

**Timeline UI**: Cada entrada usa una Card con borde izquierdo coloreado segun el tipo. El avatar muestra las iniciales del autor. El timestamp usa `format(date, "dd MMM yyyy, HH:mm")` de date-fns.

