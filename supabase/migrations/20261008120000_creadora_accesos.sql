-- ACCESOS DE ONLYFANS DE LAS CREADORAS (Jhon, 08/10/2026).
-- Banco: supabase/tests/creadora_accesos.ts. La edge: supabase/functions/creadora-accesos.
--
-- Lo que antes llegaba por el Formulario de accesos de Google («FORMS KASH A.»):
-- el correo, el usuario y la contraseña de OnlyFans de cada creadora y si tiene
-- doble verificación. El correo, el nombre, el Instagram y el WhatsApp ya están
-- en la ficha (creators) y no se repiten acá.
--
-- Decisiones de Jhon:
--   · La contraseña la ven y la copian SOLO los admins, y queda anotado quién y
--     cuándo (creadora_accesos_eventos).
--   · La creadora los llena y los cambia desde su portal («Mis accesos»).
--   · La carga inicial, con un importador desde la hoja de la Oficina.
--
-- CÓMO SE GUARDA LA CONTRASEÑA: cifrada con AES-GCM en la edge, con una llave
-- (ACCESOS_CRED_KEY) que vive en los secretos de las funciones y NUNCA en la
-- base. Un volcado de la base sin la llave no sirve de nada. Mismo esquema que
-- las credenciales de correo (_shared/mail-crypto.ts), con otra llave: si una
-- se filtra, la otra no.
--
-- QUIÉN LA TOCA: NADIE desde el navegador. Ni authenticated ni anon tienen
-- grant: todo pasa por la edge, que antes pregunta con el JWT de quien llama
-- si ve a la creadora (la RLS de creators: agencia y alcance) y si es admin, o
-- si la ficha es suya (es_mi_ficha). Así una regla de RLS mal escrita no puede
-- dejar ver una contraseña.
--
-- Vuelta atrás (las líneas «--|»; el banco las corre):
--| drop table public.creadora_accesos_eventos;
--| drop table public.creadora_accesos;
--| drop function public.creadora_accesos_revisar();
--| drop function public.creadora_accesos_eventos_revisar();

-- ─── 1. Los accesos, uno por ficha ───────────────────────────────────────────
create table public.creadora_accesos (
  creator_id uuid primary key references public.creators (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id),
  of_correo text,
  of_usuario text,
  -- La contraseña, cifrada (base64): el texto, el nonce de 12 bytes y la versión
  -- de la llave (para poder rotarla). Las tres o ninguna.
  of_clave_cifrada text,
  of_clave_nonce text,
  of_clave_version smallint,
  doble_verificacion boolean,
  clave_cambiada_en timestamptz,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users (id) on delete set null,
  actualizado_desde text not null default 'equipo',
  constraint creadora_accesos_desde check (actualizado_desde in ('equipo', 'creadora', 'importador')),
  constraint creadora_accesos_clave_completa check (
    (of_clave_cifrada is null and of_clave_nonce is null and of_clave_version is null)
    or (of_clave_cifrada is not null and of_clave_nonce is not null and of_clave_version is not null)
  ),
  constraint creadora_accesos_largos check (
    coalesce(length(of_correo), 0) <= 320 and coalesce(length(of_usuario), 0) <= 200
    and coalesce(length(of_clave_cifrada), 0) <= 2000
  )
);
create index creadora_accesos_agencia_idx on public.creadora_accesos (tenant_id);
comment on table public.creadora_accesos is
  'Accesos de OnlyFans de cada creadora. Contraseña cifrada en la edge (ACCESOS_CRED_KEY). Solo la escribe y la lee la edge creadora-accesos. Ver 20261008120000.';

-- La agencia sale de la ficha, nunca de quien escribe; los textos, limpios.
create function public.creadora_accesos_revisar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  select c.tenant_id into new.tenant_id from public.creators c where c.id = new.creator_id;
  if new.tenant_id is null then
    raise exception 'creadora_accesos: la creadora % no existe', new.creator_id using errcode = '23503';
  end if;
  new.of_correo := nullif(lower(btrim(new.of_correo)), '');
  new.of_usuario := nullif(btrim(new.of_usuario), '');
  new.actualizado_en := now();
  if tg_op = 'INSERT' then
    new.clave_cambiada_en := case when new.of_clave_cifrada is not null then now() end;
  elsif new.of_clave_cifrada is distinct from old.of_clave_cifrada then
    new.clave_cambiada_en := case when new.of_clave_cifrada is not null then now() end;
  else
    new.clave_cambiada_en := old.clave_cambiada_en;
  end if;
  return new;
end $$;
revoke all on function public.creadora_accesos_revisar() from public, anon, authenticated;

create trigger creadora_accesos_revisar
  before insert or update on public.creadora_accesos
  for each row execute function public.creadora_accesos_revisar();

alter table public.creadora_accesos enable row level security;
revoke all on table public.creadora_accesos from public, anon, authenticated;
grant select, insert, update, delete on table public.creadora_accesos to service_role;

-- ─── 2. Quién hizo qué (solo se agrega) ─────────────────────────────────────
-- Cada vez que alguien guarda, importa, ve o copia la contraseña. Nunca el valor.
create table public.creadora_accesos_eventos (
  id bigint generated always as identity primary key,
  creator_id uuid not null references public.creators (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id),
  user_id uuid references auth.users (id) on delete set null,
  accion text not null,
  desde text not null,
  campos text[] not null default '{}',
  en timestamptz not null default now(),
  constraint creadora_accesos_eventos_accion check (accion in ('guardar', 'importar', 'ver_clave', 'copiar_clave')),
  constraint creadora_accesos_eventos_desde check (desde in ('equipo', 'creadora', 'importador'))
);
create index creadora_accesos_eventos_creadora_idx on public.creadora_accesos_eventos (creator_id, en desc);

create function public.creadora_accesos_eventos_revisar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  select c.tenant_id into new.tenant_id from public.creators c where c.id = new.creator_id;
  if new.tenant_id is null then
    raise exception 'creadora_accesos_eventos: la creadora % no existe', new.creator_id using errcode = '23503';
  end if;
  new.en := now();
  return new;
end $$;
revoke all on function public.creadora_accesos_eventos_revisar() from public, anon, authenticated;

create trigger creadora_accesos_eventos_revisar
  before insert on public.creadora_accesos_eventos
  for each row execute function public.creadora_accesos_eventos_revisar();

alter table public.creadora_accesos_eventos enable row level security;
revoke all on table public.creadora_accesos_eventos from public, anon, authenticated;
-- Ni la edge la cambia ni la borra: lo anotado queda. ⚠️ Supabase le da TODO a
-- service_role en cada tabla nueva (privilegios por defecto): hay que quitarlo.
revoke update, delete, truncate on table public.creadora_accesos_eventos from service_role;
grant select, insert on table public.creadora_accesos_eventos to service_role;
