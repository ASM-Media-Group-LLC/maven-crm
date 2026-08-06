-- Transparencia del scan para las MANAGERS (pedido de Jhon 06/08). Aplicado en prod
-- vía MCP como: scan_notes_y_fallos_bloque + managers_transparencia_scan.
--
-- Problema: el scan de promolog era una caja negra para las managers (caso Carolina
-- 06/08 11:53: "¿por qué no registraste estas promos en el primer escaneo?"), y los
-- reportes anteriores mezclaban "0 historias" (lectura válida sin promo, #818) con
-- fallos reales de lectura.
--
-- 1) TABLA promolog_scan_notes — memoria de POR QUÉ una creadora no se puede leer,
--    enseñada por las managers en el grupo ("tal creadora no se lee porque <razón>").
--    Una sola nota activa por creadora: la nueva desactiva las anteriores.
CREATE TABLE IF NOT EXISTS public.promolog_scan_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  network text,                          -- null = todas las redes
  reason text NOT NULL,
  set_by uuid REFERENCES public.profiles(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scan_notes_creator_active
  ON public.promolog_scan_notes (creator_id) WHERE active;

-- 2) FUNCIÓN promolog_fallos_bloque() — bloque de texto con los fallos REALES de
--    lectura de HOY (dia = fecha Bogotá, ver promolog_dia_utc_vs_bogota):
--    fallo real = error_reason IS NOT NULL AND error_reason != 'unconfirmed_empty'.
--    story_count=0 sin error_reason JAMÁS aparece (es lectura válida sin promo).
--    Motivos humanizados: throttled → "IG nos frenó (rate-limit) — se reintenta solo";
--    no_ig_id → "el handle no resuelve (¿cambió o está rota?)"; follow_pending →
--    "perfil personal de FB — falta amistad"; json_parse% → "error de lectura del bot".
--    Agrupa por motivo con "creadora (manager)"; las creadoras con nota activa en
--    promolog_scan_notes salen aparte como "Con razón ya conocida (no alarmar)" con
--    la nota, quién la puso y cuándo. Sin fallos → "Sin fallos reales de lectura hoy ✓
--    (0 historias NO es un fallo: es lectura válida sin promo)".
--    (Cuerpo completo en la migración aplicada en prod; este archivo documenta el
--    contrato para el repo.)

-- 3) BOT — manual del Bot de Managers += sección "TRANSPARENCIA DEL SCAN" (qué es un
--    fallo real, timing del scan por tandas, usar get_scan_fallos fuera del corte,
--    set_scan_note EN EL TURNO en que una manager explica una causa) y
--    wa_bots.tool_allowlist += ["get_scan_fallos","set_scan_note"] (Managers es el
--    único bot con allowlist no nula — sin esto las tools no le llegan).
--
-- 4) AGENTE (supabase/functions/whatsapp-agent/index.ts, esta rama):
--    · tool get_scan_fallos → rpc promolog_fallos_bloque
--    · tool set_scan_note → resuelve creadora por handle/nombre artístico (error si
--      es ambiguo), desactiva notas previas, inserta con set_by = quien la enseñó;
--      está en TOOLS_DE_ESCRITURA (solo miembros vinculados)
--    · corte de Managers (grupo 73a4414e) += bloque "SCAN — FALLOS REALES DE LECTURA
--      HOY" inyectado vía rpc en cada corte de 2h.
--
-- 5) DEFENSA CON EVIDENCIA (v2, mismo día — migración managers_defensa_con_evidencia):
--    caso real: Carolina reclamó a las 11:53 que las promos de Heidy/carocancino/kloe
--    no estaban registradas; SÍ estaban — publicadas anoche 19:59-23:51 Bogotá →
--    dia=05/08 — y el bot se defendió con "sin leer" en vez de mostrar el registro.
--    · tool get_promo_registro: promos registradas de una creadora (últimos N días)
--      con red, día atribuido, hora de publicación Bogotá (solo entradas del scan,
--      donde `date` es el timestamp real de la historia), link del post y evidencia_id.
--    · reply_to_group acepta evidencia_id (id de promolog_entries que devolvió la
--      tool — NUNCA URLs libres del modelo): re-firma fresco el screenshot de
--      promolog-evidence (las URLs guardadas expiran) con fallback al media del post,
--      y el mensaje sale como IMAGEN con caption vía /message/sendMedia del gateway
--      (whatsapp-send aprende image_url; caption pasa por las mismas guardas de salida).
--    · manual de Managers += regla: ante un reclamo de registro, get_promo_registro
--      PRIMERO, responder "¿te refieres a estas?" con screenshot y explicar la
--      atribución de día por hora de publicación; allowlist += get_promo_registro.
select 1;
