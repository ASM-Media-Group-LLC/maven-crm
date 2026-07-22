-- Regla de negocio (Jhon, 2026-07-23): manager por agencia, SIN excepciones.
--   kash_type 'Massive' → Fabiana Durán   · 'Plus' → Carolina Jaramillo
--
-- kash_type lo auto-marca BLU (#839) en creator_business, pero el manager
-- (creators.assigned_manager_profile_id) era 100% manual → creadoras nuevas o
-- reingresos quedaban SIN manager, y el bot de managers no las reportaba nunca
-- (get_manager_growth_feed filtra assigned_manager_profile_id is not null).
-- Caso 2026-07-23: Moramay + 6 de Massive salían bajo Carolina; 4 de Plus bajo
-- Fabiana; 7 sin asignar (invisibles). Este trigger cierra el ciclo: al marcar
-- (o corregir) la agencia, el manager se alinea solo.
--
-- ⚠️ Si algún día cambian los managers responsables de cada agencia, actualizar
-- los UUID de acá (son profiles.id).
-- YA APLICADA en prod vía MCP (2026-07-23) — este archivo es el registro en repo.

create or replace function public.sync_manager_from_kash_type()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_mgr uuid;
begin
  v_mgr := case new.kash_type
    when 'Massive' then 'dd959846-929b-4b10-a8ba-42c821996e8a'::uuid -- Fabiana Durán
    when 'Plus'    then 'e3355f39-1d3c-4986-99d1-ee583df9b38c'::uuid -- Carolina Jaramillo
    else null
  end;
  if v_mgr is not null then
    update creators
       set assigned_manager_profile_id = v_mgr, updated_at = now()
     where id = new.creator_id
       and assigned_manager_profile_id is distinct from v_mgr;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_manager_from_kash on public.creator_business;
create trigger trg_sync_manager_from_kash
  after insert or update of kash_type on public.creator_business
  for each row execute function public.sync_manager_from_kash_type();
