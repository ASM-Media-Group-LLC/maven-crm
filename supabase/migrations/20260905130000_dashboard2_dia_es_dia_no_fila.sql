-- Un día es un DÍA, no una fila.
--
-- `creator_daily_earnings` tiene una fila por CUENTA de OnlyFans y por día, y
-- tener dos cuentas es lo normal en la industria: Danikmichelltv =
-- danikmichellof + danikmichelltv, Milionlyvip = immili + milionlyvip,
-- JulietaRodriguezok, Anadevinvip... El resumen contaba `count(*)`, así que
-- para ellas:
--   · "Días activos" mostraba el doble (8 días en un rango de 4);
--   · "$/día" salía a la MITAD (total / filas en vez de total / días);
--   · y la PROYECCIÓN DEL MES, que es promedio diario × días del mes, salía
--     también a la mitad: Danikmichelltv proyectaba $14.300 cuando son $28.601
--     y Milionlyvip $13.036 cuando son $26.071.
-- Son $69.961 de bruto (17% del total del último mes) mal repartidos en el
-- tiempo. Lo detectó Jhon en el detalle del tablero del manager: "8 días con
-- dato" en un rango de 7 días no puede ser.
--
-- La forma correcta es agregar primero POR DÍA (sumando sus cuentas) y después
-- por creadora. De paso `max_active_fans` deja de ser el máximo de UNA cuenta
-- y pasa a ser el máximo de la suma del día, que es su audiencia real.
--
-- OJO, lo que esto NO arregla: hay cuentas cargadas dos veces con distinta
-- capitalización (alissblondvip + Alissblondvip, con los MISMOS montos en los
-- mismos días). Eso es plata duplicada en el origen, no un problema de
-- agregación, y se limpia aparte.
create or replace function public.get_dashboard2_creator_summary(p_from date, p_to date)
returns table(group_key text, creator_id uuid, blu_creator_name text, artistic_name text,
              total numeric, subs numeric, new_sub numeric, recurring_sub numeric,
              tips numeric, messages numeric, max_active_fans numeric, new_fans numeric,
              days_with_data integer, last_date date, af_sum numeric, af_days integer)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not coalesce(public.blu_is_management(auth.uid()), false) then
    raise exception 'forbidden: management only' using errcode = '42501';
  end if;
  return query
  with por_dia as (
    select coalesce(e.creator_id::text, e.blu_creator_name, e.id::text) as gk,
           e.date as d,
           min(e.creator_id::text) as cid,
           max(e.blu_creator_name) as bname,
           coalesce(sum(e.total_gross), 0) as total,
           coalesce(sum(e.subscription_gross), 0) as subs,
           coalesce(sum(e.new_sub_gross), 0) as new_sub,
           coalesce(sum(e.recurring_sub_gross), 0) as recurring_sub,
           coalesce(sum(e.tips_gross), 0) as tips,
           coalesce(sum(e.message_gross), 0) as messages,
           coalesce(sum(e.active_fans), 0) as active_fans,
           coalesce(sum(e.new_fans), 0) as new_fans
    from public.creator_daily_earnings e
    where e.date >= p_from and e.date <= p_to
    group by 1, 2
  )
  select p.gk,
         min(p.cid)::uuid,
         max(p.bname),
         max(c.artistic_name),
         sum(p.total)::numeric,
         sum(p.subs)::numeric,
         sum(p.new_sub)::numeric,
         sum(p.recurring_sub)::numeric,
         sum(p.tips)::numeric,
         sum(p.messages)::numeric,
         coalesce(max(p.active_fans), 0)::numeric,
         sum(p.new_fans)::numeric,
         count(*)::integer,
         max(p.d),
         coalesce(sum(p.active_fans) filter (where p.active_fans > 0), 0)::numeric,
         (count(*) filter (where p.active_fans > 0))::integer
  from por_dia p
  left join public.creators c on c.id = p.cid::uuid
  group by p.gk;
end;
$function$;
