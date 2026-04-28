## Problema

Cuando el coordinador finaliza la sesión Cowork (`cowork.session.status === "ended"`), los participantes ven una pantalla "Esta sesión ha finalizado" con el botón "Volver al inicio", el cual los regresa al lobby/listado del módulo Cowork. El comportamiento esperado: deben ser redirigidos automáticamente al dashboard principal de Maven (`/dashboard`).

## Cambio

En `src/pages/cowork/CoworkPage.tsx` (bloque de líneas ~109-128):

1. **Auto-redirect inmediato**: Agregar un `useEffect` que detecte `cowork.session?.status === "ended"` y ejecute `navigate("/dashboard", { replace: true })`. Mostrar un `toast.info("La sesión fue finalizada por el coordinador")` antes de redirigir.

2. **UI fallback transitoria**: Mientras ocurre el redirect (o si falla), reemplazar el botón "Volver al inicio" para que apunte a `/dashboard` en lugar de `setSearchParams({})`. Cambiar el label a **"Volver al dashboard"**. Esto garantiza coherencia con la nueva estrategia de salida (igual que el botón de colgar del participante).

3. **Importes necesarios**: Verificar que `useNavigate` (react-router-dom) y `toast` (sonner) ya estén importados; agregar si faltan.

## Snippet propuesto

```tsx
// Auto-redirect cuando el coordinador termina la sesión
useEffect(() => {
  if (cowork.session?.status === "ended") {
    toast.info("La sesión fue finalizada por el coordinador");
    navigate("/dashboard", { replace: true });
  }
}, [cowork.session?.status, navigate]);

// Fallback UI (visible solo el instante previo al redirect)
<Button
  variant="secondary"
  className="rounded-full px-6 mt-1"
  onClick={() => navigate("/dashboard", { replace: true })}
>
  Volver al dashboard
</Button>
```

## Archivos modificados

- `src/pages/cowork/CoworkPage.tsx`

¿Apruebas el plan?