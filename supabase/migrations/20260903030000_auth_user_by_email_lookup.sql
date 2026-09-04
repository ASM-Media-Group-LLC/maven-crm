-- Quien es el dueno de una direccion de login. Sirve para que migrate_email
-- avise "esa direccion ya la usa otra cuenta" en vez del "Error updating user"
-- generico de gotrue (caso real: John Idrobo tenia DOS cuentas y el destino
-- estaba ocupado por la suya vieja).
-- Solo service_role: no se expone a `authenticated` para que nadie enumere
-- correos del equipo probando direcciones.
create or replace function public.auth_user_by_email(_email text)
returns table (user_id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id,
         coalesce(nullif(btrim(p.full_name), ''), split_part(u.email, '@', 1))::text
  from auth.users u
  left join public.profiles p on p.id = u.id
  where lower(u.email) = lower(btrim(_email))
    and u.deleted_at is null
  limit 1
$$;

revoke all on function public.auth_user_by_email(text) from anon, authenticated, public;
