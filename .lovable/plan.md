

## Plan: Mejorar botón de retorno en AuthLayout

Modificar el topbar en `src/components/auth/AuthLayout.tsx`:
- **Eliminar** el `Logo size="xs"` del lado derecho
- **Reemplazar** el botón icon-only `ArrowLeft` por un botón ghost con texto: icono `ArrowLeft` + "Volver al inicio"
- Posicionar solo a la izquierda con `justify-start`

