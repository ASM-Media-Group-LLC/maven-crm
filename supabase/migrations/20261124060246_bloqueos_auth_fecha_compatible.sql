-- GoTrue representa banned_until como *time.Time: el valor especial de Postgres
-- 'infinity' rompe la lectura de usuarios (HTTP 500), aunque siga bloqueado.
-- Conservamos el bloqueo con una fecha RFC3339 finita. No se ejecuta el traductor
-- de posiciones ni se cambia ningún rol, permiso, contraseña o sesión.
-- Fuentes: supabase/auth/internal/models/user.go (BannedUntil, IsBanned)
-- y https://pkg.go.dev/time#Time.MarshalJSON.

do $reparar_bloqueo$
declare
  _funcion regprocedure := to_regprocedure('public.posiciones_sincronizar(boolean,boolean)');
  _def text;
  _viejo constant text := $$banned_until = 'infinity'$$;
  _nuevo constant text := $$banned_until = '9999-12-31 00:00:00+00'::timestamptz$$;
  _coincidencias integer;
  _bloqueados_antes bigint;
begin
  if _funcion is null then
    raise exception 'Falta posiciones_sincronizar; revisar las migraciones previas';
  end if;
  _def := pg_get_functiondef(_funcion);
  _coincidencias := (length(_def) - length(replace(_def, _viejo, ''))) / length(_viejo);
  if _coincidencias = 1 then
    -- Cambia solo la representación de la fecha sobre la definición vigente.
    -- CREATE OR REPLACE conserva propietario, permisos, SECURITY DEFINER y search_path.
    execute replace(_def, _viejo, _nuevo);
  elsif _coincidencias <> 0 or position(_nuevo in _def) = 0 then
    raise exception 'La forma del bloqueo cambió; revisar antes de aplicar';
  end if;

  select count(*) into _bloqueados_antes from auth.users where banned_until > now();
  update auth.users
    set banned_until = '9999-12-31 00:00:00+00'::timestamptz
    where banned_until = 'infinity'::timestamptz;
  if (select count(*) from auth.users where banned_until > now()) <> _bloqueados_antes then
    raise exception 'La reparación no debe habilitar ni bloquear cuentas';
  end if;
end
$reparar_bloqueo$;

-- Vuelta atrás: si la aplicación falla, revertir ese cambio de aplicación y
-- conservar la fecha finita. Restaurar 'infinity' reintroduce los errores 500.
-- Este bloque es atómico: cualquier excepción revierte función y fechas.
