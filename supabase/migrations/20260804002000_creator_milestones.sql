-- HITOS POR CREADORA — la memoria de "lo que significa plata" (y estados clave).
-- (Aplicada en prod vía MCP el 03/08; este archivo la versiona.)
--
-- Por qué existe (Jhon, 03/08): los eventos importantes viven solo en el chat y
-- mueren al salir de la ventana de 30 mensajes — "saritac subió con Let's Shoot"
-- no tenía fecha registrada en ningún lado, "Elizabeth quitó accesos el 01/08"
-- tampoco (y el bot usó el $0 resultante como palanca), y el pulso intentó
-- adivinarlos con palabras clave y agarró ruido (María corrigiendo al bot) en vez
-- de la reunión de cierre de Juanse. Pedido literal: "las cosas importantes
-- debería anotarlas para tener memoria… modelo en negociación, modelo agendó
-- meet, modelo cerró, cerca de cierre… menciones que signifiquen dinero".
--
-- Diseño (aprobado por Jhon):
--  · `occurred_on` ≠ `created_at`: cuándo PASÓ vs cuándo se contó. Los reportes
--    filtran por occurred_on.
--  · El ingreso NO se guarda acá: se deriva de BLU al consultar (guardarlo lo
--    congela y BLU corrige hacia atrás). `amount_usd` es solo el monto MENCIONADO
--    (ej. "custom de $4k"), no un cálculo.
--  · `verificado` separa la AFIRMACIÓN del dato: un caso de éxito contado en el
--    grupo entra como no-verificado; verificarlo es cruzarlo con venta + BLU.
--  · `source_message_id`: poder volver a la fuente cuando el número no cuadre.
--  · Se consulta SOLO bajo demanda (tool / pulso). JAMÁS se inyecta al prompt en
--    cada mensaje (requisito de costo explícito de Jhon).
--  · kind SIN CHECK en la BD: la lista evoluciona (el CHECK de close_reason_code
--    ya nos frenó una vez); el enum vive en el schema de la tool.
--  · creator_handle NULLABLE: "reunión de cierre con modelo referida por
--    Fernando" es un hito real sin identidad todavía.
create table if not exists public.creator_milestones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  creator_id uuid references public.creators(id) on delete set null,
  creator_handle text,
  kind text not null,              -- caso_exito · venta_producto · cierre · reunion_agendada · en_negociacion · cerca_de_cierre · en_retencion · quito_accesos · salida_anunciada · record_ingreso · otro
  title text not null,
  detail text,
  product text,                    -- lets_shoot · unlimited · blu · content_protector · piclink · agency · otro
  amount_usd numeric,
  occurred_on date not null,
  source_group_id uuid,
  source_message_id uuid,
  reported_by text,
  reported_by_user_id uuid,
  verificado boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.creator_milestones is
  'Hitos con fecha por creadora/lead (ventas, meets, cierres, retención, accesos). Memoria durable de lo que hoy solo vive en el chat. Se consulta bajo demanda — nunca se inyecta al prompt.';
comment on column public.creator_milestones.creator_handle is
  'Handle IG (o null si aún no se sabe quién es — ej. "modelo referida por Fernando"). El índice de dedup trata los null como distintos.';

-- El bot puede disparar dos corridas casi simultáneas (duplicados conocidos):
-- el mismo hito del mismo día no entra dos veces.
create unique index if not exists uq_creator_milestones_dia
  on public.creator_milestones (tenant_id, lower(creator_handle), kind, occurred_on);
create index if not exists idx_creator_milestones_fecha
  on public.creator_milestones (tenant_id, occurred_on desc);

alter table public.creator_milestones enable row level security;
-- Sin policies: solo service_role (bots/pulso). El frontend entra después con su vista.

-- ── monetization_opportunities: el producto deja de esconderse en "other" ────
-- Las ventas de Let's Shoot se guardaban como product='other' con el nombre
-- enterrado en las notas — "¿a quiénes les vendimos Let's Shoot?" no se podía
-- responder. product no tiene CHECK (verificado), así que basta migrar los datos.
update public.monetization_opportunities
   set product = 'lets_shoot'
 where product = 'other'
   and (notes ilike '%let%shoot%' or notes ilike '%letshoot%');

-- won_at: CUÁNDO se ganó — el ancla del antes/después de ingresos que hoy no
-- existe (solo created_at/updated_at). Para las ya ganadas se aproxima con
-- updated_at y queda dicho en el comment.
alter table public.monetization_opportunities add column if not exists won_at timestamptz;
comment on column public.monetization_opportunities.won_at is
  'Cuándo pasó a won. Backfill 03/08: aproximado con updated_at para las won preexistentes.';
update public.monetization_opportunities set won_at = updated_at where stage = 'won' and won_at is null;
