-- Personalizados: alcance de lectura por rol (pedido de Jhon 02/09/2026).
--
-- Antes la lectura era para cualquier autenticado (patrón Parrilla). Ahora:
--   · empleado (tier member): SOLO lo suyo — pedidos que creó o donde es el chatter.
--   · supervisor o superior: TODO, pero solo si su rol tiene el módulo
--     Personalizados habilitado en Administración → Roles (has_permission a
--     nivel módulo). El tier solo no alcanza — misma lección que el scope de
--     las bandejas (#1480): hay roles supervisores con el módulo apagado.
--   · admin: todo (has_permission devuelve true).
-- Eventos y adjuntos heredan la visibilidad del pedido (subconsulta con RLS).
-- Gestionar/Aprobar también exigen el módulo habilitado, además del tier.

drop policy if exists cr_read on public.custom_requests;
create policy cr_read on public.custom_requests for select to authenticated
  using (
    created_by = auth.uid() or chatter_id = auth.uid()
    or (public.is_in_role_group(auth.uid(), 'supervisor_or_above')
        and public.has_permission(auth.uid(), 'Personalizados'))
  );

drop policy if exists cr_update on public.custom_requests;
create policy cr_update on public.custom_requests for update to authenticated
  using (created_by = auth.uid() or chatter_id = auth.uid()
         or (public.can_use_module_function(auth.uid(), 'Personalizados', 'Gestionar', 'supervisor_or_above')
             and public.has_permission(auth.uid(), 'Personalizados')))
  with check (created_by = auth.uid() or chatter_id = auth.uid()
         or (public.can_use_module_function(auth.uid(), 'Personalizados', 'Gestionar', 'supervisor_or_above')
             and public.has_permission(auth.uid(), 'Personalizados')));

drop policy if exists cr_delete on public.custom_requests;
create policy cr_delete on public.custom_requests for delete to authenticated
  using (public.can_use_module_function(auth.uid(), 'Personalizados', 'Gestionar', 'supervisor_or_above')
         and public.has_permission(auth.uid(), 'Personalizados'));

drop policy if exists cre_read on public.custom_request_events;
create policy cre_read on public.custom_request_events for select to authenticated
  using (exists (select 1 from public.custom_requests r where r.id = request_id));

drop policy if exists cra_read on public.custom_request_attachments;
create policy cra_read on public.custom_request_attachments for select to authenticated
  using (exists (select 1 from public.custom_requests r where r.id = request_id));

-- Aprobar/denegar: supervisor+ CON el módulo habilitado.
create or replace function public.custom_requests_before_write()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    return new;
  end if;
  if new.status is distinct from old.status then
    if new.status in ('aprobado','denegado')
       and not (public.can_use_module_function(auth.uid(), 'Personalizados', 'Aprobar', 'supervisor_or_above')
                and public.has_permission(auth.uid(), 'Personalizados')) then
      raise exception 'Solo un supervisor con el módulo Personalizados habilitado puede aprobar o denegar';
    end if;
    if new.status = 'aprobado' then
      new.approved_by := coalesce(auth.uid(), new.approved_by);
      new.approved_at := coalesce(new.approved_at, now());
    end if;
    if new.status = 'entregado' then
      new.delivered_at := coalesce(new.delivered_at, now());
    end if;
  end if;
  return new;
end;
$$;
