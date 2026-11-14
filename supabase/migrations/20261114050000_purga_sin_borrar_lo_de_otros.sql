-- LA PURGA DE LA PAPELERA DEJA DE TRABARSE, SIN LLEVARSE LO DE LOS DEMÁS (13/11/2026).
--
-- app_purgar_cuentas_vencidas (cron «purgar-cuentas-vencidas», 0 7 * * *) fallaba
-- todos los días al borrar el perfil de una cuenta con más de 30 días en la
-- papelera: «violates foreign key constraint whatsapp_bot_rules_created_by_user_id_fkey».
-- Hay 9 FK a profiles(id) SIN acción al borrar; cualquiera con una fila frena la
-- purga entera (hoy: 4 reglas del bot, 4 datos de WhatsApp y 12 filas del
-- historial de managers de creadoras, de las 19 cuentas vencidas).
--
-- 1) Esas 9 FK pasan a ON DELETE SET NULL. Son columnas de autoría o de enlace
--    (quién creó/desactivó la regla, quién anotó, quién pidió, a quién se le
--    asignó, qué manager tuvo la creadora): la fila de negocio QUEDA y solo pierde
--    el nombre de alguien que ya no está. Nada se borra en cascada. Dos eran
--    NOT NULL (whatsapp_bot_rules.created_by_user_id y
--    creator_manager_history.manager_profile_id) y dejan de serlo.
--
-- 2) Arreglar solo eso habría hecho algo peor: app_purge_user_refs BORRA las filas
--    cuya columna hacia auth.users es NOT NULL. Entre las 19 cuentas vencidas está
--    quien creó el Cowork activo «CHATTERS KASH» (53 personas, 15 salas, ~38.000
--    tramos de horas de 61 personas): la purga lo habría borrado con todo lo que
--    cuelga en cascada. Lo mismo con 11 salas de Meet, 4 grabaciones, 5 sesiones
--    de examen de chatters (con su veredicto), 5 llamadas y 1 archivo de leads.
--    Esas columnas de autoría pasan a aceptar NULL con ON DELETE SET NULL, así
--    app_purge_user_refs (que mira attnotnull en cada corrida) las deja en NULL
--    en vez de borrar la fila:
--      cowork_sessions.created_by, meet_rooms.created_by,
--      meeting_recordings.started_by, chatter_sessions.examiner_user_id,
--      closer_lead_files.uploaded_by, calls.caller_id
--    Crear cualquiera de esas cosas sigue exigiendo quién (los candados *_agencia
--    rechazan un creador sin agencia), y cambiarle el dueño a OTRA persona sigue
--    prohibido; lo único nuevo es que puede quedar en NULL al purgar la cuenta.
--
-- 3) meet_rooms_agencia rechazaba CUALQUIER cambio de created_by, también a NULL.
--    Ahora deja pasar a NULL (igual que ya hacían meeting_recordings_agencia con
--    started_by y calls_agencia con caller_id).
--
-- Solo constraints y un trigger: ningún dato se toca en esta migración.

-- calls, cowork_sessions y meet_rooms se usan todo el día: si alguien las tiene
-- tomadas, mejor fallar y reintentar que dejar a todos esperando detrás del ALTER.
set local lock_timeout = '5s';

-- ── 1) Las 9 FK a profiles ─────────────────────────────────────────────────
alter table public.whatsapp_bot_rules alter column created_by_user_id drop not null;
alter table public.whatsapp_bot_rules
  drop constraint if exists whatsapp_bot_rules_created_by_user_id_fkey,
  add constraint whatsapp_bot_rules_created_by_user_id_fkey
    foreign key (created_by_user_id) references public.profiles (id) on delete set null;
alter table public.whatsapp_bot_rules
  drop constraint if exists whatsapp_bot_rules_deactivated_by_user_id_fkey,
  add constraint whatsapp_bot_rules_deactivated_by_user_id_fkey
    foreign key (deactivated_by_user_id) references public.profiles (id) on delete set null;

alter table public.creator_manager_history alter column manager_profile_id drop not null;
alter table public.creator_manager_history
  drop constraint if exists creator_manager_history_manager_profile_id_fkey,
  add constraint creator_manager_history_manager_profile_id_fkey
    foreign key (manager_profile_id) references public.profiles (id) on delete set null;

