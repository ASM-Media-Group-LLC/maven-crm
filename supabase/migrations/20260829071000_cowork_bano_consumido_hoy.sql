-- Cuánto baño lleva consumido HOY cada persona.
--
-- El baño deja de ser un límite POR PAUSA y pasa a ser un presupuesto DIARIO:
-- 10 minutos por día. Si alguien fue una vez y tardó 4, la próxima arranca en
-- 6; si se pasó, la próxima arranca en negativo donde quedó la anterior.
--
-- POR QUÉ ACÁ Y NO EN EL NAVEGADOR: el navegador de quien está siendo medido
-- no puede ser la fuente del dato. Además cada pestaña ve solo su sesión, y el
-- presupuesto es de la PERSONA en el día — cruza sesiones y cruza salas.
--
-- ⚠️ EL DÍA ES EL DE BOGOTÁ, no el UTC. Con UTC, todo lo que pase entre las
-- 19:00 y la medianoche de Colombia contaría contra el día siguiente y la
-- gente arrancaría su turno con el presupuesto de otro día. Es el mismo error
-- que ya nos mordió en promolog.
--
-- Solo cuenta pausas CERRADAS: la que está abierta la lleva el cliente en vivo
-- y sumarla acá la contaría dos veces.
create or replace function public.cowork_bano_consumido_hoy(_user_ids uuid[])
returns table(user_id uuid, segundos integer)
language sql
stable
security definer
set search_path to 'public'
as $$
  select b.user_id,
         greatest(0, sum(
           coalesce(b.duration_seconds, extract(epoch from (b.ended_at - b.started_at)))
         ))::integer as segundos
  from public.cowork_breaks b
  where b.kind = 'bano'
    and b.user_id = any(_user_ids)
    and b.ended_at is not null
    and (b.started_at at time zone 'America/Bogota')::date
        = (now() at time zone 'America/Bogota')::date
  group by b.user_id;
$$;

comment on function public.cowork_bano_consumido_hoy(uuid[]) is
  'Segundos de baño ya consumidos hoy (día de Bogotá) por cada usuario. Solo pausas cerradas: la abierta la cuenta el cliente en vivo.';

revoke all on function public.cowork_bano_consumido_hoy(uuid[]) from public, anon;
grant execute on function public.cowork_bano_consumido_hoy(uuid[]) to authenticated;
