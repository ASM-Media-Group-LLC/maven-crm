-- ARGOS CON CÁMARA O PANTALLA (Alvaro, 19/11/2026, corrección del mismo día).
--
-- «Tengo que tener por lo menos una de las dos para que funcione Argos.» Antes
-- (20261119230000) Argos iba solo con la pantalla. Ahora:
--   · Argos vigila a quien su puesto le pide cámara O pantalla (al menos una).
--     Sin ninguna de las dos, no hay Argos (aunque la persona comparta).
--   · Solo cámara → la nota sale de la cámara; solo pantalla → de la pantalla
--     (eso lo hace la app con exigencias_de_varios).
--   · El aviso y el correo dicen si Argos entra o sale con el cambio.

create or replace function public.argos_vigila_a(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.exige_camara(_uid) or public.exige_pantalla(_uid);
$$;

comment on column public.posiciones_borrador.pide_pantalla is
  'El puesto pide compartir pantalla. Argos vigila a quien su puesto le pide cámara o pantalla (al menos una) (Alvaro, 19/11/2026).';

-- La línea de Argos del aviso: entra si antes no pedía nada y ahora pide algo;
-- sale si antes pedía algo y ahora nada.
create or replace function public.exigencias_resumen(_ca boolean, _cd boolean, _pa boolean, _pd boolean)
returns text
language sql
immutable
as $$
  select 'Cámara: ' || public.exigencias_linea(_ca, _cd) || ' · Pantalla: ' || public.exigencias_linea(_pa, _pd) || '.'
      || case when (_ca or _pa) and not (_cd or _pd) then ' Argos deja de vigilar.'
              when not (_ca or _pa) and (_cd or _pd) then ' Argos empieza a vigilar en el turno.'
              else '' end;
$$;

-- Lo que se le pide a cada quien, para la nota (cámara y pantalla por separado).
create or replace function public.exigencias_de_varios(_ids uuid[] default null)
returns table (user_id uuid, camara boolean, pantalla boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, public.exige_camara(p.id), public.exige_pantalla(p.id)
    from public.profiles p
   where p.deleted_at is null and (_ids is null or p.id = any (_ids));
$$;
grant execute on function public.exigencias_de_varios(uuid[]) to authenticated;
