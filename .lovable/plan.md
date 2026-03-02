

## Plan: Topbar en Login con Logo y Back

Agregar un topbar fijo encima del formulario de login con dos elementos:
- **Izquierda**: Botón `ArrowLeft` ghost que navega a `/` (landing)
- **Derecha**: Componente `Logo` size="xs" o "sm"

### Cambios

**`src/pages/Login.tsx`**:
- Mover el botón `ArrowLeft` fuera del formulario hacia un nuevo topbar
- El topbar será un `div` con `flex justify-between items-center` posicionado dentro del `AuthLayout` pero antes del card, o directamente como overlay `fixed top-0` con `z-20`

**`src/components/auth/AuthLayout.tsx`**:
- Agregar un slot o directamente el topbar aquí con `Logo` a la derecha y un `Link` back a la izquierda, ya que aplica a todas las páginas de auth
- Posicionado `absolute top-0 left-0 right-0` con padding, sobre el fondo animado

Esto es más limpio en `AuthLayout` ya que el back al landing tiene sentido en todas las pantallas de auth (login, register, forgot-password).

