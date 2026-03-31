# Roadmap del Sistema

> Última actualización: 31 marzo 2026

## ✅ Completado hoy (31 marzo 2026)

### LeadGen / Promolog
- AgentDetailView: scroll interno, paginador y auto-hide de stats cards
- AgentDetailView: acciones funcionales (botón Eye navega al lead)
- QA funcional: popover de review con rating + comentario para supervisores/admins
- QA retroalimentación: filtro corregido (solo leads con QA review realizado)
- AgentHourlyPerformance: KPI cards y quality cards estandarizadas al design system
- Auto-hide stats: corregido en tabs leads-hora y rendimiento
- AgentDetailView: query propia para cargar TODOS los leads del agente
- Badges QA: estandarizados con variantes -soft del design system

### Creadores
- Closers: acceso granular por submódulo (solo Lista + Nuevo)
- Closers: filtro de ownership (solo ven creators que convirtieron)
- Closers: columna `created_by` en tabla creators
- Closers: botón "Agregar Creador" restaurado + KPI cards filtradas sin Onboarding

### Comunicación / Notificaciones
- Sonido de notificaciones corregido: integración en realtime listener con respeto a DND y sound_enabled

## 🔄 En Progreso

| Área | Tarea | Prioridad |
|------|-------|-----------|
| Creadores | Verificar `created_by` en conversión a creador | Alta |

## 📋 Backlog

| Área | Tarea | Prioridad |
|------|-------|-----------|
| Notificaciones | Digests (resúmenes) — Edge Function para envío | Media |
| Notificaciones | Email channel — validación de dominio | Media |
| Notificaciones | Google Calendar sync — credenciales OAuth | Baja |
| Messenger | Testing videollamadas LiveKit end-to-end | Media |
| LeadGen | Acciones bulk en tabla de leads | Baja |
| RRHH | Edge Function `notify-absence` — dominio email | Media |
| Admin | Auditoría — verificar que eventos críticos se loguean | Baja |
