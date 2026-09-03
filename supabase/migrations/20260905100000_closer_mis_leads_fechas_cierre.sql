-- El closer necesita saber cuánta plata trajo EN EL RANGO, no solo el total
-- histórico ("en closers no veo en ninguna parte que les muestre el dinero
-- traído a la mesa, lo más importante"). Para eso hace falta CUÁNDO se cerró
-- cada lead, así que el RPC devuelve también las dos fechas de cierre
-- (completada manda sobre confirmada).
create or replace function public.closer_mis_leads(_limite int default 400)
returns table(
  id uuid, instagram_handle text, stage text, category text, deal_type text,
  passed_date date, last_contact_date date, monthly_monetization numeric,
  confirmed_date date, completed_date date, contactos integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select cc.id, cc.instagram_handle, cc.stage, cc.category, cc.deal_type,
         cc.passed_date::date, cc.last_contact_date::date, cc.monthly_monetization,
         cc.confirmed_date::date, cc.completed_date::date,
         (select count(*)::integer from public.closer_contact_history h
           where h.creator_id = cc.id) as contactos
  from public.closer_creators cc
  where cc.assigned_to = auth.uid()
  order by cc.passed_date desc nulls last
  limit greatest(1, least(_limite, 1000));
$function$;

revoke all on function public.closer_mis_leads(int) from public;
grant execute on function public.closer_mis_leads(int) to authenticated;
