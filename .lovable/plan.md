
## Sistema de Permisos por Rol en el Modulo de Creadoras

### Contexto

El sistema ya tiene roles definidos en `useUserRole.ts`: admin, manager, employee, agent, closer, supervisor. Segun la documentacion del proyecto, el rol **"agent"** corresponde al perfil de **Chatter/Specialist**. Se usara este mapeo sin necesidad de cambios en la base de datos.

---

### Cambios por archivo

#### 1. `src/hooks/useUserRole.ts` - Agregar helpers para agent/chatter

- Agregar `isAgent: role === "agent"` al objeto de retorno
- Agregar `isSupervisor: role === "supervisor"` para completar
- Estos helpers simplifican las verificaciones en los componentes

#### 2. `src/components/dashboard/DashboardTopbar.tsx` - Badge de rol en el header

- Importar `useUserRole` y `Badge`
- Mostrar un Badge pequeno junto al nombre del usuario con el rol actual
- Mapeo de labels: admin = "Admin", manager = "Manager", agent = "Chatter", employee = "Empleado", closer = "Closer", supervisor = "Supervisor"
- Color diferenciado por rol (primary-soft para admin/manager, secondary-soft para otros)

#### 3. `src/pages/creadores/onboarding/OnboardingContent.tsx` - Ocultar boton para chatters

- Importar `useUserRole`
- Si `isAgent` es true, ocultar el boton "+ Iniciar Onboarding"
- Ocultar tambien la seccion "Onboardings en Curso" (solo managers/admins gestionan onboarding)
- Los chatters aun pueden ver la lista/tabla de onboardings en modo lectura

#### 4. `src/pages/creadores/CreadorProfileContent.tsx` - Tabs restringidos para chatters

- Importar `useUserRole`
- Definir las tabs visibles por rol:
  - **Manager/Admin**: todas las tabs (operaciones, info, lineamientos, redes, monetizacion, documentos, notas, tickets, historial)
  - **Agent (Chatter)**: solo la tab "operaciones" (que contiene pricing, tono de voz, limites -- la informacion operativa que el chatter necesita). Se renombra visualmente a "Insights" para chatters
- Ocultar el boton de cambio de estado (badge clickeable) para chatters
- Ocultar la seccion de verificacion para chatters
- Tab default cambia a "operaciones" para todos (ya es asi)

#### 5. `src/pages/creadores/DocumentosTabContent.tsx` - Ocultar documentos de identidad

- Importar `useUserRole`
- Si `isAgent` es true, filtrar los documentos para excluir archivos cuyo nombre contenga "cedula", "selfie", "identidad", "DNI" u otros terminos de documentos de identidad
- Ocultar el boton de "Subir Documento" para chatters
- Nota: como los chatters no veran la tab de documentos (punto 4), esto es una capa adicional de seguridad

---

### Resumen de visibilidad por rol

```text
Funcionalidad                    | Manager/Admin | Chatter (Agent)
---------------------------------|---------------|----------------
+ Iniciar Onboarding             | Visible       | Oculto
Onboardings en Curso             | Visible       | Oculto
Editar formulario onboarding     | Habilitado    | N/A
Tab Operaciones/Insights         | Visible       | Visible (solo lectura)
Tabs Info/Redes/Monetizacion...  | Visible       | Oculto
Tab Documentos                   | Visible       | Oculto
Aprobar/Rechazar perfiles        | Habilitado    | Oculto
Badge de rol en header           | Visible       | Visible
Cambio de estado creadora        | Habilitado    | Oculto
```

### Detalle tecnico

**Badge de rol en Topbar**:
Se inserta entre el nombre del usuario y el avatar un Badge pequeno con el rol. Usa el patron existente de Badge con variantes soft.

**Logica de tabs condicional**:
Se define un array `visibleTabs` basado en el rol. Para chatters: `[{ value: "operaciones", label: "Insights" }]`. Para managers/admins: el array completo actual. Se itera sobre este array para renderizar TabsTrigger y TabsContent.

**No se requieren cambios en la base de datos** ya que los roles "agent" y "manager" ya existen en la tabla `user_roles` y en el enum `app_role`.
