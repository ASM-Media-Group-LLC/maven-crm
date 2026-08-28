-- Reporte de baja actividad para Grace, SIN pasar por el modelo.
--
-- Por qué: el recordatorio que lo generaba costaba $30 de los $42/mes del DM de Grace
-- (43 disparos en agosto a ~$0,70 cada uno) y su propio texto decía "ya viene
-- CALCULADO... TRANSCRIBILO tal cual". O sea: se le pagaba a un LLM por FORMATEAR una
-- lista que ya venía armada.
--
-- Y no es solo plata. El 10/08 el modelo listó DOS personas de la banda y cerró con
-- "el resto está por encima del 25%", dejando afuera a Lizeth (10%), María (15%) y
-- Manuela (22%) — está documentado en el comentario de equipo.ts:952. Un reporte de
-- actividad del personal no puede alucinar. Esto no puede.

-- Exentos que NO son admin. Los 6 restantes de la "dirección" (Jhon, los dos Álvaro,
-- Juan, Grace, Luis) salen por rol, igual que en las notas del cierre; Michel es la
-- única excepción, por pedido explícito de Grace del 07/08 15:20.
create table if not exists public.hubstaff_reporte_exentos (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  motivo     text not null,
  created_at timestamptz not null default now()
);

comment on table public.hubstaff_reporte_exentos is
  'Personas fuera del reporte de baja actividad que NO son admin (los admin ya salen por rol).';

insert into public.hubstaff_reporte_exentos (profile_id, motivo) values
  ('3661183d-2c79-4a6b-86be-515f9ee441c2', 'Michel — pedido explícito de Grace 07/08 15:20')
on conflict (profile_id) do nothing;

revoke all on public.hubstaff_reporte_exentos from public, anon;
grant select on public.hubstaff_reporte_exentos to authenticated;
grant all    on public.hubstaff_reporte_exentos to service_role;

create or replace function public.reporte_baja_actividad_texto()
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  v_hoy       text := to_char(now() at time zone 'America/Bogota', 'DD/MM');
  v_feed_last timestamptz;
  v_feed_min  int;
  v_lineas    text;
  v_total     int;
begin
  select max(l.feed_last_ping) into v_feed_last from hubstaff_live_today(null) l;
  v_feed_min := case when v_feed_last is null then null
                     else floor(extract(epoch from (now() - v_feed_last)) / 60)::int end;

  -- Feed viejo: NO afirmar nada de nadie. Misma regla que ya tenía el prompt del bot
  -- ("PROHIBIDO afirmar 0h o no arrancó de NADIE").
  if v_feed_last is null or v_feed_min > 45 then
    return format(
      '⚠️ Reporte de baja actividad (%s) — NO disponible.%s'
      || 'El feed de Hubstaff no reporta desde %s (hace %s min), así que no puedo afirmar horas ni actividad de nadie. Esto es lo último que se sabe.',
      v_hoy, E'\n\n',
      coalesce(to_char(v_feed_last at time zone 'America/Bogota', 'HH24:MI'), 'desconocido'),
      coalesce(v_feed_min::text, '?'));
  end if;

  with banda as (
    select coalesce(l.full_name_maven, l.name) as nombre,
           l.activity_pct::int                 as pct,
           l.seconds_today                     as segs,
           to_char((l.first_ping at time zone 'America/Bogota'), 'HH24:MI') as arranco,
           to_char((l.last_ping  at time zone 'America/Bogota'), 'HH24:MI') as ultimo
    from hubstaff_live_today(null) l
    left join hubstaff_members hm on hm.hubstaff_user_id::text = l.hubstaff_user_id::text
    where l.seconds_today > 0
      and l.activity_pct is not null
      and l.activity_pct::int <= 25
      and not coalesce(public.has_role(hm.profile_id, 'admin'::app_role), false)
      and (hm.profile_id is null
           or hm.profile_id not in (select e.profile_id from public.hubstaff_reporte_exentos e))
  )
  select count(*)::int,
         string_agg(
           format('• %s — %sh%s, %s%% · %s → %s',
                  nombre,
                  (segs / 3600)::int,
                  lpad((((segs % 3600) / 60)::int)::text, 2, '0'),
                  pct, coalesce(arranco, '?'), coalesce(ultimo, '?')),
           E'\n' order by pct asc, segs desc)
  into v_total, v_lineas
  from banda;

  if coalesce(v_total, 0) = 0 then
    return format('✅ Baja actividad (%s): nadie por debajo del 25%% hoy.', v_hoy);
  end if;

  return format(
    '📊 Baja actividad de hoy (%s) — %s %s por debajo del 25%%%s%s%s%s',
    v_hoy, v_total,
    case when v_total = 1 then 'persona' else 'personas' end,
    E'\n\n', v_lineas, E'\n\n',
    'Criterio: fichó hoy y actividad del día ≤25%. Dirección excluida. Lista completa.');
end;
$fn$;

comment on function public.reporte_baja_actividad_texto() is
  'Arma el texto del reporte diario de baja actividad SIN LLM. Devuelve el mensaje listo para whatsapp-send.';

revoke all on function public.reporte_baja_actividad_texto() from public, anon;
grant execute on function public.reporte_baja_actividad_texto() to service_role;
