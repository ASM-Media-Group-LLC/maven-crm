-- NADIE MIRA FUERA DEL TURNO (Alvaro, 19/11/2026: «Maven sigue viendo las
-- pantallas de las personas aun cuando ya no están trabajando… te dije que no,
-- ya no se puede hacer»).
--
-- Había tres huecos:
--   1) Hasta el corte (20/11 00:00 Bogotá) en_turno() decía «sí» a todos, a
--      cualquier hora: se guardaban fotos fuera del horario (18–19/11: cientos
--      por persona). Desde ya, antes del corte cuenta solo DENTRO de su horario
--      (turno_en_curso); después del corte, como estaba: con la entrada marcada.
--   2) El buzón de fotos (storage monitor-capturas) y el de videos (argos-clips)
--      aceptaban subir archivos sin mirar el turno: una pestaña vieja sin
--      recargar podía seguir subiendo pantallazos. Ahora también exigen en_turno.
--   3) (en el frontend) al marcar salida, Cowork seguía compartiendo pantalla;
--      ahora se sale de la sala y la app deja de compartir sola fuera del turno.

create or replace function public.en_turno(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.turno_obligatorio()
      then exists (select 1 from public.turno_marcas m where m.user_id = _uid and m.fin is null)
    else exists (select 1 from public.turno_en_curso(_uid, now()))
  end;
$$;

do $pol$ begin
  if to_regclass('storage.objects') is not null then
    if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'monitor_capturas_upload_propio') then
      alter policy monitor_capturas_upload_propio on storage.objects
        with check (bucket_id = 'monitor-capturas'
                    and (storage.foldername(name))[1] = ((select auth.uid()))::text
                    and public.en_turno((select auth.uid())));
    end if;
    if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'argos_clips_obj_ins') then
      alter policy argos_clips_obj_ins on storage.objects
        with check (bucket_id = 'argos-clips'
                    and (storage.foldername(name))[1] = ((select auth.uid()))::text
                    and public.en_turno((select auth.uid())));
    end if;
  end if;
end $pol$;
