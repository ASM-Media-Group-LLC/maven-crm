-- Fix de raíz del guard del Promobot IG (promolog-dispatch).
-- Bug: una re-escaneada de 1 creadora a última hora (ej. mackiie 06-23 19:07 Bogota =
-- 00:07 UTC 06-24) hacía que el guard creyera que YA se había despachado "hoy" y
-- saltaba la corrida completa de las 08:00 → 0 entries de IG → managers cargando a mano.
-- Dos defectos corregidos:
--   1) started_at::date se casteaba en UTC y se comparaba contra la fecha NY → desfase
--      de TZ en la ventana 00:00–04:00 UTC. Ahora ambos lados en America/New_York.
--   2) contaba CUALQUIER run, incluidas re-escaneadas de 1 creadora. Ahora solo cuenta
--      un dispatch COMPLETO (creators_count > 1; los chunks del scan diario son ~11-12,
--      las re-escaneadas son 1).
create or replace function public.promolog_dispatched_today(p_tenant_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.promolog_dispatch_runs
    where tenant_id = p_tenant_id
      and status in ('running','succeeded','partial')
      and coalesce(creators_count, 0) > 1
      and (started_at at time zone 'America/New_York')::date
          = (now() at time zone 'America/New_York')::date
  );
$function$;
