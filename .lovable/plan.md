

# Plan: Preparar UI de Monitoreo para integración Hubstaff

## Resumen

Si, es totalmente posible. La idea es crear las tablas en la base de datos que almacenarán los datos de Hubstaff, y refactorizar la UI actual para que lea de esas tablas en vez de los datos mock. Mientras no haya datos reales, la UI mostrará estados vacíos. Cuando se conecte la API, los datos aparecerán automáticamente.

## 1. Tablas en Base de Datos (migración SQL)

### `hubstaff_members`
Mapeo entre usuarios de Hubstaff y perfiles de la plataforma.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid PK | ID interno |
| profile_id | uuid FK profiles | Vínculo al perfil local |
| hubstaff_user_id | text | ID del usuario en Hubstaff |
| hubstaff_org_id | text | Organization ID |
| is_active | boolean | Activo en monitoreo |
| created_at | timestamptz | Fecha de creación |

### `hubstaff_activities`
Registros de actividad por intervalos (lo que Hubstaff envía cada 10 min).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid PK | ID interno |
| member_id | uuid FK hubstaff_members | Miembro vinculado |
| starts_at | timestamptz | Inicio del intervalo |
| tracked_seconds | int | Segundos trackeados |
| mouse_events | int | Eventos de mouse |
| keyboard_events | int | Eventos de teclado |
| overall_activity | int | % actividad general (0-100) |
| mouse_activity | int | % actividad mouse |
| keyboard_activity | int | % actividad teclado |
| project_name | text | Proyecto Hubstaff (opcional) |
| task_name | text | Tarea Hubstaff (opcional) |

### `hubstaff_screenshots`
Capturas de pantalla periódicas.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid PK | ID interno |
| member_id | uuid FK hubstaff_members | Miembro vinculado |
| captured_at | timestamptz | Momento de captura |
| screenshot_url | text | URL de la imagen |
| activity_percent | int | % actividad al momento |

### `hubstaff_config`
Configuración de la integración (API token, org ID, estado de conexión).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid PK | Singleton row |
| api_token_set | boolean | Si el token está configurado (el token real va en secrets) |
| org_id | text | Organization ID |
| sync_enabled | boolean | Sincronización activa |
| last_sync_at | timestamptz | Última sincronización |
| sync_interval_minutes | int default 10 | Intervalo de sync |

## 2. Hook `useHubstaffData`
Nuevo hook que reemplaza los datos mock:
- Consulta `hubstaff_members` + join con `profiles` para lista de agentes
- Consulta `hubstaff_activities` del día actual para KPIs en tiempo real
- Calcula status (activo/inactivo/desconectado) basado en `last_activity` timestamp
- Si no hay datos, retorna arrays vacíos (la UI muestra estado vacío)

## 3. Hook `useHubstaffAgentDetail`
Para la vista de detalle del agente:
- Consulta `hubstaff_activities` filtrado por miembro y periodo (diario/semanal/mensual)
- Consulta `hubstaff_screenshots` del día
- Genera timeline real desde los intervalos de actividad

## 4. Refactorizar `HRMonitoring.tsx`
- Reemplazar `MOCK_AGENTS` con datos del hook `useHubstaffData`
- Mantener la misma UI (tabla, grid, calendario, filtros)
- Agregar estado vacío: "No hay datos de monitoreo. Configura la integración con Hubstaff para comenzar."
- El modal de "Configurar API" guardará `org_id` en `hubstaff_config` y mostrará instrucciones para agregar el token como secret

## 5. Refactorizar `AgentDetailSheet.tsx`
- Reemplazar generadores mock con datos del hook `useHubstaffAgentDetail`
- Screenshots: mostrar imágenes reales desde `hubstaff_screenshots` (o placeholder si no hay)
- Timeline: construir desde intervalos reales de `hubstaff_activities`
- Charts: datos reales de actividad por hora/día

## 6. Modal de Configuración mejorado
- Guardar org_id en tabla `hubstaff_config`
- Botón "Probar Conexión" que validará cuando exista el edge function
- Estado de conexión visible: "Conectado" / "Desconectado" / "Pendiente de configuración"
- Fecha de última sincronización

## Archivos modificados
| Recurso | Cambio |
|---------|--------|
| DB migration | Crear 4 tablas: hubstaff_members, hubstaff_activities, hubstaff_screenshots, hubstaff_config + RLS |
| `src/hooks/useHubstaffData.ts` | Nuevo hook: lista de agentes y KPIs desde DB |
| `src/hooks/useHubstaffAgentDetail.ts` | Nuevo hook: detalle de agente desde DB |
| `HRMonitoring.tsx` | Reemplazar mock con hooks reales + estados vacíos |
| `AgentDetailSheet.tsx` | Reemplazar generadores mock con datos de DB |

## Resultado
La UI quedará 100% conectada a la base de datos. Actualmente mostrará estados vacíos con mensajes guía. Cuando se implemente el edge function de sincronización con Hubstaff, los datos fluirán automáticamente sin tocar la UI.

