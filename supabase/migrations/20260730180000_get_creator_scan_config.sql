-- El bot de Managers le negaba a Fabiana info que SÍ existe: qué redes/handles tiene cargada
-- cada creadora en el escaneo y si están sanos. Repetía "solo veo días de promo, no la config
-- del scan" y derivaba a Lore. La data está en creators + creator_social_accounts +
-- promolog_entries. Esta RPC la expone para una tool del bot.
--
-- Responde las preguntas típicas de Fabiana: ¿tiene X cargado? (twitter_handle + promos en X),
-- ¿el Telegram quedó como canal o apunta a un usuario? (formato del handle + error de scan),
-- ¿está privada / no se lee? (error_reason del último scan por red), ¿quedó bien el handle que
-- actualicé? (muestra el handle actual + su salud reciente).
CREATE OR REPLACE FUNCTION public.get_creator_scan_config(p_tenant uuid, p_query text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with q as (select regexp_replace(lower(trim(p_query)), '^@', '') as h),
  c as (
    select cr.id, coalesce(nullif(cr.artistic_name,''), cr.name) as creadora, cr.status,
           cr.instagram_handle, cr.telegram_handle, cr.twitter_handle, cr.facebook_handle
    from creators cr, q
    where lower(cr.instagram_handle) = q.h
       or coalesce(cr.artistic_name, cr.name) ilike '%'||p_query||'%'
       or cr.name ilike '%'||p_query||'%'
    order by (lower(cr.instagram_handle) = q.h) desc, (cr.status='active') desc
    limit 1
  ),
  health as (
    select lower(pe.network) as red,
           coalesce(nullif(lower(pe.source_handle),''), '(principal)') as handle,
           to_char(max(pe.date) at time zone 'America/Bogota','DD/MM') as ultimo_scan,
           count(*) filter (where pe.promoted in ('true','yes','partial')) as promos_14d,
           count(distinct pe.date::date) filter (where coalesce(pe.promoted,'') <> 'pending') as dias_leidos,
           (array_agg(pe.error_reason order by pe.date desc) filter (where pe.error_reason is not null))[1] as ultimo_error
    from promolog_entries pe join c on c.id = pe.creator_id
    where pe.date > now() - interval '14 days'
    group by lower(pe.network), coalesce(nullif(lower(pe.source_handle),''), '(principal)')
  )
  select jsonb_build_object(
    'creadora', c.creadora,
    'status', c.status,
    'handles_cargados', jsonb_strip_nulls(jsonb_build_object(
      'instagram', c.instagram_handle,
      'telegram', c.telegram_handle,
      'x_twitter', c.twitter_handle,
      'facebook', c.facebook_handle)),
    'telegram_apunta_a', case
       when c.telegram_handle is null then 'no cargado'
       when c.telegram_handle ~ 't\.me/m/' then 'deeplink de MENSAJE (mal — no es un canal)'
       when c.telegram_handle ~ 't\.me/\+' then 'link de invitación a canal (ok)'
       when c.telegram_handle ~ 't\.me/' then 'canal público por link (ok)'
       else 'username suelto "'||c.telegram_handle||'" (puede apuntar a un USUARIO, no a un canal — verificar)' end,
    'cuentas_secundarias', (select jsonb_agg(jsonb_build_object('red', lower(csa.network), 'user', csa.username, 'activa', csa.active) order by lower(csa.network))
                             from creator_social_accounts csa where csa.creator_id = c.id),
    'salud_scan_14d', (select jsonb_agg(jsonb_build_object(
        'red', red, 'handle', handle, 'ultimo_scan', ultimo_scan,
        'dias_leidos', dias_leidos, 'promos_14d', promos_14d, 'ultimo_error', ultimo_error) order by red)
      from health),
    'nota', 'Números/promo por red de los últimos 14 días. ultimo_error != null = el scan no pudo leer ese handle (roto/privado). Si una red no aparece en salud_scan y tampoco está en handles_cargados, no está cargada.'
  )
  from c;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_creator_scan_config(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_creator_scan_config(uuid, text) TO authenticated, service_role;
