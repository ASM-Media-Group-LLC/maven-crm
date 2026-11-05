-- Prender/apagar el adendum de Drive desde /admin/usuarios (Alvaro, 05/11).
-- Solo dueño o admin. Como drive_acceso_extra tiene las escrituras revocadas por
-- PostgREST, esta RPC (SECURITY DEFINER) es la única puerta de escritura.

create or replace function public.drive_acceso_extra_set(p_user uuid, p_on boolean)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not (
    public.es_dueno(auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.nivel in ('dueno', 'admin'))
  ) then
    raise exception 'Solo el dueño o un admin puede cambiar el acceso al Drive';
  end if;

  if p_on then
    insert into public.drive_acceso_extra (user_id, nota)
      values (p_user, 'Adendum dado desde /admin/usuarios')
      on conflict (user_id) do nothing;
  else
    delete from public.drive_acceso_extra where user_id = p_user;
  end if;
  return true;
end;
$function$;

revoke all on function public.drive_acceso_extra_set(uuid, boolean) from public, anon;
grant execute on function public.drive_acceso_extra_set(uuid, boolean) to authenticated;