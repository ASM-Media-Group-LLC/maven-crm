-- VIDEOS DE ONBOARDING DE LA CREADORA: quién los ve y quién los cambia.
-- Antes del portal de creadoras (cuentas externas que NO son empleadas).
-- Banco: supabase/tests/seguridad_archivos.ts. La edge que lo usa:
-- supabase/functions/creator-video (logica.ts).
--
-- Los huecos que se cierran:
--   V1. La edge creator-video solo miraba que hubiera sesión: cualquiera con
--       sesión pedía subir o confirmar un video para CUALQUIER creadora, y ver
--       o borrar cualquiera sabiendo su id.
--   V2. La tabla se podía ESCRIBIR por la API («FOR ALL» con el permiso del
--       módulo Creadores): quien tuviera el módulo insertaba una fila para la
--       creadora A con la llave de un video de la creadora B y la edge le
--       firmaba ese video; o borraba filas sin pasar por la edge.
--   V3. La lectura no miraba si la persona ve a esa creadora: con el módulo
--       Creadores se listaban los videos de todas.
--
-- Qué cambia:
--   1. creator_video_puede_editar(creator): ¿puede la persona que llama EDITAR a
--      esa creadora? Es la MISMA regla que hoy deja guardar la ficha: la
--      política de UPDATE de creators, sin copiarla. «SELECT … FOR KEY SHARE»
--      hace que Postgres le aplique a la fila las políticas de SELECT y las de
--      UPDATE (USING) de la tabla, sin escribir nada ni disparar triggers (y
--      creators tiene diez de UPDATE). Así, si la política de UPDATE cambia
--      (p. ej. cuando creators tenga tenant_id), esta función la sigue sola.
--      Es SECURITY INVOKER (corre como quien llama, con su RLS) y VOLATILE
--      (Postgres no deja tomar un candado de fila en una STABLE). El candado es
--      el más liviano: solo choca con un DELETE de la creadora o un cambio de
--      su id, y dura lo que el pedido.
--   2. creator_onboarding_videos: se LEE si la persona tiene el módulo
--      Creadores y además ve a esa creadora (la subconsulta corre con la RLS de
--      creators: hereda lo que se cambie ahí). Nadie escribe por la API: solo
--      la edge, con service_role, después de sus comprobaciones.
--
-- Vuelta atrás (las líneas «--|»; el banco las corre):
--| drop policy if exists creator_onboarding_videos_ver on public.creator_onboarding_videos;
--| grant insert, update, delete on public.creator_onboarding_videos to anon, authenticated;
--| create policy creator_onboarding_videos_scope on public.creator_onboarding_videos for all using (has_permission(auth.uid(), 'Creadores'::text, NULL::text)) with check (has_permission(auth.uid(), 'Creadores'::text, NULL::text));
--| drop function public.creator_video_puede_editar(uuid);

-- ─── 0. Lo que se reemplaza tiene que ser lo revisado ────────────────────────
do $$
declare
  r record;
begin
  if to_regclass('public.creator_onboarding_videos') is null then
    raise exception 'creator_video_permisos: falta 20260908230000_creator_onboarding_videos_hasta_3';
  end if;
  for r in select policyname, cmd, qual, with_check from pg_policies
           where schemaname = 'public' and tablename = 'creator_onboarding_videos' loop
    if r.policyname <> 'creator_onboarding_videos_scope' or r.cmd <> 'ALL'
       or r.qual is distinct from 'has_permission(auth.uid(), ''Creadores''::text, NULL::text)'
       or r.with_check is distinct from 'has_permission(auth.uid(), ''Creadores''::text, NULL::text)' then
      raise exception 'creator_video_permisos: la política % de creator_onboarding_videos no es la que se revisó (%, %, %): mirar qué cambió antes de aplicar',
        r.policyname, r.cmd, r.qual, r.with_check;
    end if;
  end loop;
end $$;

-- ─── 1. ¿Puede editar a esta creadora? (la política de UPDATE de creators) ──
create or replace function public.creator_video_puede_editar(p_creator_id uuid)
returns boolean
language plpgsql
volatile
security invoker
set search_path = public
as $$
begin
  -- FOR KEY SHARE: la fila sale solo si pasa las políticas de SELECT y las de
  -- UPDATE (USING) de creators para quien llama. No escribe ni dispara nada.
  perform 1 from public.creators where id = p_creator_id for key share;
  return found;
exception when insufficient_privilege then
  -- Sin privilegio de UPDATE sobre la tabla, no puede editar.
  return false;
end
$$;
revoke all on function public.creator_video_puede_editar(uuid) from public, anon;
grant execute on function public.creator_video_puede_editar(uuid) to authenticated;
comment on function public.creator_video_puede_editar(uuid) is
  '¿Quien llama puede EDITAR a esta creadora? Aplica las políticas de SELECT y UPDATE de creators (SELECT FOR KEY SHARE) sin copiarlas. Llamarla como la persona (con su JWT): con service_role la RLS no corre y da true para toda creadora que exista.';

-- ─── 2. La tabla: se lee con el módulo y viendo a la creadora; no se escribe ─
drop policy creator_onboarding_videos_scope on public.creator_onboarding_videos;
create policy creator_onboarding_videos_ver on public.creator_onboarding_videos
  for select to authenticated
  using (
    (select public.has_permission((select auth.uid()), 'Creadores', null))
    and exists (select 1 from public.creators c where c.id = creator_onboarding_videos.creator_id)
  );
revoke insert, update, delete on public.creator_onboarding_videos from anon, authenticated;
comment on policy creator_onboarding_videos_ver on public.creator_onboarding_videos is
  'Con el módulo Creadores y viendo a esa creadora (RLS de creators). Las escrituras las hace solo la edge creator-video con service_role.';
