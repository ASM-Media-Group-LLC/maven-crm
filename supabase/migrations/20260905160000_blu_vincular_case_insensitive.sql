-- La pantalla "Vincular BLU" (Promolog → subtab, solo management) también
-- trabajaba con la grafía exacta: una cuenta escrita de dos formas se listaba
-- dos veces y vincular una dejaba la otra huérfana. Misma regla que el import.
-- De paso, "días" era count(*) (filas) y ahora es count(distinct date).
create or replace function public.blu_list_orphans()
returns table(blu_name text, total_gross numeric, days integer, first_date date, last_date date)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not (public.blu_is_management(auth.uid())
          or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role','') = 'service_role') then
    raise exception 'forbidden: solo management' using errcode = '42501';
  end if;
  return query
    select min(e.blu_creator_name),
           sum(e.total_gross)::numeric,
           count(distinct e.date)::int,
           min(e.date),
           max(e.date)
    from public.creator_daily_earnings e
    where e.creator_id is null
      and not exists (
        select 1 from public.blu_creator_map m
        where lower(trim(m.blu_name)) = lower(trim(e.blu_creator_name)) and m.status = 'ignored'
      )
    group by lower(trim(e.blu_creator_name))
    order by sum(e.total_gross) desc;
end;
$function$;

create or replace function public.blu_map_creator(p_blu_name text, p_creator_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_updated int;
begin
  if not (public.blu_is_management(auth.uid())
          or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role','') = 'service_role') then
    raise exception 'forbidden: solo management' using errcode = '42501';
  end if;
  if coalesce(p_blu_name,'') = '' or p_creator_id is null then
    raise exception 'blu_name y creator_id son requeridos';
  end if;

  insert into public.blu_creator_map (blu_name, creator_id, status, confirmed_by, confirmed_at)
    values (trim(p_blu_name), p_creator_id, 'confirmed', auth.uid(), now())
  on conflict (blu_name) do update set
    creator_id = excluded.creator_id, status = 'confirmed',
    confirmed_by = excluded.confirmed_by, confirmed_at = now();

  -- Vincula TODAS las grafías de la misma cuenta, no solo la que se clickeó.
  update public.creator_daily_earnings
    set creator_id = p_creator_id
    where lower(trim(blu_creator_name)) = lower(trim(p_blu_name))
      and creator_id is distinct from p_creator_id;
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$function$;

create or replace function public.blu_ignore_creator(p_blu_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not (public.blu_is_management(auth.uid())
          or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role','') = 'service_role') then
    raise exception 'forbidden: solo management' using errcode = '42501';
  end if;
  insert into public.blu_creator_map (blu_name, creator_id, status, confirmed_by, confirmed_at)
    values (trim(p_blu_name), null, 'ignored', auth.uid(), now())
  on conflict (blu_name) do update set
    status = 'ignored', creator_id = null, confirmed_by = excluded.confirmed_by, confirmed_at = now();
end;
$function$;

-- Vinculaciones hechas en el repaso del 03/09/2026:
--  · sassyandrea + "Sassyandrea FREE" → Sassyandreaa (activa): son sus cuentas
--    free, y tener varias cuentas es lo normal en la industria.
--  · test123, juanitoelpatan, u587720407, u587781843 → ignoradas: $0 y cero
--    fans en todo el histórico (pruebas y handles numéricos de OF).
insert into public.blu_creator_map (blu_name, creator_id, status, confirmed_at)
values
  ('sassyandrea',      '45379b63-5e01-43b0-a2b1-8835d788d3a1', 'mapped', now()),
  ('Sassyandrea FREE', '45379b63-5e01-43b0-a2b1-8835d788d3a1', 'mapped', now()),
  ('test123',        null, 'ignored', now()),
  ('juanitoelpatan', null, 'ignored', now()),
  ('u587720407',     null, 'ignored', now()),
  ('u587781843',     null, 'ignored', now())
on conflict (blu_name) do update set
  creator_id = excluded.creator_id, status = excluded.status, confirmed_at = now();
