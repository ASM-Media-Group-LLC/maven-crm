-- CORREO · los grupos de rol dejan de aceptar correo de todo internet.
--
-- Los 17 grupos estaban en `access_type = 'Public'`. En Zoho eso NO significa
-- "público dentro de la empresa": significa que `equipo@maven-ai.me`,
-- `admins@maven-ai.me` y los demás aceptan correo de CUALQUIER dirección de
-- internet. Es una vía directa de spam y phishing a la empresa entera, con el
-- agravante de llegar por una dirección que todos reconocen como interna.
--
-- ⚠️ NO FUE UN DESCUIDO. El comentario de `CreateGroupInput.accessType` dice
-- que `Public` se eligió para que RH pudiera escribirle a los grupos desde su
-- cuenta de Google durante la salida de Workspace. Por eso esto NO cierra
-- todo a ciegas: ver la excepción al final.
--
-- MEDIDO ANTES DE TOCAR (18/09/2026, 90 días de `mail_messages`):
--
--   admins@                    58 correos    0 desde afuera
--   operations-sales@          58            0
--   equipo@                    51            0
--   chatters-supervisores@     37            0
--   chatters@                  34            0
--   coordinadores@             24            0
--   finanzas@                  24            0
--   managers@ team-leaders@ closers@ warming@ coordinadores-supervisores@
--                              24 c/u        0
--
-- Cero correos externos en 90 días, en los doce grupos con tráfico. Cerrarlos
-- no rompe nada que se pueda observar.
--
-- ⚠️ EL LÍMITE DE ESA MEDICIÓN, dicho explícitamente: solo ve lo que
-- `mail-sync` alcanzó a cachear, o sea lo que LLEGÓ a la casilla de alguien de
-- Maven. Un correo externo rechazado antes de entregarse, o dirigido a un
-- grupo cuyos miembros no sincronizan con Maven, no aparecería. Por eso el
-- cambio va con `holdOrBounce: 'hold'` y no `'reject'`: lo que no pase queda
-- esperando aprobación en vez de rebotar. Si mañana un proveedor legítimo le
-- escribe a finanzas@, alguien lo puede dejar pasar; con 'reject' el correo se
-- pierde y quien lo mandó cree que llegó.

UPDATE public.email_role_groups
   SET access_type = 'Organization',
       updated_at  = now()
 WHERE access_type = 'Public'
   -- ── La excepción: Recursos Humanos ──────────────────────────────────────
   -- Es el único grupo donde recibir correo de AFUERA es parte del trabajo: un
   -- candidato manda su hoja de vida desde su Gmail y no tiene —ni va a tener—
   -- casilla de la organización. Cerrarlo mandaría esas postulaciones a una
   -- cola de moderación que hoy nadie mira.
   --
   -- La medición tampoco lo cubre: la gente le escribe al alias `hhrr@`, no a
   -- `rrhh@`, así que en los 90 días este grupo figura sin tráfico. Ausencia de
   -- datos no es evidencia de ausencia, y no se cierra sobre una duda.
   --
   -- Queda pendiente decidirlo con Jhon.
   AND role <> 'HHRR';

COMMENT ON COLUMN public.email_role_groups.access_type IS
  'Quien le puede ESCRIBIR al grupo en Zoho: Public (todo internet), Organization (solo la org), Group (solo miembros), Moderated (con aprobacion). Lo aplica el sync de role-email-groups, no solo la creacion.';
