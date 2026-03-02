

## Plan: Añadir botón de retorno al Landing en Login

Agregar un botón con icono `ArrowLeft` en la parte superior del formulario de login que navegue a `/` (landing page). Siguiendo el patrón establecido de navegación: icono ghost sin texto.

### Cambio
**`src/pages/Login.tsx`**: Añadir un `Button` ghost con `ArrowLeft` antes del título "Iniciar sesión", usando `Link` o `navigate("/")`.

