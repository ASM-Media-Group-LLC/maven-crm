-- SOLO NAVEGADOR POR POSICIÓN (Alvaro, 26/11/2026).
-- Hay gente (Finanzas: Keila, Daison, Angie) que trabaja solo en el navegador:
-- no se le ofrece «Abrir en la app de Maven» ni se le exige la app para Cowork
-- o las llamadas. Lo decide la Posición, como la cámara y la pantalla, y lo
-- cambia quien puede cambiar la cámara y la pantalla de ese puesto
-- (public.puede_cambiar_exigencias: el dueño, o quien tenga
-- N:camara_pantalla.decidir, nunca en Admin, Dueño ni su propio puesto).
--
-- Vuelta atrás:
--   drop function if exists public.posicion_solo_navegador_guardar(uuid, boolean);
--   drop function if exists public.posiciones_solo_navegador();
--   drop function if exists public.mi_solo_navegador();
--   alter table public.posiciones_borrador drop column if exists solo_navegador;

alter table public.posiciones_borrador
  add column if not exists solo_navegador boolean not null default false;

-- ¿Alguna de MIS posiciones me deja trabajar solo en el navegador?
create or replace function public.mi_solo_navegador()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.posiciones_borrador_personas pp
      join public.posiciones_borrador pb on pb.id = pp.posicion_id
     where pp.user_id = (select auth.uid()) and pb.activa and pb.solo_navegador
  );
$$;
revoke all on function public.mi_solo_navegador() from public, anon;
grant execute on function public.mi_solo_navegador() to authenticated;

-- Para la pantalla de Ajustes: el interruptor de cada puesto.
create or replace function public.posiciones_solo_navegador()
returns table (id uuid, solo_navegador boolean)
language sql
stable
security definer
set search_path = public
as $$
  select pb.id, pb.solo_navegador
    from public.posiciones_borrador pb
   where pb.activa
     and (public.es_dueno((select auth.uid())) or public.tiene_funcion((select auth.uid()), 'N:camara_pantalla.decidir'));
$$;
revoke all on function public.posiciones_solo_navegador() from public, anon;
grant execute on function public.posiciones_solo_navegador() to authenticated;

create or replace function public.posicion_solo_navegador_guardar(_posicion uuid, _valor boolean)
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
     set solo_navegador = coalesce(_valor, false), updated_at = now()
   where id = _posicion;
end $$;
revoke all on function public.posicion_solo_navegador_guardar(uuid, boolean) from public, anon;
grant execute on function public.posicion_solo_navegador_guardar(uuid, boolean) to authenticated;

-- Decisión del dueño (26/11/2026): Finanzas trabaja solo en el navegador.
update public.posiciones_borrador set solo_navegador = true where nombre = 'Finanzas' and activa;
