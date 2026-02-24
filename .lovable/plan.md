

## Notificaciones Automaticas y Alertas Visuales en Onboarding

### Estado: ✅ Implementado

1. **Notificación al Admin al completar Paso 4** — Reemplazada la notificación genérica por notificaciones dirigidas a cada admin (consultando `user_roles` con `role = 'admin'`).
2. **Notificación al Manager por inactividad de 3 días** — Lógica en `useOnboarding.ts` que detecta creadoras con status `onboarding`, `updated_at` > 3 días, y envía notificación al manager asignado (con deduplicación de 24h).
3. **Alerta visual en tabla/grid** — Icono `ShieldAlert` naranja con tooltip y badge con animación `badge-glow` para creadoras con `dbStatus === "pendiente_verificacion"`. Nueva columna "Docs" en la tabla.
