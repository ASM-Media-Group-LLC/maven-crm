-- Sugerencias de destinatarios para el compositor de Correo (chips estilo Gmail).
-- Devuelve companeros con correo corporativo + las listas por rol ya provisionadas
-- (chatters@, equipo@...). El historial de "a quien le escribi" NO va aca: sale de
-- mail_messages, que el usuario ya lee por RLS.
--
-- ACCESO: solo para quien TIENE casilla activa (mail_credentials). Es el
-- directorio interno de correos de trabajo -- quien no usa Correo no lo necesita,
-- y asi no se expone a cualquier cuenta autenticada.
create or replace function public.mail_recipient_directory()
returns table (email text, nombre text, tipo text)
language sql
stable
security definer
set search_path = public
as $$
  with permitido as (
    select 1 from public.mail_credentials
    where user_id = auth.uid() and revoked_at is null
    limit 1
  )
  select lower(u.email)::text,
         coalesce(nullif(btrim(p.full_name), ''), split_part(u.email, '@', 1))::text,
         'persona'::text
  from auth.users u
  join public.profiles p on p.id = u.id
  where exists (select 1 from permitido)
    and u.deleted_at is null
    and u.email is not null
    and (lower(u.email) like '%@maven-ai.me' or lower(u.email) like '%@unlok.me')
    and u.id <> auth.uid()
  union all
  select lower(g.group_email)::text, g.group_name::text, 'grupo'::text
  from public.email_role_groups g
  where exists (select 1 from permitido)
    and g.enabled
    and g.zgid is not null
$$;

revoke all on function public.mail_recipient_directory() from anon, public;
grant execute on function public.mail_recipient_directory() to authenticated;
