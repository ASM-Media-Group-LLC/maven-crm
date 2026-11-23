-- Owner opt-in only. These are explicitly estimates from Maven's balance ledger,
-- never a claim of a live Google wallet reading. No charge or auto-reload.
create or replace function public.ia_saldo_umbral_correo(_saldo jsonb)
returns integer language sql immutable set search_path = public, pg_temp as $$
  select case
    when not coalesce(_saldo->>'estado' in ('bien','pocos_dias','se_acaba_hoy'),false) then null
    when jsonb_typeof(_saldo->'saldo_usd') is distinct from 'number' then null
    when (_saldo->>'saldo_usd')::numeric < 0 then null
    when (_saldo->>'saldo_usd')::numeric <= 5 then 5
    when (_saldo->>'saldo_usd')::numeric <= 10 then 10
    else null
  end;
$$;
revoke all on function public.ia_saldo_umbral_correo(jsonb) from public,anon,authenticated;

create table public.argos_saldo_email_avisos (
  lectura bigint not null references public.costos_saldo(id),
  user_id uuid not null references auth.users(id),
  umbral smallint not null check(umbral in (5,10)),
  notification_id uuid,
  created_at timestamptz not null default now(),
  primary key(lectura,user_id,umbral)
);
alter table public.argos_saldo_email_avisos enable row level security;
revoke all on public.argos_saldo_email_avisos from anon,authenticated;
grant select on public.argos_saldo_email_avisos to authenticated;
create policy argos_saldo_email_avisos_dueno on public.argos_saldo_email_avisos
  for select to authenticated using ((select public.es_dueno((select auth.uid()))));

create or replace function public.vigilar_saldo_ia_correo()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare
  saldo jsonb := public.ia_saldo_calculo();
  v_umbral integer := public.ia_saldo_umbral_correo(saldo);
  v_lectura bigint := (saldo->'punto'->>'id')::bigint;
  destinatario uuid;
  inserted integer;
  total integer := 0;
  notif uuid;
  titulo text;
  mensaje text;
begin
  if v_umbral is null or v_lectura is null then return 0; end if;
  titulo := format('Argos: saldo estimado de Google en US$%s o menos',v_umbral);
  mensaje := format('Maven estima que quedan US$%s. Último saldo anotado: %s. Esta cifra es una estimación de Maven, no una consulta en vivo a Google. Comprueba el saldo en Google AI Studio y anótalo en Costos. Este aviso no realiza ninguna recarga.',
    to_char((saldo->>'saldo_usd')::numeric,'FM999990.00'),
    to_char((saldo->'punto'->>'medido_at')::timestamptz at time zone 'America/Bogota','DD/MM/YYYY HH24:MI'));
  for destinatario in
    select distinct o.user_id from public.tenant_owners o
    where public.notif_canal_activo(o.user_id,'costos_saldo_umbral','email')
      and not exists(select 1 from public.notification_settings s where s.user_id=o.user_id and s.notifications_enabled=false)
  loop
    insert into public.argos_saldo_email_avisos(lectura,user_id,umbral)
    values(v_lectura,destinatario,v_umbral) on conflict do nothing;
    get diagnostics inserted=row_count;
    if inserted=0 then continue; end if;
    -- Existing notifications -> push_notify_enqueue -> email_notify_enqueue
    -- handles the opt-in, authenticated transport and email recipient lookup.
    insert into public.notifications(user_id,type,title,message,reference_type,module_origin,priority,status,visibility_scope,deep_link_url)
    values(destinatario,'costos_saldo_umbral',titulo,mensaje,'costos','Oficina','high','new','personal','/oficina/costos')
    returning id into notif;
    update public.argos_saldo_email_avisos set notification_id=notif
      where user_id=destinatario and argos_saldo_email_avisos.lectura=v_lectura and argos_saldo_email_avisos.umbral=v_umbral;
    if v_umbral=5 then
      -- A first reading already below $5 produces one urgent email, not two.
      insert into public.argos_saldo_email_avisos(lectura,user_id,umbral,notification_id)
      values(v_lectura,destinatario,10,notif) on conflict do nothing;
    end if;
    total:=total+1;
  end loop;
  return total;
end $$;
revoke all on function public.vigilar_saldo_ia_correo() from public,anon,authenticated;

-- No recipients are opted in by the migration. Enable the owner's email event
-- only after checking the billing account and confirming the balance source.
do $$ begin
  if exists(select 1 from pg_namespace where nspname='cron') then
    perform cron.schedule('avisos-saldo-ia-correo','*/10 * * * *','select public.vigilar_saldo_ia_correo();');
  end if;
end $$;
