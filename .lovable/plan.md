

## Investigación: ¿Por qué aparecen registros sin agente?

### Hallazgo

Los registros de hoy y ayer **vienen de un sistema externo de sincronización automática**. El trigger `notify_promolog_webhook` en la base de datos llama a una edge function externa (`sync-promolog-external`) que inserta registros sin establecer `created_by` ni `reviewed_by`.

**Datos de los últimos 2 días:**
- 130 registros **con** `created_by` (subidos manualmente por agentes)
- 781 registros **sin** `created_by` ni `reviewed_by` (importación automática externa)

Los 6 registros más recientes (de las 17:00 hoy) sí tienen agente (`dd959846...`), porque fueron subidos manualmente. Todo lo demás (09:40, 10:00, etc.) fue importado automáticamente.

### Plan: Identificar origen externo + facilitar asignación

**1. Agregar columna visual "Origen" en la tabla**
- Si `created_by` existe → mostrar nombre del agente en columna "Agente"
- Si `created_by` es NULL → mostrar badge "Sync externo" en gris/itálica en lugar de "Sin asignar"
- Esto aclara que nadie "olvidó" poner su nombre — el sistema externo simplemente no lo incluye

**2. Permitir asignación rápida desde la tabla**
- En registros con "Sync externo", mostrar un botón `UserPlus` clicable que abra el modal de asignación de agente
- Ya existe la funcionalidad `onAssignAgent` — solo se expone más directamente

**3. (Opcional) Marcar origen en la base de datos**
- Agregar columna `source` a `promolog_entries` con default `'manual'`
- El sistema externo setearía `'external_sync'`
- Esto permite filtrar por origen en la UI

### Archivos a modificar
- `src/pages/promolog/PromologContent.tsx` — lógica de mapeo del campo agent
- `src/pages/promolog/PromologTable.tsx` — badge "Sync externo" + botón de asignación rápida
- (Opcional) Migración SQL para agregar columna `source`

