-- Argos / captura de pantallazos (Hubstaff): columnas para el flujo
-- buzón (Supabase) → NAS. `path` sigue siendo la ruta en el buzón de Supabase
-- hasta que un proceso la mueve al NAS; al mover se setea `nas_path` + `en_nas`
-- y se borra el objeto del buzón. Así, si el NAS está caído, la captura espera
-- en el buzón y sube cuando vuelve (no se pierde nada). Retención 30 días la
-- maneja la limpieza del NAS + el borrado de la fila.
alter table public.monitor_capturas
  add column if not exists en_nas boolean not null default false,
  add column if not exists nas_path text;

-- El proceso que mueve al NAS busca lo que todavía está en el buzón; la IA busca
-- lo que falta juzgar. Índices parciales para que ambas colas sean baratas.
create index if not exists monitor_capturas_pendiente_nas_idx
  on public.monitor_capturas (created_at)
  where en_nas = false;
create index if not exists monitor_capturas_sin_analizar_idx
  on public.monitor_capturas (created_at)
  where analizado = false;

-- Limpieza: la tabla de diagnóstico temporal del monitor (Alvaro, 31/10) ya
-- cumplió — el mapeo confirmó que el hueco es la dependencia de llamada LiveKit
-- viva + vigilancia_app=false, no un problema de permisos. Se elimina.
drop table if exists public.monitor_debug;
