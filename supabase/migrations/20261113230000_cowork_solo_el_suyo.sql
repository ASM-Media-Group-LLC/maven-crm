-- CADA QUIEN SOLO EN EL COWORK DE SU DEPARTAMENTO (Alvaro, 13/11/2026).
-- Al repartir a la gente por departamento (20261113220000), Camila, María Villegas,
-- Katherin y Fabiana estaban conectadas en las salas viejas de CHATTERS KASH y su
-- Maven las volvió a meter a los pocos segundos (joinSession / joinByCode crean la
-- membresía si falta). La regla va en la base, para todas las puertas: quien debe
-- estar en Cowork es participante de UNA sola sesión activa — la de su departamento.
-- Si intenta entrar a otra, no lo deja y le dice cuál es la suya. Para cambiar a
-- alguien de departamento, primero se le quita la membresía vieja.

create or replace function public.cowork_solo_anfitriones_designados()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_suya text;
begin
  if new.role = 'host' and not public.puede_ser_anfitrion(new.session_id, new.user_id) then
    new.role := 'participant';
  end if;

  if tg_op = 'INSERT' and new.role <> 'host' and public.debe_estar_en_cowork(new.user_id) then
    select s.name into v_suya
      from public.cowork_memberships cm
      join public.cowork_sessions s on s.id = cm.session_id and s.status = 'active'
     where cm.user_id = new.user_id and cm.role <> 'host' and cm.session_id <> new.session_id
     limit 1;
    if v_suya is not null then
      raise exception 'Tu Cowork es «%». Entra por ahí.', v_suya
        using errcode = 'P0001', hint = 'Cada persona trabaja solo en el Cowork de su departamento.';
    end if;
  end if;
  return new;
end;
$$;

-- Los que se volvieron a meter: fuera de CHATTERS KASH (y de su sala ahí).
update public.cowork_room_assignments a set is_active = false
  from public.cowork_memberships cm
 where a.is_active and a.session_id = 'a6bae2d8-7ca5-4046-8f4e-5442d4c084f8'
   and cm.session_id = a.session_id and cm.user_id = a.user_id and cm.role <> 'host'
   and public.debe_estar_en_cowork(a.user_id)
   and public.equipo_de(a.user_id) <> 'Chatters';
delete from public.cowork_memberships cm
 where cm.session_id = 'a6bae2d8-7ca5-4046-8f4e-5442d4c084f8' and cm.role <> 'host'
   and public.debe_estar_en_cowork(cm.user_id)
   and public.equipo_de(cm.user_id) <> 'Chatters'
   and exists (select 1 from public.cowork_memberships o
                join public.cowork_sessions s on s.id = o.session_id and s.status = 'active'
               where o.user_id = cm.user_id and o.role <> 'host' and o.session_id <> cm.session_id);

-- El dueño, anfitrión de los Coworks nuevos (como si los hubiera creado desde la app).
insert into public.cowork_memberships (session_id, user_id, role)
select x.sid, '528453bd-f1e1-43d3-85c1-01c5fa5bbcfb', 'host'
  from (values ('9fa8ec28-1369-4d1a-ab83-f9dccdc04181'::uuid), ('83c48484-c8ff-477c-b087-d63a204d4dda'::uuid),
               ('fda22a31-a0eb-4582-a08c-c12063dc6b55'::uuid), ('c4389baf-0667-4603-82f3-7a5329a52422'::uuid)) as x(sid)
 where not exists (select 1 from public.cowork_memberships cm
                    where cm.session_id = x.sid and cm.user_id = '528453bd-f1e1-43d3-85c1-01c5fa5bbcfb');
