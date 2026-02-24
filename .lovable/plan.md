

## Notificaciones Automaticas y Alertas Visuales en Onboarding

### Resumen

Implementar tres funcionalidades de alerta para el flujo de onboarding:
1. Notificar al Admin cuando una creadora complete el Paso 4
2. Notificar al Manager cuando sus creadoras no suban contenido en 3 dias
3. Alerta visual en la tabla/grid cuando el ID del Paso 3 esta pendiente de aprobacion

---

### 1. Notificacion al Admin al completar Paso 4

**Estado actual:** Ya existe una notificacion generica de `onboarding_complete` que se inserta en la tabla `notifications` al confirmar la asignacion (linea 566 de OnboardingWizard.tsx). Sin embargo, no se dirige especificamente a los Admins.

**Cambio:**

**Archivo:** `src/pages/creadores/onboarding/OnboardingWizard.tsx`

En `handleAssignmentConfirm`, tras el submit exitoso, se consultaran los usuarios con rol `admin` desde `user_roles` + `profiles` y se insertara una notificacion dirigida a cada uno de ellos (con `user_id` especifico):

```text
1. Consultar: SELECT ur.user_id FROM user_roles ur WHERE ur.role = 'admin'
2. Para cada admin_id, insertar en notifications:
   - user_id: admin_id
   - type: "onboarding_step4_complete"
   - title: "Onboarding Paso 4 completado"
   - message: "{nombre} ha completado la configuracion comercial y esta pendiente de verificacion."
   - reference_id: creator_id
   - reference_type: "creator"
```

Se reemplazara la notificacion generica actual (sin user_id) por estas notificaciones dirigidas.

---

### 2. Notificacion al Manager por inactividad de 3 dias

**Enfoque:** Dado que el sistema no tiene un backend de jobs (cron), esta alerta se calculara en el frontend al cargar la lista de onboarding. Si una creadora con status `onboarding` o `pendiente_verificacion` no tiene `profile_photo_url` (indicador de que no ha subido contenido en el Paso 3) y su `last_autosave_at` o `updated_at` es mayor a 3 dias, se generara una notificacion al manager asignado.

**Archivo:** `src/pages/creadores/onboarding/useOnboarding.ts`

Se agregara una funcion `checkInactivityAlerts` que:
1. Filtra creadoras con status `onboarding` y `assigned_manager_profile_id` no nulo
2. Calcula si `updated_at` es mayor a 3 dias
3. Verifica si ya existe una notificacion reciente del tipo `onboarding_inactivity` para ese creator (evitar duplicados)
4. Si no existe, inserta una notificacion dirigida al manager:
   - user_id: assigned_manager_profile_id
   - type: "onboarding_inactivity"
   - title: "Creadora inactiva por 3+ dias"
   - message: "{nombre} no ha actualizado su onboarding en mas de 3 dias."
   - reference_id: creator_id

Esta verificacion se ejecutara una vez al cargar los datos del hook `useOnboarding`, usando un `useEffect` con dependencia en los datos.

---

### 3. Alerta visual en tabla/grid para Paso 3 pendiente de aprobacion

**Logica:** Si el `dbStatus` es `pendiente_verificacion`, se mostrara un indicador visual especial en la fila/card.

**Archivos:**
- `src/pages/creadores/onboarding/OnboardingTable.tsx`
- `src/pages/creadores/onboarding/OnboardingGrid.tsx`

**Cambios:**
- Agregar el campo `dbStatus` al tipo `OnboardingCreator` (ya existe en la interfaz).
- Cuando `item.dbStatus === "pendiente_verificacion"`, aplicar:
  - Un icono de `ShieldAlert` (de lucide) al lado del nombre de la creadora
  - La clase CSS `badge-pending-verification` (ya existe en index.css con animacion `badge-glow`) al Badge de estado
  - Un Tooltip explicativo: "Documentos del Paso 3 pendientes de aprobacion"
- Agregar una columna/indicador "Docs" en la tabla que muestre un icono de alerta naranja cuando `dbStatus === "pendiente_verificacion"`

---

### Archivos a crear/modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/creadores/onboarding/OnboardingWizard.tsx` | Reemplazar notificacion generica por notificaciones dirigidas a admins con tipo `onboarding_step4_complete` |
| `src/pages/creadores/onboarding/useOnboarding.ts` | Agregar logica de deteccion de inactividad de 3 dias y creacion de notificacion al manager |
| `src/pages/creadores/onboarding/OnboardingTable.tsx` | Agregar alerta visual (icono + glow) para creadoras con `pendiente_verificacion` |
| `src/pages/creadores/onboarding/OnboardingGrid.tsx` | Agregar alerta visual (icono + glow) para creadoras con `pendiente_verificacion` en cards |

---

### Detalle tecnico

**Notificacion dirigida a Admins (OnboardingWizard.tsx):**
- Query a `user_roles` filtrado por `role = 'admin'` para obtener los `user_id`
- Batch insert de notificaciones con `user_id` especifico por cada admin
- Se elimina la notificacion generica actual sin `user_id`

**Deteccion de inactividad (useOnboarding.ts):**
- Se agrega `updated_at` a la interfaz `OnboardingCreator` y al mapping de datos
- En un efecto posterior al fetch, se filtran creadoras inactivas (>3 dias sin update, status `onboarding`)
- Se consulta `notifications` para verificar si ya se envio una alerta reciente (ultimas 24h) del tipo `onboarding_inactivity` para ese creator
- Si no existe, se inserta la notificacion al manager asignado
- Este check se ejecuta maximo una vez por carga del hook

**Alerta visual (OnboardingTable.tsx / OnboardingGrid.tsx):**
- Importar `ShieldAlert` de lucide-react y `Tooltip` de la UI
- Condicional: si `item.dbStatus === "pendiente_verificacion"`, mostrar icono naranja con tooltip junto al nombre
- Aplicar clase `badge-pending-verification` al Badge de estado para activar la animacion de glow pulsante que ya existe en el CSS

