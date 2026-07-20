-- set_creator_kash_type_by_blu v2 — usa la MISMA resolución que el import de ingresos.
--
-- Hueco (auditoría 2026-07-18): la v1 solo marcaba kash_type a las creadoras mapeadas
-- A MANO en blu_creator_map (~20 nombres). Las que matchean por la heurística automática
-- (blu_match_creator, la mayoría) NUNCA recibían su Plus/Massive de BLU → 13 activas con
-- data de BLU quedaban sin marca (o con la marca manual vieja del onboarding, fuente de
-- mismatches). Regla del negocio: las cuentas BLU (tokens separados) son la VERDAD de
-- qué creadora es Plus (→Carolina) y cuál Massive (→Fabiana).
--
-- v2: resolución = blu_creator_map (respetando 'ignored') O blu_match_creator() —
-- idéntico al ingest de creator_daily_earnings. El blu-bridge la llama tras cada import
-- por cuenta, así que en el próximo run las 13 quedan marcadas solas y cualquier
-- creadora nueva en BLU se etiqueta automáticamente.
create or replace function public.set_creator_kash_type_by_blu(p_blu_names text[], p_kash_type text)
returns int language plpgsql security definer set search_path=public as $$
declare v_n int;
begin
  if not (public.blu_is_management(auth.uid())
          or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role','') = 'service_role') then
    raise exception 'forbidden: solo management o el micro (service_role)' using errcode='42501';
  end if;
  if p_kash_type not in ('Massive','Plus') then
    raise exception 'kash_type inválido: %', p_kash_type;
  end if;
  if p_blu_names is null or array_length(p_blu_names,1) is null then return 0; end if;

  with ids as (
    select distinct
      case when bm.status = 'ignored' then null
           else coalesce(bm.creator_id, public.blu_match_creator(x.n)) end as creator_id
    from unnest(p_blu_names) as x(n)
    left join public.blu_creator_map bm on lower(bm.blu_name) = lower(x.n)
  ),
  upd as (
    insert into public.creator_business (creator_id, kash_type)
    select creator_id, p_kash_type from ids where creator_id is not null
    on conflict (creator_id) do update set kash_type = excluded.kash_type
    returning 1
  )
  select count(*) into v_n from upd;
  return v_n;
end; $$;

revoke all on function public.set_creator_kash_type_by_blu(text[],text) from public, anon;
grant execute on function public.set_creator_kash_type_by_blu(text[],text) to service_role, authenticated;

notify pgrst, 'reload schema';
