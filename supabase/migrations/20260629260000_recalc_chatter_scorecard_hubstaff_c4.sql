-- Auto-llena c4_productividad_hubstaff en los scorecards del periodo, desde la actividad de Hubstaff.
-- Rubric aprobado por el dueño: actividad% → nota 0-5 (>=75→5, 65→4, 55→3, 45→2, 35→1, <35→0).
-- Solo TOCA c4 (los otros 7 criterios siguen manuales). `total` es columna GENERATED → recalcula sola.
-- Match por blu_employee_id + period (la fila ya existe con su compañía; no creamos filas).
-- c1 (puntualidad) NO se toca acá — va en su propio slice (deducción de turno de Hubstaff).
-- Lo llama el micro hubstaff-bridge (service_role) al final de cada sync; también es callable por management.
create or replace function public.recalc_chatter_scorecard_hubstaff(p_period date)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  if not (coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role','') = 'service_role'
          or public.blu_is_management(auth.uid())) then
    raise exception 'forbidden: solo service_role/management' using errcode = '42501';
  end if;
  with src as (
    select blu_employee_id, avg_activity_pct
    from public.v_chatter_hubstaff_monthly
    where period = p_period and blu_employee_id is not null
  )
  update public.chatter_scorecards sc
  set c4_productividad_hubstaff = case
        when s.avg_activity_pct >= 75 then 5
        when s.avg_activity_pct >= 65 then 4
        when s.avg_activity_pct >= 55 then 3
        when s.avg_activity_pct >= 45 then 2
        when s.avg_activity_pct >= 35 then 1
        else 0 end
  from src s
  where sc.blu_employee_id = s.blu_employee_id and sc.period = p_period;
  get diagnostics n = row_count;
  return jsonb_build_object('period', p_period, 'rows_updated', n);
end $$;
revoke all on function public.recalc_chatter_scorecard_hubstaff(date) from public, anon;
grant execute on function public.recalc_chatter_scorecard_hubstaff(date) to authenticated, service_role;
