

## Plan: Notificaciones de ausencias por correo + Google Calendar

### Fase 1: Notificación por correo al admin (implementación directa)

**Cómo funciona**: Cuando se crea o aprueba una solicitud de permiso, una edge function envía un correo al admin con los detalles.

**Cambios:**

1. **Scaffold transactional email** usando `email_domain--scaffold_transactional_email` para configurar la infraestructura de envío de correos sin servicios externos.

2. **Crear edge function `notify-absence`** (`supabase/functions/notify-absence/index.ts`):
   - Recibe: `absence_id`, `action` ("created" | "approved")
   - Consulta los datos de la ausencia (empleado, tipo, fecha, motivo)
   - Envía correo al admin usando `send-transactional-email`
   - Contenido: tipo de permiso, nombre del empleado, fecha, motivo, link al documento adjunto si existe

3. **Invocar la edge function** desde el frontend:
   - En `HRPermisoNew.tsx`: después del `insert` exitoso, llamar `supabase.functions.invoke("notify-absence", { body: { absence_id, action: "created" } })`
   - En la vista de aprobación (donde se cambia status a "approved"): llamar con `action: "approved"`

4. **Migración SQL**: Crear tabla `admin_notification_settings` para configurar qué email(s) de admin reciben las notificaciones, o usar un approach más simple: una variable de entorno `ADMIN_EMAIL` como secret.

### Fase 2: Google Calendar (requiere configuración manual del usuario)

**Prerrequisitos que el usuario debe completar:**
1. Crear un proyecto en Google Cloud Console
2. Habilitar la Google Calendar API
3. Configurar OAuth 2.0 consent screen y credenciales
4. Proporcionar Client ID y Client Secret como secrets del proyecto

**Cambios técnicos:**
1. **Agregar secrets**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`
2. **Crear edge function `sync-absence-calendar`**: Crea/actualiza eventos en Google Calendar cuando se crea o aprueba un permiso
3. **Flujo de autorización**: Página simple para que el admin autorice su cuenta de Google (one-time OAuth flow) y almacene el refresh token

**Nota**: Esta fase es significativamente más compleja y requiere pasos manuales en Google Cloud Console.

---

### Recomendación

Sugiero **implementar primero la Fase 1** (correo) ya que es inmediata y no requiere configuración externa. La Fase 2 (Google Calendar) se puede abordar después una vez tengas las credenciales de Google configuradas.

### Resumen técnico

| Componente | Archivo | Acción |
|---|---|---|
| Transactional email infra | scaffold tool | Crear |
| Edge function notify-absence | `supabase/functions/notify-absence/index.ts` | Crear |
| Secret ADMIN_EMAIL | Supabase secrets | Agregar |
| HRPermisoNew.tsx | `src/pages/hr/HRPermisoNew.tsx` | Modificar (invocar notificación) |
| HRPermisos.tsx | `src/pages/hr/HRPermisos.tsx` | Modificar (invocar al aprobar) |

