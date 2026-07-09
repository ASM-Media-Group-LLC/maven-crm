-- resolve_wa_member — resolución de miembros del equipo por nombre, insensible a
-- MAYÚSCULAS y ACENTOS. El equipo escribe los nombres sin acentos ("maria de los
-- angeles", "miguel garcia") pero en Maven están con acentos → el bot de WhatsApp
-- (whatsapp-agent, resolveMembersByName) devolvía falso "no lo encuentro".
--
-- Matchea: (1) miembros del grupo por display_name, y (2) perfiles de Maven por
-- full_name AUNQUE no sean miembros de ese grupo (para consultar stats de cualquier
-- integrante del equipo — las tools solo necesitan user_id, no la membresía del grupo).

create extension if not exists unaccent with schema extensions;

create or replace function public.resolve_wa_member(p_group_id uuid, p_name text)
returns table(member_id uuid, display_name text, user_id uuid, member_role text, full_name text, last_seen_at timestamptz)
language sql stable security definer set search_path = public, extensions as $$
  with q as (select extensions.unaccent(lower(btrim(p_name))) as n)
  -- (1) miembros del grupo cuyo display_name matchea (accent/case-insensitive)
  select m.id, m.display_name, m.user_id, m.role, p.full_name, m.last_seen_at
    from whatsapp_members m
    left join profiles p on p.id = m.user_id
    cross join q
   where m.group_id = p_group_id
     and m.display_name is not null
     and extensions.unaccent(lower(m.display_name)) like '%' || q.n || '%'
  union
  -- (2) perfiles cuyo full_name matchea (cross-group) + su member del grupo si existe
  select m.id, coalesce(m.display_name, pr.full_name), pr.id, m.role, pr.full_name, m.last_seen_at
    from profiles pr
    cross join q
    left join whatsapp_members m on m.user_id = pr.id and m.group_id = p_group_id
   where pr.full_name is not null
     and extensions.unaccent(lower(pr.full_name)) like '%' || q.n || '%'
  limit 12;
$$;

-- SECURITY DEFINER → cerrar a anon/public; solo authenticated + service_role (el edge la llama con service_role).
revoke all on function public.resolve_wa_member(uuid, text) from public, anon;
grant execute on function public.resolve_wa_member(uuid, text) to authenticated, service_role;
