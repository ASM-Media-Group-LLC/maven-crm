-- Dos fallos reales encontrados leyendo el DM de Grace con Clari (07/08), más el
-- DM de Juan Pachas. Aplicado en prod vía MCP como: hubstaff_entrada_salida_por_dia,
-- dm_juan_pachas, clari_dm_juan_pachas.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- 1) ⚠️ EL BOT SE QUEDÓ MUDO CON LA JEFA DE RRHH — falso código de verificación
-- ══════════════════════════════════════════════════════════════════════════════
-- 14:33:09 Grace escribió: "dime a que hora ingresaron hoy estas personas teniendo
-- en cuenta que deben ingresar a las 8 AM" + la lista de nombres. El evento
-- registrado NO fue dm_received_no_code sino `dm_code_invalid_or_expired`: el
-- mensaje se consumió como intento de código de verificación y NUNCA llegó al
-- agente. Grace se quedó sin respuesta y siguió preguntando a mano.
--
-- CAUSA: CODE_REGEX = /\b([ACDEFGHJKLMNPQRTUVWXY3479]{6})\b/i sobre el body
-- COMPLETO. Ese alfabeto (sin B,I,O,S,Z,0,1,2,5,6,8) hace que palabras españolas
-- comunes de 6 letras calcen — verificado ejecutando el regex:
--     "cuenta" ✓   "manera" ✓   "verdad" ✓   "agenda" ✓
-- El "teniendo en CUENTA" de Grace disparó el falso código. Cualquier DM de los 5
-- directivos con una de esas palabras moría igual, en silencio.
--
-- FIX (whatsapp-ingest, dos capas):
--   (a) Solo se busca código si el mensaje es corto (≤40 chars) — un DM de
--       verificación ES el código, no una frase que lo contenga.
--   (b) `dm_code_invalid_or_expired` YA NO muere: cae al agente como cualquier DM.
--       Un texto que solo se parecía a un código es un mensaje normal.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- 2) HORA DE INGRESO: el bot dijo "no la tengo" y SÍ la tiene
-- ══════════════════════════════════════════════════════════════════════════════
-- 14:35 Grace: "te estoy pidiendo la hora de ingreso de esa personas en hubstaff".
-- El bot: "de los días anteriores el feed solo me devuelve el total del día y el %".
-- Falso: hubstaff_activities guarda franjas de 10 min con starts_at desde el 30/06
-- → entrada = primer ping, salida = último. Verificado: Vanessa 07:50-08:00 (cumple
-- las 8 AM que Grace controlaba), Erick 00:00 (turno madrugada).
CREATE OR REPLACE FUNCTION public.hubstaff_entry_exit(
  p_from date,
  p_to date,
  p_person text DEFAULT NULL
)
RETURNS TABLE (
  name text, dia date, entrada text, ultimo_ping text,
  horas numeric, actividad_pct numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.name,
         (a.starts_at AT TIME ZONE 'America/Bogota')::date AS dia,
         to_char(min(a.starts_at) AT TIME ZONE 'America/Bogota', 'HH24:MI') AS entrada,
         to_char(max(a.starts_at) AT TIME ZONE 'America/Bogota', 'HH24:MI') AS ultimo_ping,
         round(sum(a.tracked_seconds)::numeric / 3600, 2) AS horas,
         round(sum(a.overall_activity::numeric * a.tracked_seconds)
               / nullif(sum(a.tracked_seconds), 0), 0) AS actividad_pct
  FROM hubstaff_activities a
  JOIN hubstaff_members m ON m.id = a.member_id
  WHERE (a.starts_at AT TIME ZONE 'America/Bogota')::date BETWEEN p_from AND p_to
    AND (p_person IS NULL OR m.name ILIKE '%' || p_person || '%')
  GROUP BY m.name, (a.starts_at AT TIME ZONE 'America/Bogota')::date
  ORDER BY dia DESC, m.name;
$$;
-- ⚠️ El join es hubstaff_activities.member_id = hubstaff_members.**id** (uuid),
-- NO hubstaff_user_id — perdí dos intentos ahí.
--
-- get_hubstaff_activity la consume en los dos caminos: `entrada_hoy` en cada fila
-- del ranking de equipo (responde "¿a qué hora ingresaron hoy ESTAS personas?" de
-- varias a la vez, que es la pregunta real de RRHH) y `entrada`/`ultimo_ping` por
-- día en `por_dia` al pedir una persona.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- 3) VENTA DIARIA POR CHATTER: también existía y el bot la negó
-- ══════════════════════════════════════════════════════════════════════════════
-- 14:30 Grace: "damelo desglosado por dia" → el bot: "no tengo desglose DIARIO por
-- chatter... ese corte está en el panel de BLU". Falso: `chatter_daily_sales` la
-- alimenta el bridge (employee-reports día a día, 45 días). get_chatter_productivity
-- gana `person` + `days` → bloque `desglose_diario`, y cuando viene vacío devuelve
-- `ultimo_dia_sincronizado` para que el bot distinga "no vendió" de "no sincronizado"
-- en vez de afirmar $0.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- 4) DM de JUAN PACHAS habilitado (5º autorizado)
-- ══════════════════════════════════════════════════════════════════════════════
-- Identidad + whitelist con el mismo truco de Grace/Luis (el teléfono de un miembro
-- LID-only vive en raw->'data'->'key'->>'participantAlt'): Juan +13057886858,
-- LID 112197514621044. MOTOR "QUIÉN ES QUIÉN" y el manual de Clari lo describen
-- ahora como SOCIO y directivo de VENTAS + RELACIONES PÚBLICAS de cara a modelos y
-- otras agencias (el mejor vendedor de la casa: cuando pida ayuda para un pitch o
-- una reunión, el bot le da munición real). Sigue fuera de medición, como dirección.
select 1;
