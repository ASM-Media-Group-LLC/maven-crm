-- El cron que vacía la papelera: cierra el ciclo de las cuentas recuperables.
--
-- La purga NO necesita edge function: las dos piezas destructivas ya existen
-- como funciones de Postgres (app_purge_user_refs limpia las refs y el perfil,
-- app_force_delete_auth_user borra la fila de auth.users, que es el camino que
-- admin-user-actions ya usa como fallback). Hacerlo en SQL evita tocar
-- _shared/, que dispara un redeploy de las 70 funciones.

create or replace function public.app_purgar_cuentas_vencidas(
  p_dias int default 30,
  -- Tope por vuelta. No es por rendimiento: es para que un deleted_at mal
  -- puesto (o un p_dias en 0) no pueda vaciar la empresa en una sola corrida.
  -- Lo que sobre se purga en el pase siguiente.
  p_tope int default 50
)
returns int
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  r record;
  v_purgadas int := 0;
begin
  if p_dias < 1 then
    raise exception 'p_dias tiene que ser al menos 1 (llegó %)', p_dias;
  end if;

  for r in
    select p.id, p.full_name, p.deleted_at, u.email
    from public.profiles p
    left join auth.users u on u.id = p.id
    where p.deleted_at is not null
      and p.deleted_at < now() - make_interval(days => p_dias)
    order by p.deleted_at
    limit p_tope
  loop
    -- La constancia va ANTES de destruir: después no queda de dónde copiar el
    -- nombre ni el correo. actor_id NULL = lo hizo el cron, no una persona.
    insert into public.cuenta_eventos
      (user_id, user_email, user_full_name, accion, actor_id, actor_email, detalle)
    values
      (r.id, r.email, r.full_name, 'purgada', null, 'cron',
       jsonb_build_object('eliminada_el', r.deleted_at, 'dias_de_papelera', p_dias));

    perform public.app_purge_user_refs(r.id);
    perform public.app_force_delete_auth_user(r.id);

    v_purgadas := v_purgadas + 1;
  end loop;

  return v_purgadas;
end;
$$;

revoke all on function public.app_purgar_cuentas_vencidas(int, int) from public;
revoke all on function public.app_purgar_cuentas_vencidas(int, int) from authenticated;
revoke all on function public.app_purgar_cuentas_vencidas(int, int) from anon;
grant execute on function public.app_purgar_cuentas_vencidas(int, int) to service_role;

-- Una vez al día, 2 de la mañana en Bogotá. No hace falta más: el plazo se mide
-- en días, así que correr cada hora solo adelantaría la purga unas horas.
select cron.unschedule('purgar-cuentas-vencidas')
where exists (select 1 from cron.job where jobname = 'purgar-cuentas-vencidas');

select cron.schedule(
  'purgar-cuentas-vencidas',
  '0 7 * * *',
  $cron$ select public.app_purgar_cuentas_vencidas(30, 50); $cron$
);
