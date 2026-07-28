-- get_manager_silent_creators — LISTA de creadoras ACTIVAS que su manager NO ha contactado
-- en p_days+ días (o NUNCA), leída de la bandeja de WhatsApp del departamento 'manager'.
--
-- POR QUÉ EXISTE: complementa get_manager_contact_activity (#885), que cuenta cuántas
-- creadoras contactó cada manager HOY, pero NO dice quién lleva días sin contacto. Ese
-- hueco hacía que el "Bot de Managers" IMPROVISARA la métrica de staleness — respondió
-- "6 creadoras llevan 3+ días sin contacto" nombrando como "sin contacto" a creadoras que
-- SÍ habían sido contactadas ese mismo día (javibelen, berenaa, Danyancatgaming). Con esta
-- RPC el bot responde "¿a quién no ha contactado X?" con el dato REAL.
--
-- MATCHING creadora <-> contacto de WhatsApp por los ÚLTIMOS 10 DÍGITOS del teléfono —
-- robusto al prefijo móvil mexicano (521... vs 52...) y a variantes de formato. Solo se
-- incluyen creadoras con teléfono normalizable a 10 dígitos; las que no, no se pueden
-- atribuir con certeza y se EXCLUYEN (no se inventa un "nunca contactada" falso).
--
-- ATRIBUCIÓN por assigned_manager_profile_id, que el trigger sync_manager_from_kash_type
-- mantiene alineado con la cuenta Kash (Plus=Carolina, Massive=Fabiana). Creadoras sin
-- manager asignada quedan fuera (igual que get_manager_growth_feed).
--
-- No cuenta mensajes fallidos (status='failed') como contacto — consistente con #885.
--
-- CAVEAT: solo mira las líneas del departamento 'manager'. Si una manager contacta a una
-- creadora desde OTRA línea (personal/otra cuenta no marcada 'manager'), no se ve acá y la
-- creadora podría aparecer como silenciosa.

create or replace function public.get_manager_silent_creators(
  p_tenant uuid,
  p_days integer default 3
)
returns table (
  creator_id uuid,
  name text,
  instagram_handle text,
  manager_profile_id uuid,
  manager_name text,
  last_contact_at timestamptz,
  days_since_contact int
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with mgr_lines as (
    select id from public.wa_channels
    where tenant_id = p_tenant and department = 'manager' and active
  ),
  last_contact as (
    select right(regexp_replace(coalesce(ct.phone_e164,''),'\D','','g'),10) as d10,
           max(msg.sent_at) as last_out_at
    from public.wa_conversations conv
    join public.wa_contacts ct on ct.id = conv.contact_id
    join public.wa_conversation_messages msg
      on msg.conversation_id = conv.id
     and msg.deleted_at is null
     and msg.direction = 'out'
     and coalesce(msg.status,'') <> 'failed'
    where conv.channel_id in (select id from mgr_lines)
    group by 1
  ),
  active_models as (
    select c.id,
           coalesce(nullif(c.artistic_name,''), c.name) as name,
           c.instagram_handle,
           c.assigned_manager_profile_id as mgr,
           right(regexp_replace(coalesce(c.phone_e164, c.whatsapp_number, c.phone, ''),'\D','','g'),10) as d10
    from public.creators c
    where c.status = 'active' and c.assigned_manager_profile_id is not null
  )
  select a.id, a.name, a.instagram_handle, a.mgr, m.full_name,
         lc.last_out_at as last_contact_at,
         case when lc.last_out_at is null then null
              else extract(day from (now() - lc.last_out_at))::int end as days_since_contact
  from active_models a
  left join last_contact lc on length(a.d10) = 10 and lc.d10 = a.d10
  left join public.profiles m on m.id = a.mgr
  where length(a.d10) = 10
    and (lc.last_out_at is null or lc.last_out_at < now() - make_interval(days => p_days))
  order by m.full_name nulls last, lc.last_out_at asc nulls first;
$function$;

grant execute on function public.get_manager_silent_creators(uuid, integer) to authenticated, service_role;
-- SECURITY DEFINER bypassa RLS y la función toma p_tenant como argumento → NO exponerla al
-- rol anónimo (un anon podría pasar cualquier tenant y leer PII cross-tenant). Se revoca el
-- grant por defecto a PUBLIC/anon, igual que get_manager_growth_feed.
revoke execute on function public.get_manager_silent_creators(uuid, integer) from public, anon;
