-- La sección 📵 "Sin contacto + sin promo" del digest de Managers acusaba de "no
-- promociona" usando días de CALENDARIO como denominador (mtd_day) y contando solo
-- promoted in ('true','yes'). Mensaje real del 29/07: CarolinaRomo "9/29" y
-- JulietaRodriguezok "9/29" cuando en días LEÍDOS eran 9/26 y 9/22 (=41%, POR ENCIMA
-- del umbral de 40% → no debía figurar), y Yoisnia "2/30" cuando promocionó los 2
-- únicos días que se pudieron leer. Se alinea con get_manager_growth_feed (#956):
-- denominador = días LEÍDOS, se incluye 'partial', y no se opina con <5 días leídos.
-- Al aplicarlo la lista pasó de 6 a 4 creadoras, todas realmente por debajo del 40%.
CREATE OR REPLACE FUNCTION public.get_manager_silent_no_promo(p_tenant uuid, p_days integer DEFAULT 3, p_low_promo_rate numeric DEFAULT 0.40)
 RETURNS TABLE(creator_id uuid, name text, instagram_handle text, manager_profile_id uuid, manager_name text, manager_phone text, promo_days integer, mtd_day integer, days_since_contact integer, last_contact_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with bounds as (select date_trunc('month', (now() at time zone 'America/Bogota')::date)::date as this_start, extract(day from (now() at time zone 'America/Bogota')::date)::int as mtd_day),
  mgr_lines as (select id from public.wa_channels where tenant_id = p_tenant and department = 'manager' and active),
  contact_out as (
    select right(public.canonical_phone(ct.phone_e164),10) as k10,
           right(regexp_replace(coalesce(ct.phone_e164,''),'\D','','g'),8) as k8,
           max(msg.sent_at) as last_out
    from public.wa_conversations conv
    join public.wa_contacts ct on ct.id = conv.contact_id
    join public.wa_conversation_messages msg on msg.conversation_id = conv.id and msg.deleted_at is null and msg.direction = 'out'
    where conv.channel_id in (select id from mgr_lines)
    group by 1, 2
  ),
  by_canon as (select k10, max(last_out) as last_out from contact_out where length(k10) = 10 group by k10),
  by_k8 as (select k8, count(distinct k10) as n_canon, max(last_out) as last_out from contact_out where length(k8) = 8 group by k8),
  active_models as (
    select c.id, coalesce(nullif(c.artistic_name,''), c.name) as name, c.instagram_handle,
           c.assigned_manager_profile_id as mgr,
           right(public.canonical_phone(coalesce(c.phone_e164, c.whatsapp_number, c.phone)),10) as k10,
           right(regexp_replace(coalesce(c.phone_e164, c.whatsapp_number, c.phone, ''),'\D','','g'),8) as k8
    from public.creators c where c.status = 'active' and c.assigned_manager_profile_id is not null
  ),
  promo as (
    -- promo_days incluye 'partial' (antes quedaba afuera y subcontaba la promo real).
    -- covered_days = días efectivamente LEÍDOS (excluye 'pending' = scan fallido), que
    -- es el denominador honesto: un día que no se pudo leer no prueba que no promocionó.
    select e.creator_id,
           count(distinct e.date::date) filter (where e.promoted in ('true','yes','partial')) as promo_days,
           count(distinct e.date::date) filter (where e.promoted in ('true','yes','partial','false')) as covered_days
    from public.promolog_entries e cross join bounds b
    where e.tenant_id = p_tenant and e.date >= b.this_start::timestamptz group by e.creator_id
  ),
  resolved as (
    select a.id, a.name, a.instagram_handle, a.mgr,
      coalesce(
        (select bc.last_out from by_canon bc where length(a.k10) = 10 and bc.k10 = a.k10),
        (select bk.last_out from by_k8 bk where length(a.k8) = 8 and bk.k8 = a.k8 and bk.n_canon = 1)
      ) as last_out
    from active_models a where length(a.k10) = 10
  )
  select r.id, r.name, r.instagram_handle, r.mgr, m.full_name, m.phone_e164,
         coalesce(p.promo_days, 0)::int as promo_days,
         -- se devuelve en la columna mtd_day para no tocar el TS que la imprime: ahora
         -- el "x/y" del mensaje muestra días LEÍDOS, que es contra lo que se compara.
         coalesce(p.covered_days, 0)::int as mtd_day,
         extract(day from (now() - r.last_out))::int as days_since_contact, r.last_out as last_contact_at
  from resolved r
  left join public.profiles m on m.id = r.mgr
  left join promo p on p.creator_id = r.id
  where r.last_out is not null and r.last_out < now() - make_interval(days => p_days)
    and coalesce(p.covered_days, 0) >= 5
    and coalesce(p.promo_days, 0) < p_low_promo_rate * coalesce(p.covered_days, 0)
  order by r.last_out asc;
$function$;