alter table public.whatsapp_person_facts
  drop constraint if exists whatsapp_person_facts_created_by_fkey,
  add constraint whatsapp_person_facts_created_by_fkey
    foreign key (created_by) references public.profiles (id) on delete set null;

alter table public.employees
  drop constraint if exists employees_profile_id_fkey,
  add constraint employees_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete set null;

alter table public.custom_content_requests
  drop constraint if exists custom_content_requests_assigned_chatter_id_fkey,
  add constraint custom_content_requests_assigned_chatter_id_fkey
    foreign key (assigned_chatter_id) references public.profiles (id) on delete set null;
alter table public.custom_content_requests
  drop constraint if exists custom_content_requests_requested_by_fkey,
  add constraint custom_content_requests_requested_by_fkey
    foreign key (requested_by) references public.profiles (id) on delete set null;

alter table public.promolog_scan_notes
  drop constraint if exists promolog_scan_notes_set_by_fkey,
  add constraint promolog_scan_notes_set_by_fkey
    foreign key (set_by) references public.profiles (id) on delete set null;

alter table public.content_grids
  drop constraint if exists content_grids_feedback_by_fkey,
  add constraint content_grids_feedback_by_fkey
    foreign key (feedback_by) references public.profiles (id) on delete set null;

-- ── 2) Autoría de cosas compartidas (FK a auth.users) ───────────────────────
alter table public.cowork_sessions alter column created_by drop not null;
alter table public.cowork_sessions
  drop constraint if exists cowork_sessions_created_by_fkey,
  add constraint cowork_sessions_created_by_fkey
    foreign key (created_by) references auth.users (id) on delete set null;

alter table public.meet_rooms alter column created_by drop not null;
alter table public.meet_rooms
  drop constraint if exists meet_rooms_created_by_fkey,
  add constraint meet_rooms_created_by_fkey
    foreign key (created_by) references auth.users (id) on delete set null;

-- Ya era ON DELETE SET NULL, pero con NOT NULL la acción no podía cumplirse.
alter table public.meeting_recordings alter column started_by drop not null;

alter table public.chatter_sessions alter column examiner_user_id drop not null;
alter table public.chatter_sessions
  drop constraint if exists chatter_sessions_examiner_user_id_fkey,
  add constraint chatter_sessions_examiner_user_id_fkey
    foreign key (examiner_user_id) references auth.users (id) on delete set null;

alter table public.closer_lead_files alter column uploaded_by drop not null;
alter table public.closer_lead_files
  drop constraint if exists closer_lead_files_uploaded_by_fkey,
  add constraint closer_lead_files_uploaded_by_fkey
    foreign key (uploaded_by) references auth.users (id) on delete set null;

alter table public.calls alter column caller_id drop not null;
alter table public.calls
  drop constraint if exists calls_caller_id_fkey,
  add constraint calls_caller_id_fkey
    foreign key (caller_id) references auth.users (id) on delete set null;

-- ── 3) El candado de Meet deja pasar a NULL a quien creó la reunión ──────────
create or replace function public.meet_rooms_agencia()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_del_creador uuid;
begin
  if tg_op = 'UPDATE' then
    if new.tenant_id is distinct from old.tenant_id
       -- Quien la creó solo puede pasar a NULL: es la purga de su cuenta (FK ON DELETE SET NULL).
       or (new.created_by is distinct from old.created_by and new.created_by is not null)
       or new.livekit_room_name is distinct from old.livekit_room_name then
      raise exception 'meet_rooms_agencia: la agencia, quien la creó y la sala de una reunión no cambian' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.livekit_room_name is null or new.livekit_room_name not like 'meet\_%' then
    raise exception 'meet_rooms_agencia: la sala de una reunión de Meet se llama meet_…' using errcode = '23514';
  end if;
  v_del_creador := (select tm.tenant_id from public.tenant_members tm where tm.user_id = new.created_by);
  if v_del_creador is null then
    raise exception 'meet_rooms_agencia: % no es de ninguna agencia, no puede crear reuniones', new.created_by using errcode = '42501';
  end if;
  if new.tenant_id is null then
    new.tenant_id := v_del_creador;
  elsif new.tenant_id <> v_del_creador then
    raise exception 'meet_rooms_agencia: la reunión tiene que ser de la agencia de quien la crea' using errcode = '42501';
  end if;
  return new;
end $function$;
