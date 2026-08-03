-- Régimen de cortes cada 2h (pedido de Álvaro, 03/08): RPC del bloque Hubstaff
-- para la copia al DM + cron que dispara whatsapp-corte-tick.
-- (Aplicada en prod vía MCP el 03/08; este archivo la versiona.)
--
-- El bloque Hubstaff va SOLO al DM de Álvaro (pedido de Jhon: los grupos son
-- públicos, la productividad es dato del jefe). Una línea por grupo con horas +
-- % de actividad ponderado de HOY de los miembros linkeados; al final, quiénes
-- no ficharon. Si el feed viene atrasado >30 min, lo dice (lección del pulso).
create or replace function public.corte_hubstaff_bloque()
returns text
language sql
stable
security definer
set search_path to 'public'
as $fn$
  with grupos as (
    select * from (values
      ('a12d9f41-c962-4d98-b0bb-6b2d2573534c'::uuid, 'AI WARMING'),
      ('73a4414e-2546-4ca7-9289-7cbec70b0273'::uuid, 'MANAGERS'),
      ('d12ec56f-b324-4369-b72d-7540fb930ef6'::uuid, 'VENTAS')
    ) as g(id, nombre)
  ),
  v_start as (
    select ((now() at time zone 'America/Bogota')::date::timestamp at time zone 'America/Bogota') as t
  ),
  miembros as (
    select distinct g.nombre as grupo, p.id as pid,
           split_part(coalesce(nullif(p.full_name,''), m.display_name),' ',1) as nombre
    from grupos g
    join whatsapp_members m on m.group_id = g.id
    join profiles p on p.id = m.user_id
    where p.full_name not ilike '%lopez%' and p.full_name not ilike '%Alvaro%'
  ),
  horas as (
    select mi.grupo, mi.nombre,
           coalesce(sum(a.tracked_seconds),0)::bigint as secs,
           round(sum(a.overall_activity * a.tracked_seconds) filter (where a.overall_activity is not null)
                 / nullif(sum(a.tracked_seconds) filter (where a.overall_activity is not null), 0))::int as act
    from miembros mi
    left join hubstaff_members hm on hm.profile_id = mi.pid
    left join hubstaff_activities a on a.member_id = hm.id and a.starts_at >= (select t from v_start)
    group by 1, 2
  ),
  lineas as (
    select grupo,
      string_agg(
        nombre || ' ' || (secs/3600)::int || 'h' || lpad(((secs%3600)/60)::int::text,2,'0')
        || coalesce(' (' || act || '%)', ''),
        ' · ' order by secs desc)
        filter (where secs > 0) as con_horas,
      string_agg(nombre, ', ' order by nombre) filter (where secs = 0) as sin_fichar
    from horas group by grupo
  )
  select string_agg(
      '· *' || grupo || '*: ' || coalesce(con_horas, 'nadie fichando')
      || case when sin_fichar is not null then E'\n   sin Hubstaff hoy: ' || sin_fichar else '' end,
      E'\n' order by grupo)
    || case when (select max(starts_at) from hubstaff_activities) < now() - interval '30 minutes'
         then E'\n⚠️ feed de Hubstaff atrasado — las horas pueden no estar al día'
         else '' end
  from lineas;
$fn$;

-- Cron: cortes 9·11·13·15·17 Bogotá (14,16,18,20,22 UTC) + cierre 19 (00 UTC).
-- El gate fino (domingo, hora válida) vive EN el edge — mismo criterio que el
-- pulso: 19:00 Bogotá cae en el día UTC siguiente y el DOW de cron mentiría.
select cron.schedule(
  'whatsapp-corte-tick',
  '0 14,16,18,20,22,0 * * *',
  $$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/whatsapp-corte-tick',
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='supabase_anon_key'),
      'X-Cron-Token',(select decrypted_secret from vault.decrypted_secrets where name='cron_internal_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 145000);
  $$
);
