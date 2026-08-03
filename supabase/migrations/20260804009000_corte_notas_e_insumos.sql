-- NOTAS DIARIAS del régimen de cortes (Álvaro, audio 03/08): "que empiece a dar
-- puntuaciones diarias" + "el viernes que dé el resultado de los últimos 7 días".
-- (Aplicado en prod vía MCP el 03/08 en dos pasos: corte_notas_e_insumos y el
-- retune corte_nota_formula. Este archivo versiona el ESTADO FINAL.)
--
-- Diseño: la nota NO queda a criterio del modelo — corte_cierre_prep calcula
-- INSUMOS objetivos por persona (participación por franjas de 2h, Hubstaff,
-- avance real POR ROL) y una nota sugerida con fórmula fija; el bot redacta y
-- ajusta máx ±0.5 justificando. Las notas se PERSISTEN en corte_notas para el
-- semanal de los viernes.
--
-- Fórmula v1.1 (retune del mismo día: el avance real pesa 3.0 — con 1.5/1.5/2.0
-- Daniel sacaba 8.0 con 0/3 números de su meta y los roles sin métrica llegaban
-- a 8.4 solo por hablar):
--   nota = 5.0 + 1.0·(franjas/5) + 1.0·hub + 3.0·avance → clamp [1,10]
--   hub    = 0.7·min(horas/7,1) + 0.3·min(act%/50,1) · v1.2: hub_h NULL (persona
--            SIN cuenta de Hubstaff, ej. Juanse) ⇒ el componente se reemplaza por
--            participación — no se castiga lo que no puede tener; el bloque
--            público dice "sin cuenta de Hubstaff (no aplica)" en vez de "sin fichar".
--   avance = por rol (warming contactos: números vs meta 3 + textos · contenido:
--            piezas · managers: contactadas + promos roster · ventas: won hoy
--            1.0 > confirmada 0.85 > contactos). Sin métrica en tablas (Brayan,
--            Lorena…): proxy 0.75·participación y el bot calibra del chat.
create table if not exists public.corte_notas (
  fecha date not null,
  group_id uuid not null,
  profile_id uuid not null,
  nombre text not null,
  nota_sugerida numeric(3,1),
  componentes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (fecha, group_id, profile_id)
);
alter table public.corte_notas enable row level security;

create or replace function public.corte_nota_formula(
  p_franjas int, p_hub_h numeric, p_hub_act int, p_avance numeric
) returns numeric language sql immutable as $f$
  select round(greatest(1.0, least(10.0,
    5.0
    + 1.0 * (p_franjas / 5.0)
    + 1.0 * (case when p_hub_h is null then p_franjas / 5.0
                  else 0.7 * least(p_hub_h / 7.0, 1) + 0.3 * least(coalesce(p_hub_act,0) / 50.0, 1) end)
    + 3.0 * coalesce(p_avance, 0.75 * p_franjas / 5.0)
  ))::numeric, 1)
$f$;

-- corte_cierre_prep(p_group_id): ver definición completa aplicada por MCP
-- (migraciones corte_notas_e_insumos + retune). Calcula por persona: franjas
-- activas (9-19h Bogotá), msgs del día, Hubstaff (h + % ponderado), métricas del
-- rol (reportes del día, closers_contacts, leadgen, confirmadas/completadas,
-- ventas won, contactadas por atribución Kash de la línea Managers, promos del
-- roster), aplica corte_nota_formula, UPSERTEA corte_notas y devuelve jsonb
-- {personas:[{nombre, nota_sugerida, insumos}], semana: [...] | null (solo viernes)}.
