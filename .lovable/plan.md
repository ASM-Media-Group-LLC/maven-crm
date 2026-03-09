

## Plan: Actualizar el Roadmap con el estado actual del proyecto

### Problema
El roadmap actual tiene 3 items en "Módulos Pendientes" (RRHH, Messenger, Finanzas) marcados como `todo`, pero estos módulos ya están construidos con múltiples submódulos. Además, faltan módulos y features nuevos que se han desarrollado.

### Cambios via SQL Migration

Se ejecutará una migración SQL que:

#### 1. Actualizar categoría "Módulos Pendientes" → dividirla en categorías específicas

**Nueva categoría: Recursos Humanos** (posición 9) — todos `done`:
| Submódulo | Task |
|---|---|
| Lifecycle | Empleados CRUD + Perfil completo |
| Lifecycle | Candidatos (Applicants) |
| Lifecycle | Onboarding / Offboarding |
| Control Laboral | Asistencia (Attendance) |
| Control Laboral | Ausencias |
| Control Laboral | Vacaciones y Días Personales |
| Control Laboral | Permisos horarios |
| Gestión Tiempo | Horarios y Schedules |
| Gestión Tiempo | Horas Extras |
| Gestión Tiempo | Banco de Horas |
| Desarrollo | Monitoreo de actividad |
| Desarrollo | Capacitación (Training por roles) |
| Desarrollo | Desempeño (Performance wizard) |
| Disciplina | Incidentes |
| Organización | Directorio y Organigrama |
| Organización | Deducciones y Adelantos |
| Comunicación | Anuncios de RRHH |

**Nueva categoría: Comunicación** (posición 10) — todos `done`:
| Submódulo | Task |
|---|---|
| Messenger | Chat en tiempo real con conversaciones |
| Messenger | Videollamadas (LiveKit) |
| Messenger | Contador de no leídos en sidebar |
| Notificaciones | Sistema de notificaciones con deep linking |
| Notificaciones | Notificaciones de chat automáticas (trigger SQL) |

**Nueva categoría: Finanzas** (posición 11) — todos `done`:
| Submódulo | Task |
|---|---|
| Dashboard | Dashboard financiero |
| Nómina | Gestión de nómina |
| Comisiones | Sistema de comisiones |
| Facturación | Facturación |
| Control | Control financiero |
| Reportes | Reportes financieros |
| Horas | Horas y horas variables |
| Collections | Colecciones/cobros |
| Configuración | Configuración financiera |

#### 2. Eliminar items viejos de "Módulos Pendientes" y la categoría vacía

#### 3. Agregar items faltantes a categorías existentes

**En "Core Platform & Auth"** — `done`:
- Notificaciones: Sistema de notificaciones con deep linking

**En "Operaciones"** — `done`:
- LeadGen: Base de datos de leads

### Archivos
| Archivo | Cambio |
|---|---|
| `supabase/migrations/xxx.sql` | INSERT nuevas categorías + items, DELETE items viejos de Módulos Pendientes, DELETE categoría vacía |

### Resultado
El roadmap reflejará con precisión todos los ~50+ features construidos, organizados en ~11 categorías, con el porcentaje de progreso actualizado automáticamente.

