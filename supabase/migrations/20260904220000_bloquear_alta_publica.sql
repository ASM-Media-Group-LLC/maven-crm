-- REGISTRO PÚBLICO CERRADO, EN LA BASE.
--
-- Apagar "Allow new users to sign up" en el panel de Supabase NO alcanza:
-- /auth/v1/signup es un endpoint público y la clave anon viaja dentro del
-- bundle del frontend, así que cualquiera puede postearle directo sin pasar
-- por ninguna pantalla nuestra. Y quien lo lograba entraba al tenant real
-- con rol `employee`, porque `handle_new_user` se lo da.
--
-- El candado va acá porque este es el único lugar por el que pasan TODAS las
-- altas, vengan del panel, de la API o de un curl.
--
-- CÓMO SE DISTINGUE UN ALTA LEGÍTIMA: la edge function `admin-user-actions`
-- crea los usuarios con la API de admin y les sella
-- `app_metadata.alta = "admin"`. El registro público NO puede escribir
-- app_metadata —GoTrue ignora el que manda el navegador— así que el sello es
-- imposible de falsificar desde afuera. Probado: un signup que manda
-- `data.alta = "admin"` y otro que manda `app_metadata` en el cuerpo los dos
-- reciben el rechazo.
--
-- ⚠️ CONSECUENCIA A TENER PRESENTE: crear un usuario desde el dashboard de
-- Supabase ("Add user") tampoco pone el sello, así que también queda
-- bloqueado. Las cuentas se crean desde Maven → Panel de control → Usuarios,
-- que además provisiona la casilla de correo y el rol. Si algún día hace
-- falta un alta de emergencia por fuera, se hace con
-- `set_config('maven.alta_manual','si',true)` en la misma sesión.
create or replace function public.bloquear_alta_publica()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(new.raw_app_meta_data->>'alta', '') = 'admin' then
    return new;
  end if;

  -- Válvula de emergencia para un alta manual desde SQL, en la misma sesión.
  if coalesce(current_setting('maven.alta_manual', true), '') = 'si' then
    return new;
  end if;

  raise exception
    'El registro público está cerrado. Las cuentas de Maven las crea un administrador desde el Panel de control.'
    using
      errcode = 'P0001',
      hint = 'admin-user-actions sella app_metadata.alta = "admin"; el endpoint público de registro no puede escribir app_metadata.';
end;
$$;

comment on function public.bloquear_alta_publica() is
  'Cierra el registro público: solo pasan las altas selladas por admin-user-actions (app_metadata.alta = "admin").';

drop trigger if exists bloquear_alta_publica on auth.users;
create trigger bloquear_alta_publica
  before insert on auth.users
  for each row execute function public.bloquear_alta_publica();
