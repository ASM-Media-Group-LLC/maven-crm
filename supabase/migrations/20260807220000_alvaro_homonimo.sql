-- 🔴 ESCALADA DE PRIVILEGIOS POR HOMÓNIMO (07/08). Aplicado en prod vía MCP como
-- fix_alvaro_homonimo_owner_en_warming.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- CÓMO APARECIÓ
-- ══════════════════════════════════════════════════════════════════════════════
-- Investigando por qué el feedback del jefe no se guardaba, afirmé que "Álvaro
-- escribe desde dos LIDs". Jhon lo desmintió en el acto: "yo veo que Álvaro solo
-- ha escrito desde 1 número… quizá lo estés confundiendo con otro Álvaro que hay
-- en los grupos". Tenía razón. La verificación por `participantAlt` (el número
-- real que Baileys manda junto al LID) lo cierra sin ambigüedad:
--
--   · "Alvaro S"      LID 192457652338690 → +17866946354  = ÁLVARO EL JEFE
--     Es el MISMO número del DM con el bot. 398 mensajes, 25/05→07/08, 3 grupos.
--   · "Alvaro Mejia"  LID 114426585833505 → +17863043943  = OTRA PERSONA
--     7 mensajes, 24/06→29/07. Registro claramente distinto ("Si hija eso si
--     estubo fuerte", "Hoy es viernes. a k hora terminas").
--
-- ══════════════════════════════════════════════════════════════════════════════
-- EL AGUJERO
-- ══════════════════════════════════════════════════════════════════════════════
-- En AI WARMING el LID del OTRO Álvaro estaba linkeado al profile del JEFE
-- (528453bd "Alvaro Mejía", is_owner=TRUE): el bot lo trataba como OWNER en ese
-- grupo — sus órdenes valían como las del jefe y podía hacerle guardar reglas
-- permanentes. Casi con certeza es un link viejo hecho por PUSH NAME
-- ("Alvaro Mejia" ≈ "Alvaro Mejía"), justo la vulnerabilidad que después se cerró
-- en resolveMavenUser: «el push name lo elige el propio remitente, usarlo para
-- linkear convierte el display name en una credencial».
-- Encima el jefe estaba SIN LINKEAR en ese mismo grupo (user_id NULL), así que
-- allí su feedback tampoco se podía persistir.
--
-- El orden importa por la constraint unique(group_id, user_id): primero se libera
-- el profile del jefe en el grupo, después se le asigna su LID real.
UPDATE whatsapp_members
SET user_id = 'fcdfdfcb-c0ab-4c82-b6d9-d50d37ab086e'   -- "Alvaro Rene", SIN is_owner (igual que en Marketing/Ventas)
WHERE external_id = '114426585833505@lid'
  AND user_id = '528453bd-f1e1-43d3-85c1-01c5fa5bbcfb';

UPDATE whatsapp_members
SET user_id = '528453bd-f1e1-43d3-85c1-01c5fa5bbcfb'
WHERE external_id = '192457652338690@lid' AND user_id IS NULL;

-- Estado final verificado: el jefe es owner en los 3 grupos; el homónimo queda
-- sin privilegios en los 2 donde aparece.
--
-- ✅ IDENTIDAD CONFIRMADA POR JHON: +17863043943 es el **padre** del jefe. Son
-- Álvaro Mejía (padre) y Álvaro **Stephan** Mejía (hijo, el jefe operativo). El
-- padre no dirige la operación: se ocupa de PAGOS (suscripciones que necesita el
-- equipo) y de los TELÉFONOS que se le entregan al equipo para WhatsApp. Por eso
-- el link viejo por push name era doblemente peligroso: mismo apellido, misma
-- casa, funciones distintas.
-- Profiles renombrados para que ningún matcher por nombre vuelva a cruzarlos
-- (migración alvaro_padre_e_hijo_nombres): 528453bd → "Alvaro Stephan Mejía";
-- fcdfdfcb → "Alvaro Mejía (padre)". El MOTOR del agente los desambigua explícito.
--
-- LECCIONES:
--  1. Nombres repetidos en el equipo (dos Álvaro, dos Brayan, tres Lizeth, tres
--     Juan) → NUNCA identificar por nombre ni por push name. El único identificador
--     confiable es el LID, y el número real viaja en raw->'data'->'key'->'participantAlt'.
--  2. Cuando el owner desmiente un dato, RE-VERIFICAR contra la fuente antes de
--     insistir o de plegarse. Acá desmentir destapó un problema mayor que el que
--     se estaba investigando.
select 1;
