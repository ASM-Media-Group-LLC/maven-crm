-- PERSONAS POR AGENCIA, 2: el directorio del Correo y el karma (fase 0, entrega 3a).
-- Requiere 20261001212000_personas_por_agencia (gente_de_mi_agencia).
-- Banco: supabase/tests/personas_por_agencia.ts.
--
-- Son SECURITY DEFINER, así que la política nueva de profiles no las alcanza:
--   · mail_recipient_directory (el «Para» del Correo): los compañeros, solo de la
--     propia agencia. Las listas por rol (email_role_groups) siguen siendo de
--     KASH; se separan con el correo por agencia (entrega 2b).
--   · get_karma_profile: el perfil de karma de alguien de otra agencia da
--     «not_found» (antes devolvía su nombre y su correo), y los «elegibles» se
--     cuentan dentro de la agencia.
--   · send_karma: no se le manda karma a alguien de otra agencia.
--
-- Cada función se reescribe desde su definición viva (pg_get_functiondef) con
-- reemplazos exactos, como 20260929180000_funciones_sin_voseo: si un texto no
-- está exactamente una vez, la migración falla. Los grants no cambian (CREATE OR
-- REPLACE los conserva, también los de 20261001150000_karma_sin_anon).
-- Las definiciones de antes quedan en personas_por_agencia_respaldo.
--
-- Vuelta atrás (las líneas «--|»; el banco las corre):
--| do $$ declare r record; begin for r in select def from public.personas_por_agencia_respaldo loop execute r.def; end loop; end $$;
--| drop table public.personas_por_agencia_respaldo;

create table public.personas_por_agencia_respaldo (fn text primary key, def text not null, guardada timestamptz not null default now());
alter table public.personas_por_agencia_respaldo enable row level security;
revoke all on table public.personas_por_agencia_respaldo from public, anon, authenticated;
comment on table public.personas_por_agencia_respaldo is
  'Definiciones de antes de 20261001212100_personas_karma_y_directorio, para su vuelta atrás. Sin políticas.';

create temp table _personas_reemplazos (fn text not null, orden int not null, viejo text not null, nuevo text not null, primary key (fn, orden)) on commit drop;
insert into _personas_reemplazos values
('public.mail_recipient_directory()', 1,
$q$    and u.id <> auth.uid()
$q$,
$q$    and u.id <> auth.uid()
    and u.id in (select public.gente_de_mi_agencia())
$q$),
('public.get_karma_profile(uuid)', 1,
$q$begin
  v_is_admin := exists ($q$,
$q$begin
  -- Solo gente de la propia agencia (20261001212100): el perfil de alguien de
  -- otra agencia es «no existe».
  if target is distinct from v_caller
     and target not in (select public.gente_de_mi_agencia()) then
    return jsonb_build_object('error','not_found');
  end if;

  v_is_admin := exists ($q$),
('public.get_karma_profile(uuid)', 2,
$q$  where user_id <> target and role not in ('spammer','Warming');$q$,
$q$  where user_id <> target and role not in ('spammer','Warming')
    and user_id in (select public.gente_de_mi_agencia());$q$),
('public.send_karma(uuid)', 1,
$q$  if not exists (select 1 from user_roles where user_id = v_caller) then
    return jsonb_build_object('ok', false, 'error', 'not_eligible');
  end if;
$q$,
$q$  if not exists (select 1 from user_roles where user_id = v_caller) then
    return jsonb_build_object('ok', false, 'error', 'not_eligible');
  end if;
  -- A alguien de otra agencia no se le manda karma (20261001212100).
  if target not in (select public.gente_de_mi_agencia()) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
$q$);

do $$
declare
  f text;
  m record;
  def text;
  texto text;
  n int;
begin
  for f in select distinct fn from _personas_reemplazos order by fn loop
    def := pg_get_functiondef(f::regprocedure);
    insert into public.personas_por_agencia_respaldo (fn, def) values (f, def);
    texto := def;
    for m in select viejo, nuevo as reemplazo from _personas_reemplazos where fn = f order by orden loop
      n := (length(texto) - length(replace(texto, m.viejo, ''))) / length(m.viejo);
      if n <> 1 then
        raise exception 'personas_por_agencia: en % el texto a reemplazar aparece % vez/veces (tiene que ser 1): %', f, n, left(m.viejo, 80);
      end if;
      texto := replace(texto, m.viejo, m.reemplazo);
    end loop;
    execute texto;
  end loop;
end $$;
