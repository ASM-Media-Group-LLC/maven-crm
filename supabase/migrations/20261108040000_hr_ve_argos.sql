-- HR (rol HHRR) puede ver Argos/expediente de TODO el equipo MENOS los admins
-- (Alvaro, 08/11/2026): "Andrea es HR, necesita ver; pero HR no mira qué hacen
-- los admins — solo yo veo a los admins". La regla depende del NIVEL de la
-- persona observada (user_id de la fila), no solo del rol del que mira.
--
-- es_rh(uid) = tiene rol HHRR/RRHH. Se suma a las policies de SELECT de las
-- tablas por-persona de Argos, con la guarda NOT es_admin_o_dueno(user_id) para
-- que HR nunca vea filas de admins ni dueños. Se usa ALTER POLICY (no DROP+CREATE)
-- y auth.uid() va envuelto en (select …).

create or replace function public.es_rh(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = _uid and lower(ur.role) in ('hhrr', 'rrhh')
  );
$function$;

-- Pantallazos (fotos de pantalla/cámara)
alter policy "monitor_capturas_sel_supervisor" on public.monitor_capturas
  using (
    es_dueno((select auth.uid()))
    or (es_rh((select auth.uid())) and not es_admin_o_dueno(user_id))
  );

-- Clips viejos
alter policy "monitor_clips_sel_dueno" on public.monitor_clips
  using (
    es_dueno((select auth.uid()))
    or (es_rh((select auth.uid())) and not es_admin_o_dueno(user_id))
  );

-- Clips de video al distraerse (nuevos)
alter policy "argos_clips_sel_dueno" on public.argos_clips
  using (
    es_dueno((select auth.uid()))
    or (es_rh((select auth.uid())) and not es_admin_o_dueno(user_id))
  );

-- Alertas / bajones (mantiene el filtro de tenant)
alter policy "argos_alertas_sel_supervisor" on public.argos_alertas
  using (
    (
      es_dueno((select auth.uid()))
      or (es_rh((select auth.uid())) and not es_admin_o_dueno(user_id))
    )
    and (tenant_id = (select current_tenant_id()))
  );

-- Latido del rondín (para "en sala ahora")
alter policy "monitor_rondas_sel_supervisor" on public.monitor_rondas
  using (
    es_dueno((select auth.uid()))
    or (es_rh((select auth.uid())) and not es_admin_o_dueno(user_id))
  );

-- Tardanzas (suma la rama HR a lo que ya había)
alter policy "ver tardanzas" on public.tardanzas_registro
  using (
    (user_id = (select auth.uid()))
    or es_dueno((select auth.uid()))
    or (exists (
      select 1 from profiles p
      where p.id = (select auth.uid())
        and p.nivel = any (array['dueno','admin','manager','supervisor'])
    ))
    or (es_rh((select auth.uid())) and not es_admin_o_dueno(user_id))
  );

-- Cámara apagada al inicio del turno
alter policy "ver camara inicio" on public.camara_inicio_registro
  using (
    es_admin_o_dueno((select auth.uid()))
    or (user_id = (select auth.uid()))
    or (es_rh((select auth.uid())) and not es_admin_o_dueno(user_id))
  );

-- Segmentos de tiempo (horas, pantalla/cámara) — mantiene el scope por sesión de
-- la agencia; HR ve los de no-admins.
alter policy "tiempo: cada uno lo suyo" on public.cowork_tiempo_segmentos
  using (
    (user_id = (select auth.uid()))
    or (
      (select has_role((select auth.uid()), 'admin'))
      and session_id in (select cowork_sesiones_de_mi_agencia())
    )
    or (
      es_rh((select auth.uid()))
      and not es_admin_o_dueno(user_id)
      and session_id in (select cowork_sesiones_de_mi_agencia())
    )
  );
