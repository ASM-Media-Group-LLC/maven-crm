-- Tops del Dashboard Ventas: chatters, closers y managers en un solo viaje.
--
-- Por qué RPC y no tres queries del front:
--   · `chatter_daily_sales` es management-only por RLS (un supervisor con el
--     dashboard no la puede leer directo).
--   · lo de managers agrega `promolog_entries`, que tiene ~1 fila por historia
--     y por día: bajarlo al navegador para contar es tirar miles de filas por
--     la red para mostrar dos números.
--
-- Cada rol se mide por SU objetivo, que es la regla que ya rige la nota de los
-- cortes (ver corte_objetivos): el chatter y el closer por lo que venden, la
-- manager por que su roster promocione.
create or replace function public.ventas_tops(_from date, _to date, _limite int default 5)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_chatters jsonb;
  v_closers  jsonb;
  v_managers jsonb;
begin
  -- Mismo permiso que abre el Dashboard Ventas. SECURITY DEFINER sin guarda
  -- dejaría estos rankings al alcance de cualquier usuario autenticado.
  if not (
    public.has_permission(auth.uid(), 'Creator Sales', null)
    or public.is_in_role_group(auth.uid(), 'manager_or_above')
  ) then
    raise exception 'sin permiso para ver los tops de ventas';
  end if;

  -- ── Chatters: ventas de BLU en el rango ──────────────────────────────────
  select coalesce(jsonb_agg(t order by t.ventas desc), '[]'::jsonb) into v_chatters
  from (
    select s.name                                 as nombre,
           round(sum(s.total_sales)::numeric, 2)  as ventas,
           sum(s.sold_messages)                   as mensajes,
           sum(s.fans_chatted)                    as fans,
           count(distinct s.date)                 as dias
    from public.chatter_daily_sales s
    where s.date between _from and _to
      and s.name is not null
    group by s.name
    having sum(s.total_sales) > 0
    order by sum(s.total_sales) desc
    limit _limite
  ) t;

  -- ── Closers: oportunidades GANADAS en el rango (won_at) ──────────────────
  -- El valor es mensual recurrente: es lo que la plataforma vendida deja por
  -- mes, no un pago único.
  select coalesce(jsonb_agg(t order by t.usd_mensual desc), '[]'::jsonb) into v_closers
  from (
    select p.full_name                             as nombre,
           count(*)                                 as ganadas,
           round(coalesce(sum(mo.monthly_value_usd), 0)::numeric, 0) as usd_mensual,
           (select round(avg(n.nota_sugerida), 1)
              from public.corte_notas n
             where n.profile_id = mo.assigned_to
               and n.fecha between _from and _to)   as nota_corte
    from public.monetization_opportunities mo
    -- JOIN y no LEFT JOIN: un ranking de personas no lleva el balde
    -- "Sin dueño" (hay 6 ganadas sin assigned_to, $79 — no son de nadie).
    join public.profiles p on p.id = mo.assigned_to
    where mo.stage = 'won'
      and mo.won_at is not null
      and mo.won_at::date between _from and _to
    group by mo.assigned_to, p.full_name
    order by sum(coalesce(mo.monthly_value_usd, 0)) desc
    limit _limite
  ) t;

  -- ── Managers: que su roster PROMOCIONE ───────────────────────────────────
  -- `dia` es la columna de día ya normalizada de promolog (el `date` crudo
  -- viene en UTC y corre los cortes). "Promovió" es el resultado binario del
  -- clasificador, guardado como texto.
  select coalesce(jsonb_agg(t order by t.pct_dias desc), '[]'::jsonb) into v_managers
  from (
    with roster as (
      select c.id as creator_id, c.assigned_manager_id as manager_id, p.full_name as nombre
      from public.creators c
      join public.profiles p on p.id = c.assigned_manager_id
      where c.status = 'active'
    ), dias as (
      select e.creator_id, e.dia,
             max(case when lower(e.promoted) in ('si','sí','yes','true') then 1 else 0 end) as promovio
      from public.promolog_entries e
      where e.dia between _from and _to
      group by e.creator_id, e.dia
    )
    select r.nombre,
           count(distinct r.creator_id)                                    as creadoras,
           count(distinct d.creator_id) filter (where d.promovio = 1)      as promocionaron,
           count(*) filter (where d.promovio = 1)                          as dias_con_promo,
           count(d.dia)                                                    as dias_medidos,
           round(100.0 * count(*) filter (where d.promovio = 1)
                 / greatest(count(d.dia), 1), 1)                           as pct_dias,
           (select round(avg(n.nota_sugerida), 1)
              from public.corte_notas n
             where n.profile_id = r.manager_id
               and n.fecha between _from and _to)                          as nota_corte
    from roster r
    left join dias d on d.creator_id = r.creator_id
    group by r.manager_id, r.nombre
    order by pct_dias desc
    limit _limite
  ) t;

  return jsonb_build_object('chatters', v_chatters, 'closers', v_closers, 'managers', v_managers);
end;
$function$;

revoke all on function public.ventas_tops(date, date, int) from public;
grant execute on function public.ventas_tops(date, date, int) to authenticated;
