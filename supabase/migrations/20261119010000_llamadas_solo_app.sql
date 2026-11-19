-- LLAMADAS INTERNAS SOLO EN LA APP (Alvaro, 18/11/2026).
--
-- Igual que Cowork (cowork_solo_app_desde): desde esta fecha, en el navegador de
-- un computador, las llamadas del Messenger (1 a 1 y de grupo) y los Meet
-- internos (/call/:sala con sesión) mandan a la app de Maven. Celular: nada
-- cambia. Los invitados de afuera (/entrar, /unirse) nunca se bloquean.
-- Los probadores de Cowork (cowork_solo_app_probadores) también la ven antes.
-- null = nunca. Se puede mover sin subir código.
do $$
begin
  if to_regclass('public.monitor_config') is null then
    raise notice 'monitor_config no existe: se salta llamadas_solo_app_desde';
    return;
  end if;

  alter table public.monitor_config
    add column if not exists llamadas_solo_app_desde timestamptz;

  comment on column public.monitor_config.llamadas_solo_app_desde is
    'Desde cuándo las llamadas internas (Messenger y Meet con sesión) en el navegador de un computador mandan a la app de Maven. null = nunca. Los invitados de afuera nunca se bloquean.';

  -- Decisión del 18/11/2026: obligatoria ya.
  update public.monitor_config
     set llamadas_solo_app_desde = now()
   where id = 1 and llamadas_solo_app_desde is null;
end $$;
