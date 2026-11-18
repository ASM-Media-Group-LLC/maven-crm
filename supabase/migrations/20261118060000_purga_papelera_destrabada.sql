-- LA LIMPIEZA DE LA PAPELERA VUELVE A ANDAR (18/11/2026).
--
-- Andrea (RR. HH.) no podía agregar gente: «No quedan puestos de correo en
-- Zoho». Los puestos los tenían cuentas que se fueron hace más de 30 días: el
-- cron «purgar-cuentas-vencidas» (0 7 * * *) no purgó NINGUNA desde que existe.
-- El 13/11 lo frenaba una FK de whatsapp_bot_rules (arreglado en
-- 20261114050000) y desde el 14/11 lo frena esto:
--
--   new row for relation "creators" violates check constraint
--   "creators_birth_date_plausible"
--
-- Al purgar a quien dio de alta una creadora, app_purge_user_refs pone
-- creators.created_by en NULL. La regla de la fecha se puso NOT VALID para que
-- no revisara las filas viejas, pero Postgres revisa un CHECK en CUALQUIER
-- update de la fila, aunque no toque la fecha: las 17 creadoras con fechas
-- imposibles (2026-06-14, etc.) no dejan cambiarles nada. Y como la purga corre
-- todo en una sola transacción, una sola cuenta trababa las 23 vencidas.
--
-- 1) La regla de la fecha pasa a un trigger que la revisa SOLO cuando se
--    escribe la fecha (alta, o un cambio de la fecha). Es lo que la regla quería
--    desde el principio («solo exige la regla en inserts/updates nuevos»): una
--    fecha imposible sigue sin poder entrar, y una fila vieja ya no traba nada.
-- 2) La purga va cuenta por cuenta: si una se traba, queda en la papelera, se
--    anota en el registro de la base y las demás siguen. Mañana se reintenta.
--
-- Ningún dato se toca en esta migración: la purga la hace el cron de siempre.

set local lock_timeout = '5s';

-- ── 1) Fecha de nacimiento plausible, solo al escribirla ────────────────────
create or replace function public.creators_fecha_de_nacimiento_plausible()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.birth_date is not null
     and (tg_op = 'INSERT' or new.birth_date is distinct from old.birth_date)
     and (new.birth_date < date '1940-01-01' or new.birth_date > date '2015-12-31') then
    raise exception 'La fecha de nacimiento % no es posible: tiene que estar entre 1940 y 2015.', new.birth_date
      using errcode = '23514', constraint = 'creators_birth_date_plausible';
  end if;
  return new;
end;
$function$;

drop trigger if exists creators_fecha_de_nacimiento_plausible on public.creators;
create trigger creators_fecha_de_nacimiento_plausible
  before insert or update of birth_date on public.creators
  for each row execute function public.creators_fecha_de_nacimiento_plausible();

alter table public.creators drop constraint if exists creators_birth_date_plausible;

-- ── 2) La purga, cuenta por cuenta ───────────────────────────────────────────
create or replace function public.app_purgar_cuentas_vencidas(p_dias integer default 30, p_tope integer default 50)
returns integer
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  r record;
  v_purgadas int := 0;
  v_trabadas int := 0;
  v_casilla text;
  v_evento uuid;
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
    -- Cada cuenta en su propio bloque: si algo la traba, se deshace solo lo
    -- de ESA cuenta (constancia, cola del buzón y borrado) y se sigue.
    begin
      -- El buzón, mientras mail_credentials todavía existe.
      v_casilla := public.app_casilla_de_la_cuenta(r.id);
      v_evento := gen_random_uuid();

      -- La constancia va ANTES de destruir: después no queda de dónde copiar el
      -- nombre ni el correo. actor_id NULL = lo hizo el cron, no una persona. La
      -- edge completa casilla_zoho_* cuando procesa la cola.
      insert into public.cuenta_eventos
        (id, user_id, user_email, user_full_name, accion, actor_id, actor_email, detalle)
      values
        (v_evento, r.id, r.email, r.full_name, 'purgada', null, 'cron',
         jsonb_build_object(
           'eliminada_el', r.deleted_at,
           'dias_de_papelera', p_dias,
           'casilla_zoho', v_casilla,
           'casilla_zoho_liberada', null,
           'casilla_zoho_estado', case when v_casilla is not null then 'pendiente' end,
           'casilla_zoho_motivo', case
             when v_casilla is null then 'la cuenta no tenía casilla de correo de Maven'
             else 'en cola: la borra la edge buzones-por-borrar'
           end));

      if v_casilla is not null then
        perform public.app_encolar_buzon(r.id, v_casilla, r.deleted_at, p_dias, 'purga_automatica', v_evento);
      end if;

      perform public.app_purge_user_refs(r.id);
      perform public.app_force_delete_auth_user(r.id);

      v_purgadas := v_purgadas + 1;
    exception when others then
      v_trabadas := v_trabadas + 1;
      raise warning 'purgar-cuentas-vencidas: la cuenta % (%) sigue en la papelera: % [%]',
        r.full_name, r.id, sqlerrm, sqlstate;
    end;
  end loop;

  if v_trabadas > 0 then
    raise warning 'purgar-cuentas-vencidas: % purgadas, % trabadas (se reintentan mañana)', v_purgadas, v_trabadas;
  end if;
  return v_purgadas;
end;
$function$;
