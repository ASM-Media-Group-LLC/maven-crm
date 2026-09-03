-- Tablero del closer: dos cosas que hoy no puede leer de sí mismo.
--
-- 1) SUS HORAS DE HUBSTAFF. `hubstaff_daily_data` es management-only
--    (`blu_is_management OR admin`), así que un closer no puede ver ni sus
--    propias horas. Los chatters no tenían este problema porque sus horas ya
--    viajan dentro de `chatter_daily_score`, que sí les abre RLS.
--    Se agrega "cada quien ve LO SUYO": la fila es tuya si el
--    `hubstaff_user_id` es el de tu `hubstaff_members`. No abre nada de nadie
--    más y sirve para cualquier "mis horas" futuro.
create policy hubstaff_daily_data_propia on public.hubstaff_daily_data
  for select to authenticated
  using (exists (
    select 1 from public.hubstaff_members hm
    where hm.hubstaff_user_id = hubstaff_daily_data.hubstaff_user_id
      and hm.profile_id = auth.uid()
  ));

-- 2) SU PIPELINE con el conteo de contactos por lead, que es lo que necesita
--    la cadencia de seguimiento (1/3/5/8/15/29 días, RE-ANCLADA al último
--    contacto). Bajar `closer_contact_history` al navegador para contar sería
--    ~1.200 filas para 200 leads y el corte de 1000 de PostgREST las
--    truncaría en silencio.
--
--    SECURITY DEFINER con filtro DURO por `assigned_to = auth.uid()`: es
--    personal por construcción (un supervisor, que por RLS ve todo el
--    pipeline, acá igual ve solo lo suyo) y el conteo sale exacto.
create or replace function public.closer_mis_leads(_limite int default 400)
returns table(
  id uuid, instagram_handle text, stage text, category text, deal_type text,
  passed_date date, last_contact_date date, monthly_monetization numeric,
  contactos integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select cc.id, cc.instagram_handle, cc.stage, cc.category, cc.deal_type,
         cc.passed_date, cc.last_contact_date, cc.monthly_monetization,
         (select count(*)::integer from public.closer_contact_history h
           where h.creator_id = cc.id) as contactos
  from public.closer_creators cc
  where cc.assigned_to = auth.uid()
  order by cc.passed_date desc nulls last
  limit greatest(1, least(_limite, 1000));
$function$;

revoke all on function public.closer_mis_leads(int) from public;
grant execute on function public.closer_mis_leads(int) to authenticated;

-- 3) "Closer +" es el rol real de los closers (María y Miguel); el rol base
--    `closer` tiene CERO usuarios. Sin la fila en `role_base_grants`,
--    `has_role(uid,'closer')` les da false y todo lo que dependa de eso los
--    ignora — por ejemplo la vista `v_closer_hubstaff`, que por eso devuelve
--    CERO filas hoy. Es el remedio documentado para roles custom que operan
--    como un rol funcional base (ver PR #938).
--    Blast radius revisado: la única policy que menciona 'closer' es el INSERT
--    de `creators`, donde ya pasaban por `is_in_role_group('supervisor_or_above')`.
insert into public.role_base_grants (role_name, base_role, note)
values ('Closer +', 'closer', 'Closer + es el rol real de los closers; el base `closer` no tiene usuarios')
on conflict (role_name, base_role) do nothing;  -- PK compuesta
