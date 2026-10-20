-- cowork_consumo_pausas_hoy: segundos consumidos HOY (día de Bogotá) por TIPO de
-- pausa (baño/break/…) para cada usuario. Lo usa la pantalla de pausa propia
-- (MiPausa) para el resumen "Hoy en pausas". Es como cowork_bano_consumido_hoy
-- pero devuelve TODOS los tipos en una sola consulta, no solo baño, para que la
-- persona vea cuánto lleva hoy de cada pausa sin pedir una RPC por tipo.
CREATE OR REPLACE FUNCTION public.cowork_consumo_pausas_hoy(_user_ids uuid[])
 RETURNS TABLE(user_id uuid, kind text, segundos integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select b.user_id, b.kind,
         greatest(0, sum(
           coalesce(b.duration_seconds, extract(epoch from (b.ended_at - b.started_at)))
         ))::integer as segundos
  from public.cowork_breaks b
  where b.user_id = any(_user_ids)
    -- Con sesión, solo gente de la propia agencia (igual que cowork_bano_consumido_hoy).
    and (auth.uid() is null or b.user_id in (select public.gente_de_mi_agencia()))
    and b.ended_at is not null
    and (b.started_at at time zone 'America/Bogota')::date
        = (now() at time zone 'America/Bogota')::date
  group by b.user_id, b.kind;
$function$;

GRANT EXECUTE ON FUNCTION public.cowork_consumo_pausas_hoy(uuid[]) TO authenticated;
