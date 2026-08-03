-- get_creator_scan_config: los errores del scan salen TRADUCIDOS y con dueño.
-- (Aplicada en prod vía MCP el 03/08; este archivo la versiona.)
--
-- Bug (03/08, grupo Managers): el bot le dijo a Carolina que el IG de SassyAndrea
-- "está con throttled… valdría confirmar que esas cuentas no estén con problemas".
-- Falso y al revés: throttled = IG limitó NUESTRA sesión de scan — no dice nada de
-- la cuenta de la creadora. La semilla estaba en esta función: la nota decía
-- "ultimo_error != null = el scan no pudo leer ese handle (roto/privado)", o sea
-- le enseñaba al modelo que todo error es culpa de la cuenta. throttled es además
-- el error MÁS común (147 filas en 14d vs 64 no_ig_id / 23 read_failed).
--
-- Fix determinístico en la fuente (guardas > prompt): cada código sale con
-- `ultimo_error_explicado` que dice QUIÉN tiene el problema (scanner vs cuenta)
-- y qué hacer; la nota general queda honesta. El edge pasa el JSON tal cual,
-- así que esto rige sin redeploy.
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
           to_char(max(pe.dia),'DD/MM') as ultimo_scan,
           count(*) filter (where pe.promoted in ('true','yes','partial')) as promos_14d,
           count(distinct pe.dia) filter (where coalesce(pe.promoted,'') <> 'pending') as dias_leidos,
           (array_agg(pe.error_reason order by pe.date desc) filter (where pe.error_reason is not null))[1] as ultimo_error
    from promolog_entries pe join c on c.id = pe.creator_id
    where pe.dia > (now() at time zone 'America/Bogota')::date - 14
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
    'salud_scan_14d', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'red', red, 'handle', handle, 'ultimo_scan', ultimo_scan,
        'dias_leidos', dias_leidos, 'promos_14d', promos_14d,
        'ultimo_error', ultimo_error,
        'ultimo_error_explicado', case
          when ultimo_error is null then null
          when ultimo_error = 'throttled' then
            'la red limitó NUESTRA sesión de scan (rate limit). Problema del SCANNER, no de la cuenta de la creadora — PROHIBIDO decir que su cuenta tiene problemas por esto.'
          when ultimo_error = 'read_failed' then
            'fallo de lectura de NUESTRO scanner. No implica nada sobre la cuenta de la creadora.'
          when ultimo_error = 'no_session' then
            'nuestro scanner no tiene sesión activa para esa red (lado nuestro).'
          when ultimo_error = 'unconfirmed_empty' then
            'se vio vacío pero la sesión no había demostrado poder leer — NO concluyente (lado nuestro), no cuenta como "no promocionó".'
          when ultimo_error like 'json_parse%' then
            'error interno del clasificador (lado nuestro).'
          when ultimo_error = 'follow_pending' then
            'nuestra cuenta scanner aún no sigue a la creadora (o la solicitud está pendiente). Accionable: aceptar/seguir.'
          when ultimo_error in ('no_ig_id','handle_not_found') then
            'el handle NO RESUELVE en la red: probablemente cambió o está mal cargado en Maven. Accionable: corregir el handle.'
          when ultimo_error in ('privada','private','requires_follow') then
            'la cuenta es PRIVADA: hay que seguirla para leerla. Accionable: enviar solicitud.'
          else
            'código interno del scan. Por defecto tratarlo como fallo de LECTURA nuestro, NO como problema de la cuenta de la creadora.'
        end)) order by red)
      from health),
    'nota', 'Números/promo por red de los últimos 14 días CON su cobertura. dias_leidos parciales o ultimo_error presente ⇒ la frase correcta es "no la estamos leyendo", NUNCA "no promocionó" ni "su cuenta tiene problemas". Quién tiene el problema lo dice ultimo_error_explicado (la mayoría son fallos de NUESTRO scanner). Si una red no aparece en salud_scan ni en handles_cargados, no está cargada.'
  )
  from c;
$function$;
