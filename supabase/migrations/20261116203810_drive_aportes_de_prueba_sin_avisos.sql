-- Lo que llega por un link de PRUEBA (drive_upload_links.prueba) nace ya «avisado»:
-- así ni la edge vieja ni la nueva mandan correo ni campana por una prueba.
-- (16/11/2026: Alvaro probando un video de 882 MB con el link de la creadora «Test».)
create or replace function public.drive_aporte_de_prueba_sin_aviso()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if exists (select 1 from public.drive_upload_links l where l.token = new.token and l.prueba) then
    new.avisado := true;
  end if;
  return new;
end;
$$;
revoke all on function public.drive_aporte_de_prueba_sin_aviso() from public, anon, authenticated;

drop trigger if exists drive_aportes_prueba_sin_aviso on public.drive_aportes;
create trigger drive_aportes_prueba_sin_aviso
  before insert on public.drive_aportes
  for each row execute function public.drive_aporte_de_prueba_sin_aviso();

-- Y lo que ya entró hoy por un link de prueba y todavía no avisó, tampoco.
update public.drive_aportes a
   set avisado = true
  from public.drive_upload_links l
 where l.token = a.token and l.prueba and not a.avisado;
