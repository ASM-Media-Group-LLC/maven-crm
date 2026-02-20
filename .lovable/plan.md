

## Paso 6: Centro de Notificaciones y Control de Verificacion

### Resumen

Implementar un sistema de notificaciones en la base de datos, conectar la campana del header para mostrar eventos pendientes con punto rojo, agregar una seccion de verificacion visible solo para Managers/Admins en el perfil de creadora, y resaltar visualmente el estado `pendiente_verificacion` en la tabla principal.

---

### 1. Tabla de notificaciones en Supabase

Crear una nueva tabla `notifications` para almacenar eventos del sistema:

```sql
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid, -- NULL = broadcast to managers/admins
  type text NOT NULL, -- 'onboarding_complete', 'documents_pending', 'verification_rejected'
  title text NOT NULL,
  message text,
  reference_id uuid, -- creator_id u otro recurso relacionado
  reference_type text, -- 'creator', 'document', etc.
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Authenticated users can update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Authenticated users can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);
```

### 2. Generar notificacion al completar onboarding

En `OnboardingWizard.tsx`, tras el `addCreador.mutateAsync(payload)` exitoso (cuando `isDraft === false`), insertar una notificacion:

```ts
await supabase.from("notifications").insert({
  type: "onboarding_complete",
  title: "Nueva modelo ha completado el onboarding",
  message: `${step1.name} ha completado el proceso de onboarding y esta pendiente de verificacion.`,
  reference_id: createdId, // se necesita extraer el ID del creador recien creado
  reference_type: "creator",
});
```

**Nota**: Actualmente `useAddCreadorWithBusiness` no retorna el ID del creador creado. Se modificara la mutacion para retornarlo.

### 3. Hook de notificaciones

Crear `src/hooks/useNotifications.ts`:

- Query para obtener notificaciones no leidas (ordenadas por fecha descendente)
- Contador de no leidas
- Mutacion para marcar como leida (individual o todas)
- Polling cada 30 segundos con `refetchInterval`

### 4. Centro de Notificaciones en el Header

Modificar `DashboardTopbar.tsx`:

- Reemplazar el Popover estatico actual de la campana (lineas 94-107) con uno funcional
- Mostrar el punto rojo con el conteo real de notificaciones no leidas
- Ocultar el badge cuando el conteo es 0
- Listar las ultimas notificaciones con:
  - Icono segun tipo (UserCheck para onboarding, FileText para documentos)
  - Titulo y tiempo relativo (hace X minutos)
  - Click para navegar al perfil de la creadora relacionada
  - Boton "Marcar todas como leidas"

### 5. Seccion de Verificacion para Managers

Crear `src/pages/creadores/VerificationSection.tsx`:

- Solo visible cuando el rol del usuario es `admin` o `manager` (usando `useUserRole`)
- Solo visible cuando el estado de la creadora es `pendiente_verificacion`
- Contiene:
  - Card con borde de color (warning) y titulo "Verificacion Pendiente"
  - Boton "Aprobar Verificacion" (verde): cambia estado a `active`, registra en historial, crea notificacion de aprobacion
  - Boton "Rechazar" (rojo): abre un campo de texto para el motivo, cambia estado a `borrador`, registra motivo en historial y notas

Integrar en `CreadorProfileContent.tsx` justo debajo del header card y antes de las tabs.

### 6. Actualizacion del tipo AppRole

En `useUserRole.ts`, actualizar el tipo para incluir los roles reales del sistema:

```ts
export type AppRole = "admin" | "manager" | "employee" | "agent" | "closer" | "supervisor";
```

### 7. Badge pulsante para `pendiente_verificacion`

En `CreadoresTable.tsx` y `CreadoresGrid.tsx`:

- Agregar `pendiente_verificacion` al mapa de estados con label "Pendiente Verificacion" y variant `warning-soft`
- Aplicar clase CSS `animate-pulse` al Badge cuando el estado es `pendiente_verificacion`
- Agregar un punto amarillo/naranja junto al badge para mayor visibilidad

En `src/index.css`, agregar una animacion sutil tipo "glow":

```css
@keyframes badge-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(234, 179, 8, 0.4); }
  50% { box-shadow: 0 0 8px 2px rgba(234, 179, 8, 0.3); }
}
.badge-pending-verification {
  animation: badge-glow 2s ease-in-out infinite;
}
```

---

### Archivos a crear

| Archivo | Descripcion |
|---|---|
| `src/hooks/useNotifications.ts` | Hook para consultar y gestionar notificaciones |
| `src/pages/creadores/VerificationSection.tsx` | Seccion de aprobacion/rechazo para Managers |

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| Migracion SQL | Crear tabla `notifications` con RLS |
| `src/pages/creadores/useCreadores.ts` | Modificar `useAddCreadorWithBusiness` para retornar el ID creado |
| `src/pages/creadores/onboarding/OnboardingWizard.tsx` | Insertar notificacion al completar onboarding |
| `src/components/dashboard/DashboardTopbar.tsx` | Integrar hook de notificaciones en la campana |
| `src/pages/creadores/CreadorProfileContent.tsx` | Agregar VerificationSection antes de tabs |
| `src/pages/creadores/CreadoresTable.tsx` | Agregar estado `pendiente_verificacion` con badge pulsante |
| `src/pages/creadores/CreadoresGrid.tsx` | Agregar estado `pendiente_verificacion` con badge pulsante |
| `src/hooks/useUserRole.ts` | Actualizar tipo AppRole con roles completos |
| `src/index.css` | Agregar animacion `badge-glow` |

