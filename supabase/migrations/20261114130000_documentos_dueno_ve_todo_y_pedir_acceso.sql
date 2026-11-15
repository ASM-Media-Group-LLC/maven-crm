-- EL DUEÑO VE TODOS LOS DOCUMENTOS DE SU AGENCIA, Y «PEDIR ACCESO» (Alvaro, 14/11/2026).
--
-- Le pasaron la hoja «PERSONALIZADOS PLUS» (privada de Lorena Lozano, compartida con
-- 20 personas) y no la pudo abrir: Maven solo deja ver un documento privado a su
-- dueño y a quien se lo compartieron, y el aviso decía «No se pudo abrir el
-- documento», como si algo se hubiera roto. Decidió:
--   · «El dueño ve todo siempre»: el dueño de la agencia (tenant_owners) puede ABRIR
--     cualquier documento de las personas de su agencia, aunque sea privado. Solo
--     ver: editar sigue siendo del dueño del documento, del equipo y de quien lo
--     tenga compartido con edición (la edge oficina-doc lee esta misma RLS con el
--     token de la persona y abre en modo lectura). La papelera ajena no se ve.
--   · Quien abre un documento que no le compartieron ve de quién es y un botón
--     «Pedir acceso» que le avisa a esa persona (una vez por hora y documento).
--
-- ALTER POLICY, nunca DROP + CREATE (CLAUDE.md).

-- ── 1) ¿Es el dueño de la agencia de esta persona? ───────────────────────────
create or replace function public.es_dueno_de_la_agencia_de(_persona uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.tenant_owners o
      join public.tenant_members m on m.tenant_id = o.tenant_id
     where o.user_id = (select auth.uid())
       and m.user_id = _persona
  )
$$;
revoke all on function public.es_dueno_de_la_agencia_de(uuid) from public, anon;
grant execute on function public.es_dueno_de_la_agencia_de(uuid) to authenticated;

alter policy "Ver documentos propios, del equipo y los compartidos conmigo" on public.documents
  using (
    (owner_id = (select auth.uid()))
    or ((visibility = 'equipo'::text) and (deleted_at is null))
    or (public.me_compartieron_documento(id) and (deleted_at is null))
    or ((deleted_at is null) and public.es_dueno_de_la_agencia_de(owner_id))
  );

-- ── 2) De quién es un documento que no puedo abrir ───────────────────────────
-- Solo el nombre de la dueña o el dueño, y solo dentro de la misma agencia: quien
-- tiene el enlace sabe a quién pedírselo, sin ver el título ni el contenido.
create or replace function public.documento_de_quien(_doc uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_nombre text;
begin
  select d.owner_id into v_owner
    from public.documents d
   where d.id = _doc and d.deleted_at is null;
  if v_owner is null then
    return jsonb_build_object('existe', false);
  end if;
  if not exists (
    select 1 from public.tenant_members a
      join public.tenant_members b on b.tenant_id = a.tenant_id
     where a.user_id = (select auth.uid()) and b.user_id = v_owner
  ) then
    return jsonb_build_object('existe', false);
  end if;
  select coalesce(nullif(trim(p.full_name), ''), 'su dueño') into v_nombre
    from public.profiles p where p.id = v_owner;
  return jsonb_build_object('existe', true, 'dueno', coalesce(v_nombre, 'su dueño'));
end
$$;
revoke all on function public.documento_de_quien(uuid) from public, anon;
grant execute on function public.documento_de_quien(uuid) to authenticated;

-- ── 3) Pedir acceso: aviso a la dueña o el dueño, una vez por hora ───────────
create table if not exists public.documento_pedidos_acceso (
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  pedido_at timestamptz not null default now(),
  primary key (document_id, user_id)
);
alter table public.documento_pedidos_acceso enable row level security;
revoke all on public.documento_pedidos_acceso from anon, authenticated;

create or replace function public.documento_pedir_acceso(_doc uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := (select auth.uid());
  v_owner uuid;
  v_titulo text;
  v_nombre text;
  v_dueno text;
  v_ultimo timestamptz;
begin
  if v_yo is null then
    raise exception 'sin sesión' using errcode = '42501';
  end if;
  select d.owner_id, d.title into v_owner, v_titulo
    from public.documents d
   where d.id = _doc and d.deleted_at is null;
  if v_owner is null or not exists (
    select 1 from public.tenant_members a
      join public.tenant_members b on b.tenant_id = a.tenant_id
     where a.user_id = v_yo and b.user_id = v_owner
  ) then
    raise exception 'documento no encontrado' using errcode = 'P0002';
  end if;
  select coalesce(nullif(trim(p.full_name), ''), 'su dueño') into v_dueno from public.profiles p where p.id = v_owner;
  if v_owner = v_yo then
    return jsonb_build_object('avisado', false, 'dueno', v_dueno);
  end if;

  select pedido_at into v_ultimo
    from public.documento_pedidos_acceso
   where document_id = _doc and user_id = v_yo;
  if v_ultimo is not null and v_ultimo > now() - interval '1 hour' then
    return jsonb_build_object('avisado', false, 'ya_pedido', true, 'dueno', v_dueno);
  end if;
  insert into public.documento_pedidos_acceso (document_id, user_id, pedido_at)
  values (_doc, v_yo, now())
  on conflict (document_id, user_id) do update set pedido_at = excluded.pedido_at;

  select coalesce(nullif(trim(p.full_name), ''), 'Alguien del equipo') into v_nombre from public.profiles p where p.id = v_yo;
  insert into public.notifications
    (user_id, type, title, message, reference_id, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
  values
    (v_owner, 'documento_pedir_acceso',
     format('%s te pide acceso a «%s»', v_nombre, coalesce(nullif(trim(v_titulo), ''), 'tu documento')),
     'Ábrelo y, si corresponde, compártelo desde «Compartir».',
     _doc::text, 'document', 'Oficina', 'medium', 'new', 'personal',
     format('/oficina/%s', _doc));
  return jsonb_build_object('avisado', true, 'dueno', v_dueno);
end
$$;
revoke all on function public.documento_pedir_acceso(uuid) from public, anon;
grant execute on function public.documento_pedir_acceso(uuid) to authenticated;
