-- Vigilancia de Argos a nivel de TODA la app (independiente de LiveKit): Argos
-- prende la cámara y monitorea mientras la persona está logueada en Maven, no
-- solo dentro de una sala de Cowork. Interruptor APAGADO por defecto para un
-- arranque controlado: el admin lo enciende desde el panel cuando esté listo
-- (no se prende solo en todo el equipo al desplegar). Alvaro, 31/10/2026.
alter table public.monitor_config
  add column if not exists vigilancia_app boolean not null default false;

comment on column public.monitor_config.vigilancia_app is
  'Argos vigila en toda la app (cámara propia, sin depender de LiveKit) mientras la persona esté logueada. Off por defecto.';
