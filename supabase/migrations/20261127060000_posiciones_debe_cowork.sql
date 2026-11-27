-- «DEBE ESTAR EN COWORK» POR POSICIÓN (Alvaro, 27/11/2026): «siempre tiene que
-- ser hecho desde la parte de los roles». Antes la regla vivía escrita aquí:
-- «todos menos admins y dueño» más una lista a mano por persona (cowork_libres:
-- Jaime Baeza y Lukas Stankus). Ahora la decide cada Posición con un interruptor.
--
-- Arranca igual que hoy: apagado en Dueño, Admin (y cualquier posición de acceso
-- total o rol admin) y Freelance; prendido en las demás. Más la decisión del
-- 26-27/11: Finanzas (Keila, Daison, Angie) no tiene que estar en Cowork.
--
-- Con varias posiciones manda la que libera (igual que la cámara y la pantalla:
-- si alguna la apaga, queda apagada). Quien no tiene ninguna posición sigue con
-- la regla de antes (todos menos admins y dueño), para no soltar a nadie por un
-- dato que falta.
--
-- De esto salen: Argos «fuera de Cowork», el envío a Cowork al abrir Maven y,
-- en el navegador del computador, si se le exige la app.
--
-- Vuelta atrás:
--   create or replace function public.debe_estar_en_cowork(_uid uuid) returns boolean
--     language sql stable security definer set search_path to 'public' as $f$
--     select _uid is not null and not public.es_admin_o_dueno(_uid)
--        and not exists (select 1 from public.cowork_libres l where l.user_id = _uid); $f$;
--   drop function if exists public.posicion_debe_cowork_guardar(uuid, boolean);
--   drop function if exists public.posiciones_modo_de_trabajo();
--   drop function if exists public.mi_debe_cowork();
--   alter table public.posiciones_borrador drop column if exists debe_cowork;

alter table public.posiciones_borrador
  add column if not exists debe_cowork boolean not null default true;

update public.posiciones_borrador
   set debe_cowork = false
 where acceso_total or coalesce(rol, '') = 'admin' or nombre in ('Dueño', 'Freelance', 'Finanzas');

create or replace function public.debe_estar_en_cowork(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select _uid is not null and (
    case
      when exists (
        select 1 from public.posiciones_borrador_personas pp
          join public.posiciones_borrador pb on pb.id = pp.posicion_id and pb.activa
         where pp.user_id = _uid)
      then not exists (
        select 1 from public.posiciones_borrador_personas pp
          join public.posiciones_borrador pb on pb.id = pp.posicion_id and pb.activa
         where pp.user_id = _uid and not pb.debe_cowork)
      else not public.es_admin_o_dueno(_uid)
    end
  );
$$;

-- Para la regla de la app en el navegador: ¿tengo que estar en Cowork? (sin
-- mirar el turno: fuera de turno se sigue siendo «de Cowork»).
create or replace function public.mi_debe_cowork()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.debe_estar_en_cowork((select auth.uid()));
$$;
revoke all on function public.mi_debe_cowork() from public, anon;
grant execute on function public.mi_debe_cowork() to authenticated;

-- Ajustes: los dos interruptores de trabajo de cada puesto.
create or replace function public.posiciones_modo_de_trabajo()
returns table (id uuid, solo_navegador boolean, debe_cowork boolean)
language sql
stable
security definer
set search_path = public
as $$
  select pb.id, pb.solo_navegador, pb.debe_cowork
    from public.posiciones_borrador pb
   where pb.activa
     and (public.es_dueno((select auth.uid())) or public.tiene_funcion((select auth.uid()), 'N:camara_pantalla.decidir'));
$$;
revoke all on function public.posiciones_modo_de_trabajo() from public, anon;
grant execute on function public.posiciones_modo_de_trabajo() to authenticated;

create or replace function public.posicion_debe_cowork_guardar(_posicion uuid, _valor boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.puede_cambiar_exigencias((select auth.uid()), _posicion) then
    raise exception 'No puedes cambiar este puesto' using errcode = '42501';
  end if;
  update public.posiciones_borrador
     set debe_cowork = coalesce(_valor, true), updated_at = now()
   where id = _posicion;
end $$;
revoke all on function public.posicion_debe_cowork_guardar(uuid, boolean) from public, anon;
grant execute on function public.posicion_debe_cowork_guardar(uuid, boolean) to authenticated;
