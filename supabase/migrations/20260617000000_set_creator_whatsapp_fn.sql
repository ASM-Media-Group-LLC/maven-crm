-- Carga write-only del WhatsApp de una creadora.
-- Permite a cualquier miembro del equipo (con algún rol en user_roles) SETear
-- creators.whatsapp_number SIN otorgarle UPDATE general sobre creators (que sigue
-- siendo manager/admin por RLS), y SIN devolver el número (write-only).
-- Aplicada inicialmente vía MCP (create_set_creator_whatsapp_fn) el 2026-06-17.
create or replace function public.set_creator_whatsapp(p_creator_id uuid, p_whatsapp text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not exists (select 1 from public.user_roles where user_id = auth.uid()) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  update public.creators
     set whatsapp_number = nullif(btrim(p_whatsapp), '')
   where id = p_creator_id;
end;
$$;

revoke all on function public.set_creator_whatsapp(uuid, text) from public;
grant execute on function public.set_creator_whatsapp(uuid, text) to authenticated;
